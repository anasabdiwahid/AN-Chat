<?php
// api/admin/friendships.php - List all friendships & connections
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/User.php';

$admin = requireAdmin();

$search = trim($_GET['q'] ?? '');
$userModel = new User();
$friendships = $userModel->getAllFriendshipsForAdmin($search);

// Format avatar URLs safely
foreach ($friendships as &$f) {
    foreach (['user1_avatar', 'user2_avatar'] as $key) {
        if (!empty($f[$key])) {
            if (!str_starts_with($f[$key], 'http') && !str_starts_with($f[$key], 'assets/') && !str_starts_with($f[$key], 'uploads/')) {
                $f[$key] = 'uploads/images/' . $f[$key];
            }
        } else {
            $f[$key] = 'assets/images/default-avatar.png';
        }
    }
}

jsonResponse(true, 'Friendships loaded', $friendships);

