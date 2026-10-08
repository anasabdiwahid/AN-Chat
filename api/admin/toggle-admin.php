<?php
// api/admin/toggle-admin.php - Toggle admin role for a user
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/User.php';

$admin = requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(false, 'Invalid request method.', null, 405);
}

$input = json_decode(file_get_contents('php://input'), true);
$targetUserId = (int)($input['user_id'] ?? $_POST['user_id'] ?? 0);
$makeAdmin = !empty($input['is_admin']) || !empty($_POST['is_admin']);

if ($targetUserId <= 0) {
    jsonResponse(false, 'Invalid user ID.');
}

// Cannot demote yourself
if ($targetUserId === (int)$admin['id'] && !$makeAdmin) {
    jsonResponse(false, 'You cannot remove your own admin privileges.');
}

$userModel = new User();
$ok = $userModel->toggleAdminStatus($targetUserId, $makeAdmin ? 1 : 0);

if ($ok) {
    jsonResponse(true, $makeAdmin ? 'User promoted to Admin!' : 'Admin privileges removed.');
} else {
    jsonResponse(false, 'Failed to update admin role.');
}

