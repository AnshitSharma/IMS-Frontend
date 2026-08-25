// API Configuration and Helper Functions
class ServerAPI {
    constructor() {
        // Uses centralized config (see assets/js/config.js)
        this.baseURL = window.BDC_CONFIG?.API_BASE_URL || 'https://ims.bdcms.bharatdatacenter.com/Ims_backend/api/api.php';
        this.loginURL = window.BDC_CONFIG?.FRONTEND_LOGIN_URL || 'https://ims.bdcms.bharatdatacenter.com/';
        // Get token from bdc_token key (current standard)
        this.token = localStorage.getItem('bdc_token') || sessionStorage.getItem('bdc_token');

        // Setup axios defaults
        axios.defaults.headers.common['Authorization'] = this.token ? `Bearer ${this.token}` : '';
    }

    // Update token
    setToken(token) {
        this.token = token;
        sessionStorage.setItem('bdc_token', token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    // Clear token
    clearToken() {
        this.token = null;
        sessionStorage.removeItem('bdc_token');
        sessionStorage.removeItem('jwt_token'); // legacy key cleanup (no longer written)
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

            const token = localStorage.getItem('bdc_token') || sessionStorage.getItem('bdc_token');
            const response = await axios.post(this.baseURL, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Authorization': token ? `Bearer ${token}` : '',
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
    // isSandbox creates a Compatibility Bench build: it implies is_virtual on the
    // backend, so nothing it holds is ever reserved or flipped to in_use.
    async createServerConfig(serverName, description, startWith, isVirtual, options = {}, isSandbox = false) {
        const requestData = {
            action: 'server-create-start',
            server_name: serverName,
            description: description,
            is_virtual: isVirtual
        };

        if (isSandbox) {
            requestData.is_sandbox = 'true';
        }

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
            include_virtual: 'true',
            // Bench builds are virtual too, and would otherwise be offered as
            // templates. The backend defaults to hiding them; stated here so the
            // intent survives a future change to that default.
            sandbox: 'false'
        }, options);
    }

    // Compatibility Bench builds. The mirror of listTemplates(): the only listing
    // that asks for sandbox rows, since every other caller must never see them.
    async listSandboxConfigs(limit = 100, offset = 0, options = {}) {
        return await this.makeRequest({
            action: 'server-list-configs',
            limit: limit,
            offset: offset,
            include_virtual: 'all',
            status: '',
            sandbox: 'true'
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

    // Per-server activity log (change history) for a single configuration
    async getServerLogs(configUuid, limit = 50, offset = 0, options = {}) {
        return await this.makeRequest({
            action: 'server-get-logs',
            config_uuid: configUuid,
            limit: limit,
            offset: offset
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
        const requestData = {
            action: 'server-remove-component',
            config_uuid: configUuid,
            component_type: componentType,
            component_uuid: componentUuid
        };

        // Identifies WHICH physical unit to release when several units of the same
        // model are in one config. Omitted for callers that have no serial to hand —
        // the backend then falls back to the config JSON, and to the single bound
        // inventory row when the model has only one.
        if (options.serial_number) {
            requestData.serial_number = options.serial_number;
        }

        return await this.makeRequest(requestData, options);
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

    // Server Compute Platform APIs
    // Platforms (HPE ProLiant DL360 Gen10 …) group the system boards a given server
    // product accepts. Specs live in ims-data; the backend serves them with live stock.
    async listServerPlatforms(options = {}) {
        return await this.makeRequest({
            action: 'server-list-platforms'
        }, options);
    }

    // Both platform actions pass validateStatus so a 4xx comes back as a RESPONSE BODY
    // rather than a thrown Error. makeRequest()'s default turns any non-2xx into
    // `new Error(message)`, which discards `data` — and for these two actions `data` is
    // the whole point of the refusal: installed_summary is what the confirmation dialog
    // shows the user. 401 and 5xx still throw, so the token-refresh path is untouched.
    static get PLATFORM_REQUEST_OPTIONS() {
        return { validateStatus: status => status < 500 && status !== 401 };
    }

    // Installs a compute platform VERSION: consumes one stocked box and autofills the
    // configuration's system board and chassis from the specs it carries.
    //
    // Installing over a build that already holds components releases all of them, so the
    // backend answers 409 error_type='confirm_wipe_required' until confirmWipe is set.
    // That refusal is the confirmation prompt — it carries installed_summary.
    async setServerPlatform(configUuid, versionUuid, confirmWipe = false, options = {}) {
        return await this.makeRequest({
            action: 'server-set-platform',
            config_uuid: configUuid,
            version_uuid: versionUuid,
            confirm_wipe: confirmWipe ? 'true' : 'false'
        }, { ...ServerAPI.PLATFORM_REQUEST_OPTIONS, ...options });
    }

    // Removes the compute platform and releases the whole build with it. Same 409
    // confirmation handshake as setServerPlatform.
    async removeServerPlatform(configUuid, confirmWipe = false, options = {}) {
        return await this.makeRequest({
            action: 'server-remove-platform',
            config_uuid: configUuid,
            confirm_wipe: confirmWipe ? 'true' : 'false'
        }, { ...ServerAPI.PLATFORM_REQUEST_OPTIONS, ...options });
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
