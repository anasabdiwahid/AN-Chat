<?php
// api/users/update-profile.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/User.php';

$currentUser = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(false, 'Invalid request method.', null, 405);
}

$userModel = new User();
$action = $_POST['action'] ?? 'info'; // 'info' or 'password'

if ($action === 'password') {
    $currentPass = $_POST['current_password'] ?? '';
    $newPass = $_POST['new_password'] ?? '';
    $confirmPass = $_POST['confirm_new_password'] ?? '';

    if (empty($currentPass) || empty($newPass)) {
        jsonResponse(false, 'Please fill in all password fields.');
    }

    if (strlen($newPass) < 6) {
        jsonResponse(false, 'New password must be at least 6 characters.');
    }

    if ($newPass !== $confirmPass) {
        jsonResponse(false, 'New passwords do not match.');
    }

    $res = $userModel->updatePassword($currentUser['id'], $currentPass, $newPass);
    jsonResponse($res['success'], $res['message']);
} else {
    // Updating fullname, bio, and optionally profile image
    $fullname = trim($_POST['fullname'] ?? $currentUser['fullname']);
    $bio = trim($_POST['bio'] ?? '');

    if (empty($fullname) || mb_strlen($fullname) < 2) {
        jsonResponse(false, 'Name must be at least 2 characters.');
    }

    $imageName = null;
    if (isset($_FILES['profile_image']) && $_FILES['profile_image']['error'] === UPLOAD_ERR_OK) {
        $file = $_FILES['profile_image'];
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->file($file['tmp_name']);

        if (!in_array($mime, ALLOWED_IMAGE_TYPES)) {
            jsonResponse(false, 'Only JPG, PNG, and WebP images are allowed.');
        }

        if ($file['size'] > 5 * 1024 * 1024) {
            jsonResponse(false, 'Image size cannot exceed 5MB.');
        }

        $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
        $safeExt = in_array(strtolower($ext), ['jpg', 'jpeg', 'png', 'webp']) ? strtolower($ext) : 'jpg';
        $imageName = 'avatar_' . uniqid('', true) . '.' . $safeExt;
        $targetPath = UPLOAD_DIR . 'images/' . $imageName;

        if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
            $imageName = null;
        } else {
            $_SESSION['profile_image'] = $imageName;
        }
    }

    $_SESSION['fullname'] = $fullname;
    $_SESSION['bio'] = $bio;

    $success = $userModel->updateProfile($currentUser['id'], $fullname, $bio, $imageName);

    if ($success) {
        jsonResponse(true, 'Profile updated successfully!', [
            'fullname' => $fullname,
            'bio' => $bio,
            'profile_image' => $imageName ?? $currentUser['profile_image']
        ]);
    } else {
        jsonResponse(false, 'Failed to update profile.');
    }
}

