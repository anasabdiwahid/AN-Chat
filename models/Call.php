<?php
// models/Call.php - WebRTC Calls Model

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/User.php';
require_once __DIR__ . '/Notification.php';

class Call {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    public function createCall(int $callerId, int $receiverId, string $callType = 'voice'): array {
        $userModel = new User();
        if ($userModel->isBlocked($callerId, $receiverId)) {
            return ['success' => false, 'message' => 'Unable to initiate call (blocked).'];
        }

        $stmt = $this->db->prepare("
            INSERT INTO calls (caller_id, receiver_id, call_type, status, started_at, created_at)
            VALUES (:cid, :rid, :type, 'calling', NOW(), NOW())
        ");
        $stmt->execute([
            ':cid'  => $callerId,
            ':rid'  => $receiverId,
            ':type' => in_array($callType, ['voice', 'video']) ? $callType : 'voice'
        ]);

        $callId = (int)$this->db->lastInsertId();

        return [
            'success' => true,
            'call_id' => $callId,
            'call_type' => $callType,
            'caller_id' => $callerId,
            'receiver_id' => $receiverId
        ];
    }

    public function updateCall(int $callId, string $status, int $duration = 0): bool {
        $validStatuses = ['calling', 'answered', 'declined', 'missed', 'ended'];
        if (!in_array($status, $validStatuses)) {
            return false;
        }

        $query = "UPDATE calls SET status = :status";
        $params = [':status' => $status, ':id' => $callId];

        if ($status === 'answered') {
            $query .= ", started_at = NOW()";
        } elseif ($status === 'ended' || $status === 'declined' || $status === 'missed') {
            $query .= ", ended_at = NOW(), duration = :duration";
            $params[':duration'] = $duration;

            // If missed, notify receiver
            if ($status === 'missed') {
                $stmtGet = $this->db->prepare("SELECT caller_id, receiver_id, call_type FROM calls WHERE id = :id");
                $stmtGet->execute([':id' => $callId]);
                $c = $stmtGet->fetch();
                if ($c) {
                    $notif = new Notification();
                    $notif->create((int)$c['receiver_id'], (int)$c['caller_id'], 'missed_call', 'Missed ' . $c['call_type'] . ' call.', $callId);
                }
            }
        }

        $query .= " WHERE id = :id";
        $stmt = $this->db->prepare($query);
        return $stmt->execute($params);
    }

    public function getHistory(int $userId, int $limit = 40): array {
        $stmt = $this->db->prepare("
            SELECT c.*,
                   IF(c.caller_id = :uid1, 'outgoing', 'incoming') AS direction,
                   other.id AS other_user_id,
                   other.fullname AS other_user_name,
                   other.profile_image AS other_user_image,
                   other.phone AS other_user_phone
            FROM calls c
            JOIN users other ON other.id = IF(c.caller_id = :uid2, c.receiver_id, c.caller_id)
            WHERE c.caller_id = :uid3 OR c.receiver_id = :uid4
            ORDER BY c.created_at DESC
            LIMIT :lim
        ");
        $stmt->bindValue(':uid1', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':uid2', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':uid3', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':uid4', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }

    public function getCall(int $callId): ?array {
        $stmt = $this->db->prepare("SELECT * FROM calls WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $callId]);
        $call = $stmt->fetch(PDO::FETCH_ASSOC);
        return $call ?: null;
    }
}

