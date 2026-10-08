<?php
// api/calls/history.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/Call.php';

$currentUser = requireAuth();

$callModel = new Call();
$history = $callModel->getHistory($currentUser['id']);

jsonResponse(true, 'Call history loaded', $history);

