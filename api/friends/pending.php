<?php
// api/friends/pending.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/Friend.php';

$currentUser = requireAuth();

$friendModel = new Friend();
$pending = $friendModel->getPendingRequests($currentUser['id']);

jsonResponse(true, 'Pending requests', $pending);

