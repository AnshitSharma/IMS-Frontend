// API Configuration and Helper Functions
class ServerAPI {
    constructor() {
        this.baseURL = 'https://shubham.staging.cloudmate.in/bdc_ims/api/api.php';
        // Check both token keys for compatibility with dashboard
        this.token = localStorage.getItem('bdc_token') || localStorage.getItem('jwt_token');

        // Setup axios defaults
        axios.defaults.headers.common['Authorization'] = this.token ? `Bearer ${this.token}` : '';
    }

    // Update token
    setToken(token) {
        this.token = token;
        localStorage.setItem('bdc_token', token);
        localStorage.setItem('jwt_token', token); // Keep both for compatibility
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    // Clear token
    clearToken() {
        this.token = null;
        localStorage.removeItem('bdc_token');
        localStorage.removeItem('jwt_token');
        localStorage.removeItem('bdc_refresh_token');
        localStorage.removeItem('bdc_user');
        delete axios.defaults.headers.common['Authorization'];
    }

    // Generic API request method
    async makeRequest(data) {
        try {
            const formData = new FormData();

            // Add all data to FormData
            for (const [key, value] of Object.entries(data)) {
                formData.append(key, value);
            }

            const response = await axios.post(this.baseURL, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                }
            });

            return response.data;
        } catch (error) {
            console.error('API Request Error:', error);

            if (error.response?.status === 401) {
                this.clearToken();
                window.location.href = '/ims_frontend/';
                return;
            }

            throw new Error(error.response?.data?.message || 'Network error occurred');
        }
    }

    // Server Configuration APIs
    async createServerConfig(serverName, description, startWith) {
        return await this.makeRequest({
            action: 'server-create-start',
            server_name: serverName,
            description: description,
            start_with: startWith
        });
    }

    async getServerConfigs(limit = 20, offset = 0, status = 1) {
        return await this.makeRequest({
            action: 'server-list-configs',
            limit: limit,
            offset: offset,
            status: status
        });
    }

    async getServerConfig(configUuid) {
        return await this.makeRequest({
            action: 'server-get-config',
            config_uuid: configUuid
        });
    }

    async deleteServerConfig(configUuid) {
        return await this.makeRequest({
            action: 'server-delete-config',
            config_uuid: configUuid
        });
    }

    async finalizeServerConfig(configUuid, notes = '') {
        return await this.makeRequest({
            action: 'server-finalize-config',
            config_uuid: configUuid,
            notes: notes
        });
    }

    // Component Management APIs
    async getCompatibleComponents(configUuid, componentType, availableOnly = true) {
        return await this.makeRequest({
            action: 'server-get-compatible',
            config_uuid: configUuid,
            component_type: componentType,
            available_only: availableOnly.toString()
        });
    }

    async addComponentToServer(configUuid, componentType, componentUuid, quantity = 1, slotPosition = '', override = false) {
        return await this.makeRequest({
            action: 'server-add-component',
            config_uuid: configUuid,
            component_type: componentType,
            component_uuid: componentUuid,
            quantity: quantity.toString(),
            slot_position: slotPosition,
            override: override.toString()
        });
    }

    async removeComponentFromServer(configUuid, componentType, componentUuid) {
        return await this.makeRequest({
            action: 'server-remove-component',
            config_uuid: configUuid,
            component_type: componentType,
            component_uuid: componentUuid
        });
    }

    async validateServerConfig(configUuid) {
        return await this.makeRequest({
            action: 'server-validate-config',
            config_uuid: configUuid
        });
    }

    async getAvailableComponents(componentType, includeInUse = false, limit = 50) {
        return await this.makeRequest({
            action: 'server-get-available-components',
            component_type: componentType,
            include_in_use: includeInUse.toString(),
            limit: limit.toString()
        });
    }

    // Utility methods
    formatComponentType(type) {
        const typeMap = {
            'cpu': 'CPU',
            'motherboard': 'Motherboard',
            'ram': 'RAM',
            'storage': 'Storage',
            'nic': 'Network Interface',
            'psu': 'Power Supply',
            'gpu': 'Graphics Card',
            'cabinet': 'Cabinet'
        };
        return typeMap[type] || type.toUpperCase();
    }

    getComponentIcon(type) {
        const iconMap = {
            'cpu': 'fas fa-microchip',
            'motherboard': 'fas fa-memory',
            'ram': 'fas fa-memory',
            'storage': 'fas fa-hdd',
            'nic': 'fas fa-network-wired',
            'psu': 'fas fa-plug',
            'gpu': 'fas fa-display',
            'cabinet': 'fas fa-server'
        };
        return iconMap[type] || 'fas fa-microchip';
    }

    formatServerStatus(status) {
        const statusMap = {
            '0': { text: 'Draft', class: 'draft' },
            '1': { text: 'Active', class: 'active' },
            '2': { text: 'Finalized', class: 'finalized' }
        };
        return statusMap[status] || { text: 'Unknown', class: 'draft' };
    }

    // Component availability types that need motherboard first
    requiresMotherboard(componentType) {
        return ['cpu', 'ram'].includes(componentType);
    }

    // Get next available component types based on current configuration
    getNextAvailableTypes(currentComponents) {
        const hasMotherboard = currentComponents.some(c => c.component_type === 'motherboard');

        if (!hasMotherboard) {
            return ['motherboard'];
        }

        // After motherboard, all types are available
        return ['cpu', 'ram', 'storage', 'nic', 'psu', 'gpu', 'cabinet'];
    }
}

// Create global instance
const serverAPI = new ServerAPI();