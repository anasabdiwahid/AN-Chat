<?php
// api/calls/status.php - Real-Time Call Status Polling API
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/Call.php';

$currentUser = requireAuth();

$callId = (int)($_GET['call_id'] ?? ($_POST['call_id'] ?? 0));
if (!$callId) {
    jsonResponse(false, 'Call ID is required.');
}

$callModel = new Call();
$call = $callModel->getCall($callId);

if (!$call) {
    jsonResponse(false, 'Call not found.');
}

// Ensure current user is caller or receiver
if ((int)$call['caller_id'] !== (int)$currentUser['id'] && (int)$call['receiver_id'] !== (int)$currentUser['id']) {
    jsonResponse(false, 'Unauthorized.', null, 403);
}

// Stale call protection (auto-expire only if abandoned for > 120 seconds, calculated purely inside MySQL)
if ($call['status'] === 'calling') {
    $db = Database::getConnection();
    $stmtAge = $db->prepare("SELECT TIMESTAMPDIFF(SECOND, created_at, NOW()) AS age_sec FROM calls WHERE id = :id");
    $stmtAge->execute([':id' => $callId]);
    $age = (int)$stmtAge->fetchColumn();
    if ($age > 120) {
        $callModel->updateCall($callId, 'missed');
        $call['status'] = 'missed';
    }
}

jsonResponse(true, 'Call status', [
    'call_id'    => (int)$call['id'],
    'status'     => $call['status'],
    'call_type'  => $call['call_type'],
    'duration'   => (int)($call['duration'] ?? 0),
    'started_at' => $call['started_at'],
    'ended_at'   => $call['ended_at']
]);
