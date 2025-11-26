/**
 * Dashboard JavaScript for BDC Inventory Management System
 */

// ============================================
// Responsive Mobile Menu Handler
// ============================================

(function initResponsiveMenu() {
    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupMobileMenu);
    } else {
        setupMobileMenu();
    }

    function setupMobileMenu() {
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const mobileOverlay = document.getElementById('mobileOverlay');
        const sidebar = document.querySelector('.sidebar');

        if (!hamburgerBtn || !mobileOverlay || !sidebar) return;

        // Toggle sidebar on hamburger click
        hamburgerBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleSidebar();
        });

        // Close sidebar when clicking overlay
        mobileOverlay.addEventListener('click', function () {
            closeSidebar();
        });

        // Close sidebar when clicking close button (::before pseudo element)
        sidebar.addEventListener('click', function (e) {
            const rect = sidebar.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            // Check if click is in the close button area (top-right)
            if (clickX > rect.width - 60 && clickY < 60) {
                closeSidebar();
            }
        });

        // Close sidebar on ESC key
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && sidebar.classList.contains('active')) {
                closeSidebar();
            }
        });

        function toggleSidebar() {
            const isActive = sidebar.classList.toggle('active');
            mobileOverlay.classList.toggle('active', isActive);
            hamburgerBtn.classList.toggle('active', isActive);

            // Prevent body scroll when sidebar is open
            document.body.style.overflow = isActive ? 'hidden' : '';
        }

        function closeSidebar() {
            sidebar.classList.remove('active');
            mobileOverlay.classList.remove('active');
            hamburgerBtn.classList.remove('active');
            document.body.style.overflow = '';
        }

        // Close sidebar when clicking menu items on mobile
        const menuItems = sidebar.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            item.addEventListener('click', function () {
                // Only auto-close on mobile
                if (window.innerWidth <= 992) {
                    closeSidebar();
                }
            });
        });

        // Handle window resize
        let resizeTimeout;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(function () {
                // Close sidebar if resizing to desktop view
                if (window.innerWidth > 992 && sidebar.classList.contains('active')) {
                    closeSidebar();
                }
            }, 250);
        });
    }
})();

class Dashboard {
    constructor() {
        this.currentComponent = 'dashboard';
        this.currentPage = 1;
        this.itemsPerPage = 50;
        this.searchTimeout = null;
        this.selectedItems = new Set();
        this.cardListenersInitialized = false;
        this.allComponents = []; // Store all components for client-side filtering
        this.loadingStates = {
            dashboard: false,
            components: false,
            servers: false
        };

        this.init();
    }

    async init() {
        await this.initializeUserInfo();
        this.setupEventListeners();

        // Always load sidebar stats regardless of page
        this.loadSidebarStats();

        // Determine current page and load appropriate data
        const path = window.location.pathname;
        const page = path.split('/').pop();

        if (page === 'index.html' || page === '' || page === 'dashboard') {
            this.currentComponent = 'dashboard';
            await this.loadDashboard();
        } else if (page === 'servers.html') {
            this.currentComponent = 'servers';
            await this.loadServerList();
        } else if (page === 'acl.html') {
            this.currentComponent = 'acl';
            if (typeof initACL === 'function') {
                initACL();
            }
        } else if (page === 'tickets.html') {
            this.currentComponent = 'tickets';
            if (typeof initTickets === 'function') {
                initTickets();
            }
        } else {
            // Assume it's a component page
            const component = page.replace('.html', '');
            this.currentComponent = component;
            await this.loadComponentList(component);
        }

        this.setupSearch();
    }

    async initializeUserInfo() {
        const user = api.getUser();
        if (user) {
            document.getElementById('userDisplayName').textContent =
                `${user.firstname} ${user.lastname}` || user.username;
            document.getElementById('userRole').textContent =
                user.primary_role ? user.primary_role.replace('_', ' ').toUpperCase() : 'USER';
        }
    }

    setupEventListeners() {
        // Dashboard refresh
        const refreshDashboard = document.getElementById('refreshDashboard');
        if (refreshDashboard) {
            refreshDashboard.addEventListener('click', () => this.loadDashboard());
        }

        // Add component - Use event delegation
        document.addEventListener('click', (e) => {
            if (e.target.closest('#addComponentBtn')) {
                e.preventDefault();
                e.stopPropagation();
                this.showAddForm();
            }
        });

        // Refresh components
        const refreshComponents = document.getElementById('refreshComponents');
        if (refreshComponents) {
            refreshComponents.addEventListener('click', () => this.loadComponentList(this.currentComponent));
        }

        // Refresh servers
        const refreshServers = document.getElementById('refreshServers');
        if (refreshServers) {
            refreshServers.addEventListener('click', () => this.loadServerList());
        }

        // Component search
        const componentSearch = document.getElementById('componentSearch');
        if (componentSearch) {
            componentSearch.addEventListener('input', utils.debounce((e) => {
                this.handleSearch(e.target.value);
                // Also trigger filter if needed
                this.filterAndRenderComponents(this.currentComponent);
            }, 300));
        }

        // Status filter
        const statusFilter = document.getElementById('statusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.handleFilterChange('status', e.target.value);
                this.filterAndRenderComponents(this.currentComponent);
            });
        }

        // Global search
        const globalSearch = document.getElementById('globalSearch');
        if (globalSearch) {
            globalSearch.addEventListener('input', utils.debounce((e) => this.handleGlobalSearch(e.target.value), 500));
        }

        // Select all
        const selectAllComponents = document.getElementById('selectAllComponents');
        if (selectAllComponents) {
            selectAllComponents.addEventListener('change', (e) => this.toggleSelectAll(e.target.checked));
        }

        // Bulk actions
        const bulkUpdateStatus = document.getElementById('bulkUpdateStatus');
        if (bulkUpdateStatus) {
            bulkUpdateStatus.addEventListener('click', () => this.showBulkUpdateModal());
        }

        const bulkDelete = document.getElementById('bulkDelete');
        if (bulkDelete) {
            bulkDelete.addEventListener('click', () => this.handleBulkDelete());
        }

        // Add server button
        const addServerBtn = document.getElementById('addServerBtn');
        if (addServerBtn) {
            addServerBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showAddServerForm();
            });
        }

        // User Dropdown
        const dropdownBtn = document.querySelector('.dropdown-btn');
        const dropdown = document.querySelector('.dropdown');

        if (dropdownBtn && dropdown) {
            dropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('active');
            });

            document.addEventListener('click', (e) => {
                if (!dropdown.contains(e.target)) {
                    dropdown.classList.remove('active');
                }
            });
        }

        // Logout
        document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleLogout();
        });

        document.getElementById('bulkDelete')?.addEventListener('click', () => {
            this.showBulkDeleteModal();
        });
    }

    renderComponentHeader() {
        const thead = document.getElementById('componentsTableHeader');
        if (!thead) return;
        thead.innerHTML = `
            <tr>
                <th class="h-12"><input type="checkbox" id="selectAllComponents"></th>
                <th class="h-12">Serial Number</th><th class="h-12">Status</th><th class="h-12">Server UUID</th><th class="h-12">Location</th><th class="h-12">Purchase Date</th><th class="h-12">Actions</th>
            </tr>
        `;
    }

    async loadDashboard() {
        if (this.loadingStates.dashboard) {
            return;
        }

        try {
            this.loadingStates.dashboard = true;
            utils.showLoading(true, 'Loading dashboard...');
            const result = await api.dashboard.getData();
            if (result.success && result.data.component_counts) {
                this.updateDashboardStats(result.data.component_counts);
                // Sidebar counts updated via loadSidebarStats
                await this.loadRecentActivity();
            }
        } catch (error) {
            console.error('Error loading dashboard:', error);
            utils.showAlert('Failed to load dashboard data', 'error');
        } finally {
            this.loadingStates.dashboard = false;
            utils.showLoading(false);
        }
    }

    async loadSidebarStats() {
        try {
            const result = await api.dashboard.getData();
            if (result.success && result.data.component_counts) {
                this.updateSidebarCounts(result.data.component_counts);
            }
        } catch (error) {
            console.error('Error loading sidebar stats:', error);
        }
    }

    updateDashboardStats(stats) {
        const components = ['cpu', 'ram', 'storage', 'motherboard', 'nic', 'caddy', 'chassis', 'pciecard', 'hbacard'];
        components.forEach(component => {
            if (stats[component]) {
                const stat = stats[component];
                const componentName = component.charAt(0).toUpperCase() + component.slice(1);
                const totalEl = document.getElementById(`dash${componentName}Total`);
                const availEl = document.getElementById(`dash${componentName}Available`);
                const inUseEl = document.getElementById(`dash${componentName}InUse`);
                const failedEl = document.getElementById(`dash${componentName}Failed`);

                if (totalEl) totalEl.textContent = stat.total || 0;
                if (availEl) availEl.textContent = stat.available || 0;
                if (inUseEl) inUseEl.textContent = stat.in_use || 0;
                if (failedEl) failedEl.textContent = stat.failed || 0;
            }
        });
        if (stats.servers) {
            const serverStat = stats.servers;
            const dashServersTotal = document.getElementById('dashServersTotal');
            const dashServersDraft = document.getElementById('dashServersDraft');
            const dashServersValidated = document.getElementById('dashServersValidated');
            const dashServersBuilt = document.getElementById('dashServersBuilt');
            const dashServersFinalized = document.getElementById('dashServersFinalized');

            if (dashServersTotal) dashServersTotal.textContent = serverStat.total || 0;
            if (dashServersDraft) dashServersDraft.textContent = serverStat.draft || 0;
            if (dashServersValidated) dashServersValidated.textContent = serverStat.validated || 0;
            if (dashServersBuilt) dashServersBuilt.textContent = serverStat.built || 0;
            if (dashServersFinalized) dashServersFinalized.textContent = serverStat.finalized || 0;
        }

        // Click listeners for cards are no longer needed as they are links or handled by simple redirects
        if (!this.cardListenersInitialized) {
            const allComponents = [...components, 'servers'];
            allComponents.forEach(component => {
                const card = document.querySelector(`.${component}-card`);
                if (card) {
                    card.style.cursor = 'pointer';
                    card.addEventListener('click', () => {
                        window.location.href = `${component}.html`;
                    });
                }
            });
            this.cardListenersInitialized = true;
        }
    }

    updateSidebarCounts(stats) {
        const components = ['cpu', 'ram', 'storage', 'motherboard', 'nic', 'caddy', 'chassis', 'pciecard', 'hbacard', 'servers'];
        components.forEach(component => {
            const countElement = document.getElementById(`${component}Count`);
            if (countElement && stats[component]) {
                countElement.textContent = stats[component].total || 0;
            }
        });
    }

    async loadRecentActivity() {
        const mockActivity = [
            { type: 'added', component: 'CPU', details: 'Intel Core i9-12900K added', user: 'Admin', time: new Date(Date.now() - 30 * 60 * 1000) },
            { type: 'updated', component: 'RAM', details: 'DDR4-3200 32GB status changed', user: 'Admin', time: new Date(Date.now() - 2 * 60 * 60 * 1000) },
            { type: 'added', component: 'Storage', details: 'Samsung 980 PRO 1TB added', user: 'Admin', time: new Date(Date.now() - 4 * 60 * 60 * 1000) }
        ];
        const activityContainer = document.getElementById('recentActivity');
        if (activityContainer) {
            activityContainer.innerHTML = mockActivity.map(activity => `
                <div class="activity-item">
                    <div class="activity-icon ${activity.type}"><i class="fas fa-${activity.type === 'added' ? 'plus' : 'edit'}"></i></div>
                    <div class="activity-content"><div class="title">${activity.details}</div><div class="details">by ${activity.user}</div></div>
                    <div class="activity-time">${utils.formatRelativeTime(activity.time)}</div>
                </div>
            `).join('');
        }
    }

    async loadComponentList(componentType, forceRefresh = false) {
        if (!componentType || componentType === 'dashboard') return;
        if (this.loadingStates.components && !forceRefresh) {
            return;
        }

        try {
            this.loadingStates.components = true;
            utils.showLoading(true, `Loading ${componentType} components...`);

            // Only send search parameter to API, not status
            const search = document.getElementById('componentSearch')?.value || '';
            const params = { limit: this.itemsPerPage, offset: (this.currentPage - 1) * this.itemsPerPage };
            if (search) params.search = search;

            const result = await api.components.list(componentType, params);

            if (result.success) {
                // Store all components for client-side filtering
                this.allComponents = result.data.components;

                // Apply client-side status filter
                this.filterAndRenderComponents(componentType);

                // Handle pagination - support both formats
                if (result.data.pagination) {
                    this.renderPagination(result.data.pagination);
                } else if (result.data.total_count !== undefined) {
                    // Create pagination object from total_count
                    const pagination = {
                        total: result.data.total_count,
                        limit: this.itemsPerPage,
                        offset: (this.currentPage - 1) * this.itemsPerPage,
                        page: this.currentPage
                    };
                    this.renderPagination(pagination);
                }

                this.updateBulkActions();
            }
        } catch (error) {
            console.error(`Error loading ${componentType} components:`, error);
            utils.showAlert(`Failed to load ${componentType} components`, 'error');
        } finally {
            this.loadingStates.components = false;
            utils.showLoading(false);
        }
    }

    filterAndRenderComponents(componentType) {
        const statusFilter = document.getElementById('statusFilter')?.value || '';

        let filteredComponents = this.allComponents;

        // Apply status filter on frontend
        if (statusFilter !== '') {
            filteredComponents = this.allComponents.filter(component => {
                return component.Status == statusFilter;
            });
        }

        // Render filtered components
        this.renderComponentTable(filteredComponents, componentType);

        // Update pagination info with filtered count
        const paginationInfo = document.getElementById('paginationInfo');
        if (paginationInfo) {
            paginationInfo.textContent = `Showing ${filteredComponents.length} of ${this.allComponents.length} items`;
        }
    }

    async loadServerList(forceRefresh = false) {
        if (this.loadingStates.servers && !forceRefresh) {
            return;
        }

        try {
            this.loadingStates.servers = true;

            // Only fetch from API if we don't have cached data or forcing refresh
            if (!this.allServers || forceRefresh) {
                utils.showLoading(true, `Loading servers...`);
                const params = {};  // No search/filter params - get all servers
                const result = await api.servers.listConfigs(params);

                if (result.success && result.data && result.data.configurations) {
                    this.allServers = result.data.configurations;
                } else {
                    console.error('Invalid server list response:', result);
                    this.allServers = [];
                }
            }

            // Apply frontend filtering
            this.filterAndRenderServers();

        } catch (error) {
            console.error(`Error loading servers:`, error);
            utils.showAlert(`Failed to load servers`, 'error');
            this.renderServerList([]);
        } finally {
            this.loadingStates.servers = false;
            utils.showLoading(false);
        }
    }

    filterAndRenderServers() {
        if (!this.allServers) {
            this.renderServerList([]);
            return;
        }

        // Get search and filter values
        const search = document.getElementById('serverSearch')?.value?.trim().toLowerCase() || '';
        const status = document.getElementById('serverStatusFilter')?.value || '';

        // Filter servers on frontend
        let filteredServers = this.allServers;

        // Apply search filter
        if (search) {
            filteredServers = filteredServers.filter(server => {
                const name = (server.server_name || '').toLowerCase();
                const description = (server.description || '').toLowerCase();
                const location = (server.location || '').toLowerCase();
                const notes = (server.notes || '').toLowerCase();

                return name.includes(search) ||
                    description.includes(search) ||
                    location.includes(search) ||
                    notes.includes(search);
            });
        }

        // Apply status filter
        if (status) {
            filteredServers = filteredServers.filter(server => {
                return server.configuration_status == status;
            });
        }

        // Render filtered results
        this.renderServerList(filteredServers);
    }

    renderComponentTable(components, componentType) {
        const tbody = document.getElementById('componentsTableBody');
        if (!tbody) return;
        if (components.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><div style="text-align: center; padding: 40px;"><i class="fas fa-box-open" style="font-size: 48px; color: var(--text-muted); margin-bottom: 16px;"></i><h3>No Components Found</h3><p>No ${componentType} components match your search criteria.</p><button class="btn btn-primary" onclick="dashboard.showAddForm()"><i class="fas fa-plus"></i> Add First ${componentType.toUpperCase()}</button></div></td></tr>`;
            return;
        }
        tbody.innerHTML = components.map(component => {
            // Handle null SerialNumber - fallback to UUID or "N/A"
            const serialNumber = component.SerialNumber || component.UUID || 'N/A';
            const location = component.Location || '-';

            return `
            <tr class="h-16">
                <td><input type="checkbox" class="component-checkbox" value="${component.ID}" onchange="dashboard.handleItemSelection(this)"></td>
                <td><strong>${utils.escapeHtml(serialNumber)}</strong>${component.UUID && component.SerialNumber ? `<br><small style="color: var(--text-muted); font-family: monospace;">${component.UUID}</small>` : ''}</td>
                <td>${utils.createStatusBadge(component.Status)}</td>
                <td>${component.ServerUUID ? `<code>${utils.truncateText(component.ServerUUID, 20)}</code>` : '-'}</td>
                <td>${utils.escapeHtml(location)}</td>
                <td>${utils.formatDate(component.PurchaseDate)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn edit" onclick="dashboard.showEditForm('${componentType}', ${component.ID})" title="Edit"><i class="fas fa-edit"></i></button>
                        <button class="action-btn delete" onclick="dashboard.handleDeleteComponent('${componentType}', ${component.ID})" title="Delete"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
        }).join('');
    }

    renderServerList(servers) {
        const serverCardsGrid = document.getElementById('serverGrid');
        if (!serverCardsGrid) return;

        if (servers.length === 0) {
            serverCardsGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 60px 24px;">
                    <i class="fas fa-server" style="font-size: 64px; color: var(--text-muted); margin-bottom: 16px;"></i>
                    <h3 style="font-size: 20px; margin-bottom: 8px; color: var(--text-color);">No Servers Found</h3>
                    <p style="font-size: 16px; margin-bottom: 24px; color: var(--text-secondary);">Start building your first server configuration</p>
                    <button class="btn btn-primary" onclick="dashboard.showAddServerForm()">
                        <i class="fas fa-plus"></i> Create New Server
                    </button>
                </div>`;
            return;
        }

        const getStatusBadge = (status) => {
            const statusMap = {
                '0': { label: 'Draft', class: 'draft', color: 'var(--warning-color)' },
                '1': { label: 'Validated', class: 'validated', color: 'var(--info-color)' },
                '2': { label: 'Built', class: 'built', color: 'var(--success-color)' },
                '3': { label: 'Finalized', class: 'finalized', color: 'var(--primary-color)' }
            };
            const s = statusMap[status] || statusMap['0'];
            return `<span class="status-badge ${s.class}" style="background-color: rgba(155,169,178,0.15); color: ${s.color};">${s.label}</span>`;
        };

        serverCardsGrid.innerHTML = servers.map(server => `
            <div class="server-config-card" data-server-uuid="${server.config_uuid}">
                <div class="server-config-header">
                    <div class="server-config-info">
                        <div class="server-config-title-wrapper">
                            <div class="server-icon-wrapper">
                                <i class="fas fa-server"></i>
                            </div>
                            <div style="min-width: 0; flex: 1;">
                                <h3 class="server-config-title" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                    ${utils.escapeHtml(server.server_name || 'Unnamed Server')}
                                </h3>
                                ${getStatusBadge(server.configuration_status)}
                            </div>
                        </div>
                        ${server.description ? `<p class="server-config-description">${utils.escapeHtml(server.description)}</p>` : ''}
                    </div>
                    <button class="btn btn-danger" style="padding: 8px 12px; font-size: 12px; flex-shrink: 0;"
                            onclick="event.stopPropagation(); dashboard.handleDeleteServer('${server.config_uuid}')"
                            title="Delete Server">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>

                <div class="server-config-stats">
                    <div class="server-stat-item">
                        <div class="server-stat-icon">
                            <i class="fas fa-microchip"></i>
                        </div>
                        <div class="server-stat-label">Components</div>
                        <div class="server-stat-value">${server.total_component_types || 0}</div>
                    </div>
                </div>

                <div class="server-config-meta">
                    <div class="server-meta-row">
                        <span class="server-meta-label"><i class="fas fa-calendar"></i>Created:</span>
                        <span class="server-meta-value">${utils.formatDate(server.created_at)}</span>
                    </div>
                    <div class="server-meta-row">
                        <span class="server-meta-label"><i class="fas fa-clock"></i>Modified:</span>
                        <span class="server-meta-value">${utils.formatDate(server.last_modified)}</span>
                    </div>
                </div>

                <div class="server-config-actions">
                    <button class="btn btn-primary" style="flex: 1; justify-content: center;"
                            onclick="event.stopPropagation(); dashboard.showServerBuilder('${server.config_uuid}', '${utils.escapeHtml(server.server_name || 'Unnamed Server').replace(/'/g, "\\'")}')"
                            title="Configure server components">
                        <i class="fas fa-wrench"></i> Configure
                    </button>
                </div>
            </div>
        `).join('');
    }

    renderPagination(pagination) {
        const paginationContainer = document.getElementById('pagination');
        const paginationInfo = document.getElementById('paginationInfo');
        if (!paginationContainer || !pagination) return;
        const start = pagination.offset + 1;
        const end = Math.min(pagination.offset + pagination.limit, pagination.total);
        paginationInfo.textContent = `Showing ${start}-${end} of ${pagination.total} items`;
        const totalPages = Math.ceil(pagination.total / pagination.limit);
        const currentPage = pagination.page;
        let paginationHTML = '';
        paginationHTML += `<button ${currentPage === 1 ? 'disabled' : ''} onclick="dashboard.goToPage(${currentPage - 1})"><i class="fas fa-chevron-left"></i> Previous</button>`;
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, currentPage + 2);
        if (startPage > 1) {
            paginationHTML += `<button onclick="dashboard.goToPage(1)">1</button>`;
            if (startPage > 2) paginationHTML += `<span>...</span>`;
        }
        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `<button ${i === currentPage ? 'class="active"' : ''} onclick="dashboard.goToPage(${i})">${i}</button>`;
        }
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) paginationHTML += `<span>...</span>`;
            paginationHTML += `<button onclick="dashboard.goToPage(${totalPages})">${totalPages}</button>`;
        }
        paginationHTML += `<button ${currentPage === totalPages ? 'disabled' : ''} onclick="dashboard.goToPage(${currentPage + 1})">Next <i class="fas fa-chevron-right"></i></button>`;
        paginationContainer.innerHTML = paginationHTML;
    }

    goToPage(page) {
        this.currentPage = page;
        this.loadComponentList(this.currentComponent);
    }

    handleSearch(query) {
        this.currentPage = 1;
        this.loadComponentList(this.currentComponent);
    }

    handleFilterChange(filterType, value) {
        // For status filter, just re-render with client-side filtering
        if (filterType === 'status') {
            this.filterAndRenderComponents(this.currentComponent);
        } else {
            this.currentPage = 1;
            this.loadComponentList(this.currentComponent);
        }
    }

    async handleGlobalSearch(query) {
        if (query.trim().length < 2) return;
        try {
            const result = await api.search.global(query, { limit: 10 });
            if (result.success && result.data.results.length > 0) {
            }
        } catch (error) {
            console.error('Global search error:', error);
        }
    }

    handleItemSelection(checkbox) {
        const id = parseInt(checkbox.value);
        if (checkbox.checked) this.selectedItems.add(id); else this.selectedItems.delete(id);
        this.updateBulkActions();
        this.updateSelectAllCheckbox();
    }

    toggleSelectAll(checked) {
        document.querySelectorAll('.component-checkbox').forEach(checkbox => {
            checkbox.checked = checked;
            this.handleItemSelection(checkbox);
        });
    }

    updateSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById('selectAllComponents');
        const checkboxes = document.querySelectorAll('.component-checkbox');
        if (selectAllCheckbox && checkboxes.length > 0) {
            const checkedCount = document.querySelectorAll('.component-checkbox:checked').length;
            selectAllCheckbox.checked = checkedCount === checkboxes.length;
            selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
        }
    }

    updateBulkActions() {
        const bulkActions = document.getElementById('bulkActions');
        const selectedCount = document.getElementById('selectedCount');
        if (bulkActions && selectedCount) {
            if (this.selectedItems.size > 0) {
                selectedCount.textContent = this.selectedItems.size;
                bulkActions.style.display = 'flex';
            } else {
                bulkActions.style.display = 'none';
            }
        }
    }

    async showAddForm() {
        if (this.currentComponent === 'dashboard') {
            utils.showAlert('Please select a specific component type (CPU, RAM, etc.) to add.', 'warning');
            return;
        }

        try {
            utils.showLoading(true, 'Loading form...');

            // Load the full add component form HTML
            const formUrl = '../../pages/forms/add-component.html';

            const response = await fetch(formUrl);

            if (!response.ok) {
                throw new Error(`Could not load form HTML. Status: ${response.status}`);
            }

            const formHtml = await response.text();

            // Hide loading spinner before showing modal
            utils.showLoading(false);

            this.showModal(`Add New ${this.currentComponent.toUpperCase()}`, formHtml);

            // Load and initialize the form JavaScript
            const scriptSrc = '../../assets/js/forms/add-form.js';
            const existingScript = document.querySelector(`script[src="${scriptSrc}"]`);

            if (!existingScript) {
                const script = document.createElement('script');
                script.src = scriptSrc;
                script.onload = () => {
                    if (typeof initializeAddComponentForm === 'function') {
                        initializeAddComponentForm(this.currentComponent);
                    } else {
                        console.error('initializeAddComponentForm function not found!');
                    }
                };
                script.onerror = (error) => {
                    console.error('Failed to load add-form.js:', error);
                    utils.showAlert('Failed to load form script', 'error');
                };
                document.body.appendChild(script);
            } else {
                // Script already loaded, just initialize the form
                if (typeof initializeAddComponentForm === 'function') {
                    initializeAddComponentForm(this.currentComponent);
                } else {
                    console.error('initializeAddComponentForm function not found!');
                }
            }
        } catch (error) {
            console.error('Error loading add form:', error);
            utils.showAlert(`Failed to load the add component form: ${error.message}`, 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    async showAddServerForm() {
        const formContent = `
        <form id="createServerForm" style="max-width: 500px; margin: 0 auto;">
            <div class="form-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #e0e0e0;">
                
                <div class="toggle-group" style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 14px; color: #666; font-weight: 500;">Advanced View</span>
                    <label class="toggle-switch">
                        <input type="checkbox" id="advancedViewToggle">
                        <span class="toggle-slider">
                        </span>
                    </label>
                </div>
            </div>
            
            <div id="standardForm">
                <div class="form-group">
                    <label for="serverName" class="form-label required">Server Name</label>
                    <input type="text" class="form-input" id="serverName" required
                           placeholder="e.g., Production Web Server">
                </div>
                <div class="form-group">
                    <label for="description" class="form-label">Description</label>
                    <textarea class="form-textarea" id="description" rows="3"
                              placeholder="Enter server description and purpose"></textarea>
                </div>
            </div>
            
            <div id="advancedForm" style="display: none;">
                <div class="form-group">
                    <label for="startWith" class="form-label">Start Configuration With</label>
                    <select class="form-select" id="startWith">
                        <option value="motherboard">Motherboard (Recommended)</option>
                        <option value="cpu">CPU</option>
                        <option value="ram">RAM</option>
                        <option value="storage">Storage</option>
                        <option value="nic">Network Interface Card</option>
                    </select>
                    <p class="form-help">
                        <i class="fas fa-info-circle"></i>
                        Starting with Motherboard ensures better component compatibility
                    </p>
                </div>
                <div class="form-group">
                    <label for="serverType" class="form-label">Server Type</label>
                    <select class="form-select" id="serverType">
                        <option value="standard">Standard</option>
                        <option value="high-availability">High Availability</option>
                        <option value="load-balancer">Load Balancer</option>
                        <option value="database">Database</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="environment" class="form-label">Environment</label>
                    <select class="form-select" id="environment">
                        <option value="production">Production</option>
                        <option value="staging">Staging</option>
                        <option value="development">Development</option>
                        <option value="testing">Testing</option>
                    </select>
                </div>
            </div>
            
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="dashboard.closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-plus"></i> Create Server
                </button>
            </div>
        </form>
        
    `;

        this.showModal('Create New Server', formContent);

        // Initialize toggle functionality
        const toggle = document.getElementById('advancedViewToggle');
        const standardForm = document.getElementById('standardForm');
        const advancedForm = document.getElementById('advancedForm');

        if (toggle) {
            toggle.addEventListener('change', function () {
                const toggleStatus = this.parentElement.querySelector('.toggle-status');

                if (this.checked) {
                    standardForm.style.display = 'none';
                    advancedForm.style.display = 'block';
                    toggleStatus.textContent = 'On';
                } else {
                    standardForm.style.display = 'block';
                    advancedForm.style.display = 'none';
                    toggleStatus.textContent = 'Off';
                }
            });
        }

        // Initialize form handler
        const createServerForm = document.getElementById('createServerForm');
        if (createServerForm) {
            createServerForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const isAdvancedView = toggle.checked;
                const serverName = document.getElementById('serverName').value.trim();
                const description = document.getElementById('description').value.trim();
                let startWith = 'motherboard'; // Default

                if (isAdvancedView) {
                    startWith = document.getElementById('startWith').value;
                    // You can collect other advanced fields here
                    const serverType = document.getElementById('serverType').value;
                    const environment = document.getElementById('environment').value;
                }

                if (!serverName) {
                    utils.showAlert('Please enter a server name', 'warning');
                    return;
                }

                try {
                    utils.showLoading(true, 'Creating server...');
                    const result = await api.servers.createConfig(serverName, description, startWith);
                    if (result.success) {
                        utils.showAlert('Server created successfully!', 'success');
                        this.closeModal();
                        await this.loadServerList();
                        await this.loadDashboard();
                        // Open server builder view if config_uuid is returned
                        if (result.data && result.data.config_uuid) {
                            setTimeout(() => {
                                this.showServerBuilder(result.data.config_uuid, serverName);
                            }, 500);
                        }
                    } else {
                        utils.showAlert(result.message || 'Failed to create server', 'error');
                    }
                } catch (error) {
                    utils.showAlert('An error occurred while creating the server.', 'error');
                    console.error('Create server error:', error);
                } finally {
                    utils.showLoading(false);
                }
            });
        }
    }
    async showServerBuilder(configUuid, serverName) {

        // Switch to server builder view
        document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
        document.getElementById('serverBuilderView').classList.add('active');

        // Update title
        document.getElementById('serverBuilderTitle').innerHTML = `<i class="fas fa-wrench"></i> ${serverName || 'Server Builder'}`;
        // document.getElementById('serverBuilderSubtitle').textContent = `PC Part Picker Style Interface`;

        // Store current config
        this.currentServerConfig = {
            uuid: configUuid,
            name: serverName
        };

        // Use PC part picker builder if available
        if (window.pcppBuilder) {
            try {
                window.pcppBuilder.currentConfig = null;
                await window.pcppBuilder.loadExistingConfig(configUuid);
                // The PC part picker builder will now render directly to serverBuilderContent
            } catch (error) {
                console.error('Error loading PC part picker builder:', error);
                this.showServerBuilderError('Failed to load server builder: ' + error.message);
            }
        } else {
            // Load server configuration with fallback
            await this.loadServerConfiguration(configUuid);
        }
    }

    async loadServerConfiguration(configUuid) {
        const builderContent = document.getElementById('serverBuilderContent');
        if (!builderContent) return;

        try {
            utils.showLoading(true, 'Loading server configuration...');

            // Get server config details
            const configResult = await api.servers.getConfig(configUuid);

            if (!configResult.success) {
                throw new Error(configResult.message || 'Failed to load configuration');
            }

            const config = configResult.data;

            // Component types definition
            this.componentTypes = [
                { type: 'cpu', name: 'CPU', description: 'Processor', icon: 'fas fa-microchip', multiple: false },
                { type: 'motherboard', name: 'Motherboard', description: 'System Board', icon: 'fas fa-th-large', multiple: false },
                { type: 'ram', name: 'RAM', description: 'Memory Modules', icon: 'fas fa-memory', multiple: true },
                { type: 'storage', name: 'Storage', description: 'Hard Drives, SSDs, NVMe', icon: 'fas fa-hdd', multiple: true },
                { type: 'chassis', name: 'Chassis', description: 'Server Cabinet/Case', icon: 'fas fa-server', multiple: false },
                { type: 'caddy', name: 'Caddy', description: 'Drive Mounting Hardware', icon: 'fas fa-box', multiple: true },
                { type: 'pciecard', name: 'PCI Cards', description: 'Expansion Cards (GPU, RAID)', icon: 'fas fa-credit-card', multiple: true },
                { type: 'hbacard', name: 'HBA Cards', description: 'Host Bus Adapter Cards', icon: 'fas fa-plug', multiple: true },
                { type: 'nic', name: 'Network Cards', description: 'Network Interface Cards', icon: 'fas fa-network-wired', multiple: true }
            ];

            this.componentLimits = {
                cpu: 2, motherboard: 1, ram: 24, storage: 24,
                chassis: 1, caddy: 24, pciecard: 8, hbacard: 4, nic: 4
            };

            // Load existing components directly from the config data (no second API call)
            this.loadExistingComponentsFromData(config);

            // Calculate progress based on loaded components
            const selectedCount = this.getSelectedCount();
            const totalCount = this.componentTypes.length;
            const progressPercent = totalCount > 0 ? (selectedCount / totalCount) * 100 : 0;

            // Render server builder interface
            builderContent.innerHTML = `
                <div class="server-builder-container">
                    <!-- Progress Section -->
                    <div class="progress-section">
                        <div class="progress-header">
                            <span class="progress-text">Component Selection Progress</span>
                            <span class="progress-count">${selectedCount}/${totalCount} Components</span>
                        </div>
                        <div class="progress-bar-container">
                            <div class="progress-bar" style="width: ${progressPercent}%"></div>
                        </div>
                    </div>

                    <!-- Components Grid -->
                    <div class="components-grid" style="margin-top: 24px;">
                        ${this.componentTypes.map(type => this.renderComponentCard(type)).join('')}
                    </div>

                    <!-- Validation Section -->
                    <div class="validation-section" style="margin-top: 32px;">
                        <div class="validation-actions">
                            <button class="btn btn-success validation-button" id="validateButton" ${selectedCount === 0 ? 'disabled' : ''}>
                                <i class="fas fa-clipboard-check"></i>
                                Validate Configuration
                            </button>
                            <button class="btn btn-primary deploy-button" id="deployButton" disabled>
                                <i class="fas fa-rocket"></i>
                                Deploy Server
                            </button>
                        </div>
                    </div>
                </div>
            `;

            // Add event listeners for component cards
            document.querySelectorAll('.component-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    if (!card.classList.contains('disabled')) {
                        const componentType = card.dataset.componentType;
                        this.showComponentSelector(configUuid, componentType);
                    }
                });
            });

            // Add event listeners for validate and deploy buttons
            const validateBtn = document.getElementById('validateButton');
            if (validateBtn) {
                validateBtn.addEventListener('click', () => this.validateServerConfiguration());
            }

            const deployBtn = document.getElementById('deployButton');
            if (deployBtn) {
                deployBtn.addEventListener('click', () => this.deployServerConfiguration());
            }

        } catch (error) {
            console.error('Error loading server configuration:', error);
            utils.showAlert('Failed to load server configuration', 'error');
            builderContent.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 60px 24px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 64px; color: var(--danger-color); margin-bottom: 16px;"></i>
                    <h3>Failed to Load Configuration</h3>
                    <p>${error.message}</p>
                    <button class="btn btn-primary" onclick="dashboard.switchView('servers')">
                        <i class="fas fa-arrow-left"></i> Back to Server List
                    </button>
                </div>
            `;
        } finally {
            utils.showLoading(false);
        }
    }

    renderComponentCard(componentType) {
        const count = this.getComponentCount(componentType.type);
        const limit = this.componentLimits[componentType.type] || 1;
        const isAtLimit = count >= limit;
        const isSelected = count > 0;

        let statusClass = isSelected ? 'selected' : 'available';
        let statusIcon = isSelected ? 'fa-check-circle' : 'fa-plus-circle';
        let statusText = 'Select Component';

        if (isSelected) {
            statusText = `${count} of ${limit}`;
            if (isAtLimit) {
                statusClass = 'limit-reached';
                statusIcon = 'fa-ban';
            }
        }

        let detailsSection = '';
        if (isSelected) {
            const components = this.selectedComponents[componentType.type];
            if (Array.isArray(components) && components.length > 0) {
                const componentsList = components.map(comp => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: var(--bg-secondary); border-radius: 0.375rem; margin-bottom: 0.5rem;">
                        <div>
                            <div style="font-weight: 500; font-size: 0.875rem;">${comp.serial_number}</div>
                            ${comp.slot_position ? `<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">Slot: ${comp.slot_position}</div>` : ''}
                        </div>
                        <button class="btn-remove-component" onclick="event.stopPropagation(); dashboard.removeSpecificComponent('${componentType.type}', '${comp.uuid}')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `).join('');

                detailsSection = `
                    <div class="component-details-section" style="max-height: 200px; overflow-y: auto;">
                        ${componentsList}
                    </div>
                `;
            }
        }

        return `
            <div class="component-card ${statusClass} ${isAtLimit ? 'disabled' : ''}" data-component-type="${componentType.type}" ${isAtLimit ? 'style="cursor: not-allowed; opacity: 0.7;"' : ''}>
                <div class="component-icon-wrapper">
                    <i class="${componentType.icon}"></i>
                </div>
                <div class="component-info">
                    <div class="component-name">${componentType.name}</div>
                    <div class="component-description">${componentType.description}</div>
                    <div class="component-status ${statusClass}">
                        <i class="fas ${statusIcon}"></i>
                        ${statusText}
                    </div>
                </div>
                ${detailsSection}
            </div>
        `;
    }

    getSelectedCount() {
        let count = 0;
        this.componentTypes.forEach(type => {
            if (this.isComponentSelected(type.type)) {
                count++;
            }
        });
        return count;
    }

    getComponentCount(type) {
        const component = this.selectedComponents[type];
        if (Array.isArray(component)) {
            return component.length;
        }
        return component ? 1 : 0;
    }

    isComponentSelected(type) {
        const component = this.selectedComponents[type];
        if (Array.isArray(component)) {
            return component.length > 0;
        }
        return component !== null && component !== undefined;
    }

    loadExistingComponentsFromData(configData) {
        // Initialize selected components
        this.selectedComponents = {
            cpu: [],
            motherboard: [],
            ram: [],
            storage: [],
            chassis: [],
            caddy: [],
            pciecard: [],
            hbacard: [],
            nic: []
        };

        try {
            // Check if config data has components
            // The API returns data.configuration.components OR data.components
            let components = null;

            if (configData.configuration && configData.configuration.components) {
                components = configData.configuration.components;
            } else if (configData.components) {
                components = configData.components;
            }


            // Components are structured as { cpu: [...], motherboard: [...], etc. }
            if (components && typeof components === 'object') {
                Object.keys(components).forEach(type => {
                    if (this.selectedComponents.hasOwnProperty(type) && Array.isArray(components[type])) {
                        this.selectedComponents[type] = components[type].map(comp => ({
                            uuid: comp.uuid || comp.component_uuid,
                            serial_number: comp.serial_number || comp.uuid || comp.component_uuid,
                            slot_position: comp.slot_position || '',
                            quantity: comp.quantity || 1,
                            added_at: comp.added_at || ''
                        }));
                    }
                });
            } else {
                console.warn('No components found in config data or invalid structure');
            }

        } catch (error) {
            console.error('Error loading existing components:', error);
        }
    }

    async showComponentSelector(configUuid, componentType) {

        // Check if at limit
        const count = this.getComponentCount(componentType);
        const limit = this.componentLimits[componentType] || 1;

        if (count >= limit) {
            utils.showAlert(`Maximum ${limit} ${componentType} component(s) already added`, 'warning');
            return;
        }

        const typeInfo = this.componentTypes.find(t => t.type === componentType);
        await this.showComponentSelectionModal(componentType, typeInfo);
    }

    async showComponentSelectionModal(type, typeInfo) {
        const modalHtml = `
            <div class="modal-overlay" id="componentModal">
                <div class="component-modal">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            <i class="${typeInfo.icon}"></i>
                            Select ${typeInfo.name}
                        </h3>
                        <button class="modal-close" id="closeModal">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body" id="componentListContainer">
                        <div style="text-align: center; padding: 2rem;">
                            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary-color);"></i>
                            <p style="margin-top: 1rem; color: var(--text-secondary);">Loading compatible components...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer.firstElementChild);

        const modal = document.getElementById('componentModal');
        setTimeout(() => modal.classList.add('active'), 10);

        document.getElementById('closeModal').addEventListener('click', () => {
            this.closeComponentModal();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeComponentModal();
            }
        });

        await this.loadCompatibleComponents(type, typeInfo);
    }

    async loadCompatibleComponents(type, typeInfo) {
        try {
            const result = await serverAPI.getCompatibleComponents(
                this.currentServerConfig.uuid,
                type,
                true
            );

            const container = document.getElementById('componentListContainer');

            if (result.success && result.data && result.data.data && result.data.data.compatible_components) {
                const compatibleComponents = result.data.data.compatible_components;

                if (compatibleComponents.length > 0) {
                    container.innerHTML = `
                        <div class="component-list">
                            ${compatibleComponents.map(component => this.renderComponentOption(component, type, typeInfo)).join('')}
                        </div>
                    `;

                    document.querySelectorAll('.component-option').forEach(option => {
                        option.addEventListener('click', async () => {
                            const uuid = option.getAttribute('data-uuid');
                            const notes = option.getAttribute('data-notes');
                            const componentType = option.getAttribute('data-type');
                            await this.showComponentDetailsModal(uuid, componentType, type, notes, typeInfo);
                        });
                    });
                } else {
                    container.innerHTML = `
                        <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                            <i class="fas fa-inbox" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                            <p>No compatible ${typeInfo.name.toLowerCase()} found</p>
                        </div>
                    `;
                }
            } else {
                container.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                        <i class="fas fa-inbox" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                        <p>No compatible ${typeInfo.name.toLowerCase()} found</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading compatible components:', error);
            const container = document.getElementById('componentListContainer');
            container.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--danger-color);">
                    <i class="fas fa-exclamation-circle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                    <p>Failed to load components</p>
                </div>
            `;
        }
    }

    renderComponentOption(component, type, typeInfo) {
        const status = component.status === 1 ? 'available' : 'in-use';
        const statusText = component.status === 1 ? 'Available' : 'In Use';

        let specs = '';
        if (component.notes) {
            const modelMatch = component.notes.match(/([A-Za-z0-9\s\-+]+)/);
            if (modelMatch) {
                specs = `<span class="spec-badge">${modelMatch[1].trim()}</span>`;
            }
        }

        if (component.location) {
            specs += `<span class="spec-badge"><i class="fas fa-map-marker-alt"></i> ${component.location}</span>`;
        }

        if (component.compatibility_score) {
            specs += `<span class="spec-badge"><i class="fas fa-check"></i> ${Math.round(component.compatibility_score * 100)}% Compatible</span>`;
        }

        return `
            <div class="component-option" data-uuid="${component.uuid}" data-notes="${component.notes || ''}" data-type="${type}">
                <div class="component-option-icon">
                    <i class="${typeInfo.icon}"></i>
                </div>
                <div class="component-option-details">
                    <div class="component-option-name">${component.serial_number || component.uuid}</div>
                    <div class="component-option-specs">
                        ${specs}
                        ${component.compatibility_reason ? `<div style="margin-top: 0.5rem; font-size: 0.8125rem; color: var(--success-color);"><i class="fas fa-info-circle"></i> ${component.compatibility_reason}</div>` : ''}
                    </div>
                </div>
                <div class="component-option-status ${status}">
                    <i class="fas ${status === 'available' ? 'fa-check' : 'fa-lock'}"></i>
                    ${statusText}
                </div>
            </div>
        `;
    }

    async showComponentDetailsModal(uuid, componentType, type, notes, typeInfo) {
        this.closeComponentModal();

        const detailsModalHtml = `
            <div class="modal-overlay" id="detailsModal">
                <div class="component-details-modal">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            <i class="${typeInfo.icon}"></i>
                            Component Details
                        </h3>
                        <button class="modal-close" id="closeDetailsModal">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body" id="detailsContainer">
                        <div style="text-align: center; padding: 2rem;">
                            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary-color);"></i>
                            <p style="margin-top: 1rem; color: var(--text-secondary);">Loading component details...</p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="cancelDetailsBtn">
                            <i class="fas fa-times"></i>
                            Cancel
                        </button>
                        <button class="btn btn-primary" id="confirmAddBtn">
                            <i class="fas fa-plus"></i>
                            Add to Configuration
                        </button>
                    </div>
                </div>
            </div>
        `;

        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = detailsModalHtml;
        document.body.appendChild(modalContainer.firstElementChild);

        const modal = document.getElementById('detailsModal');
        setTimeout(() => modal.classList.add('active'), 10);

        document.getElementById('closeDetailsModal').addEventListener('click', () => {
            this.closeDetailsModal();
            this.showComponentSelector(this.currentServerConfig.uuid, type);
        });

        document.getElementById('cancelDetailsBtn').addEventListener('click', () => {
            this.closeDetailsModal();
            this.showComponentSelector(this.currentServerConfig.uuid, type);
        });

        const detailsContainer = document.getElementById('detailsContainer');
        detailsContainer.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                <i class="fas fa-info-circle" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                <p>Component details</p>
                <p style="margin-top: 0.5rem; font-size: 0.875rem;">UUID: ${uuid}</p>
                <p style="margin-top: 0.5rem; font-size: 0.875rem;">Notes: ${notes || 'None'}</p>
            </div>
        `;

        document.getElementById('confirmAddBtn').addEventListener('click', async () => {
            this.closeDetailsModal();
            await this.addComponentToConfig(type, uuid, notes, typeInfo);
        });
    }

    async addComponentToConfig(type, uuid, notes, typeInfo) {
        try {
            utils.showLoading(true, 'Adding component to configuration...');

            const result = await serverAPI.addComponentToServer(
                this.currentServerConfig.uuid,
                type,
                uuid,
                1,
                '',
                false
            );

            if (result.success) {
                utils.showAlert(`${typeInfo.name} added successfully`, 'success');
                await this.loadServerConfiguration(this.currentServerConfig.uuid);
                // Update server list in background to refresh component counts
                this.loadServerList().catch(err => console.error('Error refreshing server list:', err));
            } else {
                utils.showAlert(result.message || 'Failed to add component', 'error');
            }
        } catch (error) {
            console.error('Error adding component:', error);
            utils.showAlert('Failed to add component', 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    async removeSpecificComponent(componentType, componentUuid) {
        if (!confirm('Are you sure you want to remove this component?')) {
            return;
        }

        try {
            utils.showLoading(true, 'Removing component...');

            const result = await serverAPI.removeComponentFromServer(
                this.currentServerConfig.uuid,
                componentType,
                componentUuid
            );

            if (result.success) {
                utils.showAlert('Component removed successfully', 'success');
                await this.loadServerConfiguration(this.currentServerConfig.uuid);
                // Update server list in background to refresh component counts
                this.loadServerList().catch(err => console.error('Error refreshing server list:', err));
            } else {
                utils.showAlert(result.message || 'Failed to remove component', 'error');
            }
        } catch (error) {
            console.error('Error removing component:', error);
            utils.showAlert('Failed to remove component', 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    closeComponentModal() {
        const modal = document.getElementById('componentModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.remove();
            }, 300);
        }
    }

    closeDetailsModal() {
        const modal = document.getElementById('detailsModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.remove();
            }, 300);
        }
    }

    async validateServerConfiguration() {
        try {
            utils.showLoading(true, 'Validating server configuration...');

            const result = await serverAPI.validateServerConfig(this.currentServerConfig.uuid);

            if (result.success) {
                const performanceWarnings = result.data?.performance_warnings || [];

                let warningsHtml = '';
                if (performanceWarnings.length > 0) {
                    warningsHtml = '<div class="performance-warnings"><h5><i class="fas fa-exclamation-triangle"></i> Performance Warnings</h5><ul>';
                    performanceWarnings.forEach(warning => {
                        warningsHtml += `<li>${warning}</li>`;
                    });
                    warningsHtml += '</ul></div>';
                }

                utils.showAlert(
                    'Server configuration validated successfully!' + (warningsHtml ? '\n\nWarnings:\n' + performanceWarnings.join('\n') : ''),
                    'success'
                );

                const deployBtn = document.getElementById('deployButton');
                if (deployBtn) deployBtn.disabled = false;
            } else {
                utils.showAlert('Validation failed: ' + (result.message || 'Unknown error'), 'error');
                const deployBtn = document.getElementById('deployButton');
                if (deployBtn) deployBtn.disabled = true;
            }
        } catch (error) {
            console.error('Error validating configuration:', error);
            utils.showAlert('Failed to validate configuration', 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    async deployServerConfiguration() {
        if (!confirm('Are you sure you want to deploy this server configuration? This action cannot be undone.')) {
            return;
        }

        try {
            utils.showLoading(true, 'Deploying server configuration...');

            const result = await serverAPI.finalizeServerConfig(this.currentServerConfig.uuid, '');

            if (result.success) {
                utils.showAlert('Server configuration deployed successfully!', 'success');
                await this.switchView('servers');
            } else {
                utils.showAlert('Deployment failed: ' + (result.message || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Error deploying configuration:', error);
            utils.showAlert('Failed to deploy configuration', 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    async showEditForm(componentType, componentId) {
        try {
            utils.showLoading(true, 'Loading form...');
            const response = await fetch('../../pages/forms/edit-component.html');
            if (!response.ok) throw new Error('Could not load form HTML.');
            const formHtml = await response.text();
            this.showModal(`Edit ${componentType.toUpperCase()}`, formHtml);
            const scriptSrc = '../../assets/js/forms/edit-form.js';
            if (!document.querySelector(`script[src="${scriptSrc}"]`)) {
                const script = document.createElement('script');
                script.src = scriptSrc;
                script.onload = () => { if (typeof initializeEditFormComponent === 'function') initializeEditFormComponent(componentType, componentId); };
                document.body.appendChild(script);
            } else {
                if (typeof initializeEditFormComponent === 'function') initializeEditFormComponent(componentType, componentId);
            }
        } catch (error) {
            console.error('Error loading edit form:', error);
            utils.showAlert('Failed to load the edit component form.', 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    async handleDeleteComponent(componentType, componentId) {
        const confirmed = await utils.confirm('Are you sure you want to delete this component? This action cannot be undone.', 'Delete Component');
        if (confirmed) {
            try {
                utils.showLoading(true, 'Deleting component...');
                const result = await api.components.delete(componentType, componentId);
                if (result.success) {
                    utils.showAlert('Component deleted successfully', 'success');
                    await this.loadComponentList(componentType);
                    await this.loadDashboard();
                }
            } catch (error) {
                console.error('Error deleting component:', error);
                utils.showAlert('Failed to delete component', 'error');
            } finally {
                utils.showLoading(false);
            }
        }
    }

    async showBulkUpdateModal() {
        if (this.selectedItems.size === 0) {
            utils.showAlert('Please select items to update', 'warning');
            return;
        }
        const modalContent = `
            <div style="max-width: 400px;">
                <div class="form-group"><label class="form-label">Update Status</label><select id="bulkStatus" class="form-select"><option value="">Keep Current</option><option value="1">Available</option><option value="2">In Use</option><option value="0">Failed</option></select></div>
                <div class="form-group"><label class="form-label">Update Location</label><input type="text" id="bulkLocation" class="form-input" placeholder="Leave empty to keep current"></div>
                <div class="form-group"><label class="form-label">Update Flag</label><select id="bulkFlag" class="form-select"><option value="">Keep Current</option><option value="Backup">Backup</option><option value="Critical">Critical</option><option value="Maintenance">Maintenance</option><option value="Testing">Testing</option><option value="Production">Production</option></select></div>
                <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;"><button class="btn btn-secondary" onclick="dashboard.closeModal()">Cancel</button><button class="btn btn-primary" onclick="dashboard.executeBulkUpdate()">Update ${this.selectedItems.size} Items</button></div>
            </div>
        `;
        this.showModal('Bulk Update Components', modalContent);
    }

    async executeBulkUpdate() {
        const status = document.getElementById('bulkStatus')?.value;
        const location = document.getElementById('bulkLocation')?.value;
        const flag = document.getElementById('bulkFlag')?.value;
        const updates = {};
        if (status) updates.Status = status;
        if (location) updates.Location = location;
        if (flag) updates.Flag = flag;
        if (Object.keys(updates).length === 0) {
            utils.showAlert('Please select at least one field to update', 'warning');
            return;
        }
        try {
            utils.showLoading(true, 'Updating components...');
            const result = await api.components.bulkUpdate(this.currentComponent, Array.from(this.selectedItems), updates);
            if (result.success) {
                utils.showAlert(`Successfully updated ${result.data.updated} components`, 'success');
                this.selectedItems.clear();
                this.closeModal();
                await this.loadComponentList(this.currentComponent);
                await this.loadDashboard();
            }
        } catch (error) {
            console.error('Error bulk updating components:', error);
            utils.showAlert('Failed to update components', 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    async handleBulkDelete() {
        if (this.selectedItems.size === 0) {
            utils.showAlert('Please select items to delete', 'warning');
            return;
        }
        const confirmed = await utils.confirm(`Are you sure you want to delete ${this.selectedItems.size} selected components? This cannot be undone.`, 'Delete Components');
        if (confirmed) {
            try {
                utils.showLoading(true, 'Deleting components...');
                let deleted = 0, failed = 0;
                for (const id of this.selectedItems) {
                    try {
                        await api.components.delete(this.currentComponent, id);
                        deleted++;
                    } catch (error) {
                        failed++;
                        console.error(`Failed to delete component ${id}:`, error);
                    }
                }
                if (deleted > 0) {
                    utils.showAlert(`Successfully deleted ${deleted} components${failed > 0 ? `, ${failed} failed` : ''}`, deleted === this.selectedItems.size ? 'success' : 'warning');
                } else {
                    utils.showAlert('Failed to delete any components', 'error');
                }
                this.selectedItems.clear();
                await this.loadComponentList(this.currentComponent);
                await this.loadDashboard();
            } catch (error) {
                console.error('Error bulk deleting components:', error);
                utils.showAlert('Failed to delete components', 'error');
            } finally {
                utils.showLoading(false);
            }
        }
    }

    showModal(title, content) {
        const modal = document.getElementById('modalContainer');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');

        if (modal && modalTitle && modalBody) {
            modalTitle.textContent = title;
            modalBody.innerHTML = content;

            // Show modal by setting display and adding active class
            modal.style.display = 'flex';
            modal.classList.add('active');
            modal.classList.remove('hidden');
            modal.removeAttribute('hidden');

            const firstInput = modalBody.querySelector('input, select, textarea, button');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        } else {
            console.error('Modal elements not found!');
        }

        window.closeModal = () => this.closeModal();
        window.loadComponentList = (type) => this.loadComponentList(type);
        window.loadDashboard = () => this.loadDashboard();
    }

    closeModal() {
        const modal = document.getElementById('modalContainer');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('active');  // Remove active class to hide modal
        }
        delete window.closeModal;
        delete window.loadComponentList;
        delete window.loadDashboard;
    }

    async showChangePasswordModal() {
        const modalContent = `
            <form id="changePasswordForm" style="max-width: 400px;">
                <div class="form-group"><label class="form-label required">Current Password</label><input type="password" id="currentPassword" class="form-input" required></div>
                <div class="form-group"><label class="form-label required">New Password</label><input type="password" id="newPassword" class="form-input" required minlength="8"></div>
                <div class="form-group"><label class="form-label required">Confirm New Password</label><input type="password" id="confirmPassword" class="form-input" required></div>
                <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;"><button type="button" class="btn btn-secondary" onclick="dashboard.closeModal()">Cancel</button><button type="submit" class="btn btn-primary">Change Password</button></div>
            </form>
        `;
        this.showModal('Change Password', modalContent);
        document.getElementById('changePasswordForm').addEventListener('submit', async (e) => { e.preventDefault(); await this.handleChangePassword(); });
    }

    async handleChangePassword() {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        if (newPassword !== confirmPassword) {
            utils.showAlert('New passwords do not match', 'error');
            return;
        }
        if (newPassword.length < 8) {
            utils.showAlert('New password must be at least 8 characters long', 'error');
            return;
        }
        try {
            utils.showLoading(true, 'Changing password...');
            const result = await api.auth.changePassword(currentPassword, newPassword, confirmPassword);
            if (result.success) {
                utils.showAlert('Password changed successfully', 'success');
                this.closeModal();
            }
        } catch (error) {
            console.error('Error changing password:', error);
            utils.showAlert('Failed to change password', 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    async handleDeleteServer(configUuid) {
        const confirmed = await utils.confirm('Are you sure you want to delete this server configuration? This action cannot be undone.', 'Delete Server');
        if (confirmed) {
            try {
                utils.showLoading(true, 'Deleting server...');
                const result = await api.servers.deleteConfig(configUuid);
                if (result.success) {
                    utils.showAlert('Server deleted successfully', 'success');
                    await this.loadServerList();
                    await this.loadDashboard();
                }
            } catch (error) {
                console.error('Error deleting server:', error);
                utils.showAlert('Failed to delete server', 'error');
            } finally {
                utils.showLoading(false);
            }
        }
    }

    async handleLogout() {
        const confirmed = await utils.confirm('Are you sure you want to logout?', 'Logout');
        if (confirmed) {
            try {
                utils.showLoading(true, 'Logging out...');
                await api.auth.logout();
                window.location.href = '/bdc_ims/ims_frontend/';
            } catch (error) {
                console.error('Logout error:', error);
                api.clearAuth();
                window.location.href = '/bdc_ims/ims_frontend/';
            }
        }
    }

    async refresh() {
        if (this.currentComponent === 'dashboard') await this.loadDashboard();
        else if (this.currentComponent === 'servers') await this.loadServerList();
        else await this.loadComponentList(this.currentComponent);
    }

    /**
     * Load server builder with PC part picker interface
     */
    async loadServerBuilder() {
        try {
            const urlParams = utils.getURLParams();
            const configUuid = urlParams.config || (this.currentServerConfig && this.currentServerConfig.uuid);

            if (!configUuid) {
                console.error('No server configuration UUID provided');
                this.showServerBuilderError('No server configuration selected');
                return;
            }

            // Update header
            document.getElementById('serverBuilderTitle').innerHTML = '<i class="fas fa-wrench"></i> Server Builder';
            // document.getElementById('serverBuilderSubtitle').textContent = 'PC Part Picker Style Interface';

            // Use PC part picker builder if available
            if (window.pcppBuilder) {
                window.pcppBuilder.currentConfig = null;
                await window.pcppBuilder.loadExistingConfig(configUuid);
                // The PC part picker builder will now render directly to serverBuilderContent
            } else {
                this.showServerBuilderError('PC Part Picker Builder not available');
            }
        } catch (error) {
            console.error('Error loading server builder:', error);
            this.showServerBuilderError('Failed to load server builder: ' + error.message);
        }
    }

    /**
     * Load component configuration interface
     */
    async loadComponentConfig() {
        try {
            const urlParams = utils.getURLParams();
            const configUuid = urlParams.config;
            const componentType = urlParams.type;

            if (!configUuid || !componentType) {
                console.error('Missing configuration UUID or component type');
                this.showComponentConfigError('Missing configuration parameters');
                return;
            }

            // Update header
            document.getElementById('componentConfigTitle').innerHTML = `<i class="fas fa-cogs"></i> Configure ${componentType.toUpperCase()}`;
            document.getElementById('componentConfigSubtitle').textContent = `Select ${componentType} components for your server configuration`;

            // Load compatible components
            await this.loadCompatibleComponents(configUuid, componentType);
        } catch (error) {
            console.error('Error loading component configuration:', error);
            this.showComponentConfigError('Failed to load component configuration: ' + error.message);
        }
    }

    /**
     * Load compatible components for selection
     */
    async loadCompatibleComponents(configUuid, componentType) {
        try {
            utils.showLoading(true, `Loading compatible ${componentType} components...`);

            const result = await serverAPI.getCompatibleComponents(configUuid, componentType, true);

            if (result.success && result.data && result.data.data && result.data.data.compatible_components) {
                const components = result.data.data.compatible_components;
                this.renderComponentSelection(components, componentType, configUuid);
            } else {
                this.showComponentConfigError('No compatible components found');
            }
        } catch (error) {
            console.error('Error loading compatible components:', error);
            this.showComponentConfigError('Failed to load compatible components');
        } finally {
            utils.showLoading(false);
        }
    }

    /**
     * Render component selection interface
     */
    renderComponentSelection(components, componentType, configUuid) {
        const container = document.getElementById('componentConfigContent');

        if (components.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 60px 24px;">
                    <i class="fas fa-inbox" style="font-size: 64px; color: var(--text-muted); margin-bottom: 16px;"></i>
                    <h3>No Compatible Components</h3>
                    <p>No compatible ${componentType} components found for this configuration.</p>
                    <button class="btn btn-secondary" onclick="dashboard.switchView('serverBuilder')">
                        <i class="fas fa-arrow-left"></i> Back to Server Builder
                    </button>
                </div>
            `;
            return;
        }

        const componentCards = components.map(component => `
            <div class="component-selection-card" data-uuid="${component.uuid}">
                <div class="component-card-header">
                    <div class="component-icon">
                        <i class="fas fa-${this.getComponentIcon(componentType)}"></i>
                    </div>
                    <div class="component-info">
                        <h4>${component.serial_number || component.uuid}</h4>
                        <p>${component.notes || 'No description available'}</p>
                    </div>
                    <div class="component-status">
                        <span class="status-badge ${component.status === 1 ? 'available' : 'in-use'}">
                            ${component.status === 1 ? 'Available' : 'In Use'}
                        </span>
                    </div>
                </div>
                <div class="component-card-details">
                    ${component.location ? `<div class="detail-item"><i class="fas fa-map-marker-alt"></i> ${component.location}</div>` : ''}
                    ${component.compatibility_score ? `<div class="detail-item"><i class="fas fa-check-circle"></i> ${Math.round(component.compatibility_score * 100)}% Compatible</div>` : ''}
                    ${component.compatibility_reason ? `<div class="detail-item"><i class="fas fa-info-circle"></i> ${component.compatibility_reason}</div>` : ''}
                </div>
                <div class="component-card-actions">
                    <button class="btn btn-primary" onclick="dashboard.selectComponent('${component.uuid}', '${componentType}', '${configUuid}')">
                        <i class="fas fa-plus"></i> Add to Configuration
                    </button>
                    <button class="btn btn-secondary" onclick="dashboard.viewComponentDetails('${component.uuid}', '${componentType}')">
                        <i class="fas fa-info-circle"></i> View Details
                    </button>
                </div>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="component-selection-grid">
                ${componentCards}
            </div>
        `;
    }

    /**
     * Get component icon based on type
     */
    getComponentIcon(componentType) {
        const iconMap = {
            'cpu': 'microchip',
            'motherboard': 'th-large',
            'ram': 'memory',
            'storage': 'hdd',
            'chassis': 'server',
            'caddy': 'box',
            'pciecard': 'credit-card',
            'hbacard': 'plug',
            'nic': 'network-wired'
        };
        return iconMap[componentType] || 'cog';
    }

    /**
     * Select component and add to configuration
     */
    async selectComponent(componentUuid, componentType, configUuid) {
        try {
            utils.showLoading(true, 'Adding component to configuration...');

            const result = await serverAPI.addComponentToServer(configUuid, componentType, componentUuid, 1, '', false);

            if (result.success) {
                utils.showAlert('Component added successfully!', 'success');
                // Go back to server builder
                await this.switchView('serverBuilder');
            } else {
                utils.showAlert('Failed to add component: ' + (result.message || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Error adding component:', error);
            utils.showAlert('Failed to add component', 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    /**
     * View component details
     */
    async viewComponentDetails(componentUuid, componentType) {
        // This would open a modal with detailed component information
        utils.showAlert('Component details feature coming soon!', 'info');
    }

    /**
     * Show server builder error
     */
    showServerBuilderError(message) {
        document.getElementById('serverBuilderContent').innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 60px 24px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 64px; color: var(--danger-color); margin-bottom: 16px;"></i>
                <h3>Server Builder Error</h3>
                <p>${message}</p>
                <button class="btn btn-primary" onclick="dashboard.switchView('servers')">
                    <i class="fas fa-arrow-left"></i> Back to Server List
                </button>
            </div>
        `;
    }

    /**
     * Show component configuration error
     */
    showComponentConfigError(message) {
        document.getElementById('componentConfigContent').innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 60px 24px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 64px; color: var(--danger-color); margin-bottom: 16px;"></i>
                <h3>Component Configuration Error</h3>
                <p>${message}</p>
                <button class="btn btn-primary" onclick="dashboard.switchView('serverBuilder')">
                    <i class="fas fa-arrow-left"></i> Back to Server Builder
                </button>
            </div>
        `;
    }

    handleInitialView() {
        const urlParams = utils.getURLParams();
        const view = urlParams.view || 'dashboard';

        if (view !== 'dashboard') {
            // Handle special case for serverBuilder with config parameter
            if (view === 'serverBuilder' && urlParams.config) {
                // Store the config for the server builder
                this.currentServerConfig = {
                    uuid: urlParams.config,
                    name: 'Server Configuration'
                };
            }
            this.switchView(view);
        }
    }
}

let dashboard;
document.addEventListener('DOMContentLoaded', async () => {
    try {
        dashboard = new Dashboard();
        dashboard.handleInitialView();
        window.dashboard = dashboard;
    } catch (error) {
        console.error('Failed to initialize dashboard:', error);
        utils.showAlert('Failed to initialize dashboard. Please refresh the page.', 'error');
    }
});

window.addEventListener('popstate', () => { if (dashboard) dashboard.handleInitialView(); });
// document.addEventListener('visibilitychange', () => { if (!document.hidden && dashboard) setTimeout(() => dashboard.refresh(), 1000); });
setInterval(() => { if (dashboard && dashboard.currentComponent === 'dashboard' && !document.hidden) dashboard.loadDashboard(); }, 5 * 60 * 1000);

if (typeof module !== 'undefined' && module.exports) module.exports = Dashboard;
