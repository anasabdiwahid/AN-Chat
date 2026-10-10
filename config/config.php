<?php
// config/config.php - Global Application Configuration

// Set timezone to Africa/Mogadishu (UTC+3)
date_default_timezone_set('Africa/Mogadishu');

// Start secure session if not already started
if (session_status() === PHP_SESSION_NONE) {
    // Set secure cookie parameters
    $isSecure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    session_set_cookie_params([
        'lifetime' => 86400 * 30, // 30 days
        'path' => '/',
        'domain' => '',
        'secure' => $isSecure,
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
    session_start();
}

// Application Info
define('APP_NAME', 'A/N Chat');
define('APP_TAGLINE', 'Connect. Chat. Call. Share.');
define('APP_VERSION', '1.0.0');

// Detect Base URL dynamically for portability across local XAMPP and live hosting (InfinityFree)
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https://' : 'http://';
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
$scriptName = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '');

// If running in /chats/ subdirectory (like local XAMPP), include /chats; otherwise root
$baseFolder = '';
if (strpos($scriptName, '/chats/') !== false || strpos($scriptName, '/chats') === 0) {
    $baseFolder = '/chats';
}
define('BASE_URL', rtrim($protocol . $host . $baseFolder, '/'));
define('BASE_PATH', dirname(__DIR__));

// Upload Configurations
define('UPLOAD_DIR', BASE_PATH . '/uploads/');
define('UPLOAD_URL', BASE_URL . '/uploads/');
define('MAX_FILE_SIZE_MB', 50); // 50MB max file size
define('MAX_FILE_SIZE_BYTES', MAX_FILE_SIZE_MB * 1024 * 1024);

// Allowed MIME types
define('ALLOWED_IMAGE_TYPES', ['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
define('ALLOWED_VIDEO_TYPES', ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']);
define('ALLOWED_VOICE_TYPES', ['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/mp4']);
define('ALLOWED_DOC_TYPES', [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
]);

// WebRTC STUN / TURN Configuration
define('ICE_SERVERS', [
    ['urls' => [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun.cloudflare.com:3478',
        'stun:openrelay.metered.ca:80'
    ]],
    [
        'urls' => [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp',
            'turns:openrelay.metered.ca:443?transport=tcp'
        ],
        'username' => 'openrelayproject',
        'credential' => 'openrelayproject'
    ]
]);

// Optional Metered Open Relay integration. Create a credential in Metered,
// then use its credential-scoped API key here (never use the account Secret Key).
// Leave empty until a Metered account/key has been created.
define('METERED_APP_NAME', '');
define('METERED_TURN_API_KEY', '');

// WebSocket Configuration
// WebSocket runs on port 8085
define('WS_HOST', 'localhost');
define('WS_PORT', 8085);
define('WS_URL', 'ws://' . (isset($_SERVER['HTTP_HOST']) ? explode(':', $_SERVER['HTTP_HOST'])[0] : 'localhost') . ':8085');

// Response Helper Functions
function jsonResponse(bool $success, string $message = '', mixed $data = null, int $statusCode = 200): void {
    if (!headers_sent()) {
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data'    => $data
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// Authentication Check Helper
function requireAuth(): array {
    if (empty($_SESSION['user_id'])) {
        jsonResponse(false, 'Unauthorized. Please log in.', null, 401);
    }
    $auth = [
        'id' => (int)$_SESSION['user_id'],
        'fullname' => $_SESSION['fullname'] ?? '',
        'phone' => $_SESSION['phone'] ?? '',
        'profile_image' => $_SESSION['profile_image'] ?? null,
        'is_admin' => (int)($_SESSION['is_admin'] ?? 0)
    ];

    if (defined('API_REQUEST') && session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }

    return $auth;
}

// Admin Authorization Check Helper
function requireAdmin(): array {
    $user = requireAuth();
    require_once __DIR__ . '/../models/User.php';
    $userModel = new User();
    $userData = $userModel->findById($user['id']);
    if (!$userData || empty($userData['is_admin'])) {
        jsonResponse(false, 'Forbidden. Admin privileges required.', null, 403);
    }
    return $userData;
}

// CSRF Token Helper
function getCsrfToken(): string {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function verifyCsrfToken(?string $token): bool {
    if (empty($_SESSION['csrf_token']) || empty($token)) {
        return false;
    }
    return hash_equals($_SESSION['csrf_token'], $token);
}

// XSS Sanitizer
function cleanInput(string $data): string {
    return htmlspecialchars(trim($data), ENT_QUOTES, 'UTF-8');
}
