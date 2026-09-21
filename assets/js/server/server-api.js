// API Configuration and Helper Functions
class ServerAPI {
    constructor() {
        // Uses centralized config (see assets/js/config.js)
        this.baseURL = window.BDC_CONFIG?.API_BASE_URL || 'https://ims.bdcms.bharatdatacenter.com/Ims_backend/api/api.php';
        this.loginURL = window.BDC_CONFIG?.FRONTEND_LOGIN_URL || 'https://ims.bdcms.bharatdatacenter.com/';
        // Get token from bdc_token key (current standard)
        this.token = window.api ? window.api.getToken()
            : (localStorage.getItem('bdc_token') || sessionStorage.getItem('bdc_token'));
    }

    // Generic API request method.
    //
    // One transport for the whole frontend: window.api.request() already owns the
    // Bearer header, the FormData encoding, the single-flight token refresh with a
    // retry, and the redirect to login when the session is genuinely over. This
    // used to be a second, axios-based copy of all of that.
    // `options` began as an axios request-config bag. What survives of it is read
    // here — `silent` and `loadingMessage` drive the overlay below — and by three
    // methods that pull extra FIELDS out of it (`parent_nic_uuid`, `port_index`,
    // `serial_number`). Anything else in it is ignored.
    async makeRequest(data, options = {}) {
        const { action, ...fields } = data;
        // These pages show the global overlay for every call; axios interceptors
        // used to count the requests, so do it here instead.
        window.globalLoading?.beginRequest(options.loadingMessage, options.silent);
        try {
            return await window.api.request(action, fields);
        } finally {
            window.globalLoading?.endRequest();
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

    // Server Compute Platform APIs
    // Platforms (HPE ProLiant DL360 Gen10 …) group the system boards a given server
    // product accepts. Specs live in ims-data; the backend serves them with live stock.
    async listServerPlatforms(options = {}) {
        return await this.makeRequest({
            action: 'server-list-platforms'
        }, options);
    }

    // Both platform actions answer a refusal with 409 and put the reason in `data`.
    // makeRequest() turns any non-2xx into a throw, so PlatformManager.attempt()
    // catches it and reads `error.data` — that is where the 409 handshake is handled,
    // not here. (A `validateStatus` option used to sit here for this; it was an axios
    // request-config key and has been inert since axios was removed.)
    //
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
        }, options);
    }

    // Removes the compute platform and releases the whole build with it. Same 409
    // confirmation handshake as setServerPlatform.
    async removeServerPlatform(configUuid, confirmWipe = false, options = {}) {
        return await this.makeRequest({
            action: 'server-remove-platform',
            config_uuid: configUuid,
            confirm_wipe: confirmWipe ? 'true' : 'false'
        }, options);
    }
}

// Create global instance
const serverAPI = new ServerAPI();
window.serverAPI = serverAPI;
