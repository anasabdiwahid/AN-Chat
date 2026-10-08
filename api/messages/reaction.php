<?php
// api/messages/reaction.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/Message.php';

$currentUser = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(false, 'Invalid request method.', null, 405);
}

$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$messageId = (int)($input['message_id'] ?? 0);
$reaction = trim($input['reaction'] ?? '');

$allowedReactions = ['❤️', '😂', '👍', '🔥', '😍', '😢', '🙏', '🎉'];
if (!$messageId || !in_array($reaction, $allowedReactions)) {
    jsonResponse(false, 'Invalid reaction emoji.');
}

$msgModel = new Message();
$res = $msgModel->toggleReaction($messageId, $currentUser['id'], $reaction);

jsonResponse($res['success'], 'Reaction updated', [
    'action' => $res['action'],
    'reactions' => $res['reactions']
]);
