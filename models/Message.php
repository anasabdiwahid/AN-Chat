<?php
// models/Message.php - Messaging and Media Model

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/User.php';
require_once __DIR__ . '/Notification.php';

class Message {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    public function send(
        int $senderId,
        int $receiverId,
        ?string $message,
        string $messageType = 'text',
        ?string $filePath = null,
        ?string $fileName = null,
        ?string $fileSize = null,
        ?int $replyToId = null
    ): array {
        // Block check
        $userModel = new User();
        if ($userModel->isBlocked($senderId, $receiverId)) {
            return ['success' => false, 'message' => 'Unable to send message to this user (blocked).'];
        }

        $stmt = $this->db->prepare("
            INSERT INTO messages (
                sender_id, receiver_id, message, message_type,
                file_path, file_name, file_size, reply_to_id,
                is_delivered, is_read, created_at
            ) VALUES (
                :sid, :rid, :msg, :mtype,
                :fpath, :fname, :fsize, :reply,
                1, 0, NOW()
            )
        ");

        $stmt->execute([
            ':sid'   => $senderId,
            ':rid'   => $receiverId,
            ':msg'   => $message,
            ':mtype' => $messageType,
            ':fpath' => $filePath,
            ':fname' => $fileName,
            ':fsize' => $fileSize,
            ':reply' => $replyToId
        ]);

        $msgId = (int)$this->db->lastInsertId();

        // Fetch full inserted record with sender info
        $msgData = $this->getMessageById($msgId);

        // Notify receiver
        $preview = match ($messageType) {
            'image' => '📷 Photo',
            'video' => '🎥 Video',
            'voice' => '🎤 Voice message',
            'document' => '📄 ' . ($fileName ?: 'Document'),
            default => (mb_strlen($message ?? '') > 40 ? mb_substr($message, 0, 40) . '...' : ($message ?? ''))
        };
        $notif = new Notification();
        $notif->create($receiverId, $senderId, 'new_message', $preview, $msgId);

        return ['success' => true, 'message' => 'Message sent', 'data' => $msgData];
    }

    public function getMessageById(int $messageId): ?array {
        $stmt = $this->db->prepare("
            SELECT m.*, 
                   u.fullname AS sender_name, u.profile_image AS sender_image,
                   r.message AS reply_text, r.message_type AS reply_type
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            LEFT JOIN messages r ON m.reply_to_id = r.id
            WHERE m.id = :id
        ");
        $stmt->execute([':id' => $messageId]);
        $row = $stmt->fetch();
        if (!$row) return null;

        // Fetch reactions
        $row['reactions'] = $this->getReactions($messageId);
        return $row;
    }

    public function getConversation(int $currentUserId, int $otherUserId, int $limit = 50, int $beforeId = 0): array {
        $query = "
            SELECT m.*, 
                   u.fullname AS sender_name, u.profile_image AS sender_image,
                   r.message AS reply_text, r.message_type AS reply_type, ru.fullname AS reply_sender_name
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            LEFT JOIN messages r ON m.reply_to_id = r.id
            LEFT JOIN users ru ON r.sender_id = ru.id
            WHERE (
                (m.sender_id = :uid1 AND m.receiver_id = :other1 AND (m.deleted_for_sender = 0 OR m.deleted_for_sender IS NULL))
                OR
                (m.sender_id = :other2 AND m.receiver_id = :uid2)
            )
            AND (m.deleted_for_all = 0 OR m.deleted_for_all IS NULL)
        ";

        if ($beforeId > 0) {
            $query .= " AND m.id < :beforeId";
        }

        $query .= " ORDER BY m.id DESC LIMIT :lim";

        $stmt = $this->db->prepare($query);
        $stmt->bindValue(':uid1', $currentUserId, PDO::PARAM_INT);
        $stmt->bindValue(':other1', $otherUserId, PDO::PARAM_INT);
        $stmt->bindValue(':other2', $otherUserId, PDO::PARAM_INT);
        $stmt->bindValue(':uid2', $currentUserId, PDO::PARAM_INT);
        $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
        if ($beforeId > 0) {
            $stmt->bindValue(':beforeId', $beforeId, PDO::PARAM_INT);
        }

        $stmt->execute();
        $messages = $stmt->fetchAll();

        // Mark incoming messages as read
        $this->markConversationAsRead($otherUserId, $currentUserId);

        // Fetch reactions for these messages
        if (!empty($messages)) {
            $msgIds = array_column($messages, 'id');
            $reactionsMap = $this->getReactionsBulk($msgIds);
            foreach ($messages as &$msg) {
                $msg['reactions'] = $reactionsMap[$msg['id']] ?? [];
            }
        }

        // Return chronological order (oldest first)
        return array_reverse($messages);
    }

    public function markConversationAsRead(int $senderId, int $receiverId): void {
        $stmt = $this->db->prepare("
            UPDATE messages 
            SET is_read = 1, is_delivered = 1 
            WHERE sender_id = :sid AND receiver_id = :rid AND is_read = 0
        ");
        $stmt->execute([':sid' => $senderId, ':rid' => $receiverId]);
    }

    public function deleteMessage(int $messageId, int $userId, string $type = 'for_me'): array {
        $stmt = $this->db->prepare("SELECT * FROM messages WHERE id = :id");
        $stmt->execute([':id' => $messageId]);
        $msg = $stmt->fetch();

        if (!$msg) {
            return ['success' => false, 'message' => 'Message not found.'];
        }

        if ($type === 'for_everyone') {
            if ((int)$msg['sender_id'] !== $userId) {
                return ['success' => false, 'message' => 'You can only delete your own messages for everyone.'];
            }
            $stmtUp = $this->db->prepare("UPDATE messages SET deleted_for_all = 1, message = 'This message was deleted' WHERE id = :id");
            $stmtUp->execute([':id' => $messageId]);
            return ['success' => true, 'message' => 'Message deleted for everyone.'];
        } else {
            // Delete for me
            if ((int)$msg['sender_id'] === $userId) {
                $stmtUp = $this->db->prepare("UPDATE messages SET deleted_for_sender = 1 WHERE id = :id");
                $stmtUp->execute([':id' => $messageId]);
            } else if ((int)$msg['receiver_id'] === $userId) {
                // For receiver deleting just for themselves
                $stmtUp = $this->db->prepare("UPDATE messages SET deleted_for_all = 1 WHERE id = :id");
                $stmtUp->execute([':id' => $messageId]);
            }
            return ['success' => true, 'message' => 'Message deleted for you.'];
        }
    }

    public function toggleReaction(int $messageId, int $userId, string $reaction): array {
        // Check if user already reacted with this emoji
        $stmt = $this->db->prepare("SELECT id, reaction FROM message_reactions WHERE message_id = :mid AND user_id = :uid");
        $stmt->execute([':mid' => $messageId, ':uid' => $userId]);
        $existing = $stmt->fetch();

        if ($existing) {
            if ($existing['reaction'] === $reaction) {
                // Remove reaction
                $stmtDel = $this->db->prepare("DELETE FROM message_reactions WHERE id = :id");
                $stmtDel->execute([':id' => $existing['id']]);
                return ['success' => true, 'action' => 'removed', 'reactions' => $this->getReactions($messageId)];
            } else {
                // Update reaction
                $stmtUp = $this->db->prepare("UPDATE message_reactions SET reaction = :react WHERE id = :id");
                $stmtUp->execute([':react' => $reaction, ':id' => $existing['id']]);
                return ['success' => true, 'action' => 'updated', 'reactions' => $this->getReactions($messageId)];
            }
        } else {
            // Add reaction
            $stmtIns = $this->db->prepare("INSERT INTO message_reactions (message_id, user_id, reaction) VALUES (:mid, :uid, :react)");
            $stmtIns->execute([':mid' => $messageId, ':uid' => $userId, ':react' => $reaction]);
            return ['success' => true, 'action' => 'added', 'reactions' => $this->getReactions($messageId)];
        }
    }

    public function getReactions(int $messageId): array {
        $stmt = $this->db->prepare("
            SELECT mr.reaction, mr.user_id, u.fullname
            FROM message_reactions mr
            JOIN users u ON mr.user_id = u.id
            WHERE mr.message_id = :mid
        ");
        $stmt->execute([':mid' => $messageId]);
        return $stmt->fetchAll();
    }

    private function getReactionsBulk(array $messageIds): array {
        if (empty($messageIds)) return [];
        $placeholders = implode(',', array_fill(0, count($messageIds), '?'));
        $stmt = $this->db->prepare("
            SELECT mr.message_id, mr.reaction, mr.user_id, u.fullname
            FROM message_reactions mr
            JOIN users u ON mr.user_id = u.id
            WHERE mr.message_id IN ($placeholders)
        ");
        $stmt->execute($messageIds);
        $rows = $stmt->fetchAll();

        $map = [];
        foreach ($rows as $r) {
            $map[$r['message_id']][] = [
                'reaction' => $r['reaction'],
                'user_id' => $r['user_id'],
                'fullname' => $r['fullname']
            ];
        }
        return $map;
    }
}

