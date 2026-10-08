<?php
// api/messages/delete.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/Message.php';

$currentUser = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(false, 'Invalid request method.', null, 405);
}

$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$messageId = (int)($input['message_id'] ?? 0);
$type = $input['type'] ?? 'for_me'; // 'for_me' or 'for_everyone'

if (!$messageId) {
    jsonResponse(false, 'Message ID is required.');
}

$msgModel = new Message();
$res = $msgModel->deleteMessage($messageId, $currentUser['id'], $type);

jsonResponse($res['success'], $res['message']);
