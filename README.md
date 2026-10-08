# A/N Chat 💗
> **Connect. Chat. Call. Share.**

A modern, responsive, real-time messaging and peer-to-peer calling platform inspired by WhatsApp, built with a modern Pink theme, PHP 8+, MySQL, RFC 6455 WebSockets, and WebRTC.

---

## 🌟 Features

- **🌸 Modern Pink Visual Identity**:
  - Full CSS custom properties design system with modern pink primary accents (`#E91E63`).
  - High-contrast Dark Mode (`#151015`) with persistent state in `localStorage` and MySQL.
  - Pink-tinted chat bubbles for user messages, clean white/light bubbles for incoming messages.
  - Custom brand logo, favicon, and PWA icon generated from official branding.

- **📱 Phone Number Authentication**:
  - Unique phone number registration (`UNIQUE(phone)`).
  - Secure bcrypt password hashing with `password_hash()` and `password_verify()`.
  - Secure PHP session management with `session_regenerate_id(true)`.
  - Profile image upload with automated resizing and validation.

- **⚡ Real-Time WebSocket Communication**:
  - Built-in pure PHP WebSocket server (`websocket-server.php`, port 8085).
  - Instant 1-on-1 message delivery without page reloads.
  - Live typing indicators ("*Anas is typing...*").
  - Real-time online/offline presence tracking and last-seen timestamps.
  - Read receipts (✓ Sent, ✓✓ Delivered, ✓✓ Read in pink).
  - Live message reactions (❤️, 😂, 👍, 🔥, 😍, 😢).

- **📞 Real WebRTC Voice & Video Calling**:
  - Peer-to-peer voice and video calls using `RTCPeerConnection`.
  - Google STUN server integration (`stun.l.google.com:19302`) with configurable TURN support.
  - Dynamic Web Audio ringtone and call-end tone synthesizers.
  - Full call controls: microphone mute/unmute, camera toggle, call timer, Picture-in-Picture (PiP) local preview, and call history logging.

- **📁 Rich Media & File Sharing**:
  - Image sharing with instant preview modal before sending and lightbox view.
  - Video sharing with integrated HTML5 player.
  - Document sharing (PDF, Word, Excel, PowerPoint, Text) with file size indicators.
  - In-browser voice message recording using the `MediaRecorder` API with live duration timer.
  - Strict security validation: MIME checking, extension blacklisting, and cryptographically random file naming.

- **👥 Friends & Social System**:
  - Phone number search with instant profile preview.
  - Friend request lifecycle (Send, Accept, Reject).
  - Friend list with live online status indicators.
  - Block and Report user mechanisms.

- **📲 Progressive Web App (PWA)**:
  - Valid `manifest.json` with pink theme color and 192x192 / 512x512 app icons.
  - `service-worker.js` caching static assets for offline capability without compromising user privacy.
  - Native "Install App" prompt integration (`beforeinstallprompt`).

---

## 🚀 Quick Start (XAMPP)

### 1. Requirements
- XAMPP with **PHP 8.0+** and **MySQL / MariaDB**.
- Apache Web Server.

### 2. Setup Database
1. Open **phpMyAdmin** (`http://localhost/phpmyadmin/`) or MySQL CLI.
2. Import the `database.sql` file located in the project root:
   ```sql
   mysql -u root < database.sql
   ```
   *This automatically creates `an_chat_db` and all 10 required tables and indexes.*

### 3. Start the Real-Time WebSocket Server
In a terminal, run the included WebSocket server script:
```powershell
php websocket-server.php
```
*The server will start listening on `ws://localhost:8085`.*

### 4. Access the Application
Open your browser and navigate to:
```
http://localhost/chats/
```

---

## 👥 Test Accounts

You can test 1-on-1 messaging and WebRTC calling immediately using two browser windows (one regular, one Incognito):

| Account | Full Name | Phone Number | Password |
|---|---|---|---|
| **User 1** | Anas Abdiwahid | `7766554499` | `Test1234` |
| **User 2** | Ahmed Ali | `6677889900` | `Test1234` |

---

## 📁 Project Structure

```
chats/
├── index.php                  # Landing page with hero & features
├── login.php                  # Phone number authentication screen
├── register.php               # User registration screen
├── dashboard.php              # Main 3-column & mobile chat application
├── chat.php / friends.php     # Direct routing shortcuts
├── calls.php / profile.php    # Modals & views shortcuts
├── websocket-server.php       # Real-Time RFC 6455 WebSocket Server
├── database.sql               # Complete MySQL schema & tables
│
├── config/
│   ├── config.php             # System constants, ICE servers, sessions
│   └── database.php           # PDO connection with utf8mb4 support
│
├── models/
│   ├── User.php               # Authentication, profiles, blocking, reports
│   ├── Friend.php             # Friend requests & friendship relationships
│   ├── Message.php            # Messaging, media, reactions, deletions
│   ├── Call.php               # WebRTC call records & history
│   └── Notification.php       # System notifications & alerts
│
├── api/
│   ├── auth/                  # register.php, login.php, logout.php
│   ├── users/                 # search.php, profile.php, update-profile.php, settings.php, block.php, report.php
│   ├── friends/               # send-request.php, accept-request.php, reject-request.php, list.php, pending.php
│   ├── messages/              # send.php, fetch.php, upload.php, mark-read.php, delete.php, reaction.php, sync.php
│   ├── calls/                 # create.php, update.php, history.php
│   └── notifications/         # list.php, mark-read.php
│
├── assets/
│   ├── css/                   # variables.css, reset.css, style.css, auth.css, dashboard.css, chat.css, calls.css, responsive.css
│   ├── js/                    # app.js, auth.js, chat.js, friends.js, notifications.js, calls.js, webrtc.js, recorder.js, upload.js, pwa.js
│   ├── images/                # Brand logo, avatars
│   └── icons/                 # Favicons and PWA icons
│
├── uploads/                   # images/, videos/, documents/, voice/
└── pwa/                       # manifest.json, service-worker.js
```

---

## 🔒 Security
- **SQL Injection Prevention**: All queries use PDO with prepared statements.
- **Password Protection**: BCrypt hashing via `password_hash()`.
- **XSS Protection**: HTML sanitization and encoding on user content.
- **File Upload Security**: Verification of MIME types using `finfo`, file extension validation, and execution prohibition (`.php`, `.exe`, etc.).
- **Session Security**: Regenerated session IDs and HTTP-only cookie flags.

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
