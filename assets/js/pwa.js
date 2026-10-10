// assets/js/pwa.js - Progressive Web App (PWA) Controller & Bouncing Install Button

let deferredPrompt = null;

/**
 * Check if the application is already installed on the user's device
 * or running in standalone PWA mode.
 */
function isPwaInstalled() {
    try {
        // 1. Display mode standalone check (Chrome, Edge, Android)
        if (window.matchMedia('(display-mode: standalone)').matches) {
            return true;
        }
        // 2. iOS standalone check
        if (window.navigator.standalone === true) {
            return true;
        }
        // 3. User already completed install / dismissed saved in localStorage
        if (localStorage.getItem('an_chat_pwa_installed') === 'true') {
            return true;
        }
        // 4. Android intent referrer
        if (document.referrer && document.referrer.includes('android-app://')) {
            return true;
        }
    } catch (e) {
        console.warn('[PWA] Error checking install status:', e);
    }
    return false;
}

/**
 * Mark PWA as installed and remove the button completely from the page
 */
function markPwaAsInstalled() {
    try {
        localStorage.setItem('an_chat_pwa_installed', 'true');
    } catch (e) {}

    // Animate removal of floating bouncing button
    const floatingBtn = document.getElementById('pwaFloatingInstallContainer');
    if (floatingBtn) {
        floatingBtn.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        floatingBtn.style.opacity = '0';
        floatingBtn.style.transform = 'scale(0.3) translateY(20px)';
        setTimeout(() => {
            if (floatingBtn) floatingBtn.remove();
        }, 400);
    }

    // Hide any settings install button
    const settingsBtn = document.getElementById('btnInstallApp');
    if (settingsBtn) {
        settingsBtn.style.display = 'none';
    }

    // Close instructions modal if open
    closePwaModal();
}

/**
 * Detect iOS Safari devices (iPhone, iPad, iPod)
 */
function isIosDevice() {
    const userAgent = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(userAgent) || 
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
    // 1. Register Service Worker with domain-wide scope
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .catch(() => navigator.serviceWorker.register('pwa/service-worker.js'))
            .then(reg => {
                if (reg) console.log('[PWA] Service Worker registered successfully', reg.scope);
            })
            .catch(err => {
                console.warn('[PWA] Service Worker registration failed', err);
            });
    }

    // 2. If already installed, ensure button is not shown at all
    if (isPwaInstalled()) {
        console.log('[PWA] App is already installed or running in standalone mode.');
        const existingContainer = document.getElementById('pwaFloatingInstallContainer');
        if (existingContainer) existingContainer.remove();
        const settingsBtn = document.getElementById('btnInstallApp');
        if (settingsBtn) settingsBtn.style.display = 'none';
        return;
    }

    // 3. Otherwise, render or display the standing bouncing install button
    ensureFloatingInstallButton();

    // 4. Capture native 'beforeinstallprompt' event (Android, Chrome, Edge)
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        console.log('[PWA] Native beforeinstallprompt captured.');
    });

    // 5. Handle native 'appinstalled' event
    window.addEventListener('appinstalled', () => {
        console.log('[PWA] A/N Chat was successfully installed on device.');
        markPwaAsInstalled();
        if (typeof showToast === 'function') {
            showToast('A/N Chat installed successfully!', 'success');
        }
    });

    // 6. Monitor display-mode changes in real time
    try {
        window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
            if (e.matches) {
                markPwaAsInstalled();
            }
        });
    } catch (e) {}
});

/**
 * Render or attach the bouncing install button
 */
function ensureFloatingInstallButton() {
    if (isPwaInstalled()) return;

    let container = document.getElementById('pwaFloatingInstallContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'pwaFloatingInstallContainer';
        container.className = 'pwa-floating-install-container';
        container.innerHTML = `
            <button id="pwaFloatingInstallBtn" class="pwa-bouncing-btn" title="Install A/N Chat on your device" aria-label="Install App">
                <i class="fas fa-download"></i>
                <span>Install App</span>
            </button>
        `;
        document.body.appendChild(container);
    } else {
        container.style.display = 'flex';
    }

    const btn = document.getElementById('pwaFloatingInstallBtn');
    if (btn) {
        btn.onclick = handleInstallClick;
    }

    // Also support settings modal install button
    const settingsBtn = document.getElementById('btnInstallApp');
    if (settingsBtn) {
        settingsBtn.style.display = 'inline-flex';
        settingsBtn.onclick = handleInstallClick;
    }
}

/**
 * Handle user click on the bouncing install button
 */
async function handleInstallClick(e) {
    if (e) e.preventDefault();

    // Priority 1: Native browser deferredPrompt (Android Chrome, Edge, Chromium)
    if (deferredPrompt) {
        try {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`[PWA] Install prompt outcome: ${outcome}`);
            if (outcome === 'accepted') {
                markPwaAsInstalled();
                if (typeof showToast === 'function') {
                    showToast('Installing A/N Chat... Welcome!', 'success');
                }
            }
            deferredPrompt = null;
            return;
        } catch (err) {
            console.warn('[PWA] Error launching prompt:', err);
        }
    }

    // Priority 2: iOS Safari (iPhone / iPad) - Guide modal
    if (isIosDevice()) {
        openPwaInstallModal(true);
        return;
    }

    // Priority 3: Fallback guide modal
    openPwaInstallModal(false);
}

/**
 * Open PWA Installation Guide Modal
 */
function openPwaInstallModal(isIos) {
    let modal = document.getElementById('pwaInstallModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pwaInstallModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-card" style="max-width:390px;text-align:center;">
                <div class="modal-header" style="justify-content:center;position:relative;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <img src="assets/images/logo.png" alt="A/N Chat" style="width:38px;height:38px;border-radius:12px;border:2px solid #ffffff;box-shadow:var(--shadow-sm);object-fit:cover;">
                        <h3 style="margin:0;font-size:18px;color:var(--text-primary);font-weight:700;">Install A/N Chat</h3>
                    </div>
                    <button class="btn-icon btn-sm" style="position:absolute;right:12px;top:14px;" onclick="closePwaModal()"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" style="padding:18px 16px;text-align:left;">
                    <div id="pwaIosGuide" style="display:none;">
                        <p style="font-size:13.5px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5;">
                            Ku shubo <strong>A/N Chat</strong> shaashadda iPhone-kaaga si aad ugu hesho khibrad buuxda oo degdeg ah sida App dhab ah:
                        </p>
                        <div style="display:flex;flex-direction:column;gap:10px;font-size:13px;color:var(--text-primary);">
                            <div style="display:flex;align-items:center;gap:12px;background:var(--surface-hover);padding:10px 12px;border-radius:var(--radius-md);">
                                <div style="width:30px;height:30px;border-radius:50%;background:rgba(233,30,99,0.12);color:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;">1</div>
                                <div>Taabo batoonka <strong>Share</strong> ee hoose <i class="fas fa-arrow-up-from-bracket" style="color:var(--primary);margin-left:4px;"></i> (Safari).</div>
                            </div>
                            <div style="display:flex;align-items:center;gap:12px;background:var(--surface-hover);padding:10px 12px;border-radius:var(--radius-md);">
                                <div style="width:30px;height:30px;border-radius:50%;background:rgba(233,30,99,0.12);color:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;">2</div>
                                <div>Hoos u yar rog oo dooro <strong>"Add to Home Screen"</strong> <i class="fas fa-plus-square" style="color:var(--primary);margin-left:4px;"></i>.</div>
                            </div>
                            <div style="display:flex;align-items:center;gap:12px;background:var(--surface-hover);padding:10px 12px;border-radius:var(--radius-md);">
                                <div style="width:30px;height:30px;border-radius:50%;background:rgba(233,30,99,0.12);color:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;">3</div>
                                <div>Taabo <strong>Add</strong> ee geeska sare ee midig. Diyaar ayaad u tahay! 🎉</div>
                            </div>
                        </div>
                    </div>
                    <div id="pwaGenericGuide" style="display:none;">
                        <p style="font-size:13.5px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5;">
                            Ku shubo <strong>A/N Chat</strong> qalabkaaga si aad u hesho wada hadal degdeg ah, calls cad, iyo digniino toos ah.
                        </p>
                        <div style="background:var(--surface-hover);padding:12px;border-radius:var(--radius-md);font-size:13px;line-height:1.5;color:var(--text-primary);">
                            Fadlan guji batoonka <strong>Install</strong> ee ku yaalla bar-ka sare ee browser-kaaga (ama menu-ga) si aad ugu darsato shaashadda hore.
                        </div>
                    </div>
                </div>
                <div class="modal-footer" style="justify-content:space-between;padding:12px 16px;">
                    <button class="btn btn-outline btn-sm" onclick="closePwaModal()">Cancel</button>
                    <button class="btn btn-primary btn-sm" id="btnConfirmPwaInstalled">
                        <i class="fas fa-check-circle"></i> Waan Dagsaday / Installed
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('btnConfirmPwaInstalled').onclick = () => {
            markPwaAsInstalled();
            if (typeof showToast === 'function') {
                showToast('A/N Chat installed successfully!', 'success');
            }
        };
    }

    const iosSection = document.getElementById('pwaIosGuide');
    const genericSection = document.getElementById('pwaGenericGuide');
    if (iosSection && genericSection) {
        if (isIos) {
            iosSection.style.display = 'block';
            genericSection.style.display = 'none';
        } else {
            iosSection.style.display = 'none';
            genericSection.style.display = 'block';
        }
    }

    modal.classList.add('active');
}

/**
 * Close PWA Modal
 */
function closePwaModal() {
    const modal = document.getElementById('pwaInstallModal');
    if (modal) modal.classList.remove('active');
}

// Export for external trigger if needed
window.markPwaAsInstalled = markPwaAsInstalled;
window.handleInstallClick = handleInstallClick;
