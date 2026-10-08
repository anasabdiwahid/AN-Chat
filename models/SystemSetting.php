<?php
// models/SystemSetting.php - System Settings Model for Administrator Controls
require_once __DIR__ . '/../config/database.php';

class SystemSetting {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    public function get(string $key, string $default = ''): string {
        $stmt = $this->db->prepare("SELECT setting_value FROM system_settings WHERE setting_key = :k LIMIT 1");
        $stmt->execute([':k' => $key]);
        $val = $stmt->fetchColumn();
        return $val !== false ? (string)$val : $default;
    }

    public function set(string $key, string $value, ?string $description = null): bool {
        $stmt = $this->db->prepare("
            INSERT INTO system_settings (setting_key, setting_value, description, updated_at)
            VALUES (:k, :v, :desc, NOW())
            ON DUPLICATE KEY UPDATE setting_value = :v2, updated_at = NOW()
        ");
        return $stmt->execute([
            ':k' => $key,
            ':v' => $value,
            ':desc' => $description,
            ':v2' => $value
        ]);
    }

    public function getAll(): array {
        $stmt = $this->db->query("SELECT * FROM system_settings ORDER BY setting_key ASC");
        $results = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $results[$row['setting_key']] = $row;
        }
        return $results;
    }

    public function isScreenshotDetectionEnabled(): bool {
        return $this->get('screenshot_detection', '1') === '1';
    }

    public function logScreenshot(int $userId, int $targetUserId, string $actionType = 'screenshot'): bool {
        $stmt = $this->db->prepare("
            INSERT INTO screenshot_logs (user_id, target_user_id, action_type, created_at)
            VALUES (:uid, :tid, :type, NOW())
        ");
        return $stmt->execute([
            ':uid' => $userId,
            ':tid' => $targetUserId,
            ':type' => in_array($actionType, ['screenshot', 'screen_recording']) ? $actionType : 'screenshot'
        ]);
    }

    public function getScreenshotLogs(int $limit = 50): array {
        $stmt = $this->db->prepare("
            SELECT sl.*, 
                   u1.fullname AS user_name, u1.phone AS user_phone, u1.profile_image AS user_avatar,
                   u2.fullname AS target_name, u2.phone AS target_phone, u2.profile_image AS target_avatar
            FROM screenshot_logs sl
            JOIN users u1 ON sl.user_id = u1.id
            JOIN users u2 ON sl.target_user_id = u2.id
            ORDER BY sl.created_at DESC
            LIMIT :lim
        ");
        $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}
