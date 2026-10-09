<?php
// api/admin/delete-user.php - Permanently delete a user and dependent records.
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/User.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(false, 'Invalid request method.', null, 405);
}

$admin = requireAdmin();
$csrfToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
if (!verifyCsrfToken($csrfToken)) {
    jsonResponse(false, 'Codsiga waa dhacay. Dib u cusboonaysii admin page-ka.', null, 403);
}

$input = json_decode(file_get_contents('php://input'), true);
$targetUserId = (int)($input['user_id'] ?? 0);
if ($targetUserId <= 0) {
    jsonResponse(false, 'User ID sax ah geli.', null, 400);
}

$userModel = new User();
$result = $userModel->deleteUserForAdmin($targetUserId, (int)$admin['id']);
jsonResponse($result['success'], $result['message'], null, $result['success'] ? 200 : 400);
