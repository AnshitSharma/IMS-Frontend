/**
 * Server List Manager
 * Handles server configuration listing and creation
 */

class ServerListManager {
    constructor() {
        this.servers = [];
        this.init();
    }

    init() {

        // Check authentication
        if (!this.checkAuthentication()) {
            return;
        }

        this.attachEventListeners();
        this.loadServerList();
    }

    /**
     * Check if user is authenticated
     */
    checkAuthentication() {
        const token = localStorage.getItem('bdc_token') || localStorage.getItem('jwt_token');

        if (!token) {
            // Clear all auth data
            localStorage.removeItem('bdc_token');
            localStorage.removeItem('jwt_token');
            localStorage.removeItem('bdc_refresh_token');
            localStorage.removeItem('bdc_user');
            // Redirect to login page
            window.location.href = '/ims_frontend/';
            return false;
        }

        return true;
    }

    attachEventListeners() {
        // Add server button
        const addBtn = document.getElementById('addServerBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.showCreateModal());
        }

        // Create server button in modal
        const createBtn = document.getElementById('createServerBtn');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.createServer());
        }

        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        }
    }

    /**
     * Load server configurations list
     */
    async loadServerList() {
        try {
            const container = document.getElementById('serverConfigsList');
            container.innerHTML = `
                <div class="col-12">
                    <div class="text-center py-5">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <p class="mt-3">Loading server configurations...</p>
                    </div>
                </div>
            `;

            const result = await serverAPI.getServerConfigs(50, 0, 1);

            if (result.success && result.data && result.data.configurations) {
                // Filter out virtual servers (only show where is_virtual = false)
                this.servers = result.data.configurations.filter(server => !server.is_virtual);
                this.renderServerList();
            } else {
                container.innerHTML = `
                    <div class="col-12">
                        <div class="text-center py-5">
                            <i class="fas fa-server" style="font-size: 3rem; color: #e5e7eb; margin-bottom: 1rem;"></i>
                            <p class="text-muted">No server configurations found</p>
                            <button class="btn btn-primary mt-3" onclick="window.serverListManager.showCreateModal()">
                                <i class="fas fa-plus me-1"></i>Create Your First Server
                            </button>
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading server list:', error);
            const container = document.getElementById('serverConfigsList');
            container.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-circle me-2"></i>
                        Failed to load server configurations
                    </div>
                </div>
            `;
        }
    }

    /**
     * Render server list
     */
    renderServerList() {
        const container = document.getElementById('serverConfigsList');

        if (this.servers.length === 0) {
            container.innerHTML = `
                <div class="col-12">
                    <div class="text-center py-5">
                        <i class="fas fa-server" style="font-size: 3rem; color: #e5e7eb; margin-bottom: 1rem;"></i>
                        <p class="text-muted">No server configurations found</p>
                        <button class="btn btn-primary mt-3" onclick="window.serverListManager.showCreateModal()">
                            <i class="fas fa-plus me-1"></i>Create Your First Server
                        </button>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = this.servers.map(server => this.renderServerCard(server)).join('');

        // Attach event listeners to server cards
        document.querySelectorAll('.server-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.btn')) {
                    const uuid = card.getAttribute('data-uuid');
                    this.openServerBuilder(uuid);
                }
            });
        });
    }

    /**
     * Render individual server card
     */
    renderServerCard(server) {
        const statusInfo = this.getStatusInfo(server.configuration_status);
        const componentCount = this.countComponents(server);

        return `
            <div class="col-md-6 col-lg-4 mb-4">
                <div class="server-card" data-uuid="${server.config_uuid}" style="cursor: pointer; transition: transform 0.2s; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                    <div class="card-header" style="background: linear-gradient(135deg, #2b2685d3 0%, #000000f3 100%); color: white; padding: 1rem;">
                        <div class="d-flex justify-content-between align-items-center gap-2">
                            <h5 class="mb-0" style="font-size: 1.125rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;">
                                <i class="fas fa-server me-2" style="flex-shrink: 0;"></i><span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: middle; max-width: 100%;">${server.server_name}</span>
                            </h5>
                            <div class="d-flex align-items-center gap-2" style="flex-shrink: 0;">
                                <span style="padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; background: rgba(255, 255, 255, 0.2); white-space: nowrap;">
                                    #${server.id}
                                </span>
                                <span class="server-status ${statusInfo.class}" style="padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; white-space: nowrap;">
                                    ${statusInfo.text}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div class="card-body" style="padding: 1.5rem; background: white;">
                        ${server.description ? `<p class="text-muted mb-3" style="font-size: 0.875rem;">${server.description}</p>` : ''}

                        <div class="d-flex justify-content-between align-items-center mb-3" style="padding: 0.75rem; background: #f9fafb; border-radius: 8px;">
                            <span style="font-size: 0.875rem; color: #6b7280;">
                                <i class="fas fa-microchip me-2"></i>Components
                            </span>
                            <span style="font-weight: 600; color: #4f46e5;">${componentCount}</span>
                        </div>

                        <div style="font-size: 0.75rem; color: #9ca3af; margin-bottom: 1rem;">
                            <div><i class="fas fa-calendar me-2"></i>Created: ${this.formatDate(server.created_at)}</div>
                            ${server.updated_at ? `<div><i class="fas fa-clock me-2"></i>Modified: ${this.formatDate(server.updated_at)}</div>` : ''}
                        </div>

                        <div class="d-flex gap-2">
                            <button class="btn btn-primary btn-sm flex-grow-1" onclick="event.stopPropagation(); window.serverListManager.openServerBuilder('${server.config_uuid}')">
                                <i class="fas fa-edit me-1"></i>Configure
                            </button>
                            <button class="btn btn-outline-danger btn-sm" onclick="event.stopPropagation(); window.serverListManager.deleteServer('${server.config_uuid}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Count components in server configuration
     */
    countComponents(server) {
        let count = 0;
        if (server.cpu_uuid) count++;
        if (server.motherboard_uuid) count++;
        if (server.chassis_uuid) count++;
        if (server.ram_configuration) {
            try {
                const ram = JSON.parse(server.ram_configuration);
                count += Array.isArray(ram) ? ram.length : 0;
            } catch (e) {}
        }
        if (server.storage_configuration) {
            try {
                const storage = JSON.parse(server.storage_configuration);
                count += Array.isArray(storage) ? storage.length : 0;
            } catch (e) {}
        }
        if (server.nic_configuration) {
            try {
                const nic = JSON.parse(server.nic_configuration);
                count += Array.isArray(nic) ? nic.length : 0;
            } catch (e) {}
        }
        if (server.caddy_configuration) {
            try {
                const caddy = JSON.parse(server.caddy_configuration);
                count += Array.isArray(caddy) ? caddy.length : 0;
            } catch (e) {}
        }
        if (server.pciecard_configurations) {
            try {
                const pcie = JSON.parse(server.pciecard_configurations);
                count += Array.isArray(pcie) ? pcie.length : 0;
            } catch (e) {}
        }
        return count;
    }

    /**
     * Get status information
     */
    getStatusInfo(status) {
        const statusMap = {
            '0': { text: 'Draft', class: 'draft' },
            '1': { text: 'Validated', class: 'active' },
            '2': { text: 'Built', class: 'finalized' },
            '3': { text: 'Finalized', class: 'finalized' }
        };
        return statusMap[status] || { text: 'Unknown', class: 'draft' };
    }

    /**
     * Format date
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    /**
     * Show create server modal
     */
    showCreateModal() {
        const modal = new bootstrap.Modal(document.getElementById('addServerModal'));
        modal.show();
    }

    /**
     * Create new server configuration
     */
    async createServer() {
        const serverName = document.getElementById('serverName').value.trim();
        const description = document.getElementById('description').value.trim();
        const startWith = document.getElementById('startWith').value;

        if (!serverName) {
            alert('Please enter a server name');
            return;
        }

        try {
            const modal = bootstrap.Modal.getInstance(document.getElementById('addServerModal'));
            modal.hide();

            // Show loading
            const container = document.getElementById('serverConfigsList');
            container.innerHTML = `
                <div class="col-12">
                    <div class="text-center py-5">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <p class="mt-3">Creating server configuration...</p>
                    </div>
                </div>
            `;

            const result = await serverAPI.createServerConfig(serverName, description, startWith);

            if (result.success && result.data && result.data.config_uuid) {
                this.showToast('Server created successfully!', 'success');
                // Redirect to builder page
                setTimeout(() => {
                    window.location.href = `builder.html?config=${result.data.config_uuid}`;
                }, 500);
            } else {
                this.showToast(result.message || 'Failed to create server configuration', 'danger');
                this.loadServerList();
            }
        } catch (error) {
            console.error('Error creating server:', error);
            this.showToast('Failed to create server configuration', 'danger');
            this.loadServerList();
        }
    }

    /**
     * Open server builder
     */
    openServerBuilder(uuid) {
        window.location.href = `builder.html?config=${uuid}`;
    }

    /**
     * Delete server configuration
     */
  async deleteServer(uuid) {
    if (!confirm('Are you sure you want to delete this server configuration?')) {
        return;
    }

    try {
        // Show loading state on the delete button
        const deleteBtn = event.target.closest('.btn-outline-danger');
        const originalContent = deleteBtn.innerHTML;
        deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        deleteBtn.disabled = true;

        const result = await serverAPI.deleteServerConfig(uuid);

        if (result.success) {
            this.showToast('Server configuration deleted successfully', 'success');
            // Remove the card immediately for better UX
            const card = document.querySelector(`[data-uuid="${uuid}"]`);
            if (card) {
                card.style.opacity = '0.5';
                setTimeout(() => {
                    this.loadServerList();
                }, 300);
            } else {
                this.loadServerList();
            }
        } else {
            this.showToast(result.message || 'Failed to delete server configuration', 'danger');
            // Reset button state on error
            deleteBtn.innerHTML = originalContent;
            deleteBtn.disabled = false;
        }
    } catch (error) {
        console.error('Error deleting server:', error);
        this.showToast('Failed to delete server configuration', 'danger');
        // Reset button state on error
        const deleteBtn = event.target.closest('.btn-outline-danger');
        if (deleteBtn) {
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.disabled = false;
        }
    }
}

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        // Create toast container if it doesn't exist
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toastClass = `toast-${type}`;
        const icon = type === 'success' ? 'fa-check-circle' :
                    type === 'danger' ? 'fa-times-circle' :
                    type === 'warning' ? 'fa-exclamation-triangle' :
                    'fa-info-circle';

        const title = type === 'success' ? 'Success' :
                     type === 'danger' ? 'Error' :
                     type === 'warning' ? 'Warning' :
                     'Information';

        const toastId = `toast-${Date.now()}`;
        const toastHtml = `
            <div class="toast ${toastClass}" id="${toastId}">
                <div class="toast-icon">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="toast-content">
                    <div class="toast-title">${title}</div>
                    <div class="toast-message">${message}</div>
                </div>
                <button class="toast-close" onclick="this.closest('.toast').remove()">
                    <i class="fas fa-times"></i>
                </button>
                <div class="toast-progress"></div>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', toastHtml);

        const toast = document.getElementById(toastId);

        // Trigger show animation
        setTimeout(() => toast.classList.add('show'), 10);

        // Auto remove after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Logout
     */
    logout() {
        if (confirm('Are you sure you want to logout?')) {
            localStorage.removeItem('jwt_token');
            localStorage.removeItem('bdc_token');
            localStorage.removeItem('bdc_refresh_token');
            localStorage.removeItem('bdc_user');
            window.location.href = '../index.html';
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.serverListManager = new ServerListManager();
});
