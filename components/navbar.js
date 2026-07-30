/**
 * Shared Navbar Component
 * Handles navbar initialization, user info display, and dropdown functionality
 */

class SharedNavbar {
    constructor() {
        this.init();
    }

    /**
     * Initialize navbar
     */
    async init() {
        await this.loadNavbarHTML();
        this.initializeUserInfo();
        this.setupEventListeners();
    }

    /**
     * Load navbar HTML from component file
     */
    async loadNavbarHTML() {
        try {
            // Find the navbar placeholder
            const placeholder = document.getElementById('navbar-placeholder');
            if (!placeholder) {
                return;
            }

            // Determine the correct path based on current page location
            const currentPath = window.location.pathname;
            let navbarPath = '../components/navbar.html';

            // Adjust path based on directory depth
            if (currentPath.includes('/server/')) {
                navbarPath = '../../components/navbar.html';
            } else if (currentPath.includes('/dashboard/')) {
                navbarPath = '../../components/navbar.html';
            } else if (currentPath.includes('/forms/')) {
                navbarPath = '../../components/navbar.html';
            } else if (currentPath.includes('/pages/')) {
                navbarPath = '../components/navbar.html';
            }

            const response = await fetch(navbarPath);
            if (!response.ok) {
                throw new Error(`Failed to load navbar: ${response.status}`);
            }

            const html = await response.text();
            placeholder.innerHTML = html;
        } catch (error) {
            console.error('Error loading navbar:', error);
        }
    }

    /**
     * Initialize user information display
     */
    initializeUserInfo() {
        // Check if api object exists (from api.js)
        if (typeof api === 'undefined') {
            return;
        }

        const user = api.getUser();
        if (user) {
            // Update display name
            const displayNameElement = document.getElementById('userDisplayName');
            if (displayNameElement) {
                displayNameElement.textContent = user.name || user.username || 'User';
            }

            // Update role
            const roleElement = document.getElementById('userRole');
            if (roleElement) {
                const primaryRole = user.primary_role;
                const roles = user.roles;

                if (primaryRole) {
                    roleElement.textContent = primaryRole;
                } else if (roles && roles.length > 0) {
                    roleElement.textContent = roles[0].name || roles[0];
                } else {
                    roleElement.textContent = 'User';
                }
            }
        }
    }

    /**
     * Setup event listeners for navbar interactions
     */
    setupEventListeners() {
        // Theme toggle button
        const themeToggleBtn = document.getElementById('themeToggleBtn');
        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', () => {
                this.handleThemeToggle();
            });
        }

        // Initialize theme on load
        this.initializeTheme();

        // Dropdown toggle
        const dropdownBtn = document.querySelector('.dropdown-btn');
        if (dropdownBtn) {
            dropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const dropdown = e.target.closest('.dropdown');
                if (dropdown) {
                    dropdown.classList.toggle('active');
                }
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown')) {
                document.querySelectorAll('.dropdown.active').forEach(dropdown => {
                    dropdown.classList.remove('active');
                });
            }
        });

        // Change password button
        const changePasswordBtn = document.getElementById('changePassword');
        if (changePasswordBtn) {
            changePasswordBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleChangePassword();
            });
        }

        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleLogout();
            });
        }

    }

    /**
     * Handle change password action
     */
    handleChangePassword() {
        // Dashboard pages own a #modalContainer and their own implementation;
        // prefer it so the dialog looks the same everywhere it can.
        if (typeof dashboard !== 'undefined' && dashboard.showChangePasswordModal) {
            dashboard.showChangePasswordModal();
            return;
        }
        // Server/builder pages load neither dashboard.js nor a modal container,
        // so render a self-contained one here.
        this.showChangePasswordModal();
    }

    /**
     * Render the change-password dialog for pages without dashboard.js
     */
    showChangePasswordModal() {
        // The trigger lives inside the user dropdown; leaving it open would
        // float it above the modal backdrop.
        document.querySelector('.dropdown.active')?.classList.remove('active');

        if (document.getElementById('navbarChangePasswordOverlay')) {
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'navbarChangePasswordOverlay';
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content" style="max-width: 460px;">
                <div class="modal-header">
                    <h3 class="modal-title">Change Password</h3>
                    <button type="button" class="modal-close" id="navbarChangePasswordClose">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="navbarChangePasswordForm">
                        <div class="form-group"><label class="form-label required">Current Password</label><input type="password" id="navbarCurrentPassword" class="form-input" required></div>
                        <div class="form-group"><label class="form-label required">New Password</label><input type="password" id="navbarNewPassword" class="form-input" required minlength="8"><div class="form-help">At least 8 characters, with an uppercase letter, a number and a special character.</div></div>
                        <div class="form-group"><label class="form-label required">Confirm New Password</label><input type="password" id="navbarConfirmPassword" class="form-input" required></div>
                        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
                            <button type="button" class="btn btn-secondary" id="navbarChangePasswordCancel">Cancel</button>
                            <button type="submit" class="btn btn-primary">Change Password</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        // Next frame so the opacity transition on .active actually runs.
        requestAnimationFrame(() => overlay.classList.add('active'));

        const close = () => overlay.remove();
        overlay.querySelector('#navbarChangePasswordClose').addEventListener('click', close);
        overlay.querySelector('#navbarChangePasswordCancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        overlay.querySelector('#navbarChangePasswordForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.submitChangePassword(close);
        });

        setTimeout(() => overlay.querySelector('#navbarCurrentPassword').focus(), 100);
    }

    /**
     * Validate and submit the change-password form
     */
    async submitChangePassword(closeModal) {
        const currentPassword = document.getElementById('navbarCurrentPassword').value;
        const newPassword = document.getElementById('navbarNewPassword').value;
        const confirmPassword = document.getElementById('navbarConfirmPassword').value;

        // Mirrors the backend rules in auth_api.php assertPasswordStrength()
        const problem =
            newPassword !== confirmPassword ? 'New passwords do not match' :
            newPassword.length < 8 ? 'New password must be at least 8 characters long' :
            !/[A-Z]/.test(newPassword) ? 'New password must contain at least one uppercase letter' :
            !/[0-9]/.test(newPassword) ? 'New password must contain at least one number' :
            !/[^A-Za-z0-9]/.test(newPassword) ? 'New password must contain at least one special character' :
            null;

        if (problem) {
            toast.error(problem);
            return;
        }

        try {
            const result = await api.auth.changePassword(currentPassword, newPassword, confirmPassword);
            if (result.success) {
                closeModal();
                // Changing the password invalidates every session, including this
                // one — the current token stops working immediately.
                toast.success('Password changed successfully. Please login again.');
                api.clearAuth();
                setTimeout(() => { window.location.href = api.loginURL; }, 2000);
            }
        } catch (error) {
            console.error('Error changing password:', error);
            toast.error(error.message || 'Failed to change password');
        }
    }

    /**
     * Handle logout action
     */
    handleLogout() {
        // Clear authentication data from both storages
        sessionStorage.removeItem('bdc_token');
        sessionStorage.removeItem('jwt_token');
        sessionStorage.removeItem('bdc_refresh_token');
        sessionStorage.removeItem('bdc_user');
        localStorage.removeItem('bdc_token');
        localStorage.removeItem('bdc_refresh_token');
        localStorage.removeItem('bdc_user');
        localStorage.removeItem('bdc_remember_me');

        // Redirect to login
        window.location.href = window.BDC_CONFIG?.FRONTEND_LOGIN_URL || 'https://ims.bdcms.bharatdatacenter.com/';
    }

    /**
     * Update user display (can be called externally if user data changes)
     */
    updateUserDisplay(user) {
        if (!user) return;

        const displayNameElement = document.getElementById('userDisplayName');
        if (displayNameElement) {
            displayNameElement.textContent = user.name || user.username || 'User';
        }

        const roleElement = document.getElementById('userRole');
        if (roleElement) {
            const primaryRole = user.primary_role;
            const roles = user.roles;

            if (primaryRole) {
                roleElement.textContent = primaryRole;
            } else if (roles && roles.length > 0) {
                roleElement.textContent = roles[0].name || roles[0];
            } else {
                roleElement.textContent = 'User';
            }
        }
    }

    /**
     * Initialize theme on page load
     */
    initializeTheme() {
        if (typeof utils !== 'undefined' && utils.theme) {
            utils.theme.init();
            this.updateThemeIcon(utils.theme.get());
        }
    }

    /**
     * Handle theme toggle
     */
    handleThemeToggle() {
        if (typeof utils === 'undefined' || !utils.theme) {
            return;
        }

        // Add animation
        const toggleBtn = document.getElementById('themeToggleBtn');
        if (toggleBtn) {
            toggleBtn.classList.add('toggling');
            setTimeout(() => toggleBtn.classList.remove('toggling'), 300);
        }

        // Toggle theme
        const newTheme = utils.theme.toggle();

        // Update icon
        this.updateThemeIcon(newTheme);

        // Show toast
        if (typeof toast !== 'undefined') {
            const message = newTheme === 'dark' ? 'Dark mode enabled' : 'Light mode enabled';
            toast.success(message, 2000);
        }
    }

    /**
     * Update theme toggle icon
     */
    updateThemeIcon(theme) {
        const icon = document.getElementById('themeToggleIcon');
        if (!icon) return;

        if (theme === 'dark') {
            icon.className = 'fas fa-sun';
        } else {
            icon.className = 'fas fa-moon';
        }
    }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.sharedNavbar = new SharedNavbar();
    });
} else {
    window.sharedNavbar = new SharedNavbar();
}
