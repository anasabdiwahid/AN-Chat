<?php
// api/users/report.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/User.php';

$currentUser = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(false, 'Invalid request method.', null, 405);
}

$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$targetId = (int)($input['target_id'] ?? 0);
$reason = trim($input['reason'] ?? '');
$details = trim($input['details'] ?? '');

$validReasons = ['Spam', 'Harassment', 'Fake account', 'Inappropriate content', 'Other'];
if (!$targetId || !in_array($reason, $validReasons)) {
    jsonResponse(false, 'Please select a valid report reason.');
}

$userModel = new User();
$ok = $userModel->reportUser($currentUser['id'], $targetId, $reason, $details);

if ($ok) {
    jsonResponse(true, 'Report submitted successfully. Our team will review it.');
} else {
    jsonResponse(false, 'Failed to submit report.');
}
