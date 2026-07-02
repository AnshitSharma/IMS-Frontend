/**
 * RackAPI — API wrapper for the Rack View feature.
 * Mirrors the ServerAPI pattern (axios + FormData + Bearer auth).
 */
class RackAPI {
    constructor() {
        this.baseURL = window.BDC_CONFIG?.API_BASE_URL || 'https://ims.bdcms.bharatdatacenter.com/Ims_backend/api/api.php';
        this.loginURL = window.BDC_CONFIG?.FRONTEND_LOGIN_URL || 'https://ims.bdcms.bharatdatacenter.com/Ims_frontend/';
        this.token = localStorage.getItem('bdc_token') || sessionStorage.getItem('bdc_token');
        axios.defaults.headers.common['Authorization'] = this.token ? `Bearer ${this.token}` : '';
    }

    async makeRequest(data, options = {}) {
        try {
            const formData = new FormData();
            for (const [key, value] of Object.entries(data)) {
                if (value !== undefined && value !== null) {
                    formData.append(key, value);
                }
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
            if (error.response?.status === 401) {
                sessionStorage.removeItem('bdc_token');
                localStorage.removeItem('bdc_token');
                window.location.href = this.loginURL;
                return;
            }
            // Surface the API's own message when present, else a generic one.
            const message = error.response?.data?.message || 'Network error occurred';
            return { success: false, message };
        }
    }

    listRacks(options = {}) {
        return this.makeRequest({ action: 'rack-list' }, options);
    }

    getRack(rackUuid, options = {}) {
        return this.makeRequest({ action: 'rack-get', rack_uuid: rackUuid }, options);
    }

    createRack({ name, location = '', totalU = 42, numberingTopDown = false, notes = '' }, options = {}) {
        return this.makeRequest({
            action: 'rack-create',
            name,
            location,
            total_u: totalU,
            numbering_top_down: numberingTopDown ? 'true' : 'false',
            notes
        }, options);
    }

    updateRack(rackUuid, fields = {}, options = {}) {
        const data = { action: 'rack-update', rack_uuid: rackUuid };
        if (fields.name !== undefined) data.name = fields.name;
        if (fields.location !== undefined) data.location = fields.location;
        if (fields.totalU !== undefined) data.total_u = fields.totalU;
        if (fields.numberingTopDown !== undefined) data.numbering_top_down = fields.numberingTopDown ? 'true' : 'false';
        if (fields.notes !== undefined) data.notes = fields.notes;
        return this.makeRequest(data, options);
    }

    deleteRack(rackUuid, options = {}) {
        return this.makeRequest({ action: 'rack-delete', rack_uuid: rackUuid }, options);
    }

    assignServer(rackUuid, configUuid, startU, uHeight = null, options = {}) {
        const data = {
            action: 'rack-assign-server',
            rack_uuid: rackUuid,
            config_uuid: configUuid,
            start_u: startU
        };
        if (uHeight !== null && uHeight !== undefined && uHeight !== '') {
            data.u_height = uHeight;
        }
        return this.makeRequest(data, options);
    }

    unassignServer(configUuid, options = {}) {
        return this.makeRequest({ action: 'rack-unassign-server', config_uuid: configUuid }, options);
    }

    unassignedServers(options = {}) {
        return this.makeRequest({ action: 'rack-unassigned-servers' }, options);
    }
}

// Global instance
const rackAPI = new RackAPI();
window.rackAPI = rackAPI;
