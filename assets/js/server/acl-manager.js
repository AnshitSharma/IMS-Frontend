/**
 * ACLManager - ES6 Class for Role and Permission Management
 * Handles all ACL (Access Control List) operations including role CRUD,
 * permission management, and user-role assignments.
 */
class ACLManager {
    constructor() {
        this.roles = [];
        this.permissions = [];
        this.users = [];
        this.currentRole = null;
        this.currentRoleUsers = [];
        this.editMode = false;
        this.selectedPermissions = new Set();
        this.currentTab = 'roles';
        // Own user id — used to keep admins from removing their own account (the
        // backend blocks this too; this just disables the button up front).
        this.currentUserId = window.api?.getUser?.()?.id ?? null;

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadInitialData();
        await this.renderRolesTable();
        this.renderUsersTable();
    }

    // ======================
    // API Methods
    // ======================

    async loadInitialData() {
        try {
            utils.showLoading(true, 'Loading roles and permissions...');

            // Load roles
            const rolesResult = await window.api.acl.getAllRoles();
            if (rolesResult && rolesResult.success) {
                this.roles = rolesResult.data?.roles || rolesResult.data || [];
            } else {
                this.roles = [];
            }

            // Load permissions
            const permissionsResult = await window.api.acl.getAllPermissions(true);
            if (permissionsResult && permissionsResult.success) {
                const permissionsData = permissionsResult.data?.permissions || permissionsResult.data || {};

                // Convert object format to array format if needed
                if (typeof permissionsData === 'object' && !Array.isArray(permissionsData)) {
                    // Permissions are grouped by category as an object, convert to array
                    this.permissions = Object.keys(permissionsData).map(categoryName => ({
                        category_name: categoryName,
                        permissions: permissionsData[categoryName]
                    }));
                } else if (Array.isArray(permissionsData)) {
                    // Already in array format
                    this.permissions = permissionsData;
                } else {
                    this.permissions = [];
                }
            } else {
                this.permissions = [];
            }

            // Load users
            try {
                const usersResult = await window.api.users.list();
                if (usersResult && usersResult.success) {
                    this.users = usersResult.data?.users || usersResult.data || [];
                } else {
                    this.users = [];
                }
            } catch (error) {
                this.users = [];
            }

            return true;
        } catch (error) {
            console.error('Failed to load initial data:', error);
            toast.error('Failed to load ACL data: ' + error.message);
            return false;
        } finally {
            utils.showLoading(false);
        }
    }

    async fetchAllRoles() {
        const result = await window.api.acl.getAllRoles();
        if (result && result.success) {
            this.roles = result.data?.roles || result.data || [];
            return this.roles;
        }
        return [];
    }

    async getRoleById(roleId) {
        const result = await window.api.acl.getRole(roleId);
        if (result.success) {
            // Merge role data with permissions and users arrays
            const role = result.data.role;
            role.permissions = result.data.permissions || [];
            role.users = result.data.users || [];

            return role;
        }
        return null;
    }

    async createRole(roleData) {
        const result = await window.api.acl.createRole(roleData);

        if (result && result.success) {
            // Update permissions for the newly created role
            const roleId = result.data?.role_id || result.data?.id;
            const permissionIds = Array.from(this.selectedPermissions);

            if (roleId && permissionIds.length > 0) {
                await window.api.acl.updateRolePermissions(roleId, permissionIds);
            }

            return result;
        }
        return result;
    }

    async updateRole(roleId, roleData) {
        const result = await window.api.acl.updateRole(roleId, roleData);
        if (result.success) {
            // Update permissions
            const permissionIds = Array.from(this.selectedPermissions);
            await window.api.acl.updateRolePermissions(roleId, permissionIds);
        }
        return result;
    }

    async deleteRole(roleId) {
        return await window.api.acl.deleteRole(roleId);
    }

    async assignUserToRole(userId, roleId) {
        return await window.api.acl.assignRole(userId, roleId);
    }

    async removeUserFromRole(userId, roleId) {
        return await window.api.acl.removeRole(userId, roleId);
    }

    // ======================
    // UI Rendering Methods
    // ======================

    async renderRolesTable() {
        const head = document.getElementById('aclMatrixHead');
        const body = document.getElementById('rolesTableBody');
        const emptyState = document.getElementById('emptyState');
        const card = document.querySelector('#roleManagementView .aclx-card');
        this.updateTabCounts();

        if (!this.roles || this.roles.length === 0) {
            if (body) body.innerHTML = '';
            emptyState?.classList.remove('hidden');
            card?.classList.add('hidden');
            return;
        }
        emptyState?.classList.add('hidden');
        card?.classList.remove('hidden');
        if (!head || !body) return;

        // Each role's granted set. roles-list carries counts only, so this is
        // one roles-get per role, run together.
        const full = await Promise.all(this.roles.map(async (role) => {
            try { return (await this.getRoleById(role.id)) || role; } catch (e) { return role; }
        }));
        this.matrixRoles = full.map((r, i) => {
            const base = this.roles[i];
            const granted = new Set((r.permissions || [])
                .filter((x) => x.granted === 1 || x.granted === true || x.granted === '1')
                .map((x) => Number(x.id)));
            return {
                id: Number(base.id),
                name: base.name || r.name || '',
                label: base.display_name || r.display_name || base.name || 'Role',
                people: Number(base.user_count ?? (Array.isArray(r.users) ? r.users.length : 0)),
                bypass: this.isBypassRole(base.name || r.name),
                granted
            };
        });
        if (!this.expandedGroups) this.expandedGroups = new Set();
        this.renderMatrix();
    }

    /**
     * Acl::hasPermission() lets admin and super_admin through every check
     * whatever their rows say, so their boxes would be decoration. They are
     * drawn as "always allowed" and cannot be clicked.
     */
    isBypassRole(name) {
        return ['admin', 'super_admin'].includes(String(name || '').toLowerCase());
    }

    /**
     * Permissions whose absence still leaves a way through: the Add and Edit
     * component forms and Build Server raise a request for approval instead
     * of refusing (dashboard.applyPermissionGate, edit-form.js). Everything
     * else missing is simply not allowed.
     */
    becomesRequest(permName) {
        return /^(cpu|ram|storage|motherboard|nic|caddy|chassis|pciecard|risercard|hbacard|sfp|serverplatform|networkdevice)\.(create|edit)$/.test(permName)
            || permName === 'server.create';
    }

    categoryLabel(key) {
        const s = String(key || 'Other').replace(/_/g, ' ');
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    renderMatrix() {
        const head = document.getElementById('aclMatrixHead');
        const body = document.getElementById('rolesTableBody');
        if (!head || !body || !this.matrixRoles) return;
        const roles = this.matrixRoles;
        const q = (this.permFilter || '').trim().toLowerCase();

        head.innerHTML = `<th scope="col">Permission</th>` + roles.map((r) => `
            <th scope="col">
                <button type="button" class="aclx-role" data-role-menu="${r.id}" aria-haspopup="menu"
                    title="${utils.escapeHtml(r.name)}">
                    <span>${utils.escapeHtml(r.label)}</span>
                    <small class="${r.bypass ? 'is-full' : ''}">${r.bypass ? 'full access · ' : ''}${r.people} ${r.people === 1 ? 'person' : 'people'}</small>
                </button>
            </th>`).join('');

        const cell = (role, perm) => {
            const label = `${role.label}: ${perm.display_name || perm.name}`;
            if (role.bypass) {
                return `<td><button type="button" class="aclx-cell is-locked" disabled aria-label="${utils.escapeHtml(label)}, always allowed" title="${utils.escapeHtml(role.label)} has every permission whatever is ticked here">✓</button></td>`;
            }
            const on = role.granted.has(Number(perm.id));
            const req = !on && this.becomesRequest(perm.name);
            const cls = on ? 'is-on' : (req ? 'is-req' : '');
            const state = on ? 'allowed' : (req ? 'not allowed, raised as a request' : 'not allowed');
            return `<td><button type="button" class="aclx-cell ${cls}" data-role="${role.id}" data-perm="${perm.id}"
                aria-pressed="${on}" aria-label="${utils.escapeHtml(label)}, ${state}"
                title="${on ? 'Allowed. Click to remove' : (req ? 'Not allowed, so it becomes a request. Click to allow' : 'Not allowed. Click to allow')}">${on ? '✓' : (req ? 'R' : '')}</button></td>`;
        };

        let html = '';
        let shown = 0;
        (this.permissions || []).forEach((group) => {
            const perms = (group.permissions || []).filter((perm) => !q
                || `${perm.display_name || ''} ${perm.name || ''} ${perm.description || ''}`.toLowerCase().includes(q));
            if (!perms.length) return;
            shown += perms.length;
            const key = group.category_name;
            const open = !!q || this.expandedGroups.has(key);
            const ids = perms.map((x) => Number(x.id));
            html += `
                <tr class="aclx-grp">
                    <td><button type="button" class="aclx-grp-btn" data-group="${utils.escapeHtml(key)}" aria-expanded="${open}">
                        <i class="fas fa-chevron-right" aria-hidden="true"></i>${utils.escapeHtml(this.categoryLabel(key))} <span class="n">${perms.length}</span>
                    </button></td>
                    ${roles.map((r) => {
                        const n = r.bypass ? ids.length : ids.filter((id) => r.granted.has(id)).length;
                        return `<td><span class="aclx-count ${n === ids.length ? 'is-all' : ''}" data-count-role="${r.id}" data-count-group="${utils.escapeHtml(key)}">${n}/${ids.length}</span></td>`;
                    }).join('')}
                </tr>`;
            if (!open) return;
            html += perms.map((perm) => `
                <tr class="aclx-row">
                    <td><span class="aclx-perm" title="${utils.escapeHtml(perm.description || '')}">
                        <span>${utils.escapeHtml(perm.display_name || perm.name)}</span><code>${utils.escapeHtml(perm.name)}</code>
                    </span></td>
                    ${roles.map((r) => cell(r, perm)).join('')}
                </tr>`).join('');
        });
        body.innerHTML = shown
            ? html
            : `<tr><td colspan="${roles.length + 1}" class="aclx-empty">No permission matches “${utils.escapeHtml(q)}”.</td></tr>`;
    }

    updateTabCounts() {
        const set = (id, n) => {
            const el = document.querySelector(`#${id} .aclx-tabn`);
            if (el) el.textContent = Number.isFinite(n) ? `· ${n}` : '';
        };
        set('tabRolesBtn', (this.roles || []).length);
        set('tabUsersBtn', (this.users || []).length);
    }

    /** Flip one role × permission and save that role's whole set. */
    async toggleCell(btn) {
        const roleId = Number(btn.dataset.role);
        const permId = Number(btn.dataset.perm);
        const role = (this.matrixRoles || []).find((r) => r.id === roleId);
        if (!role || role.bypass || btn.classList.contains('is-busy')) return;

        const next = new Set(role.granted);
        const allow = !next.has(permId);
        if (allow) next.add(permId); else next.delete(permId);

        btn.classList.add('is-busy');
        try {
            const result = await window.api.acl.updateRolePermissions(roleId, Array.from(next));
            if (!result || !result.success) throw new Error(result?.message || 'The change was not saved');
            role.granted = next;
            const perm = this.findPermission(permId);
            toast.success(`${role.label} ${allow ? 'can now' : 'can no longer'} ${(perm?.display_name || perm?.name || 'do this').replace(/^./, (c) => c.toLowerCase())}`);
            // Repaint in place: the open groups and the scroll position stay put.
            const scroller = document.querySelector('.aclx-scroll');
            const top = scroller ? scroller.scrollTop : 0;
            const left = scroller ? scroller.scrollLeft : 0;
            this.renderMatrix();
            if (scroller) { scroller.scrollTop = top; scroller.scrollLeft = left; }
            document.querySelector(`.aclx-cell[data-role="${roleId}"][data-perm="${permId}"]`)?.focus();
        } catch (error) {
            btn.classList.remove('is-busy');
            toast.error(error.message || 'The change was not saved');
        }
    }

    findPermission(id) {
        for (const g of this.permissions || []) {
            const hit = (g.permissions || []).find((x) => Number(x.id) === Number(id));
            if (hit) return hit;
        }
        return null;
    }

    /** Edit / People / Delete for one role, from its column header. */
    openRoleMenu(btn) {
        this.closeRoleMenu();
        const id = Number(btn.dataset.roleMenu);
        const role = (this.matrixRoles || []).find((r) => r.id === id);
        if (!role) return;
        const menu = document.createElement('div');
        menu.className = 'aclx-menu';
        menu.setAttribute('role', 'menu');
        menu.innerHTML = `
            <button type="button" role="menuitem" data-act="edit"><i class="fas fa-pen" aria-hidden="true"></i>Edit role</button>
            <button type="button" role="menuitem" data-act="people"><i class="fas fa-users" aria-hidden="true"></i>People in this role</button>
            ${role.bypass ? '' : '<button type="button" role="menuitem" data-act="delete" class="is-danger"><i class="fas fa-trash" aria-hidden="true"></i>Delete role</button>'}`;
        document.body.appendChild(menu);
        const r = btn.getBoundingClientRect();
        menu.style.top = `${Math.min(r.bottom + 4, window.innerHeight - menu.offsetHeight - 8)}px`;
        menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8))}px`;
        this._roleMenu = menu;
        menu.addEventListener('click', (e) => {
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (!act) return;
            this.closeRoleMenu();
            if (act === 'edit') this.openEditRoleModal(id);
            else if (act === 'people') this.openRoleDetailsModal(id);
            else if (act === 'delete') this.handleDeleteRole(id);
        });
        menu.addEventListener('keydown', (e) => {
            const items = [...menu.querySelectorAll('button')];
            const i = items.indexOf(document.activeElement);
            if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
            else if (e.key === 'Escape') { e.preventDefault(); this.closeRoleMenu(); btn.focus(); }
            else if (e.key === 'Tab') this.closeRoleMenu();
        });
        menu.querySelector('button').focus();
        this._roleMenuDismiss = (e) => {
            if (e.type === 'mousedown' && (menu.contains(e.target) || btn.contains(e.target))) return;
            this.closeRoleMenu();
        };
        setTimeout(() => {
            if (this._roleMenu !== menu) return;
            document.addEventListener('mousedown', this._roleMenuDismiss);
            document.addEventListener('scroll', this._roleMenuDismiss, true);
            window.addEventListener('resize', this._roleMenuDismiss);
        });
    }

    closeRoleMenu() {
        if (this._roleMenuDismiss) {
            document.removeEventListener('mousedown', this._roleMenuDismiss);
            document.removeEventListener('scroll', this._roleMenuDismiss, true);
            window.removeEventListener('resize', this._roleMenuDismiss);
            this._roleMenuDismiss = null;
        }
        this._roleMenu?.remove();
        this._roleMenu = null;
    }

    // ======================
    // Users Tab
    // ======================

    switchTab(tab) {
        this.currentTab = tab;

        const rolesView = document.getElementById('roleManagementView');
        const usersView = document.getElementById('userManagementView');
        const rolesTabBtn = document.getElementById('tabRolesBtn');
        const usersTabBtn = document.getElementById('tabUsersBtn');

        const isUsers = tab === 'users';

        // Visibility is driven by the `active` class (.content-section.active is
        // `display:flex !important`); `hidden` alone would be overridden.
        if (rolesView) rolesView.classList.toggle('active', !isUsers);
        if (usersView) usersView.classList.toggle('active', isUsers);

        // Active/inactive tab styling (mirrors the segmented control in acl.html)
        const activeClasses = ['bg-surface-card', 'text-primary', 'shadow-sm'];
        const inactiveClasses = ['text-text-secondary', 'hover:text-text-primary'];

        if (rolesTabBtn && usersTabBtn) {
            const active = isUsers ? usersTabBtn : rolesTabBtn;
            const inactive = isUsers ? rolesTabBtn : usersTabBtn;

            active.classList.add(...activeClasses);
            active.classList.remove(...inactiveClasses);
            active.setAttribute('aria-selected', 'true');

            inactive.classList.remove(...activeClasses);
            inactive.classList.add(...inactiveClasses);
            inactive.setAttribute('aria-selected', 'false');
        }

        document.getElementById('createRoleBtn')?.classList.toggle('hidden', isUsers);
        document.getElementById('refreshRolesBtn')?.classList.toggle('hidden', isUsers);
        document.getElementById('aclUsersActions')?.classList.toggle('hidden', !isUsers);
        const sub = document.getElementById('aclSubtitle');
        if (sub) {
            sub.textContent = isUsers
                ? 'Everyone with an account, and the role each one holds.'
                : 'What each role can do, at a glance. Click a cell to change it.';
        }

        if (isUsers) {
            this.renderUsersTable();
        }
    }

    renderUsersTable() {
        const tableBody = document.getElementById('usersTableBody');
        const emptyState = document.getElementById('usersEmptyState');
        const tableContainer = document.querySelector('.users-table-container');

        if (!tableBody) return;

        if (!this.users || this.users.length === 0) {
            tableBody.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            if (tableContainer) tableContainer.classList.add('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');
        if (tableContainer) tableContainer.classList.remove('hidden');

        const query = (document.getElementById('aclPeopleSearch')?.value || '').trim().toLowerCase();
        const shown = query
            ? this.users.filter(user => this.userSearchText(user).includes(query))
            : this.users;

        tableBody.innerHTML = shown.length
            ? shown.map(user => this.createUserRow(user)).join('')
            : `<tr class="aclx-nomatch"><td colspan="5">No one matches “${utils.escapeHtml(query)}”.</td></tr>`;

        const tally = document.getElementById('aclPeopleTally');
        if (tally) {
            const total = this.users.length;
            tally.innerHTML = shown.length === total
                ? `<b>${total}</b> ${total === 1 ? 'person' : 'people'}`
                : `<b>${shown.length}</b> of <b>${total}</b> people`;
        }
    }

    userDisplayName(user) {
        const fullName = [user.firstname, user.lastname].filter(Boolean).join(' ').trim();
        return fullName || user.username || 'Unknown';
    }

    userRoleName(user) {
        const roleId = Array.isArray(user.roles) && user.roles.length ? user.roles[0].id : null;
        const role = roleId == null ? null : this.roles.find(r => String(r.id) === String(roleId));
        return role ? (role.display_name || role.name || '') : '';
    }

    userSearchText(user) {
        return [this.userDisplayName(user), user.username, user.email, this.userRoleName(user)]
            .filter(Boolean).join(' ').toLowerCase();
    }

    userInitials(name) {
        const words = String(name).replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
        if (!words.length) return '?';
        const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2);
        return letters.toUpperCase();
    }

    createUserRow(user) {
        const roles = Array.isArray(user.roles) ? user.roles : [];
        const currentRoleId = roles.length > 0 ? roles[0].id : '';
        const isSelf = this.currentUserId != null && String(user.id) === String(this.currentUserId);
        // UI-ONLY gate, same as the Add User button. The backend requires the
        // admin/super_admin role AND users.reset_password regardless.
        const canResetPassword = window.api?.utils?.hasPermission('users.reset_password') === true;

        const displayName = this.userDisplayName(user);

        // Role dropdown — reassigns the user's group inline. Data attribute holds
        // the current role id so the change handler knows what to swap out.
        const roleOptions = this.roles.map(role =>
            `<option value="${role.id}" ${role.id === currentRoleId ? 'selected' : ''}>${utils.escapeHtml(role.display_name || role.name)}</option>`
        ).join('');

        const status = (user.status || 'active').toLowerCase();
        const statusIsActive = status === 'active' || status === '1';
        const statusLabel = statusIsActive ? 'Active' : (user.status ? String(user.status).charAt(0).toUpperCase() + String(user.status).slice(1) : 'Inactive');
        const email = user.email || '';

        return `
            <tr>
                <td>
                    <div class="aclx-who">
                        <span class="aclx-av" aria-hidden="true">${utils.escapeHtml(this.userInitials(displayName))}</span>
                        <span class="aclx-who-text">
                            <span class="aclx-name">${utils.escapeHtml(displayName)}${isSelf ? '<span class="aclx-you">You</span>' : ''}</span>
                            <span class="aclx-handle">@${utils.escapeHtml(user.username || '')}</span>
                            ${email ? `<span class="aclx-mail-m">${utils.escapeHtml(email)}</span>` : ''}
                        </span>
                    </div>
                </td>
                <td class="aclx-col-email"><span class="aclx-mail">${utils.escapeHtml(email || '—')}</span></td>
                <td>
                    <span class="aclx-pick">
                        <select class="user-role-select" aria-label="Role for ${utils.escapeHtml(displayName)}"
                                data-user-id="${user.id}" data-current-role="${currentRoleId}">
                            <option value="" ${currentRoleId === '' ? 'selected' : ''}>No role</option>
                            ${roleOptions}
                        </select>
                        <i class="fas fa-chevron-down" aria-hidden="true"></i>
                    </span>
                </td>
                <td class="aclx-col-status"><span class="aclx-st ${statusIsActive ? 'is-active' : ''}">${utils.escapeHtml(statusLabel)}</span></td>
                <td>
                    <span class="aclx-row-acts">
                        ${canResetPassword ? `
                        <button type="button" class="aclx-act"
                                ${isSelf ? 'disabled title="Use Change password in the account menu for your own password"' : `title="Reset password" onclick="aclManager.openResetPasswordModal(${user.id})"`}
                                aria-label="Reset password">
                            <i class="fas fa-key" aria-hidden="true"></i>
                        </button>` : ''}
                        <button type="button" class="aclx-act is-danger"
                                ${isSelf ? 'disabled title="You cannot remove your own account"' : 'title="Remove person" onclick="aclManager.handleDeleteUser(' + user.id + ')"'}
                                aria-label="Remove person">
                            <i class="fas fa-user-minus" aria-hidden="true"></i>
                        </button>
                    </span>
                </td>
            </tr>
        `;
    }

    async handleDeleteUser(userId) {
        const user = this.users.find(u => String(u.id) === String(userId));
        const label = user ? (user.username || user.email || `#${userId}`) : `#${userId}`;

        const confirmed = await utils.confirm(
            `Remove user "${label}"? This revokes all access and deletes the account. ` +
            `Any Requests and history the user touched are kept, reattributed to a ` +
            `"deleted_user" placeholder. This cannot be undone.`,
            'Remove User'
        );
        if (!confirmed) return;

        try {
            utils.showLoading(true, 'Removing user...');
            const result = await window.api.users.delete(userId);

            if (result && result.success) {
                // The backend says what it actually did — a delete, or a retire
                // that keeps the row. Never claim a delete the admin can still
                // see in the table.
                toast.success(result.message || 'User removed successfully');
                await this.loadInitialData();
                this.renderUsersTable();
                await this.renderRolesTable();
            } else {
                toast.error(result?.message || 'Failed to remove user');
            }
        } catch (error) {
            console.error('Error removing user:', error);
            toast.error(error.message || 'An error occurred while removing the user');
        } finally {
            utils.showLoading(false);
        }
    }

    async handleChangeUserRole(selectEl) {
        const userId = selectEl.dataset.userId;
        const newRoleId = selectEl.value;
        const previousRoleId = selectEl.dataset.currentRole || '';

        if (String(newRoleId) === String(previousRoleId)) return;

        try {
            utils.showLoading(true, 'Updating user role...');

            // Assign the new role first (when one is chosen) so the user is never
            // left with zero roles mid-swap — the backend blocks removing a user's
            // last role.
            if (newRoleId) {
                const assignResult = await window.api.acl.assignRole(userId, newRoleId);
                if (!assignResult || !assignResult.success) {
                    toast.error(assignResult?.message || 'Failed to assign the new role');
                    selectEl.value = previousRoleId;
                    return;
                }
            }

            // Remove the previous role if it differs and existed.
            if (previousRoleId && String(previousRoleId) !== String(newRoleId)) {
                const removeResult = await window.api.acl.removeRole(userId, previousRoleId);
                if (!removeResult || !removeResult.success) {
                    // The backend keeps every user in at least one role, so clearing
                    // to "No role" is refused. Report accurately and resync below.
                    const msg = !newRoleId
                        ? (removeResult?.message || 'A user must keep at least one role')
                        : (removeResult?.message || 'New role assigned, but the previous role could not be removed');
                    toast.warning(msg);
                } else {
                    toast.success('User role updated');
                }
            } else {
                toast.success('User role updated');
            }
            await this.loadInitialData();
            this.renderUsersTable();
            await this.renderRolesTable();
        } catch (error) {
            console.error('Error changing user role:', error);
            toast.error(error.message || 'An error occurred while updating the role');
            selectEl.value = previousRoleId;
        } finally {
            utils.showLoading(false);
        }
    }

    renderPermissionsGrid(selectedPermissions = []) {
        const grid = document.getElementById('permissionsGrid');
        if (!grid) return;

        grid.innerHTML = '';

        // Ensure permissions is an array before iterating
        if (!Array.isArray(this.permissions)) {
            grid.innerHTML = '<p class="text-center text-text-muted py-4">No permissions available. Please refresh the page.</p>';
            return;
        }

        if (this.permissions.length === 0) {
            grid.innerHTML = '<p class="text-center text-text-muted py-4">No permissions found</p>';
            return;
        }

        this.permissions.forEach(category => {
            const categoryCard = this.createPermissionCategoryCard(
                category.category_name,
                category.permissions,
                selectedPermissions
            );
            grid.appendChild(categoryCard);
        });

        this.attachPermissionEventListeners();
        this.updatePermissionCount();
    }

    createPermissionCategoryCard(categoryName, permissions, selected) {
        const card = document.createElement('div');
        card.className = 'bg-surface-card rounded-lg p-4 border border-border';

        const header = `
            <div class="flex items-center justify-between mb-3">
                <h5 class="text-sm font-semibold text-text-secondary">${utils.escapeHtml(this.categoryLabel(categoryName))}</h5>
                <label class="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
                    <input type="checkbox" class="category-select-all w-4 h-4" data-category="${utils.escapeHtml(categoryName)}">
                    <span>All</span>
                </label>
            </div>
        `;

        // The key under each name, as the matrix shows it: two permissions can
        // share a display name, and the key is what tells them apart.
        const permissionsList = permissions.map(perm => `
            <label class="flex items-center gap-2 py-1 hover:bg-surface-hover px-2 rounded transition-colors cursor-pointer"
                   title="${utils.escapeHtml(perm.description || '')}">
                <input type="checkbox"
                       class="permission-checkbox w-4 h-4"
                       data-permission-id="${perm.id}"
                       data-category="${utils.escapeHtml(categoryName)}"
                       ${selected.includes(perm.id) ? 'checked' : ''}>
                <span class="aclx-perm">
                    <span class="text-sm text-text-secondary">${utils.escapeHtml(perm.display_name || perm.name)}</span>
                    <code>${utils.escapeHtml(perm.name)}</code>
                </span>
            </label>
        `).join('');

        card.innerHTML = header + `<div class="space-y-1">${permissionsList}</div>`;
        return card;
    }

    renderRoleUsers(users) {
        const tableBody = document.getElementById('roleUsersTableBody');
        if (!tableBody) return;

        if (!users || users.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="px-4 py-8 text-center text-text-muted">
                        No users assigned to this role
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = users.map(user => `
            <tr class="hover:bg-surface-hover transition-colors">
                <td class="px-4 py-2">${utils.escapeHtml(user.username || 'N/A')}</td>
                <td class="px-4 py-2">${utils.escapeHtml(user.email || 'N/A')}</td>
                <td class="px-4 py-2 text-text-secondary text-sm">${utils.formatDate(user.assigned_at) || '-'}</td>
                <td class="px-4 py-2">
                    <button class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm text-text-muted border border-transparent hover:border-danger hover:text-danger transition-colors" onclick="aclManager.handleRemoveUser(${user.id}, ${this.currentRole})" title="Remove">
                        <i class="fas fa-user-minus text-xs"></i> Remove
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // ======================
    // Modal Management
    // ======================

    /**
     * Dialog semantics, focus and Escape for one of this page's modals, via
     * utils.dialog. Guarded because a cached utils.js can predate it.
     */
    bindDialog(modalId, titleId, onEscape, initialFocus) {
        const panel = document.querySelector(`#${modalId} .modal`);
        if (!panel || typeof utils.dialog !== 'function') return;
        // Each open starts clean: a form reset does not fire the input events
        // that would clear a message left from the last attempt.
        panel.querySelectorAll('[aria-invalid="true"]').forEach((el) => utils.clearFieldError(el));
        this._dialogs = this._dialogs || {};
        this._dialogs[modalId] = utils.dialog(panel, { labelledBy: titleId, onEscape, initialFocus });
    }

    releaseDialog(modalId) {
        const release = this._dialogs && this._dialogs[modalId];
        if (release) {
            delete this._dialogs[modalId];
            release();
        }
    }

    openCreateRoleModal() {
        try {
            this.editMode = false;
            this.currentRole = null;
            this.selectedPermissions.clear();

            const modal = document.getElementById('roleModal');
            const title = document.getElementById('roleModalTitle');

            if (title) title.textContent = 'Create New Role';

            // Clear form
            const roleNameInput = document.getElementById('roleName');
            const displayNameInput = document.getElementById('roleDisplayName');
            const descriptionInput = document.getElementById('roleDescription');
            const isDefaultCheckbox = document.getElementById('roleIsDefault');

            if (roleNameInput) roleNameInput.value = '';
            if (displayNameInput) displayNameInput.value = '';
            if (descriptionInput) descriptionInput.value = '';
            if (isDefaultCheckbox) isDefaultCheckbox.checked = false;

            this.renderPermissionsGrid([]);
            this.updatePermissionCount();

            if (modal) {
                modal.classList.remove('hidden');
                this.bindDialog('roleModal', 'roleModalTitle', () => this.closeAllModals());
                // Add opacity to make modal visible (CSS has opacity: 0 by default)
                setTimeout(() => {
                    modal.style.opacity = '1';
                    const modalContent = modal.querySelector('.modal');
                    if (modalContent) {
                        modalContent.style.opacity = '1';
                        modalContent.style.transform = 'scale(1)';
                    }
                }, 10);
            }
        } catch (error) {
            console.error('Error in openCreateRoleModal:', error);
            toast.error('Failed to open create role modal: ' + error.message);
        }
    }

    async openEditRoleModal(roleId) {
        this.editMode = true;
        this.currentRole = roleId;

        try {
            utils.showLoading(true, 'Loading role details...');
            const role = await this.getRoleById(roleId);

            if (!role) {
                toast.error('Failed to load role details');
                return;
            }

            const modal = document.getElementById('roleModal');
            const title = document.getElementById('roleModalTitle');

            if (title) title.textContent = 'Edit Role';

            // Populate form
            document.getElementById('roleName').value = role.name;
            document.getElementById('roleDisplayName').value = role.display_name;
            document.getElementById('roleDescription').value = role.description || '';
            document.getElementById('roleIsDefault').checked = role.is_default || false;

            // Get selected permission IDs
            const selectedIds = role.permissions?.map(p => p.id) || [];
            this.selectedPermissions = new Set(selectedIds);

            this.renderPermissionsGrid(selectedIds);
            this.updatePermissionCount();

            if (modal) {
                modal.classList.remove('hidden');
                this.bindDialog('roleModal', 'roleModalTitle', () => this.closeAllModals());
                setTimeout(() => {
                    modal.style.opacity = '1';
                    const modalContent = modal.querySelector('.modal');
                    if (modalContent) {
                        modalContent.style.opacity = '1';
                        modalContent.style.transform = 'scale(1)';
                    }
                }, 10);
            }
        } catch (error) {
            console.error('Error opening edit role modal:', error);
            toast.error('Failed to load role details: ' + error.message);
        } finally {
            utils.showLoading(false);
        }
    }

    async openRoleDetailsModal(roleId) {
        this.currentRole = roleId;

        try {
            utils.showLoading(true, 'Loading role details...');
            const role = await this.getRoleById(roleId);

            if (!role) {
                toast.error('Failed to load role details');
                return;
            }

            const modal = document.getElementById('roleDetailsModal');
            const titleElem = document.getElementById('roleDetailsTitle');
            const roleNameElem = document.getElementById('detailRoleName');
            const userCountElem = document.getElementById('detailUserCount');

            if (titleElem) titleElem.textContent = `Role: ${role.display_name || role.name}`;
            if (roleNameElem) roleNameElem.textContent = role.display_name || role.name;

            // Get users for this role - either from API response or filter from loaded users
            let roleUsers = role.users || [];

            // If API didn't return users array, filter from loaded users based on their roles
            if (roleUsers.length === 0 && this.users.length > 0) {
                roleUsers = this.users.filter(user => {
                    // Check if user has this role assigned
                    return user.roles && Array.isArray(user.roles) && user.roles.some(r => r.id === roleId);
                });
            }

            if (userCountElem) userCountElem.textContent = roleUsers.length;

            // Store current role users
            this.currentRoleUsers = roleUsers;

            // Render users table
            this.renderRoleUsers(this.currentRoleUsers);

            // Populate user dropdown with unassigned users
            this.renderUserDropdown();

            if (modal) {
                modal.classList.remove('hidden');
                this.bindDialog('roleDetailsModal', 'roleDetailsTitle', () => this.closeAllModals());
                setTimeout(() => {
                    modal.style.opacity = '1';
                    const modalContent = modal.querySelector('.modal');
                    if (modalContent) {
                        modalContent.style.opacity = '1';
                        modalContent.style.transform = 'scale(1)';
                    }
                }, 10);
            }
        } catch (error) {
            console.error('Error opening role details modal:', error);
            toast.error('Failed to load role details: ' + error.message);
        } finally {
            utils.showLoading(false);
        }
    }

    renderUserDropdown() {
        const dropdown = document.getElementById('assignUserSelect');
        if (!dropdown) return;

        // Get IDs of already assigned users
        const assignedUserIds = this.currentRoleUsers.map(u => u.id);

        // Filter out assigned users
        const unassignedUsers = this.users.filter(u => !assignedUserIds.includes(u.id));

        dropdown.innerHTML = '<option value="">Select a user...</option>';

        unassignedUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = `${user.username} (${user.email})`;
            dropdown.appendChild(option);
        });
    }

    closeAllModals() {
        const roleModal = document.getElementById('roleModal');
        const roleDetailsModal = document.getElementById('roleDetailsModal');
        this.releaseDialog('roleModal');
        this.releaseDialog('roleDetailsModal');

        [roleModal, roleDetailsModal].forEach(modal => {
            if (modal) {
                modal.style.opacity = '0';
                const modalContent = modal.querySelector('.modal');
                if (modalContent) {
                    modalContent.style.opacity = '0';
                    modalContent.style.transform = 'scale(0.95)';
                }
                setTimeout(() => {
                    modal.classList.add('hidden');
                }, 200); // Match the transition duration
            }
        });
    }

    // ======================
    // Create User
    // ======================

    openCreateUserModal() {
        const modal = document.getElementById('createUserModal');
        if (!modal) return;

        // Reset the form
        const form = document.getElementById('createUserForm');
        if (form) form.reset();

        // Populate the role dropdown from the already-loaded roles
        this.populateUserRoleDropdown();

        modal.classList.remove('hidden');
        this.bindDialog('createUserModal', 'createUserModalTitle', () => this.closeCreateUserModal());
        setTimeout(() => {
            modal.style.opacity = '1';
            const modalContent = modal.querySelector('.modal');
            if (modalContent) {
                modalContent.style.opacity = '1';
                modalContent.style.transform = 'scale(1)';
            }
        }, 10);
    }

    closeCreateUserModal() {
        const modal = document.getElementById('createUserModal');
        if (!modal) return;
        this.releaseDialog('createUserModal');

        modal.style.opacity = '0';
        const modalContent = modal.querySelector('.modal');
        if (modalContent) {
            modalContent.style.opacity = '0';
            modalContent.style.transform = 'scale(0.95)';
        }
        setTimeout(() => modal.classList.add('hidden'), 200);
    }

    populateUserRoleDropdown() {
        const select = document.getElementById('newUserRole');
        if (!select) return;

        select.innerHTML = '<option value="">Select a role...</option>';
        this.roles.forEach(role => {
            const option = document.createElement('option');
            option.value = role.id;
            option.textContent = role.display_name || role.name;
            // Default the selection to the system default role when present
            if (role.is_default) option.selected = true;
            select.appendChild(option);
        });
    }

    validateCreateUserForm(username, email, roleId, password, confirmPassword) {
        if (username.length < 3 || username.length > 50) {
            toast.error('Username must be between 3 and 50 characters');
            return false;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            toast.error('Please enter a valid email address');
            return false;
        }
        if (!roleId) {
            toast.error('Please select a role for the user');
            return false;
        }
        return this.validatePasswordPolicy(password, confirmPassword);
    }

    // Mirror of the backend password policy (assertUserPasswordPolicy in
    // users_api.php), shared by Create User and Reset Password. Each rule reports
    // separately so the toast names the requirement that actually failed — a
    // bundled message reads as a length complaint even when the length is fine.
    validatePasswordPolicy(password, confirmPassword) {
        if (password.length < 8) {
            toast.error('Password must be at least 8 characters long');
            return false;
        }
        const missing = [];
        if (!/[A-Z]/.test(password)) missing.push('an uppercase letter');
        if (!/[0-9]/.test(password)) missing.push('a number');
        if (!/[^A-Za-z0-9]/.test(password)) missing.push('a special character');
        if (missing.length) {
            const needs = missing.length === 1
                ? missing[0]
                : missing.slice(0, -1).join(', ') + ' and ' + missing[missing.length - 1];
            toast.error(`Password is missing ${needs}`);
            return false;
        }
        if (password !== confirmPassword) {
            toast.error('Passwords do not match');
            return false;
        }
        return true;
    }

    async handleCreateUser() {
        const username = document.getElementById('newUserUsername')?.value.trim() || '';
        const email = document.getElementById('newUserEmail')?.value.trim() || '';
        const roleId = document.getElementById('newUserRole')?.value || '';
        const password = document.getElementById('newUserPassword')?.value || '';
        const confirmPassword = document.getElementById('newUserConfirmPassword')?.value || '';

        if (!this.validateCreateUserForm(username, email, roleId, password, confirmPassword)) {
            return;
        }

        try {
            utils.showLoading(true, 'Creating user...');
            const result = await window.api.users.create({
                username,
                email,
                password,
                role_id: roleId
            });

            if (result && result.success) {
                toast.success('User created successfully');
                this.closeCreateUserModal();
                // Refresh roles + users so counts and assignments reflect the new user
                await this.loadInitialData();
                await this.renderRolesTable();
                this.renderUsersTable();
            } else {
                toast.error(result?.message || 'Failed to create user');
            }
        } catch (error) {
            console.error('Error creating user:', error);
            toast.error(error.message || 'An error occurred while creating the user');
        } finally {
            utils.showLoading(false);
        }
    }

    // ======================
    // Reset User Password
    // ======================

    openResetPasswordModal(userId) {
        const user = this.users.find(u => String(u.id) === String(userId));
        if (!user) {
            toast.error('User not found — refresh the list and try again');
            return;
        }
        // Same guard the backend applies. Changing your own password here would
        // invalidate the session you are using; the account menu has the
        // self-service flow, which asks for your current password.
        if (this.currentUserId != null && String(user.id) === String(this.currentUserId)) {
            toast.error('Use Change Password in the account menu to change your own password');
            return;
        }

        const modal = document.getElementById('resetPasswordModal');
        if (!modal) return;

        document.getElementById('resetPasswordForm')?.reset();

        const idField = document.getElementById('resetTargetUserId');
        if (idField) idField.value = user.id;

        const label = document.getElementById('resetTargetLabel');
        if (label) label.textContent = '@' + (user.username || user.email || ('#' + user.id));

        // Clear anything left from a previous open, and put the fields back to
        // masked with their eye icons in the matching state.
        ['resetNewPassword', 'resetConfirmPassword', 'resetAdminPassword'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.value = '';
                input.type = 'password';
            }
        });
        modal.querySelectorAll('[data-toggle-password]').forEach(btn => {
            const icon = btn.querySelector('i');
            if (icon) icon.className = 'fas fa-eye';
            btn.setAttribute('aria-label', 'Show password');
        });

        modal.classList.remove('hidden');
        this.bindDialog('resetPasswordModal', 'resetPasswordModalTitle', () => this.closeResetPasswordModal(), '#resetNewPassword');
        setTimeout(() => {
            modal.style.opacity = '1';
            const modalContent = modal.querySelector('.modal');
            if (modalContent) {
                modalContent.style.opacity = '1';
                modalContent.style.transform = 'scale(1)';
            }
            document.getElementById('resetNewPassword')?.focus();
        }, 10);
    }

    closeResetPasswordModal() {
        const modal = document.getElementById('resetPasswordModal');
        if (!modal) return;
        this.releaseDialog('resetPasswordModal');

        modal.style.opacity = '0';
        const modalContent = modal.querySelector('.modal');
        if (modalContent) {
            modalContent.style.opacity = '0';
            modalContent.style.transform = 'scale(0.95)';
        }
        setTimeout(() => {
            modal.classList.add('hidden');
            // Never leave a password sitting in the DOM behind a hidden modal.
            ['resetNewPassword', 'resetConfirmPassword', 'resetAdminPassword'].forEach(id => {
                const input = document.getElementById(id);
                if (input) {
                    input.value = '';
                    input.type = 'password';
                }
            });
        }, 200);
    }

    // Uniform random index, rejection-sampled so the modulo does not bias the
    // low characters. Falls back to Math.random only where crypto is absent.
    randomInt(max) {
        const cryptoObj = window.crypto || window.msCrypto;
        if (cryptoObj && cryptoObj.getRandomValues) {
            const limit = Math.floor(0xFFFFFFFF / max) * max;
            const buf = new Uint32Array(1);
            let value;
            do {
                cryptoObj.getRandomValues(buf);
                value = buf[0];
            } while (value >= limit);
            return value % max;
        }
        return Math.floor(Math.random() * max);
    }

    generateStrongPassword(length = 16) {
        // Ambiguous glyphs (I l 1 O 0) are left out — this password gets read off
        // a screen and typed by someone else.
        const sets = [
            'ABCDEFGHJKLMNPQRSTUVWXYZ',
            'abcdefghijkmnopqrstuvwxyz',
            '23456789',
            '!@#$%^&*?-_'
        ];
        const all = sets.join('');
        const pick = chars => chars[this.randomInt(chars.length)];

        // One from each set first, so the result always satisfies the policy.
        const out = sets.map(pick);
        while (out.length < length) out.push(pick(all));

        // Fisher–Yates, so the guaranteed characters are not always up front.
        for (let i = out.length - 1; i > 0; i--) {
            const j = this.randomInt(i + 1);
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out.join('');
    }

    handleGeneratePassword() {
        const password = this.generateStrongPassword();

        ['resetNewPassword', 'resetConfirmPassword'].forEach(id => {
            const input = document.getElementById(id);
            if (!input) return;
            input.value = password;
            input.type = 'text'; // revealed on purpose — it has to be readable to be handed over
            const btn = document.querySelector(`#resetPasswordModal [data-toggle-password="${id}"]`);
            const icon = btn?.querySelector('i');
            if (icon) icon.className = 'fas fa-eye-slash';
            btn?.setAttribute('aria-label', 'Hide password');
        });

        toast.info('Password generated — copy it before closing this dialog');
    }

    async handleResetPassword() {
        const userId = document.getElementById('resetTargetUserId')?.value || '';
        const newPassword = document.getElementById('resetNewPassword')?.value || '';
        const confirmPassword = document.getElementById('resetConfirmPassword')?.value || '';
        const adminPassword = document.getElementById('resetAdminPassword')?.value || '';

        if (!userId) {
            toast.error('No user selected');
            return;
        }
        if (!adminPassword) {
            toast.error('Enter your own password to confirm the change');
            return;
        }
        if (!this.validatePasswordPolicy(newPassword, confirmPassword)) return;

        const user = this.users.find(u => String(u.id) === String(userId));
        const label = user ? (user.username || user.email || `#${userId}`) : `#${userId}`;

        const confirmed = await utils.confirm(
            `Set a new password for "${label}"? They are signed out of every device immediately and must log in with the new password.`,
            'Reset Password'
        );
        if (!confirmed) return;

        try {
            utils.showLoading(true, 'Resetting password...');
            const result = await window.api.users.resetPassword({
                userId,
                newPassword,
                confirmPassword,
                adminPassword
            });

            if (result && result.success) {
                toast.success(result.message || `Password reset for ${label}`);
                this.closeResetPasswordModal();
            } else {
                toast.error(result?.message || 'Failed to reset the password');
            }
        } catch (error) {
            console.error('Error resetting password:', error);
            toast.error(error.message || 'An error occurred while resetting the password');
        } finally {
            utils.showLoading(false);
        }
    }

    // ======================
    // Event Handlers
    // ======================

    setupEventListeners() {
        // Create Role button
        const createBtn = document.getElementById('createRoleBtn');

        if (createBtn) {
            createBtn.addEventListener('click', () => {
                this.openCreateRoleModal();
            });
        }

        // Refresh button
        document.getElementById('refreshRolesBtn')?.addEventListener('click', async () => {
            await this.loadInitialData();
            await this.renderRolesTable();
            toast.success('Roles refreshed');
        });

        // Role Modal close buttons
        document.getElementById('roleModalClose')?.addEventListener('click', () => {
            this.closeAllModals();
        });
        document.getElementById('cancelRoleModal')?.addEventListener('click', () => {
            this.closeAllModals();
        });

        // Role Details Modal close buttons
        document.getElementById('roleDetailsClose')?.addEventListener('click', () => {
            this.closeAllModals();
        });
        document.getElementById('closeRoleDetailsBtn')?.addEventListener('click', () => {
            this.closeAllModals();
        });

        // Save role button
        document.getElementById('saveRoleBtn')?.addEventListener('click', () => {
            this.handleSaveRole();
        });

        // Select/Deselect all permissions
        document.getElementById('selectAllPermissions')?.addEventListener('click', () => {
            this.selectAllPermissions(true);
        });
        document.getElementById('deselectAllPermissions')?.addEventListener('click', () => {
            this.selectAllPermissions(false);
        });

        // Assign user button
        document.getElementById('assignUserBtn')?.addEventListener('click', () => {
            this.handleAssignUser();
        });

        // The matrix: cells, group headers and role headers are delegated,
        // because every repaint replaces them.
        document.getElementById('rolesTable')?.addEventListener('click', (e) => {
            const cellBtn = e.target.closest('.aclx-cell[data-perm]');
            if (cellBtn) { this.toggleCell(cellBtn); return; }
            const grp = e.target.closest('[data-group]');
            if (grp) {
                const key = grp.dataset.group;
                if (this.expandedGroups.has(key)) this.expandedGroups.delete(key); else this.expandedGroups.add(key);
                this.renderMatrix();
                document.querySelector(`[data-group="${CSS.escape(key)}"]`)?.focus();
                return;
            }
            const roleBtn = e.target.closest('[data-role-menu]');
            if (roleBtn) this.openRoleMenu(roleBtn);
        });
        let filterTimer = null;
        document.getElementById('aclPermSearch')?.addEventListener('input', (e) => {
            clearTimeout(filterTimer);
            filterTimer = setTimeout(() => { this.permFilter = e.target.value; this.renderMatrix(); }, 150);
        });
        document.getElementById('aclExpandAll')?.addEventListener('click', () => {
            this.expandedGroups = new Set((this.permissions || []).map((g) => g.category_name));
            this.renderMatrix();
        });
        document.getElementById('aclCollapseAll')?.addEventListener('click', () => {
            this.expandedGroups = new Set();
            this.renderMatrix();
        });

        // Roles / Users tab switcher
        document.getElementById('tabRolesBtn')?.addEventListener('click', () => this.switchTab('roles'));
        document.getElementById('tabUsersBtn')?.addEventListener('click', () => this.switchTab('users'));
        if (typeof utils.tabs === 'function') utils.tabs(document.getElementById('tabRolesBtn')?.closest('[role="tablist"]'));

        // Users tab refresh
        document.getElementById('refreshUsersBtn')?.addEventListener('click', async () => {
            await this.loadInitialData();
            this.renderUsersTable();
            toast.success('People refreshed');
        });
        document.getElementById('aclPeopleSearch')?.addEventListener('input', () => this.renderUsersTable());

        // Add User buttons — gated by the users.create permission (UI-only;
        // the backend users-create endpoint enforces it for real).
        const canCreateUser = window.api?.utils?.hasPermission('users.create');
        ['addUserBtn', 'usersEmptyAddBtn'].forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            if (canCreateUser) btn.classList.remove('hidden');
            btn.addEventListener('click', () => this.openCreateUserModal());
        });

        // Inline role change (delegated — selects are rendered per row)
        document.getElementById('usersTableBody')?.addEventListener('change', (e) => {
            const select = e.target.closest('.user-role-select');
            if (select) this.handleChangeUserRole(select);
        });

        // Create User modal close / cancel / submit
        document.getElementById('createUserModalClose')?.addEventListener('click', () => this.closeCreateUserModal());
        document.getElementById('cancelCreateUser')?.addEventListener('click', () => this.closeCreateUserModal());
        document.getElementById('saveUserBtn')?.addEventListener('click', () => this.handleCreateUser());

        // Reset Password modal close / cancel / generate / submit
        document.getElementById('resetPasswordModalClose')?.addEventListener('click', () => this.closeResetPasswordModal());
        document.getElementById('cancelResetPassword')?.addEventListener('click', () => this.closeResetPasswordModal());
        document.getElementById('generatePasswordBtn')?.addEventListener('click', () => this.handleGeneratePassword());
        document.getElementById('confirmResetPasswordBtn')?.addEventListener('click', () => this.handleResetPassword());

        // Enter anywhere in the reset form submits it instead of reloading the page
        document.getElementById('resetPasswordForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleResetPassword();
        });

        // Show/hide password eyes. Delegated because there was NO handler for
        // [data-toggle-password] anywhere in the frontend — the buttons already
        // in the Create User modal were inert markup. This covers both dialogs.
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-toggle-password]');
            if (!btn) return;

            const input = document.getElementById(btn.dataset.togglePassword);
            if (!input) return;

            const reveal = input.type === 'password';
            input.type = reveal ? 'text' : 'password';
            btn.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
            const icon = btn.querySelector('i');
            if (icon) icon.className = reveal ? 'fas fa-eye-slash' : 'fas fa-eye';
        });
    }

    attachPermissionEventListeners() {
        // Category select-all checkboxes
        document.querySelectorAll('.category-select-all').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const category = e.target.dataset.category;
                const checked = e.target.checked;

                document.querySelectorAll(`.permission-checkbox[data-category="${category}"]`).forEach(permCheckbox => {
                    permCheckbox.checked = checked;
                    const permissionId = parseInt(permCheckbox.dataset.permissionId);

                    if (checked) {
                        this.selectedPermissions.add(permissionId);
                    } else {
                        this.selectedPermissions.delete(permissionId);
                    }
                });

                this.updatePermissionCount();
            });
        });

        // Individual permission checkboxes
        document.querySelectorAll('.permission-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const permissionId = parseInt(e.target.dataset.permissionId);

                if (e.target.checked) {
                    this.selectedPermissions.add(permissionId);
                } else {
                    this.selectedPermissions.delete(permissionId);
                }

                this.updatePermissionCount();
                this.updateCategoryCheckbox(e.target.dataset.category);
            });
        });
    }

    selectAllPermissions(select) {
        document.querySelectorAll('.permission-checkbox').forEach(checkbox => {
            checkbox.checked = select;
            const permissionId = parseInt(checkbox.dataset.permissionId);

            if (select) {
                this.selectedPermissions.add(permissionId);
            } else {
                this.selectedPermissions.delete(permissionId);
            }
        });

        document.querySelectorAll('.category-select-all').forEach(checkbox => {
            checkbox.checked = select;
        });

        this.updatePermissionCount();
    }

    updateCategoryCheckbox(category) {
        const categoryCheckbox = document.querySelector(`.category-select-all[data-category="${category}"]`);
        const categoryPermissions = document.querySelectorAll(`.permission-checkbox[data-category="${category}"]`);
        const checkedCount = Array.from(categoryPermissions).filter(cb => cb.checked).length;

        if (categoryCheckbox) {
            categoryCheckbox.checked = checkedCount === categoryPermissions.length;
            categoryCheckbox.indeterminate = checkedCount > 0 && checkedCount < categoryPermissions.length;
        }
    }

    async handleSaveRole() {
        // Validate form
        if (!this.validateRoleForm()) {
            return;
        }

        const roleData = {
            name: document.getElementById('roleName').value.trim().toLowerCase().replace(/\s+/g, '_'),
            display_name: document.getElementById('roleDisplayName').value.trim(),
            description: document.getElementById('roleDescription').value.trim(),
            is_default: document.getElementById('roleIsDefault').checked
        };

        try {
            utils.showLoading(true, this.editMode ? 'Updating role...' : 'Creating role...');

            let result;
            if (this.editMode) {
                result = await this.updateRole(this.currentRole, roleData);
            } else {
                result = await this.createRole(roleData);
            }

            if (result && result.success) {
                toast.success(this.editMode ? 'Role updated successfully' : 'Role created successfully');
                await this.fetchAllRoles();
                await this.renderRolesTable();
                this.closeAllModals();
            } else {
                const errorMsg = result?.message || 'Failed to save role';
                toast.error(errorMsg);
            }
        } catch (error) {
            console.error('Error saving role:', error);
            toast.error(error.message || 'An error occurred while saving the role');
        } finally {
            utils.showLoading(false);
        }
    }

    async handleDeleteRole(roleId) {
        const confirmed = await utils.confirm(
            'Are you sure you want to delete this role? This action cannot be undone.',
            'Delete Role'
        );

        if (!confirmed) return;

        try {
            utils.showLoading(true, 'Deleting role...');
            const result = await this.deleteRole(roleId);

            if (result.success) {
                toast.success('Role deleted successfully');
                await this.fetchAllRoles();
                await this.renderRolesTable();
            } else {
                toast.error(result.message || 'Failed to delete role');
            }
        } catch (error) {
            console.error('Error deleting role:', error);
            toast.error(error.message || 'An error occurred while deleting the role');
        } finally {
            utils.showLoading(false);
        }
    }

    async handleAssignUser() {
        const dropdown = document.getElementById('assignUserSelect');
        const userId = dropdown?.value;

        if (!userId) {
            toast.warning('Please select a user to assign');
            return;
        }

        try {
            utils.showLoading(true, 'Assigning user to role...');
            const result = await this.assignUserToRole(userId, this.currentRole);

            if (result.success) {
                toast.success('User assigned successfully');

                // Refresh role details
                const role = await this.getRoleById(this.currentRole);
                if (role) {
                    // Get users for this role - either from API response or filter from loaded users
                    let roleUsers = role.users || [];

                    // If API didn't return users array, filter from loaded users based on their roles
                    if (roleUsers.length === 0 && this.users.length > 0) {
                        roleUsers = this.users.filter(user => {
                            return user.roles && Array.isArray(user.roles) && user.roles.some(r => r.id === this.currentRole);
                        });
                    }

                    this.currentRoleUsers = roleUsers;
                    this.renderRoleUsers(this.currentRoleUsers);
                    this.renderUserDropdown();

                    // Update user count
                    const userCountElem = document.getElementById('detailUserCount');
                    if (userCountElem) userCountElem.textContent = this.currentRoleUsers.length;
                }

                // Refresh main table
                await this.fetchAllRoles();
                await this.renderRolesTable();
            } else {
                toast.error(result.message || 'Failed to assign user');
            }
        } catch (error) {
            console.error('Error assigning user:', error);
            toast.error(error.message || 'An error occurred while assigning the user');
        } finally {
            utils.showLoading(false);
        }
    }

    async handleRemoveUser(userId, roleId) {
        const confirmed = await utils.confirm(
            'Are you sure you want to remove this user from the role?',
            'Remove User'
        );

        if (!confirmed) return;

        try {
            utils.showLoading(true, 'Removing user from role...');
            const result = await this.removeUserFromRole(userId, roleId);

            if (result.success) {
                toast.success('User removed successfully');

                // Refresh role details
                const role = await this.getRoleById(roleId);
                if (role) {
                    // Get users for this role - either from API response or filter from loaded users
                    let roleUsers = role.users || [];

                    // If API didn't return users array, filter from loaded users based on their roles
                    if (roleUsers.length === 0 && this.users.length > 0) {
                        roleUsers = this.users.filter(user => {
                            return user.roles && Array.isArray(user.roles) && user.roles.some(r => r.id === roleId);
                        });
                    }

                    this.currentRoleUsers = roleUsers;
                    this.renderRoleUsers(this.currentRoleUsers);
                    this.renderUserDropdown();

                    // Update user count
                    const userCountElem = document.getElementById('detailUserCount');
                    if (userCountElem) userCountElem.textContent = this.currentRoleUsers.length;
                }

                // Refresh main table
                await this.fetchAllRoles();
                await this.renderRolesTable();
            } else {
                toast.error(result.message || 'Failed to remove user');
            }
        } catch (error) {
            console.error('Error removing user:', error);
            toast.error(error.message || 'An error occurred while removing the user');
        } finally {
            utils.showLoading(false);
        }
    }

    // ======================
    // Utility Methods
    // ======================

    validateRoleForm() {
        const roleName = document.getElementById('roleName').value.trim();
        const displayName = document.getElementById('roleDisplayName').value.trim();

        // The toast announces it; the message under the field stays until the
        // field is edited. A cached utils.js without fieldError still focuses.
        const invalid = (id, message) => {
            toast.error(message);
            const input = document.getElementById(id);
            if (typeof utils.fieldError === 'function') utils.fieldError(input, message);
            else input.focus();
            return false;
        };

        if (!roleName) {
            return invalid('roleName', 'Enter a role name');
        }

        if (!/^[a-z0-9_]+$/.test(roleName.toLowerCase().replace(/\s+/g, '_'))) {
            return invalid('roleName', 'Role name can only use letters, numbers and underscores');
        }

        if (!displayName) {
            return invalid('roleDisplayName', 'Enter a display name');
        }

        if (this.selectedPermissions.size === 0) {
            toast.error('At least one permission must be selected');
            return false;
        }

        return true;
    }

    updatePermissionCount() {
        const countElement = document.getElementById('selectedPermissionsCount');
        if (countElement) {
            countElement.textContent = this.selectedPermissions.size;
        }
    }
}

// Initialize ACLManager when DOM is ready
// Wait for sidebar to be injected first
function initializeACLManager() {
    try {
        window.aclManager = new ACLManager();
    } catch (error) {
        console.error('Failed to initialize ACLManager:', error);
    }
}

// If we're on the ACL page, initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Give sidebar time to load
        setTimeout(initializeACLManager, 500);
    });
} else {
    // DOM already loaded
    setTimeout(initializeACLManager, 500);
}
