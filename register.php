<?php
// register.php - Registration Screen
require_once __DIR__ . '/config/config.php';

if (!empty($_SESSION['user_id'])) {
    header('Location: dashboard.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Create Account — A/N Chat</title>
    <link rel="icon" type="image/png" href="assets/icons/favicon.png">
    <link rel="apple-touch-icon" href="assets/icons/icon-192.png">
    <link rel="manifest" href="pwa/manifest.json">
    <meta name="theme-color" content="#E91E63">

    <!-- FontAwesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">

    <!-- Stylesheets -->
    <link rel="stylesheet" href="assets/css/variables.css">
    <link rel="stylesheet" href="assets/css/reset.css">
    <link rel="stylesheet" href="assets/css/style.css">
    <link rel="stylesheet" href="assets/css/auth.css">
    <link rel="stylesheet" href="assets/css/responsive.css">
</head>
<body>
    <div class="auth-wrapper">
        <div class="auth-card">
            <!-- Brand -->
            <div class="auth-brand">
                <img src="assets/images/logo.png" alt="A/N Chat" class="auth-brand-logo">
                <div class="auth-brand-title">A/N Chat</div>
                <div class="auth-brand-tagline">Connect. Chat. Call. Share.</div>
            </div>

            <div class="auth-title">Create your account 💗</div>
            <div class="auth-subtitle">Join A/N Chat and start connecting with your contacts.</div>

            <!-- Registration Form -->
            <form id="registerForm" enctype="multipart/form-data">
                <!-- Avatar Upload -->
                <div class="avatar-upload-box">
                    <label for="regAvatarInput" class="avatar-upload-preview" title="Click to upload profile photo">
                        <img id="regAvatarPreview" src="assets/images/default-avatar.png" alt="Profile Preview" style="width:100%;height:100%;object-fit:cover;">
                        <span style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.45);color:#fff;font-size:11px;padding:3px 0;text-align:center;"><i class="fas fa-camera"></i></span>
                    </label>
                    <span class="avatar-upload-hint">Upload profile photo (optional)</span>
                    <input type="file" id="regAvatarInput" name="profile_image" accept="image/jpeg,image/png,image/webp" style="display:none;">
                </div>

                <div class="form-group">
                    <label class="form-label" for="regFullname">Full Name</label>
                    <div class="input-icon-wrapper">
                        <i class="fas fa-user"></i>
                        <input type="text" id="regFullname" name="fullname" class="form-control" placeholder="e.g. Anas Abdiwahid" required autocomplete="name">
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label" for="regPhone">Phone Number</label>
                    <div class="input-icon-wrapper">
                        <i class="fas fa-phone-alt"></i>
                        <input type="tel" id="regPhone" name="phone" class="form-control" placeholder="e.g. 7766554499" required autocomplete="tel">
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label" for="regPassword">Password</label>
                    <div class="input-icon-wrapper">
                        <i class="fas fa-lock"></i>
                        <input type="password" id="regPassword" name="password" class="form-control" placeholder="••••••••" required autocomplete="new-password">
                        <button type="button" class="toggle-password" data-target="regPassword" title="Show/Hide Password">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label" for="regConfirmPassword">Confirm Password</label>
                    <div class="input-icon-wrapper">
                        <i class="fas fa-lock"></i>
                        <input type="password" id="regConfirmPassword" name="confirm_password" class="form-control" placeholder="••••••••" required autocomplete="new-password">
                        <button type="button" class="toggle-password" data-target="regConfirmPassword" title="Show/Hide Password">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>

                <button type="submit" id="regSubmitBtn" class="btn btn-primary" style="width:100%;margin-top:14px;padding:12px;">
                    <i class="fas fa-user-plus"></i> Create Account
                </button>
            </form>

            <div class="auth-footer">
                Already have an account? <a href="login.php">Login</a>
            </div>
        </div>
    </div>

    <!-- Toast container -->
    <div id="toast-container"></div>

    <!-- Scripts -->
    <script src="assets/js/auth.js"></script>
    <script src="assets/js/pwa.js"></script>
</body>
</html>

