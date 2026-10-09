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
$friendId = (int)($input['friend_id'] ?? 0);

if (!$requestId && $friendId) {
    $db = Database::getConnection();
    $stmt = $db->prepare("SELECT id FROM friend_requests WHERE sender_id = :fid AND receiver_id = :uid AND status = 'pending' ORDER BY id DESC LIMIT 1");
    $stmt->execute([':fid' => $friendId, ':uid' => $currentUser['id']]);
    $requestId = (int)$stmt->fetchColumn();
}

if (!$requestId) {
    jsonResponse(false, 'Request ID or Friend ID is required.');
}

$friendModel = new Friend();
$res = $friendModel->acceptRequest($requestId, $currentUser['id']);

jsonResponse($res['success'], $res['message']);

