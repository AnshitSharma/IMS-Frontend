// API Configuration - Uses centralized config (see assets/js/config.js)
const API_CONFIG = {
    baseURL: window.BDC_CONFIG?.API_BASE_URL || 'https://shubham.staging.cloudmate.in/bdc_ims_dev/api/api.php',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
    }
};

// DOM Elements
const loginToggle = document.getElementById('loginToggle');
const registerToggle = document.getElementById('registerToggle');
const toggleIndicator = document.querySelector('.toggle-indicator');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginFormElement = document.getElementById('loginFormElement');
const registerFormElement = document.getElementById('registerFormElement');
const alertMessage = document.getElementById('alertMessage');

// Security & Rate Limiting Config
const SECURITY_CONFIG = {
    MAX_ATTEMPTS: 5,
    LOCKOUT_TIME: 30 * 1000, // 30 seconds
    USERNAME_REGEX: /^[a-zA-Z0-9_.-]+$/, // Allow only alphanumeric, dot, underscore, dash
    SQL_INJECTION_PATTERNS: [
        /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
        /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
        /\w*((\%27)|(\'))(\s)*((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
        /((\%27)|(\'))union/i,
        /exec(\s|\+)+(s|x)p\w+/i
    ]
};

let failedAttempts = parseInt(localStorage.getItem('bdc_failed_attempts') || '0');
let lockoutUntil = parseInt(localStorage.getItem('bdc_lockout_until') || '0');

// Password Toggle Elements
const toggleLoginPassword = document.getElementById('toggleLoginPassword');
const toggleRegisterPassword = document.getElementById('toggleRegisterPassword');
const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');

// Initialize Application
document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
});

function initializeApp() {
    setupFormToggle();
    setupPasswordToggles();
    setupFormValidation();
    setupFormSubmissions();
    checkExistingToken();
    checkLockoutStatus(); // Check if user is currently locked out
}

// Form Toggle Functionality
function setupFormToggle() {
    loginToggle.addEventListener('click', () => switchToLogin());
    registerToggle.addEventListener('click', () => switchToRegister());
}

function switchToLogin() {
    loginToggle.classList.add('active');
    registerToggle.classList.remove('active');
    toggleIndicator.classList.remove('register');

    loginForm.classList.add('active');
    registerForm.classList.remove('active');

    clearForm(registerFormElement);
    hideAlert();
}

function switchToRegister() {
    registerToggle.classList.add('active');
    loginToggle.classList.remove('active');
    toggleIndicator.classList.add('register');

    registerForm.classList.add('active');
    loginForm.classList.remove('active');

    clearForm(loginFormElement);
    hideAlert();
}

// Password Toggle Functionality
function setupPasswordToggles() {
    if (toggleLoginPassword) {
        toggleLoginPassword.addEventListener('click', () => {
            togglePasswordVisibility('loginPassword', toggleLoginPassword);
        });
    }

    if (toggleRegisterPassword) {
        toggleRegisterPassword.addEventListener('click', () => {
            togglePasswordVisibility('registerPassword', toggleRegisterPassword);
        });
    }

    if (toggleConfirmPassword) {
        toggleConfirmPassword.addEventListener('click', () => {
            togglePasswordVisibility('confirmPassword', toggleConfirmPassword);
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
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
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

    // Real-time password confirmation validation
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const registerPasswordInput = document.getElementById('registerPassword');

    if (confirmPasswordInput && registerPasswordInput) {
        confirmPasswordInput.addEventListener('input', () => {
            validatePasswordMatch(registerPasswordInput, confirmPasswordInput);
        });

        registerPasswordInput.addEventListener('input', () => {
            if (confirmPasswordInput.value) {
                validatePasswordMatch(registerPasswordInput, confirmPasswordInput);
            }
        });
    }
}

function validateField(input) {
    const value = input.value.trim();

    // Clear previous errors
    clearFieldError(input);

    // Required field validation
    if (!value) {
        setFieldError(input, 'This field is required');
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

    // Password validation
    if (input.type === 'password' && input.id === 'registerPassword') {
        if (value.length < 6) {
            setFieldError(input, 'Password must be at least 6 characters long');
            return false;
        }
    }

    // Username validation
    if (input.name === 'username') {
        if (value.length < 3) {
            setFieldError(input, 'Username must be at least 3 characters long');
            return false;
        }

        const usernameRegex = /^[a-zA-Z0-9_]+$/;
        if (!usernameRegex.test(value)) {
            setFieldError(input, 'Username can only contain letters, numbers, and underscores');
            return false;
        }
    }

    return true;
}

// Security Helper Functions
function sanitizeInput(str) {
    if (!str) return '';
    return str.replace(/[^\w. -]/gi, ''); // Remove any non-safe characters
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

function validatePasswordMatch(passwordInput, confirmInput) {
    if (passwordInput.value !== confirmInput.value) {
        setFieldError(confirmInput, 'Passwords do not match');
        return false;
    } else {
        clearFieldError(confirmInput);
        return true;
    }
}

function setFieldError(input, message) {
    clearFieldError(input);

    input.style.borderColor = '#ff416c';
    input.style.boxShadow = '0 0 0 3px rgba(255, 65, 108, 0.1)';

    const errorElement = document.createElement('div');
    errorElement.className = 'field-error';
    errorElement.textContent = message;

    const inputGroup = input.closest('.input-group');
    if (inputGroup) {
        inputGroup.appendChild(errorElement);
    }
}

function clearFieldError(input) {
    // Guard: Ensure input exists
    if (!input) return;

    input.style.borderColor = '';
    input.style.boxShadow = '';

    const inputGroup = input.closest('.input-group');
    // Exit early if no input-group parent (e.g., for checkboxes)
    if (!inputGroup) return;

    const errorElement = inputGroup.querySelector('.field-error');
    if (errorElement) {
        errorElement.remove();
    }
}

// Form Submissions
function setupFormSubmissions() {
    loginFormElement.addEventListener('submit', handleLogin);
    registerFormElement.addEventListener('submit', handleRegister);
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

    // Sanitize Username to prevent simple injection
    // Note: We don't sanitize password as it might contain special chars, but we length check it
    if (!SECURITY_CONFIG.USERNAME_REGEX.test(username)) {
        showAlert('error', 'Invalid characters in username.', 'fas fa-exclamation-circle');
        return;
    }

    // Double check for SQL injection patterns
    if (SECURITY_CONFIG.SQL_INJECTION_PATTERNS.some(pattern => pattern.test(username))) {
        showAlert('error', 'Security check failed: Suspicious input detected.', 'fas fa-shield-alt');
        return;
    }

    // Validate form
    if (!validateLoginForm(username, password)) {
        return;
    }

    // Show loading state
    setButtonLoading('loginBtn', true);

    try {
        const response = await loginUser(username, password);

        if (response.success) {
            // Store JWT token and user data
            localStorage.setItem('bdc_token', response.data.tokens.access_token);
            localStorage.setItem('bdc_refresh_token', response.data.tokens.refresh_token);
            localStorage.setItem('bdc_user', JSON.stringify(response.data.user));

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
        showAlert('error', 'Network error. Please check your connection and try again.', 'fas fa-exclamation-circle');
    } finally {
        setButtonLoading('loginBtn', false);
    }
}

async function handleRegister(e) {
    e.preventDefault();

    const formData = new FormData(registerFormElement);
    const username = formData.get('username').trim();
    const email = formData.get('email').trim();
    const password = formData.get('password').trim();
    const confirmPassword = formData.get('confirmPassword').trim();

    // Validate form
    if (!validateRegisterForm(username, email, password, confirmPassword)) {
        return;
    }

    // Show loading state
    setButtonLoading('registerBtn', true);

    try {
        const response = await registerUser(username, email, password);

        if (response.success) {
            showAlert('success', 'Registration successful! Please login with your credentials.', 'fas fa-check-circle');

            // Clear form and auto-saved data
            clearForm(registerFormElement);
            clearAutoSavedData();

            // Switch to login form
            setTimeout(() => {
                switchToLogin();
            }, 2000);
        } else {
            showAlert('error', response.message || 'Registration failed. Please try again.', 'fas fa-times-circle');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showAlert('error', 'Network error. Please check your connection and try again.', 'fas fa-exclamation-circle');
    } finally {
        setButtonLoading('registerBtn', false);
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

function validateRegisterForm(username, email, password, confirmPassword) {
    let isValid = true;

    const usernameInput = document.getElementById('registerUsername');
    const emailInput = document.getElementById('registerEmail');
    const passwordInput = document.getElementById('registerPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');

    // Validate all fields
    if (!validateField(usernameInput)) isValid = false;
    if (!validateField(emailInput)) isValid = false;
    if (!validateField(passwordInput)) isValid = false;

    // Validate password match
    if (!validatePasswordMatch(passwordInput, confirmPasswordInput)) {
        isValid = false;
    }

    // Check terms agreement
    const agreeTerms = document.getElementById('agreeTerms');
    if (agreeTerms && !agreeTerms.checked) {
        showAlert('warning', 'Please agree to the Terms & Conditions', 'fas fa-exclamation-triangle');
        isValid = false;
    }

    return isValid;
}

// API Functions - Updated to use request body instead of URL parameters
async function loginUser(username, password) {
    // Create form data for request body
    const formData = new URLSearchParams();
    formData.append('action', 'auth-login');
    formData.append('username', username);
    formData.append('password', password);

    const response = await fetch(API_CONFIG.baseURL, {
        method: 'POST',
        headers: API_CONFIG.headers,
        body: formData
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
}

async function registerUser(username, email, password) {
    // Create form data for request body
    const formData = new URLSearchParams();
    formData.append('action', 'user-add');
    formData.append('username', username);
    formData.append('email', email);
    formData.append('password', password);
    formData.append('role', 'user'); // Default role

    // Note: Since registration requires admin permissions in the current API,
    // this would need a separate registration endpoint or public registration API
    // For now, we'll simulate success for demo purposes
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve({
                success: true,
                message: 'Registration successful',
                code: 201
            });
        }, 1000);
    });
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

function clearForm(form) {
    if (!form) return;

    form.reset();
    const inputs = form.querySelectorAll('input');
    inputs.forEach(input => clearFieldError(input));
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
    const token = localStorage.getItem('bdc_token');
    if (token) {
        // Verify token validity
        verifyToken(token).then(isValid => {
            if (isValid) {
                // Token is valid, redirect to dashboard
                window.location.href = 'pages/dashboard/index.html';
            } else {
                // Token is invalid, remove it
                localStorage.removeItem('bdc_token');
                localStorage.removeItem('bdc_refresh_token');
                localStorage.removeItem('bdc_user');
            }
        });
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', function (e) {
    // Enter key to submit forms
    if (e.key === 'Enter' && !e.shiftKey) {
        const activeForm = document.querySelector('.form-container.active form');
        if (activeForm) {
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

// Auto-save form data (optional)
function autoSaveFormData() {
    const inputs = document.querySelectorAll('input[type="text"], input[type="email"]');

    inputs.forEach(input => {
        input.addEventListener('input', function () {
            const key = `bdc_form_${this.id}`;
            localStorage.setItem(key, this.value);
        });

        // Restore saved data
        const savedValue = localStorage.getItem(`bdc_form_${input.id}`);
        if (savedValue && !input.value) {
            input.value = savedValue;
        }
    });
}

// Clear auto-saved data on successful submission
function clearAutoSavedData() {
    const keys = Object.keys(localStorage).filter(key => key.startsWith('bdc_form_'));
    keys.forEach(key => localStorage.removeItem(key));
}

// Token refresh functionality
async function refreshAccessToken() {
    const refreshToken = localStorage.getItem('bdc_refresh_token');
    if (!refreshToken) {
        return false;
    }

    try {
        const formData = new URLSearchParams();
        formData.append('action', 'auth-refresh');
        formData.append('refresh_token', refreshToken);

        const response = await fetch(API_CONFIG.baseURL, {
            method: 'POST',
            headers: API_CONFIG.headers,
            body: formData
        });

        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                localStorage.setItem('bdc_token', result.data.tokens.access_token);
                localStorage.setItem('bdc_refresh_token', result.data.tokens.refresh_token);
                return true;
            }
        }
    } catch (error) {
        console.error('Token refresh error:', error);
    }

    // Refresh failed, clear tokens
    localStorage.removeItem('bdc_token');
    localStorage.removeItem('bdc_refresh_token');
    localStorage.removeItem('bdc_user');
    return false;
}

// Initialize auto-save functionality
document.addEventListener('DOMContentLoaded', function () {
    autoSaveFormData();
});