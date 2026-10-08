<?php
// api/messages/fetch.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/Message.php';

$currentUser = requireAuth();

$friendId = (int)($_GET['friend_id'] ?? 0);
$limit = isset($_GET['limit']) ? min((int)$_GET['limit'], 100) : 50;
$beforeId = isset($_GET['before_id']) ? (int)$_GET['before_id'] : 0;

if (!$friendId) {
    jsonResponse(false, 'Friend ID is required.');
}

$msgModel = new Message();
$messages = $msgModel->getConversation($currentUser['id'], $friendId, $limit, $beforeId);

jsonResponse(true, 'Messages retrieved', $messages);

