<?php
// api/notifications/list.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/Notification.php';

$currentUser = requireAuth();

$notifModel = new Notification();
$list = $notifModel->getList($currentUser['id']);
$unreadCount = $notifModel->getUnreadCount($currentUser['id']);

jsonResponse(true, 'Notifications loaded', [
    'notifications' => $list,
    'unread_count' => $unreadCount
]);

