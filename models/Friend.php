<?php
// models/Friend.php - Friend & Friend Requests Model

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/Notification.php';

class Friend {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    public function sendRequest(int $senderId, int $receiverId): array {
        if ($senderId === $receiverId) {
            return ['success' => false, 'message' => 'You cannot send a friend request to yourself.'];
        }

        // Check if users exist
        $stmtCheck = $this->db->prepare("SELECT id, fullname FROM users WHERE id = :id");
        $stmtCheck->execute([':id' => $receiverId]);
        $targetUser = $stmtCheck->fetch();
        if (!$targetUser) {
            return ['success' => false, 'message' => 'User not found.'];
        }

        // Check if blocked
        $stmtBlocked = $this->db->prepare("
            SELECT COUNT(*) FROM blocked_users 
            WHERE (user_id = :s AND blocked_user_id = :r) OR (user_id = :r2 AND blocked_user_id = :s2)
        ");
        $stmtBlocked->execute([':s' => $senderId, ':r' => $receiverId, ':r2' => $receiverId, ':s2' => $senderId]);
        if ($stmtBlocked->fetchColumn() > 0) {
            return ['success' => false, 'message' => 'Unable to send friend request to this user.'];
        }

        // Check if already friends
        if ($this->areFriends($senderId, $receiverId)) {
            return ['success' => false, 'message' => 'You are already friends with this user.'];
        }

        // Check existing pending request
        $stmtExisting = $this->db->prepare("
            SELECT id, status, sender_id FROM friend_requests 
            WHERE (sender_id = :s AND receiver_id = :r) OR (sender_id = :r2 AND receiver_id = :s2)
            ORDER BY id DESC LIMIT 1
        ");
        $stmtExisting->execute([':s' => $senderId, ':r' => $receiverId, ':r2' => $receiverId, ':s2' => $senderId]);
        $existing = $stmtExisting->fetch();

        if ($existing) {
            if ($existing['status'] === 'pending') {
                if ((int)$existing['sender_id'] === $senderId) {
                    return ['success' => false, 'message' => 'Friend request is already pending.'];
                } else {
                    // Receiver sent request previously, auto-accept it!
                    return $this->acceptRequest((int)$existing['id'], $senderId);
                }
            } else {
                // Re-open rejected request
                $stmtUpdate = $this->db->prepare("
                    UPDATE friend_requests 
                    SET sender_id = :s, receiver_id = :r, status = 'pending', updated_at = NOW() 
                    WHERE id = :id
                ");
                $stmtUpdate->execute([':s' => $senderId, ':r' => $receiverId, ':id' => $existing['id']]);
                
                // Create Notification
                $notif = new Notification();
                $notif->create($receiverId, $senderId, 'friend_request', 'sent you a friend request.', (int)$existing['id']);

                return ['success' => true, 'message' => 'Friend request sent successfully.'];
            }
        }

        // Insert new request
        $stmt = $this->db->prepare("
            INSERT INTO friend_requests (sender_id, receiver_id, status)
            VALUES (:s, :r, 'pending')
        ");
        $stmt->execute([':s' => $senderId, ':r' => $receiverId]);
        $reqId = (int)$this->db->lastInsertId();

        // Create Notification
        $notif = new Notification();
        $notif->create($receiverId, $senderId, 'friend_request', 'sent you a friend request.', $reqId);

        return ['success' => true, 'message' => 'Friend request sent successfully.'];
    }

    public function acceptRequest(int $requestId, int $currentUserId): array {
        $stmt = $this->db->prepare("SELECT * FROM friend_requests WHERE id = :id AND receiver_id = :uid LIMIT 1");
        $stmt->execute([':id' => $requestId, ':uid' => $currentUserId]);
        $req = $stmt->fetch();

        if (!$req) {
            return ['success' => false, 'message' => 'Friend request not found or not authorized.'];
        }

        if ($req['status'] === 'accepted') {
            return ['success' => true, 'message' => 'Request already accepted.'];
        }

        $senderId = (int)$req['sender_id'];
        $receiverId = (int)$req['receiver_id'];

        // Begin transaction
        $this->db->beginTransaction();
        try {
            // Update request status
            $stmtUp = $this->db->prepare("UPDATE friend_requests SET status = 'accepted', updated_at = NOW() WHERE id = :id");
            $stmtUp->execute([':id' => $requestId]);

            // Insert friendships (both directions for fast queries)
            $stmtF1 = $this->db->prepare("INSERT IGNORE INTO friendships (user_id, friend_id) VALUES (:u, :f)");
            $stmtF1->execute([':u' => $senderId, ':f' => $receiverId]);

            $stmtF2 = $this->db->prepare("INSERT IGNORE INTO friendships (user_id, friend_id) VALUES (:u, :f)");
            $stmtF2->execute([':u' => $receiverId, ':f' => $senderId]);

            // Notify sender that request was accepted
            $notif = new Notification();
            $notif->create($senderId, $receiverId, 'friend_accepted', 'accepted your friend request.', $requestId);

            $this->db->commit();
            return ['success' => true, 'message' => 'Friend request accepted!'];
        } catch (Exception $e) {
            $this->db->rollBack();
            return ['success' => false, 'message' => 'Failed to accept request: ' . $e->getMessage()];
        }
    }

    public function rejectRequest(int $requestId, int $currentUserId): array {
        $stmt = $this->db->prepare("
            UPDATE friend_requests SET status = 'rejected', updated_at = NOW() 
            WHERE id = :id AND receiver_id = :uid
        ");
        $stmt->execute([':id' => $requestId, ':uid' => $currentUserId]);

        if ($stmt->rowCount() > 0) {
            return ['success' => true, 'message' => 'Friend request rejected.'];
        }
        return ['success' => false, 'message' => 'Request not found or not authorized.'];
    }

    public function areFriends(int $userA, int $userB): bool {
        $stmt = $this->db->prepare("
            SELECT COUNT(*) FROM friendships 
            WHERE (user_id = :u1 AND friend_id = :u2) OR (user_id = :u3 AND friend_id = :u4)
        ");
        $stmt->execute([':u1' => $userA, ':u2' => $userB, ':u3' => $userB, ':u4' => $userA]);
        return (int)$stmt->fetchColumn() > 0;
    }

    public function getFriendsList(int $userId): array {
        $stmt = $this->db->prepare("
            SELECT u.id, u.fullname, u.phone, u.profile_image, u.bio, u.status, u.last_seen,
                   f.created_at AS friendship_date,
                   (
                       SELECT m.message 
                       FROM messages m 
                       WHERE (m.sender_id = :uid1 AND m.receiver_id = u.id) 
                          OR (m.sender_id = u.id AND m.receiver_id = :uid2)
                       ORDER BY m.id DESC LIMIT 1
                   ) AS last_message,
                   (
                       SELECT m.message_type 
                       FROM messages m 
                       WHERE (m.sender_id = :uid3 AND m.receiver_id = u.id) 
                          OR (m.sender_id = u.id AND m.receiver_id = :uid4)
                       ORDER BY m.id DESC LIMIT 1
                   ) AS last_message_type,
                   (
                       SELECT m.created_at 
                       FROM messages m 
                       WHERE (m.sender_id = :uid5 AND m.receiver_id = u.id) 
                          OR (m.sender_id = u.id AND m.receiver_id = :uid6)
                       ORDER BY m.id DESC LIMIT 1
                   ) AS last_message_time,
                   (
                       SELECT COUNT(*) 
                       FROM messages m 
                       WHERE m.sender_id = u.id AND m.receiver_id = :uid7 AND m.is_read = 0
                   ) AS unread_count
            FROM friendships f
            JOIN users u ON f.friend_id = u.id
            WHERE f.user_id = :uid8
            ORDER BY COALESCE(last_message_time, f.created_at) DESC
        ");

        $stmt->execute([
            ':uid1' => $userId,
            ':uid2' => $userId,
            ':uid3' => $userId,
            ':uid4' => $userId,
            ':uid5' => $userId,
            ':uid6' => $userId,
            ':uid7' => $userId,
            ':uid8' => $userId
        ]);

        return $stmt->fetchAll();
    }

    public function getPendingRequests(int $userId): array {
        $stmt = $this->db->prepare("
            SELECT fr.id, fr.sender_id, fr.receiver_id, fr.status, fr.created_at,
                   u.fullname, u.phone, u.profile_image, u.bio
            FROM friend_requests fr
            JOIN users u ON fr.sender_id = u.id
            WHERE fr.receiver_id = :uid AND fr.status = 'pending'
            ORDER BY fr.id DESC
        ");
        $stmt->execute([':uid' => $userId]);
        return $stmt->fetchAll();
    }
}

