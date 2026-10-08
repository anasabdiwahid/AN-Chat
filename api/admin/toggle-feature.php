<?php
// api/admin/toggle-feature.php - Enable / Disable system features (e.g. Screenshot Detection)
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/SystemSetting.php';

$admin = requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(false, 'Invalid request method.', null, 405);
}

$input = json_decode(file_get_contents('php://input'), true);
$feature = trim($input['feature'] ?? $_POST['feature'] ?? '');
$enabled = isset($input['enabled']) ? ($input['enabled'] ? '1' : '0') : (isset($_POST['enabled']) ? ($_POST['enabled'] ? '1' : '0') : null);

if (empty($feature)) {
    jsonResponse(false, 'Feature key is required.');
}

if ($enabled === null) {
    jsonResponse(false, 'Enabled state is required.');
}

$settingModel = new SystemSetting();

if ($feature === 'screenshot_detection') {
    $ok = $settingModel->set('screenshot_detection', $enabled, 'Enable real-time screenshot and screen recording alert in chats');
    if ($ok) {
        $statusWord = ($enabled === '1') ? 'ENABLED (ON)' : 'DISABLED (OFF)';
        jsonResponse(true, "Screenshot & Screen Recording Alert is now {$statusWord}!", [
            'feature' => 'screenshot_detection',
            'enabled' => ($enabled === '1')
        ]);
    } else {
        jsonResponse(false, 'Failed to update feature setting.');
    }
} else {
    jsonResponse(false, 'Unknown feature key.');
}
