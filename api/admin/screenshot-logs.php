<?php
// api/admin/screenshot-logs.php - Recent screenshot detection events
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/SystemSetting.php';

$admin = requireAdmin();

$settingModel = new SystemSetting();
$logs = $settingModel->getScreenshotLogs(100);

foreach ($logs as &$l) {
    foreach (['user_avatar', 'target_avatar'] as $key) {
        if (!empty($l[$key])) {
            if (!str_starts_with($l[$key], 'http') && !str_starts_with($l[$key], 'assets/') && !str_starts_with($l[$key], 'uploads/')) {
                $l[$key] = 'uploads/images/' . $l[$key];
            }
        } else {
            $l[$key] = 'assets/images/default-avatar.png';
        }
    }
}

jsonResponse(true, 'Screenshot logs loaded', $logs);

