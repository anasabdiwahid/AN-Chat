<?php
// Persist WebRTC offer/answer/ICE signals so calls still work if WebSocket
// delivery is unavailable or the two browsers reconnect at different times.
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';

$currentUser = requireAuth();
$db = Database::getConnection();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $callId = (int)($input['call_id'] ?? 0);
    $signalType = trim((string)($input['signal_type'] ?? ''));
    $payload = $input['payload'] ?? null;

    if (!$callId || !in_array($signalType, ['offer', 'answer', 'ice'], true) || !is_array($payload)) {
        jsonResponse(false, 'Call ID, signal type, and payload are required.', null, 400);
    }
    if (strlen(json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) > 1048576) {
        jsonResponse(false, 'Call signal is too large.', null, 413);
    }

    $stmt = $db->prepare('SELECT caller_id, receiver_id, status FROM calls WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $callId]);
    $call = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$call) jsonResponse(false, 'Call not found.', null, 404);

    $userId = (int)$currentUser['id'];
    if ($userId === (int)$call['caller_id']) {
        $targetId = (int)$call['receiver_id'];
    } elseif ($userId === (int)$call['receiver_id']) {
        $targetId = (int)$call['caller_id'];
    } else {
        jsonResponse(false, 'Unauthorized.', null, 403);
    }

    if (in_array($call['status'], ['declined', 'missed', 'ended'], true)) {
        jsonResponse(false, 'Call is no longer active.', null, 409);
    }

    $stmt = $db->prepare('INSERT INTO call_signals (call_id, from_user_id, to_user_id, signal_type, payload) VALUES (:call_id, :from_id, :to_id, :type, :payload)');
    $stmt->execute([
        ':call_id' => $callId,
        ':from_id' => $userId,
        ':to_id' => $targetId,
        ':type' => $signalType,
        ':payload' => json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    ]);
    $signalId = (int)$db->lastInsertId();

    // Keep this short lived transport table bounded.
    $db->exec('DELETE FROM call_signals WHERE created_at < DATE_SUB(NOW(), INTERVAL 2 DAY)');
    jsonResponse(true, 'Call signal stored.', ['signal_id' => $signalId]);
}

if ($method === 'GET') {
    $callId = (int)($_GET['call_id'] ?? 0);
    $afterId = max(0, (int)($_GET['after_id'] ?? 0));
    if (!$callId) jsonResponse(false, 'Call ID is required.', null, 400);

    $stmt = $db->prepare('SELECT caller_id, receiver_id FROM calls WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $callId]);
    $call = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$call) jsonResponse(false, 'Call not found.', null, 404);
    $userId = (int)$currentUser['id'];
    if ($userId !== (int)$call['caller_id'] && $userId !== (int)$call['receiver_id']) {
        jsonResponse(false, 'Unauthorized.', null, 403);
    }

    $stmt = $db->prepare('SELECT id, from_user_id, signal_type, payload, created_at FROM call_signals WHERE call_id = :call_id AND to_user_id = :user_id AND id > :after_id ORDER BY id ASC LIMIT 100');
    $stmt->execute([':call_id' => $callId, ':user_id' => $userId, ':after_id' => $afterId]);
    $signals = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($signals as &$signal) {
        $signal['id'] = (int)$signal['id'];
        $signal['from_user_id'] = (int)$signal['from_user_id'];
        $signal['payload'] = json_decode($signal['payload'], true) ?: [];
    }
    unset($signal);
    jsonResponse(true, 'Call signals loaded.', $signals);
}

jsonResponse(false, 'Invalid request method.', null, 405);
