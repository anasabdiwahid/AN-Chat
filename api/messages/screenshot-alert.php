<?php
// api/messages/screenshot-alert.php - Process real-time screenshot / screen recording alert
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/SystemSetting.php';
require_once __DIR__ . '/../../models/Notification.php';
require_once __DIR__ . '/../../models/Message.php';

$currentUser = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(false, 'Invalid request method.', null, 405);
}

$input = json_decode(file_get_contents('php://input'), true);
$targetUserId = (int)($input['target_user_id'] ?? $_POST['target_user_id'] ?? 0);
$actionType = in_array($input['action_type'] ?? $_POST['action_type'] ?? '', ['screenshot', 'screen_recording']) 
    ? ($input['action_type'] ?? $_POST['action_type']) 
    : 'screenshot';

if ($targetUserId <= 0 || $targetUserId === $currentUser['id']) {
    jsonResponse(false, 'Invalid target user ID.');
}

$settingModel = new SystemSetting();
if (!$settingModel->isScreenshotDetectionEnabled()) {
    jsonResponse(false, 'Screenshot detection feature is currently disabled by Admin.');
}

// 1. Log event in DB
$settingModel->logScreenshot($currentUser['id'], $targetUserId, $actionType);

// 2. Insert chat system record so both parties see it in conversation history
$db = Database::getConnection();
$actionDesc = ($actionType === 'screen_recording') ? 'started screen recording' : 'took a screenshot of this conversation';
$systemNotice = "⚠️ {$currentUser['fullname']} {$actionDesc}.";

$stmtMsg = $db->prepare("
    INSERT INTO messages (sender_id, receiver_id, message, message_type, is_delivered, is_read, created_at)
    VALUES (:sid, :rid, :msg, 'system', 1, 0, NOW())
");
$stmtMsg->execute([
    ':sid' => $currentUser['id'],
    ':rid' => $targetUserId,
    ':msg' => $systemNotice
]);
$msgId = (int)$db->lastInsertId();

// 3. Send Notification to target user
$notifModel = new Notification();
$notifModel->create(
    $targetUserId,
    $currentUser['id'],
    'screenshot_alert',
    "⚠️ {$currentUser['fullname']} took a screenshot of your chat.",
    $msgId
);

jsonResponse(true, 'Screenshot alert recorded', [
    'message_id' => $msgId,
    'sender_id' => $currentUser['id'],
    'sender_name' => $currentUser['fullname'],
    'target_user_id' => $targetUserId,
    'action_type' => $actionType,
    'notice' => $systemNotice,
    'created_at' => date('Y-m-d H:i:s')
]);
