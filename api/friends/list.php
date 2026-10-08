<?php
// api/friends/list.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/Friend.php';

$currentUser = requireAuth();

$friendModel = new Friend();
$friends = $friendModel->getFriendsList($currentUser['id']);

jsonResponse(true, 'Friends retrieved', $friends);
