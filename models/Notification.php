<?php
// models/Notification.php - Notification Model

require_once __DIR__ . '/../config/database.php';

class Notification {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    public function create(int $userId, ?int $senderId, string $type, string $message, ?int $referenceId = null): int {
        // Prevent notifying self
        if ($userId === $senderId) {
            return 0;
        }

        $stmt = $this->db->prepare("
            INSERT INTO notifications (user_id, sender_id, type, message, reference_id, is_read, created_at)
            VALUES (:uid, :sid, :type, :msg, :ref, 0, NOW())
        ");
        $stmt->execute([
            ':uid'  => $userId,
            ':sid'  => $senderId,
            ':type' => $type,
            ':msg'  => $message,
            ':ref'  => $referenceId
        ]);

        return (int)$this->db->lastInsertId();
    }

    public function getList(int $userId, int $limit = 30): array {
        $stmt = $this->db->prepare("
            SELECT n.id, n.user_id, n.sender_id, n.type, n.message, n.reference_id, n.is_read, n.created_at,
                   u.fullname AS sender_name, u.profile_image AS sender_image, u.phone AS sender_phone
            FROM notifications n
            LEFT JOIN users u ON n.sender_id = u.id
            WHERE n.user_id = :uid
            ORDER BY n.is_read ASC, n.id DESC
            LIMIT :lim
        ");
        $stmt->bindValue(':uid', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function getUnreadCount(int $userId): int {
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM notifications WHERE user_id = :uid AND is_read = 0");
        $stmt->execute([':uid' => $userId]);
        return (int)$stmt->fetchColumn();
    }

    public function markAsRead(int $notificationId, int $userId): bool {
        $stmt = $this->db->prepare("UPDATE notifications SET is_read = 1 WHERE id = :id AND user_id = :uid");
        return $stmt->execute([':id' => $notificationId, ':uid' => $userId]);
    }

    public function markAllAsRead(int $userId): bool {
        $stmt = $this->db->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = :uid");
        return $stmt->execute([':uid' => $userId]);
    }
}
