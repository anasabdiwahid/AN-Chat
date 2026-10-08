<?php
// api/messages/send.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/Message.php';

$currentUser = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(false, 'Invalid request method.', null, 405);
}

$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

$receiverId = (int)($input['receiver_id'] ?? 0);
$message = isset($input['message']) ? trim($input['message']) : null;
$messageType = $input['message_type'] ?? 'text';
$filePath = $input['file_path'] ?? null;
$fileName = $input['file_name'] ?? null;
$fileSize = $input['file_size'] ?? null;
$replyToId = !empty($input['reply_to_id']) ? (int)$input['reply_to_id'] : null;

if (!$receiverId) {
    jsonResponse(false, 'Receiver ID is required.');
}

if ($messageType === 'text' && empty($message)) {
    jsonResponse(false, 'Cannot send empty message.');
}

$allowedTypes = ['text', 'image', 'video', 'document', 'voice'];
if (!in_array($messageType, $allowedTypes)) {
    $messageType = 'text';
}

$msgModel = new Message();
$res = $msgModel->send(
    $currentUser['id'],
    $receiverId,
    $message,
    $messageType,
    $filePath,
    $fileName,
    $fileSize,
    $replyToId
);

jsonResponse($res['success'], $res['message'], $res['data'] ?? null);

