// pwa/service-worker.js - A/N Chat Service Worker
const CACHE_NAME = 'an-chat-cache-v8';

const STATIC_ASSETS = [
    '../assets/css/variables.css',
    '../assets/css/reset.css',
    '../assets/css/style.css',
    '../assets/css/auth.css',
    '../assets/css/dashboard.css',
    '../assets/css/chat.css',
    '../assets/css/calls.css',
    '../assets/css/responsive.css',
    '../assets/js/pwa.js',
    '../assets/icons/favicon.png',
    '../assets/icons/icon-192.png',
    '../assets/icons/icon-512.png',
    '../assets/images/logo.png',
    '../assets/sounds/ringtone.mp3',
    '../assets/sounds/ringtone.wav',
    '../assets/sounds/ringback.wav'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((k) => {
                    if (k !== CACHE_NAME) {
                        return caches.delete(k);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // NEVER cache API requests, WebSocket endpoints, or uploaded personal chats
    if (url.pathname.includes('/api/') || url.pathname.includes('/uploads/')) {
        return;
    }

    e.respondWith(
        caches.match(e.request).then((cached) => {
            return cached || fetch(e.request).then((response) => {
                // Cache successful GET requests for static assets
                if (e.request.method === 'GET' && response.status === 200 && (url.pathname.includes('/assets/'))) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
                }
                return response;
            }).catch(() => {
                // Offline fallback if needed
                return caches.match(e.request);
            });
        })
    );
});

// Notification click handler - Bring user directly to incoming call
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const action = event.action;
    const callId = event.notification.data ? event.notification.data.call_id : null;
    const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '../dashboard.php';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    if (action === 'accept') {
                        client.postMessage({ type: 'accept_incoming_call', call_id: callId });
                    } else if (action === 'decline') {
                        client.postMessage({ type: 'decline_incoming_call', call_id: callId });
                    } else {
                        // User tapped notification banner on lockscreen: show the iOS incoming call screen
                        client.postMessage({ type: 'view_incoming_call', call_id: callId });
                    }
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

