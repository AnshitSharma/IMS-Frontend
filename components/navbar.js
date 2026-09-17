/**
 * Shared Navbar Component
 *
 * The navbar markup lives here, in one place, and is injected into
 * <div id="navbar-placeholder"></div>. It used to be fetched from
 * components/navbar.html, but a fetch cannot complete before the other page
 * scripts run their DOMContentLoaded handlers, and several of them
 * (dashboard.js, sidebar-manager.js) bind to elements inside the navbar. So the
 * markup is a template literal and the mount is synchronous: put the <script>
 * tag anywhere after the placeholder and the navbar exists before any
 * DOMContentLoaded handler fires.
 */

const NAVBAR_HTML = `
<nav class="navbar bg-surface-card shadow-sm sticky top-0 z-navbar">
    <div class="nav-container max-w-screen-4xl mx-auto navbar-padding py-3 flex items-center justify-between">
        <!-- Mobile Hamburger + Brand -->
        <div class="flex items-center gap-3">
            <!-- Hamburger Menu Button (Mobile Only) -->
            <button
                class="hamburger-menu lg:hidden bg-surface-secondary hover:bg-surface-hover text-text-secondary hover:text-primary rounded-lg p-2 transition-colors border border-border-light"
                id="hamburgerBtn" aria-label="Toggle Menu">
                <i class="fas fa-bars text-base"></i>
            </button>
            <a href="#" id="navbarBrandLink"
                class="nav-brand flex items-center gap-2 text-primary font-semibold text-lg hover:opacity-80 transition-opacity">
                <i class="fas fa-server"></i>
                <span>BDC Inventory</span>
            </a>
        </div>

        <div class="nav-menu flex items-center gap-4">
            <div class="nav-user flex items-center gap-3">
                <!-- Theme Toggle Button -->
                <button id="themeToggleBtn" class="theme-toggle-btn" aria-label="Toggle theme" title="Toggle dark mode">
                    <i class="fas fa-moon" id="themeToggleIcon"></i>
                </button>

                <div class="user-info text-right hidden md:block">
                    <span id="userDisplayName" class="block text-sm font-medium text-text-primary">Loading...</span>
                    <span id="userRole" class="block text-xs text-text-muted">User</span>
                </div>
                <div class="user-avatar w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center">
                    <i class="fas fa-user"></i>
                </div>
                <div class="dropdown relative">
                    <button class="dropdown-btn text-text-secondary hover:text-text-primary">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                    <div
                        class="dropdown-content absolute right-0 mt-2 w-48 bg-surface-card rounded-lg shadow-lg border border-border hidden z-dropdown">
                        <a href="#" id="changePassword"
                            class="block px-4 py-2 text-sm text-text-primary hover:bg-surface-hover flex items-center gap-2">
                            <i class="fas fa-key"></i> Change Password
                        </a>
                        <a href="#" id="logoutBtn"
                            class="block px-4 py-2 text-sm text-text-primary hover:bg-surface-hover flex items-center gap-2">
                            <i class="fas fa-sign-out-alt"></i> Logout
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </div>
</nav>
`;

class SharedNavbar {
    constructor() {
        this.render();
        this.initializeUserInfo();
        this.setupEventListeners();
    }

    /**
     * Inject the navbar markup and point the brand at the dashboard home.
     */
    render() {
        const placeholder = document.getElementById('navbar-placeholder');
        if (!placeholder) {
            return;
        }

        placeholder.innerHTML = NAVBAR_HTML;

        // The brand is a home link. pages/dashboard/ sits next to index.html;
        // pages/server/ and pages/forms/ are one directory over.
        const brand = document.getElementById('navbarBrandLink');
        if (brand) {
            brand.setAttribute(
                'href',
                window.location.pathname.includes('/dashboard/')
                    ? './index.html'
                    : '../dashboard/index.html'
            );
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
        this.updateUserDisplay(api.getUser());
    }

    /**
     * Setup event listeners for navbar interactions
     */
    setupEventListeners() {
        // The theme toggle is owned by utils.theme, which binds it once and
        // guards against a second listener. Calling it here covers the case
        // where utils.js already ran its own DOMContentLoaded handler before
        // this navbar existed.
        if (typeof utils !== 'undefined' && utils.theme) {
            utils.theme.mountToggle();
        }

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
        // Dashboard pages confirm first and tell the backend to revoke the
        // token; prefer that over dropping the session on the floor.
        if (typeof dashboard !== 'undefined' && dashboard.handleLogout) {
            dashboard.handleLogout();
            return;
        }

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
            const fullName = [user.firstname, user.lastname].filter(Boolean).join(' ');
            displayNameElement.textContent = fullName || user.name || user.username || 'User';
        }

        const roleElement = document.getElementById('userRole');
        if (roleElement) {
            const primaryRole = user.primary_role;
            const roles = user.roles;

            if (primaryRole) {
                roleElement.textContent = primaryRole.replace(/_/g, ' ').toUpperCase();
            } else if (roles && roles.length > 0) {
                roleElement.textContent = roles[0].name || roles[0];
            } else {
                roleElement.textContent = 'USER';
            }
        }
    }
}

// Mount as soon as the placeholder exists — at parse time when the <script> tag
// follows it, otherwise on DOMContentLoaded.
function _mountNavbar() {
    if (!window.sharedNavbar) {
        window.sharedNavbar = new SharedNavbar();
    }
}

if (document.getElementById('navbar-placeholder') || document.readyState !== 'loading') {
    _mountNavbar();
} else {
    document.addEventListener('DOMContentLoaded', _mountNavbar);
}
