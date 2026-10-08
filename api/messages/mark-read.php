<?php
// api/messages/mark-read.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/Message.php';

$currentUser = requireAuth();

$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$friendId = (int)($input['friend_id'] ?? 0);

if (!$friendId) {
    jsonResponse(false, 'Friend ID is required.');
}

$msgModel = new Message();
$msgModel->markConversationAsRead($friendId, $currentUser['id']);

jsonResponse(true, 'Messages marked as read.');

