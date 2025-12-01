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
                console.warn('Navbar placeholder not found');
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
            console.warn('API not loaded, using fallback user info');
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

        // Global search (if needed in specific pages)
        const globalSearch = document.getElementById('globalSearch');
        if (globalSearch) {
            globalSearch.addEventListener('input', (e) => {
                this.handleGlobalSearch(e.target.value);
            });
        }
    }

    /**
     * Handle change password action
     */
    handleChangePassword() {
        // Check if we're on dashboard (which has modal)
        if (typeof dashboard !== 'undefined' && dashboard.showChangePasswordModal) {
            dashboard.showChangePasswordModal();
        } else {
            // Redirect to change password page
            window.location.href = '../pages/change-password.html';
        }
    }

    /**
     * Handle logout action
     */
    handleLogout() {
        // Clear authentication data
        localStorage.removeItem('bdc_token');
        localStorage.removeItem('jwt_token');
        localStorage.removeItem('bdc_refresh_token');
        localStorage.removeItem('bdc_user');

        // Redirect to login
        window.location.href = '/ims_frontend/';
    }

    /**
     * Handle global search (override this in specific pages if needed)
     */
    handleGlobalSearch(query) {
        // This can be overridden by specific pages
        // For now, just log it
        console.log('Global search:', query);
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
            console.warn('Theme utilities not loaded');
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
