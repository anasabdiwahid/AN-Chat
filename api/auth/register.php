<?php
// api/auth/register.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/User.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(false, 'Invalid request method.', null, 405);
}

$fullname = trim($_POST['fullname'] ?? '');
$phone = preg_replace('/[^0-9]/', '', trim($_POST['phone'] ?? ''));
$password = $_POST['password'] ?? '';
$confirmPassword = $_POST['confirm_password'] ?? '';

// Validation
if (empty($fullname) || mb_strlen($fullname) < 2) {
    jsonResponse(false, 'Please enter a valid full name.');
}

if (empty($phone) || strlen($phone) < 6 || strlen($phone) > 15) {
    jsonResponse(false, 'Please enter a valid phone number (digits only, 6-15 characters).');
}

if (empty($password) || strlen($password) < 6) {
    jsonResponse(false, 'Password must be at least 6 characters.');
}

if ($password !== $confirmPassword) {
    jsonResponse(false, 'Passwords do not match.');
}

// Handle optional profile image
$profileImageName = null;
if (isset($_FILES['profile_image']) && $_FILES['profile_image']['error'] === UPLOAD_ERR_OK) {
    $file = $_FILES['profile_image'];
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($file['tmp_name']);

    if (!in_array($mime, ALLOWED_IMAGE_TYPES)) {
        jsonResponse(false, 'Invalid photo format. Only JPG, PNG, and WebP are allowed.');
    }

    if ($file['size'] > 5 * 1024 * 1024) {
        jsonResponse(false, 'Profile photo must be smaller than 5MB.');
    }

    $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
    $safeExt = in_array(strtolower($ext), ['jpg', 'jpeg', 'png', 'webp']) ? strtolower($ext) : 'jpg';
    $profileImageName = 'avatar_' . uniqid('', true) . '.' . $safeExt;
    $targetPath = UPLOAD_DIR . 'images/' . $profileImageName;

    if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
        $profileImageName = null;
    }
}

$userModel = new User();
$result = $userModel->register($fullname, $phone, $password, $profileImageName);

if ($result['success']) {
    jsonResponse(true, 'Account created successfully! You can now log in.', [
        'user_id' => $result['user_id']
    ]);
} else {
    // If failed, remove uploaded image if any
    if ($profileImageName && file_exists(UPLOAD_DIR . 'images/' . $profileImageName)) {
        @unlink(UPLOAD_DIR . 'images/' . $profileImageName);
    }
    jsonResponse(false, $result['message']);
}
