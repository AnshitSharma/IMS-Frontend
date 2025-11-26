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
        this.apiBaseUrl = 'https://shubham.staging.cloudmate.in/bdc_ims_dev/api/api.php';
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

            // Build API URL with query parameters
            const params = new URLSearchParams({
                action: 'ticket-list',
                page: this.currentPage,
                limit: this.itemsPerPage,
                order_by: 'created_at',
                order_dir: 'DESC'
            });

            // Add filters if set
            if (this.statusFilter) {
                params.append('status', this.statusFilter);
            }
            if (this.priorityFilter) {
                params.append('priority', this.priorityFilter);
            }
            if (this.searchTerm) {
                params.append('search', this.searchTerm);
            }

            const url = `${this.apiBaseUrl}?${params.toString()}`;

            // Make API call
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
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
            return `
                <tr>
                    <td><strong>${this.escapeHtml(ticket.ticket_number || 'N/A')}</strong></td>
                    <td>
                        <div style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(ticket.title)}">
                            ${this.escapeHtml(ticket.title)}
                        </div>
                    </td>
                    <td>${this.getStatusBadge(ticket.status)}</td>
                    <td>${this.getPriorityBadge(ticket.priority)}</td>
                    <td>${this.escapeHtml(ticket.assigned_to_username || 'Unassigned')}</td>
                    <td>${this.formatDate(ticket.created_at)}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn" onclick="ticketsManager.viewTicket(${ticket.id})" title="View Details">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="action-btn edit" onclick="ticketsManager.editTicket(${ticket.id})" title="Edit">
                                <i class="fas fa-edit"></i>
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
        const statusConfig = {
            'draft': { label: 'Draft', color: 'var(--warning-color)' },
            'pending': { label: 'Pending', color: 'var(--info-color)' },
            'approved': { label: 'Approved', color: 'var(--success-color)' },
            'in_progress': { label: 'In Progress', color: 'var(--primary-color)' },
            'deployed': { label: 'Deployed', color: 'var(--success-color)' },
            'completed': { label: 'Completed', color: 'var(--success-color)' },
            'rejected': { label: 'Rejected', color: 'var(--danger-color)' },
            'cancelled': { label: 'Cancelled', color: 'var(--text-muted)' }
        };

        const config = statusConfig[status] || { label: status, color: 'var(--text-muted)' };
        return `<span class="status-badge" style="background-color: ${config.color}20; color: ${config.color}; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">${config.label}</span>`;
    }

    /**
     * Get priority badge HTML
     */
    getPriorityBadge(priority) {
        const priorityConfig = {
            'low': { label: 'Low', color: 'var(--info-color)' },
            'medium': { label: 'Medium', color: 'var(--warning-color)' },
            'high': { label: 'High', color: 'var(--danger-color)' },
            'urgent': { label: 'Urgent', color: '#c41e3a' }
        };

        const config = priorityConfig[priority] || { label: priority, color: 'var(--text-muted)' };
        return `<span class="priority-badge" style="background-color: ${config.color}20; color: ${config.color}; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">${config.label}</span>`;
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

            const url = `${this.apiBaseUrl}?action=ticket-get&ticket_id=${ticketId}&include_history=true`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
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
        // Try to get token from localStorage
        const token = localStorage.getItem('bdc_token');
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
