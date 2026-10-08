<?php
// api/calls/create.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/Call.php';

$currentUser = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(false, 'Invalid request method.', null, 405);
}

$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$receiverId = (int)($input['receiver_id'] ?? 0);
$callType = in_array($input['call_type'] ?? '', ['voice', 'video']) ? $input['call_type'] : 'voice';

if (!$receiverId) {
    jsonResponse(false, 'Receiver ID is required.');
}

$callModel = new Call();
$res = $callModel->createCall($currentUser['id'], $receiverId, $callType);

jsonResponse($res['success'], $res['message'] ?? 'Call initiated', $res);
