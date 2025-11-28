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

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadInitialData();
        this.renderRolesTable();
    }

    // ======================
    // API Methods
    // ======================

    async loadInitialData() {
        try {
            utils.showLoading(true, 'Loading roles and permissions...');

            const [rolesResult, permissionsResult, usersResult] = await Promise.all([
                window.api.acl.getAllRoles(),
                window.api.acl.getAllPermissions(true),
                window.api.users.list()
            ]);

            if (rolesResult.success) {
                this.roles = rolesResult.data.roles || [];
            }

            if (permissionsResult.success) {
                this.permissions = permissionsResult.data.permissions || [];
            }

            if (usersResult.success) {
                this.users = usersResult.data.users || [];
            }

            return true;
        } catch (error) {
            console.error('Failed to load initial data:', error);
            toast.error('Failed to load ACL data');
            return false;
        } finally {
            utils.showLoading(false);
        }
    }

    async fetchAllRoles() {
        const result = await window.api.acl.getAllRoles();
        if (result.success) {
            this.roles = result.data.roles || [];
            return this.roles;
        }
        return [];
    }

    async getRoleById(roleId) {
        const result = await window.api.acl.getRole(roleId);
        if (result.success) {
            return result.data.role;
        }
        return null;
    }

    async createRole(roleData) {
        const result = await window.api.acl.createRole(roleData);
        if (result.success) {
            // Update permissions for the newly created role
            const roleId = result.data.role_id;
            const permissionIds = Array.from(this.selectedPermissions);

            if (permissionIds.length > 0) {
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

    renderRolesTable() {
        const tableBody = document.getElementById('rolesTableBody');
        const emptyState = document.getElementById('emptyState');
        const tableContainer = document.querySelector('.table-container');

        if (!this.roles || this.roles.length === 0) {
            if (tableBody) tableBody.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            if (tableContainer) tableContainer.classList.add('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');
        if (tableContainer) tableContainer.classList.remove('hidden');

        if (tableBody) {
            tableBody.innerHTML = this.roles.map(role => this.createRoleRow(role)).join('');
        }
    }

    createRoleRow(role) {
        const usersCount = role.users_count || 0;
        const permissionsCount = role.permissions?.length || 0;

        return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-shield-alt text-primary"></i>
                        <span class="font-medium text-slate-800">${utils.escapeHtml(role.display_name || role.name)}</span>
                        ${role.is_default ? '<span class="ml-2 px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">Default</span>' : ''}
                    </div>
                </td>
                <td class="px-4 py-3 text-slate-600 text-sm">
                    ${utils.escapeHtml(role.description || '-')}
                </td>
                <td class="px-4 py-3">
                    <button class="text-blue-600 hover:text-blue-800 transition-colors" onclick="aclManager.openRoleDetailsModal(${role.id})">
                        <i class="fas fa-users"></i> ${usersCount} user${usersCount !== 1 ? 's' : ''}
                    </button>
                </td>
                <td class="px-4 py-3">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
                        ${permissionsCount} permission${permissionsCount !== 1 ? 's' : ''}
                    </span>
                </td>
                <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                        <button class="text-blue-600 hover:text-blue-800 transition-colors" onclick="aclManager.openEditRoleModal(${role.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="text-red-600 hover:text-red-800 transition-colors" onclick="aclManager.handleDeleteRole(${role.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    renderPermissionsGrid(selectedPermissions = []) {
        const grid = document.getElementById('permissionsGrid');
        if (!grid) return;

        grid.innerHTML = '';

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
        card.className = 'bg-slate-50 rounded-lg p-4 border border-slate-200';

        const header = `
            <div class="flex items-center justify-between mb-3">
                <h5 class="text-sm font-semibold text-slate-700">${utils.escapeHtml(categoryName)}</h5>
                <label class="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                    <input type="checkbox" class="category-select-all w-4 h-4" data-category="${utils.escapeHtml(categoryName)}">
                    <span>All</span>
                </label>
            </div>
        `;

        const permissionsList = permissions.map(perm => `
            <label class="flex items-center gap-2 py-1 hover:bg-slate-100 px-2 rounded transition-colors cursor-pointer">
                <input type="checkbox"
                       class="permission-checkbox w-4 h-4"
                       data-permission-id="${perm.id}"
                       data-category="${utils.escapeHtml(categoryName)}"
                       ${selected.includes(perm.id) ? 'checked' : ''}>
                <span class="text-sm text-slate-700">${utils.escapeHtml(perm.display_name || perm.name)}</span>
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
                    <td colspan="4" class="px-4 py-8 text-center text-slate-500">
                        No users assigned to this role
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = users.map(user => `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-2">${utils.escapeHtml(user.username || 'N/A')}</td>
                <td class="px-4 py-2">${utils.escapeHtml(user.email || 'N/A')}</td>
                <td class="px-4 py-2 text-slate-600 text-sm">${utils.formatDate(user.assigned_date) || '-'}</td>
                <td class="px-4 py-2">
                    <button class="text-red-600 hover:text-red-800 transition-colors" onclick="aclManager.handleRemoveUser(${user.id}, ${this.currentRole})" title="Remove">
                        <i class="fas fa-user-minus"></i> Remove
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // ======================
    // Modal Management
    // ======================

    openCreateRoleModal() {
        this.editMode = false;
        this.currentRole = null;
        this.selectedPermissions.clear();

        const modal = document.getElementById('roleModal');
        const title = document.getElementById('roleModalTitle');

        if (title) title.textContent = 'Create New Role';

        // Clear form
        document.getElementById('roleName').value = '';
        document.getElementById('roleDisplayName').value = '';
        document.getElementById('roleDescription').value = '';
        document.getElementById('roleIsDefault').checked = false;

        this.renderPermissionsGrid([]);
        this.updatePermissionCount();

        if (modal) modal.classList.remove('hidden');
    }

    async openEditRoleModal(roleId) {
        this.editMode = true;
        this.currentRole = roleId;

        utils.showLoading(true, 'Loading role details...');
        const role = await this.getRoleById(roleId);
        utils.showLoading(false);

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

        if (modal) modal.classList.remove('hidden');
    }

    async openRoleDetailsModal(roleId) {
        this.currentRole = roleId;

        utils.showLoading(true, 'Loading role details...');
        const role = await this.getRoleById(roleId);
        utils.showLoading(false);

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
        if (userCountElem) userCountElem.textContent = role.users?.length || 0;

        // Store current role users
        this.currentRoleUsers = role.users || [];

        // Render users table
        this.renderRoleUsers(this.currentRoleUsers);

        // Populate user dropdown with unassigned users
        this.renderUserDropdown();

        if (modal) modal.classList.remove('hidden');
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
        document.getElementById('roleModal')?.classList.add('hidden');
        document.getElementById('roleDetailsModal')?.classList.add('hidden');
    }

    // ======================
    // Event Handlers
    // ======================

    setupEventListeners() {
        // Create Role button
        document.getElementById('createRoleBtn')?.addEventListener('click', () => {
            this.openCreateRoleModal();
        });

        // Refresh button
        document.getElementById('refreshRolesBtn')?.addEventListener('click', async () => {
            await this.loadInitialData();
            this.renderRolesTable();
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

            if (result.success) {
                toast.success(this.editMode ? 'Role updated successfully' : 'Role created successfully');
                await this.fetchAllRoles();
                this.renderRolesTable();
                this.closeAllModals();
            } else {
                toast.error(result.message || 'Failed to save role');
            }
        } catch (error) {
            console.error('Error saving role:', error);
            toast.error('An error occurred while saving the role');
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
                this.renderRolesTable();
            } else {
                toast.error(result.message || 'Failed to delete role');
            }
        } catch (error) {
            console.error('Error deleting role:', error);
            toast.error('An error occurred while deleting the role');
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
                    this.currentRoleUsers = role.users || [];
                    this.renderRoleUsers(this.currentRoleUsers);
                    this.renderUserDropdown();

                    // Update user count
                    const userCountElem = document.getElementById('detailUserCount');
                    if (userCountElem) userCountElem.textContent = this.currentRoleUsers.length;
                }

                // Refresh main table
                await this.fetchAllRoles();
                this.renderRolesTable();
            } else {
                toast.error(result.message || 'Failed to assign user');
            }
        } catch (error) {
            console.error('Error assigning user:', error);
            toast.error('An error occurred while assigning the user');
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
                    this.currentRoleUsers = role.users || [];
                    this.renderRoleUsers(this.currentRoleUsers);
                    this.renderUserDropdown();

                    // Update user count
                    const userCountElem = document.getElementById('detailUserCount');
                    if (userCountElem) userCountElem.textContent = this.currentRoleUsers.length;
                }

                // Refresh main table
                await this.fetchAllRoles();
                this.renderRolesTable();
            } else {
                toast.error(result.message || 'Failed to remove user');
            }
        } catch (error) {
            console.error('Error removing user:', error);
            toast.error('An error occurred while removing the user');
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

        if (!roleName) {
            toast.error('Role Name is required');
            document.getElementById('roleName').focus();
            return false;
        }

        if (!/^[a-z0-9_]+$/.test(roleName.toLowerCase().replace(/\s+/g, '_'))) {
            toast.error('Role Name must contain only letters, numbers, and underscores');
            document.getElementById('roleName').focus();
            return false;
        }

        if (!displayName) {
            toast.error('Display Name is required');
            document.getElementById('roleDisplayName').focus();
            return false;
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
document.addEventListener('DOMContentLoaded', () => {
    window.aclManager = new ACLManager();
});
