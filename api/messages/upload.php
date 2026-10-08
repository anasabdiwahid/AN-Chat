<?php
// api/messages/upload.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/User.php';

$currentUser = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(false, 'Invalid request method.', null, 405);
}

if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    jsonResponse(false, 'No valid file uploaded.');
}

$file = $_FILES['file'];
$fileTypeCategory = $_POST['type'] ?? 'document'; // 'image', 'video', 'document', 'voice'

// Max size check
if ($file['size'] > MAX_FILE_SIZE_BYTES) {
    jsonResponse(false, 'File exceeds maximum limit of ' . MAX_FILE_SIZE_MB . 'MB.');
}

// Dangerous extensions blacklist
$originalName = basename($file['name']);
$ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
$dangerousExts = ['php', 'phtml', 'php3', 'php4', 'php5', 'php7', 'phps', 'exe', 'bat', 'cmd', 'sh', 'bash', 'js', 'jar', 'vbs', 'ps1', 'cgi', 'pl', 'htaccess'];

if (in_array($ext, $dangerousExts)) {
    jsonResponse(false, 'Dangerous or executable file types are strictly prohibited.');
}

// Verify actual MIME type using finfo
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($file['tmp_name']);

$subDir = 'documents/';
$detectedType = 'document';

if (str_starts_with($mime, 'image/') && in_array($mime, ALLOWED_IMAGE_TYPES)) {
    $subDir = 'images/';
    $detectedType = 'image';
} elseif (str_starts_with($mime, 'video/') && in_array($mime, ALLOWED_VIDEO_TYPES)) {
    $subDir = 'videos/';
    $detectedType = 'video';
} elseif (str_starts_with($mime, 'audio/') || in_array($mime, ALLOWED_VOICE_TYPES) || $fileTypeCategory === 'voice') {
    $subDir = 'voice/';
    $detectedType = 'voice';
    if (empty($ext) || $ext === 'tmp') $ext = 'webm';
} else {
    // Validate Document MIME
    if (!in_array($mime, ALLOWED_DOC_TYPES) && !in_array($ext, ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'])) {
        jsonResponse(false, 'Unsupported file type (' . htmlspecialchars($mime) . ').');
    }
    $subDir = 'documents/';
    $detectedType = 'document';
}

// Format human file size
function formatBytes($bytes, $precision = 1) {
    $units = ['B', 'KB', 'MB', 'GB'];
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= (1 << (10 * $pow));
    return round($bytes, $precision) . ' ' . $units[$pow];
}

$fileSizeFormatted = formatBytes($file['size']);

// Generate cryptographically unique safe filename
$uniqueName = 'an_' . bin2hex(random_bytes(10)) . '_' . time() . '.' . $ext;
$targetDir = UPLOAD_DIR . $subDir;

if (!is_dir($targetDir)) {
    mkdir($targetDir, 0755, true);
}

$targetPath = $targetDir . $uniqueName;

if (move_uploaded_file($file['tmp_name'], $targetPath)) {
    $relativeUrl = 'uploads/' . $subDir . $uniqueName;
    jsonResponse(true, 'File uploaded successfully', [
        'file_path' => $relativeUrl,
        'file_name' => $originalName,
        'file_size' => $fileSizeFormatted,
        'message_type' => $detectedType
    ]);
} else {
    jsonResponse(false, 'Failed to save uploaded file.');
}

