// assets/js/pwa.js - Progressive Web App (PWA) Controller

let deferredPrompt = null;

window.addEventListener('DOMContentLoaded', () => {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('pwa/service-worker.js')
            .then(reg => {
                console.log('[PWA] Service Worker registered successfully', reg.scope);
            })
            .catch(err => {
                console.warn('[PWA] Service Worker registration failed', err);
            });
    }

    const installBtn = document.getElementById('btnInstallApp');

    // Handle Before Install Prompt
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent default mini-infobar
        e.preventDefault();
        deferredPrompt = e;

        // Show install button if available on page
        if (installBtn) {
            installBtn.style.display = 'inline-flex';
        }
    });

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`[PWA] Install prompt outcome: ${outcome}`);
            deferredPrompt = null;
            installBtn.style.display = 'none';
        });
    }

    window.addEventListener('appinstalled', () => {
        console.log('[PWA] A/N Chat was installed on device.');
        if (installBtn) {
            installBtn.style.display = 'none';
        }
        if (typeof showToast === 'function') {
            showToast('A/N Chat installed successfully!', 'success');
        }
    });
});

