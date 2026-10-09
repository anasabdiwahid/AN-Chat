<?php
// websocket-server.php - A/N Chat Robust Real-Time WebSocket Server (RFC 6455)
// Usage: php websocket-server.php

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/models/User.php';

set_time_limit(0);
ob_implicit_flush();

$host = '0.0.0.0';
$port = 8085;

$server = @stream_socket_server("tcp://$host:$port", $errno, $errstr);
if (!$server) {
    die("Error creating WebSocket server on $host:$port - $errstr ($errno)\n");
}

echo "====================================================\n";
echo "  A/N Chat - Real-Time WebSocket Server Active\n";
echo "  Listening on ws://localhost:$port\n";
echo "====================================================\n";

$sockets = [$server];
$clients = []; // socketId => ['socket' => resource, 'handshake' => bool, 'user_id' => int|null, 'handshake_buffer' => string]
$userSockets = []; // user_id => [socketId => resource]

function sendWebSocketFrame($clientSocket, $data, $opcode = 0x1) {
    if (!is_resource($clientSocket)) return false;
    $b1 = 0x80 | ($opcode & 0x0f); // FIN (0x80) + opcode
    $length = strlen($data);

    if ($length <= 125) {
        $header = pack('CC', $b1, $length);
    } elseif ($length <= 65535) {
        $header = pack('CCn', $b1, 126, $length);
    } else {
        $header = pack('CCNN', $b1, 127, 0, $length);
    }

    $res = @fwrite($clientSocket, $header . $data);
    return $res !== false;
}

function performHandshake($clientSocket, $headers) {
    if (!preg_match('/^Sec-WebSocket-Key:\s*(.+)\r?$/im', $headers, $match)) {
        return false;
    }
    $secKey = trim($match[1]);
    $secAccept = base64_encode(pack('H*', sha1($secKey . '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')));

    $upgrade  = "HTTP/1.1 101 Switching Protocols\r\n" .
                "Upgrade: websocket\r\n" .
                "Connection: Upgrade\r\n" .
                "Sec-WebSocket-Accept: $secAccept\r\n\r\n";

    $res = @fwrite($clientSocket, $upgrade);
    return $res !== false;
}

function decodeWebSocketFrame($payload) {
    $payloadLen = strlen($payload);
    if ($payloadLen < 2) return null;

    $opcode = ord($payload[0]) & 0x0f;
    $isMasked = (ord($payload[1]) & 0x80) === 0x80;
    $length = ord($payload[1]) & 127;

    $offset = 2;
    if ($length === 126) {
        if ($payloadLen < 4) return null;
        $offset = 4;
    } elseif ($length === 127) {
        if ($payloadLen < 10) return null;
        $offset = 10;
    }

    if ($isMasked) {
        if ($payloadLen < $offset + 4) return null;
        $masks = substr($payload, $offset, 4);
        $offset += 4;
        $data = substr($payload, $offset);
        $maskLen = strlen($masks);
        if ($maskLen !== 4) return null;

        $text = '';
        $dataLen = strlen($data);
        for ($i = 0; $i < $dataLen; ++$i) {
            $text .= $data[$i] ^ $masks[$i % 4];
        }
        return ['opcode' => $opcode, 'payload' => $text];
    } else {
        $data = substr($payload, $offset);
        return ['opcode' => $opcode, 'payload' => $data];
    }
}

function removeClient(&$sockets, &$clients, &$userSockets, $clientSocket) {
    $sockId = (int)$clientSocket;
    if (isset($clients[$sockId])) {
        $userId = $clients[$sockId]['user_id'] ?? null;
        if ($userId && isset($userSockets[$userId])) {
            unset($userSockets[$userId][$sockId]);
            if (empty($userSockets[$userId])) {
                unset($userSockets[$userId]);
                try {
                    $userModel = new User();
                    $userModel->updateStatus($userId, 'offline');
                } catch (Throwable $e) {}

                broadcastToAll($clients, [
                    'type' => 'user_status',
                    'user_id' => $userId,
                    'status' => 'offline',
                    'last_seen' => date('Y-m-d H:i:s')
                ]);
                echo "[Status] User #$userId is now offline\n";
            }
        }
        unset($clients[$sockId]);
    }

    $k = array_search($clientSocket, $sockets, true);
    if ($k !== false) {
        unset($sockets[$k]);
    }

    if (is_resource($clientSocket)) {
        @fclose($clientSocket);
    }
    echo "[Disconnect] Client #$sockId disconnected\n";
}

function broadcastToUser(&$userSockets, $userId, $payload) {
    if (!empty($userSockets[$userId])) {
        $msg = json_encode($payload);
        foreach ($userSockets[$userId] as $sockId => $sock) {
            if (is_resource($sock)) {
                sendWebSocketFrame($sock, $msg);
            }
        }
    }
}

function broadcastToAll(&$clients, $payload) {
    $msg = json_encode($payload);
    foreach ($clients as $sockId => $c) {
        if (!empty($c['handshake']) && is_resource($c['socket'])) {
            sendWebSocketFrame($c['socket'], $msg);
        }
    }
}

// Main Non-Blocking Server Event Loop
while (true) {
    try {
        // Prune any closed/invalid stream resources from $sockets
        $validSockets = [];
        foreach ($sockets as $s) {
            if (is_resource($s) && get_resource_type($s) === 'stream') {
                $validSockets[] = $s;
            }
        }
        $sockets = $validSockets;

        // Ensure server socket is always present
        if (!in_array($server, $sockets, true)) {
            $sockets[] = $server;
        }

        $read = $sockets;
        $write = null;
        $except = null;

        $numChanged = @stream_select($read, $write, $except, 1);
        if ($numChanged === false || $numChanged < 1) {
            usleep(10000); // 10ms CPU sleep
            continue;
        }

        // 1. Accept new incoming client connection
        if (in_array($server, $read, true)) {
            $newSocket = @stream_socket_accept($server, 0);
            if ($newSocket) {
                stream_set_blocking($newSocket, false);
                $sockId = (int)$newSocket;
                $sockets[] = $newSocket;
                $clients[$sockId] = [
                    'socket' => $newSocket,
                    'handshake' => false,
                    'user_id' => null,
                    'handshake_buffer' => ''
                ];
                echo "[Connect] Client connected #$sockId\n";
            }
            $key = array_search($server, $read, true);
            if ($key !== false) unset($read[$key]);
        }

        // 2. Process data from connected clients
        foreach ($read as $clientSocket) {
            $sockId = (int)$clientSocket;

            if (!is_resource($clientSocket)) {
                removeClient($sockets, $clients, $userSockets, $clientSocket);
                continue;
            }

            $data = @fread($clientSocket, 65536);

            if ($data === false || strlen($data) === 0) {
                // Client closed socket connection
                removeClient($sockets, $clients, $userSockets, $clientSocket);
                continue;
            }

            // 2a. Perform WebSocket Handshake
            if (empty($clients[$sockId]['handshake'])) {
                $clients[$sockId]['handshake_buffer'] .= $data;
                if (strlen($clients[$sockId]['handshake_buffer']) > 16384) {
                    removeClient($sockets, $clients, $userSockets, $clientSocket);
                    continue;
                }
                if (strpos($clients[$sockId]['handshake_buffer'], "\r\n\r\n") === false) {
                    continue; // Wait for full HTTP headers
                }
                if (performHandshake($clientSocket, $clients[$sockId]['handshake_buffer'])) {
                    $clients[$sockId]['handshake'] = true;
                    $clients[$sockId]['handshake_buffer'] = '';
                    echo "[Handshake] Handshake complete for client #$sockId\n";
                } else {
                    removeClient($sockets, $clients, $userSockets, $clientSocket);
                }
                continue;
            }

            // 2b. Decode RFC 6455 frame
            $frame = decodeWebSocketFrame($data);
            if (!$frame) continue;

            $opcode = $frame['opcode'];
            $payloadRaw = $frame['payload'];

            // Handle Opcode 0x8: Connection Close Frame
            if ($opcode === 0x8) {
                @sendWebSocketFrame($clientSocket, pack('n', 1000), 0x8);
                removeClient($sockets, $clients, $userSockets, $clientSocket);
                continue;
            }

            // Handle Opcode 0x9: Ping Frame (Respond with Pong 0xA)
            if ($opcode === 0x9) {
                @sendWebSocketFrame($clientSocket, $payloadRaw, 0xA);
                continue;
            }

            // Handle Opcode 0xA: Pong Frame
            if ($opcode === 0xA) {
                continue;
            }

            // Handle Opcode 0x1: Text Message Frame
            if ($opcode !== 0x1) {
                continue;
            }

            $payload = @json_decode($payloadRaw, true);
            if (!$payload || !isset($payload['type'])) continue;

            $type = $payload['type'];

            switch ($type) {
                case 'auth':
                    $userId = (int)($payload['user_id'] ?? 0);
                    if ($userId > 0) {
                        $clients[$sockId]['user_id'] = $userId;
                        if (!isset($userSockets[$userId])) {
                            $userSockets[$userId] = [];
                        }
                        $userSockets[$userId][$sockId] = $clientSocket;

                        try {
                            $userModel = new User();
                            $userModel->updateStatus($userId, 'online');
                        } catch (Throwable $e) {}

                        sendWebSocketFrame($clientSocket, json_encode([
                            'type' => 'auth_ok',
                            'user_id' => $userId
                        ]));

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
                    $receiverId = (int)($payload['receiver_id'] ?? 0);
                    if ($receiverId > 0) {
                        broadcastToUser($userSockets, $receiverId, [
                            'type' => 'new_message',
                            'message' => $payload['message_data'] ?? $payload
                        ]);
                    }
                    break;

                case 'typing':
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
                    broadcastToAll($clients, [
                        'type' => 'system_setting_updated',
                        'key' => $payload['key'] ?? '',
                        'value' => $payload['value'] ?? ''
                    ]);
                    echo "[Admin] Setting broadcast: " . ($payload['key'] ?? '') . "\n";
                    break;

                case 'call_offer':
                    $targetUserId = (int)($payload['target_user_id'] ?? $payload['receiver_id'] ?? 0);
                    if ($targetUserId > 0) {
                        $callerId = $clients[$sockId]['user_id'] ?? ($payload['caller_id'] ?? 0);
                        $payload['from_user_id'] = $callerId;

                        if (!empty($userSockets[$targetUserId])) {
                            // User is connected on WebSocket
                            broadcastToUser($userSockets, $targetUserId, $payload);
                            echo "[Signaling] call_offer delivered from #$callerId to #$targetUserId (Ringing)\n";

                            sendWebSocketFrame($clientSocket, json_encode([
                                'type' => 'call_status',
                                'status' => 'ringing',
                                'target_user_id' => $targetUserId
                            ]));
                        } else {
                            echo "[Signaling] User #$targetUserId is offline on WS for call from #$callerId\n";
                            sendWebSocketFrame($clientSocket, json_encode([
                                'type' => 'call_status',
                                'status' => 'offline',
                                'target_user_id' => $targetUserId
                            ]));
                        }
                    }
                    break;

                case 'call_request_offer':
                    $targetUserId = (int)($payload['target_user_id'] ?? $payload['caller_id'] ?? 0);
                    if ($targetUserId > 0) {
                        $payload['from_user_id'] = $clients[$sockId]['user_id'] ?? 0;
                        broadcastToUser($userSockets, $targetUserId, $payload);
                        echo "[Signaling] call_request_offer forwarded to #$targetUserId\n";
                    }
                    break;

                case 'webrtc_signal':
                case 'call_answer':
                case 'call_ice':
                case 'call_status':
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
    } catch (Throwable $e) {
        echo "[Server Loop Caught Exception] " . $e->getMessage() . " on line " . $e->getLine() . "\n";
        usleep(50000);
    }
}
