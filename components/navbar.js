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
                <!-- Notifications. Stays hidden until the API answers for this user. -->
                <div class="notif-bell hidden" id="notifBell">
                    <button id="notifBellBtn" class="theme-toggle-btn relative" aria-label="Notifications" aria-haspopup="true" aria-expanded="false" title="Notifications">
                        <i class="fas fa-bell"></i>
                        <span id="notifBadge" class="notif-badge hidden"></span>
                    </button>
                    <div class="notif-panel" id="notifPanel" role="region" aria-label="Notifications">
                        <div class="notif-panel-header">
                            <span class="text-sm font-semibold text-text-primary">Notifications</span>
                            <button type="button" id="notifMarkAll" class="notif-link-btn">Mark all as read</button>
                        </div>
                        <div class="notif-list" id="notifList"></div>
                        <div class="notif-prefs" id="notifPrefs">
                            <span>Also notify me by</span>
                            <label id="notifEmailLabel"><input type="checkbox" id="notifEmailToggle"> Email</label>
                            <label id="notifTeamsLabel"><input type="checkbox" id="notifTeamsToggle"> Teams</label>
                            <button type="button" id="notifSendTest" class="notif-link-btn ml-auto hidden">Send test</button>
                        </div>
                    </div>
                </div>

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
        this.showChangePasswordModal();
    }

    /**
     * The change-password dialog. Self-contained — it builds its own overlay
     * rather than needing a page's #modalContainer, so it is identical on all
     * 25 pages. dashboard.js carried a second copy of this (same four strength
     * rules, different modal shell) that this one was preferred over; it was
     * deleted 2026-09-21.
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

        // api.clearAuth() owns the key list — see the session-storage rules in
        // CLAUDE.md. This used to be one of six open-coded copies of it.
        api.clearAuth();

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

            // The dashboard pages uppercased primary_role and fell back to
            // "USER"; the server pages printed the first role as written. Live,
            // primary_role is absent and `roles` is a list of names, so that
            // fallback showed every user as USER. One rule now: whichever role we
            // have, uppercased.
            const role = primaryRole || (roles && roles.length ? (roles[0].name || roles[0]) : '');
            roleElement.textContent = role ? String(role).replace(/_/g, ' ').toUpperCase() : 'USER';
        }
    }
}

/**
 * The notification bell.
 *
 * Starts on DOMContentLoaded, not at mount: navbar.js is parsed before api.js on
 * most pages. The bell stays hidden unless notification-unread-count answers, so
 * a role without notification.view — or a server whose seeder has not run —
 * simply shows no bell. Unread count is polled once a minute while the tab is
 * visible; that poll is also what drives the backend's email/Teams retries.
 *
 * Items are built with textContent, never innerHTML — titles carry Request
 * names typed by users.
 */
class NotificationBell {
    constructor() {
        this.root = document.getElementById('notifBell');
        this.unread = 0;
        this.prefs = null;
        this.listLoaded = false;
        if (!this.root) {
            return;
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.start());
        } else {
            setTimeout(() => this.start(), 0);
        }
    }

    el(id) {
        return document.getElementById(id);
    }

    async start() {
        if (typeof api === 'undefined' || !api.notifications || !api.getToken()) {
            return;
        }
        try {
            const result = await api.notifications.unreadCount();
            this.setUnread(result.data?.unread_count || 0);
        } catch (error) {
            return;
        }

        this.root.classList.remove('hidden');
        this.bind();
        setInterval(() => this.poll(), 60000);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.poll();
        });
    }

    bind() {
        const btn = this.el('notifBellBtn');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.isOpen() ? this.close() : this.open();
        });

        // Capture phase: the user-menu button stops propagation, and opening it
        // must still close this panel.
        document.addEventListener('click', (e) => {
            if (this.isOpen() && !e.target.closest('#notifBell')) this.close();
        }, true);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen()) {
                this.close();
                btn.focus();
            }
        });

        this.el('notifMarkAll').addEventListener('click', () => this.markAllRead());
        this.el('notifEmailToggle').addEventListener('change', (e) => this.savePref('email_enabled', e.target));
        this.el('notifTeamsToggle').addEventListener('change', (e) => this.savePref('teams_enabled', e.target));

        const testBtn = this.el('notifSendTest');
        if (api.utils?.hasPermission('notification.manage')) {
            testBtn.classList.remove('hidden');
            testBtn.addEventListener('click', () => this.sendTest(testBtn));
        }
    }

    isOpen() {
        return this.root.classList.contains('active');
    }

    open() {
        document.querySelectorAll('.dropdown.active').forEach((d) => d.classList.remove('active'));
        this.root.classList.add('active');
        this.el('notifBellBtn').setAttribute('aria-expanded', 'true');
        this.loadList();
        if (!this.prefs) {
            this.loadPrefs();
        }
    }

    close() {
        this.root.classList.remove('active');
        this.el('notifBellBtn').setAttribute('aria-expanded', 'false');
    }

    setUnread(count) {
        this.unread = Number(count) || 0;
        const badge = this.el('notifBadge');
        badge.textContent = this.unread > 99 ? '99+' : String(this.unread);
        badge.classList.toggle('hidden', this.unread === 0);
        this.el('notifMarkAll').disabled = this.unread === 0;
        this.el('notifBellBtn').setAttribute(
            'aria-label',
            this.unread ? `Notifications, ${this.unread} unread` : 'Notifications'
        );
    }

    async poll() {
        if (document.hidden) return;
        try {
            const result = await api.notifications.unreadCount();
            const previous = this.unread;
            this.setUnread(result.data?.unread_count || 0);
            if (this.isOpen() && this.unread !== previous) {
                this.loadList();
            }
        } catch (error) {
            // A missed poll is not worth a toast; the next one will try again.
        }
    }

    async loadList() {
        if (!this.listLoaded) {
            this.renderMessage('Loading…');
        }
        try {
            const result = await api.notifications.list({ limit: 20 });
            this.listLoaded = true;
            this.setUnread(result.data?.unread_count || 0);
            this.renderItems(result.data?.items || []);
        } catch (error) {
            this.renderMessage("Couldn't load notifications. Try again in a moment.");
        }
    }

    renderMessage(text) {
        const list = this.el('notifList');
        list.replaceChildren();
        const empty = document.createElement('div');
        empty.className = 'notif-empty';
        empty.textContent = text;
        list.appendChild(empty);
    }

    renderItems(items) {
        if (!items.length) {
            this.renderMessage("You're all caught up. Requests that need you will show up here.");
            return;
        }

        const list = this.el('notifList');
        list.replaceChildren();
        items.forEach((item) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'notif-item' + (item.read ? '' : ' is-unread');

            const dot = document.createElement('span');
            dot.className = 'notif-dot';
            dot.setAttribute('aria-hidden', 'true');

            const text = document.createElement('span');
            text.className = 'flex-1 min-w-0';

            const title = document.createElement('span');
            title.className = 'notif-item-title';
            title.textContent = item.title;
            text.appendChild(title);

            if (item.body) {
                const body = document.createElement('span');
                body.className = 'notif-item-body';
                body.textContent = item.body;
                text.appendChild(body);
            }

            const time = document.createElement('span');
            time.className = 'notif-item-time';
            time.textContent = this.formatTime(item.created_at);
            text.appendChild(time);

            row.append(dot, text);
            row.addEventListener('click', () => this.openItem(item, row));
            list.appendChild(row);
        });
    }

    async openItem(item, row) {
        if (!item.read) {
            try {
                const result = await api.notifications.markRead(item.id);
                item.read = true;
                row.classList.remove('is-unread');
                this.setUnread(result.data?.unread_count ?? Math.max(0, this.unread - 1));
            } catch (error) {
                // Opening the request matters more than the read flag.
            }
        }
        if (item.link) {
            // Every page sits two levels below the UI root.
            window.location.href = '../../' + item.link;
        }
    }

    async markAllRead() {
        const btn = this.el('notifMarkAll');
        btn.disabled = true;
        try {
            await api.notifications.markAllRead();
            this.setUnread(0);
            this.el('notifList').querySelectorAll('.notif-item.is-unread')
                .forEach((row) => row.classList.remove('is-unread'));
        } catch (error) {
            toast.error(error.message || "Couldn't mark notifications as read");
            btn.disabled = this.unread === 0;
        }
    }

    async loadPrefs() {
        try {
            const result = await api.notifications.getPreferences();
            this.applyPrefs(result.data);
        } catch (error) {
            this.el('notifPrefs').classList.add('hidden');
        }
    }

    applyPrefs(prefs) {
        if (!prefs) return;
        this.prefs = prefs;
        const noEmail = 'Your IMS account has no email address';
        this.applyToggle('notifEmail', prefs.email_enabled, prefs.email_available, noEmail);
        this.applyToggle(
            'notifTeams',
            prefs.teams_enabled,
            prefs.teams_available,
            prefs.has_email ? "Teams notifications aren't set up yet" : noEmail
        );
    }

    applyToggle(prefix, enabled, available, unavailableReason) {
        const input = this.el(prefix + 'Toggle');
        const label = this.el(prefix + 'Label');
        input.checked = Boolean(enabled && available);
        input.disabled = !available;
        label.classList.toggle('is-unavailable', !available);
        label.title = available ? '' : unavailableReason;
    }

    async savePref(key, input) {
        const wanted = input.checked;
        input.disabled = true;
        try {
            const result = await api.notifications.setPreferences({ [key]: wanted ? 1 : 0 });
            this.applyPrefs(result.data);
            const channel = key === 'email_enabled' ? 'Email' : 'Teams';
            toast.success(`${channel} notifications turned ${wanted ? 'on' : 'off'}`);
        } catch (error) {
            input.checked = !wanted;
            input.disabled = false;
            toast.error(error.message || "Couldn't save your notification preference");
        }
    }

    async sendTest(btn) {
        btn.disabled = true;
        try {
            const result = await api.notifications.sendTest();
            const d = result.data || {};
            const email = d.email?.sent
                ? `Email: sent (${d.email.transport === 'graph' ? 'Microsoft 365' : 'server mail'})`
                : `Email: failed — ${d.email?.error || 'unknown error'}`;
            const teams = !d.teams?.configured
                ? "Teams: isn't set up yet"
                : (d.teams.sent ? 'Teams: sent' : `Teams: failed — ${d.teams.error || 'unknown error'}`);
            const message = `Test notification sent. ${email}. ${teams}.`;
            if (d.email?.sent && d.teams?.sent) {
                toast.success(message);
            } else {
                toast.warning(message);
            }
            this.loadList();
        } catch (error) {
            toast.error(error.message || "Couldn't send the test notification");
        } finally {
            btn.disabled = false;
        }
    }

    /**
     * Timestamps are UTC without an offset (see requests.js fmtDate); shown
     * relative while recent, then as an IST date.
     */
    formatTime(value) {
        if (!value) return '';
        const d = new Date(String(value).replace(' ', 'T') + 'Z');
        if (isNaN(d.getTime())) return value;
        const minutes = Math.round((Date.now() - d.getTime()) / 60000);
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes} min ago`;
        if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
        return d.toLocaleDateString('en-US', {
            timeZone: 'Asia/Kolkata',
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }
}

// Mount as soon as the placeholder exists — at parse time when the <script> tag
// follows it, otherwise on DOMContentLoaded.
function _mountNavbar() {
    if (!window.sharedNavbar) {
        window.sharedNavbar = new SharedNavbar();
        window.notificationBell = new NotificationBell();
    }
}

if (document.getElementById('navbar-placeholder') || document.readyState !== 'loading') {
    _mountNavbar();
} else {
    document.addEventListener('DOMContentLoaded', _mountNavbar);
}
