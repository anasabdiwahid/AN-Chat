<?php
// api/admin/users.php - List all registered users for Admin
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/User.php';

$admin = requireAdmin();

$search = trim($_GET['q'] ?? '');
$userModel = new User();
$users = $userModel->getAllUsersForAdmin($search);

// Format avatar URLs safely
foreach ($users as &$u) {
    if (!empty($u['profile_image'])) {
        if (!str_starts_with($u['profile_image'], 'http') && !str_starts_with($u['profile_image'], 'assets/') && !str_starts_with($u['profile_image'], 'uploads/')) {
            $u['profile_image'] = 'uploads/images/' . $u['profile_image'];
        }
    } else {
        $u['profile_image'] = 'assets/images/default-avatar.png';
    }
}

jsonResponse(true, 'Users loaded', $users);

