<?php
// api/auth/login.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/User.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(false, 'Invalid request method.', null, 405);
}

// Support both JSON body and standard POST form data
$input = json_decode(file_get_contents('php://input'), true);
$phone = preg_replace('/[^0-9]/', '', trim($input['phone'] ?? $_POST['phone'] ?? ''));
$password = $input['password'] ?? $_POST['password'] ?? '';

if (empty($phone) || empty($password)) {
    jsonResponse(false, 'Please provide both phone number and password.');
}

$userModel = new User();
$result = $userModel->login($phone, $password);

if ($result['success']) {
    session_regenerate_id(true);
    $user = $result['user'];
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['fullname'] = $user['fullname'];
    $_SESSION['phone'] = $user['phone'];
    $_SESSION['profile_image'] = $user['profile_image'];
    $_SESSION['bio'] = $user['bio'];

    jsonResponse(true, 'Login successful!', [
        'user' => $user,
        'csrf_token' => getCsrfToken(),
        'redirect' => 'dashboard.php'
    ]);
} else {
    jsonResponse(false, $result['message']);
}
