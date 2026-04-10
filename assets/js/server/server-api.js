// API Configuration and Helper Functions
class ServerAPI {
    constructor() {
        // Uses centralized config (see assets/js/config.js)
        this.baseURL = window.BDC_CONFIG?.API_BASE_URL || 'https://ims.bdcms.bharatdatacenter.com/Ims_backend/api/api.php';
        this.loginURL = window.BDC_CONFIG?.FRONTEND_LOGIN_URL || 'https://ims.bdcms.bharatdatacenter.com/Ims_frontend/';
        // Check both token keys for compatibility with dashboard
        this.token = localStorage.getItem('bdc_token') || sessionStorage.getItem('bdc_token') || sessionStorage.getItem('jwt_token');

        // Setup axios defaults
        axios.defaults.headers.common['Authorization'] = this.token ? `Bearer ${this.token}` : '';
    }

    // Update token
    setToken(token) {
        this.token = token;
        sessionStorage.setItem('bdc_token', token);
        sessionStorage.setItem('jwt_token', token); // Keep both for compatibility
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    // Clear token
    clearToken() {
        this.token = null;
        sessionStorage.removeItem('bdc_token');
        sessionStorage.removeItem('jwt_token');
        sessionStorage.removeItem('bdc_refresh_token');
        sessionStorage.removeItem('bdc_user');
        localStorage.removeItem('bdc_token');
        localStorage.removeItem('bdc_refresh_token');
        localStorage.removeItem('bdc_user');
        localStorage.removeItem('bdc_remember_me');
        delete axios.defaults.headers.common['Authorization'];
    }

    // Generic API request method
    async makeRequest(data, options = {}) {
        try {
            const formData = new FormData();

            // Add all data to FormData
            for (const [key, value] of Object.entries(data)) {
                formData.append(key, value);
            }

            const response = await axios.post(this.baseURL, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
                ...options
            });

            return response.data;
        } catch (error) {
            console.error('API Request Error:', error);

            if (error.response?.status === 401) {
                this.clearToken();
                window.location.href = this.loginURL;
                return;
            }

            throw new Error(error.response?.data?.message || 'Network error occurred');
        }
    }

    // Server Configuration APIs
    async createServerConfig(serverName, description, startWith, isVirtual, options = {}) {
        const requestData = {
            action: 'server-create-start',
            server_name: serverName,
            description: description,
            is_virtual: isVirtual
        };

        // Only include start_with if it's provided
        if (startWith) {
            requestData.start_with = startWith;
        }

        return await this.makeRequest(requestData, options);
    }

    async getServerConfigs(limit = 20, offset = 0, status = 1, options = {}) {
        return await this.makeRequest({
            action: 'server-list-configs',
            limit: limit,
            offset: offset,
            status: status
        }, options);
    }

    async listTemplates(limit = 100, offset = 0, options = {}) {
        return await this.makeRequest({
            action: 'server-list-configs',
            limit: limit,
            offset: offset,
            include_virtual: 'true'
        }, options);
    }

    async getServerConfig(configUuid, options = {}) {
        return await this.makeRequest({
            action: 'server-get-config',
            config_uuid: configUuid
        }, options);
    }

    async deleteServerConfig(configUuid, options = {}) {
        return await this.makeRequest({
            action: 'server-delete-config',
            config_uuid: configUuid
        }, options);
    }

    async finalizeServerConfig(configUuid, notes = '', options = {}) {
        return await this.makeRequest({
            action: 'server-finalize-config',
            config_uuid: configUuid,
            notes: notes
        }, options);
    }

    // Component Management APIs
    async getCompatibleComponents(configUuid, componentType, availableOnly = true, options = {}) {
        return await this.makeRequest({
            action: 'server-get-compatible',
            config_uuid: configUuid,
            component_type: componentType,
            available_only: availableOnly.toString()
        }, options);
    }

    async addComponentToServer(configUuid, componentType, componentUuid, quantity = 1, slotPosition = '', override = false, options = {}) {
        const requestData = {
            action: 'server-add-component',
            config_uuid: configUuid,
            component_type: componentType,
            component_uuid: componentUuid,
            quantity: quantity.toString(),
            slot_position: slotPosition,
            override: override.toString()
        };

        // Add parent_nic_uuid if provided in options (for SFP modules)
        if (options.parent_nic_uuid) {
            requestData.parent_nic_uuid = options.parent_nic_uuid;
        }

        // Add port_index if provided in options (for SFP modules)
        if (options.port_index) {
            requestData.port_index = options.port_index;
        }

        return await this.makeRequest(requestData, options);
    }

    async removeComponentFromServer(configUuid, componentType, componentUuid, options = {}) {
        return await this.makeRequest({
            action: 'server-remove-component',
            config_uuid: configUuid,
            component_type: componentType,
            component_uuid: componentUuid
        }, options);
    }

    async validateServerConfig(configUuid, options = {}) {
        return await this.makeRequest({
            action: 'server-validate-config',
            config_uuid: configUuid
        }, options);
    }

    async getAvailableComponents(componentType, includeInUse = false, limit = 50, options = {}) {
        return await this.makeRequest({
            action: 'server-get-available-components',
            component_type: componentType,
            include_in_use: includeInUse.toString(),
            limit: limit.toString()
        }, options);
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
window.serverAPI = serverAPI;
