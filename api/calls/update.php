<?php
// api/calls/update.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/Call.php';

$currentUser = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(false, 'Invalid request method.', null, 405);
}

$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$callId = (int)($input['call_id'] ?? 0);
$status = trim($input['status'] ?? '');
$duration = (int)($input['duration'] ?? 0);

if (!$callId || empty($status)) {
    jsonResponse(false, 'Call ID and status are required.');
}

$callModel = new Call();
$ok = $callModel->updateCall($callId, $status, $duration);

jsonResponse($ok, $ok ? 'Call status updated' : 'Failed to update call status.');

