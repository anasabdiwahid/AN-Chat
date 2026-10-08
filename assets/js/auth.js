// assets/js/auth.js - Authentication Handlers (Register & Login)

document.addEventListener('DOMContentLoaded', () => {
    // Password visibility toggle
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const input = document.getElementById(targetId);
            if (!input) return;

            if (input.type === 'password') {
                input.type = 'text';
                btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
            } else {
                input.type = 'password';
                btn.innerHTML = '<i class="fas fa-eye"></i>';
            }
        });
    });

    // Profile photo upload preview on registration
    const avatarInput = document.getElementById('regAvatarInput');
    const avatarPreviewImg = document.getElementById('regAvatarPreview');

    if (avatarInput && avatarPreviewImg) {
        avatarInput.addEventListener('change', () => {
            const file = avatarInput.files[0];
            if (file) {
                if (file.size > 5 * 1024 * 1024) {
                    showToast('Photo must be less than 5MB', 'error');
                    avatarInput.value = '';
                    return;
                }
                const reader = new FileReader();
                reader.onload = (e) => {
                    avatarPreviewImg.src = e.target.result;
                    avatarPreviewImg.style.display = 'block';
                    const icon = document.querySelector('.avatar-upload-preview i');
                    if (icon) icon.style.display = 'none';
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Register Form submission
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const fullname = document.getElementById('regFullname').value.trim();
            const phone = document.getElementById('regPhone').value.trim();
            const password = document.getElementById('regPassword').value;
            const confirmPassword = document.getElementById('regConfirmPassword').value;
            const submitBtn = document.getElementById('regSubmitBtn');

            if (!fullname) {
                showToast('Please enter your full name', 'error');
                return;
            }
            if (!phone || phone.length < 6) {
                showToast('Please enter a valid phone number', 'error');
                return;
            }
            if (password.length < 6) {
                showToast('Password must be at least 6 characters', 'error');
                return;
            }
            if (password !== confirmPassword) {
                showToast('Passwords do not match', 'error');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<div class="spinner"></div> Creating account...';

            const formData = new FormData(registerForm);

            try {
                const response = await fetch('api/auth/register.php', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

                if (data.success) {
                    showToast('Account created successfully! Redirecting...', 'success');
                    setTimeout(() => {
                        window.location.href = 'login.php?registered=1';
                    }, 1200);
                } else {
                    showToast(data.message || 'Registration failed', 'error');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = 'Create Account';
                }
            } catch (err) {
                console.error(err);
                showToast('Connection error. Please try again.', 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Create Account';
            }
        });
    }

    // Login Form submission
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const phone = document.getElementById('loginPhone').value.trim();
            const password = document.getElementById('loginPassword').value;
            const submitBtn = document.getElementById('loginSubmitBtn');

            if (!phone || !password) {
                showToast('Please enter both phone number and password', 'error');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<div class="spinner"></div> Logging in...';

            try {
                const response = await fetch('api/auth/login.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, password })
                });
                const data = await response.json();

                if (data.success) {
                    showToast('Welcome back! Loading your chats...', 'success');
                    setTimeout(() => {
                        window.location.href = data.data.redirect || 'dashboard.php';
                    }, 800);
                } else {
                    showToast(data.message || 'Login failed', 'error');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = 'Login';
                }
            } catch (err) {
                console.error(err);
                showToast('Network error. Please try again.', 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Login';
            }
        });
    }
});

// Global Toast Display Helper
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = '<i class="fas fa-info-circle" style="color:var(--primary);"></i>';
    if (type === 'success') icon = '<i class="fas fa-check-circle" style="color:var(--success);"></i>';
    if (type === 'error') icon = '<i class="fas fa-exclamation-circle" style="color:var(--danger);"></i>';

    toast.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(60px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function escapeHtml(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
}

