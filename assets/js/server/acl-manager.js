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
        await this.renderRolesTable();
    }

    // ======================
    // API Methods
    // ======================

    async loadInitialData() {
        try {
            utils.showLoading(true, 'Loading roles and permissions...');

            // Load roles
            const rolesResult = await window.api.acl.getAllRoles();
            console.log('Roles result:', rolesResult);
            if (rolesResult && rolesResult.success) {
                this.roles = rolesResult.data?.roles || rolesResult.data || [];
            } else {
                this.roles = [];
            }

            // Load permissions
            const permissionsResult = await window.api.acl.getAllPermissions(true);
            console.log('Permissions result:', permissionsResult);
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
                console.log('Users result:', usersResult);
                if (usersResult && usersResult.success) {
                    this.users = usersResult.data?.users || usersResult.data || [];
                } else {
                    this.users = [];
                }
            } catch (error) {
                console.warn('Failed to load users:', error);
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
            return result.data.role;
        }
        return null;
    }

    async createRole(roleData) {
        console.log('Creating role with data:', roleData);
        console.log('Selected permissions:', Array.from(this.selectedPermissions));

        const result = await window.api.acl.createRole(roleData);
        console.log('Create role result:', result);

        if (result && result.success) {
            // Update permissions for the newly created role
            const roleId = result.data?.role_id || result.data?.id;
            const permissionIds = Array.from(this.selectedPermissions);

            console.log('Role ID:', roleId, 'Permission IDs:', permissionIds);

            if (roleId && permissionIds.length > 0) {
                const permResult = await window.api.acl.updateRolePermissions(roleId, permissionIds);
                console.log('Update permissions result:', permResult);
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
            // Fetch full role data (with users and permissions) for each role for display
            const fullRoleData = await Promise.all(
                this.roles.map(async (role) => {
                    try {
                        const fullRole = await this.getRoleById(role.id);
                        return fullRole || role;
                    } catch (error) {
                        console.warn('Failed to fetch full data for role:', role.id, error);
                        return role;
                    }
                })
            );

            tableBody.innerHTML = fullRoleData.map(role => this.createRoleRow(role)).join('');
        }
    }

    createRoleRow(role) {
        console.log('Creating row for role:', role);

        // Get users count - try multiple possible fields from API
        let usersCount = 0;
        if (role.users && Array.isArray(role.users)) {
            usersCount = role.users.length;
        } else if (role.users_count !== undefined) {
            usersCount = role.users_count;
        } else if (role.assigned_users && Array.isArray(role.assigned_users)) {
            usersCount = role.assigned_users.length;
        }

        // Count granted permissions (permissions with granted=1 or granted=true)
        let permissionsCount = 0;
        if (role.permissions && Array.isArray(role.permissions)) {
            // Filter for granted permissions only
            permissionsCount = role.permissions.filter(p => p.granted === 1 || p.granted === true).length;
        } else if (role.permission_count !== undefined) {
            permissionsCount = role.permission_count;
        }

        // Get display name - try multiple possible fields (API returns role_name)
        const displayName = role.display_name || role.displayName || role.role_name || role.name || 'Unnamed Role';
        const description = role.description || '-';
        const isDefault = role.is_default || role.isDefault || false;

        return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-shield-alt text-primary"></i>
                        <span class="font-medium text-slate-800">${utils.escapeHtml(displayName)}</span>
                        ${isDefault ? '<span class="ml-2 px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">Default</span>' : ''}
                    </div>
                </td>
                <td class="px-4 py-3 text-slate-600 text-sm">
                    ${utils.escapeHtml(description)}
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

        // Ensure permissions is an array before iterating
        if (!Array.isArray(this.permissions)) {
            grid.innerHTML = '<p class="text-center text-slate-500 py-4">No permissions available. Please refresh the page.</p>';
            console.error('Permissions must be an array but got:', typeof this.permissions, this.permissions);
            return;
        }

        if (this.permissions.length === 0) {
            grid.innerHTML = '<p class="text-center text-slate-500 py-4">No permissions found</p>';
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
                <td class="px-4 py-2 text-slate-600 text-sm">${utils.formatDate(user.assigned_at) || '-'}</td>
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
        console.log('openCreateRoleModal called');
        try {
            this.editMode = false;
            this.currentRole = null;
            this.selectedPermissions.clear();

            const modal = document.getElementById('roleModal');
            const title = document.getElementById('roleModalTitle');

            console.log('Modal element:', modal);
            console.log('Title element:', title);

            if (title) title.textContent = 'Create New Role';

            // Clear form
            const roleNameInput = document.getElementById('roleName');
            const displayNameInput = document.getElementById('roleDisplayName');
            const descriptionInput = document.getElementById('roleDescription');
            const isDefaultCheckbox = document.getElementById('roleIsDefault');

            console.log('Form elements:', { roleNameInput, displayNameInput, descriptionInput, isDefaultCheckbox });

            if (roleNameInput) roleNameInput.value = '';
            if (displayNameInput) displayNameInput.value = '';
            if (descriptionInput) descriptionInput.value = '';
            if (isDefaultCheckbox) isDefaultCheckbox.checked = false;

            console.log('About to render permissions grid, permissions:', this.permissions);
            this.renderPermissionsGrid([]);
            this.updatePermissionCount();

            if (modal) {
                console.log('Opening modal...');
                modal.classList.remove('hidden');
                // Add opacity to make modal visible (CSS has opacity: 0 by default)
                setTimeout(() => {
                    modal.style.opacity = '1';
                    const modalContent = modal.querySelector('.modal');
                    if (modalContent) {
                        modalContent.style.opacity = '1';
                        modalContent.style.transform = 'scale(1)';
                    }
                }, 10);
            } else {
                console.error('Modal element not found!');
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
                console.log('API did not return users for role, filtering from loaded users');
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
    // Event Handlers
    // ======================

    setupEventListeners() {
        // Create Role button
        const createBtn = document.getElementById('createRoleBtn');
        console.log('Setting up event listeners, createRoleBtn:', createBtn);

        if (createBtn) {
            createBtn.addEventListener('click', () => {
                console.log('Create Role button clicked!');
                this.openCreateRoleModal();
            });
        } else {
            console.warn('createRoleBtn not found when setting up event listeners');
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
        console.log('handleSaveRole called, editMode:', this.editMode);

        // Validate form
        if (!this.validateRoleForm()) {
            console.log('Form validation failed');
            return;
        }

        const roleData = {
            name: document.getElementById('roleName').value.trim().toLowerCase().replace(/\s+/g, '_'),
            display_name: document.getElementById('roleDisplayName').value.trim(),
            description: document.getElementById('roleDescription').value.trim(),
            is_default: document.getElementById('roleIsDefault').checked
        };

        console.log('Role data to save:', roleData);

        try {
            utils.showLoading(true, this.editMode ? 'Updating role...' : 'Creating role...');

            let result;
            if (this.editMode) {
                result = await this.updateRole(this.currentRole, roleData);
            } else {
                result = await this.createRole(roleData);
            }

            console.log('Save role result:', result);

            if (result && result.success) {
                toast.success(this.editMode ? 'Role updated successfully' : 'Role created successfully');
                await this.fetchAllRoles();
                await this.renderRolesTable();
                this.closeAllModals();
            } else {
                const errorMsg = result?.message || 'Failed to save role';
                console.error('Save role failed:', errorMsg);
                toast.error(errorMsg);
            }
        } catch (error) {
            console.error('Error saving role:', error);
            toast.error('An error occurred while saving the role: ' + error.message);
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
// Wait for sidebar to be injected first
function initializeACLManager() {
    console.log('Initializing ACLManager');
    try {
        window.aclManager = new ACLManager();
        console.log('ACLManager initialized:', window.aclManager);
    } catch (error) {
        console.error('Failed to initialize ACLManager:', error);
    }
}

// If we're on the ACL page, initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOMContentLoaded - Will initialize ACLManager');
        // Give sidebar time to load
        setTimeout(initializeACLManager, 500);
    });
} else {
    // DOM already loaded
    console.log('DOM already loaded - Will initialize ACLManager');
    setTimeout(initializeACLManager, 500);
}
