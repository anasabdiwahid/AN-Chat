<?php
// api/calls/incoming.php - Poll for the authenticated user's incoming call.
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';

$currentUser = requireAuth();
$db = Database::getConnection();

$stmt = $db->prepare("
    SELECT c.id, c.caller_id, c.call_type, c.status, c.created_at,
           u.fullname AS caller_name, u.profile_image AS caller_image
    FROM calls c
    JOIN users u ON u.id = c.caller_id
    WHERE c.receiver_id = :user_id
      AND c.status = 'calling'
      AND c.created_at >= DATE_SUB(NOW(), INTERVAL 50 SECOND)
    ORDER BY c.id DESC
    LIMIT 1
");
$stmt->execute([':user_id' => (int)$currentUser['id']]);
$call = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;

if ($call && !empty($call['caller_image'])
    && !str_starts_with($call['caller_image'], 'http')
    && !str_starts_with($call['caller_image'], 'assets/')
    && !str_starts_with($call['caller_image'], 'uploads/')) {
    $call['caller_image'] = 'uploads/images/' . $call['caller_image'];
}

jsonResponse(true, 'Incoming call status', $call);
