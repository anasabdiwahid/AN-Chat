<?php
// config/config.php - Global Application Configuration

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

// Detect Base URL dynamically for portability across XAMPP subdirectories
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https://' : 'http://';
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
$scriptDir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? ''));
// Normalize basePath so it points to the root of /chats/
$scriptDirParts = explode('/', trim($scriptDir, '/'));
$baseFolder = !empty($scriptDirParts[0]) ? '/' . $scriptDirParts[0] : '';
define('BASE_URL', $protocol . $host . $baseFolder);
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
    ['urls' => ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']]
    // Configurable TURN can be added via environment or array:
    // ['urls' => 'turn:turn.yourdomain.com:3478', 'username' => 'user', 'credential' => 'pass']
]);

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
    return [
        'id' => (int)$_SESSION['user_id'],
        'fullname' => $_SESSION['fullname'] ?? '',
        'phone' => $_SESSION['phone'] ?? '',
        'profile_image' => $_SESSION['profile_image'] ?? null
    ];
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
