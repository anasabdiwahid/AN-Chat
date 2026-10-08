<?php
// api/friends/accept-request.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/Friend.php';

$currentUser = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(false, 'Invalid request method.', null, 405);
}

$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$requestId = (int)($input['request_id'] ?? 0);

if (!$requestId) {
    jsonResponse(false, 'Request ID is required.');
}

$friendModel = new Friend();
$res = $friendModel->acceptRequest($requestId, $currentUser['id']);

jsonResponse($res['success'], $res['message']);
