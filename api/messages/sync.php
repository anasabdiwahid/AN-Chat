<?php
// api/messages/sync.php - Real-Time Unified Auto-Sync Engine (4-Second Heartbeat & Auto-Save)
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/Message.php';
require_once __DIR__ . '/../../models/Notification.php';
require_once __DIR__ . '/../../models/Friend.php';
require_once __DIR__ . '/../../models/SystemSetting.php';

$currentUser = requireAuth();
$currentUserId = (int)$currentUser['id'];

$lastMsgId = isset($_GET['last_msg_id']) ? (int)$_GET['last_msg_id'] : 0;
$activeFriendId = isset($_GET['active_friend_id']) ? (int)$_GET['active_friend_id'] : 0;
$lastGlobalId = isset($_GET['last_global_id']) ? (int)$_GET['last_global_id'] : 0;

$db = Database::getConnection();

// This authenticated sync request is also the app's HTTP presence heartbeat.
// Keep the user online even if the optional WebSocket connection drops or is
// unavailable; update last_seen at most every five seconds to avoid needless
// writes while the one-second message sync is running.
$stmtPresence = $db->prepare("
    UPDATE users
    SET status = 'online',
        last_seen = CASE
            WHEN status <> 'online' OR last_seen < DATE_SUB(NOW(), INTERVAL 5 SECOND) THEN NOW()
            ELSE last_seen
        END
    WHERE id = :uid
");
$stmtPresence->execute([':uid' => $currentUserId]);

// 1. Fetch new messages, read status, and deleted status for active conversation
$newMessages = [];
$readMessageIds = [];
$deletedMessageIds = [];

if ($activeFriendId > 0) {
    // Fetch newly arrived messages even when the conversation is empty and its
    // client-side cursor is still zero. Otherwise polling never sees the first
    // message when the WebSocket service is unavailable.
    if ($lastMsgId >= 0) {
        $stmt = $db->prepare("
            SELECT m.*, 
                   u.fullname AS sender_name, u.profile_image AS sender_image,
                   r.message AS reply_text, r.message_type AS reply_type
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            LEFT JOIN messages r ON m.reply_to_id = r.id
            WHERE m.id > :last_id 
              AND ((m.sender_id = :fid AND m.receiver_id = :uid) OR (m.sender_id = :uid2 AND m.receiver_id = :fid2))
              AND (m.deleted_for_all = 0 OR m.deleted_for_all IS NULL)
            ORDER BY m.id ASC
            LIMIT 100
        ");
        $stmt->execute([
            ':last_id' => $lastMsgId,
            ':fid'     => $activeFriendId,
            ':uid'     => $currentUserId,
            ':uid2'    => $currentUserId,
            ':fid2'    => $activeFriendId
        ]);
        $newMessages = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Standardize avatar path
        foreach ($newMessages as &$msg) {
            if (!empty($msg['sender_image'])) {
                if (!str_starts_with($msg['sender_image'], 'http') && !str_starts_with($msg['sender_image'], 'assets/') && !str_starts_with($msg['sender_image'], 'uploads/')) {
                    $msg['sender_image'] = 'uploads/images/' . $msg['sender_image'];
                }
            } else {
                $msg['sender_image'] = 'assets/images/default-avatar.png';
            }
        }
        unset($msg);
    }

    // Auto mark as read messages sent from active friend to current user
    $msgModel = new Message();
    $msgModel->markConversationAsRead($activeFriendId, $currentUserId);

    // Read receipts: IDs of my sent messages that have been marked read by active friend
    $stmtRead = $db->prepare("
        SELECT id FROM messages 
        WHERE sender_id = :uid AND receiver_id = :fid AND is_read = 1
        ORDER BY id DESC LIMIT 50
    ");
    $stmtRead->execute([':uid' => $currentUserId, ':fid' => $activeFriendId]);
    $readMessageIds = $stmtRead->fetchAll(PDO::FETCH_COLUMN);

    // Deleted messages: IDs of messages in this conversation deleted for everyone
    $stmtDel = $db->prepare("
        SELECT id FROM messages
        WHERE ((sender_id = :fid AND receiver_id = :uid) OR (sender_id = :uid2 AND receiver_id = :fid2))
          AND deleted_for_all = 1
        ORDER BY id DESC LIMIT 50
    ");
    $stmtDel->execute([
        ':fid'  => $activeFriendId,
        ':uid'  => $currentUserId,
        ':uid2' => $currentUserId,
        ':fid2' => $activeFriendId
    ]);
    $deletedMessageIds = $stmtDel->fetchAll(PDO::FETCH_COLUMN);
}

// 1b. Global incoming messages check across ALL friends (for instant toasts and alerts even when not in chat)
$stmtMax = $db->prepare("SELECT COALESCE(MAX(id), 0) FROM messages WHERE receiver_id = :uid");
$stmtMax->execute([':uid' => $currentUserId]);
$currentMaxReceiverId = (int)$stmtMax->fetchColumn();

$recentIncoming = [];
if ($lastGlobalId > 0 && $currentMaxReceiverId > $lastGlobalId) {
    $stmtRecent = $db->prepare("
        SELECT m.id, m.sender_id, m.receiver_id, m.message, m.message_type, m.created_at,
               u.fullname AS sender_name, u.profile_image AS sender_image
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.receiver_id = :uid 
          AND m.id > :last_gid
          AND (m.deleted_for_all = 0 OR m.deleted_for_all IS NULL)
        ORDER BY m.id ASC
        LIMIT 30
    ");
    $stmtRecent->execute([':uid' => $currentUserId, ':last_gid' => $lastGlobalId]);
    $recentIncoming = $stmtRecent->fetchAll(PDO::FETCH_ASSOC);

    foreach ($recentIncoming as &$rm) {
        if (!empty($rm['sender_image'])) {
            if (!str_starts_with($rm['sender_image'], 'http') && !str_starts_with($rm['sender_image'], 'assets/') && !str_starts_with($rm['sender_image'], 'uploads/')) {
                $rm['sender_image'] = 'uploads/images/' . $rm['sender_image'];
            }
        } else {
            $rm['sender_image'] = 'assets/images/default-avatar.png';
        }
    }
    unset($rm);
}
$newGlobalId = max($lastGlobalId, $currentMaxReceiverId);

// 2. Fetch conversations summary (Friends list with latest message, unread counts, and status)
$friendModel = new Friend();
$conversations = $friendModel->getFriendsList($currentUserId);
$totalUnreadMessages = 0;
foreach ($conversations as &$c) {
    $totalUnreadMessages += (int)($c['unread_count'] ?? 0);
    if (!empty($c['profile_image'])) {
        if (!str_starts_with($c['profile_image'], 'http') && !str_starts_with($c['profile_image'], 'assets/') && !str_starts_with($c['profile_image'], 'uploads/')) {
            $c['profile_image'] = 'uploads/images/' . $c['profile_image'];
        }
    } else {
        $c['profile_image'] = 'assets/images/default-avatar.png';
    }
}
unset($c);

// 3. Fetch system settings (e.g. screenshot_detection and admin toggles)
$settingModel = new SystemSetting();
$allSettings = $settingModel->getAll();
$systemSettings = [];
foreach ($allSettings as $k => $row) {
    $systemSettings[$k] = $row['setting_value'];
}
if (!isset($systemSettings['screenshot_detection'])) {
    $systemSettings['screenshot_detection'] = '1';
}

// 4. Check for incoming call
// Auto-expire any abandoned calls older than 50 seconds
$db->exec("UPDATE calls SET status = 'missed' WHERE status = 'calling' AND TIMESTAMPDIFF(SECOND, created_at, NOW()) > 50");

$stmtCall = $db->prepare("
    SELECT c.*, u.fullname AS caller_name, u.profile_image AS caller_image, u.phone AS caller_phone
    FROM calls c
    JOIN users u ON c.caller_id = u.id
    WHERE c.receiver_id = :uid AND c.status = 'calling'
    ORDER BY c.id DESC LIMIT 1
");
$stmtCall->execute([':uid' => $currentUserId]);
$incomingCall = $stmtCall->fetch(PDO::FETCH_ASSOC);
if ($incomingCall) {
    if (!empty($incomingCall['caller_image'])) {
        if (!str_starts_with($incomingCall['caller_image'], 'http') && !str_starts_with($incomingCall['caller_image'], 'assets/') && !str_starts_with($incomingCall['caller_image'], 'uploads/')) {
            $incomingCall['caller_image'] = 'uploads/images/' . $incomingCall['caller_image'];
        }
    } else {
        $incomingCall['caller_image'] = 'assets/images/default-avatar.png';
    }
}

// 5. Check unread notifications count
$notifModel = new Notification();
$unreadNotifs = $notifModel->getUnreadCount($currentUserId);

jsonResponse(true, 'Sync status', [
    'new_messages'          => $newMessages,
    'read_message_ids'      => array_map('intval', $readMessageIds),
    'deleted_message_ids'   => array_map('intval', $deletedMessageIds),
    'recent_incoming'       => $recentIncoming,
    'max_global_id'         => $newGlobalId,
    'conversations'         => $conversations,
    'total_unread_messages' => $totalUnreadMessages,
    'system_settings'       => $systemSettings,
    'unread_notifications'  => (int)$unreadNotifs,
    'incoming_call'         => $incomingCall ?: null,
    'timestamp'             => time()
]);
