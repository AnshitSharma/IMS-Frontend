/**
 * API Handler for BDC Inventory Management System
 */


window.api = {
    // Base configuration - Uses centralized config (see assets/js/config.js)
    baseURL: window.BDC_CONFIG?.API_BASE_URL || 'https://ims.bdcms.bharatdatacenter.com/Ims_backend/api/api.php',
    loginURL: window.BDC_CONFIG?.FRONTEND_LOGIN_URL || 'https://ims.bdcms.bharatdatacenter.com/',

    // SECURITY NOTE: Auth tokens are stored in sessionStorage rather than localStorage.
    // sessionStorage tokens expire when the tab is closed, limiting the exposure window
    // for stolen tokens. This does NOT eliminate XSS risk — any script running in this
    // origin can still read sessionStorage. Proper mitigation requires HttpOnly cookies
    // managed server-side, which requires backend changes outside this frontend's scope.

    // Determine which storage to use based on remember-me preference
    _getStorage() {
        return localStorage.getItem('bdc_remember_me') === 'true' ? localStorage : sessionStorage;
    },

    // Get auth token (check localStorage first for remember-me, then sessionStorage)
    getToken() {
        return localStorage.getItem('bdc_token') || sessionStorage.getItem('bdc_token');
    },

    // Set auth token in the active storage
    setToken(token) {
        const storage = this._getStorage();
        if (token) {
            storage.setItem('bdc_token', token);
        } else {
            storage.removeItem('bdc_token');
        }
    },

    // Get refresh token (check both storages)
    getRefreshToken() {
        return localStorage.getItem('bdc_refresh_token') || sessionStorage.getItem('bdc_refresh_token');
    },

    // Set refresh token in the active storage
    setRefreshToken(token) {
        const storage = this._getStorage();
        if (token) {
            storage.setItem('bdc_refresh_token', token);
        } else {
            storage.removeItem('bdc_refresh_token');
        }
    },

    // Get user data (check both storages)
    getUser() {
        const userData = localStorage.getItem('bdc_user') || sessionStorage.getItem('bdc_user');
        return userData ? JSON.parse(userData) : null;
    },

    // Set user data in the active storage
    setUser(user) {
        const storage = this._getStorage();
        if (user) {
            storage.setItem('bdc_user', JSON.stringify(user));
        } else {
            storage.removeItem('bdc_user');
        }
    },

    // Clear all auth data from both storages
    clearAuth() {
        sessionStorage.removeItem('bdc_token');
        sessionStorage.removeItem('bdc_refresh_token');
        sessionStorage.removeItem('bdc_user');
        localStorage.removeItem('bdc_token');
        localStorage.removeItem('bdc_refresh_token');
        localStorage.removeItem('bdc_user');
        localStorage.removeItem('bdc_remember_me');
    },

    // Build the Error thrown for a failed API response.
    // Carries the API's status code and data payload so callers can tell a
    // refusal apart from a failure (e.g. 409 "remove the components first" is
    // a warning the user can act on, not a red error).
    buildError(result, response) {
        const error = new Error(
            result?.message || `HTTP ${response.status}: ${response.statusText}`
        );
        error.code = result?.code ?? response.status;
        error.data = result?.data ?? null;
        return error;
    },

    // Make API request with automatic token refresh
    async request(action, data = {}, method = 'POST') {
        const token = this.getToken();

        // Always use FormData for consistency with API expectations
        const formData = new FormData();
        formData.append('action', action);

        // Append data to FormData
        Object.keys(data).forEach(key => {
            if (Array.isArray(data[key])) {
                data[key].forEach(item => {
                    formData.append(`${key}[]`, item);
                });
            } else if (data[key] !== undefined && data[key] !== null) {
                // Convert boolean to string for FormData
                const value = typeof data[key] === 'boolean' ? String(data[key]) : data[key];
                formData.append(key, value);
            }
        });

        // Prepare headers - only add Authorization if token exists
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(this.baseURL, {
                method: 'POST', // API always expects POST
                headers: headers,
                body: formData
            });

            // Try to parse JSON response even for non-ok responses
            // Many APIs return error details in the response body
            let result;
            try {
                result = await response.json();
            } catch (parseError) {
                // If JSON parsing fails and response is not ok, throw HTTP error
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                throw parseError;
            }

            // Handle server-side rate limiting — surface the server's message to the user
            if (response.status === 429) {
                const rateLimitMsg = result?.message || 'Too many requests. Please wait before trying again.';
                throw new Error(rateLimitMsg);
            }

            // For non-ok responses, if we have an API message, throw it
            // This ensures the actual API error message reaches the catch block
            if (!response.ok && !result.success) {
                throw this.buildError(result, response);
            }

            // Handle token expiration
            if (result.code === 401 && result.message &&
                (result.message.includes('expired') || result.message.includes('Invalid token'))) {
                const refreshed = await this.refreshToken();
                if (refreshed) {
                    // Retry the original request with new token
                    const newHeaders = {
                        'Authorization': `Bearer ${this.getToken()}`
                    };

                    const retryResponse = await fetch(this.baseURL, {
                        method: 'POST',
                        headers: newHeaders,
                        body: formData
                    });

                    // Try to parse JSON response even for non-ok responses
                    let retryResult;
                    try {
                        retryResult = await retryResponse.json();
                    } catch (parseError) {
                        if (!retryResponse.ok) {
                            throw new Error(`HTTP ${retryResponse.status}: ${retryResponse.statusText}`);
                        }
                        throw parseError;
                    }

                    // For non-ok responses, if we have an API message, throw it
                    if (!retryResponse.ok && !retryResult.success) {
                        throw this.buildError(retryResult, retryResponse);
                    }

                    return retryResult;
                } else {
                    // Refresh failed, redirect to login
                    this.handleAuthFailure();
                    throw new Error('Authentication failed');
                }
            }

            return result;

        } catch (error) {
            console.error('API request error:', error);
            throw error;
        }
    },

    // Refresh authentication token
    async refreshToken() {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) {
            return false;
        }

        try {
            const formData = new FormData();
            formData.append('action', 'auth-refresh');
            formData.append('refresh_token', refreshToken);

            const response = await fetch(this.baseURL, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                console.error('Refresh token request failed:', response.status, response.statusText);
                return false;
            }

            const result = await response.json();

            // auth-refresh returns access_token FLAT in data — there is no `tokens`
            // wrapper here (unlike auth-login, which does have one). Reading
            // data.tokens.access_token meant this branch never ran, so refresh
            // always reported failure and the session was dropped at token expiry
            // instead of being renewed.
            if (result.success && result.data && result.data.access_token) {
                this.setToken(result.data.access_token);

                // The endpoint does not rotate the refresh token, so keep the
                // existing one unless a new one is actually sent.
                if (result.data.refresh_token) {
                    this.setRefreshToken(result.data.refresh_token);
                }

                // MERGE, don't replace: this payload carries no `roles`, and
                // overwriting the stored user would wipe them and break every
                // hasRole() gate in the UI.
                if (result.data.user) {
                    const stored = this.getUser() || {};
                    this.setUser({ ...stored, ...result.data.user });
                }
                return true;
            }

            console.error('Token refresh failed:', result.message);
            return false;

        } catch (error) {
            console.error('Token refresh error:', error);
            return false;
        }
    },

    // Handle authentication failure
    handleAuthFailure() {
        this.clearAuth();
        utils.showAlert('Session expired. Please login again.', 'warning');
        // Redirect to login page after a short delay
        setTimeout(() => {
            window.location.href = this.loginURL;
        }, 2000);
    },

    // Authentication endpoints
    auth: {
        async login(username, password) {
            const result = await api.request('auth-login', {
                username: username,
                password: password
            });

            if (result.success && result.data && result.data.tokens) {
                api.setToken(result.data.tokens.access_token);
                api.setRefreshToken(result.data.tokens.refresh_token);
                api.setUser(result.data.user);
            }

            return result;
        },

        async logout() {
            const refreshToken = api.getRefreshToken();

            try {
                if (refreshToken) {
                    await api.request('auth-logout', {
                        refresh_token: refreshToken
                    });
                }
            } catch (error) {
                console.error('Logout error:', error);
            } finally {
                api.clearAuth();
            }
        },

        async verifyToken() {
            try {
                const result = await api.request('auth-verify_token');

                // Effective permissions can change without a new login — a
                // temporary grant starts when an admin approves a request and
                // lapses on its own hours later. This call runs on every dashboard
                // page load, so it is where the cached bdc_user is brought back
                // into step. UI-only: the backend is still the enforcement point.
                if (result.success && result.data && result.data.user) {
                    const fresh = result.data.user;
                    const stored = api.getUser() || {};
                    api.setUser({
                        ...stored,
                        ...fresh,
                        // Never let a stale cached list survive a fresh answer.
                        permissions: fresh.permissions || [],
                        roles: fresh.roles || stored.roles || [],
                        temporary_access: fresh.temporary_access || []
                    });
                }

                return result.success;
            } catch (error) {
                console.error('Token verification error:', error);
                return false;
            }
        },

        async changePassword(currentPassword, newPassword, confirmPassword) {
            return await api.request('auth-change_password', {
                current_password: currentPassword,
                new_password: newPassword,
                confirm_password: confirmPassword
            });
        }
    },

    // Dashboard endpoints
    dashboard: {
        async getData() {
            return await api.request('dashboard-get_data');
        },

        async getAdminData() {
            return await api.request('dashboard-get_admin_data');
        },

        async getLogs(params = {}) {
            return await api.request('dashboard-get-logs', params);
        }
    },

    // Component management endpoints
    components: {
        async list(componentType, params = {}) {
            return await api.request(`${componentType}-list`, params);
        },

        async get(componentType, id) {
            return await api.request(`${componentType}-get`, { id: id });
        },

        async add(componentType, data) {
            return await api.request(`${componentType}-add`, data);
        },

        async update(componentType, id, data) {
            return await api.request(`${componentType}-update`, {
                id: id,
                ...data
            });
        },

        async delete(componentType, id) {
            return await api.request(`${componentType}-delete`, { id: id });
        },

        async bulkUpdate(componentType, ids, updates) {
            return await api.request(`${componentType}-bulk_update`, {
                ids: ids,
                ...updates
            });
        },

        async getJSONData(componentType) {
            return await api.request(`${componentType}-get_json_data`);
        }
    },

    /**
     * Raising a change as a Request instead of performing it.
     *
     * A user without the permission for something does not ask to BE GIVEN that
     * permission — they ask for the work to be DONE. They fill in the same form
     * they would have used anyway; if they cannot perform it, it is submitted
     * here, an admin approves, and the backend performs it on their behalf. They
     * never gain access to anything.
     *
     * The backend is the authority on what a request may contain: every action
     * is shape-checked against RequestActionExecutor's registry and the
     * command-backed ones are dry-run through the real validation engine, so an
     * impossible request is refused at submit time rather than after it has cost
     * someone an approval.
     */
    requests: {
        /** Cached type list — the create path needs the stages to find a host type. */
        _types: null,

        async types() {
            if (this._types) return this._types;
            const result = await api.request('pipeline-template-list', { include_stages: 'true' });
            this._types = (result && result.data && result.data.templates) || [];
            return this._types;
        },

        /**
         * The active request type whose approval step is allowed to perform
         * this action. Types are data, not code — nothing here looks one up by
         * name, so an admin can rename or re-word them freely.
         *
         * @returns {object|null}
         */
        async typeForAction(actionType) {
            const types = await this.types();
            return types.find(t => (t.stages || []).some(s => {
                if (s.effect_type !== 'execute_request' || !s.effect_config) return false;
                try {
                    const config = typeof s.effect_config === 'string'
                        ? JSON.parse(s.effect_config)
                        : s.effect_config;
                    return Array.isArray(config.action_types) && config.action_types.includes(actionType);
                } catch (e) {
                    return false;
                }
            })) || null;
        },

        /**
         * Submit one action as a request.
         *
         * @param {string} actionType  a RequestActionExecutor registry key
         * @param {object} payload     that action's parameters
         * @param {object} meta        { title, description, priority, target_server_uuid }
         */
        async submitAction(actionType, payload, meta = {}) {
            const type = await this.typeForAction(actionType);
            if (!type) {
                throw new Error(
                    'No active request type can perform this yet. Ask an administrator to add one.'
                );
            }

            const fields = {
                pipeline_template_id: type.id,
                title: (meta.title || '').slice(0, 255),
                description: meta.description || '',
                priority: meta.priority || 'medium',
                actions: JSON.stringify([{ action_type: actionType, payload: payload }])
            };
            if (meta.target_server_uuid) {
                fields.target_server_uuid = meta.target_server_uuid;
            }

            return await api.request('pipeline-create', fields);
        }
    },

    vendors: {
        async list() {
            return await api.request('vendor-list');
        },
        async get(id) {
            return await api.request('vendor-get', { id });
        },
        async add(data) {
            return await api.request('vendor-add', data);
        },
        async update(id, data) {
            return await api.request('vendor-update', { id, ...data });
        },
        async delete(id) {
            return await api.request('vendor-delete', { id });
        },
        async getComponents(id) {
            return await api.request('vendor-components', { id });
        }
    },

    servers: {
        // rack_position is NOT passed here: it is derived server-side from the real
        // rack_servers placement (see rack-assign-server), never typed by hand.
        // isSandbox creates a Compatibility Bench build instead of a server: it implies
        // is_virtual server-side, so nothing it holds is reserved or marked in_use.
        async createConfig(serverName, description, startWith, isVirtual, location, isSandbox = false) {
            const requestData = {
                server_name: serverName,
                description: description,
                is_virtual: isVirtual
            };

            if (isSandbox) {
                requestData.is_sandbox = 'true';
            }

            // Only include start_with if it's provided and not null
            if (startWith !== null && startWith !== undefined) {
                requestData.start_with = startWith;
            }

            // Only include location if provided
            if (location) {
                requestData.location = location;
            }

            utils.logger.log('API createConfig called with:', {
                serverName,
                description,
                startWith,
                isVirtual,
                location,
                requestData
            });

            return await api.request('server-create-start', requestData);
        },

        async listConfigs(params = {}) {
            return await api.request('server-list-configs', params);
        },

        async searchBySerial(serialNumber) {
            return await api.request('server-search-by-serial', { serial_number: serialNumber });
        },

        async getConfig(configUuid) {
            return await api.request('server-get-config', { config_uuid: configUuid });
        },

        // Relocation history for one server -- where it has been, when, who moved
        // it and how many components travelled with it. Backed by
        // server_movements (seeder 2026_08_26_004); returns an empty list until
        // that seeder has been applied.
        async getMovements(configUuid, limit = 50) {
            return await api.request('server-movements', {
                config_uuid: configUuid,
                limit: String(limit)
            });
        },

        // Set the location of an UNRACKED server. A racked server takes its
        // location from its rack, and the backend refuses this for one (409) --
        // moving it is racks.assignServer().
        //
        // An empty locationUuid clears the location.
        async updateLocation(configUuid, locationUuid) {
            return await api.request('server-update-location', {
                config_uuid: configUuid,
                location_uuid: locationUuid || ''
            });
        },

        // force = the caller has already confirmed the bulk release of every
        // component still installed. Without it the backend refuses with 409.
        async deleteConfig(configUuid, force = false) {
            const payload = { config_uuid: configUuid };
            if (force) payload.force = '1';
            return await api.request('server-delete-config', payload);
        },

        async finalizeConfig(configUuid, notes = '') {
            return await api.request('server-finalize-config', {
                config_uuid: configUuid,
                notes: notes
            });
        },

        // The build's OWN attributes -- name, description, notes. Gated on
        // server.edit_details, NOT server.edit (which is about the PARTS inside).
        //
        // Two fields it deliberately does NOT carry:
        //   configuration_status -- a status change is transitionStatus(); the
        //     backend refuses it here so status_v2 can never drift from the
        //     legacy int.
        //   location -- updateLocation() is the canonical writer (it also sets
        //     location_uuid and re-stamps every installed component).
        // Only the keys present in `fields` are sent, so an omitted field is
        // left alone rather than blanked.
        async updateConfig(configUuid, fields = {}) {
            const payload = { config_uuid: configUuid };
            ['server_name', 'description', 'notes'].forEach(key => {
                if (fields[key] !== undefined) { payload[key] = fields[key]; }
            });
            return await api.request('server-update-config', payload);
        },

        // The lifecycle moves this user could make on this build RIGHT NOW, read
        // from config_status_transitions with the same ACL checker the command
        // itself uses. Ask before offering a status change -- the legal graph is
        // database data and must not be mirrored in JS.
        async allowedTransitions(configUuid) {
            return await api.request('server-allowed-transitions', { config_uuid: configUuid });
        },

        // Walk one lifecycle edge. toStatus is a status_v2 value ('draft',
        // 'building', ...), never the legacy int -- the command maps it. This is
        // also the way BACK out of finalized (finalized -> building / draft,
        // permission server.unfinalize).
        async transitionStatus(configUuid, toStatus, notes = '') {
            return await api.request('server-transition-status', {
                config_uuid: configUuid,
                to_status: toStatus,
                notes: notes
            });
        },

        async getCompatibleComponents(configUuid, componentType, availableOnly = true) {
            return await api.request('server-get-compatible', {
                config_uuid: configUuid,
                component_type: componentType,
                available_only: availableOnly.toString()
            });
        },

        async addComponent(configUuid, componentType, componentUuid, quantity = 1, slotPosition = '', override = false) {
            return await api.request('server-add-component', {
                config_uuid: configUuid,
                component_type: componentType,
                component_uuid: componentUuid,
                quantity: quantity.toString(),
                slot_position: slotPosition,
                override: override.toString()
            });
        },

        async removeComponent(configUuid, componentType, componentUuid) {
            return await api.request('server-remove-component', {
                config_uuid: configUuid,
                component_type: componentType,
                component_uuid: componentUuid
            });
        },

        async validateConfig(configUuid) {
            return await api.request('server-validate-config', { config_uuid: configUuid });
        },

        async getAvailableComponents(componentType, includeInUse = false, limit = 50) {
            return await api.request('server-get-available-components', {
                component_type: componentType,
                include_in_use: includeInUse.toString(),
                limit: limit.toString()
            });
        }
    },

    // Rack endpoints — used by the Create Server form to place a new server.
    // (The Rack View page has its own axios wrapper, rack/rack-api.js; this is the
    // same API through the dashboard's fetch layer, not a second layer.)
    racks: {
        async list() {
            return await api.request('rack-list');
        },

        async get(rackUuid) {
            return await api.request('rack-get', { rack_uuid: rackUuid });
        },

        // Place OR move a server. The backend treats both as the same upsert, and
        // since 2026-08-26 it also re-stamps the location/rack/U onto every
        // component installed in the server and writes a movement-history row.
        //
        // locationUuid is optional and only ever a CROSS-CHECK -- the rack already
        // determines the site. Sending one that disagrees with the rack is refused
        // rather than silently resolved, so what comes back can never describe a
        // place the user did not pick.
        //
        // rack_position is still NOT passed: it stays derived server-side.
        async assignServer(rackUuid, configUuid, startU, options = {}) {
            const payload = {
                rack_uuid: rackUuid,
                config_uuid: configUuid,
                start_u: startU.toString()
            };
            if (options.locationUuid) { payload.location_uuid = options.locationUuid; }
            if (options.reason) { payload.reason = options.reason; }
            return await api.request('rack-assign-server', payload);
        },

        // Where a server sits right now, plus the U-height it needs today (re-derived
        // from its chassis). The servers list only carries the derived "U12" text, so
        // the Change Rack Position dialog asks here before offering slots.
        async getPlacement(configUuid) {
            return await api.request('rack-placement', { config_uuid: configUuid });
        },

        async unassignServer(configUuid, reason = '') {
            const payload = { config_uuid: configUuid };
            if (reason) { payload.reason = reason; }
            return await api.request('rack-unassign-server', payload);
        }
    },

    // Location endpoints — the physical sites racks stand in.
    //
    // list() is deliberately open to every signed-in role: the Add Component
    // form, the Create Server form, the Bulk Update dialog and the location
    // filter on every inventory page all render a dropdown from it. The writes
    // are admin/super_admin and the backend enforces that.
    locations: {
        // includeCounts adds racks / servers / components per location for the
        // Objects column on the Locations page. Skip it everywhere else — it is
        // 14 extra grouped queries.
        async list(options = {}) {
            const payload = {};
            if (options.includeCounts) { payload.include_counts = '1'; }
            if (options.includeInactive) { payload.include_inactive = '1'; }
            return await api.request('location-list', payload);
        },

        async get(locationUuid) {
            return await api.request('location-get', { location_uuid: locationUuid });
        },

        // The racks at ONE location. This is what repopulates the Rack dropdown
        // when the Location dropdown changes in the Move Server dialog.
        async racks(locationUuid) {
            return await api.request('location-racks', { location_uuid: locationUuid });
        },

        async create(fields) {
            return await api.request('location-create', fields);
        },

        async update(locationUuid, fields) {
            return await api.request('location-update', { location_uuid: locationUuid, ...fields });
        },

        // reassignTo moves every rack, server and loose component at this
        // location to another one first. Without it the backend refuses the
        // delete (409) and names what is still there.
        async delete(locationUuid, reassignTo = '') {
            const payload = { location_uuid: locationUuid };
            if (reassignTo) { payload.reassign_to = reassignTo; }
            return await api.request('location-delete', payload);
        },

        /**
         * Fill a <select> with the active locations.
         *
         * Lives here rather than in three page scripts because four separate
         * forms need exactly this — the Create Server form, the Bulk Update
         * dialog, the Add Component form and the inventory location filter — and
         * the six-site list they replace was hardcoded in three of them, which is
         * how they drifted apart in the first place.
         *
         * Each option carries the NAME as its value and the uuid in data-uuid.
         * That is deliberate: these forms post the free-text `Location` column
         * that every existing reader uses, and the uuid rides alongside so the
         * row also gets its real foreign key. Reading `selectedOptions[0].dataset.uuid`
         * is how a caller picks it up.
         *
         * Fails quietly to a disabled select. A location list that cannot load
         * must not stop someone filing a component — the field is optional.
         *
         * @returns {boolean} whether any location was loaded.
         */
        async populateSelect(selectEl, options = {}) {
            if (!selectEl) return false;

            const placeholder = options.placeholder || '-- Select Location --';
            const selectedName = options.selectedName || '';

            selectEl.innerHTML = `<option value="">Loading locations…</option>`;
            selectEl.disabled = true;

            let locations = [];
            try {
                const result = await api.locations.list();
                locations = (result?.success && result.data?.locations) || [];
            } catch (error) {
                // 503 until the migration is applied; anything else is a real
                // failure. Either way the form stays usable.
                locations = [];
            }

            if (!locations.length) {
                selectEl.innerHTML = `<option value="">No locations available</option>`;
                selectEl.disabled = true;
                return false;
            }

            const esc = (window.utils && utils.escapeHtml) ? utils.escapeHtml : (v => String(v));
            selectEl.innerHTML = `<option value="">${esc(placeholder)}</option>` + locations.map(loc => {
                const selected = selectedName && loc.name === selectedName ? ' selected' : '';
                return `<option value="${esc(loc.name)}" data-uuid="${esc(loc.location_uuid)}"${selected}>${esc(loc.name)}</option>`;
            }).join('');
            selectEl.disabled = false;
            return true;
        },

        /** The uuid behind the currently selected option, or ''. */
        selectedUuid(selectEl) {
            const option = selectEl && selectEl.selectedOptions && selectEl.selectedOptions[0];
            return (option && option.dataset && option.dataset.uuid) || '';
        }
    },

    // Search endpoints
    search: {
        async global(query, params = {}) {
            return await api.request('search-global', {
                q: query,
                ...params
            });
        },

        async advanced(filters) {
            return await api.request('search-advanced', filters);
        }
    },

    // User management endpoints (for future use)
    users: {
        async list(params = {}) {
            return await api.request('users-list', params);
        },

        async get(id) {
            return await api.request('users-get', { user_id: id });
        },

        async create(data) {
            return await api.request('users-create', data);
        },

        async update(id, data) {
            return await api.request('users-update', {
                user_id: id,
                ...data
            });
        },

        async delete(id) {
            return await api.request('users-delete', { user_id: id });
        },

        async resetPassword(id, newPassword = null, sendEmail = true) {
            return await api.request('users-reset_password', {
                id: id,
                new_password: newPassword,
                send_email: sendEmail
            });
        },

        async manageRoles(userId, roleIds, replace = true) {
            return await api.request('users-manage_roles', {
                user_id: userId,
                roles: roleIds,
                replace: replace
            });
        }
    },

    // ACL & Roles management endpoints
    acl: {
        // Get all roles
        async getAllRoles() {
            return await api.request('acl-get_all_roles');
        },

        // Get all permissions (grouped by category)
        async getAllPermissions(grouped = true) {
            return await api.request('permissions-get_all', {
                grouped: grouped ? 'true' : 'false'
            });
        },

        // Get user permissions
        async getUserPermissions(userId) {
            return await api.request('acl-get_user_permissions', {
                user_id: userId
            });
        },

        // Create new role
        async createRole(roleData) {
            return await api.request('roles-create', {
                name: roleData.name,
                display_name: roleData.display_name,
                description: roleData.description,
                basic_permissions: roleData.basic_permissions || 'false'
            });
        },

        // Get role details with permissions
        async getRole(roleId) {
            return await api.request('roles-get', { id: roleId });
        },

        // Update role information
        async updateRole(roleId, roleData) {
            return await api.request('roles-update', {
                id: roleId,
                display_name: roleData.display_name,
                description: roleData.description,
                is_default: roleData.is_default ? 'true' : 'false'
            });
        },

        // Update role permissions
        async updateRolePermissions(roleId, permissionIds) {
            const params = { role_id: roleId };

            // Format: permissions[id]=1 for each permission
            permissionIds.forEach(id => {
                params[`permissions[${id}]`] = '1';
            });

            return await api.request('roles-update_permissions', params);
        },

        // Assign role to user
        async assignRole(userId, roleId) {
            return await api.request('roles-assign', {
                user_id: userId,
                role_id: roleId
            });
        },

        // Remove role from user
        async removeRole(userId, roleId) {
            return await api.request('roles-remove_user', {
                user_id: userId,
                role_id: roleId
            });
        },

        // Delete role
        async deleteRole(roleId) {
            return await api.request('roles-delete', { id: roleId });
        }
    },

    // Utility methods
    utils: {
        // Check if user is authenticated
        isAuthenticated() {
            return !!api.getToken();
        },

        // UI-ONLY: hasPermission() controls what UI elements are shown or hidden.
        // It is NOT a security control. Users can manipulate sessionStorage to bypass
        // these checks. All permission enforcement must happen server-side.
        hasPermission(permission) {
            const user = api.getUser();

            if (!user) {
                return false;
            }

            // Superadmin bypasses all permission checks
            const isSuperadmin = this.hasRole('super_admin');

            if (isSuperadmin) {
                return true;
            }

            // Check permissions array. A '*' entry means "all permissions"
            // (admin role); treat it as a wildcard match.
            if (!user.permissions) {
                return false;
            }
            return user.permissions.includes('*') || user.permissions.includes(permission);
        },

        // UI-ONLY: hasRole() controls UI visibility only, not server-side access.
        // Server-side role enforcement must be implemented in the backend API.
        hasRole(roles) {
            const user = api.getUser();
            if (!user) {
                return false;
            }

            // Build list of user's role names
            let userRoles = [];

            // Check roles array (array of objects with 'name' property)
            if (user.roles && Array.isArray(user.roles)) {
                userRoles = user.roles.map(role =>
                    typeof role === 'string' ? role : (role.name || '')
                );
            }

            // Also check primary_role field
            if (user.primary_role) {
                const primaryRoleName = typeof user.primary_role === 'string'
                    ? user.primary_role
                    : (user.primary_role.name || '');
                if (primaryRoleName && !userRoles.includes(primaryRoleName)) {
                    userRoles.push(primaryRoleName);
                }
            }

            // Also check role field (single role)
            if (user.role) {
                const roleName = typeof user.role === 'string'
                    ? user.role
                    : (user.role.name || '');
                if (roleName && !userRoles.includes(roleName)) {
                    userRoles.push(roleName);
                }
            }

            if (userRoles.length === 0) {
                return false;
            }

            return Array.isArray(roles)
                ? roles.some(role => userRoles.includes(role))
                : userRoles.includes(roles);
        },

        // Get user's primary role
        getPrimaryRole() {
            const user = api.getUser();
            return user ? user.primary_role : null;
        },

        // Format API error message
        formatError(result) {
            if (result.message) {
                return result.message;
            }

            if (result.errors && typeof result.errors === 'object') {
                return Object.values(result.errors).flat().join(', ');
            }

            return 'An unexpected error occurred';
        },

        // Handle API response with automatic error display
        async handleResponse(apiCall, successMessage = null, errorTitle = 'Error') {
            try {
                utils.showLoading(true);
                const result = await apiCall;

                if (result.success) {
                    if (successMessage) {
                        utils.showAlert(successMessage, 'success');
                    }
                    return result;
                } else {
                    const errorMessage = this.formatError(result);
                    utils.showAlert(errorMessage, 'error', errorTitle);
                    throw new Error(errorMessage);
                }
            } catch (error) {
                if (error.message !== this.formatError({ message: error.message })) {
                    utils.showAlert('Network error or server unavailable', 'error', 'Connection Error');
                }
                throw error;
            } finally {
                utils.showLoading(false);
            }
        }
    }
};

// Initialize API authentication check on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Skip auth check if on login page
    if (window.location.pathname.includes('login')) {
        return;
    }

    // Check if user is authenticated
    if (!api.utils.isAuthenticated()) {
        // Redirect to login if not authenticated
        window.location.href = api.loginURL;
        return;
    }

    // Verify token is still valid
    const isValid = await api.auth.verifyToken();
    if (!isValid) {
        // Try to refresh token
        const refreshed = await api.refreshToken();
        if (!refreshed) {
            // Redirect to login if refresh failed
            api.handleAuthFailure();
        }
    }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
