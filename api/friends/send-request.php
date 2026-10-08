<?php
// api/friends/send-request.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/Friend.php';

$currentUser = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(false, 'Invalid request method.', null, 405);
}

$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$receiverId = (int)($input['receiver_id'] ?? 0);

if (!$receiverId) {
    jsonResponse(false, 'Receiver user ID is required.');
}

$friendModel = new Friend();
$res = $friendModel->sendRequest($currentUser['id'], $receiverId);

jsonResponse($res['success'], $res['message']);

