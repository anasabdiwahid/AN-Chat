<?php
// api/admin/stats.php - Get platform analytics for Admin Dashboard
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/User.php';
require_once __DIR__ . '/../../models/SystemSetting.php';

$admin = requireAdmin();

$userModel = new User();
$settingModel = new SystemSetting();

$stats = $userModel->getAdminStats();
$stats['screenshot_detection'] = $settingModel->isScreenshotDetectionEnabled();

jsonResponse(true, 'Admin stats loaded', $stats);
