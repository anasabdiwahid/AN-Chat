<?php
// api/users/profile.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/User.php';

$currentUser = requireAuth();

$targetId = isset($_GET['id']) ? (int)$_GET['id'] : $currentUser['id'];

$userModel = new User();
$profile = $userModel->findById($targetId);

if (!$profile) {
    jsonResponse(false, 'User not found.', null, 404);
}

// Check privacy if viewing another user's profile
if ($targetId !== $currentUser['id']) {
    $isBlocked = $userModel->isBlocked($currentUser['id'], $targetId);
    $profile['is_blocked'] = $isBlocked;
    
    // Privacy logic for last_seen
    if ($profile['privacy_last_seen'] === 'nobody') {
        $profile['last_seen'] = null;
    }
}

jsonResponse(true, 'Profile retrieved', $profile);

