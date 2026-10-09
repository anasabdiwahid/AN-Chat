<?php
// api/messages/fetch.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/Message.php';

$currentUser = requireAuth();

$friendId = (int)($_GET['friend_id'] ?? 0);
$limit = isset($_GET['limit']) ? min((int)$_GET['limit'], 100) : 50;
$beforeId = isset($_GET['before_id']) ? (int)$_GET['before_id'] : 0;
$afterId = isset($_GET['after_id']) ? max(0, (int)$_GET['after_id']) : null;

if (!$friendId) {
    jsonResponse(false, 'Friend ID is required.');
}

$msgModel = new Message();
if ($afterId !== null) {
    // Lightweight polling fallback for the currently open conversation.
    $db = Database::getConnection();
    $stmt = $db->prepare("
        SELECT m.*, u.fullname AS sender_name, u.profile_image AS sender_image,
               r.message AS reply_text, r.message_type AS reply_type,
               ru.fullname AS reply_sender_name
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        LEFT JOIN messages r ON m.reply_to_id = r.id
        LEFT JOIN users ru ON r.sender_id = ru.id
        WHERE m.id > :after_id
          AND ((m.sender_id = :uid1 AND m.receiver_id = :friend1 AND (m.deleted_for_sender = 0 OR m.deleted_for_sender IS NULL))
            OR (m.sender_id = :friend2 AND m.receiver_id = :uid2))
          AND (m.deleted_for_all = 0 OR m.deleted_for_all IS NULL)
        ORDER BY m.id ASC
        LIMIT 100
    ");
    $stmt->execute([
        ':after_id' => $afterId,
        ':uid1' => (int)$currentUser['id'],
        ':friend1' => $friendId,
        ':friend2' => $friendId,
        ':uid2' => (int)$currentUser['id']
    ]);
    $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($messages as &$message) {
        $message['reactions'] = $msgModel->getReactions((int)$message['id']);
    }
    unset($message);
    $msgModel->markConversationAsRead($friendId, (int)$currentUser['id']);
} else {
    $messages = $msgModel->getConversation($currentUser['id'], $friendId, $limit, $beforeId);
}

jsonResponse(true, 'Messages retrieved', $messages);
