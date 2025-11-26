// ACL Management JavaScript

// Permission data structure
const permissionsData = {
    categories: [
        {
            id: 'inventory',
            name: 'Inventory',
            icon: 'fas fa-boxes',
            permissions: [
                { id: 'caddy.create', name: 'Add Caddies', description: 'Create new caddy entries' },
                { id: 'caddy.edit', name: 'Edit Caddies', description: 'Modify existing caddy entries' },
                { id: 'caddy.delete', name: 'Delete Caddies', description: 'Remove caddy entries' },
                { id: 'caddy.view', name: 'View Caddies', description: 'View caddy information' },
                { id: 'chassis.create', name: 'Add Chassis', description: 'Create new chassis entries' },
                { id: 'chassis.edit', name: 'Edit Chassis', description: 'Modify existing chassis entries' },
                { id: 'chassis.delete', name: 'Delete Chassis', description: 'Remove chassis entries' },
                { id: 'chassis.view', name: 'View Chassis', description: 'View chassis information' },
                { id: 'cpu.create', name: 'Add CPUs', description: 'Create new CPU entries' },
                { id: 'cpu.edit', name: 'Edit CPUs', description: 'Modify existing CPU entries' },
                { id: 'cpu.delete', name: 'Delete CPUs', description: 'Remove CPU entries' },
                { id: 'cpu.view', name: 'View CPUs', description: 'View CPU information' },
                { id: 'motherboard.create', name: 'Add Motherboards', description: 'Create new motherboard entries' },
                { id: 'motherboard.edit', name: 'Edit Motherboards', description: 'Modify existing motherboard entries' },
                { id: 'motherboard.delete', name: 'Delete Motherboards', description: 'Remove motherboard entries' },
                { id: 'motherboard.view', name: 'View Motherboards', description: 'View motherboard information' },
                { id: 'nic.create', name: 'Add NICs', description: 'Create new network card entries' },
                { id: 'nic.edit', name: 'Edit NICs', description: 'Modify existing network card entries' },
                { id: 'nic.delete', name: 'Delete NICs', description: 'Remove network card entries' },
                { id: 'nic.view', name: 'View NICs', description: 'View network card information' },
                { id: 'ram.create', name: 'Add RAM', description: 'Create new RAM entries' },
                { id: 'ram.edit', name: 'Edit RAM', description: 'Modify existing RAM entries' },
                { id: 'ram.delete', name: 'Delete RAM', description: 'Remove RAM entries' },
                { id: 'ram.view', name: 'View RAM', description: 'View RAM information' },
                { id: 'storage.create', name: 'Add Storage', description: 'Create new storage entries' },
                { id: 'storage.edit', name: 'Edit Storage', description: 'Modify existing storage entries' },
                { id: 'storage.delete', name: 'Delete Storage', description: 'Remove storage entries' },
                { id: 'storage.view', name: 'View Storage', description: 'View storage information' },
                { id: 'pciecard.create', name: 'Add PCIe Cards', description: 'Create new PCIe card entries' },
                { id: 'pciecard.edit', name: 'Edit PCIe Cards', description: 'Modify existing PCIe card entries' },
                { id: 'pciecard.delete', name: 'Delete PCIe Cards', description: 'Remove PCIe card entries' },
                { id: 'pciecard.view', name: 'View PCIe Cards', description: 'View PCIe card information' },
                { id: 'hbacard.create', name: 'Create HBA Cards', description: 'Create new HBA card entries' },
                { id: 'hbacard.edit', name: 'Edit HBA Cards', description: 'Modify existing HBA card entries' },
                { id: 'hbacard.delete', name: 'Delete HBA Cards', description: 'Remove HBA card entries' },
                { id: 'hbacard.view', name: 'View HBA Cards', description: 'View HBA card information' }
            ]
        },
        {
            id: 'system',
            name: 'System',
            icon: 'fas fa-tools',
            permissions: [
                { id: 'system.view_logs', name: 'View System Logs', description: 'Access system log files' },
                { id: 'system.logs', name: 'View System Logs (duplicate alias)', description: 'Access system log files' },
                { id: 'system.manage_settings', name: 'Manage Settings', description: 'Modify system settings' },
                { id: 'system.settings', name: 'System Settings', description: 'Access system configuration' },
                { id: 'system.backup', name: 'System Backup', description: 'Perform system backups' },
                { id: 'system.maintenance', name: 'System Maintenance', description: 'Perform system maintenance tasks' }
            ]
        },
        {
            id: 'reports',
            name: 'Reports',
            icon: 'fas fa-chart-bar',
            permissions: [
                { id: 'reports.view', name: 'View Reports', description: 'Access and view system reports' },
                { id: 'reports.create', name: 'Create Reports', description: 'Generate new reports' },
                { id: 'reports.export', name: 'Export Reports', description: 'Export reports to various formats' },
                { id: 'reports.schedule', name: 'Schedule Reports', description: 'Set up automated report generation' }
            ]
        },
        {
            id: 'dashboard',
            name: 'Dashboard',
            icon: 'fas fa-tachometer-alt',
            permissions: [
                { id: 'dashboard.view', name: 'View Dashboard', description: 'Access the main dashboard' },
                { id: 'dashboard.admin', name: 'Admin Dashboard Access', description: 'Access administrative dashboard features' }
            ]
        },
        {
            id: 'role_management',
            name: 'Role Management',
            icon: 'fas fa-users-cog',
            permissions: [
                { id: 'roles.view', name: 'View Roles', description: 'View user roles and permissions' },
                { id: 'roles.create', name: 'Create Roles', description: 'Create new user roles' },
                { id: 'roles.edit', name: 'Edit Roles', description: 'Modify existing roles' },
                { id: 'roles.delete', name: 'Delete Roles', description: 'Remove roles from the system' },
                { id: 'permissions.get_all', name: 'Get All Permissions', description: 'Retrieve all available permissions' },
                { id: 'permissions.manage', name: 'Manage Permissions', description: 'Manage permission assignments' },
                // { id: 'roles.update_permissions', name: 'Update Role Permissions', description: 'Modify role permission assignments' }
            ]
        },
        {
            id: 'server_management',
            name: 'Server Management',
            icon: 'fas fa-cogs',
            permissions: [
                { id: 'server.view', name: 'View Server Configurations', description: 'View server configuration details' },
                { id: 'server.view_all', name: 'View All Server Configurations', description: 'Access all server configurations' },
                { id: 'server.create', name: 'Create Server Configurations', description: 'Create new server configurations' },
                { id: 'server.edit', name: 'Edit Server Configurations', description: 'Modify server configurations' },
                { id: 'server.delete', name: 'Delete Server Configurations', description: 'Remove server configurations' },
                { id: 'server.delete_all', name: 'Delete Any Server Configuration', description: 'Remove any server configuration' },
                // { id: 'server.view_statistics', name: 'View Server Statistics', description: 'Access server usage statistics' }
            ]
        },
        {
            id: 'authentication',
            name: 'Authentication',
            icon: 'fas fa-key',
            permissions: [
                { id: 'auth.login', name: 'Login to System', description: 'Allow user to login to the system' },
                { id: 'auth.logout', name: 'Logout from System', description: 'Allow user to logout from the system' },
                { id: 'auth.change_password', name: 'Change Own Password', description: 'Allow user to change their own password' }
            ]
        },

        {
            id: 'server',
            name: 'Server',
            icon: 'fas fa-server',
            permissions: [
                { id: 'server.edit_all', name: 'Edit All Servers', description: 'Modify any server configuration' }
            ]
        },
        {
            id: 'user_management',
            name: 'User Management',
            icon: 'fas fa-user-friends',
            permissions: [
                { id: 'users.view', name: 'View Users', description: 'View user accounts' },
                { id: 'users.create', name: 'Create Users', description: 'Create new user accounts' },
                { id: 'users.edit', name: 'Edit Users', description: 'Modify user account details' },
                { id: 'users.delete', name: 'Delete Users', description: 'Remove user accounts' },
                { id: 'users.manage_roles', name: 'Manage User Roles', description: 'Assign and modify user roles' },
                { id: 'roles.assign', name: 'Assign Roles to Users', description: 'Assign roles to user accounts' }
            ]
        },
        {
            id: 'compatibility',
            name: 'Compatibility',
            icon: 'fas fa-check-circle',
            permissions: [
                { id: 'compatibility.check', name: 'Check Component Compatibility', description: 'Check if components are compatible with each other' },
                { id: 'compatibility.view_statistics', name: 'View Compatibility Statistics', description: 'View compatibility statistics and reports' },
                { id: 'compatibility.manage_rules', name: 'Manage Compatibility Rules', description: 'Create and manage compatibility rules' }
            ]
        },
        {
            id: 'utilities',
            name: 'Utilities',
            icon: 'fas fa-search',
            permissions: [
                { id: 'search.global', name: 'Global Search', description: 'Perform system-wide searches' },
                { id: 'search.advanced', name: 'Advanced Search', description: 'Use advanced search features' }
            ]
        }
    ]
};

document.addEventListener('DOMContentLoaded', () => {
    initACL();
});

// Export init function for dynamic loading
window.initACL = function () {
    const permissionsContainer = document.getElementById('permissionsContainer');
    const roleSelect = document.getElementById('roleSelect');
    const loadPermissionsBtn = document.getElementById('loadPermissionsBtn');
    const savePermissionsBtn = document.getElementById('savePermissionsBtn');
    const resetPermissionsBtn = document.getElementById('resetPermissionsBtn');
    const createRoleBtn = document.getElementById('createRoleBtn');
    const deleteRoleBtn = document.getElementById('deleteRoleBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const unselectAllBtn = document.getElementById('unselectAllBtn');
    const selectedPermissionsSpan = document.getElementById('selectedPermissions');
    const totalPermissionsSpan = document.getElementById('totalPermissions');
    const aclActions = document.getElementById('aclActions');

    // Modal elements
    const createRoleModal = document.getElementById('createRoleModal');
    const deleteRoleModal = document.getElementById('deleteRoleModal');
    const confirmModal = document.getElementById('confirmModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const closeDeleteModalBtn = document.getElementById('closeDeleteModalBtn');
    const closeConfirmModalBtn = document.getElementById('closeConfirmModalBtn');
    const cancelModalBtn = document.getElementById('cancelModalBtn');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const cancelConfirmBtn = document.getElementById('cancelConfirmBtn');
    const saveRoleBtn = document.getElementById('saveRoleBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const roleNameInput = document.getElementById('roleName');
    const roleTypeInput = document.getElementById('roleType');
    const roleDescriptionInput = document.getElementById('roleDescription');
    const roleLevelInput = document.getElementById('roleLevel');
    const permissionSelectionSection = document.getElementById('permissionSelectionSection');
    const modalPermissionsContainer = document.getElementById('modalPermissionsContainer');
    const deleteRoleList = document.getElementById('deleteRoleList');
    const confirmMessage = document.getElementById('confirmMessage');

    // Check if we're on the simple ACL list page
    const aclTableBody = document.getElementById('aclTableBody');
    if (!permissionsContainer && !roleSelect && aclTableBody) {
        // Initialize simple ACL list mode
        console.log('Initializing simple ACL list mode');
        initializeSimpleACLList();
        return;
    }

    // Check if elements exist before proceeding with full ACL mode
    if (!permissionsContainer || !roleSelect) {
        console.warn('ACL elements not found in DOM, skipping initialization');
        return;
    }

    let rolePermissions = {};
    let currentRole = null;
    let currentPermissions = {};
    let originalPermissions = {};
    let roleToDelete = null;
    const systemRoles = ['admin', 'superadmin', 'manager', 'viewer'];

    // Fetch permissions from the server
    async function fetchPermissions() {
        try {
            // Try different paths for permissions.json
            let response;
            const paths = [
                'permissions.json',                    // Standalone ACL page
                '../../data/permissions.json',          // From dashboard
                './permissions.json'                   // Alternative
            ];

            let lastError = null;
            for (const path of paths) {
                try {
                    response = await fetch(path);
                    if (response.ok) {
                        break;
                    }
                } catch (err) {
                    lastError = err;
                    // Silent fail, try next path
                }
            }

            if (!response || !response.ok) {
                throw lastError || new Error('Could not load permissions from any path');
            }

            rolePermissions = await response.json();
            initializeAcl();
        } catch (error) {
            console.error('Error fetching permissions:', error);
            permissionsContainer.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Failed to load permissions. Error: ${error.message}</p></div>`;
        }
    }

    // Initialize the ACL interface
    function initializeAcl() {
        // Show loading state initially
        permissionsContainer.innerHTML = '<div class="loading-state"><i class="fas fa-info-circle"></i><p>Select a role and click "Load Permissions" to view access controls</p></div>';
        updateTotalPermissions(permissionsData.categories);

        // Remove existing event listeners by cloning elements
        const removeAndReattach = (element, eventType, handler) => {
            if (element) {
                const newElement = element.cloneNode(true);
                element.parentNode.replaceChild(newElement, element);
                newElement.addEventListener(eventType, handler);
                return newElement;
            }
            return null;
        };

        // Role select change handler
        const newRoleSelect = removeAndReattach(roleSelect, 'change', () => {
            currentRole = newRoleSelect.value;
            if (currentRole) {
                loadPermissionsBtn.disabled = false;
            } else {
                loadPermissionsBtn.disabled = true;
                aclActions.style.display = 'none';
                permissionsContainer.innerHTML = '<div class="empty-state"><i class="fas fa-info-circle"></i><p>Select a role to see its permissions.</p></div>';
            }
        });

        // Load permissions button
        const newLoadBtn = removeAndReattach(loadPermissionsBtn, 'click', () => {
            const selectedRole = document.getElementById('roleSelect').value;
            if (selectedRole) {
                currentRole = selectedRole;
                renderPermissionsGrid(permissionsData.categories);
                loadRolePermissions(currentRole);
                aclActions.style.display = 'flex';
            } else {
                toastNotification.show('Please select a role first.', 'warning');
            }
        });

        // Save permissions button
        removeAndReattach(savePermissionsBtn, 'click', savePermissions);

        // Reset permissions button
        removeAndReattach(resetPermissionsBtn, 'click', () => {
            if (currentRole) {
                renderPermissionsGrid(permissionsData.categories);
                loadRolePermissions(currentRole);
                toastNotification.show('Permissions reset to original state.', 'info');
            }
        });

        // Create and Delete role buttons
        removeAndReattach(createRoleBtn, 'click', openCreateRoleModal);
        removeAndReattach(deleteRoleBtn, 'click', openDeleteRoleModal);

        // Modal buttons
        if (closeModalBtn) removeAndReattach(closeModalBtn, 'click', closeCreateRoleModal);
        if (cancelModalBtn) removeAndReattach(cancelModalBtn, 'click', closeCreateRoleModal);
        if (closeDeleteModalBtn) removeAndReattach(closeDeleteModalBtn, 'click', closeDeleteRoleModal);
        if (cancelDeleteBtn) removeAndReattach(cancelDeleteBtn, 'click', closeDeleteRoleModal);
        if (closeConfirmModalBtn) removeAndReattach(closeConfirmModalBtn, 'click', closeConfirmModal);
        if (cancelConfirmBtn) removeAndReattach(cancelConfirmBtn, 'click', closeConfirmModal);
        if (saveRoleBtn) removeAndReattach(saveRoleBtn, 'click', saveNewRole);
        if (confirmDeleteBtn) removeAndReattach(confirmDeleteBtn, 'click', confirmRoleDeletion);

        // Role type input listener
        if (roleTypeInput) {
            removeAndReattach(roleTypeInput, 'input', () => {
                if (roleTypeInput.value.trim()) {
                    permissionSelectionSection.style.display = 'block';
                    renderModalPermissions();
                } else {
                    permissionSelectionSection.style.display = 'none';
                }
            });
        }

        // Select/Unselect all buttons
        removeAndReattach(selectAllBtn, 'click', () => {
            const checkboxes = permissionsContainer.querySelectorAll('.permission-checkbox');
            checkboxes.forEach(checkbox => checkbox.checked = true);
            updateSelectedCount();
            updateAllCategoryCheckboxes();
        });

        removeAndReattach(unselectAllBtn, 'click', () => {
            const checkboxes = permissionsContainer.querySelectorAll('.permission-checkbox');
            checkboxes.forEach(checkbox => checkbox.checked = false);
            updateSelectedCount();
            updateAllCategoryCheckboxes();
        });
    }

    // Render the permissions grid
    function renderPermissionsGrid(categories) {
        permissionsContainer.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'permissions-grid';

        // Distribute categories more evenly across columns
        const columns = [[], [], []];
        const categoriesPerColumn = Math.ceil(categories.length / 3);

        categories.forEach((category, index) => {
            const columnIndex = Math.floor(index / categoriesPerColumn);
            if (columnIndex < 3) {
                columns[columnIndex].push(category);
            }
        });

        columns.forEach((columnCategories, colIndex) => {
            const columnDiv = document.createElement('div');
            columnDiv.className = 'permission-column';

            columnCategories.forEach(category => {
                const categoryDiv = document.createElement('div');
                categoryDiv.className = 'permission-category';

                if (category.id === 'inventory') {
                    categoryDiv.classList.add('inventory-category');
                }

                const categoryHeader = document.createElement('div');
                categoryHeader.className = 'category-header';
                categoryHeader.innerHTML = `
                    <div class="category-title">
                        <i class="${category.icon}"></i>
                        ${category.name}
                    </div>
                    <div class="category-select-all">
                        <input type="checkbox" class="category-checkbox" data-category="${category.id}">
                        <span>Select All</span>
                    </div>
                `;

                const permissionsList = document.createElement('div');
                permissionsList.className = 'permissions-list';

                category.permissions.forEach(permission => {
                    const permissionItem = document.createElement('div');
                    permissionItem.className = 'permission-item';
                    permissionItem.innerHTML = `
                        <input type="checkbox" class="permission-checkbox" id="${permission.id}" data-category="${category.id}">
                        <label for="${permission.id}" class="permission-label">${permission.name}</label>
                    `;
                    permissionsList.appendChild(permissionItem);
                });

                categoryDiv.appendChild(categoryHeader);
                categoryDiv.appendChild(permissionsList);
                columnDiv.appendChild(categoryDiv);
            });

            // Add empty categories to maintain consistent height if needed
            if (columnCategories.length < categoriesPerColumn) {
                const emptyCategories = categoriesPerColumn - columnCategories.length;
                for (let i = 0; i < emptyCategories; i++) {
                    const emptyDiv = document.createElement('div');
                    emptyDiv.className = 'permission-category';
                    emptyDiv.style.visibility = 'hidden';
                    emptyDiv.style.minHeight = '200px';
                    columnDiv.appendChild(emptyDiv);
                }
            }

            grid.appendChild(columnDiv);
        });

        permissionsContainer.appendChild(grid);

        // Add event listeners for category checkboxes
        const categoryCheckboxes = permissionsContainer.querySelectorAll('.category-checkbox');
        categoryCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (event) => {
                const categoryId = event.target.dataset.category;
                const permissionCheckboxes = permissionsContainer.querySelectorAll(`.permission-checkbox[data-category="${categoryId}"]`);
                permissionCheckboxes.forEach(pCheckbox => pCheckbox.checked = event.target.checked);
                updateSelectedCount();
            });
        });

        // Add event listeners for individual permission checkboxes
        const permissionCheckboxes = permissionsContainer.querySelectorAll('.permission-checkbox');
        permissionCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                updateSelectedCount();
                updateAllCategoryCheckboxes();
            });
        });
    }

    // Update the total number of permissions
    function updateTotalPermissions(categories) {
        const totalPermissions = categories.reduce((acc, category) => acc + category.permissions.length, 0);
        totalPermissionsSpan.textContent = totalPermissions;
    }

    // Load permissions for the selected role
    function loadRolePermissions(role) {
        const rolePerms = (rolePermissions[role] && rolePermissions[role].permissions) || {};
        currentPermissions = { ...rolePerms };
        originalPermissions = { ...rolePerms };

        const allCheckboxes = permissionsContainer.querySelectorAll('.permission-checkbox');
        allCheckboxes.forEach(checkbox => {
            const permissionId = checkbox.id;
            checkbox.checked = !!currentPermissions[permissionId] || !!currentPermissions['*'];
        });

        updateSelectedCount();
        updateAllCategoryCheckboxes();
    }

    // Update the selected permissions count
    function updateSelectedCount() {
        const selectedCheckboxes = permissionsContainer.querySelectorAll('.permission-checkbox:checked');
        selectedPermissionsSpan.textContent = selectedCheckboxes.length;
    }

    // Update all category checkboxes
    function updateAllCategoryCheckboxes() {
        const categoryCheckboxes = permissionsContainer.querySelectorAll('.category-checkbox');
        categoryCheckboxes.forEach(categoryCheckbox => {
            const categoryId = categoryCheckbox.dataset.category;
            const permissionCheckboxes = permissionsContainer.querySelectorAll(`.permission-checkbox[data-category="${categoryId}"]`);
            const checkedCount = permissionsContainer.querySelectorAll(`.permission-checkbox[data-category="${categoryId}"]:checked`).length;

            if (checkedCount === 0) {
                categoryCheckbox.checked = false;
                categoryCheckbox.indeterminate = false;
            } else if (checkedCount === permissionCheckboxes.length) {
                categoryCheckbox.checked = true;
                categoryCheckbox.indeterminate = false;
            } else {
                categoryCheckbox.checked = false;
                categoryCheckbox.indeterminate = true;
            }
        });
    }

    // Open Create Role Modal
    function openCreateRoleModal() {
        const modal = document.getElementById('createRoleModal');
        if (modal) {
            modal.style.display = 'flex';
            resetCreateRoleForm();
        } else {
            console.error('Create role modal not found');
        }
    }

    // Close Create Role Modal
    function closeCreateRoleModal() {
        const modal = document.getElementById('createRoleModal');
        if (modal) {
            modal.style.display = 'none';
            resetCreateRoleForm();
        }
    }

    // Reset Create Role Form
    function resetCreateRoleForm() {
        const name = document.getElementById('roleName');
        const type = document.getElementById('roleType');
        const desc = document.getElementById('roleDescription');
        const level = document.getElementById('roleLevel');
        const section = document.getElementById('permissionSelectionSection');
        const container = document.getElementById('modalPermissionsContainer');

        if (name) name.value = '';
        if (type) type.value = '';
        if (desc) desc.value = '';
        if (level) level.value = '';
        if (section) section.style.display = 'none';
        if (container) container.innerHTML = '';
    }

    // Render permissions in modal
    function renderModalPermissions() {
        const container = document.getElementById('modalPermissionsContainer');
        if (!container) {
            console.error('Modal permissions container not found');
            return;
        }

        container.innerHTML = '';

        permissionsData.categories.forEach(category => {
            const categoryCard = document.createElement('div');
            categoryCard.className = 'modal-permission-category';

            const categoryHeader = document.createElement('div');
            categoryHeader.className = 'modal-category-header';
            categoryHeader.innerHTML = `
                <div class="modal-category-title">
                    <i class="${category.icon}"></i>
                    ${category.name}
                </div>
                <div class="modal-category-select-all">
                    <input type="checkbox" class="modal-category-checkbox" data-category="${category.id}">
                    <span>Select All</span>
                </div>
            `;

            const permissionsList = document.createElement('div');
            permissionsList.className = 'modal-permissions-list';

            category.permissions.forEach(permission => {
                const permissionItem = document.createElement('div');
                permissionItem.className = 'modal-permission-item';
                permissionItem.innerHTML = `
                    <input type="checkbox" class="modal-permission-checkbox" id="modal-${permission.id}" data-category="${category.id}">
                    <label for="modal-${permission.id}" class="modal-permission-label">${permission.name}</label>
                `;
                permissionsList.appendChild(permissionItem);
            });

            categoryCard.appendChild(categoryHeader);
            categoryCard.appendChild(permissionsList);
            container.appendChild(categoryCard);
        });

        // Add event listeners for category checkboxes
        const categoryCheckboxes = container.querySelectorAll('.modal-category-checkbox');
        categoryCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (event) => {
                const categoryId = event.target.dataset.category;
                const permissionCheckboxes = container.querySelectorAll(`.modal-permission-checkbox[data-category="${categoryId}"]`);
                permissionCheckboxes.forEach(pCheckbox => pCheckbox.checked = event.target.checked);
            });
        });

        // Add event listeners for individual permission checkboxes
        const permissionCheckboxes = container.querySelectorAll('.modal-permission-checkbox');
        permissionCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                updateModalCategoryCheckboxes();
            });
        });
    }

    // Update modal category checkboxes
    function updateModalCategoryCheckboxes() {
        const container = document.getElementById('modalPermissionsContainer');
        if (!container) return;

        const categoryCheckboxes = container.querySelectorAll('.modal-category-checkbox');
        categoryCheckboxes.forEach(categoryCheckbox => {
            const categoryId = categoryCheckbox.dataset.category;
            const permissionCheckboxes = container.querySelectorAll(`.modal-permission-checkbox[data-category="${categoryId}"]`);
            const checkedCount = container.querySelectorAll(`.modal-permission-checkbox[data-category="${categoryId}"]:checked`).length;

            if (checkedCount === 0) {
                categoryCheckbox.checked = false;
                categoryCheckbox.indeterminate = false;
            } else if (checkedCount === permissionCheckboxes.length) {
                categoryCheckbox.checked = true;
                categoryCheckbox.indeterminate = false;
            } else {
                categoryCheckbox.checked = false;
                categoryCheckbox.indeterminate = true;
            }
        });
    }

    // Save new role
    function saveNewRole() {
        const roleNameInput = document.getElementById('roleName');
        const roleTypeInput = document.getElementById('roleType');
        const roleDescriptionInput = document.getElementById('roleDescription');
        const roleLevelInput = document.getElementById('roleLevel');
        const container = document.getElementById('modalPermissionsContainer');
        const selectElem = document.getElementById('roleSelect');

        if (!roleNameInput || !roleTypeInput) {
            toastNotification.show('Form elements not found', 'error');
            return;
        }

        const roleName = roleNameInput.value.trim();
        const roleType = roleTypeInput.value.trim();
        const roleDescription = roleDescriptionInput ? roleDescriptionInput.value.trim() : '';
        const roleLevel = roleLevelInput ? roleLevelInput.value : '';

        // Validation
        if (!roleName) {
            toastNotification.show('Role Name is required.', 'error');
            roleNameInput.focus();
            return;
        }

        if (!roleType) {
            toastNotification.show('Role Type is required.', 'error');
            roleTypeInput.focus();
            return;
        }

        // Check if role already exists
        const roleKey = roleName.toLowerCase().replace(/\s+/g, '');
        if (rolePermissions[roleKey]) {
            toastNotification.show('A role with this name already exists.', 'error');
            return;
        }

        // Collect selected permissions
        const selectedCheckboxes = container ? container.querySelectorAll('.modal-permission-checkbox:checked') : [];
        const newPermissions = {};
        selectedCheckboxes.forEach(checkbox => {
            const permissionId = checkbox.id.replace('modal-', '');
            newPermissions[permissionId] = true;
        });

        // Create new role object
        const newRole = {
            description: roleDescription || `${roleType} role`,
            roleType: roleType,
            level: roleLevel ? parseInt(roleLevel) : null,
            permissions: newPermissions
        };

        // Add to rolePermissions
        rolePermissions[roleKey] = newRole;

        // Update role select dropdown
        if (selectElem) {
            const option = document.createElement('option');
            option.value = roleKey;
            option.textContent = roleName;
            selectElem.appendChild(option);
        }

        toastNotification.show(`Role "${roleName}" created successfully!`, 'success');
        closeCreateRoleModal();

        console.log('New Role Created:', roleKey, newRole);
    }

    // Open Delete Role Modal
    function openDeleteRoleModal() {
        const modal = document.getElementById('deleteRoleModal');
        if (modal) {
            modal.style.display = 'flex';
            renderDeleteRoleList();
        } else {
            console.error('Delete role modal not found');
        }
    }

    // Close Delete Role Modal
    function closeDeleteRoleModal() {
        const modal = document.getElementById('deleteRoleModal');
        const list = document.getElementById('deleteRoleList');
        if (modal) {
            modal.style.display = 'none';
        }
        if (list) {
            list.innerHTML = '';
        }
    }

    // Render delete role list
    function renderDeleteRoleList() {
        const list = document.getElementById('deleteRoleList');
        if (!list) {
            console.error('Delete role list element not found');
            return;
        }

        list.innerHTML = '';

        const roles = Object.keys(rolePermissions);
        if (roles.length === 0) {
            list.innerHTML = '<p class="no-roles">No roles available to delete.</p>';
            return;
        }

        roles.forEach(roleKey => {
            const isSystemRole = systemRoles.includes(roleKey);
            const roleItem = document.createElement('div');
            roleItem.className = `delete-role-item ${isSystemRole ? 'system-role' : ''}`;

            const roleInfo = document.createElement('div');
            roleInfo.className = 'delete-role-info';

            const roleName = roleKey.charAt(0).toUpperCase() + roleKey.slice(1);
            const roleDesc = rolePermissions[roleKey].description || 'No description';

            roleInfo.innerHTML = `
                <div class="delete-role-name">
                    <i class="fas fa-user-shield"></i>
                    ${roleName}
                    ${isSystemRole ? '<span class="system-badge">System Role</span>' : ''}
                    ${roleKey === 'superadmin' ? '<span class="superadmin-badge">All Permissions</span>' : ''}
                </div>
                <div class="delete-role-desc">${roleDesc}</div>
            `;

            const deleteBtn = document.createElement('button');
            if (isSystemRole) {
                deleteBtn.className = 'btn btn-disabled';
                deleteBtn.innerHTML = '<i class="fas fa-lock"></i> Cannot Delete';
                deleteBtn.disabled = true;
            } else {
                deleteBtn.className = 'btn btn-danger-outline';
                deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
                deleteBtn.addEventListener('click', () => showDeleteConfirmation(roleKey, roleName));
            }

            roleItem.appendChild(roleInfo);
            roleItem.appendChild(deleteBtn);
            list.appendChild(roleItem);
        });
    }

    // Show delete confirmation
    function showDeleteConfirmation(roleKey, roleName) {
        roleToDelete = roleKey;
        const modal = document.getElementById('confirmModal');
        const message = document.getElementById('confirmMessage');
        if (message) {
            message.textContent = `Are you sure you want to delete the role "${roleName}"? This action cannot be undone.`;
        }
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    // Close Confirm Modal
    function closeConfirmModal() {
        const modal = document.getElementById('confirmModal');
        if (modal) {
            modal.style.display = 'none';
        }
        roleToDelete = null;
    }

    // Confirm role deletion
    function confirmRoleDeletion() {
        if (!roleToDelete) return;

        // Check if it's a system role (extra safety)
        if (systemRoles.includes(roleToDelete)) {
            toastNotification.show('Cannot delete system roles!', 'error');
            closeConfirmModal();
            return;
        }

        // Remove from rolePermissions
        delete rolePermissions[roleToDelete];

        // Remove from dropdown
        const selectElem = document.getElementById('roleSelect');
        if (selectElem) {
            const option = selectElem.querySelector(`option[value="${roleToDelete}"]`);
            if (option) {
                option.remove();
            }
        }

        // If the deleted role was currently selected, reset
        if (currentRole === roleToDelete) {
            currentRole = null;
            if (selectElem) selectElem.value = '';
            const container = document.getElementById('permissionsContainer');
            if (container) {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-info-circle"></i><p>Select a role to see its permissions.</p></div>';
            }
            const actions = document.getElementById('aclActions');
            if (actions) actions.style.display = 'none';
        }

        const roleName = roleToDelete.charAt(0).toUpperCase() + roleToDelete.slice(1);
        toastNotification.show(`Role "${roleName}" deleted successfully.`, 'success');

        closeConfirmModal();
        renderDeleteRoleList();

        console.log('Role Deleted:', roleToDelete);
    }

    // Save permissions (existing function)
    function savePermissions() {
        if (!currentRole) {
            toastNotification.show('Please select a role to save permissions.', 'warning');
            return;
        }

        const selectedCheckboxes = permissionsContainer.querySelectorAll('.permission-checkbox:checked');
        const newPermissions = {};
        selectedCheckboxes.forEach(checkbox => {
            newPermissions[checkbox.id] = true;
        });

        if (!rolePermissions[currentRole]) {
            rolePermissions[currentRole] = { permissions: {} };
        }
        rolePermissions[currentRole].permissions = newPermissions;
        originalPermissions = { ...newPermissions };

        // Here you would typically send the updated rolePermissions to the server
        toastNotification.show(`Permissions for ${currentRole} saved successfully.`, 'success');
        console.log('Updated Role Permissions:', rolePermissions);
    }

    // Initial fetch of permissions
    fetchPermissions();

    // Simple ACL list mode functions
    function initializeSimpleACLList() {
        // Simple mode - just show users with their roles in a table
        loadACLUsers();

        // Set up Add User button if it exists
        const addUserBtn = document.getElementById('addUserBtn');
        if (addUserBtn) {
            addUserBtn.addEventListener('click', () => {
                toast.warning('User management functionality coming soon');
            });
        }
    }

    async function loadACLUsers() {
        try {
            // For now, show a placeholder message
            const tableBody = document.getElementById('aclTableBody');
            if (!tableBody) return;

            // Show loading state
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-4 py-8 text-center text-slate-500">
                        <i class="fas fa-spinner fa-spin mr-2"></i> Loading users...
                    </td>
                </tr>
            `;

            // Attempt to fetch users from API
            // Note: This endpoint may not exist yet
            const response = await window.api.get('/users/list');

            if (response && response.success && response.data && response.data.users) {
                renderACLTable(response.data.users);
            } else {
                // Show placeholder if no data
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="5" class="px-4 py-8 text-center text-slate-500">
                            <i class="fas fa-users text-4xl mb-3 block"></i>
                            <p class="text-lg font-medium mb-2">No users found</p>
                            <p class="text-sm">User access control list is empty</p>
                        </td>
                    </tr>
                `;
            }
        } catch (error) {
            console.error('Failed to load ACL users:', error);
            const tableBody = document.getElementById('aclTableBody');
            if (tableBody) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="5" class="px-4 py-8 text-center text-red-600">
                            <i class="fas fa-exclamation-triangle text-2xl mb-2 block"></i>
                            <p>Failed to load users</p>
                            <p class="text-sm text-slate-500 mt-1">${error.message || 'Unknown error'}</p>
                        </td>
                    </tr>
                `;
            }
        }
    }

    function renderACLTable(users) {
        const tableBody = document.getElementById('aclTableBody');
        if (!tableBody) return;

        if (!users || users.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-4 py-8 text-center text-slate-500">
                        No users found
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = users.map(user => `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-3">${escapeHtml(user.username || user.name || 'N/A')}</td>
                <td class="px-4 py-3">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
                        ${escapeHtml(user.role || 'User')}
                    </span>
                </td>
                <td class="px-4 py-3">${escapeHtml(user.email || 'N/A')}</td>
                <td class="px-4 py-3 text-slate-500">${user.last_active || 'Never'}</td>
                <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                        <button class="text-blue-600 hover:text-blue-800 transition-colors" onclick="editACLUser(${user.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="text-red-600 hover:text-red-800 transition-colors" onclick="deleteACLUser(${user.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Expose functions globally for onclick handlers
    window.editACLUser = function(userId) {
        toast.warning('Edit user functionality coming soon');
        console.log('Edit user:', userId);
    };

    window.deleteACLUser = function(userId) {
        toast.warning('Delete user functionality coming soon');
        console.log('Delete user:', userId);
    };
};