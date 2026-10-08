<?php
// login.php - Login Screen
require_once __DIR__ . '/config/config.php';

if (!empty($_SESSION['user_id'])) {
    header('Location: dashboard.php');
    exit;
}

$registered = !empty($_GET['registered']);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login — A/N Chat</title>
    <link rel="icon" type="image/png" href="assets/icons/favicon.png">
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

            <div class="auth-title">Welcome Back 👋</div>
            <div class="auth-subtitle">Log in using your registered phone number.</div>

            <?php if ($registered): ?>
                <div style="background:var(--primary-light);color:var(--primary);padding:12px 14px;border-radius:var(--radius-md);font-size:13px;font-weight:600;margin-bottom:18px;">
                    <i class="fas fa-check-circle"></i> Account created successfully! Please log in below.
                </div>
            <?php endif; ?>

            <!-- Login Form -->
            <form id="loginForm">
                <div class="form-group">
                    <label class="form-label" for="loginPhone">Phone Number</label>
                    <div class="input-icon-wrapper">
                        <i class="fas fa-phone-alt"></i>
                        <input type="tel" id="loginPhone" name="phone" class="form-control" placeholder="e.g. 7766554499" required autocomplete="tel">
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label" for="loginPassword">Password</label>
                    <div class="input-icon-wrapper">
                        <i class="fas fa-lock"></i>
                        <input type="password" id="loginPassword" name="password" class="form-control" placeholder="••••••••" required autocomplete="current-password">
                        <button type="button" class="toggle-password" data-target="loginPassword" title="Show/Hide Password">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>

                <button type="submit" id="loginSubmitBtn" class="btn btn-primary" style="width:100%;margin-top:12px;padding:12px;">
                    <i class="fas fa-sign-in-alt"></i> Login
                </button>
            </form>

            <div class="auth-footer">
                Don't have an account? <a href="register.php">Create Account</a>
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

