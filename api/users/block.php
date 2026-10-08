<?php
// api/users/block.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/User.php';

$currentUser = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(false, 'Invalid request method.', null, 405);
}

$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$targetId = (int)($input['target_id'] ?? 0);
$action = $input['action'] ?? 'block'; // 'block' or 'unblock'

if (!$targetId) {
    jsonResponse(false, 'Target user ID is required.');
}

$userModel = new User();
if ($action === 'unblock') {
    $ok = $userModel->unblockUser($currentUser['id'], $targetId);
    jsonResponse($ok, $ok ? 'User unblocked successfully.' : 'Failed to unblock user.');
} else {
    $ok = $userModel->blockUser($currentUser['id'], $targetId);
    jsonResponse($ok, $ok ? 'User blocked successfully.' : 'Failed to block user.');
}

