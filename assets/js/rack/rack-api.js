/**
 * RackAPI — API wrapper for the Rack View feature.
 * Mirrors the ServerAPI pattern: action + FormData over window.api.request().
 */
class RackAPI {
    constructor() {
        this.baseURL = window.BDC_CONFIG?.API_BASE_URL || 'https://ims.bdcms.bharatdatacenter.com/Ims_backend/api/api.php';
        this.loginURL = window.BDC_CONFIG?.FRONTEND_LOGIN_URL || 'https://ims.bdcms.bharatdatacenter.com/';
        this.token = window.api ? window.api.getToken()
            : (localStorage.getItem('bdc_token') || sessionStorage.getItem('bdc_token'));
    }

    // One transport for the whole frontend: window.api.request() owns the Bearer
    // header, the FormData encoding, the single-flight refresh-and-retry on 401 and
    // the redirect to login. This used to be a second, axios-based copy of it.
    //
    // It throws where axios rejected, so the throw is turned back into the
    // { success: false, message } envelope every caller on the Rack View page
    // already checks. `options` was an axios request-config bag that no caller ever
    // populated; accepted and ignored.
    async makeRequest(data, options = {}) {
        const { action, ...fields } = data;
        // This page shows the global overlay for every call; axios interceptors
        // used to count the requests, so do it here instead.
        window.globalLoading?.beginRequest(options.loadingMessage, options.silent);
        try {
            return await window.api.request(action, fields);
        } catch (error) {
            return { success: false, message: error.message || 'Network error occurred' };
        } finally {
            window.globalLoading?.endRequest();
        }
    }

    listRacks(options = {}) {
        return this.makeRequest({ action: 'rack-list' }, options);
    }

    getRack(rackUuid, options = {}) {
        return this.makeRequest({ action: 'rack-get', rack_uuid: rackUuid }, options);
    }

    // locationUuid supersedes the free-text `location`: the backend writes the
    // location's own name into that column, so a rack cannot claim a site its
    // location does not name. Passing neither leaves the rack unassigned.
    createRack({ name, location = '', locationUuid = '', floor = '', totalU = 42, numberingTopDown = false, notes = '' }, options = {}) {
        return this.makeRequest({
            action: 'rack-create',
            name,
            location,
            location_uuid: locationUuid,
            floor,
            total_u: totalU,
            numbering_top_down: numberingTopDown ? 'true' : 'false',
            notes
        }, options);
    }

    updateRack(rackUuid, fields = {}, options = {}) {
        const data = { action: 'rack-update', rack_uuid: rackUuid };
        if (fields.name !== undefined) data.name = fields.name;
        if (fields.location !== undefined) data.location = fields.location;
        // Sending location_uuid makes the backend re-stamp every server in this
        // rack, and every component in those servers, with the new site. That is
        // the point: moving a rack moves everything standing in it.
        if (fields.locationUuid !== undefined) data.location_uuid = fields.locationUuid;
        if (fields.floor !== undefined) data.floor = fields.floor;
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

    // Install a server in a BAY of an enclosure. The enclosure already has a
    // rack and a U range, so neither is sent — the backend takes both from it.
    assignServerToSlot(enclosureUuid, configUuid, slotIndex, options = {}) {
        return this.makeRequest({
            action: 'rack-assign-server',
            enclosure_uuid: enclosureUuid,
            config_uuid: configUuid,
            slot_index: slotIndex
        }, options);
    }

    unassignServer(configUuid, options = {}) {
        return this.makeRequest({ action: 'rack-unassign-server', config_uuid: configUuid }, options);
    }

    unassignedServers(options = {}) {
        return this.makeRequest({ action: 'rack-unassigned-servers' }, options);
    }

    // Every physical server, racked or not, each with where it is now. The bay
    // picker uses this rather than unassignedServers(): moving a server out of a
    // U and into an enclosure bay is an ordinary move, and in an estate where
    // everything is already racked, offering only unracked servers left the bays
    // permanently unfillable.
    placeableServers(excludeConfigUuid = '', options = {}) {
        const data = { action: 'rack-placeable-servers' };
        if (excludeConfigUuid) { data.exclude_config_uuid = excludeConfigUuid; }
        return this.makeRequest(data, options);
    }

    placement(configUuid, options = {}) {
        return this.makeRequest({ action: 'rack-placement', config_uuid: configUuid }, options);
    }

    /* ---- Enclosures (seeder 2026_09_03_003) ---- */

    // Chassis models declaring bays. Comes back empty — not as an error — when
    // ims-data carries no enclosure model yet, since that directory is uploaded
    // by hand and may lag the code.
    enclosureModels(options = {}) {
        return this.makeRequest({ action: 'rack-enclosure-models' }, options);
    }

    addEnclosure(rackUuid, { name, chassisUuid, startU, serialNumber = '', notes = '' }, options = {}) {
        return this.makeRequest({
            action: 'rack-enclosure-add',
            rack_uuid: rackUuid,
            name,
            chassis_uuid: chassisUuid,
            start_u: startU,
            serial_number: serialNumber,
            notes
        }, options);
    }

    // Only the fields present are sent: the backend distinguishes "clear this"
    // from "leave it alone", so sending every key would blank the serial and
    // notes on a rename.
    updateEnclosure(enclosureUuid, fields = {}, options = {}) {
        const data = { action: 'rack-enclosure-update', enclosure_uuid: enclosureUuid };
        if (fields.name !== undefined) data.name = fields.name;
        if (fields.serialNumber !== undefined) data.serial_number = fields.serialNumber;
        if (fields.notes !== undefined) data.notes = fields.notes;
        if (fields.startU !== undefined) data.start_u = fields.startU;
        return this.makeRequest(data, options);
    }

    removeEnclosure(enclosureUuid, options = {}) {
        return this.makeRequest({ action: 'rack-enclosure-remove', enclosure_uuid: enclosureUuid }, options);
    }
}

// Global instance
const rackAPI = new RackAPI();
window.rackAPI = rackAPI;
