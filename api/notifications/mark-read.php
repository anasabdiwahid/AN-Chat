<?php
// api/notifications/mark-read.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/Notification.php';

$currentUser = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(false, 'Invalid request method.', null, 405);
}

$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$notifId = isset($input['id']) ? (int)$input['id'] : 0;

$notifModel = new Notification();
if ($notifId > 0) {
    $ok = $notifModel->markAsRead($notifId, $currentUser['id']);
} else {
    $ok = $notifModel->markAllAsRead($currentUser['id']);
}

jsonResponse($ok, 'Notifications updated.');
