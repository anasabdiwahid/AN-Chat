<?php
// index.php - A/N Chat Landing Page
require_once __DIR__ . '/config/config.php';

// If already logged in, redirect to dashboard
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
    <title>A/N Chat — Connect. Chat. Call. Share.</title>
    <link rel="icon" type="image/png" href="assets/icons/favicon.png">
    <link rel="manifest" href="pwa/manifest.json">
    <meta name="theme-color" content="#E91E63">

    <!-- FontAwesome for Icons -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">

    <!-- Stylesheets -->
    <link rel="stylesheet" href="assets/css/variables.css">
    <link rel="stylesheet" href="assets/css/reset.css">
    <link rel="stylesheet" href="assets/css/style.css">
    <link rel="stylesheet" href="assets/css/auth.css">
    <link rel="stylesheet" href="assets/css/responsive.css">
</head>
<body>
    <!-- Header -->
    <header class="landing-header">
        <div style="display:flex;align-items:center;gap:12px;">
            <img src="assets/images/logo.png" alt="A/N Chat Logo" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid var(--primary);">
            <div style="font-size:20px;font-weight:800;color:var(--primary);letter-spacing:-0.5px;">A/N Chat</div>
        </div>
        <div style="display:flex;align-items:center;gap:14px;">
            <button id="btnInstallApp" class="btn btn-outline btn-sm" style="display:none;">
                <i class="fas fa-mobile-alt"></i> Install App
            </button>
            <a href="login.php" class="btn btn-outline btn-sm">Login</a>
            <a href="register.php" class="btn btn-primary btn-sm">Get Started</a>
        </div>
    </header>

    <!-- Hero Section -->
    <section class="landing-hero">
        <div class="landing-badge">
            <i class="fas fa-sparkles"></i> Next Generation Communication
        </div>
        <h1>Connect. Chat. Call. <span>Share.</span></h1>
        <p>Stay connected with the people who matter. Chat in real time, share files, send voice messages, and connect seamlessly through crystal-clear voice and video calls.</p>
        <div class="landing-cta">
            <a href="register.php" class="btn btn-primary" style="padding:14px 28px;font-size:16px;">
                <i class="fas fa-arrow-right"></i> Get Started Free
            </a>
            <a href="login.php" class="btn btn-secondary" style="padding:14px 28px;font-size:16px;">
                <i class="fas fa-sign-in-alt"></i> Login with Phone
            </a>
        </div>
    </section>

    <!-- Features Section -->
    <section class="landing-features">
        <div style="text-align:center;margin-bottom:48px;">
            <h2 style="font-size:32px;font-weight:800;color:var(--text-primary);margin-bottom:10px;">Everything you need to stay in touch</h2>
            <p style="color:var(--text-secondary);font-size:16px;">Built with high-performance real-time technology, beautiful modern pink aesthetic, and privacy.</p>
        </div>

        <div class="landing-features-grid">
            <div class="feature-card">
                <div class="feature-card-icon"><i class="fas fa-comments"></i></div>
                <h3>💬 Real-Time Chat</h3>
                <p>Chat instantly with your friends with instant WebSocket delivery, typing indicators, and read receipts.</p>
            </div>

            <div class="feature-card">
                <div class="feature-card-icon"><i class="fas fa-phone-alt"></i></div>
                <h3>📞 Voice Calls</h3>
                <p>Make crisp, low-latency WebRTC voice calls directly inside your browser or mobile phone.</p>
            </div>

            <div class="feature-card">
                <div class="feature-card-icon"><i class="fas fa-video"></i></div>
                <h3>🎥 Video Calls</h3>
                <p>Connect face-to-face with high-definition peer-to-peer WebRTC video calling.</p>
            </div>

            <div class="feature-card">
                <div class="feature-card-icon"><i class="fas fa-folder-open"></i></div>
                <h3>📁 File Sharing</h3>
                <p>Send images with previews, high-definition videos, PDFs, office documents, and recorded voice notes.</p>
            </div>

            <div class="feature-card">
                <div class="feature-card-icon"><i class="fas fa-user-friends"></i></div>
                <h3>👥 Friends</h3>
                <p>Find friends effortlessly using their registered phone number, send requests, and accept connections.</p>
            </div>

            <div class="feature-card">
                <div class="feature-card-icon"><i class="fas fa-shield-alt"></i></div>
                <h3>🔒 Secure & Private</h3>
                <p>Protect user accounts with bcrypt hashing, PDO prepared statements, and privacy controls.</p>
            </div>
        </div>
    </section>

    <!-- Footer -->
    <footer style="text-align:center;padding:30px 20px;border-top:1px solid var(--border);color:var(--text-secondary);font-size:13px;background:var(--surface);">
        <p>&copy; <?= date('Y') ?> <strong>A/N Chat</strong>. Connect. Chat. Call. Share. All rights reserved.</p>
    </footer>

    <!-- PWA Script -->
    <script src="assets/js/pwa.js"></script>
</body>
</html>

