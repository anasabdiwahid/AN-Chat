<?php
// api/auth/logout.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/User.php';

if (!empty($_SESSION['user_id'])) {
    $userModel = new User();
    $userModel->updateStatus((int)$_SESSION['user_id'], 'offline');
}

// Clear all session data
$_SESSION = [];
if (ini_get("session.use_cookies")) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000,
        $params["path"], $params["domain"],
        $params["secure"], $params["httponly"]
    );
}
session_destroy();

// If requested via JSON API
if (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false) {
    jsonResponse(true, 'Logged out successfully.', ['redirect' => 'login.php']);
} else {
    header('Location: ../../login.php');
    exit;
}

