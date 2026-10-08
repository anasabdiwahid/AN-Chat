<?php
// api/messages/sync.php - Real-Time event synchronizer (HTTP fallback)
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/Message.php';
require_once __DIR__ . '/../../models/Notification.php';
require_once __DIR__ . '/../../models/Friend.php';

$currentUser = requireAuth();

$lastMsgId = isset($_GET['last_msg_id']) ? (int)$_GET['last_msg_id'] : 0;
$activeFriendId = isset($_GET['active_friend_id']) ? (int)$_GET['active_friend_id'] : 0;

$db = Database::getConnection();

// Check for new incoming messages
$newMessages = [];
if ($lastMsgId > 0 && $activeFriendId > 0) {
    $stmt = $db->prepare("
        SELECT m.*, u.fullname AS sender_name, u.profile_image AS sender_image
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.id > :last_id 
          AND ((m.sender_id = :fid AND m.receiver_id = :uid) OR (m.sender_id = :uid2 AND m.receiver_id = :fid2))
          AND (m.deleted_for_all = 0 OR m.deleted_for_all IS NULL)
        ORDER BY m.id ASC
    ");
    $stmt->execute([
        ':last_id' => $lastMsgId,
        ':fid' => $activeFriendId,
        ':uid' => $currentUser['id'],
        ':uid2' => $currentUser['id'],
        ':fid2' => $activeFriendId
    ]);
    $newMessages = $stmt->fetchAll();
}

// Check for incoming call
$stmtCall = $db->prepare("
    SELECT c.*, u.fullname AS caller_name, u.profile_image AS caller_image, u.phone AS caller_phone
    FROM calls c
    JOIN users u ON c.caller_id = u.id
    WHERE c.receiver_id = :uid AND c.status = 'calling' AND c.created_at >= (NOW() - INTERVAL 45 SECOND)
    ORDER BY c.id DESC LIMIT 1
");
$stmtCall->execute([':uid' => $currentUser['id']]);
$incomingCall = $stmtCall->fetch();

// Check unread counts
$notifModel = new Notification();
$unreadNotifs = $notifModel->getUnreadCount($currentUser['id']);

jsonResponse(true, 'Sync status', [
    'new_messages' => $newMessages,
    'incoming_call' => $incomingCall ?: null,
    'unread_notifications' => $unreadNotifs
]);

