<?php
// api/users/heartbeat.php - Lightweight authenticated presence heartbeat
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';

$currentUser = requireAuth();

try {
    $db = Database::getConnection();
    $stmt = $db->prepare("UPDATE users SET status = 'online', last_seen = NOW() WHERE id = :id");
    $stmt->execute([':id' => (int)$currentUser['id']]);

    $stmtFriends = $db->prepare("
        SELECT u.id,
               CASE
                   WHEN u.status = 'away' THEN 'away'
                   WHEN u.last_seen >= DATE_SUB(NOW(), INTERVAL 60 SECOND) THEN 'online'
                   ELSE 'offline'
               END AS status,
               u.last_seen
        FROM friendships f
        JOIN users u ON u.id = f.friend_id
        WHERE f.user_id = :id
    ");
    $stmtFriends->execute([':id' => (int)$currentUser['id']]);
    $friends = $stmtFriends->fetchAll(PDO::FETCH_ASSOC);

    jsonResponse(true, 'Presence updated.', [
        'status' => 'online',
        'last_seen' => date('Y-m-d H:i:s'),
        'friends' => $friends
    ]);
} catch (Throwable $e) {
    jsonResponse(false, 'Heartbeat update failed: ' . $e->getMessage(), null, 500);
}
