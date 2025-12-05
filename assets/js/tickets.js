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
    }

    /**
     * Initialize tickets manager
     */
    init() {
        this.setupEventListeners();
        this.loadTickets();
    }

    /**
     * Setup event listeners for tickets page
     */
    setupEventListeners() {
        // Refresh button
        const refreshBtn = document.getElementById('refreshTicketsBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadTickets());
        }

        // Create ticket buttons
        const createBtn = document.getElementById('createTicketBtn');
        const createFirstBtn = document.getElementById('createFirstTicketBtn');

        if (createBtn) {
            createBtn.addEventListener('click', () => this.showCreateTicketForm());
        }
        if (createFirstBtn) {
            createFirstBtn.addEventListener('click', () => this.showCreateTicketForm());
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
                        <div class="flex items-center gap-2">
                             <div class="w-7 h-7 rounded-full bg-surface-secondary flex items-center justify-center text-xs text-text-muted ring-2 ring-surface-card">
                                <i class="fas fa-user"></i>
                             </div>
                             <span class="text-sm font-medium text-text-secondary">${this.escapeHtml(ticket.assigned_to_username || 'Unassigned')}</span>
                        </div>
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

        modal.style.display = 'flex';
    }

    /**
     * Close ticket details modal
     */
    closeDetailsModal() {
        const modal = document.getElementById('ticketDetailsModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * Edit ticket
     */
    editTicket(ticketId) {
        if (window.toastNotification) {
            toastNotification.show('Edit ticket functionality coming soon', 'info');
        } else {
            alert('Edit ticket functionality coming soon');
        }
    }

    /**
     * Show create ticket form
     */
    showCreateTicketForm() {
        if (window.toastNotification) {
            toastNotification.show('Create ticket functionality coming soon', 'info');
        } else {
            alert('Create ticket functionality coming soon');
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
}

// Initialize tickets manager when loaded
let ticketsManager = null;

// Function to initialize tickets (called from dashboard.js)
function initTickets() {
    if (!ticketsManager) {
        ticketsManager = new TicketsManager();
    }
    ticketsManager.init();
}
