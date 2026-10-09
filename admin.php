<?php
// admin.php - A/N Chat Master Administration Portal
require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/models/User.php';
require_once __DIR__ . '/models/SystemSetting.php';

if (empty($_SESSION['user_id'])) {
    header('Location: login.php');
    exit;
}

$userModel = new User();
$currentAdmin = $userModel->findById((int)$_SESSION['user_id']);

if (!$currentAdmin || empty($currentAdmin['is_admin'])) {
    // Non-admin user trying to access admin panel -> redirect to chat dashboard
    header('Location: dashboard.php');
    exit;
}

$settingModel = new SystemSetting();
$screenshotEnabled = $settingModel->isScreenshotDetectionEnabled();
$stats = $userModel->getAdminStats();

$adminAvatar = $currentAdmin['profile_image'] ? 
    (str_starts_with($currentAdmin['profile_image'], 'http') || str_starts_with($currentAdmin['profile_image'], 'assets/') || str_starts_with($currentAdmin['profile_image'], 'uploads/')
        ? $currentAdmin['profile_image'] 
        : 'uploads/images/' . $currentAdmin['profile_image']) : 
    'assets/images/default-avatar.png';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Portal — A/N Chat</title>
    <link rel="icon" type="image/png" href="assets/icons/favicon.png">
    <link rel="apple-touch-icon" href="assets/icons/icon-192.png">
    <meta name="theme-color" content="#E91E63">

    <!-- FontAwesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">

    <!-- Stylesheets -->
    <link rel="stylesheet" href="assets/css/variables.css">
    <link rel="stylesheet" href="assets/css/reset.css">
    <link rel="stylesheet" href="assets/css/style.css">
    <link rel="stylesheet" href="assets/css/admin.css">
</head>
<body class="admin-body">

    <!-- Admin Top Navbar -->
    <header class="admin-navbar">
        <a href="admin.php" class="admin-brand">
            <img src="assets/images/logo.png" alt="A/N Chat">
            <div class="admin-brand-title">
                <span>A/N Chat</span>
                <span class="admin-brand-badge">Admin Portal</span>
            </div>
        </a>

        <div class="admin-nav-actions">
            <button class="btn btn-outline btn-sm" id="btnAdminToggleTheme" title="Toggle Theme">
                <i class="fas fa-moon"></i>
            </button>
            <a href="dashboard.php" class="btn btn-primary btn-sm" title="Back to Chat Application">
                <i class="fas fa-comments"></i> Back to Chats
            </a>
            <div style="display:flex;align-items:center;gap:8px;padding-left:8px;border-left:1px solid var(--border);">
                <img src="<?= htmlspecialchars($adminAvatar) ?>" alt="<?= htmlspecialchars($currentAdmin['fullname']) ?>" style="width:34px;height:34px;border-radius:50%;object-fit:cover;border:2px solid var(--primary);" onerror="this.src='assets/images/default-avatar.png'">
                <span style="font-size:13px;font-weight:700;display:none;@media(min-width:600px){display:inline;}"><?= htmlspecialchars($currentAdmin['fullname']) ?></span>
            </div>
        </div>
    </header>

    <!-- Main Container -->
    <main class="admin-container">

        <!-- 1. Platform Analytics Cards -->
        <section class="admin-stats-grid">
            <div class="stat-card">
                <div class="stat-icon pink"><i class="fas fa-users"></i></div>
                <div>
                    <div class="stat-value" id="statTotalUsers"><?= $stats['total_users'] ?></div>
                    <div class="stat-label">Registered Users</div>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon green"><i class="fas fa-signal"></i></div>
                <div>
                    <div class="stat-value" id="statOnlineUsers"><?= $stats['online_users'] ?></div>
                    <div class="stat-label">Online Users</div>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon purple"><i class="fas fa-user-friends"></i></div>
                <div>
                    <div class="stat-value" id="statFriendships"><?= $stats['total_friendships'] ?></div>
                    <div class="stat-label">Friend Connections</div>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon blue"><i class="fas fa-comment-dots"></i></div>
                <div>
                    <div class="stat-value" id="statMessages"><?= $stats['total_messages'] ?></div>
                    <div class="stat-label">Total Messages</div>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon amber"><i class="fas fa-phone-alt"></i></div>
                <div>
                    <div class="stat-value" id="statCalls"><?= $stats['total_calls'] ?></div>
                    <div class="stat-label">Total Calls</div>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon red"><i class="fas fa-camera"></i></div>
                <div>
                    <div class="stat-value" id="statScreenshots"><?= $stats['total_screenshots'] ?></div>
                    <div class="stat-label">Screenshot Alerts</div>
                </div>
            </div>
        </section>

        <!-- 2. Privacy & Security Feature Control (Screenshot Detection Toggle) -->
        <section class="feature-control-card">
            <div class="feature-info">
                <div class="feature-icon-badge">
                    <i class="fas fa-shield-alt"></i>
                </div>
                <div>
                    <div class="feature-title">
                        <span>Real-Time Screenshot & Screen Recording Detection</span>
                        <span id="featureStatusBadge" class="role-badge <?= $screenshotEnabled ? 'admin' : 'user' ?>">
                            <i class="fas <?= $screenshotEnabled ? 'fa-shield-alt' : 'fa-ban' ?>"></i> <?= $screenshotEnabled ? 'Active' : 'Disabled' ?>
                        </span>
                    </div>
                    <p class="feature-desc">
                        When enabled, whenever a user takes a screenshot (<kbd>PrintScreen</kbd>, <kbd>Win+Shift+S</kbd>, Snipping Tool, Mac shortcuts) or records their screen during a conversation, the other participant immediately receives a real-time alert inside the chat: <em>"⚠️ [User] took a screenshot of this conversation."</em> As an Admin, you can toggle this feature ON or OFF globally at any time.
                    </p>
                </div>
            </div>

            <div class="feature-toggle-wrapper">
                <span class="feature-status-pill <?= $screenshotEnabled ? 'active' : 'disabled' ?>" id="featureStatusPill">
                    <?= $screenshotEnabled ? 'Active (ON)' : 'Disabled (OFF)' ?>
                </span>
                <label class="switch" title="Toggle Screenshot Detection">
                    <input type="checkbox" id="screenshotToggleInput" <?= $screenshotEnabled ? 'checked' : '' ?>>
                    <span class="slider"></span>
                </label>
            </div>
        </section>

        <!-- 3. Navigation Tabs -->
        <nav class="admin-tabs">
            <button class="admin-tab-btn active" data-tab="tabUsers">
                <i class="fas fa-users"></i> All Users (<span id="tabUserCount"><?= $stats['total_users'] ?></span>)
            </button>
            <button class="admin-tab-btn" data-tab="tabFriendships">
                <i class="fas fa-user-friends"></i> Friendships & Connections (<span id="tabFriendCount"><?= $stats['total_friendships'] ?></span>)
            </button>
            <button class="admin-tab-btn" data-tab="tabScreenshots">
                <i class="fas fa-camera"></i> Screenshot & Recording Logs
            </button>
        </nav>

        <!-- TAB 1: ALL USERS DIRECTORY -->
        <div class="admin-tab-pane active" id="tabUsers">
            <div class="admin-card">
                <div class="admin-card-header">
                    <div class="admin-card-title">
                        <i class="fas fa-users" style="color:var(--primary);"></i> Registered Users Directory
                    </div>
                    <div class="admin-search-box">
                        <i class="fas fa-search" style="color:var(--text-muted);"></i>
                        <input type="text" id="adminSearchUsers" placeholder="Search by name or phone...">
                    </div>
                </div>
                <div class="admin-table-wrapper">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>User</th>
                                <th>Phone Number</th>
                                <th>Status</th>
                                <th>Friends</th>
                                <th>Messages</th>
                                <th>Role</th>
                                <th>Admin Actions</th>
                            </tr>
                        </thead>
                        <tbody id="usersTableBody">
                            <tr><td colspan="8" style="text-align:center;padding:30px;"><div class="spinner"></div></td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- TAB 2: FRIENDSHIPS & CONNECTIONS -->
        <div class="admin-tab-pane" id="tabFriendships">
            <div class="admin-card">
                <div class="admin-card-header">
                    <div class="admin-card-title">
                        <i class="fas fa-user-friends" style="color:var(--primary);"></i> Mutual Friendships Network
                    </div>
                    <div class="admin-search-box">
                        <i class="fas fa-search" style="color:var(--text-muted);"></i>
                        <input type="text" id="adminSearchFriends" placeholder="Search friends by name or phone...">
                    </div>
                </div>
                <div class="admin-table-wrapper">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Friendship Connection</th>
                                <th>Messages Exchanged</th>
                                <th>Connection Status</th>
                                <th>Connected Date</th>
                            </tr>
                        </thead>
                        <tbody id="friendshipsTableBody">
                            <tr><td colspan="5" style="text-align:center;padding:30px;"><div class="spinner"></div></td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- TAB 3: SCREENSHOT & RECORDING LOGS -->
        <div class="admin-tab-pane" id="tabScreenshots">
            <div class="admin-card">
                <div class="admin-card-header">
                    <div class="admin-card-title">
                        <i class="fas fa-shield-alt" style="color:var(--primary);"></i> Live Screenshot & Screen Recording Events
                    </div>
                    <button class="btn btn-outline btn-sm" onclick="loadScreenshotLogs()">
                        <i class="fas fa-sync-alt"></i> Refresh Logs
                    </button>
                </div>
                <div class="admin-table-wrapper">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>Log ID</th>
                                <th>Action Type</th>
                                <th>User (Who Took Screenshot)</th>
                                <th>Target User (In Chat With)</th>
                                <th>Timestamp</th>
                            </tr>
                        </thead>
                        <tbody id="screenshotLogsTableBody">
                            <tr><td colspan="5" style="text-align:center;padding:30px;"><div class="spinner"></div></td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

    </main>

    <!-- Admin Toast Container -->
    <div id="adminToastContainer" id="toast-container"></div>

    <script>
        window.CURRENT_USER = <?= json_encode([
            'id' => (int)$currentAdmin['id'],
            'fullname' => $currentAdmin['fullname'],
            'phone' => $currentAdmin['phone'],
            'is_admin' => 1
        ], JSON_UNESCAPED_SLASHES) ?>;
        window.ADMIN_CSRF_TOKEN = <?= json_encode(getCsrfToken(), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    </script>
    <script src="assets/js/admin.js"></script>
</body>
</html>
