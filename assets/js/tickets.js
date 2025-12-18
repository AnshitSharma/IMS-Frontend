/**
 * Tickets Manager for BDC Inventory Management System
 * Handles ticket listing, creation, and management
 */

class TicketsManager {
    constructor() {
        this.tickets = [];
        this.filteredTickets = [];
        this.currentPage = 1;
        this.itemsPerPage = 20;
        this.totalTickets = 0;
        this.searchTerm = '';
        this.statusFilter = '';
        this.priorityFilter = '';
        this.apiBaseUrl = window.BDC_CONFIG?.API_BASE_URL || 'https://shubham.staging.cloudmate.in/bdc_ims_dev/api/api.php';

        // Cache for users and roles to avoid duplicate API calls
        this.cachedUsers = null;
        this.cachedRoles = null;
    }

    /**
     * Initialize tickets manager
     */
    init() {
        console.log('TicketsManager.init() called');
        this.setupEventListeners();
        this.setupModalClickHandlers();
        this.loadTickets();
        console.log('TicketsManager initialized successfully');
    }

    /**
     * Setup event listeners for tickets page
     */
    setupEventListeners() {
        console.log('Setting up event listeners...');

        // Refresh button
        const refreshBtn = document.getElementById('refreshTicketsBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadTickets());
            console.log('Refresh button listener attached');
        }

        // Create ticket buttons
        const createBtn = document.getElementById('createTicketBtn');
        const createFirstBtn = document.getElementById('createFirstTicketBtn');

        if (createBtn) {
            createBtn.addEventListener('click', () => {
                console.log('Create button clicked');
                this.showCreateTicketForm();
            });
            console.log('Create ticket button listener attached');
        } else {
            console.warn('Create ticket button not found');
        }

        if (createFirstBtn) {
            createFirstBtn.addEventListener('click', () => {
                console.log('Create first button clicked');
                this.showCreateTicketForm();
            });
            console.log('Create first ticket button listener attached');
        }

        // Search input
        const searchInput = document.getElementById('ticketSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.toLowerCase();
                this.filterAndRenderTickets();
            });
        }

        // Status filter
        const statusFilter = document.getElementById('ticketStatusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.statusFilter = e.target.value;
                this.filterAndRenderTickets();
            });
        }

        // Priority filter
        const priorityFilter = document.getElementById('ticketPriorityFilter');
        if (priorityFilter) {
            priorityFilter.addEventListener('change', (e) => {
                this.priorityFilter = e.target.value;
                this.filterAndRenderTickets();
            });
        }
    }

    /**
     * Load tickets from API
     */
    async loadTickets() {
        try {
            this.showLoading(true);
            this.hideStates();

            // Get JWT token
            const token = this.getAuthToken();
            if (!token) {
                throw new Error('Authentication token not found. Please login again.');
            }

            // Build FormData with parameters (API expects POST with body, not GET with params)
            const formData = new FormData();
            formData.append('action', 'ticket-list');
            formData.append('page', this.currentPage);
            formData.append('limit', this.itemsPerPage);
            formData.append('order_by', 'created_at');
            formData.append('order_dir', 'DESC');

            // Add filters if set
            if (this.statusFilter) {
                formData.append('status', this.statusFilter);
            }
            if (this.priorityFilter) {
                formData.append('priority', this.priorityFilter);
            }
            if (this.searchTerm) {
                formData.append('search', this.searchTerm);
            }

            // Make API call (POST with FormData, not GET with query params)
            const response = await fetch(this.apiBaseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const result = await response.json();

            if (result.success && result.data && result.data.tickets) {
                this.tickets = result.data.tickets;
                this.totalTickets = result.data.total || 0;
                this.filteredTickets = [...this.tickets];
                this.renderTickets();

                if (this.tickets.length === 0) {
                    this.showEmptyState();
                }
            } else {
                throw new Error(result.message || 'Failed to load tickets');
            }

        } catch (error) {
            console.error('Error loading tickets:', error);
            this.showError(error.message);
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * Filter tickets based on search and filters
     */
    filterAndRenderTickets() {
        let filtered = [...this.tickets];

        // Apply search filter
        if (this.searchTerm) {
            filtered = filtered.filter(ticket => {
                const title = (ticket.title || '').toLowerCase();
                const ticketNumber = (ticket.ticket_number || '').toLowerCase();
                const description = (ticket.description || '').toLowerCase();

                return title.includes(this.searchTerm) ||
                    ticketNumber.includes(this.searchTerm) ||
                    description.includes(this.searchTerm);
            });
        }

        // Apply status filter
        if (this.statusFilter) {
            filtered = filtered.filter(ticket => ticket.status === this.statusFilter);
        }

        // Apply priority filter
        if (this.priorityFilter) {
            filtered = filtered.filter(ticket => ticket.priority === this.priorityFilter);
        }

        this.filteredTickets = filtered;
        this.renderTickets();

        if (filtered.length === 0) {
            this.showEmptyState();
        }
    }

    /**
     * Render tickets table
     */
    renderTickets() {
        const tbody = document.getElementById('ticketsTableBody');
        const tableContainer = document.querySelector('.table-container');

        if (!tbody) return;

        if (this.filteredTickets.length === 0) {
            tableContainer.style.display = 'none';
            return;
        }

        tableContainer.style.display = 'block';
        this.hideStates();

        tbody.innerHTML = this.filteredTickets.map(ticket => {
            const hasDescription = ticket.description && ticket.description.trim().length > 0;
            return `
                <tr class="group hover:bg-surface-hover transition-all duration-200 border-b border-border/50 last:border-0">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="font-mono text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-md border border-primary/20">
                            #${this.escapeHtml(ticket.ticket_number || 'N/A')}
                        </span>
                    </td>
                    <td class="px-6 py-4">
                        <div class="flex flex-col max-w-[300px]">
                            <span class="text-sm font-semibold text-text-primary truncate" title="${this.escapeHtml(ticket.title)}">
                                ${this.escapeHtml(ticket.title)}
                            </span>
                            ${hasDescription ?
                    `<span class="text-xs text-text-muted truncate mt-1 group-hover:text-text-secondary transition-colors">
                                    ${this.escapeHtml(ticket.description)}
                                </span>` : ''
                }
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        ${this.getStatusBadge(ticket.status)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        ${this.getPriorityBadge(ticket.priority)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        ${this.getAssignedToDisplay(ticket)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex flex-col">
                            <span class="text-xs font-medium text-text-secondary">${this.formatDate(ticket.created_at)}</span>
                            <span class="text-[10px] text-text-muted uppercase tracking-wider mt-0.5">Created</span>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right">
                        <div class="flex items-center justify-end gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button class="p-2 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-all duration-200 ring-1 ring-transparent hover:ring-primary/20" onclick="ticketsManager.viewTicket(${ticket.id})" title="View Details">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="p-2 text-text-muted hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200 ring-1 ring-transparent hover:ring-blue-200" onclick="ticketsManager.editTicket(${ticket.id})" title="Edit">
                                <i class="fas fa-pen"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        this.updatePagination();
    }

    /**
     * Get status badge HTML
     */
    getStatusBadge(status) {
        const statusMap = {
            'draft': { classes: 'bg-gray-100 text-gray-600 border-gray-200', icon: 'fa-file' },
            'pending': { classes: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: 'fa-clock' },
            'approved': { classes: 'bg-green-50 text-green-700 border-green-200', icon: 'fa-check' },
            'in_progress': { classes: 'bg-blue-50 text-blue-700 border-blue-200', icon: 'fa-spinner fa-spin' },
            'deployed': { classes: 'bg-teal-50 text-teal-700 border-teal-200', icon: 'fa-server' },
            'completed': { classes: 'bg-green-100 text-green-800 border-green-300', icon: 'fa-check-circle' },
            'rejected': { classes: 'bg-red-50 text-red-700 border-red-200', icon: 'fa-times' },
            'cancelled': { classes: 'bg-slate-100 text-slate-500 border-slate-200', icon: 'fa-ban' }
        };

        const key = (status || '').toLowerCase();
        const config = statusMap[key] || { classes: 'bg-gray-50 text-gray-500 border-gray-200', icon: 'fa-circle' };
        const label = status ? status.replace(/_/g, ' ') : 'Unknown';

        return `
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${config.classes} capitalize shadow-sm">
                <i class="fas ${config.icon} text-[10px] opacity-70"></i>
                ${this.escapeHtml(label)}
            </span>
        `;
    }

    /**
     * Get priority badge HTML
     */
    getPriorityBadge(priority) {
        const priorityMap = {
            'low': { classes: 'bg-slate-50 text-slate-600 border-slate-200', icon: 'fa-arrow-down' },
            'medium': { classes: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: 'fa-minus' },
            'high': { classes: 'bg-orange-50 text-orange-700 border-orange-200', icon: 'fa-arrow-up' },
            'urgent': { classes: 'bg-red-50 text-red-700 border-red-200', icon: 'fa-exclamation' }
        };

        const key = (priority || '').toLowerCase();
        const config = priorityMap[key] || { classes: 'bg-gray-50 text-gray-500 border-gray-200', icon: 'fa-circle' };
        const label = priority ? priority.charAt(0).toUpperCase() + priority.slice(1) : 'Normal';

        return `
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${config.classes} shadow-sm">
                <i class="fas ${config.icon} text-[10px] opacity-70"></i>
                ${this.escapeHtml(label)}
            </span>
        `;
    }

    /**
     * Get assigned to display HTML
     * Priority: assigned_user > assigned_role > Unassigned
     */
    getAssignedToDisplay(ticket) {
        let displayName = 'Unassigned';
        let icon = 'fa-user';
        let isRole = false;

        // Check for assigned_user first (takes priority)
        if (ticket.assigned_user && ticket.assigned_user.username) {
            displayName = ticket.assigned_user.username;
            icon = 'fa-user';
        }
        // Fall back to assigned_role if no assigned_user
        else if (ticket.assigned_role && ticket.assigned_role.name) {
            displayName = ticket.assigned_role.name;
            icon = 'fa-users';
            isRole = true;
        }

        return `
            <div class="flex items-center gap-2">
                <div class="w-7 h-7 rounded-full ${isRole ? 'bg-primary/10' : 'bg-surface-secondary'} flex items-center justify-center text-xs ${isRole ? 'text-primary' : 'text-text-muted'} ring-2 ring-surface-card">
                    <i class="fas ${icon}"></i>
                </div>
                <span class="text-sm font-medium text-text-secondary">${this.escapeHtml(displayName)}</span>
            </div>
        `;
    }

    /**
     * Update pagination
     */
    updatePagination() {
        const paginationContainer = document.getElementById('ticketsPaginationContainer');
        const paginationInfo = document.getElementById('ticketsPaginationInfo');

        if (!paginationContainer || !paginationInfo) return;

        const totalPages = Math.ceil(this.totalTickets / this.itemsPerPage);
        const start = (this.currentPage - 1) * this.itemsPerPage + 1;
        const end = Math.min(this.currentPage * this.itemsPerPage, this.totalTickets);

        paginationInfo.textContent = `Showing ${start}-${end} of ${this.totalTickets} tickets`;

        if (totalPages > 1) {
            paginationContainer.style.display = 'flex';
        } else {
            paginationContainer.style.display = 'none';
        }
    }

    /**
     * View ticket details
     */
    async viewTicket(ticketId) {
        try {
            const token = this.getAuthToken();
            if (!token) {
                throw new Error('Authentication token not found');
            }

            // Build FormData with parameters (API expects POST with body, not GET with params)
            const formData = new FormData();
            formData.append('action', 'ticket-get');
            formData.append('ticket_id', ticketId);
            formData.append('include_history', 'true');

            const response = await fetch(this.apiBaseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const result = await response.json();

            if (result.success && result.data && result.data.ticket) {
                this.showTicketDetails(result.data.ticket);
            } else {
                throw new Error(result.message || 'Failed to load ticket details');
            }

        } catch (error) {
            console.error('Error loading ticket details:', error);
            if (window.toastNotification) {
                toastNotification.show('Failed to load ticket details: ' + error.message, 'error');
            } else {
                alert('Failed to load ticket details: ' + error.message);
            }
        }
    }

    /**
     * Show ticket details in modal
     */
    showTicketDetails(ticket) {
        const modal = document.getElementById('ticketDetailsModal');
        const modalBody = document.getElementById('ticketDetailsBody');

        if (!modal || !modalBody) return;

        // Build items table
        let itemsHtml = '';
        if (ticket.items && ticket.items.length > 0) {
            itemsHtml = `
                <h4 style="margin-top: 24px; margin-bottom: 12px;">Components</h4>
                <table class="components-table" style="margin-bottom: 24px;">
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Component</th>
                            <th>Quantity</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${ticket.items.map(item => `
                            <tr>
                                <td>${this.escapeHtml(item.component_type)}</td>
                                <td>${this.escapeHtml(item.component_name || 'N/A')}</td>
                                <td>${item.quantity}</td>
                                <td><span style="text-transform: capitalize;">${this.escapeHtml(item.action)}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }

        modalBody.innerHTML = `
            <div class="ticket-details">
                <div class="form-grid two-column" style="margin-bottom: 24px;">
                    <div class="form-group">
                        <label class="form-label">Ticket Number</label>
                        <div style="font-weight: 600;">${this.escapeHtml(ticket.ticket_number)}</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Status</label>
                        <div>${this.getStatusBadge(ticket.status)}</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Priority</label>
                        <div>${this.getPriorityBadge(ticket.priority)}</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Created By</label>
                        <div>${this.escapeHtml(ticket.created_by_username || 'N/A')}</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Assigned To</label>
                        <div>${this.escapeHtml(ticket.assigned_to_username || 'Unassigned')}</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Created At</label>
                        <div>${this.formatDate(ticket.created_at)}</div>
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 24px;">
                    <label class="form-label">Title</label>
                    <div style="font-weight: 600;">${this.escapeHtml(ticket.title)}</div>
                </div>

                <div class="form-group" style="margin-bottom: 24px;">
                    <label class="form-label">Description</label>
                    <div style="white-space: pre-wrap;">${this.escapeHtml(ticket.description)}</div>
                </div>

                ${itemsHtml}
            </div>
        `;

        modal.classList.remove('hidden');
    }

    /**
     * Close ticket details modal
     */
    closeDetailsModal() {
        const modal = document.getElementById('ticketDetailsModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    /**
     * Setup modal overlay click handlers
     */
    setupModalClickHandlers() {
        // Close modals when clicking on overlay
        const modalContainer = document.getElementById('modalContainer');
        const ticketDetailsModal = document.getElementById('ticketDetailsModal');

        if (modalContainer) {
            modalContainer.addEventListener('click', (e) => {
                if (e.target === modalContainer) {
                    this.closeTicketModal();
                }
            });
        }

        if (ticketDetailsModal) {
            ticketDetailsModal.addEventListener('click', (e) => {
                if (e.target === ticketDetailsModal) {
                    this.closeDetailsModal();
                }
            });
        }
    }

    /**
     * Edit ticket
     */
    async editTicket(ticketId) {
        try {
            console.log('editTicket called with ID:', ticketId);

            // Check permission - skip if api not loaded yet
            if (window.api && window.api.utils) {
                const hasPermission = window.api.utils.hasPermission('ticket.edit_own');
                console.log('Has edit permission:', hasPermission);
                if (!hasPermission) {
                    if (window.toastNotification) {
                        toastNotification.show('You do not have permission to edit tickets', 'error');
                    } else {
                        alert('You do not have permission to edit tickets');
                    }
                    return;
                }
            } else {
                console.warn('API utils not loaded, skipping permission check');
            }

            // Fetch ticket details
            const token = this.getAuthToken();
            if (!token) {
                throw new Error('Authentication token not found');
            }

            const formData = new FormData();
            formData.append('action', 'ticket-get');
            formData.append('ticket_id', ticketId);

            const response = await fetch(this.apiBaseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const result = await response.json();

            if (result.success && result.data && result.data.ticket) {
                const ticket = result.data.ticket;

                // Check if ticket is in draft status
                if (ticket.status !== 'draft') {
                    if (window.toastNotification) {
                        toastNotification.show('Only draft tickets can be edited', 'error');
                    }
                    return;
                }

                // Show edit form with ticket data
                this.showEditTicketForm(ticket);
            } else {
                throw new Error(result.message || 'Failed to load ticket');
            }
        } catch (error) {
            console.error('Error loading ticket for edit:', error);
            if (window.toastNotification) {
                toastNotification.show('Failed to load ticket: ' + error.message, 'error');
            }
        }
    }

    /**
     * Show create ticket form
     */
    async showCreateTicketForm() {
        try {
            console.log('showCreateTicketForm called');

            // Check permission - skip if api not loaded yet
            if (window.api && window.api.utils) {
                const hasPermission = window.api.utils.hasPermission('ticket.create');
                console.log('Has create permission:', hasPermission);
                if (!hasPermission) {
                    if (window.toastNotification) {
                        toastNotification.show('You do not have permission to create tickets', 'error');
                    } else {
                        alert('You do not have permission to create tickets');
                    }
                    return;
                }
            } else {
                console.warn('API utils not loaded, skipping permission check');
            }

            // Load component data
            console.log('Loading component data...');
            await this.loadComponentData();

            // Show modal
            const modal = document.getElementById('modalContainer');
            const modalTitle = document.getElementById('modalTitle');
            const modalBody = document.getElementById('modalBody');

            console.log('Modal elements:', { modal, modalTitle, modalBody });

            if (!modal || !modalTitle || !modalBody) {
                console.error('Modal elements not found');
                return;
            }

            modalTitle.textContent = 'Create New Ticket';
            modalBody.innerHTML = this.getTicketFormHTML();

            // Setup event listeners
            this.setupTicketFormListeners(false);

            console.log('Removing hidden class from modal');
            modal.classList.remove('hidden');
        } catch (error) {
            console.error('Error showing create form:', error);
            if (window.toastNotification) {
                toastNotification.show('Failed to load form: ' + error.message, 'error');
            } else {
                alert('Failed to load form: ' + error.message);
            }
        }
    }

    /**
     * Show edit ticket form
     */
    async showEditTicketForm(ticket) {
        try {
            // Load component data
            await this.loadComponentData();

            // Show modal
            const modal = document.getElementById('modalContainer');
            const modalTitle = document.getElementById('modalTitle');
            const modalBody = document.getElementById('modalBody');

            if (!modal || !modalTitle || !modalBody) return;

            modalTitle.textContent = `Edit Ticket #${ticket.ticket_number}`;
            modalBody.innerHTML = this.getTicketFormHTML(ticket);

            // Setup event listeners
            this.setupTicketFormListeners(true, ticket);

            modal.classList.remove('hidden');
        } catch (error) {
            console.error('Error showing edit form:', error);
            if (window.toastNotification) {
                toastNotification.show('Failed to load form: ' + error.message, 'error');
            }
        }
    }

    /**
     * Load component data from JSON files
     */
    async loadComponentData() {
        if (this.componentData) return; // Already loaded

        this.componentData = {
            cpu: [],
            ram: [],
            storage: [],
            motherboard: [],
            nic: [],
            caddy: [],
            chassis: [],
            pciecard: [],
            hbacard: []
        };

        try {
            // Load all component JSON files
            const componentTypes = {
                cpu: '../../data/cpu-jsons/Cpu-details-level-3.json',
                ram: '../../data/Ram-jsons/ram_detail.json',
                storage: '../../data/storage-jsons/storage-level-3.json',
                motherboard: '../../data/motherboad-jsons/motherboard-level-3.json',
                nic: '../../data/nic-jsons/nic-level-3.json',
                caddy: '../../data/caddy-jsons/caddy_details.json',
                chassis: '../../data/chasis-jsons/chasis-level-3.json',
                pciecard: '../../data/pci-jsons/pci-level-3.json',
                hbacard: '../../data/hbacard-jsons/hbacard-level-3.json'
            };

            for (const [type, path] of Object.entries(componentTypes)) {
                try {
                    const response = await fetch(path);
                    if (response.ok) {
                        const data = await response.json();
                        this.componentData[type] = this.flattenComponentData(data);
                    }
                } catch (error) {
                    console.warn(`Failed to load ${type} data:`, error);
                }
            }
        } catch (error) {
            console.error('Error loading component data:', error);
        }
    }

    /**
     * Flatten component data to extract UUIDs and names
     */
    flattenComponentData(data) {
        const components = [];

        if (Array.isArray(data)) {
            data.forEach(brand => {
                if (brand.models && Array.isArray(brand.models)) {
                    brand.models.forEach(model => {
                        if (model.uuid) {
                            components.push({
                                uuid: model.uuid,
                                name: this.getComponentName(model, brand),
                                brand: brand.brand || 'Unknown'
                            });
                        }
                    });
                }
            });
        }

        return components;
    }

    /**
     * Get component display name
     */
    getComponentName(model, brand) {
        return model.model ||
               model.memory_type ||
               model.storage_type ||
               model.name ||
               `${brand.brand || ''} ${brand.series || 'Component'}`.trim();
    }

    /**
     * Get ticket form HTML
     */
    getTicketFormHTML(ticket = null) {
        const isEdit = !!ticket;

        return `
            <form id="ticketForm" class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="form-group">
                        <label for="ticketTitle" class="block text-sm font-semibold text-text-primary mb-2">
                            Title <span class="text-red-500">*</span>
                        </label>
                        <input type="text" id="ticketTitle" required
                            class="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-surface-card text-text-primary"
                            placeholder="Enter ticket title"
                            value="${isEdit ? this.escapeHtml(ticket.title) : ''}">
                    </div>

                    <div class="form-group">
                        <label for="ticketPriority" class="block text-sm font-semibold text-text-primary mb-2">
                            Priority <span class="text-red-500">*</span>
                        </label>
                        <select id="ticketPriority" required
                            class="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-surface-card text-text-primary">
                            <option value="low" ${isEdit && ticket.priority === 'low' ? 'selected' : ''}>Low</option>
                            <option value="medium" ${isEdit && ticket.priority === 'medium' ? 'selected' : ''}>Medium</option>
                            <option value="high" ${isEdit && ticket.priority === 'high' ? 'selected' : ''}>High</option>
                            <option value="urgent" ${isEdit && ticket.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <label for="ticketDescription" class="block text-sm font-semibold text-text-primary mb-2">
                        Description <span class="text-red-500">*</span>
                    </label>
                    <textarea id="ticketDescription" required rows="4"
                        class="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-surface-card text-text-primary"
                        placeholder="Enter detailed description">${isEdit ? this.escapeHtml(ticket.description) : ''}</textarea>
                </div>

                <!-- Assignment Section -->
                <div class="form-group">
                    <label class="block text-sm font-semibold text-text-primary mb-2">
                        Assign To <span class="text-red-500">*</span>
                    </label>
                    <div class="flex gap-4 mb-3">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="assignmentType" value="user"
                                class="w-4 h-4 text-primary focus:ring-primary"
                                ${isEdit && ticket.assigned_to ? 'checked' : (!isEdit ? 'checked' : '')}>
                            <span class="text-sm text-text-primary">Assign to User</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="assignmentType" value="role"
                                class="w-4 h-4 text-primary focus:ring-primary"
                                ${isEdit && ticket.assigned_to_role && !ticket.assigned_to ? 'checked' : ''}>
                            <span class="text-sm text-text-primary">Assign to Role</span>
                        </label>
                    </div>

                    <!-- User Dropdown -->
                    <div id="userAssignmentContainer" class="${isEdit && ticket.assigned_to_role && !ticket.assigned_to ? 'hidden' : ''}">
                        <select id="ticketAssignedUser"
                            class="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-surface-card text-text-primary">
                            <option value="">Loading users...</option>
                        </select>
                    </div>

                    <!-- Role Dropdown -->
                    <div id="roleAssignmentContainer" class="${isEdit && ticket.assigned_to_role && !ticket.assigned_to ? '' : 'hidden'}">
                        <select id="ticketAssignedRole"
                            class="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-surface-card text-text-primary">
                            <option value="">Loading roles...</option>
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <label for="ticketTargetServer" class="block text-sm font-semibold text-text-primary mb-2">
                        Target Server UUID <span class="text-text-muted text-xs">(Optional)</span>
                    </label>
                    <input type="text" id="ticketTargetServer"
                        class="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-surface-card text-text-primary"
                        placeholder="Enter target server UUID"
                        value="${isEdit && ticket.target_server_uuid ? this.escapeHtml(ticket.target_server_uuid) : ''}">
                </div>

                <div class="border-t border-border pt-4">
                    <div class="flex items-center justify-between mb-4">
                        <h4 class="text-lg font-semibold text-text-primary">Component Items <span class="text-text-muted text-sm">(Optional)</span></h4>
                        <button type="button" id="addComponentBtn"
                            class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-600 transition-colors flex items-center gap-2">
                            <i class="fas fa-plus"></i> Add Component
                        </button>
                    </div>
                    <div id="componentItemsContainer" class="space-y-3">
                        <!-- Component items will be added here -->
                    </div>
                </div>

                <div class="flex justify-end gap-3 pt-4 border-t border-border">
                    <button type="button" id="cancelTicketBtn"
                        class="px-6 py-2 border border-border rounded-lg hover:bg-surface-hover transition-colors text-text-primary">
                        Cancel
                    </button>
                    <button type="submit" id="saveTicketBtn"
                        class="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-600 transition-colors flex items-center gap-2">
                        <i class="fas fa-save"></i>
                        ${isEdit ? 'Update Ticket' : 'Create Ticket'}
                    </button>
                </div>
            </form>
        `;
    }

    /**
     * Get component item HTML
     */
    getComponentItemHTML(index, item = null) {
        const componentTypes = ['cpu', 'ram', 'storage', 'motherboard', 'nic', 'caddy', 'chassis', 'pciecard', 'hbacard'];

        return `
            <div class="component-item bg-surface-secondary/30 p-4 rounded-lg border border-border" data-index="${index}">
                <div class="flex items-start gap-3">
                    <div class="flex-1 grid grid-cols-1 md:grid-cols-5 gap-3">
                        <div class="form-group">
                            <label class="block text-xs font-medium text-text-muted mb-1">Component Type</label>
                            <select class="component-type-select w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-surface-card text-text-primary">
                                <option value="">Select Type</option>
                                ${componentTypes.map(type => `
                                    <option value="${type}" ${item && item.component_type === type ? 'selected' : ''}>
                                        ${type.charAt(0).toUpperCase() + type.slice(1)}
                                    </option>
                                `).join('')}
                            </select>
                        </div>

                        <div class="form-group md:col-span-2">
                            <label class="block text-xs font-medium text-text-muted mb-1">Component</label>
                            <select class="component-uuid-select w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-surface-card text-text-primary">
                                <option value="">Select Component</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="block text-xs font-medium text-text-muted mb-1">Quantity</label>
                            <input type="number" min="1" max="99" value="${item ? item.quantity : '1'}"
                                class="component-quantity w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-surface-card text-text-primary">
                        </div>

                        <div class="form-group">
                            <label class="block text-xs font-medium text-text-muted mb-1">Action</label>
                            <select class="component-action w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-surface-card text-text-primary">
                                <option value="add" ${item && item.action === 'add' ? 'selected' : ''}>Add</option>
                                <option value="remove" ${item && item.action === 'remove' ? 'selected' : ''}>Remove</option>
                                <option value="replace" ${item && item.action === 'replace' ? 'selected' : ''}>Replace</option>
                            </select>
                        </div>
                    </div>
                    <button type="button" class="remove-component-btn mt-6 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Remove">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Setup ticket form event listeners
     */
    setupTicketFormListeners(isEdit, ticket = null) {
        // Close modal button
        const modalClose = document.getElementById('modalClose');
        const cancelBtn = document.getElementById('cancelTicketBtn');

        if (modalClose) {
            modalClose.onclick = () => this.closeTicketModal();
        }
        if (cancelBtn) {
            cancelBtn.onclick = () => this.closeTicketModal();
        }

        // Add component button
        const addComponentBtn = document.getElementById('addComponentBtn');
        if (addComponentBtn) {
            addComponentBtn.onclick = () => this.addComponentItem();
        }

        // Assignment type toggle listeners
        const assignmentRadios = document.querySelectorAll('input[name="assignmentType"]');
        const userContainer = document.getElementById('userAssignmentContainer');
        const roleContainer = document.getElementById('roleAssignmentContainer');

        assignmentRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.value === 'user') {
                    userContainer.classList.remove('hidden');
                    roleContainer.classList.add('hidden');
                } else {
                    userContainer.classList.add('hidden');
                    roleContainer.classList.remove('hidden');
                }
            });
        });

        // Load users and roles for dropdowns
        this.loadAssignmentOptions(isEdit, ticket);

        // Form submit
        const form = document.getElementById('ticketForm');
        if (form) {
            form.onsubmit = (e) => {
                e.preventDefault();
                if (isEdit) {
                    this.submitUpdateTicket(ticket.id);
                } else {
                    this.submitCreateTicket();
                }
            };
        }

        // Load existing items for edit mode
        if (isEdit && ticket.items && ticket.items.length > 0) {
            ticket.items.forEach(() => this.addComponentItem());
            // Populate the items after adding
            setTimeout(() => this.populateComponentItems(ticket.items), 100);
        }
    }

    /**
     * Load users and roles for assignment dropdowns
     */
    async loadAssignmentOptions(isEdit = false, ticket = null) {
        const token = this.getAuthToken();
        if (!token) return;

        try {
            // Use cached data if available, otherwise fetch from API
            if (!this.cachedUsers || !this.cachedRoles) {
                console.log('Fetching users and roles from API...');

                const [usersResponse, rolesResponse] = await Promise.all([
                    fetch(`${this.apiBaseUrl}?action=users-list`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }),
                    fetch(`${this.apiBaseUrl}?action=roles-list`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    })
                ]);

                const usersResult = await usersResponse.json();
                const rolesResult = await rolesResponse.json();

                // Cache the results
                if (usersResult.success && usersResult.data?.users) {
                    this.cachedUsers = usersResult.data.users;
                }
                if (rolesResult.success && rolesResult.data?.roles) {
                    this.cachedRoles = rolesResult.data.roles;
                }

                console.log('Users and roles cached successfully');
            } else {
                console.log('Using cached users and roles data');
            }

            // Populate users dropdown from cache
            const userSelect = document.getElementById('ticketAssignedUser');
            if (userSelect && this.cachedUsers) {
                userSelect.innerHTML = '<option value="">Select a user...</option>';
                this.cachedUsers.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.id;
                    option.textContent = `${user.username} (${user.email || 'No email'})`;
                    if (isEdit && ticket && ticket.assigned_to == user.id) {
                        option.selected = true;
                    }
                    userSelect.appendChild(option);
                });
            } else if (userSelect) {
                userSelect.innerHTML = '<option value="">No users available</option>';
            }

            // Populate roles dropdown from cache
            const roleSelect = document.getElementById('ticketAssignedRole');
            if (roleSelect && this.cachedRoles) {
                roleSelect.innerHTML = '<option value="">Select a role...</option>';
                this.cachedRoles.forEach(role => {
                    const option = document.createElement('option');
                    option.value = role.id;
                    option.textContent = role.display_name || role.name;
                    if (isEdit && ticket && ticket.assigned_to_role == role.id) {
                        option.selected = true;
                    }
                    roleSelect.appendChild(option);
                });
            } else if (roleSelect) {
                roleSelect.innerHTML = '<option value="">No roles available</option>';
            }

        } catch (error) {
            console.error('Error loading assignment options:', error);
            const userSelect = document.getElementById('ticketAssignedUser');
            const roleSelect = document.getElementById('ticketAssignedRole');
            if (userSelect) userSelect.innerHTML = '<option value="">Error loading users</option>';
            if (roleSelect) roleSelect.innerHTML = '<option value="">Error loading roles</option>';
        }
    }

    /**
     * Close ticket modal
     */
    closeTicketModal() {
        const modal = document.getElementById('modalContainer');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    /**
     * Show loading state
     */
    showLoading(show) {
        const loadingState = document.getElementById('ticketsLoadingState');
        if (loadingState) {
            loadingState.style.display = show ? 'block' : 'none';
        }
    }

    /**
     * Show error state
     */
    showError(message) {
        const errorState = document.getElementById('ticketsErrorState');
        const errorMessage = document.getElementById('ticketsErrorMessage');
        const tableContainer = document.querySelector('.table-container');

        if (errorState) {
            errorState.style.display = 'block';
        }
        if (errorMessage) {
            errorMessage.textContent = message;
        }
        if (tableContainer) {
            tableContainer.style.display = 'none';
        }
    }

    /**
     * Show empty state
     */
    showEmptyState() {
        const emptyState = document.getElementById('ticketsEmptyState');
        const tableContainer = document.querySelector('.table-container');

        if (emptyState) {
            emptyState.style.display = 'block';
        }
        if (tableContainer) {
            tableContainer.style.display = 'none';
        }
    }

    /**
     * Hide all states
     */
    hideStates() {
        const states = ['ticketsLoadingState', 'ticketsErrorState', 'ticketsEmptyState'];
        states.forEach(stateId => {
            const element = document.getElementById(stateId);
            if (element) {
                element.style.display = 'none';
            }
        });
    }

    /**
     * Get authentication token
     */
    getAuthToken() {
        // Try to get token from localStorage (check both possible keys)
        const token = localStorage.getItem('bdc_token') || localStorage.getItem('jwt_token');
        return token;
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Format date
     */
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;

        const options = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        return date.toLocaleDateString('en-US', options);
    }

    /**
     * Add component item to form
     */
    addComponentItem(item = null) {
        const container = document.getElementById('componentItemsContainer');
        if (!container) return;

        const index = container.children.length;
        const itemHTML = this.getComponentItemHTML(index, item);

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = itemHTML;
        const itemElement = tempDiv.firstElementChild;

        container.appendChild(itemElement);

        // Setup event listeners for this item
        this.setupComponentItemListeners(itemElement, item);
    }

    /**
     * Setup component item event listeners
     */
    setupComponentItemListeners(itemElement, existingItem = null) {
        const typeSelect = itemElement.querySelector('.component-type-select');
        const uuidSelect = itemElement.querySelector('.component-uuid-select');
        const removeBtn = itemElement.querySelector('.remove-component-btn');

        // Type change handler
        if (typeSelect) {
            typeSelect.addEventListener('change', (e) => {
                this.populateComponentUUIDs(e.target.value, uuidSelect);
            });

            // Populate UUIDs if type is already selected
            if (existingItem && existingItem.component_type) {
                this.populateComponentUUIDs(existingItem.component_type, uuidSelect, existingItem.component_uuid);
            }
        }

        // Remove button handler
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                itemElement.remove();
            });
        }
    }

    /**
     * Populate component UUID dropdown
     */
    populateComponentUUIDs(componentType, uuidSelect, selectedUUID = null) {
        if (!uuidSelect || !componentType) return;

        uuidSelect.innerHTML = '<option value="">Select Component</option>';

        const components = this.componentData[componentType] || [];
        components.forEach(comp => {
            const option = document.createElement('option');
            option.value = comp.uuid;
            option.textContent = `${comp.brand} - ${comp.name}`;
            if (selectedUUID && comp.uuid === selectedUUID) {
                option.selected = true;
            }
            uuidSelect.appendChild(option);
        });
    }

    /**
     * Populate component items (for edit mode)
     */
    populateComponentItems(items) {
        const container = document.getElementById('componentItemsContainer');
        if (!container) return;

        const itemElements = container.querySelectorAll('.component-item');
        items.forEach((item, index) => {
            if (itemElements[index]) {
                const element = itemElements[index];
                const typeSelect = element.querySelector('.component-type-select');
                const uuidSelect = element.querySelector('.component-uuid-select');
                const quantityInput = element.querySelector('.component-quantity');
                const actionSelect = element.querySelector('.component-action');

                if (typeSelect) typeSelect.value = item.component_type;
                if (uuidSelect) this.populateComponentUUIDs(item.component_type, uuidSelect, item.component_uuid);
                if (quantityInput) quantityInput.value = item.quantity;
                if (actionSelect) actionSelect.value = item.action;
            }
        });
    }

    /**
     * Collect component items from form
     */
    collectComponentItems() {
        const container = document.getElementById('componentItemsContainer');
        if (!container) return [];

        const items = [];
        const itemElements = container.querySelectorAll('.component-item');

        itemElements.forEach(element => {
            const typeSelect = element.querySelector('.component-type-select');
            const uuidSelect = element.querySelector('.component-uuid-select');
            const quantityInput = element.querySelector('.component-quantity');
            const actionSelect = element.querySelector('.component-action');

            const type = typeSelect ? typeSelect.value : '';
            const uuid = uuidSelect ? uuidSelect.value : '';
            const quantity = quantityInput ? parseInt(quantityInput.value) : 1;
            const action = actionSelect ? actionSelect.value : 'add';

            // Only include items that have both type and UUID selected
            if (type && uuid) {
                items.push({
                    component_type: type,
                    component_uuid: uuid,
                    quantity: quantity,
                    action: action
                });
            }
        });

        return items;
    }

    /**
     * Submit create ticket
     */
    async submitCreateTicket() {
        try {
            const title = document.getElementById('ticketTitle').value.trim();
            const description = document.getElementById('ticketDescription').value.trim();
            const priority = document.getElementById('ticketPriority').value;
            const targetServer = document.getElementById('ticketTargetServer').value.trim();

            // Get assignment values
            const assignmentType = document.querySelector('input[name="assignmentType"]:checked')?.value;
            const assignedUserId = document.getElementById('ticketAssignedUser')?.value;
            const assignedRoleId = document.getElementById('ticketAssignedRole')?.value;

            // Validate required fields
            if (!title) {
                if (window.toastNotification) {
                    toastNotification.show('Title is required', 'error');
                }
                return;
            }

            if (!description) {
                if (window.toastNotification) {
                    toastNotification.show('Description is required', 'error');
                }
                return;
            }

            // Validate assignment
            if (assignmentType === 'user' && !assignedUserId) {
                if (window.toastNotification) {
                    toastNotification.show('Please select a user to assign this ticket to', 'error');
                }
                return;
            }

            if (assignmentType === 'role' && !assignedRoleId) {
                if (window.toastNotification) {
                    toastNotification.show('Please select a role to assign this ticket to', 'error');
                }
                return;
            }

            // Collect component items
            const items = this.collectComponentItems();

            // Prepare request data
            const token = this.getAuthToken();
            if (!token) {
                throw new Error('Authentication token not found');
            }

            const formData = new FormData();
            formData.append('action', 'ticket-create');
            formData.append('title', title);
            formData.append('description', description);
            formData.append('priority', priority);

            // Add assignment field based on selection
            if (assignmentType === 'user' && assignedUserId) {
                formData.append('assigned_to', assignedUserId);
            } else if (assignmentType === 'role' && assignedRoleId) {
                formData.append('assigned_to_role', assignedRoleId);
            }

            if (targetServer) {
                formData.append('target_server_uuid', targetServer);
            }

            // Send items as JSON string (API expects JSON array)
            formData.append('items', JSON.stringify(items));

            // Show loading
            this.showLoading(true);

            const response = await fetch(this.apiBaseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                if (window.toastNotification) {
                    toastNotification.show('Ticket created successfully', 'success');
                }
                this.closeTicketModal();
                this.loadTickets(); // Reload tickets list
            } else {
                throw new Error(result.message || 'Failed to create ticket');
            }

        } catch (error) {
            console.error('Error creating ticket:', error);
            if (window.toastNotification) {
                toastNotification.show('Failed to create ticket: ' + error.message, 'error');
            }
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * Submit update ticket
     */
    async submitUpdateTicket(ticketId) {
        try {
            const title = document.getElementById('ticketTitle').value.trim();
            const description = document.getElementById('ticketDescription').value.trim();
            const priority = document.getElementById('ticketPriority').value;
            const targetServer = document.getElementById('ticketTargetServer').value.trim();

            // Validate required fields
            if (!title) {
                if (window.toastNotification) {
                    toastNotification.show('Title is required', 'error');
                }
                return;
            }

            if (!description) {
                if (window.toastNotification) {
                    toastNotification.show('Description is required', 'error');
                }
                return;
            }

            // Prepare request data
            const token = this.getAuthToken();
            if (!token) {
                throw new Error('Authentication token not found');
            }

            const formData = new FormData();
            formData.append('action', 'ticket-update');
            formData.append('ticket_id', ticketId);
            formData.append('title', title);
            formData.append('description', description);
            formData.append('priority', priority);

            if (targetServer) {
                formData.append('target_server_uuid', targetServer);
            }

            // Show loading
            this.showLoading(true);

            const response = await fetch(this.apiBaseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                if (window.toastNotification) {
                    toastNotification.show('Ticket updated successfully', 'success');
                }
                this.closeTicketModal();
                this.loadTickets(); // Reload tickets list
            } else {
                throw new Error(result.message || 'Failed to update ticket');
            }

        } catch (error) {
            console.error('Error updating ticket:', error);
            if (window.toastNotification) {
                toastNotification.show('Failed to update ticket: ' + error.message, 'error');
            }
        } finally {
            this.showLoading(false);
        }
    }
}

// Initialize tickets manager when loaded
let ticketsManager = null;

// Function to initialize tickets (called from dashboard.js)
function initTickets() {
    console.log('initTickets() function called');
    if (!ticketsManager) {
        console.log('Creating new TicketsManager instance');
        ticketsManager = new TicketsManager();
        // Make it globally accessible
        window.ticketsManager = ticketsManager;
    }
    ticketsManager.init();
}

// Make initTickets globally accessible
window.initTickets = initTickets;
