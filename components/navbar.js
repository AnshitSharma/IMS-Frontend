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
                            <span class="notif-heading">Notifications</span>
                            <div class="notif-tabs" role="tablist" aria-label="Show">
                                <button type="button" role="tab" class="notif-tab" id="notifTabUnread" data-tab="unread" aria-selected="true">Unread <span id="notifTabCount"></span></button>
                                <button type="button" role="tab" class="notif-tab" id="notifTabAll" data-tab="all" aria-selected="false">All</button>
                            </div>
                            <button type="button" id="notifMarkAll" class="notif-link-btn">Mark all read</button>
                        </div>
                        <div class="notif-list" id="notifList"></div>
                        <div class="notif-prefs" id="notifPrefs">
                            <span>Also send to</span>
                            <label id="notifEmailLabel"><input type="checkbox" id="notifEmailToggle"> Email</label>
                            <label id="notifTeamsLabel"><input type="checkbox" id="notifTeamsToggle"> Teams</label>
                            <button type="button" id="notifSendTest" class="notif-link-btn hidden">Send test</button>
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
                    <button type="button" class="dropdown-btn text-text-secondary hover:text-text-primary"
                        aria-label="Account menu" aria-expanded="false" aria-controls="userMenu">
                        <i class="fas fa-chevron-down" aria-hidden="true"></i>
                    </button>
                    <div class="dropdown-content um-menu" id="userMenu">
                        <a href="#" id="changePassword" class="um-item">
                            <i class="fas fa-key" aria-hidden="true"></i> Change password
                        </a>
                        <div class="um-sep" role="separator"></div>
                        <a href="#" id="logoutBtn" class="um-item is-danger">
                            <i class="fas fa-sign-out-alt" aria-hidden="true"></i> Sign out
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

            // Four places open or close the menu by toggling .active; this
            // keeps the button's announced state in step with all of them.
            const dropdown = dropdownBtn.closest('.dropdown');
            if (dropdown) {
                new MutationObserver(() => {
                    dropdownBtn.setAttribute('aria-expanded', String(dropdown.classList.contains('active')));
                }).observe(dropdown, { attributes: true, attributeFilter: ['class'] });

                dropdown.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape' && dropdown.classList.contains('active')) {
                        dropdown.classList.remove('active');
                        dropdownBtn.focus();
                    }
                });
            }
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
                    <h3 class="modal-title" id="navbarChangePasswordTitle">Change Password</h3>
                    <button type="button" class="modal-close" id="navbarChangePasswordClose" aria-label="Close dialog"><span aria-hidden="true">&times;</span></button>
                </div>
                <div class="modal-body">
                    <form id="navbarChangePasswordForm">
                        <div class="form-group"><label class="form-label required" for="navbarCurrentPassword">Current Password</label><input type="password" id="navbarCurrentPassword" class="form-input" required autocomplete="current-password"></div>
                        <div class="form-group"><label class="form-label required" for="navbarNewPassword">New Password</label><input type="password" id="navbarNewPassword" class="form-input" required minlength="8" autocomplete="new-password" aria-describedby="navbarNewPasswordHelp"><div class="form-help" id="navbarNewPasswordHelp">At least 8 characters, with an uppercase letter, a number and a special character.</div></div>
                        <div class="form-group"><label class="form-label required" for="navbarConfirmPassword">Confirm New Password</label><input type="password" id="navbarConfirmPassword" class="form-input" required autocomplete="new-password"></div>
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

        // Opened from inside the account menu, which has just closed; focus goes
        // back to the menu button rather than to a link that is now hidden.
        document.querySelector('.dropdown-btn')?.focus();
        const release = typeof utils !== 'undefined' && typeof utils.dialog === 'function'
            ? utils.dialog(overlay.querySelector('.modal-content'), {
                labelledBy: 'navbarChangePasswordTitle',
                initialFocus: '#navbarCurrentPassword',
                onEscape: () => close()
            })
            : () => {};
        const close = () => { release(); overlay.remove(); };
        overlay.querySelector('#navbarChangePasswordClose').addEventListener('click', close);
        overlay.querySelector('#navbarChangePasswordCancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        overlay.querySelector('#navbarChangePasswordForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.submitChangePassword(close);
        });
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
    // Events that hand the reader a step. Whether one still "needs you" is
    // checked against the request itself (see needsYou), not the read flag.
    static ACTION_EVENTS = ['stage_activated', 'stage_reassigned'];
    static ALERT_EVENTS = ['pipeline_rejected', 'pipeline_cancelled'];

    constructor() {
        this.root = document.getElementById('notifBell');
        this.unread = 0;
        this.prefs = null;
        this.listLoaded = false;
        this.items = [];
        this.tab = 'unread';
        this.tabChosen = false;
        // ticket_id -> { pipeline, at }: the requests behind action items, so
        // the panel can say which step is waiting and offer to accept it.
        this.requests = new Map();
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

        ['notifTabUnread', 'notifTabAll'].forEach((id) => {
            this.el(id).addEventListener('click', (e) => {
                this.tabChosen = true;
                this.setTab(e.currentTarget.dataset.tab);
                this.render();
            });
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
        // Opens on Unread when there is something unread, unless the reader
        // has picked a tab this page view.
        if (!this.tabChosen) this.setTab(this.unread ? 'unread' : 'all');
        this.loadList();
        if (!this.prefs) {
            this.loadPrefs();
        }
    }

    close() {
        this.root.classList.remove('active');
        this.el('notifBellBtn').setAttribute('aria-expanded', 'false');
    }

    setTab(tab) {
        this.tab = tab === 'all' ? 'all' : 'unread';
        this.el('notifTabUnread').setAttribute('aria-selected', String(this.tab === 'unread'));
        this.el('notifTabAll').setAttribute('aria-selected', String(this.tab === 'all'));
    }

    setUnread(count) {
        this.unread = Number(count) || 0;
        const label = this.unread > 99 ? '99+' : String(this.unread);
        const badge = this.el('notifBadge');
        badge.textContent = label;
        badge.classList.toggle('hidden', this.unread === 0);
        this.el('notifTabCount').textContent = this.unread ? label : '';
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
            const result = await api.notifications.list({ limit: 30 });
            this.listLoaded = true;
            this.items = result.data?.items || [];
            this.setUnread(result.data?.unread_count || 0);
            this.render();
            this.loadRequests();
        } catch (error) {
            this.renderMessage("Couldn't load notifications. Try again in a moment.");
        }
    }

    /**
     * Fetch the requests behind the newest action items (at most six, each
     * reused for a minute) so the panel can tell whether the step is still
     * waiting on the reader. A request the reader cannot open simply stays
     * unknown, and the item falls back to its read flag.
     */
    async loadRequests() {
        const now = Date.now();
        const ids = [...new Set(this.items
            .filter((i) => NotificationBell.ACTION_EVENTS.includes(i.event) && i.ticket_id)
            .map((i) => i.ticket_id))]
            .filter((id) => !(this.requests.get(id)?.at > now - 60000))
            .slice(0, 6);
        if (!ids.length) return;

        await Promise.all(ids.map(async (id) => {
            try {
                const result = await api.requestEnvelope('pipeline-get', { pipeline_id: id });
                this.requests.set(id, { pipeline: result.success ? result.data?.pipeline || null : null, at: Date.now() });
            } catch (error) {
                this.requests.set(id, { pipeline: null, at: Date.now() });
            }
        }));
        if (this.isOpen()) this.render();
    }

    currentStage(p) {
        const stages = Array.isArray(p?.stages) ? p.stages : [];
        return stages.find((s) => Number(s.id) === Number(p.current_stage_progress_id))
            || stages.find((s) => s.status === 'active')
            || null;
    }

    me() {
        return (typeof api !== 'undefined' && api.getUser && api.getUser()) || {};
    }

    // Same three keys as RequestsManager.ownsRole(): the session carries role
    // slugs, a step owner carries id, slug and display name.
    ownsRole(owner) {
        if (!owner || owner.type !== 'role') return false;
        const roles = Array.isArray(this.me().roles) ? this.me().roles : [];
        const ids = roles.map((r) => (typeof r === 'object' ? Number(r.id) : null)).filter(Boolean);
        if (ids.includes(Number(owner.id))) return true;
        const held = roles.map((r) => String(typeof r === 'string' ? r : (r.name || r.display_name || '')).toLowerCase());
        return [owner.slug, owner.name].some((k) => k && held.includes(String(k).toLowerCase()));
    }

    waitingOnMe(p) {
        const stage = this.currentStage(p);
        if (!p || p.status !== 'in_progress' || !stage) return false;
        const myId = Number(this.me().id);
        if (stage.claimed_by) return Number(stage.claimed_by.id) === myId;
        const o = stage.owner;
        if (!o) return false;
        if (o.type === 'user') return Number(o.id) === myId;
        return this.ownsRole(o);
    }

    // A team step nobody has taken yet: the one case the bell can act on.
    canAccept(p) {
        const stage = this.currentStage(p);
        return Boolean(p && p.status === 'in_progress' && stage && !stage.claimed_by && this.ownsRole(stage.owner));
    }

    requestFor(item) {
        return item.ticket_id ? this.requests.get(item.ticket_id)?.pipeline || null : null;
    }

    needsYou(item) {
        if (!NotificationBell.ACTION_EVENTS.includes(item.event)) return false;
        const known = item.ticket_id && this.requests.has(item.ticket_id) ? this.requestFor(item) : undefined;
        if (known === undefined || known === null) return !item.read;
        return this.waitingOnMe(known);
    }

    renderMessage(text) {
        const list = this.el('notifList');
        list.replaceChildren();
        const empty = document.createElement('div');
        empty.className = 'notif-empty';
        empty.textContent = text;
        list.appendChild(empty);
    }

    /**
     * Items are built with textContent, never innerHTML — titles carry Request
     * names typed by users.
     */
    render() {
        if (!this.listLoaded) return;
        const shown = this.tab === 'unread' ? this.items.filter((i) => !i.read) : this.items;
        if (!shown.length) {
            this.renderMessage(this.tab === 'unread' && this.items.length
                ? "You're all caught up."
                : "You're all caught up. Requests that need you will show up here.");
            return;
        }

        const needs = shown.filter((i) => this.needsYou(i));
        const info = shown.filter((i) => !needs.includes(i));
        const list = this.el('notifList');
        list.replaceChildren();
        const section = (label, items, build) => {
            if (!items.length) return;
            const head = document.createElement('div');
            head.className = 'notif-section';
            head.textContent = label;
            list.appendChild(head);
            items.forEach((item) => list.appendChild(build(item)));
        };
        section('Needs you', needs, (item) => this.buildAction(item));
        section('For your information', info, (item) => this.buildInfo(item));
    }

    buildMain(item, bodyText) {
        const main = document.createElement('span');
        main.className = 'notif-item-main';

        const top = document.createElement('span');
        top.className = 'notif-item-top';
        const title = document.createElement('span');
        title.className = 'notif-item-title';
        title.textContent = item.title;
        const time = document.createElement('span');
        time.className = 'notif-item-time';
        time.textContent = this.formatTime(item.created_at);
        time.title = this.formatFullTime(item.created_at);
        top.append(title, time);
        main.appendChild(top);

        if (bodyText) {
            const body = document.createElement('span');
            body.className = 'notif-item-body';
            body.textContent = bodyText;
            main.appendChild(body);
        }
        return main;
    }

    dot() {
        const dot = document.createElement('span');
        dot.className = 'notif-dot';
        dot.setAttribute('aria-hidden', 'true');
        return dot;
    }

    // A plain row: the whole thing opens the request.
    buildInfo(item) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'notif-item'
            + (item.read ? '' : ' is-unread')
            + (!item.read && NotificationBell.ALERT_EVENTS.includes(item.event) ? ' is-alert' : '');
        row.append(this.dot(), this.buildMain(item, item.body));
        row.addEventListener('click', () => this.openItem(item));
        return row;
    }

    // A step waiting on the reader: which step, and the buttons to act on it.
    // A div, not a button — it holds buttons of its own.
    buildAction(item) {
        const p = this.requestFor(item);
        const stage = this.currentStage(p);
        let body = item.body;
        if (p && stage) {
            const parts = [`Step ${stage.position || '?'} · ${stage.name}`, p.title];
            if (p.priority === 'urgent' || p.priority === 'high') parts.push(p.priority);
            body = parts.filter(Boolean).join(' · ');
        }

        const row = document.createElement('div');
        row.className = 'notif-item is-action' + (item.read ? '' : ' is-unread');
        row.addEventListener('click', (e) => {
            if (!e.target.closest('button')) this.openItem(item);
        });

        const main = this.buildMain(item, body);
        const actions = document.createElement('span');
        actions.className = 'notif-actions';
        if (this.canAccept(p)) {
            const accept = document.createElement('button');
            accept.type = 'button';
            accept.className = 'notif-btn is-primary';
            accept.textContent = 'Accept step';
            accept.addEventListener('click', () => this.acceptStep(item, p, stage, accept));
            actions.appendChild(accept);
        }
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'notif-btn';
        openBtn.textContent = 'Open';
        openBtn.addEventListener('click', () => this.openItem(item));
        actions.appendChild(openBtn);
        main.appendChild(actions);

        row.append(this.dot(), main);
        return row;
    }

    async acceptStep(item, p, stage, btn) {
        btn.disabled = true;
        try {
            const result = await api.requestEnvelope('pipeline-claim', {
                pipeline_id: p.id,
                stage_progress_id: stage.id
            });
            if (!result.success) {
                toast.error(result.data?.errors?.length ? result.data.errors.join('; ') : (result.message || "Couldn't accept the step"));
                btn.disabled = false;
                return;
            }
            toast.success('Step accepted');
            this.requests.delete(item.ticket_id);
            await this.markRead(item);
            await this.loadRequests();
            this.render();
        } catch (error) {
            toast.error(error.message || "Couldn't accept the step");
            btn.disabled = false;
        }
    }

    async markRead(item) {
        if (item.read) return;
        try {
            const result = await api.notifications.markRead(item.id);
            item.read = true;
            this.setUnread(result.data?.unread_count ?? Math.max(0, this.unread - 1));
        } catch (error) {
            // The read flag matters less than whatever the reader is doing.
        }
    }

    async openItem(item) {
        await this.markRead(item);
        if (item.link) {
            // Every page sits two levels below the UI root.
            window.location.href = '../../' + item.link;
        } else {
            this.render();
        }
    }

    async markAllRead() {
        const btn = this.el('notifMarkAll');
        btn.disabled = true;
        try {
            await api.notifications.markAllRead();
            this.items.forEach((i) => { i.read = true; });
            this.setUnread(0);
            this.render();
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
     * Timestamps are UTC without an offset (see requests.js fmtDate); shown as
     * a compact age while recent ("12m", "3h", "2d"), then as an IST date.
     */
    parseTime(value) {
        const d = new Date(String(value || '').replace(' ', 'T') + 'Z');
        return isNaN(d.getTime()) ? null : d;
    }

    formatTime(value) {
        const d = this.parseTime(value);
        if (!d) return value || '';
        const minutes = Math.round((Date.now() - d.getTime()) / 60000);
        if (minutes < 1) return 'now';
        if (minutes < 60) return `${minutes}m`;
        if (minutes < 24 * 60) return `${Math.round(minutes / 60)}h`;
        if (minutes < 7 * 24 * 60) return `${Math.round(minutes / 1440)}d`;
        return this.istParts(d, { day: 'numeric', month: 'short' }, '{day} {month}');
    }

    formatFullTime(value) {
        const d = this.parseTime(value);
        if (!d) return '';
        return this.istParts(d, {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }, '{day} {month} {year}, {hour}:{minute} IST');
    }

    // en-US parts in day-month order: en-GB spells September "Sept".
    istParts(d, options, pattern) {
        const parts = {};
        new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', ...options })
            .formatToParts(d).forEach((p) => { parts[p.type] = p.value; });
        return pattern.replace(/\{(\w+)\}/g, (_, k) => parts[k] || '');
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
