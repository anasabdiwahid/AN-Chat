<?php
// api/users/settings.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/User.php';

$currentUser = requireAuth();
$userModel = new User();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $theme = in_array($input['theme'] ?? '', ['light', 'dark']) ? $input['theme'] : 'light';
    $sound = isset($input['notification_sound']) ? (int)$input['notification_sound'] : 1;
    $privacy = in_array($input['privacy_last_seen'] ?? '', ['everyone', 'friends', 'nobody']) ? $input['privacy_last_seen'] : 'everyone';

    $ok = $userModel->updateSettings($currentUser['id'], $theme, $sound, $privacy);
    if ($ok) {
        jsonResponse(true, 'Settings updated successfully.', [
            'theme' => $theme,
            'notification_sound' => $sound,
            'privacy_last_seen' => $privacy
        ]);
    } else {
        jsonResponse(false, 'Failed to update settings.');
    }
} else {
    $settings = $userModel->getSettings($currentUser['id']);
    jsonResponse(true, 'Settings loaded.', $settings);
}
