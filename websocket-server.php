<?php
// websocket-server.php - A/N Chat Real-Time WebSocket Server (RFC 6455)
// Usage: php websocket-server.php

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/models/User.php';

set_time_limit(0);
ob_implicit_flush();

$host = '0.0.0.0';
$port = 8085;

$server = stream_socket_server("tcp://$host:$port", $errno, $errstr);
if (!$server) {
    die("Error creating WebSocket server on $host:$port - $errstr ($errno)\n");
}

echo "====================================================\n";
echo "  A/N Chat - Real-Time WebSocket Server Active\n";
echo "  Listening on ws://localhost:$port\n";
echo "====================================================\n";

$sockets = [$server];
$clients = []; // socketId => ['socket' => resource, 'handshake' => bool, 'user_id' => int|null]
$userSockets = []; // user_id => [socketId => resource]

function sendWebSocketFrame($clientSocket, $data) {
    $b1 = 0x81; // FIN + text frame
    $length = strlen($data);

    if ($length <= 125) {
        $header = pack('CC', $b1, $length);
    } elseif ($length <= 65535) {
        $header = pack('CCn', $b1, 126, $length);
    } else {
        $header = pack('CCNN', $b1, 127, 0, $length);
    }

    @fwrite($clientSocket, $header . $data);
}

function performHandshake($clientSocket, $headers) {
    if (!preg_match("/Sec-WebSocket-Key: (.*)\r\n/", $headers, $match)) {
        return false;
    }
    $secKey = trim($match[1]);
    $secAccept = base64_encode(pack('H*', sha1($secKey . '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')));

    $upgrade  = "HTTP/1.1 101 Switching Protocols\r\n" .
                "Upgrade: websocket\r\n" .
                "Connection: Upgrade\r\n" .
                "Sec-WebSocket-Accept: $secAccept\r\n\r\n";

    @fwrite($clientSocket, $upgrade);
    return true;
}

function decodeWebSocketFrame($payload) {
    if (strlen($payload) < 2) return null;
    $length = ord($payload[1]) & 127;

    if ($length === 126) {
        $masks = substr($payload, 4, 4);
        $data = substr($payload, 8);
    } elseif ($length === 127) {
        $masks = substr($payload, 10, 4);
        $data = substr($payload, 14);
    } else {
        $masks = substr($payload, 2, 4);
        $data = substr($payload, 6);
    }

    $text = '';
    for ($i = 0; $i < strlen($data); ++$i) {
        $text .= $data[$i] ^ $masks[$i % 4];
    }
    return $text;
}

function broadcastToUser($userSockets, $userId, $payload) {
    if (!empty($userSockets[$userId])) {
        foreach ($userSockets[$userId] as $sock) {
            sendWebSocketFrame($sock, json_encode($payload));
        }
    }
}

function broadcastToAll($clients, $payload) {
    $msg = json_encode($payload);
    foreach ($clients as $c) {
        if (!empty($c['handshake'])) {
            sendWebSocketFrame($c['socket'], $msg);
        }
    }
}

while (true) {
    $read = $sockets;
    $write = null;
    $except = null;

    if (@stream_select($read, $write, $except, null) < 1) {
        continue;
    }

    // New connection incoming
    if (in_array($server, $read)) {
        $newSocket = @stream_socket_accept($server);
        if ($newSocket) {
            stream_set_blocking($newSocket, false);
            $sockId = (int)$newSocket;
            $sockets[] = $newSocket;
            $clients[$sockId] = [
                'socket' => $newSocket,
                'handshake' => false,
                'user_id' => null
            ];
            echo "[Connect] Client connected #$sockId\n";
        }
        $key = array_search($server, $read);
        unset($read[$key]);
    }

    // Process data from existing clients
    foreach ($read as $clientSocket) {
        $sockId = (int)$clientSocket;
        $data = @fread($clientSocket, 65536);

        if ($data === false || strlen($data) === 0) {
            // Client disconnected
            $userId = $clients[$sockId]['user_id'] ?? null;
            if ($userId) {
                unset($userSockets[$userId][$sockId]);
                if (empty($userSockets[$userId])) {
                    unset($userSockets[$userId]);
                    // Update user status to offline in database
                    try {
                        $userModel = new User();
                        $userModel->updateStatus($userId, 'offline');
                    } catch (Exception $e) {}

                    // Broadcast offline event to all connected clients
                    broadcastToAll($clients, [
                        'type' => 'user_status',
                        'user_id' => $userId,
                        'status' => 'offline',
                        'last_seen' => date('Y-m-d H:i:s')
                    ]);
                    echo "[Status] User #$userId is now offline\n";
                }
            }

            @fclose($clientSocket);
            $k = array_search($clientSocket, $sockets);
            if ($k !== false) unset($sockets[$k]);
            unset($clients[$sockId]);
            echo "[Disconnect] Client #$sockId disconnected\n";
            continue;
        }

        // Perform handshake if not done yet
        if (empty($clients[$sockId]['handshake'])) {
            if (performHandshake($clientSocket, $data)) {
                $clients[$sockId]['handshake'] = true;
                echo "[Handshake] Handshake complete for client #$sockId\n";
            }
            continue;
        }

        // Decode incoming frame
        $message = decodeWebSocketFrame($data);
        if (!$message) continue;

        $payload = json_decode($message, true);
        if (!$payload || !isset($payload['type'])) continue;

        $type = $payload['type'];

        switch ($type) {
            case 'auth':
                // User authentication on WebSocket
                $userId = (int)($payload['user_id'] ?? 0);
                if ($userId > 0) {
                    $clients[$sockId]['user_id'] = $userId;
                    if (!isset($userSockets[$userId])) {
                        $userSockets[$userId] = [];
                    }
                    $userSockets[$userId][$sockId] = $clientSocket;

                    // Update user status to online in database
                    try {
                        $userModel = new User();
                        $userModel->updateStatus($userId, 'online');
                    } catch (Exception $e) {}

                    // Acknowledge auth
                    sendWebSocketFrame($clientSocket, json_encode([
                        'type' => 'auth_ok',
                        'user_id' => $userId
                    ]));

                    // Broadcast online status to all
                    broadcastToAll($clients, [
                        'type' => 'user_status',
                        'user_id' => $userId,
                        'status' => 'online',
                        'last_seen' => date('Y-m-d H:i:s')
                    ]);
                    echo "[Auth] User #$userId authenticated on socket #$sockId\n";
                }
                break;

            case 'new_message':
                // Real-time message dispatch to receiver
                $receiverId = (int)($payload['receiver_id'] ?? 0);
                if ($receiverId > 0) {
                    broadcastToUser($userSockets, $receiverId, [
                        'type' => 'new_message',
                        'message' => $payload['message_data'] ?? $payload
                    ]);
                }
                break;

            case 'typing':
                // Typing indicator dispatch
                $receiverId = (int)($payload['receiver_id'] ?? 0);
                $isTyping = !empty($payload['is_typing']);
                $senderId = $clients[$sockId]['user_id'] ?? (int)($payload['sender_id'] ?? 0);

                if ($receiverId > 0 && $senderId > 0) {
                    broadcastToUser($userSockets, $receiverId, [
                        'type' => 'typing',
                        'sender_id' => $senderId,
                        'receiver_id' => $receiverId,
                        'is_typing' => $isTyping
                    ]);
                }
                break;

            case 'message_read':
                // Mark as read receipt
                $senderId = (int)($payload['sender_id'] ?? 0);
                $receiverId = $clients[$sockId]['user_id'] ?? 0;
                if ($senderId > 0) {
                    broadcastToUser($userSockets, $senderId, [
                        'type' => 'messages_read',
                        'reader_id' => $receiverId
                    ]);
                }
                break;

            case 'reaction':
                // Live message reaction
                $receiverId = (int)($payload['receiver_id'] ?? 0);
                if ($receiverId > 0) {
                    broadcastToUser($userSockets, $receiverId, [
                        'type' => 'reaction',
                        'message_id' => $payload['message_id'] ?? 0,
                        'reaction' => $payload['reaction'] ?? '',
                        'action' => $payload['action'] ?? 'added',
                        'reactions' => $payload['reactions'] ?? []
                    ]);
                }
                break;

            case 'screenshot_alert':
                $targetUserId = (int)($payload['target_user_id'] ?? $payload['receiver_id'] ?? 0);
                $senderId = $clients[$sockId]['user_id'] ?? (int)($payload['sender_id'] ?? 0);
                $senderName = $payload['sender_name'] ?? 'Friend';
                if ($targetUserId > 0) {
                    broadcastToUser($userSockets, $targetUserId, [
                        'type' => 'screenshot_alert',
                        'sender_id' => $senderId,
                        'sender_name' => $senderName,
                        'action_type' => $payload['action_type'] ?? 'screenshot',
                        'notice' => $payload['notice'] ?? "⚠️ {$senderName} took a screenshot of this conversation.",
                        'time' => date('H:i')
                    ]);
                    echo "[Privacy] Screenshot alert from #$senderId delivered to #$targetUserId\n";
                }
                break;

            case 'admin_setting_update':
                // Broadcast updated setting to all connected clients
                broadcastToAll($clients, [
                    'type' => 'system_setting_updated',
                    'key' => $payload['key'] ?? '',
                    'value' => $payload['value'] ?? ''
                ]);
                echo "[Admin] Setting broadcast to all clients: " . ($payload['key'] ?? '') . "\n";
                break;

            case 'call_offer':
                $targetUserId = (int)($payload['target_user_id'] ?? $payload['receiver_id'] ?? 0);
                if ($targetUserId > 0) {
                    $callerId = $clients[$sockId]['user_id'] ?? ($payload['caller_id'] ?? 0);
                    $payload['from_user_id'] = $callerId;

                    if (!empty($userSockets[$targetUserId])) {
                        // User is online on network -> deliver offer
                        broadcastToUser($userSockets, $targetUserId, $payload);
                        echo "[Signaling] call_offer delivered from #$callerId to #$targetUserId (Ringing)\n";

                        // Notify caller that receiver device is ringing
                        sendWebSocketFrame($clientSocket, json_encode([
                            'type' => 'call_status',
                            'status' => 'ringing',
                            'target_user_id' => $targetUserId
                        ]));
                    } else {
                        // User is not connected to WebSocket network
                        echo "[Signaling] User #$targetUserId is offline for call from #$callerId\n";
                        sendWebSocketFrame($clientSocket, json_encode([
                            'type' => 'call_status',
                            'status' => 'offline',
                            'target_user_id' => $targetUserId
                        ]));
                    }
                }
                break;

            case 'webrtc_signal':
            case 'call_answer':
            case 'call_ice':
            case 'call_status':
                // WebRTC peer-to-peer signaling routing
                $targetUserId = (int)($payload['target_user_id'] ?? $payload['receiver_id'] ?? 0);
                if ($targetUserId > 0) {
                    $payload['from_user_id'] = $clients[$sockId]['user_id'] ?? ($payload['caller_id'] ?? 0);
                    broadcastToUser($userSockets, $targetUserId, $payload);
                    echo "[Signaling] {$type} forwarded from #{$payload['from_user_id']} to #$targetUserId\n";
                }
                break;

            case 'friend_request':
            case 'friend_accepted':
                $targetUserId = (int)($payload['receiver_id'] ?? 0);
                if ($targetUserId > 0) {
                    broadcastToUser($userSockets, $targetUserId, $payload);
                }
                break;
        }
    }
}

