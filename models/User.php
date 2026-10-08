<?php
// models/User.php - User Model

require_once __DIR__ . '/../config/database.php';

class User {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    public function findById(int $id): ?array {
        $stmt = $this->db->prepare("
            SELECT u.id, u.fullname, u.phone, u.profile_image, u.bio, u.status, u.last_seen, u.created_at,
                   s.theme, s.notification_sound, s.privacy_last_seen
            FROM users u
            LEFT JOIN user_settings s ON u.id = s.user_id
            WHERE u.id = :id
        ");
        $stmt->execute([':id' => $id]);
        $user = $stmt->fetch();
        return $user ?: null;
    }

    public function findByPhone(string $phone): ?array {
        $stmt = $this->db->prepare("SELECT * FROM users WHERE phone = :phone LIMIT 1");
        $stmt->execute([':phone' => $phone]);
        $user = $stmt->fetch();
        return $user ?: null;
    }

    public function register(string $fullname, string $phone, string $password, ?string $profileImage = null): array {
        // Validate uniqueness
        if ($this->findByPhone($phone)) {
            return ['success' => false, 'message' => 'This phone number is already registered.'];
        }

        $hash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $this->db->prepare("
            INSERT INTO users (fullname, phone, password, profile_image, status, last_seen)
            VALUES (:fullname, :phone, :password, :profile_image, 'online', NOW())
        ");
        $stmt->execute([
            ':fullname' => $fullname,
            ':phone' => $phone,
            ':password' => $hash,
            ':profile_image' => $profileImage
        ]);

        $userId = (int)$this->db->lastInsertId();

        // Initialize default user settings
        $stmtSettings = $this->db->prepare("
            INSERT INTO user_settings (user_id, theme, notification_sound, privacy_last_seen)
            VALUES (:user_id, 'light', 1, 'everyone')
        ");
        $stmtSettings->execute([':user_id' => $userId]);

        return ['success' => true, 'user_id' => $userId];
    }

    public function login(string $phone, string $password): array {
        $user = $this->findByPhone($phone);
        if (!$user) {
            return ['success' => false, 'message' => 'Invalid phone number or password.'];
        }

        if (!password_verify($password, $user['password'])) {
            return ['success' => false, 'message' => 'Invalid phone number or password.'];
        }

        // Update status to online
        $this->updateStatus($user['id'], 'online');

        return [
            'success' => true,
            'user' => [
                'id' => $user['id'],
                'fullname' => $user['fullname'],
                'phone' => $user['phone'],
                'profile_image' => $user['profile_image'],
                'bio' => $user['bio']
            ]
        ];
    }

    public function search(string $query, int $currentUserId): array {
        $cleanQuery = trim($query);
        // Primary search is phone, secondary is fullname
        $stmt = $this->db->prepare("
            SELECT u.id, u.fullname, u.phone, u.profile_image, u.bio, u.status, u.last_seen,
                   (SELECT COUNT(*) FROM friendships WHERE (user_id = :curr1 AND friend_id = u.id) OR (user_id = u.id AND friend_id = :curr2)) AS is_friend,
                   (SELECT status FROM friend_requests WHERE sender_id = :curr3 AND receiver_id = u.id ORDER BY id DESC LIMIT 1) AS sent_req_status,
                   (SELECT status FROM friend_requests WHERE sender_id = u.id AND receiver_id = :curr4 ORDER BY id DESC LIMIT 1) AS recv_req_status,
                   (SELECT COUNT(*) FROM blocked_users WHERE user_id = :curr5 AND blocked_user_id = u.id) AS is_blocked
            FROM users u
            WHERE u.id != :curr6 
              AND (u.phone = :exactPhone OR u.phone LIKE :phoneLike OR u.fullname LIKE :nameLike)
            ORDER BY (u.phone = :exactPhone2) DESC, u.fullname ASC
            LIMIT 20
        ");

        $stmt->execute([
            ':curr1' => $currentUserId,
            ':curr2' => $currentUserId,
            ':curr3' => $currentUserId,
            ':curr4' => $currentUserId,
            ':curr5' => $currentUserId,
            ':curr6' => $currentUserId,
            ':exactPhone' => $cleanQuery,
            ':phoneLike' => "%{$cleanQuery}%",
            ':nameLike' => "%{$cleanQuery}%",
            ':exactPhone2' => $cleanQuery
        ]);

        return $stmt->fetchAll();
    }

    public function updateProfile(int $userId, string $fullname, string $bio, ?string $profileImage = null): bool {
        if ($profileImage !== null) {
            $stmt = $this->db->prepare("UPDATE users SET fullname = :fullname, bio = :bio, profile_image = :img WHERE id = :id");
            return $stmt->execute([
                ':fullname' => $fullname,
                ':bio' => $bio,
                ':img' => $profileImage,
                ':id' => $userId
            ]);
        } else {
            $stmt = $this->db->prepare("UPDATE users SET fullname = :fullname, bio = :bio WHERE id = :id");
            return $stmt->execute([
                ':fullname' => $fullname,
                ':bio' => $bio,
                ':id' => $userId
            ]);
        }
    }

    public function updatePassword(int $userId, string $oldPassword, string $newPassword): array {
        $stmt = $this->db->prepare("SELECT password FROM users WHERE id = :id");
        $stmt->execute([':id' => $userId]);
        $user = $stmt->fetch();
        if (!$user || !password_verify($oldPassword, $user['password'])) {
            return ['success' => false, 'message' => 'Current password is incorrect.'];
        }

        $hash = password_hash($newPassword, PASSWORD_DEFAULT);
        $stmtUpdate = $this->db->prepare("UPDATE users SET password = :hash WHERE id = :id");
        $stmtUpdate->execute([':hash' => $hash, ':id' => $userId]);

        return ['success' => true, 'message' => 'Password updated successfully.'];
    }

    public function updateStatus(int $userId, string $status): void {
        $stmt = $this->db->prepare("UPDATE users SET status = :status, last_seen = NOW() WHERE id = :id");
        $stmt->execute([':status' => $status, ':id' => $userId]);
    }

    public function getSettings(int $userId): array {
        $stmt = $this->db->prepare("SELECT * FROM user_settings WHERE user_id = :user_id");
        $stmt->execute([':user_id' => $userId]);
        $settings = $stmt->fetch();
        if (!$settings) {
            return ['theme' => 'light', 'notification_sound' => 1, 'privacy_last_seen' => 'everyone'];
        }
        return $settings;
    }

    public function updateSettings(int $userId, string $theme, int $sound, string $privacy): bool {
        $stmt = $this->db->prepare("
            INSERT INTO user_settings (user_id, theme, notification_sound, privacy_last_seen)
            VALUES (:uid, :theme, :sound, :privacy)
            ON DUPLICATE KEY UPDATE theme = VALUES(theme), notification_sound = VALUES(notification_sound), privacy_last_seen = VALUES(privacy_last_seen)
        ");
        return $stmt->execute([
            ':uid' => $userId,
            ':theme' => $theme,
            ':sound' => $sound,
            ':privacy' => $privacy
        ]);
    }

    public function isBlocked(int $userA, int $userB): bool {
        $stmt = $this->db->prepare("
            SELECT COUNT(*) FROM blocked_users 
            WHERE (user_id = :u1 AND blocked_user_id = :u2) OR (user_id = :u3 AND blocked_user_id = :u4)
        ");
        $stmt->execute([':u1' => $userA, ':u2' => $userB, ':u3' => $userB, ':u4' => $userA]);
        return (int)$stmt->fetchColumn() > 0;
    }

    public function blockUser(int $userId, int $blockedUserId): bool {
        if ($userId === $blockedUserId) return false;
        $stmt = $this->db->prepare("
            INSERT IGNORE INTO blocked_users (user_id, blocked_user_id) 
            VALUES (:u, :b)
        ");
        return $stmt->execute([':u' => $userId, ':b' => $blockedUserId]);
    }

    public function unblockUser(int $userId, int $blockedUserId): bool {
        $stmt = $this->db->prepare("DELETE FROM blocked_users WHERE user_id = :u AND blocked_user_id = :b");
        return $stmt->execute([':u' => $userId, ':b' => $blockedUserId]);
    }

    public function reportUser(int $reporterId, int $reportedId, string $reason, string $details): bool {
        $stmt = $this->db->prepare("
            INSERT INTO reports (reporter_id, reported_user_id, reason, details)
            VALUES (:rep, :tar, :reason, :details)
        ");
        return $stmt->execute([
            ':rep' => $reporterId,
            ':tar' => $reportedId,
            ':reason' => $reason,
            ':details' => $details
        ]);
    }
}
