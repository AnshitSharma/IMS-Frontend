// API Configuration - Uses centralized config (see assets/js/config.js)
const API_CONFIG = {
    baseURL: window.BDC_CONFIG?.API_BASE_URL || 'https://ims.bdcms.bharatdatacenter.com/Ims_backend/api/api.php',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
    }
};

// DOM Elements
const loginFormElement = document.getElementById('loginFormElement');
const alertMessage = document.getElementById('alertMessage');

// Security & Rate Limiting Config
const SECURITY_CONFIG = {
    MAX_ATTEMPTS: 5,
    LOCKOUT_TIME: 30 * 1000, // 30 seconds
    // The single username rule, enforced both on blur (validateField) and on
    // submit (handleLogin). Allows alphanumerics, dot, underscore, dash.
    USERNAME_REGEX: /^[a-zA-Z0-9_.-]+$/
};

// A SQL_INJECTION_PATTERNS list used to sit here and was applied to the username
// field. It was removed on 2026-09-21. It was never a security control — the
// backend uses prepared statements, which is the actual defence, and the comment
// above it said so. What it did do was reject legitimate input: the first pattern
// matched `--`, which USERNAME_REGEX explicitly permits, so a username containing
// a double hyphen was refused with "Security check failed: Suspicious input
// detected." Client-side pattern-matching on credentials buys nothing an attacker
// cannot skip by not using the form.

// UX-ONLY: These localStorage-based rate limiting counters provide user feedback
// (countdown timer, disabled button) and slow down casual manual attempts.
// They are NOT a security control — any user can clear localStorage to bypass them.
// Real rate limiting must be enforced server-side. The login handler also handles
// HTTP 429 responses from the backend when they occur.
let failedAttempts = parseInt(localStorage.getItem('bdc_failed_attempts') || '0');
let lockoutUntil = parseInt(localStorage.getItem('bdc_lockout_until') || '0');

// Password Toggle Elements
const toggleLoginPassword = document.getElementById('toggleLoginPassword');

// Initialize Application
document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
});

function initializeApp() {
    setupPasswordToggles();
    setupFormValidation();
    setupFormSubmissions();
    setupForgotPassword();
    setupMicrosoftSignIn();
    checkExistingToken();
    checkLockoutStatus(); // Check if user is currently locked out
}

// Password Toggle Functionality
function setupPasswordToggles() {
    if (toggleLoginPassword) {
        toggleLoginPassword.addEventListener('click', () => {
            togglePasswordVisibility('loginPassword', toggleLoginPassword);
        });
    }
}

function togglePasswordVisibility(inputId, toggleButton) {
    const input = document.getElementById(inputId);
    const icon = toggleButton.querySelector('i');

    if (!input || !icon) return;

    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
        toggleButton.setAttribute('aria-label', 'Hide password');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
        toggleButton.setAttribute('aria-label', 'Show password');
    }
}

// Form Validation
function setupFormValidation() {
    // Only add validation to text/email/password inputs, not checkboxes
    const inputs = document.querySelectorAll('input[required]:not([type="checkbox"])');

    inputs.forEach(input => {
        input.addEventListener('blur', () => validateField(input));
        input.addEventListener('input', () => clearFieldError(input));
    });
}

function validateField(input) {
    const value = input.value.trim();

    // Clear previous errors
    clearFieldError(input);

    // Required field validation
    // Same wording as validateLoginForm() / the reset-email submit check.
    if (!value) {
        const label = { username: 'Username', password: 'Password', email: 'Email' }[input.name];
        setFieldError(input, label ? `${label} is required` : 'This field is required');
        return false;
    }

    // Email validation
    if (input.type === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
            setFieldError(input, 'Please enter a valid email address');
            return false;
        }
    }

    // Username validation.
    //
    // One rule, SECURITY_CONFIG.USERNAME_REGEX — the same one handleLogin()
    // enforces. This used to carry its own stricter regex (/^[a-zA-Z0-9_]+$/),
    // so a username containing a dot or a hyphen was marked invalid on blur and
    // then accepted on submit: two rules in one file, disagreeing.
    if (input.name === 'username') {
        if (value.length < 3) {
            setFieldError(input, 'Username must be at least 3 characters long');
            return false;
        }

        if (!SECURITY_CONFIG.USERNAME_REGEX.test(value)) {
            setFieldError(input, 'Username can only contain letters, numbers, and . _ -');
            return false;
        }
    }

    return true;
}

function checkLockoutStatus() {
    const now = Date.now();
    if (lockoutUntil > now) {
        const remaining = Math.ceil((lockoutUntil - now) / 1000);
        setLoginLockout(true, remaining);

        // Auto-unlock when time expires
        setTimeout(() => {
            setLoginLockout(false);
            failedAttempts = 0;
            localStorage.setItem('bdc_failed_attempts', '0');
        }, remaining * 1000);
        return true;
    }
    return false;
}

function setLoginLockout(locked, remainingSeconds = 0) {
    const btn = document.getElementById('loginBtn');
    if (!btn) return;

    if (locked) {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        const originalText = btn.querySelector('.btn-text').innerHTML;
        if (!btn.getAttribute('data-original-text')) {
            btn.setAttribute('data-original-text', originalText);
        }
        btn.querySelector('.btn-text').textContent = `Try again in ${remainingSeconds}s`;
    } else {
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
        const originalText = btn.getAttribute('data-original-text');
        if (originalText) {
            btn.querySelector('.btn-text').innerHTML = originalText;
        }
    }
}

function handleFailedLogin() {
    failedAttempts++;
    localStorage.setItem('bdc_failed_attempts', failedAttempts.toString());

    if (failedAttempts >= SECURITY_CONFIG.MAX_ATTEMPTS) {
        lockoutUntil = Date.now() + SECURITY_CONFIG.LOCKOUT_TIME;
        localStorage.setItem('bdc_lockout_until', lockoutUntil.toString());
        showAlert('error', 'Too many failed attempts. Login disabled for 30s.', 'fas fa-shield-alt');
        checkLockoutStatus();
    }
}

// The message goes AFTER the .input-group, not inside it: inside, it shares a
// flex row with the input and can squeeze the input to zero width.
function setFieldError(input, message) {
    clearFieldError(input);

    const inputGroup = input.closest('.input-group');
    if (!inputGroup) return;

    const errorElement = document.createElement('div');
    errorElement.className = 'field-error';
    errorElement.id = `${input.id}-error`;
    errorElement.textContent = message;

    inputGroup.classList.add('has-error');
    inputGroup.insertAdjacentElement('afterend', errorElement);
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', errorElement.id);
}

function clearFieldError(input) {
    // Guard: Ensure input exists
    if (!input) return;

    const inputGroup = input.closest('.input-group');
    // Exit early if no input-group parent (e.g., for checkboxes)
    if (!inputGroup) return;

    inputGroup.classList.remove('has-error');
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');

    const errorElement = inputGroup.nextElementSibling;
    if (errorElement && errorElement.classList.contains('field-error')) {
        errorElement.remove();
    }
}

// Form Submissions
function setupFormSubmissions() {
    loginFormElement.addEventListener('submit', handleLogin);
}

async function handleLogin(e) {
    e.preventDefault();

    // Check for lockout
    if (checkLockoutStatus()) {
        showAlert('error', 'Too many failed login attempts. Please wait.', 'fas fa-lock');
        return;
    }

    const formData = new FormData(loginFormElement);
    let username = formData.get('username').trim();
    let password = formData.get('password').trim();

    // Required fields first, so an empty username gets "Username is required"
    // under the field rather than an "invalid characters" toast.
    if (!validateLoginForm(username, password)) {
        return;
    }

    // Sanitize Username to prevent simple injection
    // Note: We don't sanitize password as it might contain special chars, but we length check it
    if (!SECURITY_CONFIG.USERNAME_REGEX.test(username)) {
        showAlert('error', 'Invalid characters in username.', 'fas fa-exclamation-circle');
        return;
    }

    // Show loading state
    setButtonLoading('loginBtn', true);

    try {
        const rememberMe = document.getElementById('rememberMe')?.checked || false;
        const response = await loginUser(username, password, rememberMe);

        if (response.success) {
            // Choose storage based on remember-me preference
            const storage = rememberMe ? localStorage : sessionStorage;

            // Persist the remember-me preference for other pages
            if (rememberMe) {
                localStorage.setItem('bdc_remember_me', 'true');
            } else {
                localStorage.removeItem('bdc_remember_me');
            }

            // Store JWT token and user data
            storage.setItem('bdc_token', response.data.tokens.access_token);
            // Pinned to sessionStorage even when remember-me is on: this is a 30-day
            // credential and must not outlive the tab. Remember-me still persists the
            // access token above, so a restart keeps the user signed in until it expires.
            sessionStorage.setItem('bdc_refresh_token', response.data.tokens.refresh_token);
            localStorage.removeItem('bdc_refresh_token');
            storage.setItem('bdc_user', JSON.stringify(response.data.user));

            // Reset failed attempts on success
            failedAttempts = 0;
            localStorage.setItem('bdc_failed_attempts', '0');
            localStorage.removeItem('bdc_lockout_until');

            showAlert('success', 'Login successful! Redirecting...', 'fas fa-check-circle');

            // Clear auto-saved form data on successful login
            clearAutoSavedData();

            // Redirect to dashboard
            setTimeout(() => {
                window.location.href = 'pages/dashboard/index.html';
            }, 1500);
        } else {
            // Handle failed login security
            handleFailedLogin();
            showAlert('error', response.message || 'Login failed. Please try again.', 'fas fa-times-circle');
        }
    } catch (error) {
        console.error('Login error:', error);
        const isNetworkError = !error.message || error.message.startsWith('HTTP error!') || error.message === 'Failed to fetch';
        if (!isNetworkError) {
            handleFailedLogin();
            showAlert('error', error.message, 'fas fa-times-circle');
        } else {
            showAlert('error', 'Network error. Please check your connection and try again.', 'fas fa-exclamation-circle');
        }
    } finally {
        setButtonLoading('loginBtn', false);
    }
}

// Forgot Password Modal
function setupForgotPassword() {
    const link = document.getElementById('forgotPasswordLink');
    const modal = document.getElementById('forgotPasswordModal');
    const closeBtn = document.getElementById('closeForgotModal');
    const backdrop = document.getElementById('forgotModalBackdrop');
    const form = document.getElementById('forgotPasswordForm');

    if (!link || !modal) return;

    link.addEventListener('click', (e) => {
        e.preventDefault();
        modal.classList.remove('hidden');
        document.getElementById('forgotEmail')?.focus();
    });

    [closeBtn, backdrop].forEach(el => {
        el?.addEventListener('click', closeForgotModal);
    });

    // The dialog contract the signed-in pages get from utils.dialog (this page
    // has no utils.js): Escape closes, and Tab stays inside the card.
    modal.addEventListener('keydown', (e) => {
        if (modal.classList.contains('hidden')) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closeForgotModal();
        } else if (e.key === 'Tab') {
            const els = [...modal.querySelectorAll('button, input')].filter(el => !el.disabled && el.offsetParent !== null);
            if (!els.length) return;
            const first = els[0];
            const last = els[els.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    });

    form.addEventListener('submit', handleForgotPassword);
}

// Hide the reset dialog, clear it, and put focus back on the link that opened it.
function closeForgotModal() {
    const modal = document.getElementById('forgotPasswordModal');
    if (!modal || modal.classList.contains('hidden')) return;
    modal.classList.add('hidden');
    document.getElementById('forgotPasswordForm')?.reset();
    clearFieldError(document.getElementById('forgotEmail'));
    document.getElementById('forgotPasswordLink')?.focus();
}

async function handleForgotPassword(e) {
    e.preventDefault();
    const emailInput = document.getElementById('forgotEmail');
    const email = emailInput.value.trim();

    if (!email) {
        setFieldError(emailInput, 'Email is required');
        return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        setFieldError(emailInput, 'Please enter a valid email address');
        return;
    }

    setButtonLoading('forgotSubmitBtn', true);

    try {
        const response = await forgotPasswordUser(email);
        // API returns same message regardless of whether email exists (security best practice)
        showAlert('success', response.message || 'If an account with that email exists, a reset link has been sent.', 'fas fa-check-circle');
        closeForgotModal();
    } catch (error) {
        console.error('Forgot password error:', error);
        showAlert('error', error.message || 'Network error. Please check your connection and try again.', 'fas fa-exclamation-circle');
    } finally {
        setButtonLoading('forgotSubmitBtn', false);
    }
}

// Form Validation Functions
function validateLoginForm(username, password) {
    let isValid = true;

    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');

    if (!username) {
        setFieldError(usernameInput, 'Username is required');
        isValid = false;
    }

    if (!password) {
        setFieldError(passwordInput, 'Password is required');
        isValid = false;
    }

    return isValid;
}

// Helper: extract API message from a non-ok fetch response
async function parseAPIError(response) {
    try {
        const body = await response.json();
        if (body.message) return new Error(body.message);
    } catch (_) {}
    return new Error(`HTTP error! status: ${response.status}`);
}

// API Functions - Updated to use request body instead of URL parameters
async function loginUser(username, password, rememberMe = false) {
    // Create form data for request body
    const formData = new URLSearchParams();
    formData.append('action', 'auth-login');
    formData.append('username', username);
    formData.append('password', password);
    formData.append('remember_me', rememberMe ? 'true' : 'false');

    const response = await fetch(API_CONFIG.baseURL, {
        method: 'POST',
        headers: API_CONFIG.headers,
        body: formData
    });

    // Handle server-side rate limiting — surface the server's message to the user
    if (response.status === 429) {
        let serverMsg = 'Too many login attempts. Please wait and try again.';
        try {
            const errBody = await response.json();
            if (errBody.message) serverMsg = errBody.message;
        } catch (_) {}
        throw new Error(serverMsg);
    }

    if (!response.ok) {
        throw await parseAPIError(response);
    }

    return await response.json();
}

// ---------------------------------------------------------------------------
// Microsoft (Entra ID) sign-in
//
// The button is hidden in the markup and only revealed if the backend says the
// feature is configured, so an unconfigured deployment — or one whose backend
// files have not finished uploading — shows exactly the page it showed before
// this existed. Every failure path here leaves the password form usable.
// ---------------------------------------------------------------------------

async function setupMicrosoftSignIn() {
    const container = document.getElementById('microsoftSignIn');
    const button = document.getElementById('microsoftLoginBtn');

    if (!container || !button) {
        return;
    }

    button.addEventListener('click', startMicrosoftSignIn);

    try {
        const formData = new URLSearchParams();
        formData.append('action', 'auth-microsoft_status');

        const response = await fetch(API_CONFIG.baseURL, {
            method: 'POST',
            headers: API_CONFIG.headers,
            body: formData
        });

        if (!response.ok) {
            return; // stays hidden
        }

        const body = await response.json();
        if (body && body.data && body.data.enabled === true) {
            container.classList.remove('hidden');
        }
    } catch (_) {
        // Network trouble on a probe must never block the password form.
    }
}

async function startMicrosoftSignIn() {
    const button = document.getElementById('microsoftLoginBtn');
    const label = document.getElementById('microsoftLoginBtnText');
    const originalLabel = label ? label.textContent : '';

    if (button) button.disabled = true;
    if (label) label.textContent = 'Redirecting to Microsoft…';

    try {
        // Remember-me is chosen here but applied by the callback page, so it
        // has to survive the round trip through Microsoft. sessionStorage, not
        // localStorage: the preference belongs to this sign-in attempt.
        const rememberMe = document.getElementById('rememberMe')?.checked || false;
        sessionStorage.setItem('bdc_ms_remember_me', rememberMe ? 'true' : 'false');

        const formData = new URLSearchParams();
        formData.append('action', 'auth-microsoft_start');

        const response = await fetch(API_CONFIG.baseURL, {
            method: 'POST',
            headers: API_CONFIG.headers,
            body: formData
        });

        if (response.status === 429) {
            throw new Error('Too many sign-in attempts. Please wait and try again.');
        }
        if (!response.ok) {
            throw await parseAPIError(response);
        }

        const body = await response.json();
        const authorizationUrl = body && body.data ? body.data.authorization_url : null;

        if (!authorizationUrl) {
            throw new Error(body.message || 'Could not start Microsoft sign-in.');
        }

        window.location.href = authorizationUrl;
        return; // leave the button disabled while the browser navigates away

    } catch (error) {
        showAlert('error', error.message || 'Could not start Microsoft sign-in.', 'fas fa-times-circle');
        if (button) button.disabled = false;
        if (label) label.textContent = originalLabel;
    }
}

async function forgotPasswordUser(email) {
    const formData = new URLSearchParams();
    formData.append('action', 'auth-forgot_password');
    formData.append('email', email);

    const response = await fetch(API_CONFIG.baseURL, {
        method: 'POST',
        headers: API_CONFIG.headers,
        body: formData
    });

    if (!response.ok) {
        throw await parseAPIError(response);
    }

    return await response.json();
}

// Token verification function - Updated to use request body
async function verifyToken(token) {
    try {
        const formData = new URLSearchParams();
        formData.append('action', 'auth-verify_token');

        const response = await fetch(API_CONFIG.baseURL, {
            method: 'POST',
            headers: {
                ...API_CONFIG.headers,
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (response.ok) {
            const result = await response.json();
            return result.success;
        }
        return false;
    } catch (error) {
        console.error('Token verification error:', error);
        return false;
    }
}

// Utility Functions
function setButtonLoading(buttonId, loading) {
    const button = document.getElementById(buttonId);
    if (!button) return;

    const buttonText = button.querySelector('.btn-text');
    const buttonLoader = button.querySelector('.btn-loader');

    if (loading) {
        button.classList.add('loading');
        button.disabled = true;
    } else {
        button.classList.remove('loading');
        button.disabled = false;
    }
}

function showAlert(type, message, iconClass) {
    // Use the toast notification system instead of custom alerts
    if (typeof toastNotification !== 'undefined') {
        switch (type) {
            case 'success':
                toastNotification.success(message);
                break;
            case 'error':
                toastNotification.error(message);
                break;
            case 'warning':
                toastNotification.warning(message);
                break;
            default:
                toastNotification.info(message);
        }
        return;
    }

    // Fallback to old alert system if toast is not available
    if (!alertMessage) return;

    const alertIcon = alertMessage.querySelector('.alert-icon');
    const alertText = alertMessage.querySelector('.alert-text');

    if (alertIcon && alertText) {
        // Set alert content
        alertIcon.className = `alert-icon ${iconClass}`;
        alertText.textContent = message;

        // Set alert type
        alertMessage.className = `alert ${type}`;

        // Show alert
        setTimeout(() => {
            alertMessage.classList.add('show');
        }, 100);

        // Auto hide after 5 seconds
        setTimeout(() => {
            hideAlert();
        }, 5000);
    }
}

function hideAlert() {
    if (alertMessage) {
        alertMessage.classList.remove('show');
    }
}

function closeAlert() {
    hideAlert();
}

function showLoading() {
    if (window.globalLoading) {
        window.globalLoading.show('Processing...');
    }
}

function hideLoading() {
    if (window.globalLoading) {
        window.globalLoading.hide();
    }
}

function checkExistingToken() {
    const token = localStorage.getItem('bdc_token') || sessionStorage.getItem('bdc_token');
    if (token) {
        // Verify token validity
        verifyToken(token).then(isValid => {
            if (isValid) {
                // Token is valid, redirect to dashboard
                window.location.href = 'pages/dashboard/index.html';
            } else {
                // Token is invalid, clear from both storages
                sessionStorage.removeItem('bdc_token');
                sessionStorage.removeItem('bdc_refresh_token');
                sessionStorage.removeItem('bdc_user');
                localStorage.removeItem('bdc_token');
                localStorage.removeItem('bdc_refresh_token');
                localStorage.removeItem('bdc_user');
                localStorage.removeItem('bdc_remember_me');
            }
        });
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', function (e) {
    // Enter in one of the sign-in form's own fields submits it. Only there: run
    // for every Enter on the page, this swallowed Enter on the "Forgot?" link
    // (the reset dialog never opened from the keyboard) and in the reset
    // dialog's email field (which submitted the sign-in form instead).
    if (e.key === 'Enter' && !e.shiftKey) {
        const activeForm = document.querySelector('.form-container.active form');
        if (activeForm && e.target instanceof HTMLInputElement && activeForm.contains(e.target)) {
            e.preventDefault();
            activeForm.dispatchEvent(new Event('submit'));
        }
    }

    // Escape key to close alerts
    if (e.key === 'Escape') {
        hideAlert();
    }
});

// Handle form input animations
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.input-field input').forEach(input => {
        input.addEventListener('focus', function () {
            this.parentElement.style.transform = 'translateY(-2px)';
        });

        input.addEventListener('blur', function () {
            this.parentElement.style.transform = 'translateY(0)';
        });
    });
});

// Prevent form submission on Enter in non-submit contexts
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('input:not([type="submit"])').forEach(input => {
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && this.form) {
                e.preventDefault();

                // Find next input or submit
                const inputs = Array.from(this.form.querySelectorAll('input:not([type="hidden"])'));
                const currentIndex = inputs.indexOf(this);
                const nextInput = inputs[currentIndex + 1];

                if (nextInput) {
                    nextInput.focus();
                } else {
                    this.form.dispatchEvent(new Event('submit'));
                }
            }
        });
    });
});

// Handle network status
window.addEventListener('online', function () {
    hideAlert();
    showAlert('success', 'Connection restored', 'fas fa-wifi');
});

window.addEventListener('offline', function () {
    showAlert('error', 'Connection lost. Please check your internet connection.', 'fas fa-wifi');
});

/**
 * Remove any `bdc_form_*` keys an older build left in localStorage.
 *
 * The login page used to mirror every text input — the username included — into
 * localStorage on each keystroke and restore it on load, which left the last
 * operator's username sitting on a shared machine indefinitely. The browser's
 * own autofill already does this, under the user's control, so the auto-save was
 * removed on 2026-09-21. This sweep stays so the keys it wrote are cleaned up on
 * the next successful login rather than lingering forever.
 */
function clearAutoSavedData() {
    const keys = Object.keys(localStorage).filter(key => key.startsWith('bdc_form_'));
    keys.forEach(key => localStorage.removeItem(key));
}

// Sweep up any keys the removed auto-save left behind on this machine.
document.addEventListener('DOMContentLoaded', clearAutoSavedData);
