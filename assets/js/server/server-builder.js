/**
 * Server Builder
 * Modern interface for building server configurations
 */

class ServerBuilder {
    // Shared JSON cache across instances - avoids re-fetching static reference data
    static jsonCache = new Map();

    static async fetchJSON(url) {
        if (ServerBuilder.jsonCache.has(url)) {
            return ServerBuilder.jsonCache.get(url);
        }
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch ${url}`);
        const data = await response.json();
        ServerBuilder.jsonCache.set(url, data);
        return data;
    }

    constructor() {
        this.loginURL = window.BDC_CONFIG?.FRONTEND_LOGIN_URL || 'https://ims.bdcms.bharatdatacenter.com/';
        this.currentConfig = null;
        this.motherboardDetails = null; // Will store motherboard JSON data
        this.networkConfig = null; // Will store network/NIC config from API
        this.storageConnectivity = null; // Will store storage_connectivity from API
        this.slotAssignments = null; // Will store hardware.slots from API (pcie, riser, m2)
        this.selectedComponents = {
            cpu: [],
            motherboard: [],
            ram: [],
            storage: [],
            chassis: [],
            caddy: [],
            pciecard: [],
            risercard: [],
            nic: [],
            hbacard: [],
            sfp: []
        };

        // The catalog lives in BuildState, which also owns the question of which
        // of these 11 types the current build can actually accept.
        this.componentTypes = BuildState.COMPONENT_CATALOG;

        // Replaced on every load with the server's view of this build. Until
        // then, an empty state means "no opinion" — every type visible.
        this.buildState = new BuildState({});

        this.compatibilityIssues = [];
        this.performanceWarnings = [];

        // Server compute platform picker state (modal-scoped)
        this.selectedPlatformUuid = null;
        this.selectedVersionUuid = null;
        this.platformCatalog = null; // what the search filters over

        // UI state that must survive re-renders (collapsible sections, popover wiring)
        this.sectionCollapsed = {};
        this._popoverListenerAttached = false;

        // Set from the loaded config (see loadExistingConfig). Defaults false so a
        // builder that has not loaded anything behaves exactly as a real build.
        this.isSandbox = false;

        this.loading = false;
        this.init();
    }

    async init() {

        // Check authentication
        if (!this.checkAuthentication()) {
            return;
        }

        await this.loadServerConfig();
    }

    /**
     * Check if user is authenticated
     */
    checkAuthentication() {
        const token = localStorage.getItem('bdc_token') || sessionStorage.getItem('bdc_token');

        if (!token) {
            sessionStorage.removeItem('bdc_token');
            sessionStorage.removeItem('jwt_token');
            sessionStorage.removeItem('bdc_refresh_token');
            sessionStorage.removeItem('bdc_user');
            localStorage.removeItem('bdc_token');
            localStorage.removeItem('bdc_refresh_token');
            localStorage.removeItem('bdc_user');
            localStorage.removeItem('bdc_remember_me');
            window.location.href = this.loginURL;
            return false;
        }

        return true;
    }

    /**
     * Load server configuration from URL parameters
     */
    async loadServerConfig() {
        const urlParams = new URLSearchParams(window.location.search);
        const configUuid = urlParams.get('config');


        if (configUuid) {
            await this.loadExistingConfig(configUuid);
        } else {
            if (window.location.pathname.includes('builder')) {
                window.location.href = 'index.html';
            }
        }
    }

    /**
     * Load existing configuration from API
     */
    async loadExistingConfig(configUuid) {
        if (this.loading) return;

        try {
            this.loading = true;
            this.showLoading('Loading server configuration...');

            // Check if serverAPI is available
            if (typeof serverAPI === 'undefined') {
                console.error('serverAPI is not available!');
                this.showAlert('Server API not available', 'danger');
                this.renderErrorState('Server API not available. Please refresh the page.');
                this.hideLoading();
                return;
            }

            const result = await serverAPI.getServerConfig(configUuid);

            if (result.success && result.data) {
                // Handle new format where configuration and components are siblings in data
                // result.data = { configuration: {...}, components: {...}, ... }
                const configData = result.data.configuration || result.data;
                this.currentConfig = configData;

                // Compatibility Bench build (Server Compatibility section). The backend
                // guarantees such a config is also is_virtual, so it reserves nothing and
                // flips no component to in_use. Everything gated on this flag below is
                // presentation and navigation only — the verdicts stay the real engine's.
                this.isSandbox = configData.is_sandbox === true
                    || configData.is_sandbox === 1
                    || configData.is_sandbox === '1';

                // Pass the object that contains the 'components' key
                // In new format, it is result.data
                // In old format, it might have been result.data or result.data.configuration
                // We prefer result.data if it has components, otherwise fall back
                const dataWithComponents = result.data.components ? result.data : configData;

                // Wrap the payload: owns which component types this build can
                // accept, and which of those still have free capacity.
                this.buildState = new BuildState(result.data);

                // Store network config for onboard NIC details lookup
                this.networkConfig = this.buildState.network;
                // Store storage connectivity for drive bay display
                this.storageConnectivity = this.buildState.storageConnectivity;
                // Store slot assignments for correct PCIe/riser/M.2 mapping
                this.slotAssignments = this.buildState.slots;

                await this.parseExistingComponents(dataWithComponents);
                this.renderServerBuilderInterface();
            } else {
                console.error('Failed to load configuration:', result);
                this.showAlert(result.message || 'Failed to load configuration', 'danger');
                this.renderErrorState(result.message || 'Failed to load configuration');
            }
        } catch (error) {
            console.error('Error loading configuration:', error);
            this.showAlert(error.message || 'Failed to load server configuration', 'danger');
            this.renderErrorState('Failed to load server configuration. Please try again.');
        } finally {
            this.hideLoading();
            this.loading = false;
        }
    }

    /**
     * Render error state when configuration fails to load
     */
    renderErrorState(errorMessage) {
        const targetElement = document.getElementById('serverBuilderContent') || document.getElementById('app');
        if (targetElement) {
            targetElement.innerHTML = `
                <div class="flex flex-col items-center justify-center py-16 px-6">
                    <div class="bg-surface-card border border-border-light rounded-xl p-8 max-w-md w-full text-center">
                        <div class="w-16 h-16 mx-auto mb-4 bg-danger/10 rounded-full flex items-center justify-center">
                            <i class="fas fa-exclamation-triangle text-3xl text-danger"></i>
                        </div>
                        <h3 class="text-xl font-semibold text-text-primary mb-2">Failed to Load Configuration</h3>
                        <p class="text-text-secondary mb-6">${this.escapeHtml(errorMessage)}</p>
                        <div class="flex flex-col gap-3">
                            <button class="w-full px-4 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-600 transition-colors flex items-center justify-center gap-2" onclick="window.location.reload()">
                                <i class="fas fa-redo"></i>
                                Retry
                            </button>
                            <button class="w-full px-4 py-2.5 bg-surface-hover text-text-secondary rounded-lg font-medium hover:bg-border transition-colors flex items-center justify-center gap-2" onclick="window.location.href='index.html'">
                                <i class="fas fa-arrow-left"></i>
                                Back to Server List
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Parse existing components from configuration
     */
    // async parseExistingComponents(config) {

    //     // Reset components first
    //     this.selectedComponents = {
    //         cpu: [],
    //         motherboard: [],
    //         ram: [],
    //         storage: [],
    //         chassis: [],
    //         caddy: [],
    //         pciecard: [],
    //         nic: [],
    //         hbacard: []
    //     };

    //     // Parse components from the API structure
    //     if (config.components) {
    //         const components = config.components;

    //         Object.keys(components).forEach(type => {
    //             const typeComponents = components[type];

    //             if (Array.isArray(typeComponents) && typeComponents.length > 0) {
    //                 this.selectedComponents[type] = typeComponents.map(comp => ({
    //                     uuid: comp.uuid,
    //                     serial_number: comp.serial_number || 'Not Found',
    //                     quantity: comp.quantity || 1,
    //                     slot_position: comp.slot_position || '',
    //                     added_at: comp.added_at || ''
    //                 }));

    //             }
    //         });
    //     }

    //     // Load motherboard details from JSON if motherboard is selected
    //     if (this.selectedComponents.motherboard.length > 0) {
    //         await this.loadMotherboardDetails(this.selectedComponents.motherboard[0].uuid);
    //     }

    //     this.checkCompatibility();
    // }
    /**
     * Parse existing components from configuration
     */
    async parseExistingComponents(config) {
        // Reset components first
        this.selectedComponents = {
            cpu: [],
            motherboard: [],
            ram: [],
            storage: [],
            chassis: [],
            caddy: [],
            pciecard: [],
            risercard: [],
            nic: [],
            hbacard: [],
            sfp: []
        };

        // Parse components from the API structure
        if (config.components) {
            const components = config.components;

            Object.keys(components).forEach(type => {
                const typeComponents = components[type];

                if (Array.isArray(typeComponents) && typeComponents.length > 0) {
                    this.selectedComponents[type] = typeComponents.map(comp => ({
                        uuid: comp.uuid,
                        // Keep an absent serial as null. Substituting a string here
                        // defeats every `component_name || serial_number || 'Component'`
                        // fallback downstream, which made serial-less units render
                        // with the literal name "Not Found".
                        serial_number: comp.serial_number || null,
                        component_name: comp.component_name || null,
                        quantity: comp.quantity || 1,
                        slot_position: comp.slot_position || '',
                        added_at: comp.added_at || '',
                        parent_nic_uuid: comp.parent_nic_uuid || null,
                        port_index: comp.port_index ?? null
                    }));
                }
            });
        }

        // The board's spec comes with the payload, already resolved -- no lookup here.
        this.adoptMotherboardSpec(this.buildState.motherboardSpec);

        // Load chassis details from JSON if chassis is selected
        if (this.selectedComponents.chassis.length > 0) {
            this.chassisDetails = await this.loadChassisDetails(this.selectedComponents.chassis[0].uuid);
        }

        this.checkCompatibility();

        // Sidebar counts should show inventory totals, not build-specific counts
        // this.updateSidebarCounts();
    }

    /**
     * Update sidebar component counts
     * This updates the count badges in the sidebar to reflect the current configuration
     */
    updateSidebarCounts() {
        const countElements = {
            'cpu': document.getElementById('cpuCount'),
            'ram': document.getElementById('ramCount'),
            'storage': document.getElementById('storageCount'),
            'motherboard': document.getElementById('motherboardCount'),
            'nic': document.getElementById('nicCount'),
            'caddy': document.getElementById('caddyCount'),
            'chassis': document.getElementById('chassisCount'),
            'pciecard': document.getElementById('pciecardCount'),
            'risercard': document.getElementById('risercardCount'),
            'sfp': document.getElementById('sfpCount'),
            'hbacard': document.getElementById('hbacardCount'),
            'servers': document.getElementById('serversCount')
        };

        for (const [type, element] of Object.entries(countElements)) {
            if (element && this.selectedComponents[type]) {
                element.textContent = this.selectedComponents[type].length;
            }
        }
    }
    /**
     * Render chassis details - Dynamic based on chassis JSON
     */
    renderChassisDetails() {
        const chassisComponents = this.selectedComponents.chassis || [];
        const chassisData = this.chassisDetails;

        if (!chassisData) {
            // Fallback if no chassis JSON data — show what we know from inventory
            if (chassisComponents.length === 0) return '';
            return `
            <div class="hw-specs">
                ${chassisComponents.map(chassis => `
                <div class="hw-spec">
                    <span class="hw-spec-k">Serial</span>
                    <span class="hw-spec-v">${this.escapeHtml(chassis.serial_number || '—')}</span>
                </div>`).join('')}
            </div>`;
        }

        // Render detailed chassis information as a spec strip
        return `
        <div class="hw-specs">
            <div class="hw-spec">
                <span class="hw-spec-k">Model</span>
                <span class="hw-spec-v" title="${this.escapeHtml(`${chassisData.brand || ''} ${chassisData.series || ''}`.trim())}">${this.escapeHtml(chassisData.model || '—')}</span>
            </div>
            <div class="hw-spec">
                <span class="hw-spec-k">Form Factor</span>
                <span class="hw-spec-v">${this.escapeHtml(chassisData.form_factor || '—')} · ${chassisData.u_size}U</span>
            </div>
            <div class="hw-spec">
                <span class="hw-spec-k">Drive Bays</span>
                <span class="hw-spec-v">${chassisData.drive_bays.total_bays} total</span>
            </div>
            ${this.renderDriveBays(chassisData.drive_bays)}
            ${chassisData.backplane ? `
            <div class="hw-spec">
                <span class="hw-spec-k">Backplane</span>
                <span class="hw-spec-v" title="${this.escapeHtml(chassisData.backplane.model || '')}">${this.escapeHtml(chassisData.backplane.model || '—')}</span>
            </div>
            <div class="hw-spec">
                <span class="hw-spec-k">Interface</span>
                <span class="hw-spec-v">${this.escapeHtml(chassisData.backplane.interface || '—')}</span>
            </div>
            ` : ''}
            ${chassisData.power_supply ? `
            <div class="hw-spec">
                <span class="hw-spec-k">Power Supply</span>
                <span class="hw-spec-v">${chassisData.power_supply.wattage}W${chassisData.power_supply.redundant ? ' · Redundant' : ''}</span>
            </div>
            ` : ''}
        </div>
        `;
    }

    /**
     * Render drive bays configuration (spec tiles inside the chassis strip)
     */
    renderDriveBays(driveBays) {
        if (!driveBays.bay_configuration) return '';

        return driveBays.bay_configuration.map(bay => `
        <div class="hw-spec">
            <span class="hw-spec-k">${this.escapeHtml(bay.bay_type.replace(/_/g, ' '))}</span>
            <span class="hw-spec-v">${bay.count} bays${bay.hot_swap ? ' · Hot-swap' : ''}</span>
        </div>
        `).join('');
    }
    /**
     * Load motherboard details from JSON
     */
    // async loadMotherboardDetails(uuid) {
    //     try {
    //         // Fetch motherboard JSON
    //         const response = await fetch('/ims-data/motherboard/motherboard-level-3.json');
    //         if (!response.ok) {
    //             console.error('Failed to fetch motherboard JSON');
    //             return;
    //         }

    //         const motherboardData = await response.json();

    //         // Search for the motherboard by UUID
    //         for (const brand of motherboardData) {
    //             if (brand.models) {
    //                 for (const model of brand.models) {
    //                     if (model.uuid === uuid) {
    //                         this.motherboardDetails = {
    //                             brand: brand.brand,
    //                             series: brand.series,
    //                             family: brand.family,
    //                             chassisSocket: model.form_factor || 'ATX',
    //                             ...model
    //                         };
    //                         console.log('Loaded motherboard details:', this.motherboardDetails);
    //                         return;
    //                     }
    //                 }
    //             }
    //         }

    //         console.warn('Motherboard UUID not found in JSON:', uuid);
    //     } catch (error) {
    //         console.error('Error loading motherboard details:', error);
    //     }
    // }
    /**
     * Adopt the board spec the backend resolved for this build.
     *
     * This used to fetch ims-data/motherboard/motherboard-level-3.json and search it
     * by UUID -- a third spec resolver, alongside the backend's two. A board that
     * comes inside a server compute platform is described in serverplatform/, not in
     * that catalog, so the search found nothing, `motherboardDetails` stayed null,
     * and every board figure below silently fell back to a literal: 4 DIMM slots on
     * a 24-slot R630, 1 socket on a 2-socket board, "288-pin DIMM" for DDR4 ECC.
     *
     * The backend resolves platform-owned and catalog boards through one call and
     * now publishes the result as hardware.motherboard_spec, so the UI no longer
     * parses ims-data at all and cannot disagree with the engine about the board.
     *
     * Shape is unchanged for every consumer: the spec body, plus the two derived
     * keys they read (`chassisSocket`, `caddySockets`).
     */
    /**
     * How many DIMM slots to draw, and what the section meter counts against.
     *
     * ONE total for both. They used to differ — the meter said
     * `memory.slots || Math.max(ramUsed, 4)` while the grid said
     * `memory.slots || 4` — so an unresolved board with 5 DIMMs installed read
     * "5/5" above a grid of 4 cells, with the 5th module rendered nowhere at all
     * (the grid indexes `ramComponents[i]` up to its own total).
     *
     * Never below what is installed, for the same reason: a slot figure the UI
     * cannot substantiate must not make real, removable hardware invisible.
     */
    memorySlotTotal() {
        const declared = Number(this.motherboardDetails?.memory?.slots) || 0;
        return Math.max(declared, this.selectedComponents.ram.length, 4);
    }

    /** CPU sockets to draw. Same contract as memorySlotTotal(). */
    cpuSocketTotal() {
        const declared = Number(this.motherboardDetails?.socket?.count) || 0;
        return Math.max(declared, this.selectedComponents.cpu.length, 1);
    }

    adoptMotherboardSpec(spec) {
        if (!spec) {
            this.motherboardDetails = null;
            return;
        }

        this.motherboardDetails = {
            chassisSocket: spec.form_factor || 'ATX',
            caddySockets: spec.caddy_sockets || [],
            ...spec
        };
    }

    /**
     * Render caddy sockets - Dynamic based on motherboard JSON
     */
    renderCaddySockets() {
        const caddyComponents = this.selectedComponents.caddy || [];
        const motherboardData = this.motherboardDetails;

        const caddySockets = motherboardData?.caddySockets || [];

        if (caddySockets.length === 0) {
            // Fallback if no caddy socket data
            const html = caddyComponents.map((caddy, index) => this.renderHwSlotRow({
                label: `Caddy Socket ${index + 1}`,
                component: { ...caddy, compType: 'caddy' },
                emptyType: 'caddy',
                icon: 'fas fa-box'
            })).join('');

            return html || this.renderHwSlotRow({
                label: 'Caddy Socket',
                emptyType: 'caddy'
            });
        }

        let html = '';
        caddySockets.forEach((socket, index) => {
            const caddy = caddyComponents[index];
            const socketType = socket.type || 'Caddy';

            html += this.renderHwSlotRow({
                label: `${socketType} Socket ${index + 1}`,
                badge: socket.size || '',
                component: caddy ? { ...caddy, compType: 'caddy' } : null,
                emptyType: 'caddy',
                icon: 'fas fa-box'
            });
        });

        return html;
    }
    /**
     * Check compatibility issues
     */
    checkCompatibility() {
        this.compatibilityIssues = [];
        this.performanceWarnings = [];

        // Check for missing required components. Only types the build can
        // actually accept are raised: an issue whose fix button is hidden would
        // be unresolvable. All four required types are base types today, so this
        // changes nothing now — it just can't rot if one ever becomes gated.
        this.buildState.visibleTypes().forEach(compType => {
            if (compType.required && this.selectedComponents[compType.type].length === 0) {
                this.compatibilityIssues.push({
                    severity: 'critical',
                    type: 'missing_component',
                    icon: 'fas fa-exclamation-triangle',
                    title: `Missing ${compType.name}`,
                    message: `No ${compType.name} selected. Adding a ${compType.name.toLowerCase()} is required for the system to function.`,
                    details: `A ${compType.name.toLowerCase()} is essential for your server configuration. Without it, the system cannot operate properly.`,
                    links: [
                        { text: 'Learn about server components', url: 'guide/' },
                        { text: 'Server build guide', url: 'server-build-guide/' }
                    ],
                    action: {
                        text: `Add ${compType.name}`,
                        callback: () => this.addComponent(compType.type),
                        actionType: compType.type
                    },
                    group: 'required_components'
                });
            }
        });
    }

    // ---------------------------------------------------------------------
    // Server compute platform
    //
    // A platform is a shipped server product (HPE ProLiant DL360 Gen10) and the
    // system boards it can be built around. Picking the platform first narrows a
    // flat list of every motherboard in stock down to the handful that belong to
    // the machine actually being built. This replaced Import Template as the
    // builder's "start from something" entry point.
    // ---------------------------------------------------------------------

    /**
     * The compute platform control above the build.
     *
     * A platform is a physical box. Once one is installed, the board and chassis in this
     * build came out of it and cannot be changed on their own — so the only two things
     * offered here are changing the whole platform and removing it, and both say plainly
     * that they release the build.
     */
    renderPlatformButton() {
        const platformName = this.currentConfig?.platform_name;
        const hasPlatform = !!this.currentConfig?.platform_version_uuid;

        if (hasPlatform) {
            return `
                <div class="flex flex-wrap items-center justify-end gap-2 mb-4">
                    <span class="inline-flex items-center gap-2 px-4 py-2 bg-primary/5 border border-primary/10 text-primary rounded text-sm font-medium">
                        <i class="fas fa-server"></i>
                        ${this.escapeHtml(platformName || 'Compute platform')}
                    </span>
                    <button class="inline-flex items-center gap-2 px-3 py-2 bg-surface-card border border-border text-text-secondary rounded text-sm font-medium hover:text-primary hover:border-primary/50 transition-colors duration-150"
                            onclick="window.serverBuilder.openPlatformModal()"
                            title="Install a different platform. This releases everything in this build.">
                        <i class="fas fa-exchange-alt"></i>
                        Change
                    </button>
                    <button class="inline-flex items-center gap-2 px-3 py-2 bg-surface-card border border-border text-text-secondary rounded text-sm font-medium hover:text-danger hover:border-danger/50 transition-colors duration-150"
                            onclick="window.serverBuilder.removePlatform()"
                            title="Remove the platform. This releases everything in this build.">
                        <i class="fas fa-times"></i>
                        Remove
                    </button>
                </div>
            `;
        }

        // No platform: a custom build, assembled from loose inventory. Still a supported
        // way to build, so this is an offer, not a demand.
        return `
            <div class="flex justify-end mb-4">
                <button class="inline-flex items-center gap-2 px-4 py-2 bg-surface-card border border-border text-text-secondary rounded text-sm font-medium hover:text-primary hover:border-primary/50 transition-colors duration-150" onclick="window.serverBuilder.openPlatformModal()">
                    <i class="fas fa-server"></i>
                    Select Server Compute Platform
                </button>
            </div>
        `;
    }

    /**
     * Open the platform picker
     */
    async openPlatformModal() {
        const modalContainer = document.getElementById('modalContainer');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        const modalClose = document.getElementById('modalClose');

        if (!modalContainer || !modalTitle || !modalBody) {
            console.error('Modal container elements not found');
            this.showAlert('Error: Modal template not found', 'danger');
            return;
        }

        this.selectedPlatformUuid = null;
        this.selectedVersionUuid = null;

        modalTitle.innerHTML = `<i class="fas fa-server text-primary me-2"></i> Select Server Compute Platform`;
        modalBody.innerHTML = this.renderPlatformModalContent();

        modalContainer.classList.remove('hidden');
        requestAnimationFrame(() => {
            modalContainer.classList.add('active');
        });

        if (modalClose) {
            const newClose = modalClose.cloneNode(true);
            modalClose.parentNode.replaceChild(newClose, modalClose);
            newClose.onclick = () => this.closePlatformModal();
        }

        // Stock moves whenever anyone installs a platform, and a count that is one unit
        // stale is the difference between a version that installs and one that 409s.
        this.loadPlatforms(true);
    }

    /**
     * Modal shell.
     *
     * The height is fixed rather than driven by content. #modalBody is itself a
     * scroll container (max-h-[calc(90vh-120px)]), so content taller than that scrolls
     * the dialog as a single page — which drags the version pane and the confirm button
     * out of view while the user is still reading the platform list. Bounding the
     * height here keeps each pane scrolling on its own and the footer always on screen.
     *
     * Below `md` there is no room for two panes side by side, so the same markup
     * becomes a drill-down: platforms, then that platform's versions with a way back.
     */
    renderPlatformModalContent() {
        return `
            <div class="flex flex-col h-[600px] max-h-[calc(90vh-152px)]">
                <div class="flex flex-1 min-h-0 border border-border-light rounded-lg overflow-hidden bg-surface-card">

                    <!-- Platforms -->
                    <div class="flex md:flex flex-col w-full md:w-[38%] min-h-0 md:border-r border-border-light bg-surface-main" id="platformListPane">
                        <div class="flex-shrink-0 p-3 border-b border-border-light">
                            <div class="relative">
                                <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-xs"></i>
                                <input type="text" id="platformSearch" autocomplete="off"
                                       placeholder="Search platforms"
                                       oninput="window.serverBuilder.filterPlatforms(this.value)"
                                       class="w-full pl-8 pr-3 py-2 text-sm bg-surface-card border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary">
                            </div>
                        </div>
                        <div class="flex-1 overflow-y-auto p-2" id="platformList"></div>
                    </div>

                    <!-- Versions of the selected platform -->
                    <div class="hidden md:flex flex-col w-full md:w-[62%] min-h-0" id="platformVersionPane">
                        <div class="flex-shrink-0" id="platformVersionHeader"></div>
                        <div class="flex-1 overflow-y-auto p-4" id="platformVersions">
                            <div class="h-full flex flex-col items-center justify-center text-center text-text-secondary">
                                <i class="fas fa-server text-3xl mb-3 opacity-30"></i>
                                <p class="text-sm">Select a platform to see its versions</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Footer: always visible, so a selection never needs scrolling to confirm -->
                <div class="flex-shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 mt-4 border-t border-border-light">
                    <p class="text-sm text-text-secondary truncate" id="platformSelectionSummary">No version selected</p>
                    <div class="flex items-center justify-end gap-2 flex-shrink-0">
                        <button type="button"
                                class="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-lg border border-transparent transition-colors"
                                id="cancelPlatformBtn"
                                onclick="window.serverBuilder.closePlatformModal()">
                            Cancel
                        </button>
                        <button type="button"
                                class="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                id="applyPlatformBtn"
                                disabled
                                onclick="window.serverBuilder.confirmPlatformSelection()">
                            <i class="fas fa-plus-circle"></i>
                            <span>Install Platform</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Which pane is on screen below `md`. Both panes keep `md:flex`, so on wider
     * screens this is a no-op and the two stay side by side.
     */
    setPlatformPaneView(view) {
        const listPane = document.getElementById('platformListPane');
        const versionPane = document.getElementById('platformVersionPane');
        if (!listPane || !versionPane) return;

        const showList = view === 'list';
        listPane.classList.toggle('hidden', !showList);
        listPane.classList.toggle('flex', showList);
        versionPane.classList.toggle('hidden', showList);
        versionPane.classList.toggle('flex', !showList);
    }

    /** Back out of a platform's versions on narrow screens. */
    backToPlatformList() {
        this.setPlatformPaneView('list');
    }

    /**
     * Load the platform catalog via PlatformManager
     */
    async loadPlatforms(forceReload = false) {
        const listContainer = document.getElementById('platformList');

        if (typeof platformManager === 'undefined') {
            listContainer.innerHTML = '<p class="text-danger text-center p-3">PlatformManager not loaded. Check console.</p>';
            return;
        }

        listContainer.innerHTML = `
            <div class="text-center py-8 text-text-secondary">
                <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
                <p class="text-sm">Loading platforms...</p>
            </div>
        `;

        try {
            this.platformCatalog = await platformManager.getPlatforms(forceReload);
            this.renderPlatformList(this.platformCatalog);
        } catch (error) {
            console.error('Builder: Error loading platforms', error);
            listContainer.innerHTML = `<p class="text-danger text-center p-3">${this.escapeHtml(error.message || 'Failed to load platforms')}</p>`;
        }
    }

    /**
     * Narrow the list by brand, platform, version name, part number or bay layout.
     * Twenty-odd platforms is more than fits a pane, and scrolling for one you can
     * already name is the slow way round.
     */
    filterPlatforms(term) {
        const needle = (term || '').trim().toLowerCase();
        const catalog = this.platformCatalog || [];

        if (!needle) {
            this.renderPlatformList(catalog);
            return;
        }

        const matches = catalog.filter(platform => {
            const versionText = (platform.versions || []).flatMap(version => [
                version.version_name,
                version.model,
                version.part_number,
                version.bay_summary,
                version.board && version.board.model,
                version.chassis && version.chassis.model
            ]);

            const haystack = [
                platform.brand,
                platform.platform,
                platform.family,
                platform.form_factor,
                ...versionText
            ].filter(Boolean).join(' ').toLowerCase();

            return haystack.includes(needle);
        });

        this.renderPlatformList(matches, true);
    }

    /**
     * Platform list, grouped by brand
     */
    renderPlatformList(platforms, isFiltered = false) {
        const container = document.getElementById('platformList');
        if (!container) return;

        if (!platforms || platforms.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 px-3 text-text-secondary">
                    <i class="fas fa-${isFiltered ? 'search' : 'box-open'} text-2xl mb-2 opacity-40"></i>
                    <p class="text-sm">${isFiltered ? 'No platform matches that search' : 'No server platforms defined'}</p>
                </div>
            `;
            return;
        }

        const byBrand = {};
        platforms.forEach(platform => {
            const brand = platform.brand || 'Other';
            (byBrand[brand] = byBrand[brand] || []).push(platform);
        });

        container.innerHTML = Object.keys(byBrand).sort().map(brand => `
            <div class="mb-2">
                <div class="sticky top-0 z-10 bg-surface-main -mx-2 px-5 py-1.5 text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                    ${this.escapeHtml(brand)}
                </div>
                ${byBrand[brand].map(platform => `
                    <button type="button"
                            class="platform-item w-full text-left px-3 py-2.5 rounded-lg mb-1 border border-transparent hover:bg-surface-hover hover:border-border-light transition-colors"
                            onclick="window.serverBuilder.selectPlatform(${this.jsArg(platform.platform_uuid)})"
                            data-id="${this.escapeHtml(platform.platform_uuid)}">
                        <div class="flex items-center gap-2">
                            <span class="flex-1 min-w-0 truncate text-sm font-medium text-text-primary">${this.escapeHtml(platform.platform)}</span>
                            <i class="fas fa-chevron-right text-[10px] text-text-muted md:hidden"></i>
                        </div>
                        <div class="text-xs text-text-secondary mt-0.5">
                            ${platform.version_count
                                ? `${platform.version_count} version${platform.version_count === 1 ? '' : 's'}
                                   · ${platform.available_units > 0 ? `${platform.available_units} in stock` : 'no stock'}`
                                : 'No versions defined'}
                        </div>
                    </button>
                `).join('')}
            </div>
        `).join('');
    }

    /**
     * Select a platform and list its versions
     */
    selectPlatform(platformUuid) {
        // bg-primary/5, not the bg-surface-selected the template picker reaches for:
        // `surface-selected` is not a colour token in tailwind.config.js, so that class
        // has never resolved to anything.
        document.querySelectorAll('.platform-item').forEach(el => el.classList.remove('bg-primary/5', 'border-primary/20'));
        const selectedEl = document.querySelector(`.platform-item[data-id="${platformUuid}"]`);
        if (selectedEl) selectedEl.classList.add('bg-primary/5', 'border-primary/20');

        this.selectedPlatformUuid = platformUuid;
        this.selectedVersionUuid = null;

        const applyBtn = document.getElementById('applyPlatformBtn');
        if (applyBtn) applyBtn.disabled = true;
        this.updatePlatformSummary();
        this.setPlatformPaneView('versions');

        const platform = platformManager.getPlatform(platformUuid);
        if (!platform) {
            document.getElementById('platformVersionHeader').innerHTML = '';
            document.getElementById('platformVersions').innerHTML =
                '<p class="text-danger">Platform details unavailable</p>';
            return;
        }

        this.renderVersionList(platform);
    }

    /**
     * The chosen platform's versions.
     *
     * A version out of stock stays visible but unselectable, carrying the reason the
     * backend gave. A version that silently disappeared would read as "this platform has
     * fewer versions", which is a different and wrong statement.
     */
    renderVersionList(platform) {
        const header = document.getElementById('platformVersionHeader');
        const container = document.getElementById('platformVersions');
        const versions = platform.versions || [];

        // The header sits outside the scroll area: which platform you are looking at
        // stays put while its versions scroll.
        if (header) {
            header.innerHTML = `
                <div class="px-4 py-3 border-b border-border-light">
                    <button type="button"
                            class="md:hidden inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-primary transition-colors mb-2"
                            onclick="window.serverBuilder.backToPlatformList()">
                        <i class="fas fa-chevron-left text-[10px]"></i>
                        All platforms
                    </button>
                    <h4 class="text-base font-semibold text-text-primary truncate">${this.escapeHtml(platform.brand)} ${this.escapeHtml(platform.platform)}</h4>
                    <p class="text-xs text-text-secondary mt-0.5">
                        ${platform.form_factor ? `${this.escapeHtml(platform.form_factor)} · ` : ''}${versions.length} version${versions.length === 1 ? '' : 's'}
                    </p>
                </div>
            `;
        }

        if (!versions.length) {
            container.innerHTML = `
                <div class="h-full flex flex-col items-center justify-center text-center text-text-secondary px-6">
                    <i class="fas fa-box-open text-3xl mb-3 opacity-30"></i>
                    <p class="text-sm">No versions defined for this platform yet.</p>
                    <p class="text-xs mt-2 text-text-muted">A version needs its system board and chassis described in the platform catalog before it can be stocked or installed.</p>
                </div>
            `;
            return;
        }

        const versionHtml = versions.map(version => {
            const board = version.board || {};
            const chassis = version.chassis || {};
            const selectable = version.selectable;

            const status = selectable
                ? `<span class="text-primary">${version.available_units} in stock</span>`
                : `<span class="text-text-muted">${this.escapeHtml(version.unavailable_reason || 'Unavailable')}</span>`;

            const boardLine = [
                board.model ? this.escapeHtml(board.model) : '',
                board.socket_type ? `${this.escapeHtml(board.socket_type)} ×${board.socket_count || 1}` : '',
                board.memory_type && board.memory_slots ? `${this.escapeHtml(board.memory_type)} ${board.memory_slots} slots` : ''
            ].filter(Boolean).join(' · ');

            const chassisLine = [
                chassis.model ? this.escapeHtml(chassis.model) : '',
                version.bay_summary ? `${this.escapeHtml(version.bay_summary)} bays` : ''
            ].filter(Boolean).join(' · ');

            return `
                <button type="button"
                        class="version-item w-full text-left p-3 rounded-lg mb-2 border border-border-light bg-surface-card ${selectable ? 'hover:border-primary/50 transition-colors' : 'opacity-60 cursor-not-allowed'}"
                        ${selectable ? `onclick="window.serverBuilder.selectVersion(${this.jsArg(version.version_uuid)})"` : 'disabled'}
                        data-version="${this.escapeHtml(version.version_uuid || '')}">
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                            <div class="text-sm font-medium text-text-primary">${this.escapeHtml(version.version_name || version.model || 'Version')}</div>
                            ${version.part_number ? `<div class="text-xs text-text-secondary mt-0.5">P/N ${this.escapeHtml(version.part_number)}</div>` : ''}
                            ${boardLine ? `<div class="text-xs text-text-secondary mt-1"><i class="fas fa-microchip me-1 opacity-50"></i>${boardLine}</div>` : ''}
                            ${chassisLine ? `<div class="text-xs text-text-secondary mt-0.5"><i class="fas fa-server me-1 opacity-50"></i>${chassisLine}</div>` : ''}
                            ${version.included_nic ? `<div class="text-xs text-text-secondary mt-0.5"><i class="fas fa-network-wired me-1 opacity-50"></i>${this.escapeHtml(version.included_nic.model || 'Included network card')}</div>` : ''}
                            ${version.included_storage_controller ? `<div class="text-xs text-text-secondary mt-0.5"><i class="fas fa-hdd me-1 opacity-50"></i>${this.escapeHtml(version.included_storage_controller.model || 'Included storage controller')}</div>` : ''}
                        </div>
                        <div class="text-xs whitespace-nowrap">${status}</div>
                    </div>
                </button>
            `;
        }).join('');

        container.innerHTML = `
            ${versionHtml}
            <p class="text-xs text-text-secondary mt-3">
                <i class="fas fa-info-circle me-1"></i>
                Installing a platform takes one unit from stock and fits its system board and chassis into this build. Both are then part of the platform and can only be changed by changing the platform.
            </p>
        `;
    }

    /**
     * Select a version
     */
    selectVersion(versionUuid) {
        document.querySelectorAll('.version-item').forEach(el => el.classList.remove('bg-primary/5', 'border-primary/20'));
        const selectedEl = document.querySelector(`.version-item[data-version="${versionUuid}"]`);
        if (selectedEl) selectedEl.classList.add('bg-primary/5', 'border-primary/20');

        this.selectedVersionUuid = versionUuid;
        this.updatePlatformSummary();

        const applyBtn = document.getElementById('applyPlatformBtn');
        if (applyBtn) applyBtn.disabled = false;
    }

    /**
     * Name what the confirm button is about to do. The footer is the one part of the
     * dialog that never scrolls, so it is where the current selection belongs.
     */
    updatePlatformSummary() {
        const summary = document.getElementById('platformSelectionSummary');
        if (!summary) return;

        const platform = this.selectedPlatformUuid ? platformManager.getPlatform(this.selectedPlatformUuid) : null;

        if (!platform) {
            summary.textContent = 'No version selected';
            return;
        }

        const found = this.selectedVersionUuid ? platformManager.getVersion(this.selectedVersionUuid) : null;

        summary.textContent = found
            ? `${platform.brand} ${platform.platform} — ${found.version.version_name || found.version.model}`
            : `${platform.brand} ${platform.platform} — choose a version`;
    }

    /**
     * Install the selected version.
     *
     * The backend refuses with 409 `confirm_wipe_required` when the build already holds
     * components, naming them. That refusal is the confirmation prompt: the frontend
     * never decides on its own that releasing someone's parts is fine.
     */
    async confirmPlatformSelection() {
        if (!this.selectedVersionUuid) return;

        this.setPlatformBusy(true);

        try {
            let result = await platformManager.installPlatform(
                this.currentConfig.config_uuid,
                this.selectedVersionUuid,
                false
            );

            if (result.needsConfirmation) {
                const agreed = confirm(
                    `${result.message}\n\n` +
                    `Currently installed: ${result.installedSummary}\n\n` +
                    `These will be released back to available inventory. Continue?`
                );

                if (!agreed) {
                    this.setPlatformBusy(false);
                    return;
                }

                result = await platformManager.installPlatform(
                    this.currentConfig.config_uuid,
                    this.selectedVersionUuid,
                    true
                );
            }

            if (result.success) {
                this.closePlatformModal();
                await this.loadExistingConfig(this.currentConfig.config_uuid);

                const released = result.data.components_released || 0;
                this.showAlert(
                    released > 0
                        ? `${result.message}. ${released} component${released === 1 ? '' : 's'} released back to inventory.`
                        : result.message,
                    'success'
                );
            } else {
                this.showAlert(result.message, 'danger');
            }
        } catch (error) {
            console.error('Platform selection error:', error);
            this.showAlert(error.message || 'An unexpected error occurred while installing the platform.', 'danger');
        } finally {
            this.setPlatformBusy(false);
        }
    }

    /**
     * Remove the compute platform, releasing the whole build with it. Same 409
     * confirmation handshake as installing one.
     */
    async removePlatform() {
        try {
            this.showLoading('Removing compute platform...');

            let result = await platformManager.removePlatform(this.currentConfig.config_uuid, false);

            if (result.needsConfirmation) {
                this.hideLoading();

                const agreed = confirm(
                    `${result.message}\n\n` +
                    `Currently installed: ${result.installedSummary}\n\n` +
                    `These will be released back to available inventory. Continue?`
                );

                if (!agreed) return;

                this.showLoading('Removing compute platform...');
                result = await platformManager.removePlatform(this.currentConfig.config_uuid, true);
            }

            if (result.success) {
                await this.loadExistingConfig(this.currentConfig.config_uuid);
                this.showAlert(result.message, 'success');
            } else {
                this.showAlert(result.message, 'danger');
            }
        } catch (error) {
            console.error('Platform removal error:', error);
            this.showAlert(error.message || 'An unexpected error occurred while removing the platform.', 'danger');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Is this component type supplied by the installed compute platform, and therefore
     * not removable on its own? The backend is the authority — it reports platform_locked
     * on the configuration and refuses the action regardless of what the UI shows.
     */
    isPlatformLocked(componentType) {
        const locked = this.currentConfig?.platform_locked;
        return Array.isArray(locked) && locked.includes(componentType);
    }

    /**
     * Modal busy state
     */
    setPlatformBusy(isBusy) {
        const btn = document.getElementById('applyPlatformBtn');
        const cancelBtn = document.getElementById('cancelPlatformBtn');
        const closeBtn = document.getElementById('modalClose');

        if (!btn) return;

        if (isBusy) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>Installing...</span>`;
            if (cancelBtn) cancelBtn.classList.add('opacity-50', 'pointer-events-none');
            if (closeBtn) closeBtn.classList.add('pointer-events-none', 'opacity-50');
        } else {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-plus-circle"></i> <span>Install Platform</span>`;
            if (cancelBtn) cancelBtn.classList.remove('opacity-50', 'pointer-events-none');
            if (closeBtn) closeBtn.classList.remove('pointer-events-none', 'opacity-50');
        }
    }

    /**
     * Close the platform picker
     */
    closePlatformModal() {
        const modalContainer = document.getElementById('modalContainer');
        if (modalContainer) {
            modalContainer.classList.remove('active');
            setTimeout(() => {
                modalContainer.classList.add('hidden');
            }, 300); // Wait for transition
        }
        const modalBody = document.getElementById('modalBody');
        setTimeout(() => {
            if (modalBody) modalBody.innerHTML = '';
        }, 300);
    }

    /**
     * Render Import Template Button (Module Integration)
     *
     * RETIRED from the builder: the platform picker took this button's place.
     * TemplateManager and the import modal below are intentionally kept — they are
     * simply no longer reachable from this page.
     */
    renderImportButton() {
        return `
            <div class="flex justify-end mb-4">
                <button class="inline-flex items-center gap-2 px-4 py-2 bg-surface-card border border-border text-text-secondary rounded text-sm font-medium hover:text-primary hover:border-primary/50 transition-colors duration-150" onclick="window.serverBuilder.openImportModal()">
                    <i class="fas fa-file-import"></i>
                    Import Template
                </button>
            </div>
        `;
    }

    /**
     * Open Import Template Modal
     */
    async openImportModal() {
        const modalContainer = document.getElementById('modalContainer');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        const modalClose = document.getElementById('modalClose');

        if (!modalContainer || !modalTitle || !modalBody) {
            console.error('Modal container elements not found');
            this.showAlert('Error: Modal template not found', 'danger');
            return;
        }

        // Set Title
        modalTitle.innerHTML = `<i class="fas fa-file-import text-primary me-2"></i> Import Server Template`;

        // Set Content
        modalBody.innerHTML = this.renderImportModalContent();

        // Show Modal
        modalContainer.classList.remove('hidden');
        // Small delay to allow display:block to apply before adding opacity class for transition
        requestAnimationFrame(() => {
            modalContainer.classList.add('active');
        });

        // Attach Event Listeners
        if (modalClose) {
            // Remove old listeners to be safe (cloning)
            const newClose = modalClose.cloneNode(true);
            modalClose.parentNode.replaceChild(newClose, modalClose);
            newClose.onclick = () => this.closeImportModal();
        }

        this.loadTemplates();
    }

    /**
     * Load Templates via TemplateManager
     */
    async loadTemplates() {
        const listContainer = document.getElementById('templateList');

        if (typeof templateManager === 'undefined') {
            listContainer.innerHTML = '<p class="text-danger text-center p-3">TemplateManager not loaded. Check console.</p>';
            return;
        }

        try {
            listContainer.innerHTML = `
                <div class="text-center py-4 text-text-secondary">
                    <i class="fas fa-spinner fa-spin mb-2"></i>
                    <p class="text-sm">Loading templates...</p>
                </div>
            `;

            const templates = await templateManager.getTemplates();
            this.renderTemplateList(templates);

        } catch (error) {
            console.error('Builder: Error loading templates', error);
            listContainer.innerHTML = `<p class="text-danger text-center p-3">${error.message || 'Failed to load templates'}</p>`;
        }
    }

    /**
     * Render Template List
     */
    renderTemplateList(templates) {
        const container = document.getElementById('templateList');
        if (templates.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-text-secondary">
                    <i class="fas fa-box-open text-2xl mb-2 opacity-50"></i>
                    <p class="text-sm">No templates found</p>
                </div>
            `;
            return;
        }

        container.innerHTML = templates.map(t => `
            <div class="template-item p-3 rounded-lg cursor-pointer hover:bg-surface-hover transition-colors mb-2 border border-transparent hover:border-border-light group" 
                 onclick="window.serverBuilder.selectTemplate('${t.config_uuid}')"
                 data-id="${t.config_uuid}">
                <div class="font-medium text-text-primary group-hover:text-primary transition-colors">${this.escapeHtml(t.server_name)}</div>
                <div class="text-xs text-text-secondary truncate">${this.escapeHtml(t.description || 'No description')}</div>
            </div>
        `).join('');
    }

    /**
     * Select Template and Show Preview
     */
    async selectTemplate(uuid) {
        document.querySelectorAll('.template-item').forEach(el => el.classList.remove('bg-surface-selected', 'border-primary/20'));
        const selectedEl = document.querySelector(`.template-item[data-id="${uuid}"]`);
        if (selectedEl) selectedEl.classList.add('bg-surface-selected', 'border-primary/20');

        const importBtn = document.getElementById('importTemplateBtn');
        importBtn.disabled = true;
        importBtn.dataset.uuid = uuid;

        const previewContainer = document.getElementById('templatePreview');
        previewContainer.innerHTML = `
            <div class="h-full flex items-center justify-center text-primary">
                <i class="fas fa-spinner fa-spin text-2xl"></i>
            </div>
        `;

        try {
            // Preview Fetch (Direct API call ok for View)
            const result = await serverAPI.getServerConfig(uuid);
            if (result.success && result.data) {
                const config = {
                    ...(result.data.configuration || {}),
                    components: result.data.components || {}
                };

                // Resolve component names from JSON files before rendering
                await this.resolveTemplateComponentNames(config);

                this.renderTemplatePreview(config);
                importBtn.disabled = false;
            } else {
                previewContainer.innerHTML = '<p class="text-danger">Failed to load template details</p>';
            }
        } catch (error) {
            console.error('Preview error:', error);
            previewContainer.innerHTML = `<p class="text-danger">${error.message || 'Error loading template'}</p>`;
        }
    }

    /**
     * Resolve component names from local JSON files for template config
     */
    async resolveTemplateComponentNames(config) {
        const components = config.components || {};
        const types = Object.keys(components);

        for (const type of types) {
            const typeComponents = components[type];
            if (Array.isArray(typeComponents)) {
                for (const item of typeComponents) {
                    // Only resolve if we don't have a name/model
                    if (!item.component_name && !item.product_name && !item.name && !item.model) {
                        try {
                            item.resolved_name = await this.lookupComponentNameByUuid(type, item.uuid);
                        } catch (e) {
                            item.resolved_name = 'Unknown Component';
                        }
                    }
                }
            }
        }
    }

    /**
     * Lookup component name in local JSON files by UUID
     */
    async lookupComponentNameByUuid(type, uuid) {
        if (!uuid) return 'Unknown Component';

        // Map component types to their JSON resource files
        const jsonMaps = {
            'cpu': '/ims-data/cpu/Cpu-details-level-3.json',
            'motherboard': '/ims-data/motherboard/motherboard-level-3.json',
            'chassis': '/ims-data/chassis/chasis-level-3.json',
            'ram': '/ims-data/ram/ram_detail.json',
            'storage': '/ims-data/storage/storage-level-3.json',
            'nic': '/ims-data/nic/nic-level-3.json',
            'pciecard': '/ims-data/pciecard/pci-level-3.json',
            'risercard': '/ims-data/risercard/riser-level-3.json',
            'hbacard': '/ims-data/hbacard/hbacard-level-3.json',
            'sfp': '/ims-data/sfp/sfp-level-3.json',
            'caddy': '/ims-data/caddy/caddy_details.json'
        };

        const jsonPath = jsonMaps[type.toLowerCase()];
        if (!jsonPath) return 'Unknown Component';

        try {
            const response = await fetch(jsonPath);
            if (!response.ok) return 'Unknown Component';

            const data = await response.json();

            // Generic search function for UUID across different JSON structures
            const findComponent = (obj) => {
                if (!obj || typeof obj !== 'object') return null;

                if (obj.uuid === uuid || obj.UUID === uuid) {
                    return obj;
                }

                if (Array.isArray(obj)) {
                    for (const item of obj) {
                        const found = findComponent(item);
                        if (found) return found;
                    }
                } else {
                    for (const key of Object.keys(obj)) {
                        const found = findComponent(obj[key]);
                        if (found) return found;
                    }
                }
                return null;
            };

            const component = findComponent(data);
            if (!component) return 'Unknown Component';

            // Generate name based on component type and available fields
            if (component.model) return component.model;
            if (component.name) return component.name;

            // Special handling for RAM if model/name is missing
            if (type.toLowerCase() === 'ram') {
                const parts = [];
                if (component.brand) parts.push(component.brand);
                if (component.memory_type) parts.push(component.memory_type);
                if (component.capacity_GB) parts.push(`${component.capacity_GB}GB`);
                if (component.module_type) parts.push(component.module_type);
                return parts.length > 0 ? parts.join(' ') : 'Unknown RAM';
            }

            // Special handling for Storage
            if (type.toLowerCase() === 'storage') {
                const parts = [];
                if (component.brand) parts.push(component.brand);
                if (component.storage_type) parts.push(component.storage_type);
                if (component.capacity_GB) {
                    const cap = component.capacity_GB >= 1000
                        ? `${(component.capacity_GB / 1000).toFixed(0)}TB`
                        : `${component.capacity_GB}GB`;
                    parts.push(cap);
                }
                return parts.length > 0 ? parts.join(' ') : 'Unknown Storage';
            }

            return 'Unknown Component';
        } catch (error) {
            console.error(`Error resolving component name for ${type}:`, error);
            return 'Unknown Component';
        }
    }

    /**
     * Render Template Preview
     */
    renderTemplatePreview(config) {
        const container = document.getElementById('templatePreview');
        const components = config.components || {};
        let componentListHtml = '';

        const renderItem = (icon, label, items) => {
            if (!items || items.length === 0) return '';
            return `
                <div class="mb-4">
                    <h6 class="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-2">
                        <i class="${icon}"></i> ${label}
                    </h6>
                    <div class="space-y-1">
                        ${items.map(item => `
                            <div class="text-sm text-text-primary bg-surface-card p-2 rounded border border-border-light">
                                ${this.escapeHtml(item.resolved_name || item.component_name || item.product_name || item.name || item.model || 'Unknown Component')}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        };

        const types = [
            { key: 'cpu', icon: 'fas fa-microchip', label: 'CPU' },
            { key: 'ram', icon: 'fas fa-memory', label: 'RAM' },
            { key: 'storage', icon: 'fas fa-hdd', label: 'Storage' },
            { key: 'motherboard', icon: 'fas fa-th-large', label: 'Motherboard' },
            { key: 'chassis', icon: 'fas fa-server', label: 'Chassis' },
            { key: 'nic', icon: 'fas fa-network-wired', label: 'Network' },
            { key: 'pciecard', icon: 'fas fa-plug', label: 'PCIe Card' },
            { key: 'risercard', icon: 'fas fa-layer-group', label: 'Riser Card' },
            { key: 'hbacard', icon: 'fas fa-plug', label: 'HBA Card' },
            { key: 'sfp', icon: 'fas fa-ethernet', label: 'SFP' },
            { key: 'caddy', icon: 'fas fa-box', label: 'Caddy' }
        ];

        types.forEach(t => {
            if (components[t.key]) {
                componentListHtml += renderItem(t.icon, t.label, components[t.key]);
            }
        });

        if (componentListHtml === '') {
            componentListHtml = '<p class="text-text-muted italic">No components in this template.</p>';
        }

        container.innerHTML = `
            <div class="animate-fade-in">
                <h4 class="text-lg font-bold text-text-primary mb-1">${this.escapeHtml(config.server_name)}</h4>
                <p class="text-sm text-text-secondary mb-4">${this.escapeHtml(config.description || 'No description provided')}</p>
                
                <div class="bg-primary/5 border border-primary/10 rounded-lg p-3 mb-4 text-xs text-primary">
                    <i class="fas fa-info-circle me-1"></i>
                    Components defined in Template. Availability will be checked during import.
                </div>

                <div class="h-px bg-border-light w-full my-4"></div>
                <div class="component-preview-list">
                    ${componentListHtml}
                </div>
            </div>
        `;
    }

    /**
     * Render Import Template Modal
     */
    /**
     * Render Import Modal Content (Body + Footer)
     */
    renderImportModalContent() {
        return `
            <div class="flex flex-col h-full" style="min-height: 500px;">
                <div class="flex flex-1 border border-border-light rounded-lg overflow-hidden bg-surface-card mb-4 min-h-0">
                    <!-- Template List -->
                    <div class="w-1/3 border-r border-border-light overflow-y-auto p-3 bg-surface-main/30" id="templateList"></div>
                    <!-- Template Preview -->
                    <div class="w-2/3 p-4 overflow-y-auto bg-surface-main/50" id="templatePreview">
                        <div class="h-full flex flex-col items-center justify-center text-text-secondary opacity-60">
                            <i class="fas fa-mouse-pointer text-3xl mb-3"></i>
                            <p>Select a template to view details</p>
                        </div>
                    </div>
                </div>

                <!-- Footer Actions -->
                <div class="flex justify-end gap-3 pt-2 border-t border-border-light flex-shrink-0">
                    <button type="button" 
                            class="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors border border-transparent hover:bg-surface-hover rounded-lg" 
                            id="cancelImportBtn"
                            onclick="window.serverBuilder.closeImportModal()">
                        Cancel
                    </button>
                    <button type="button" 
                            class="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2" 
                            id="importTemplateBtn" 
                            disabled 
                            onclick="window.serverBuilder.confirmImport()">
                        <i class="fas fa-file-import"></i>
                        <span>Import Template</span>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Close Import Modal
     */
    closeImportModal() {
        const modalContainer = document.getElementById('modalContainer');
        if (modalContainer) {
            modalContainer.classList.remove('active');
            setTimeout(() => {
                modalContainer.classList.add('hidden');
            }, 300); // Wait for transition
        }
        const modalBody = document.getElementById('modalBody');
        // Clean content after hiding to prevent visual jumps
        setTimeout(() => {
            if (modalBody) modalBody.innerHTML = '';
        }, 300);
    }

    /**
     * Helper: Set Modal Busy State
     */
    setImportBusy(isBusy, text = 'Import Template') {
        const btn = document.getElementById('importTemplateBtn');
        const cancelBtn = document.getElementById('cancelImportBtn');
        const closeBtn = document.getElementById('modalClose');

        if (!btn) return;

        if (isBusy) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>Importing...</span>`;
            if (cancelBtn) cancelBtn.classList.add('opacity-50', 'pointer-events-none');
            if (closeBtn) closeBtn.classList.add('pointer-events-none', 'opacity-50');
        } else {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-file-import"></i> <span>${text}</span>`;
            if (cancelBtn) cancelBtn.classList.remove('opacity-50', 'pointer-events-none');
            if (closeBtn) closeBtn.classList.remove('pointer-events-none', 'opacity-50');
        }
    }

    /**
     * Confirm Import (Delegates to TemplateManager)
     */
    async confirmImport() {
        const btn = document.getElementById('importTemplateBtn');
        const uuid = btn.dataset.uuid;
        if (!uuid) return;

        this.setImportBusy(true);

        try {
            // Call TemplateManager Logic
            const result = await templateManager.importTemplate(this.currentConfig.config_uuid, uuid);

            if (result.success) {
                // Close modal
                this.closeImportModal();
                let modal = null;

                if (modal) modal.hide();

                // Refresh Data
                await this.loadExistingConfig(this.currentConfig.config_uuid);

                // Handle Result Feedback
                this.handleImportResult(result);
            } else {
                this.showAlert('Import failed: ' + (result.error || 'Unknown error'), 'danger');
            }

        } catch (error) {
            console.error('Import error:', error);
            this.showAlert(error.message || 'An unexpected error occurred during import.', 'danger');
        } finally {
            this.setImportBusy(false, 'Import Template');
        }
    }

    /**
     * Handle Import Result (UX Strategy)
     */
    handleImportResult(result) {
        const addedCount = result.added.length;
        const skippedCount = result.skipped.length;

        // 1. Success Toast
        if (addedCount > 0) {
            this.showAlert(`Import Complete: ${addedCount} components added successfully.`, 'success');
        }

        // 2. Warning Toast with details (if partial)
        if (skippedCount > 0) {
            setTimeout(() => {
                this.showAlert(`Partial Import: ${skippedCount} items skipped. Open browser console (F12) for details.`, 'warning');
            }, 500);

            // 3. Auto-scroll to first skipped type
            const firstSkipped = result.skipped[0];
            if (firstSkipped && firstSkipped.type) {
                this.scrollToComponent(firstSkipped.type);
            }
        } else if (addedCount === 0) {
            this.showAlert('No matching components were found in inventory.', 'warning');
        }
    }

    /**
     * Open NIC Selection Modal (for SFP module addition)
     */
    async openNICSelectionModal() {
        const modalContainer = document.getElementById('modalContainer');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        const modalClose = document.getElementById('modalClose');

        if (!modalContainer || !modalTitle || !modalBody) {
            console.error('Modal container elements not found');
            this.showAlert('Error: Modal template not found', 'error');
            return;
        }

        // Set Title
        modalTitle.innerHTML = `<i class="fas fa-network-wired text-primary me-2"></i> Select Parent NIC for SFP Module`;

        // Set Content
        modalBody.innerHTML = this.renderNICSelectionModalContent();

        // Show Modal
        modalContainer.classList.remove('hidden');
        // Small delay to allow display:block to apply before adding opacity class for transition
        requestAnimationFrame(() => {
            modalContainer.classList.add('active');
        });

        // Attach Event Listeners
        if (modalClose) {
            // Remove old listeners to be safe (cloning)
            const newClose = modalClose.cloneNode(true);
            modalClose.parentNode.replaceChild(newClose, modalClose);
            newClose.onclick = () => this.closeNICSelectionModal();
        }

        // Load and render NIC list
        this.renderNICList();
    }

    /**
     * Render NIC Selection Modal Content
     */
    renderNICSelectionModalContent() {
        return `
            <div class="flex flex-col" style="min-height: 400px; max-height: 600px;">
                <!-- NIC List Container -->
                <div id="nicList" class="flex-1 overflow-y-auto px-1">
                    <!-- NIC cards will be rendered here -->
                    <div class="text-center py-8 text-text-secondary">
                        <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
                        <p>Loading NICs...</p>
                    </div>
                </div>

                <!-- Footer Actions -->
                <div class="flex justify-end gap-3 pt-4 border-t border-border-light flex-shrink-0 mt-4">
                    <button type="button"
                            class="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors border border-transparent hover:bg-surface-hover rounded-lg"
                            onclick="window.serverBuilder.closeNICSelectionModal()">
                        Cancel
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render NIC List in Modal
     */
    async renderNICList() {
        const listContainer = document.getElementById('nicList');

        if (!listContainer) {
            console.error('NIC list container not found');
            return;
        }

        try {
            // Get NICs from current configuration
            const nics = this.selectedComponents.nic || [];

            if (nics.length === 0) {
                // No NICs found - show empty state
                listContainer.innerHTML = `
                    <div class="text-center py-12">
                        <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-warning/10 mb-4">
                            <i class="fas fa-network-wired text-warning text-2xl"></i>
                        </div>
                        <h3 class="text-lg font-semibold text-text-primary mb-2">No NIC Cards Found</h3>
                        <p class="text-text-secondary mb-6">You need to add a NIC card before adding SFP modules.</p>
                        <button type="button"
                                class="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors"
                                onclick="window.serverBuilder.addNICFirst()">
                            <i class="fas fa-plus me-2"></i>
                            Add NIC Card First
                        </button>
                    </div>
                `;
                return;
            }

            // Load NIC details and render cards
            const nicCards = await Promise.all(
                nics.map(async (nic) => {
                    const details = await this.fetchNICDetails(nic.uuid);
                    return this.renderNICCard({ ...nic, ...details });
                })
            );

            listContainer.innerHTML = `
                <div class="grid grid-cols-1 gap-4 p-2">
                    ${nicCards.join('')}
                </div>
            `;

        } catch (error) {
            console.error('Error rendering NIC list:', error);
            listContainer.innerHTML = `
                <div class="text-center py-8 text-danger">
                    <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
                    <p>Error loading NICs: ${error.message}</p>
                </div>
            `;
        }
    }

    /**
     * Fetch NIC Details from JSON or network config (for onboard NICs)
     */
    async fetchNICDetails(uuid) {
        try {
            // Check if this is an onboard NIC (synthetic UUID like "onboard-xxxxxxxx-N")
            if (uuid && uuid.startsWith('onboard-')) {
                return this.getOnboardNICDetails(uuid);
            }

            // Component NIC - search in the NIC JSON spec file (cached)
            const nicData = await ServerBuilder.fetchJSON('/ims-data/nic/nic-level-3.json');

            for (const brandObj of nicData) {
                for (const series of brandObj.series) {
                    for (const model of series.models) {
                        if (model.uuid === uuid) {
                            return {
                                brand: brandObj.brand,
                                series: series.name,
                                model: model.model,
                                ports: model.ports,
                                port_type: model.port_type,
                                speeds: model.speeds,
                                interface: model.interface,
                                power: model.power,
                                features: model.features
                            };
                        }
                    }
                }
            }

            // Fallback if not found
            return {
                brand: 'Unknown',
                series: 'Unknown',
                model: 'Unknown NIC',
                ports: 0,
                port_type: 'N/A',
                speeds: [],
                interface: 'N/A',
                power: 'N/A'
            };

        } catch (error) {
            console.error('Error fetching NIC details:', error);
            return {
                brand: 'Unknown',
                series: 'Unknown',
                model: 'Unknown NIC',
                ports: 0,
                port_type: 'N/A',
                speeds: [],
                interface: 'N/A',
                power: 'N/A'
            };
        }
    }

    /**
     * Get onboard NIC details from stored network config
     */
    getOnboardNICDetails(uuid) {
        // Look up onboard NIC specs from the network config (server-get-config resolves them
        // from config_components + the board spec; the nic_config JSON column is retired)
        if (this.networkConfig && Array.isArray(this.networkConfig.nics)) {
            const nicEntry = this.networkConfig.nics.find(n => n.uuid === uuid);

            if (nicEntry && nicEntry.specifications) {
                const specs = nicEntry.specifications;
                return {
                    brand: 'Onboard',
                    series: specs.controller || 'Onboard NIC',
                    model: `${specs.controller || 'Onboard NIC'} ${specs.ports || ''}p ${specs.speed || ''}`.trim(),
                    ports: specs.ports || 0,
                    port_type: specs.connector || 'N/A',
                    speeds: specs.speed ? [specs.speed] : [],
                    interface: 'Onboard',
                    power: 'N/A',
                    source_type: 'onboard'
                };
            }
        }

        // Fallback for onboard NIC when network config isn't available
        return {
            brand: 'Onboard',
            series: 'Onboard NIC',
            model: 'Onboard NIC',
            ports: 0,
            port_type: 'N/A',
            speeds: [],
            interface: 'Onboard',
            power: 'N/A',
            source_type: 'onboard'
        };
    }

    /**
     * Render NIC Card
     */
    renderNICCard(nic) {
        const speedsText = Array.isArray(nic.speeds) ? nic.speeds.join(', ') : 'N/A';

        return `
            <div class="group border border-border-light rounded-lg p-4 cursor-pointer transition-all hover:border-primary hover:bg-primary/5"
                 onclick="window.serverBuilder.selectNIC('${nic.uuid}')">
                <div class="flex items-start justify-between">
                    <div class="flex items-start gap-3 flex-1">
                        <div class="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                            <i class="fas fa-network-wired text-primary"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-1">
                                <h4 class="font-semibold text-text-primary">${nic.model || 'Unknown Model'}</h4>
                                <span class="text-xs text-text-secondary">${nic.brand || ''} ${nic.series || ''}</span>
                            </div>
                            <div class="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 text-sm">
                                <div>
                                    <span class="text-text-secondary">Ports:</span>
                                    <span class="text-text-primary font-medium ml-1">${nic.ports || 0} × ${nic.port_type || 'N/A'}</span>
                                </div>
                                <div>
                                    <span class="text-text-secondary">Speed:</span>
                                    <span class="text-text-primary font-medium ml-1">${speedsText}</span>
                                </div>
                                <div>
                                    <span class="text-text-secondary">Interface:</span>
                                    <span class="text-text-primary font-medium ml-1">${nic.interface || 'N/A'}</span>
                                </div>
                                ${nic.serial_number ? `
                                <div>
                                    <span class="text-text-secondary">Serial:</span>
                                    <span class="text-text-primary font-medium ml-1">${nic.serial_number}</span>
                                </div>
                                ` : ''}
                                ${nic.slot_position ? `
                                <div>
                                    <span class="text-text-secondary">Slot:</span>
                                    <span class="text-text-primary font-medium ml-1">${nic.slot_position}</span>
                                </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="flex-shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <i class="fas fa-chevron-right text-primary"></i>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Select NIC and proceed to SFP configuration
     */
    selectNIC(nicUuid) {
        const configUuid = this.currentConfig.config_uuid;

        // Close modal
        this.closeNICSelectionModal();

        // Redirect to configuration page with parent_nic_uuid parameter
        window.location.href = `../../pages/server/configuration.html?config=${configUuid}&type=sfp&parent_nic_uuid=${nicUuid}&return=builder`;
    }

    /**
     * Add NIC First (from empty state)
     */
    addNICFirst() {
        const configUuid = this.currentConfig.config_uuid;

        // Close modal
        this.closeNICSelectionModal();

        // Redirect to NIC configuration page
        window.location.href = `../../pages/server/configuration.html?config=${configUuid}&type=nic&return=builder`;
    }

    /**
     * Close NIC Selection Modal
     */
    closeNICSelectionModal() {
        const modalContainer = document.getElementById('modalContainer');
        if (modalContainer) {
            modalContainer.classList.remove('active');
            setTimeout(() => {
                modalContainer.classList.add('hidden');
            }, 300); // Wait for transition
        }
        const modalBody = document.getElementById('modalBody');
        // Clean content after hiding to prevent visual jumps
        setTimeout(() => {
            if (modalBody) modalBody.innerHTML = '';
        }, 300);
    }

    /**
     * Render the PC Part Picker style interface
     */
    renderServerBuilderInterface() {

        if (!this.currentConfig) {
            console.error('No configuration loaded');
            // Show a test interface to verify the builder is working
            this.renderTestInterface();
            return;
        }

        const serverName = this.currentConfig.server_name || this.currentConfig.ServerName || 'Unnamed Server';
        document.title = `${serverName} - Server Builder`;


        const hasIssues = this.compatibilityIssues.length > 0;

        const interfaceHtml = `
            <div class="w-full mx-auto">
                ${this.isSandbox ? `
                    <div class="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20 mb-6">
                        <i class="fas fa-flask text-primary mt-0.5"></i>
                        <div class="text-sm text-text-secondary leading-relaxed">
                            <strong class="text-text-primary">Compatibility bench.</strong>
                            Nothing here is reserved — no component changes status, and parts already
                            in use in other servers can be tested freely. Compatible parts join the
                            build; anything the engine rejects is listed under Tested parts with the reason.
                        </div>
                    </div>
                ` : ''}

                <!-- Server compute platform: pick the machine, then its system board -->
                ${this.renderPlatformButton()}

                <!-- Component Selection Table -->
                <div class="bg-surface-card rounded-lg border border-border-light overflow-hidden mb-6">
                    <table class="w-full border-collapse">
                        <thead>
                            <tr class="border-b border-border-light">
                                <th class="text-left px-5 py-3 font-mono text-[11px] font-semibold text-text-muted uppercase tracking-[0.12em] w-72">Component</th>
                                <th class="text-left px-5 py-3 font-mono text-[11px] font-semibold text-text-muted uppercase tracking-[0.12em]">Installed</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.buildState.visibleTypes().map(type => this.renderComponentRow(type)).join('')}
                        </tbody>
                    </table>
                </div>

                <!-- Tested parts (bench only): the log of what was tried and the verdict -->
                ${this.isSandbox && window.CompatibilityBench
                    ? window.CompatibilityBench.renderResultsPanel(this.currentConfig.config_uuid)
                    : ''}

                <!-- Finish Configuration Button. Hidden on the bench: finalizing marks
                     components in_use, which is exactly what a bench must never do
                     (the backend refuses it too — see ServerBuilder::finalizeConfiguration). -->
                ${this.isSandbox ? '' : `
                <div class="flex justify-center my-6">
                    <button class="inline-flex items-center gap-2.5 px-8 py-3 bg-primary text-white border border-primary rounded-lg text-base font-semibold cursor-pointer transition-colors duration-150 hover:bg-primary-dark hover:border-primary-dark" onclick="window.serverBuilder.finishConfiguration()">
                        <i class="fas fa-check-circle"></i>
                        Finish Setup
                    </button>
                </div>
                `}

                <!-- Compatibility Banner -->
                ${hasIssues ? `
                    <div class="compat-banner is-warning">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>Compatibility: these parts have potential issues. See details below.</span>
                    </div>
                ` : `
                    <div class="compat-banner is-success">
                        <i class="fas fa-check-circle"></i>
                        <span>Compatibility: all components are compatible.</span>
                    </div>
                `}

                <!-- Potential Issues -->
                ${this.getTotalIssuesCount() > 0 ? `
                    <div class="issues-panel">
                        <div class="issues-panel-header">
                            <div class="issues-panel-title">
                                <span class="issues-panel-title-icon"><i class="fas fa-exclamation-triangle"></i></span>
                                Potential Issues
                            </div>
                            <span class="issues-count-badge">${this.getTotalIssuesCount()} open</span>
                        </div>
                        <div class="issues-progress">
                            <div class="issues-progress-bar">
                                <div class="issues-progress-fill" style="width: ${this.getIssuesResolvedPercentage()}%"></div>
                            </div>
                            <div class="issues-progress-text">${this.getIssuesResolvedCount()} of ${this.getTotalIssuesCount()} issues resolved</div>
                        </div>
                        ${this.renderGroupedIssues()}
                    </div>
                ` : ''}

                <!-- Server Usage -->
                ${this.renderServerUsage()}
            </div>
        `;

        // Check if we're in the dashboard or standalone
        const targetElement = document.getElementById('serverBuilderContent') || document.getElementById('app');
        if (targetElement) {
            targetElement.innerHTML = interfaceHtml;
            this.attachEventListeners();
            this.applyPendingFocus();
        } else {
            console.error('No target element found for rendering');
        }
    }

    /**
     * Render the Server Usage hardware tree:
     * Chassis → Motherboard → sockets/slots/ports, plus drive bays and caddy sockets.
     * Every slot is interactive: empty slots open the add-component flow,
     * populated slots open a detail popover with a remove action.
     */
    renderServerUsage() {
        const boardComp = this.selectedComponents.motherboard[0] || null;

        if (!boardComp) {
            return `
            <div class="hw-card">
                <div class="flex items-center justify-between mb-4">
                    <h4 class="text-base font-semibold text-text-primary m-0">Server Usage</h4>
                    <span class="font-mono text-[11px] text-text-muted uppercase tracking-wider">Physical layout</span>
                </div>
                <div class="hw-placeholder">
                    <i class="fas fa-microchip text-2xl text-text-muted mb-3"></i>
                    <p class="text-sm font-medium text-text-primary mb-1">No motherboard installed</p>
                    <p class="text-xs text-text-muted mb-4 max-w-sm">Install a motherboard to visualize CPU sockets, DIMM slots, network ports, expansion slots and drive bays.</p>
                    <button class="btn-choose" onclick="window.serverBuilder.addComponent('motherboard')">
                        <i class="fas fa-plus"></i>
                        Add Motherboard
                    </button>
                </div>
            </div>`;
        }

        const chassisComp = this.selectedComponents.chassis[0] || null;
        const chassisName = this.chassisDetails?.model || chassisComp?.component_name || (chassisComp ? 'Server Chassis' : null);
        const boardName = this.motherboardDetails?.model || boardComp.component_name || boardComp.serial_number || 'Motherboard';

        // Section meters
        const cpuUsed = this.selectedComponents.cpu.length;
        const socketTotal = this.cpuSocketTotal();
        const socketType = this.motherboardDetails?.socket?.type || '';

        const ramUsed = this.selectedComponents.ram.length;
        const memTotal = this.memorySlotTotal();
        const memType = this.motherboardDetails?.memory?.type || 'DIMM';

        const nicCount = (this.networkConfig?.nics || []).length;

        const pcieData = this.slotAssignments?.pcie;
        const riserData = this.slotAssignments?.riser;
        const expTotal = (pcieData?.total_count || 0) + (riserData?.total_count || 0);
        const expUsed = (pcieData?.used_count || 0) + (riserData?.used_count || 0);

        const m2Data = this.slotAssignments?.m2;
        const m2Total = m2Data?.total_count || null;
        // Adapter M.2 usage is derived from actual pcie_adapter connections rather than
        // the tracker's used_count, which under-counts adapter drives (see renderM2Slots).
        const adapterM2Used = (this.storageConnectivity?.connections || [])
            .filter(c => (c.connection_type || '') === 'pcie_adapter').length;
        const m2Used = (m2Data?.motherboard_slots?.used || 0) + adapterM2Used;

        const bays = this.storageConnectivity?.drive_bays || null;

        const caddyComponents = this.selectedComponents.caddy || [];
        const caddyTotal = this.motherboardDetails?.caddySockets?.length || Math.max(caddyComponents.length, 1);
        const caddyUsed = Math.min(caddyComponents.length, caddyTotal);

        const nicHtml = this.renderAllNICs();
        const m2Html = this.renderM2Slots();

        return `
        <div class="hw-card">
            <div class="flex items-center justify-between mb-4">
                <h4 class="text-base font-semibold text-text-primary m-0">Server Usage</h4>
                <span class="font-mono text-[11px] text-text-muted uppercase tracking-wider">Physical layout</span>
            </div>

            <div class="hw-chassis ${chassisComp ? '' : 'is-missing'}" data-hw-section="chassis">
                <div class="hw-chassis-header">
                    <span class="hw-tag hw-tag-chassis"><i class="fas fa-server mr-1.5"></i>Chassis</span>
                    ${chassisComp ? `
                    <span class="relative inline-flex items-baseline gap-2 cursor-pointer min-w-0" onclick="window.serverBuilder.toggleSlotPopover(event, this)">
                        <span class="text-sm font-semibold text-text-primary truncate">${this.escapeHtml(chassisName)}</span>
                        ${chassisComp.serial_number ? `<span class="font-mono text-[11px] text-text-muted">${this.escapeHtml(chassisComp.serial_number)}</span>` : ''}
                        ${this.renderSlotPopover('chassis', chassisComp, 'Chassis')}
                    </span>
                    ` : `
                    <span class="text-sm text-warning font-medium"><i class="fas fa-exclamation-triangle mr-1.5"></i>No chassis installed</span>
                    <button class="btn-ghost-add ml-auto !py-1.5" onclick="window.serverBuilder.addComponent('chassis')">
                        <i class="fas fa-plus"></i>
                        Add Chassis
                    </button>
                    `}
                </div>

                <div class="hw-chassis-body">
                    ${this.renderChassisDetails()}

                    <div class="hw-board" data-hw-section="board">
                        <div class="hw-board-header">
                            <span class="hw-tag hw-tag-board"><i class="fas fa-microchip mr-1.5"></i>Motherboard</span>
                            <span class="relative inline-flex items-baseline gap-2 cursor-pointer min-w-0" onclick="window.serverBuilder.toggleSlotPopover(event, this)">
                                <span class="text-sm font-semibold text-text-primary truncate">${this.escapeHtml(boardName)}</span>
                                ${boardComp.serial_number ? `<span class="font-mono text-[11px] text-text-muted">${this.escapeHtml(boardComp.serial_number)}</span>` : ''}
                                ${this.renderSlotPopover('motherboard', boardComp, 'Motherboard')}
                            </span>
                        </div>
                        <div class="hw-board-body">
                            ${this.renderHwSection({ key: 'cpu', title: 'CPU Sockets', sub: socketType, used: cpuUsed, total: socketTotal, body: this.renderSocketSlots() })}
                            ${this.renderHwSection({ key: 'memory', title: 'Memory', sub: memType, used: ramUsed, total: memTotal, body: this.renderMemorySlots() })}
                            ${nicHtml ? this.renderHwSection({ key: 'network', title: 'Network Interfaces', sub: `${nicCount} controller${nicCount === 1 ? '' : 's'}`, body: nicHtml }) : ''}
                            ${this.renderHwSection({ key: 'expansion', title: 'Expansion Slots', used: expUsed, total: expTotal > 0 ? expTotal : null, body: this.renderExpansionSlots() })}
                            ${m2Html ? this.renderHwSection({ key: 'm2', title: 'M.2 Slots', used: m2Used, total: m2Total, body: m2Html }) : ''}
                        </div>
                    </div>

                    ${this.renderHwSection({ key: 'drivebays', title: 'Drive Bays', sub: bays ? '' : 'No backplane data', used: bays?.used || 0, total: bays?.total || null, body: this.renderStorageConnectivity() })}
                </div>
            </div>

            ${this.renderHwSection({ key: 'caddy', title: 'Caddy Sockets', used: caddyUsed, total: caddyTotal, body: this.renderCaddySockets(), wrapperClass: 'mt-3' })}
        </div>`;
    }

    /**
     * Render a collapsible hardware section with title, optional subtitle and
     * utilization meter. Collapse state persists in this.sectionCollapsed.
     */
    renderHwSection({ key, title, sub = '', used = 0, total = null, body, wrapperClass = '' }) {
        const collapsed = this.sectionCollapsed[key] ? ' collapsed' : '';
        const meter = (total !== null && total !== undefined)
            ? `<span class="hw-section-meterwrap">${this.renderMeter(used, total)}</span>`
            : '';

        return `
        <section class="hw-section${collapsed} ${wrapperClass}" data-hw-section="${key}">
            <button type="button" class="hw-section-toggle" onclick="window.serverBuilder.toggleSection('${key}')">
                <i class="fas fa-chevron-down hw-caret"></i>
                <span class="hw-section-title">${title}</span>
                ${sub ? `<span class="hw-section-sub">${sub}</span>` : ''}
                ${meter}
            </button>
            <div class="hw-section-body">${body}</div>
        </section>`;
    }

    /**
     * Render a slot utilization meter: filled segments for small totals,
     * a compact bar for large ones. Always paired with a mono "used/total" count.
     */
    renderMeter(used, total) {
        if (!total || total <= 0) return '';
        const clamped = Math.max(0, Math.min(used || 0, total));

        if (total <= 24) {
            let segs = '';
            for (let i = 0; i < total; i++) {
                segs += `<span class="hw-meter-seg${i < clamped ? ' filled' : ''}"></span>`;
            }
            return `<span class="hw-meter">${segs}</span><span class="hw-meter-count">${clamped}/${total}</span>`;
        }

        const pct = Math.round((clamped / total) * 100);
        return `<span class="hw-meter-bar"><span class="hw-meter-bar-fill" style="width: ${pct}%"></span></span><span class="hw-meter-count">${clamped}/${total}</span>`;
    }

    /**
     * Render the detail popover for a populated slot. Pass a falsy type to
     * omit the remove action (e.g. data without a removable component uuid).
     */
    renderSlotPopover(type, comp, slotLabel = '', extraRows = '') {
        if (!comp) return '';
        const name = this.escapeHtml(comp.component_name || comp.serial_number || 'Component');

        const row = (k, v) => v ? `<div class="slot-popover-row"><span class="k">${k}</span><span class="v">${this.escapeHtml(v)}</span></div>` : '';

        return `
        <div class="slot-popover" onclick="event.stopPropagation()">
            <div class="slot-popover-name">${name}</div>
            ${row('Serial', comp.serial_number)}
            ${row('Slot', slotLabel)}
            ${comp.slot_position && comp.slot_position !== slotLabel ? row('Position', comp.slot_position) : ''}
            ${extraRows}
            ${type && comp.uuid && !this.isPlatformLocked(type) ? `
            <div class="slot-popover-actions">
                <button class="slot-popover-remove" onclick="window.serverBuilder.removeComponent('${type}', '${comp.uuid}', ${this.jsArg(comp.serial_number)})">
                    <i class="fas fa-trash-alt"></i>
                    Remove
                </button>
            </div>` : ''}
        </div>`;
    }

    /**
     * Render a standard slot row (expansion, M.2, caddy, CPU…).
     * Empty slots open the add flow; filled slots toggle their popover.
     */
    renderHwSlotRow({ label, badge = '', component = null, emptyType = '', emptyText = 'Empty', required = false, icon = '', extraHtml = '' }) {
        const badgeHtml = badge ? `<span class="slot-type-badge">${badge}</span>` : '';

        if (component) {
            const name = this.escapeHtml(component.component_name || component.serial_number || 'Component');
            const serial = component.component_name && component.serial_number ? `<span class="hw-slot-serial">${this.escapeHtml(component.serial_number)}</span>` : '';
            const mainRow = `
                <div class="hw-slot-main">
                    <span class="hw-slot-label">${label}</span>
                    ${badgeHtml}
                </div>
                <div class="hw-slot-main justify-end">
                    ${icon ? `<i class="${icon} text-primary text-xs"></i>` : ''}
                    <span class="hw-slot-name">${name}</span>
                    ${serial}
                </div>`;
            const popover = this.renderSlotPopover(component.compType || emptyType, component, label);

            // Slots with port indicators stack their rows vertically
            if (extraHtml) {
                return `
                <div class="hw-slot is-filled is-stack" onclick="window.serverBuilder.toggleSlotPopover(event, this)">
                    <div class="flex items-center justify-between gap-3 min-w-0">${mainRow}</div>
                    ${extraHtml}
                    ${popover}
                </div>`;
            }

            return `
            <div class="hw-slot is-filled" onclick="window.serverBuilder.toggleSlotPopover(event, this)">
                ${mainRow}
                ${popover}
            </div>`;
        }

        const stateClass = required ? 'is-required' : 'is-empty';
        const clickAttr = emptyType ? ` onclick="window.serverBuilder.addComponent('${emptyType}')"` : '';
        return `
        <div class="hw-slot ${stateClass}"${clickAttr}>
            <div class="hw-slot-main">
                <span class="hw-slot-label">${label}</span>
                ${badgeHtml}
            </div>
            <div class="hw-slot-main justify-end">
                ${emptyType ? `<span class="hw-slot-add-hint"><i class="fas fa-plus mr-1"></i>Install</span>` : ''}
                <span class="hw-slot-state${required ? ' is-required-text' : ''}">${required ? 'Required' : emptyText}</span>
            </div>
        </div>`;
    }

    /**
     * Toggle a hardware section's collapsed state (persists across re-renders).
     */
    toggleSection(key) {
        const section = document.querySelector(`section[data-hw-section="${key}"]`);
        if (!section) return;
        this.sectionCollapsed[key] = section.classList.toggle('collapsed');
    }

    /**
     * Toggle the detail popover on a populated slot (one open at a time).
     */
    toggleSlotPopover(event, el) {
        event.stopPropagation();
        const wasOpen = el.classList.contains('popover-open');
        this.closeAllSlotPopovers();
        if (!wasOpen) el.classList.add('popover-open');
    }

    closeAllSlotPopovers() {
        document.querySelectorAll('.popover-open').forEach(n => n.classList.remove('popover-open'));
    }

    /**
     * After returning from the add-component flow, scroll to and briefly
     * highlight the section (or table row) for the component that was added.
     */
    applyPendingFocus() {
        let type = null;
        try {
            type = sessionStorage.getItem('bdc_builder_focus');
            if (type) sessionStorage.removeItem('bdc_builder_focus');
        } catch (e) { /* sessionStorage unavailable */ }
        if (!type || (this.selectedComponents[type] || []).length === 0) return;

        const sectionMap = {
            cpu: 'cpu', ram: 'memory', nic: 'network', sfp: 'network',
            pciecard: 'expansion', risercard: 'expansion', hbacard: 'expansion', storage: 'drivebays',
            caddy: 'caddy', chassis: 'chassis', motherboard: 'board'
        };
        const target = document.querySelector(`[data-hw-section="${sectionMap[type]}"]`)
            || document.getElementById(`component-row-${type}`);
        if (!target) return;

        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('flash-highlight');
        setTimeout(() => target.classList.remove('flash-highlight'), 2000);
    }
    /**
     * Finish configuration and save the server
     */
    // finishConfiguration() {
    //     // Check if all required components are selected
    //     const missingRequired = this.componentTypes.filter(type => 
    //         type.required && this.selectedComponents[type.type].length === 0
    //     );

    //     if (missingRequired.length > 0) {
    //         const missingNames = missingRequired.map(type => type.name).join(', ');
    //         this.showAlert(`Please add the following required components: ${missingNames}`, 'warning');
    //         return;
    //     }

    //     // Show confirmation dialog
    //     if (confirm('Are you sure you want to finish the configuration? This will save your server configuration.')) {
    //         this.saveConfiguration();
    //     }
    // }
    /**
     * Finish configuration and save the server
     */
    finishConfiguration() {
        // Check if all required components are selected
        const missingRequired = this.componentTypes.filter(type =>
            type.required && this.selectedComponents[type.type].length === 0
        );

        // Get all compatibility issues
        const allIssues = [...this.compatibilityIssues, ...this.performanceWarnings];

        // Show the confirmation modal
        this.showFinishConfirmationModal(missingRequired, allIssues);
    }

    /**
     * Show finish confirmation modal with warnings and component list
     */
    showFinishConfirmationModal(missingRequired, allIssues) {
        const hasMissingRequired = missingRequired.length > 0;
        const hasIssues = allIssues.length > 0;
        const isReady = !hasMissingRequired && !hasIssues;
        const componentList = this.getComponentSummaryList();

        const modalHtml = `
            <div class="finish-confirmation-modal active">
                <div class="modal-overlay"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            <i class="fas fa-server"></i>
                            Server Configuration Summary
                        </h3>
                        <button class="modal-close" onclick="window.serverBuilder.closeFinishModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    
                    <div class="modal-body">
                        <!-- Component Summary Section -->
                        <div class="component-summary-section">
                            <div class="section-header">
                                <i class="fas fa-list-check"></i>
                                <h4>Selected Components</h4>
                                <span class="component-count">${this.getTotalComponentsCount()} components</span>
                            </div>
                            <div class="component-list">
                                ${componentList}
                            </div>
                        </div>

                        ${hasMissingRequired ? `
                            <div class="warning-section">
                                <div class="warning-header">
                                    <i class="fas fa-exclamation-triangle"></i>
                                    <h4>Required Components Missing</h4>
                                </div>
                                <div class="warning-list">
                                    ${missingRequired.map(type => `
                                        <div class="warning-item critical">
                                            <i class="fas fa-exclamation-circle"></i>
                                            <span class="warning-text">${type.name} is required</span>
                                            <button class="btn-fix" onclick="window.serverBuilder.fixIssueAndProceed('${type.type}')">
                                                <i class="fas fa-wrench"></i>
                                                Auto Fix
                                            </button>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                        ${hasIssues ? `
                            <div class="warning-section">
                                <div class="warning-header">
                                    <i class="fas fa-info-circle"></i>
                                    <h4>Compatibility Warnings</h4>
                                </div>
                                <div class="warning-list">
                                    ${allIssues.map(issue => `
                                        <div class="warning-item ${issue.severity}">
                                            <i class="${issue.icon}"></i>
                                            <span class="warning-text">${issue.message}</span>
                                            ${issue.action ? `
                                                <button class="btn-fix" onclick="window.serverBuilder.fixIssueAndProceed('${issue.action.actionType}')">
                                                    <i class="fas fa-wrench"></i>
                                                    Auto Fix
                                                </button>
                                            ` : ''}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                        ${isReady ? `
                            <div class="success-section">
                                <div class="success-icon">
                                    <i class="fas fa-check-circle"></i>
                                </div>
                                <div class="success-content">
                                    <h4>Configuration Ready!</h4>
                                    <p>All required components are selected and your server configuration is ready to be saved.</p>
                                    <div class="configuration-summary">
                                        <div class="summary-item">
                                            <span class="summary-label">Server Name:</span>
                                            <span class="summary-value">${this.escapeHtml(this.currentConfig.server_name || 'Unnamed Server')}</span>
                                        </div>
                                        <div class="summary-item">
                                            <span class="summary-label">Total Components:</span>
                                            <span class="summary-value">${this.getTotalComponentsCount()}</span>
                                        </div>
                                        <div class="summary-item">
                                            <span class="summary-label">Estimated Power:</span>
                                            <span class="summary-value">${this.calculateEstimatedPower()}W</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="modal-footer">
                        <button class="btn-cancel" onclick="window.serverBuilder.closeFinishModal()">
                            <i class="fas fa-times"></i>
                            Cancel
                        </button>
                        
                        ${isReady ? `
                            <button class="btn-confirm" onclick="window.serverBuilder.proceedWithSave()">
                                <i class="fas fa-check"></i>
                                Confirm & Save Configuration
                            </button>
                        ` : `
                            <button class="btn-confirm disabled" disabled>
                                <i class="fas fa-check"></i>
                                Fix Issues to Continue
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existingModal = document.querySelector('.finish-confirmation-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    /**
     * Fix issue and proceed to add component
     */
    fixIssueAndProceed(componentType) {
        // Close the modal first
        this.closeFinishModal();

        // Then redirect to add the required component
        setTimeout(() => {
            this.addComponent(componentType);
        }, 300);
    }
    /**
     * Close the finish confirmation modal
     */
    closeFinishModal() {
        const modal = document.querySelector('.finish-confirmation-modal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        }
    }

    /**
     * Proceed with saving after confirmation
     */
    proceedWithSave() {
        this.closeFinishModal();
        this.saveConfiguration();
    }

    /**
     * Get total components count
     */
    getTotalComponentsCount() {
        let count = 0;
        Object.values(this.selectedComponents).forEach(components => {
            count += components.length;
        });
        return count;
    }

    /**
     * Save the final configuration
     */
    async saveConfiguration() {
        try {
            this.showLoading('Saving server configuration...');

            // Your API call to save the configuration
            const result = await serverAPI.finalizeServerConfig(this.currentConfig.config_uuid);

            if (result.success) {
                this.showAlert('Server configuration saved successfully!', 'success');

                // Redirect to server list or dashboard
                setTimeout(() => {
                    window.location.href = `../../pages/server/configuration.html?config=${configUuid}&type=${type}&return=builder`;
                }, 1500);
            } else {
                this.showAlert(result.message || 'Failed to save configuration', 'error');
            }
        } catch (error) {
            console.error('Error saving configuration:', error);
            this.showAlert(error.message || 'An error occurred while saving the configuration', 'error');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Get component summary list HTML
     */
    getComponentSummaryList() {
        let html = '';

        this.componentTypes.forEach(componentType => {
            const components = this.selectedComponents[componentType.type];

            if (components.length > 0) {
                html += `
                <div class="component-category">
                    <div class="category-header">
                        <i class="${componentType.icon}"></i>
                        <span class="category-name">${componentType.name}</span>
                        <span class="category-count">${components.length} ${componentType.multiple ? 'items' : 'item'}</span>
                    </div>
                    <div class="component-items">
                        ${components.map((component, index) => `
                            <div class="component-item">
                                <div class="component-info">
                                    <span class="component-serial">${component.component_name || component.serial_number || 'Component'}</span>
                                    ${component.component_name && component.serial_number ? `<span class="component-slot text-text-muted text-xs">${component.serial_number}</span>` : ''}
                                    ${component.slot_position ? `<span class="component-slot">(${component.slot_position})</span>` : ''}
                                </div>
                                ${componentType.multiple && components.length > 1 ? `<span class="component-index">#${index + 1}</span>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            } else {
                html += `
                <div class="component-category missing">
                    <div class="category-header">
                        <i class="${componentType.icon}"></i>
                        <span class="category-name">${componentType.name}</span>
                        <span class="category-status missing">Missing</span>
                    </div>
                    <div class="component-items empty">
                        <span class="empty-message">No ${componentType.name.toLowerCase()} selected</span>
                    </div>
                </div>
            `;
            }
        });

        return html || '<div class="no-components">No components selected yet</div>';
    }


    /**
     * Render test interface to verify the builder is working
     */
    renderTestInterface() {
        const testHtml = `
            <div class="w-full mx-auto">
                <div class="mb-6">
                    <h1 class="text-xl font-bold text-text-primary mb-1">Builder Test</h1>
                    <p class="text-sm text-text-muted">This confirms the builder is working</p>
                </div>

                <div class="compat-banner is-success">
                    <i class="fas fa-check-circle"></i>
                    <span>Builder is loaded and working!</span>
                </div>

                <div class="bg-surface-card rounded-lg border border-border-light overflow-hidden">
                    <table class="w-full border-collapse">
                        <thead>
                            <tr class="border-b border-border-light">
                                <th class="text-left px-5 py-3 font-mono text-[11px] font-semibold text-text-muted uppercase tracking-[0.12em]">Component</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="border-t border-border-light">
                                <td class="px-5 py-3 align-middle">
                                    <div class="flex items-center gap-3.5">
                                        <div class="comp-type-icon"><i class="fas fa-microchip"></i></div>
                                        <div class="flex flex-col gap-0.5">
                                            <span class="font-semibold text-sm text-text-primary">CPU</span>
                                            <span class="text-xs text-text-muted">Test Component</span>
                                        </div>
                                    </div>
                                </td>
                                <td class="px-5 py-3 align-middle text-right">
                                    <button class="btn-choose">
                                        <i class="fas fa-plus"></i>
                                        Choose CPU
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Check if we're in the dashboard or standalone
        const targetElement = document.getElementById('serverBuilderContent') || document.getElementById('app');
        if (targetElement) {
            targetElement.innerHTML = testHtml;
        } else {
            console.error('No target element found for test interface');
        }
    }
    /**
     * Load chassis details from JSON
     */
    async loadChassisDetails(uuid) {
        try {
            // Fetch chassis JSON (cached)
            const chassisData = await ServerBuilder.fetchJSON('/ims-data/chassis/chasis-level-3.json');

            // Search for the chassis by UUID
            for (const manufacturer of chassisData.manufacturers) {
                for (const series of manufacturer.series) {
                    for (const model of series.models) {
                        if (model.uuid === uuid) {
                            return model;
                        }
                    }
                }
            }

            return null;
        } catch (error) {
            console.error('Error loading chassis details:', error);
            return null;
        }
    }

    renderComponentRow(componentType) {
        const components = this.selectedComponents[componentType.type] || [];
        const hasComponents = components.length > 0;
        const isMultiple = componentType.multiple;

        // Supplied by the compute platform: it came inside the box, so it is neither
        // removable nor addable on its own. The backend refuses either way; this is what
        // stops the user finding that out by being told no.
        const platformLocked = this.isPlatformLocked(componentType.type);

        // Capacity exhausted: the row and its chips stay (installed hardware must
        // remain visible and removable), only the add affordance is withheld.
        const canAdd = !platformLocked && this.buildState.canAdd(componentType.type);
        const capacityBadge = platformLocked
            ? `<span class="comp-capacity-badge" title="Comes with ${this.escapeHtml(this.currentConfig?.platform_name || 'the compute platform')}. Change or remove the platform to change it."><i class="fas fa-lock text-[9px]"></i>Compute platform</span>`
            : (canAdd
                ? ''
                : `<span class="comp-capacity-badge"><i class="fas fa-lock text-[9px]"></i>${this.escapeHtml(this.buildState.capacityLabel(componentType.type))}</span>`);

        const labelCell = `
            <td class="px-5 py-3 align-middle">
                <div class="flex items-center gap-3.5">
                    <div class="comp-type-icon"><i class="${componentType.icon}"></i></div>
                    <div class="flex flex-col gap-0.5 min-w-0">
                        <div class="flex items-center gap-2">
                            <span class="font-semibold text-sm text-text-primary">${componentType.name}</span>
                            ${componentType.required && !hasComponents ? '<span class="comp-required-tag"><i class="fas fa-exclamation-triangle text-[9px]"></i>Required</span>' : ''}
                        </div>
                        <span class="text-xs text-text-muted">${componentType.description}</span>
                    </div>
                </div>
            </td>`;

        let valueCell;
        if (hasComponents) {
            const chips = components.map(comp => {
                const displayName = this.escapeHtml(comp.component_name || comp.serial_number || 'Unnamed Component');
                const subtitle = comp.component_name ? this.escapeHtml(comp.serial_number || '') : '';
                const position = comp.slot_position ? ` <span class="font-normal text-text-muted">(${this.escapeHtml(comp.slot_position)})</span>` : '';

                return `
                <span class="comp-chip">
                    <span class="comp-chip-body">
                        <span class="comp-chip-name">${displayName}${position}</span>
                        ${subtitle ? `<span class="comp-chip-serial">${subtitle}</span>` : ''}
                    </span>
                    ${platformLocked ? '' : `
                    <button class="comp-chip-remove" onclick="window.serverBuilder.removeComponent('${componentType.type}', '${comp.uuid}', ${this.jsArg(comp.serial_number)})" title="Remove">
                        <i class="fas fa-times text-xs"></i>
                    </button>`}
                </span>`;
            }).join('');

            valueCell = `
            <td class="px-5 py-3 align-middle">
                <div class="flex flex-wrap items-center gap-2">
                    ${chips}
                    ${isMultiple && canAdd ? `
                    <button class="btn-ghost-add" onclick="window.serverBuilder.addComponent('${componentType.type}')">
                        <i class="fas fa-plus"></i>
                        Add More
                    </button>` : ''}
                    ${capacityBadge}
                </div>
            </td>`;
        } else {
            const buttonText = isMultiple ? `Choose ${componentType.name}` : `Add ${componentType.name}`;
            valueCell = `
            <td class="px-5 py-3 align-middle text-right">
                ${canAdd ? `
                <button class="${componentType.required ? 'btn-choose' : 'btn-ghost-add'}" onclick="window.serverBuilder.addComponent('${componentType.type}')">
                    <i class="fas fa-plus"></i>
                    ${buttonText}
                </button>` : capacityBadge}
            </td>`;
        }

        return `
        <tr class="border-t border-border-light transition-colors duration-150 hover:bg-surface-hover" id="component-row-${componentType.type}">
            ${labelCell}
            ${valueCell}
        </tr>`;
    }
    renderSocketSlots() {
        const cpuComponents = this.selectedComponents.cpu;
        const motherboardData = this.motherboardDetails;

        const socketCount = this.cpuSocketTotal();
        const socketType = motherboardData?.socket?.type || '';
        const noneInstalled = cpuComponents.length === 0;

        let html = '';
        for (let i = 0; i < socketCount; i++) {
            const cpu = cpuComponents[i];
            html += this.renderHwSlotRow({
                label: `CPU ${socketCount > 1 ? i + 1 : ''}`.trim(),
                badge: socketType,
                component: cpu || null,
                emptyType: 'cpu',
                icon: 'fas fa-microchip',
                required: noneInstalled && i === 0
            });
        }

        return html;
    }

    /**
     * Render chassis socket - Dynamic based on motherboard JSON
     */
    renderChassisSocket() {
        const motherboardData = this.motherboardDetails;

        const chassisSocket = motherboardData?.chassisSocket || 'ATX';

        return `
            <div class="hw-slot is-filled !cursor-default">
                <div class="hw-slot-main"><span class="hw-slot-label">Chassis Socket</span></div>
                <div class="hw-slot-main justify-end"><span class="hw-slot-name">${chassisSocket}</span></div>
            </div>
        `;
    }

    /**
     * Render memory slots - Dynamic based on motherboard JSON
     */
    // renderMemorySlots() {
    //     const ramComponents = this.selectedComponents.ram;
    //     const motherboardData = this.motherboardDetails;

    //     if (!motherboardData || !motherboardData.memory) {
    //         // Fallback to 4 slots if no motherboard data
    //         let html = '';
    //         for (let i = 0; i < 4; i++) {
    //             const ram = ramComponents[i];
    //             html += `
    //                 <div class="memory-slot">
    //                     <span class="slot-label">RAM ${i + 1} (288-pin DIMM)</span>
    //                     <span class="${ram ? 'slot-component' : 'slot-empty'}">${ram ? ram.serial_number : 'Empty'}</span>
    //                 </div>
    //             `;
    //         }
    //         return html;
    //     }

    //     const memorySlots = motherboardData.memory.slots || 4;
    //     const memoryType = motherboardData.memory.type || 'DIMM';
    //     let html = '';

    //     for (let i = 0; i < memorySlots; i++) {
    //         const ram = ramComponents[i];
    //         html += `
    //             <div class="memory-slot">
    //                 <span class="slot-label">RAM ${i + 1} (${memoryType})</span>
    //                 <span class="${ram ? 'slot-component' : 'slot-empty'}">${ram ? ram.serial_number : 'Empty'}</span>
    //             </div>
    //         `;
    //     }

    //     return html;
    // }
    /**
* Render memory slots - Dynamic based on motherboard JSON
*/
    renderMemorySlots() {
        const ramComponents = this.selectedComponents.ram;
        const motherboardData = this.motherboardDetails;

        const memorySlots = this.memorySlotTotal();
        const memoryType = motherboardData?.memory?.type || '288-pin DIMM';
        const noneInstalled = ramComponents.length === 0;

        let html = '<div class="dimm-grid">';
        for (let i = 0; i < memorySlots; i++) {
            const ram = ramComponents[i];
            const label = `DIMM ${String(i + 1).padStart(2, '0')}`;

            if (ram) {
                html += `
                <div class="dimm-cell is-filled" onclick="window.serverBuilder.toggleSlotPopover(event, this)">
                    <span class="dimm-cell-label">${label} · ${memoryType}</span>
                    <span class="dimm-cell-name">${this.escapeHtml(ram.component_name || ram.serial_number || 'DIMM')}</span>
                    ${ram.component_name && ram.serial_number ? `<span class="dimm-cell-serial">${this.escapeHtml(ram.serial_number)}</span>` : ''}
                    ${this.renderSlotPopover('ram', ram, label)}
                </div>`;
            } else {
                const required = noneInstalled && i === 0;
                html += `
                <div class="dimm-cell ${required ? 'is-required' : 'is-empty'}" onclick="window.serverBuilder.addComponent('ram')" title="${label} — click to install memory">
                    <span class="dimm-cell-label">${label} · ${memoryType}</span>
                    <span class="dimm-cell-state${required ? ' is-required-text' : ''}">${required ? 'Required' : 'Empty'}</span>
                </div>`;
            }
        }
        html += '</div>';

        return html;
    }

    /**
     * Render expansion slots - Dynamic based on motherboard JSON
     */
    // renderExpansionSlots() {
    //     const pcieComponents = this.selectedComponents.pciecard || [];
    //     const hbaComponents = this.selectedComponents.hbacard || [];
    //     const nicComponents = this.selectedComponents.nic || [];
    //     const motherboardData = this.motherboardDetails;

    //     if (!motherboardData || !motherboardData.expansion_slots) {
    //         // Fallback to basic PCIe slots
    //         return `
    //             <div class="expansion-slot">
    //                 <span class="slot-label">PCIe 1 (x16)</span>
    //                 <span class="slot-component">${pcieComponents.length > 0 ? pcieComponents[0].serial_number : 'Empty'}</span>
    //             </div>
    //             <div class="expansion-slot">
    //                 <span class="slot-label">PCIe 2 (x1)</span>
    //                 <span class="slot-empty">Empty</span>
    //             </div>
    //         `;
    //     }

    //     let html = '';
    //     let componentIndex = 0;
    //     const allExpansionComponents = [...pcieComponents, ...hbaComponents, ...nicComponents];

    //     // Handle regular PCIe slots
    //     if (motherboardData.expansion_slots.pcie_slots) {
    //         motherboardData.expansion_slots.pcie_slots.forEach((slotGroup, groupIndex) => {
    //             const slotCount = slotGroup.count || 1;
    //             const slotType = slotGroup.type || 'PCIe';

    //             for (let i = 0; i < slotCount; i++) {
    //                 const component = allExpansionComponents[componentIndex];
    //                 html += `
    //                     <div class="expansion-slot">
    //                         <span class="slot-label">${slotType} Slot ${componentIndex + 1}</span>
    //                         <span class="${component ? 'slot-component' : 'slot-empty'}">${component ? component.serial_number : 'Empty'}</span>
    //                     </div>
    //                 `;
    //                 componentIndex++;
    //             }
    //         });
    //     }

    //     // Handle riser slots if present
    //     if (motherboardData.expansion_slots.riser_slots) {
    //         motherboardData.expansion_slots.riser_slots.forEach((riserGroup, groupIndex) => {
    //             const riserCount = riserGroup.count || 1;
    //             const riserType = riserGroup.type || 'Riser';

    //             for (let i = 0; i < riserCount; i++) {
    //                 html += `
    //                     <div class="expansion-slot">
    //                         <span class="slot-label">${riserType} ${i + 1}</span>
    //                         <span class="slot-empty">Empty</span>
    //                     </div>
    //                 `;
    //             }
    //         });
    //     }

    //     // Handle specialty slots (OCP, etc.)
    //     if (motherboardData.expansion_slots.specialty_slots) {
    //         motherboardData.expansion_slots.specialty_slots.forEach((specialtySlot, index) => {
    //             html += `
    //                 <div class="expansion-slot">
    //                     <span class="slot-label">${specialtySlot.type} Slot</span>
    //                     <span class="slot-empty">Empty</span>
    //                 </div>
    //             `;
    //         });
    //     }

    //     return html || '<div class="expansion-slot"><span class="slot-label">No expansion slots</span></div>';
    // }
    /**
     * Render expansion slots - Dynamic based on motherboard JSON
     */
    // renderExpansionSlots() {
    //     const pcieComponents = this.selectedComponents.pciecard || [];
    //     const hbaComponents = this.selectedComponents.hbacard || [];
    //     const nicComponents = this.selectedComponents.nic || [];
    //     const motherboardData = this.motherboardDetails;

    //     // Combine all expansion components
    //     const allExpansionComponents = [
    //         ...pcieComponents.map(comp => ({ ...comp, type: 'pcie' })),
    //         ...hbaComponents.map(comp => ({ ...comp, type: 'hba' })),
    //         ...nicComponents.map(comp => ({ ...comp, type: 'nic' }))
    //     ];

    //     if (!motherboardData || !motherboardData.expansion_slots) {
    //         // Fallback to basic PCIe slots
    //         let html = '';
    //         const totalSlots = Math.max(4, allExpansionComponents.length);

    //         for (let i = 0; i < totalSlots; i++) {
    //             const component = allExpansionComponents[i];
    //             html += `
    //                 <div class="expansion-slot ${component ? 'occupied' : 'empty'}">
    //                     <span class="slot-label">PCIe Slot ${i + 1}</span>
    //                     <span class="${component ? 'slot-component' : 'slot-empty'}">
    //                         ${component ? component.serial_number : 'Empty'}
    //                     </span>
    //                 </div>
    //             `;
    //         }
    //         return html;
    //     }

    //     let html = '';
    //     let componentIndex = 0;

    //     // Handle regular PCIe slots
    //     if (motherboardData.expansion_slots.pcie_slots) {
    //         motherboardData.expansion_slots.pcie_slots.forEach((slotGroup, groupIndex) => {
    //             const slotCount = slotGroup.count || 1;
    //             const slotType = slotGroup.type || 'PCIe';

    //             for (let i = 0; i < slotCount; i++) {
    //                 const component = allExpansionComponents[componentIndex];
    //                 html += `
    //                     <div class="expansion-slot ${component ? 'occupied' : 'empty'}">
    //                         <span class="slot-label">${slotType} Slot ${componentIndex + 1}</span>
    //                         <span class="${component ? 'slot-component' : 'slot-empty'}">
    //                             ${component ? component.serial_number : 'Empty'}
    //                         </span>
    //                     </div>
    //                 `;
    //                 componentIndex++;
    //             }
    //         });
    //     }

    //     return html || '<div class="expansion-slot empty"><span class="slot-label">No expansion slots</span></div>';
    // }
    /**
     * Render expansion slots using hardware.slots API data for correct slot mapping.
     * Falls back to sequential assignment when slot data is unavailable.
     */
    renderExpansionSlots() {
        const pcieComponents = this.selectedComponents.pciecard || [];
        const riserComponents = this.selectedComponents.risercard || [];
        const hbaComponents = this.selectedComponents.hbacard || [];
        // Filter out onboard NICs - they render in renderAllNICs()
        const nicComponents = (this.selectedComponents.nic || []).filter(n => !n.uuid?.startsWith('onboard-'));

        // Build UUID → component lookup map with type metadata
        const componentMap = new Map();
        pcieComponents.forEach(c => componentMap.set(c.uuid, { ...c, type: 'PCIe Card', typeIcon: 'fas fa-credit-card', compType: 'pciecard' }));
        // Risers sit in riser bays, rendered by the Riser Slots block below — but they
        // resolve through this same map, so they must be in it or those rows read empty.
        riserComponents.forEach(c => componentMap.set(c.uuid, { ...c, type: 'Riser Card', typeIcon: 'fas fa-layer-group', compType: 'risercard' }));
        hbaComponents.forEach(c => componentMap.set(c.uuid, { ...c, type: 'HBA Card', typeIcon: 'fas fa-hdd', compType: 'hbacard' }));
        nicComponents.forEach(c => componentMap.set(c.uuid, { ...c, type: 'Network Card', typeIcon: 'fas fa-network-wired', compType: 'nic' }));

        const noSlotsHtml = '<div class="hw-slot is-empty"><div class="hw-slot-main"><span class="hw-slot-label">No expansion slots</span></div></div>';
        const slotData = this.slotAssignments?.pcie;
        const slotTypes = ['x16', 'x8', 'x4'];

        // If we have API slot data, use it for correct placement
        if (slotData && slotData.total_slots) {
            let html = '';
            const usedSlots = slotData.used_slots || {};

            slotTypes.forEach(type => {
                const slots = slotData.total_slots[type];
                if (!slots || slots.length === 0) return;

                html += `<div class="slot-group-header">PCIe ${type.toUpperCase()} Slots</div>`;

                slots.forEach((slotName, idx) => {
                    const assignedUuid = usedSlots[slotName];
                    const component = assignedUuid ? componentMap.get(assignedUuid) : null;

                    html += this.renderHwSlotRow({
                        label: `${type.toUpperCase()} Slot ${idx + 1}`,
                        badge: slotName.replace(/_/g, ' '),
                        component,
                        emptyType: 'pciecard',
                        icon: component?.typeIcon || '',
                        extraHtml: component && component.type === 'Network Card' ? this.renderSFPPorts(component.uuid) : ''
                    });
                });
            });

            // Render riser slots if available
            const riserData = this.slotAssignments?.riser;
            if (riserData && riserData.total_slots) {
                const riserUsed = riserData.used_slots || {};
                const hasRiserSlots = Object.values(riserData.total_slots).some(arr => arr && arr.length > 0);

                if (hasRiserSlots) {
                    html += `
                    <div class="flex items-center justify-between gap-3 mt-3 mb-1.5">
                        <span class="slot-group-header !m-0">Riser Slots</span>
                        <span class="flex items-center gap-2">${this.renderMeter(riserData.used_count || 0, riserData.total_count || 0)}</span>
                    </div>`;

                    slotTypes.forEach(type => {
                        const slots = riserData.total_slots[type];
                        if (!slots || slots.length === 0) return;

                        slots.forEach((slotName, idx) => {
                            const assignedUuid = riserUsed[slotName];
                            const component = assignedUuid ? componentMap.get(assignedUuid) : null;

                            html += this.renderHwSlotRow({
                                label: `Riser ${type.toUpperCase()} ${idx + 1}`,
                                badge: slotName.replace(/_/g, ' '),
                                component,
                                emptyType: 'risercard',
                                icon: component?.typeIcon || ''
                            });
                        });
                    });
                }
            }

            return html || noSlotsHtml;
        }

        // Fallback: no slot assignment data — sequential placement
        const allExpansionComponents = [
            ...pcieComponents.map(c => ({ ...c, type: 'PCIe Card', typeIcon: 'fas fa-credit-card', compType: 'pciecard' })),
            ...riserComponents.map(c => ({ ...c, type: 'Riser Card', typeIcon: 'fas fa-layer-group', compType: 'risercard' })),
            ...hbaComponents.map(c => ({ ...c, type: 'HBA Card', typeIcon: 'fas fa-hdd', compType: 'hbacard' })),
            ...nicComponents.map(c => ({ ...c, type: 'Network Card', typeIcon: 'fas fa-network-wired', compType: 'nic' }))
        ];

        const motherboardData = this.motherboardDetails;
        let html = '';

        if (!motherboardData || !motherboardData.expansion_slots) {
            const totalSlots = Math.max(4, allExpansionComponents.length);
            for (let i = 0; i < totalSlots; i++) {
                const component = allExpansionComponents[i];
                html += this.renderHwSlotRow({
                    label: `PCIe Slot ${i + 1}`,
                    component: component || null,
                    emptyType: 'pciecard',
                    icon: component?.typeIcon || ''
                });
            }
            return html;
        }

        let componentIndex = 0;
        if (motherboardData.expansion_slots.pcie_slots) {
            motherboardData.expansion_slots.pcie_slots.forEach(slotGroup => {
                const slotCount = slotGroup.count || 1;
                const slotType = slotGroup.type || 'PCIe';

                for (let i = 0; i < slotCount; i++) {
                    const component = allExpansionComponents[componentIndex];
                    html += this.renderHwSlotRow({
                        label: `${slotType} Slot ${componentIndex + 1}`,
                        component: component || null,
                        emptyType: 'pciecard',
                        icon: component?.typeIcon || ''
                    });
                    componentIndex++;
                }
            });
        }

        return html || noSlotsHtml;
    }

    /**
     * Render onboard NICs from hardware.network data with SFP port indicators.
     */
    renderAllNICs() {
        const allNics = this.networkConfig?.nics || [];
        if (allNics.length === 0) return '';

        let html = '';
        allNics.forEach(nic => {
            const specs = nic.specifications || {};
            const isOnboard = nic.source_type === 'onboard';
            const portCount = specs.ports || 0;
            const connectorType = specs.connector || specs.port_type || '';
            const isSfpConnector = /sfp/i.test(connectorType);

            // Display name: onboard uses controller, component uses model
            const displayName = isOnboard
                ? (specs.controller || nic.uuid)
                : (specs.model || specs.controller || nic.uuid);

            // Port speed summary
            const speedInfo = isOnboard
                ? `${portCount}× ${specs.speed || ''} ${specs.connector || ''}`
                : `${portCount}× ${(specs.speeds || [])[0] || ''} ${specs.port_type || ''}`;

            // Add-in NICs map back to a removable inventory component
            const nicComp = !isOnboard
                ? (this.selectedComponents.nic || []).find(n => n.uuid === nic.uuid)
                : null;
            const clickable = !!nicComp;

            html += `
            <div class="hw-slot is-filled is-stack ${clickable ? '' : '!cursor-default'}"${clickable ? ` onclick="window.serverBuilder.toggleSlotPopover(event, this)"` : ''}>
                <div class="flex justify-between items-center w-full gap-3 min-w-0">
                    <div class="hw-slot-main">
                        <span class="hw-slot-label">${isOnboard ? 'Onboard NIC' : 'NIC Card'}</span>
                        <span class="slot-type-badge">${isOnboard ? 'onboard' : 'add-in'}</span>
                    </div>
                    <div class="hw-slot-main justify-end">
                        <i class="fas fa-network-wired text-primary text-xs"></i>
                        <span class="hw-slot-name">${this.escapeHtml(displayName)}</span>
                        <span class="hw-slot-serial">${this.escapeHtml(speedInfo.trim())}</span>
                    </div>
                </div>
                ${isSfpConnector ? this.renderSFPPorts(nic.uuid, portCount) : ''}
                ${!isSfpConnector && portCount > 0 ? this.renderRJ45Ports(portCount, connectorType) : ''}
                ${nicComp ? this.renderSlotPopover('nic', nicComp, isOnboard ? 'Onboard' : 'Add-in NIC') : ''}
            </div>`;
        });

        return html;
    }

    /**
     * Render RJ45 port indicators for copper NICs.
     * Shows port count with visual indicators.
     */
    renderRJ45Ports(portCount, connectorType) {
        if (portCount === 0) return '';

        let html = `
        <div class="nic-port-row">
            <span class="nic-port-label">${connectorType || 'RJ45'}</span>`;

        for (let i = 0; i < portCount; i++) {
            html += `
            <div class="rj45-port active" title="Port ${i + 1} - ${connectorType || 'RJ45'}">
                ${i + 1}
            </div>`;
        }

        html += `<span class="hw-meter-count ml-1">${portCount} ports</span>`;
        html += `</div>`;
        return html;
    }

    /** @deprecated Use renderAllNICs() instead */
    renderOnboardNICs() {
        return this.renderAllNICs();
    }

    /**
     * Render SFP port indicators for a given NIC.
     * Shows populated/empty port cages based on matched SFP modules.
     */
    renderSFPPorts(nicUuid, portCountOverride) {
        // Determine port count from networkConfig or override
        let portCount = portCountOverride || 0;
        if (!portCount && this.networkConfig?.nics) {
            const nic = this.networkConfig.nics.find(n => n.uuid === nicUuid);
            portCount = nic?.specifications?.ports || 0;
        }
        if (portCount === 0) return '';

        // Match SFP modules to this NIC
        // SFP modules may reference parent via slot_position containing NIC UUID
        const sfpModules = (this.selectedComponents.sfp || []).filter(sfp => {
            return sfp.slot_position?.includes(nicUuid) || sfp.parent_nic_uuid === nicUuid;
        });

        // If no explicit linkage, distribute SFPs to first onboard NIC as best guess
        let effectiveSfps = sfpModules;
        if (effectiveSfps.length === 0 && nicUuid?.startsWith('onboard-')) {
            effectiveSfps = this.selectedComponents.sfp || [];
        }

        let html = `
        <div class="nic-port-row">
            <span class="nic-port-label">SFP</span>`;

        for (let i = 0; i < portCount; i++) {
            const sfp = effectiveSfps[i];
            if (sfp) {
                html += `
                <div class="sfp-port populated" title="${this.escapeHtml(sfp.component_name || sfp.serial_number || 'SFP Module')}"></div>`;
            } else {
                html += `
                <div class="sfp-port empty-port" title="Port ${i + 1} — Empty, click to add SFP" onclick="event.stopPropagation(); window.serverBuilder.addComponent('sfp')"></div>`;
            }
        }

        // Show SFP count summary
        const populatedCount = Math.min(effectiveSfps.length, portCount);
        html += `<span class="hw-meter-count ml-1">${populatedCount}/${portCount}</span>`;
        html += `</div>`;

        return html;
    }


    /**
     * Render storage - Dynamic based on motherboard JSON
     */
    // renderStorageAndUSB() {
    //     const motherboardData = this.motherboardDetails;
    //     const storageComponents = this.selectedComponents.storage || [];

    //     if (!motherboardData || !motherboardData.storage) {
    //         // Fallback with dynamic storage components
    //         let html = '';

    //         // Show occupied storage slots first
    //         storageComponents.forEach((storage, index) => {
    //             html += `
    //                 <div class="expansion-slot occupied">
    //                     <span class="slot-label">Storage ${index + 1}</span>
    //                     <span class="slot-component">
    //                         <div class="component-with-type">
    //                             <i class="fas fa-hdd"></i>
    //                             <span class="component-type">Storage:</span>
    //                             <span class="component-name">${storage.serial_number}</span>
    //                         </div>
    //                     </span>
    //                 </div>
    //             `;
    //         });

    //         // Show available slots
    //         const remainingSlots = Math.max(2, 4 - storageComponents.length);
    //         for (let i = 0; i < remainingSlots; i++) {
    //             html += `
    //                 <div class="expansion-slot empty">
    //                     <span class="slot-label">Storage ${storageComponents.length + i + 1}</span>
    //                     <span class="slot-empty">Available</span>
    //                 </div>
    //             `;
    //         }

    //         return html;
    //     }

    //     let html = '';
    //     let storageIndex = 0;

    //     // M.2 NVMe slots
    //     if (motherboardData.storage.nvme && motherboardData.storage.nvme.m2_slots) {
    //         motherboardData.storage.nvme.m2_slots.forEach((m2Group, index) => {
    //             const m2Count = m2Group.count || 0;
    //             const formFactors = m2Group.form_factors ? m2Group.form_factors.join(', ') : 'M.2';

    //             for (let i = 0; i < m2Count; i++) {
    //                 const storage = storageComponents[storageIndex];
    //                 html += `
    //                     <div class="expansion-slot ${storage ? 'occupied' : 'empty'}">
    //                         <span class="slot-label">M.2 Slot ${i + 1} (${formFactors})</span>
    //                         <span class="${storage ? 'slot-component' : 'slot-empty'}">
    //                             ${storage ? `
    //                                 <div class="component-with-type">
    //                                     <i class="fas fa-hdd"></i>
    //                                     <span class="component-type">NVMe:</span>
    //                                     <span class="component-name">${storage.serial_number}</span>
    //                                 </div>
    //                             ` : 'Empty'}
    //                         </span>
    //                     </div>
    //                 `;
    //                 if (storage) storageIndex++;
    //             }
    //         });
    //     }

    //     // SATA ports
    //     if (motherboardData.storage.sata) {
    //         const sataPorts = motherboardData.storage.sata.ports || 0;
    //         if (sataPorts > 0) {
    //             // Show occupied SATA devices
    //             for (let i = 0; i < sataPorts && storageIndex < storageComponents.length; i++) {
    //                 const storage = storageComponents[storageIndex];
    //                 if (storage) {
    //                     html += `
    //                         <div class="expansion-slot occupied">
    //                             <span class="slot-label">SATA Port ${i + 1}</span>
    //                             <span class="slot-component">
    //                                 <div class="component-with-type">
    //                                     <i class="fas fa-hdd"></i>
    //                                     <span class="component-type">SATA:</span>
    //                                     <span class="component-name">${storage.serial_number}</span>
    //                                 </div>
    //                             </span>
    //                         </div>
    //                     `;
    //                     storageIndex++;
    //                 }
    //             }
    //             // Show remaining empty SATA ports
    //             const remainingSataPorts = sataPorts - (storageComponents.length - storageIndex);
    //             for (let i = 0; i < remainingSataPorts; i++) {
    //                 html += `
    //                     <div class="expansion-slot empty">
    //                         <span class="slot-label">SATA Port ${storageIndex + i + 1}</span>
    //                         <span class="slot-empty">Available</span>
    //                     </div>
    //                 `;
    //             }
    //         }
    //     }

    //     return html || '<div class="expansion-slot empty"><span class="slot-label">No storage info</span></div>';
    // }
    /**
     * Render drive bay connectivity using storage_connectivity API data.
     * Shows a grid of drive bay cells with interface color coding.
     * Falls back to M.2 slot display if no API data is available.
     */
    renderStorageConnectivity() {
        const conn = this.storageConnectivity;

        if (!conn) return this.renderStorageAndUSB();

        const { drive_bays, connections } = conn;
        const backplaneInterface = connections[0]?.backplane_interface || null;

        // Find the HBA card that acts as controller
        const controllerUuid = connections[0]?.controller_uuid;
        const hbaCard = controllerUuid
            ? (this.selectedComponents.hbacard || []).find(h => h.uuid === controllerUuid)
            : null;

        let html = '';

        // Connection path: HBA → Backplane → Bays
        if (hbaCard || backplaneInterface) {
            html += `
            <div class="connection-path">
                ${hbaCard ? `
                <i class="fas fa-hdd"></i>
                <span class="font-medium">${this.escapeHtml(hbaCard.component_name || 'HBA Card')}</span>
                <i class="fas fa-long-arrow-alt-right"></i>` : ''}
                <span>Backplane</span>
                ${backplaneInterface ? `<span class="interface-badge ${this._getInterfaceClass(backplaneInterface)}">${backplaneInterface}</span>` : ''}
                <i class="fas fa-long-arrow-alt-right"></i>
                <span>${drive_bays.total} drive bays · ${drive_bays.available} free</span>
            </div>`;
        }

        // Build bay map: bay_number → connection data.
        // Only chassis-bay drives belong in the drive-bay grid. Drives on a PCIe M.2
        // adapter (or otherwise not bay-connected) carry a positional bay_number but
        // are not in a chassis bay — they are shown in the M.2 Slots section instead.
        const bayMap = new Map();
        connections.forEach(c => {
            if ((c.connection_type || '') === 'chassis_bay' && c.bay_number != null) {
                bayMap.set(c.bay_number, c);
            }
        });

        // Drive bay grid
        const displayBays = Math.min(drive_bays.total, 48); // Cap at 48 for display
        html += `<div class="drive-bay-grid">`;

        for (let bay = 1; bay <= displayBays; bay++) {
            const bayConn = bayMap.get(bay);
            const bayLabel = `Bay ${String(bay).padStart(2, '0')}`;

            if (bayConn) {
                const interfaceClass = this._getInterfaceClass(bayConn.storage_interface);
                const compatIcon = bayConn.compatibility === 'native' ? 'fas fa-check-circle text-success'
                    : bayConn.compatibility === 'backward_compatible' ? 'fas fa-exchange-alt text-warning'
                    : 'fas fa-exclamation-triangle text-danger';

                // Resolve back to a removable storage component when possible
                const storageComp = bayConn.storage_uuid
                    ? (this.selectedComponents.storage || []).find(s => s.uuid === bayConn.storage_uuid)
                    : null;
                const popoverComp = storageComp || { component_name: bayConn.storage_name, serial_number: bayConn.storage_serial || '' };
                const extraRows = `
                    ${bayConn.storage_interface ? `<div class="slot-popover-row"><span class="k">Interface</span><span class="v">${this.escapeHtml(bayConn.storage_interface)}</span></div>` : ''}
                    ${bayConn.compatibility ? `<div class="slot-popover-row"><span class="k">Compatibility</span><span class="v">${this.escapeHtml(bayConn.compatibility.replace(/_/g, ' '))}</span></div>` : ''}`;

                html += `
                <div class="drive-bay-cell occupied" title="${this.escapeHtml(bayConn.description || '')}" onclick="window.serverBuilder.toggleSlotPopover(event, this)">
                    <div class="flex items-center justify-between gap-1">
                        <span class="bay-number">${bayLabel}</span>
                        <span class="interface-badge ${interfaceClass} !text-[8px] !px-1 !py-0">${this._shortInterface(bayConn.storage_interface)}</span>
                    </div>
                    <div class="bay-drive-name">${this.escapeHtml(bayConn.storage_name || 'Drive')}</div>
                    <div class="mt-0.5"><i class="${compatIcon} text-[9px]" title="${bayConn.compatibility || ''}"></i></div>
                    ${this.renderSlotPopover(storageComp ? 'storage' : null, popoverComp, bayLabel, extraRows)}
                </div>`;
            } else {
                html += `
                <div class="drive-bay-cell empty" title="${bayLabel} — Empty, click to add storage" onclick="window.serverBuilder.addComponent('storage')">
                    <span class="bay-number">${bayLabel}</span>
                    <span class="bay-state">Empty</span>
                </div>`;
            }
        }

        html += `</div>`;

        return html;
    }

    /**
     * Get CSS class for a storage interface type.
     */
    _getInterfaceClass(iface) {
        if (!iface) return '';
        const lower = iface.toLowerCase();
        if (lower.includes('nvme')) return 'interface-nvme';
        if (lower.includes('sata')) return 'interface-sata';
        if (lower.includes('sas')) return 'interface-sas';
        if (lower.includes('pcie')) return 'interface-pcie';
        return '';
    }

    /**
     * Get short label for storage interface.
     */
    _shortInterface(iface) {
        if (!iface) return '';
        if (/nvme/i.test(iface)) return 'NVMe';
        if (/sata/i.test(iface)) return 'SATA';
        if (/sas/i.test(iface)) return 'SAS';
        return iface;
    }

    /**
     * Render M.2 slots from hardware.slots.m2 or motherboard JSON data.
     * Returns empty string if no M.2 slots exist.
     */
    renderM2Slots() {
        const m2Data = this.slotAssignments?.m2;
        const motherboardData = this.motherboardDetails;

        // Try API slot data first
        if (m2Data && m2Data.total_count > 0) {
            let html = '';

            // Motherboard M.2 slots
            if (m2Data.motherboard_slots && m2Data.motherboard_slots.total > 0) {
                const assignments = m2Data.motherboard_slots.assignments || [];
                const total = m2Data.motherboard_slots.total;

                for (let i = 0; i < total; i++) {
                    const assignment = assignments[i];
                    html += this.renderHwSlotRow({
                        label: `M.2 Slot ${i + 1}`,
                        badge: 'NVMe',
                        component: assignment ? { ...assignment, compType: assignment.uuid ? 'storage' : null } : null,
                        emptyType: 'storage',
                        icon: 'fas fa-hdd'
                    });
                }
            }

            // Expansion card M.2 slots (e.g. a PCIe → M.2 NVMe adapter card).
            if (m2Data.expansion_card_slots && m2Data.expansion_card_slots.total > 0) {
                html += `<div class="slot-group-header mt-3">Expansion Card M.2</div>`;
                const providers = m2Data.expansion_card_slots.providers || [];

                // Occupancy is derived from the actual pcie_adapter storage connections
                // (reliable), not from provider.used_slots — the slot tracker only counts
                // adapter usage via a slot_position field that adapter drives don't carry.
                // Drives are consumed in order to fill slots across providers.
                const adapterDrives = (this.storageConnectivity?.connections || [])
                    .filter(c => (c.connection_type || '') === 'pcie_adapter');
                let driveIdx = 0;

                providers.forEach(provider => {
                    const total = provider.m2_slots_provided || 0;
                    const cardLabel = provider.model || provider.card_name || 'Expansion';

                    for (let i = 0; i < total; i++) {
                        const drive = driveIdx < adapterDrives.length ? adapterDrives[driveIdx++] : null;
                        if (drive) {
                            html += this.renderHwSlotRow({
                                label: `${cardLabel} M.2 ${i + 1}`,
                                badge: 'NVMe',
                                icon: 'fas fa-hdd',
                                component: { component_name: drive.storage_name, serial_number: drive.serial_number, uuid: drive.storage_uuid, compType: 'storage' }
                            });
                        } else {
                            html += this.renderHwSlotRow({
                                label: `${cardLabel} M.2 ${i + 1}`,
                                badge: 'NVMe',
                                emptyType: 'storage'
                            });
                        }
                    }
                });
            }

            return html;
        }

        // Fallback: try motherboard JSON data
        if (motherboardData?.storage?.nvme?.m2_slots) {
            let html = '';
            motherboardData.storage.nvme.m2_slots.forEach((m2Group, groupIndex) => {
                const m2Count = m2Group.count || 0;
                const formFactors = m2Group.form_factors ? m2Group.form_factors.join(', ') : 'M.2';

                for (let i = 0; i < m2Count; i++) {
                    html += this.renderHwSlotRow({
                        label: `M.2 Slot ${groupIndex * m2Count + i + 1}`,
                        badge: formFactors,
                        emptyType: 'storage'
                    });
                }
            });
            return html;
        }

        return '';
    }

    /**
     * Render storage - Only show M.2 slots from motherboard JSON
     */
    renderStorageAndUSB() {
        const motherboardData = this.motherboardDetails;
        const storageComponents = this.selectedComponents.storage || [];

        if (!motherboardData || !motherboardData.storage) {
            // If no motherboard data, show basic storage slots
            let html = '';

            // Show occupied storage slots first
            storageComponents.forEach((storage, index) => {
                html += this.renderHwSlotRow({
                    label: `Storage ${index + 1}`,
                    component: { ...storage, compType: 'storage' },
                    emptyType: 'storage',
                    icon: 'fas fa-hdd'
                });
            });

            // Show available slots only if we have storage components
            const remainingSlots = Math.max(2, 4 - storageComponents.length);
            for (let i = 0; i < remainingSlots; i++) {
                html += this.renderHwSlotRow({
                    label: `Storage ${storageComponents.length + i + 1}`,
                    emptyType: 'storage',
                    emptyText: 'Available'
                });
            }

            return html || '<div class="hw-slot is-empty"><div class="hw-slot-main"><span class="hw-slot-label">No storage info</span></div></div>';
        }

        let html = '';
        let storageIndex = 0;

        // ONLY show M.2 NVMe slots - hide SAS, SATA, and U.2
        if (motherboardData.storage.nvme && motherboardData.storage.nvme.m2_slots) {
            motherboardData.storage.nvme.m2_slots.forEach((m2Group, groupIndex) => {
                const m2Count = m2Group.count || 0;
                const formFactors = m2Group.form_factors ? m2Group.form_factors.join(', ') : 'M.2';

                for (let i = 0; i < m2Count; i++) {
                    const storage = storageComponents[storageIndex];
                    html += this.renderHwSlotRow({
                        label: `M.2 Slot ${groupIndex * m2Count + i + 1}`,
                        badge: formFactors,
                        component: storage ? { ...storage, compType: 'storage' } : null,
                        emptyType: 'storage',
                        icon: 'fas fa-hdd'
                    });
                    if (storage) storageIndex++;
                }
            });
        }

        // REMOVED: U.2 slots, SATA ports, and SAS ports sections

        // If no M.2 slots found in motherboard data but we have storage components, show them
        if (html === '' && storageComponents.length > 0) {
            storageComponents.forEach((storage, index) => {
                html += this.renderHwSlotRow({
                    label: `Storage ${index + 1}`,
                    component: { ...storage, compType: 'storage' },
                    emptyType: 'storage',
                    icon: 'fas fa-hdd'
                });
            });
        }

        return html || '<div class="hw-slot is-empty"><div class="hw-slot-main"><span class="hw-slot-label">No M.2 slots available</span></div></div>';
    }

    /**
     * Calculate estimated power consumption
     */
    calculateEstimatedPower() {
        let totalPower = 0;

        Object.keys(this.selectedComponents).forEach(type => {
            const components = this.selectedComponents[type];
            if (Array.isArray(components)) {
                components.forEach(comp => {
                    // Mock power consumption based on component type
                    const powerMap = {
                        cpu: 150,
                        motherboard: 50,
                        ram: 10,
                        storage: 15,
                        chassis: 0,
                        caddy: 0,
                        pciecard: 75,
                        risercard: 0,
                        nic: 25
                    };
                    totalPower += powerMap[type] || 0;
                });
            }
        });

        return totalPower || 374; // Default fallback
    }

    /**
     * Add component to configuration
     */
    async addComponent(type) {
        try {

            if (!this.currentConfig || !this.currentConfig.config_uuid) {
                this.showAlert('No server configuration loaded', 'error');
                return;
            }

            // Single enforcement point: the component table, the empty-slot
            // "Install" rows in the Server Usage tree and the issue-panel actions
            // all arrive here, so the capacity check belongs here rather than at
            // each call site.
            //
            // The bench deliberately skips it: "this build is full" is itself one of
            // the answers a user comes here to get, so they must be able to TRY. The
            // backend still refuses the add, and the refusal is logged as a result
            // rather than swallowed by a client-side guard.
            if (!this.isSandbox && !this.buildState.canAdd(type)) {
                this.showAlert(this.buildState.capacityLabel(type) || `No capacity for ${type} in this build`, 'warning');
                return;
            }

            const configUuid = this.currentConfig.config_uuid;

            // Remember what was added so the relevant slot can be highlighted
            // when the user returns from the selection flow
            try { sessionStorage.setItem('bdc_builder_focus', type); } catch (e) { /* sessionStorage unavailable */ }

            // Special handling for SFP - show NIC selection modal first
            if (type === 'sfp') {
                await this.openNICSelectionModal();
                return;
            }

            // Always redirect to external configuration page (same as server index).
            // return=bench sends the picker back to Server Compatibility instead of
            // the Servers page, and is what tells it to log add verdicts.
            const returnTo = this.isSandbox ? 'bench' : 'builder';
            window.location.href = `../../pages/server/configuration.html?config=${configUuid}&type=${type}&return=${returnTo}`;
        } catch (error) {
            console.error('Error adding component:', error);
            this.showAlert(error.message || 'Failed to open component selection', 'error');
        }
    }

    /**
     * Remove component from configuration.
     *
     * serialNumber identifies WHICH physical unit to remove when several units of
     * the same model sit in one config (four identical M.2 adapters, a bank of
     * matching DIMMs). Without it the backend cannot tell them apart: it refuses
     * outright for pciecard/nic/hbacard, and for cpu/ram/storage/caddy it silently
     * removes the first matching entry rather than the one clicked.
     */
    async removeComponent(type, uuid, serialNumber = null) {
        if (!confirm('Are you sure you want to remove this component?')) {
            return;
        }

        try {
            this.showLoading('Removing component...');

            const result = await serverAPI.removeComponentFromServer(
                this.currentConfig.config_uuid,
                type,
                uuid,
                { serial_number: serialNumber }
            );

            if (result.success) {
                this.showAlert('Component removed successfully', 'success');
                await this.loadExistingConfig(this.currentConfig.config_uuid);
            } else {
                this.showAlert(result.message || 'Failed to remove component', 'danger');
            }
        } catch (error) {
            console.error('Error removing component:', error);
            this.showAlert(error.message || 'Failed to remove component', 'danger');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Get total issues count
     */
    getTotalIssuesCount() {
        return this.compatibilityIssues.length + this.performanceWarnings.length;
    }

    /**
     * Get issues resolved count
     */
    getIssuesResolvedCount() {
        // For now, assume all issues are unresolved. In a real implementation,
        // this would track which issues have been addressed.
        return 0;
    }

    /**
     * Get issues resolved percentage
     */
    getIssuesResolvedPercentage() {
        const total = this.getTotalIssuesCount();
        if (total === 0) return 100;
        return Math.round((this.getIssuesResolvedCount() / total) * 100);
    }

    /**
     * Render grouped issues
     */
    renderGroupedIssues() {
        const allIssues = [...this.compatibilityIssues, ...this.performanceWarnings];
        const groupedIssues = this.groupIssuesByCategory(allIssues);

        return Object.keys(groupedIssues).map(groupKey => {
            const groupIssues = groupedIssues[groupKey];
            const groupTitle = this.getGroupTitle(groupKey);
            const groupIcon = this.getGroupIcon(groupKey);

            return `
                <div class="issues-group expanded">
                    <div class="issues-group-header">
                        <i class="fas fa-chevron-down group-caret"></i>
                        <i class="${groupIcon} group-icon"></i>
                        <span class="group-title">${groupTitle}</span>
                        <span class="group-count">${groupIssues.length}</span>
                    </div>
                    <div class="issues-group-content">
                        ${groupIssues.map(issue => this.renderIssueItem(issue)).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Group issues by category
     */
    groupIssuesByCategory(issues) {
        const groups = {};
        issues.forEach(issue => {
            const group = issue.group || 'general';
            if (!groups[group]) {
                groups[group] = [];
            }
            groups[group].push(issue);
        });
        return groups;
    }

    /**
     * Get group title
     */
    getGroupTitle(groupKey) {
        const titles = {
            'required_components': 'Required Components',
            'cooling': 'Cooling System',
            'memory': 'Memory Configuration',
            'storage': 'Storage Devices',
            'power': 'Power Supply',
            'compatibility': 'Compatibility',
            'general': 'General Issues'
        };
        return titles[groupKey] || 'General Issues';
    }

    /**
     * Get group icon
     */
    getGroupIcon(groupKey) {
        const icons = {
            'required_components': 'fas fa-exclamation-triangle',
            'cooling': 'fas fa-fan',
            'memory': 'fas fa-memory',
            'storage': 'fas fa-hdd',
            'power': 'fas fa-plug',
            'compatibility': 'fas fa-cogs',
            'general': 'fas fa-info-circle'
        };
        return icons[groupKey] || 'fas fa-info-circle';
    }

    /**
     * Render individual issue item
     */
    renderIssueItem(issue) {
        const severityClass = `severity-${issue.severity || 'info'}`;
        const iconClass = issue.icon || 'fas fa-info-circle';
        const hasComponent = issue.componentType && this.selectedComponents[issue.componentType] && this.selectedComponents[issue.componentType].length > 0;

        return `
            <div class="issue-item ${severityClass} ${hasComponent ? 'cursor-pointer' : ''}" onclick="window.serverBuilder.handleIssueClick('${issue.componentType || ''}', this)">
                <div class="issue-icon">
                    <i class="${iconClass}"></i>
                </div>
                <div class="issue-content">
                    <div class="issue-title">${issue.title || issue.message}</div>
                    <div class="issue-message">${issue.message}</div>
                </div>
                <div class="issue-actions">
                    ${issue.action ? `<button class="issue-action-btn" onclick="event.stopPropagation(); window.serverBuilder.addComponent('${issue.action.actionType}')"><i class="fas fa-plus mr-1"></i>${issue.action.text}</button>` : ''}
                    ${hasComponent ? '<i class="fas fa-arrow-up text-text-muted text-xs"></i>' : ''}
                </div>
            </div>
        `;
    }

    /**
     * Handle issue item click
     */
    handleIssueClick(componentType, element) {
        if (componentType && this.selectedComponents[componentType] && this.selectedComponents[componentType].length > 0) {
            this.scrollToComponent(componentType);
        } else {
            element.classList.toggle('expanded');
        }
    }

    /**
     * Scroll to component in table
     */
    scrollToComponent(type) {
        const element = document.getElementById(`component-row-${type}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Highlight briefly
            element.classList.add('flash-highlight');
            setTimeout(() => {
                element.classList.remove('flash-highlight');
            }, 2000);
        }
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Issue group expansion toggles (rendered expanded by default)
        const issueGroupHeaders = document.querySelectorAll('.issues-group-header');
        issueGroupHeaders.forEach(header => {
            header.addEventListener('click', function () {
                const group = this.closest('.issues-group');
                group.classList.toggle('expanded');
            });
        });

        // Close slot popovers when clicking anywhere outside (bind once per page)
        if (!this._popoverListenerAttached) {
            document.addEventListener('click', () => this.closeAllSlotPopovers());
            this._popoverListenerAttached = true;
        }
    }
    toggleAdvancedView(enabled) {
        // Add/remove advanced view classes
        const container = document.querySelector('.server-builder-container');
        if (enabled) {
            container.classList.add('advanced-view');
            this.showAdvancedFeatures();
        } else {
            container.classList.remove('advanced-view');
            this.hideAdvancedFeatures();
        }

        // Show feedback
        this.showAlert(`Advanced view ${enabled ? 'enabled' : 'disabled'}`, 'info');
    }
    /**
     * Show advanced features
     */
    showAdvancedFeatures() {
        // Add any advanced features you want to show

        // Example: Show additional technical details
        const motherboardSection = document.querySelector('.motherboard-section');
        if (motherboardSection) {
            motherboardSection.style.display = 'block';
        }
    }
    /**
     * Hide advanced features
     */
    hideAdvancedFeatures() {
        // Hide any advanced features

        // Example: You might want to keep motherboard section always visible
        // or conditionally hide it based on your requirements
    }
    /**
     * Show loading overlay (delegates to global loading manager)
     */
    showLoading(message = 'Loading...', subtext = '') {
        const fullMessage = subtext ? `${message} - ${subtext}` : message;
        if (window.globalLoading) {
            window.globalLoading.showLoading(true, fullMessage);
        } else {
        }
    }

    /**
     * Hide loading overlay (delegates to global loading manager)
     */
    hideLoading() {
        if (window.globalLoading) {
            window.globalLoading.hide();
        }
    }

    /**
     * Show alert notification
     */
    showAlert(message, type = 'info') {
        const typeMap = {
            'danger': 'error',
            'info': 'info',
            'success': 'success',
            'warning': 'warning'
        };

        const mappedType = typeMap[type] || 'info';

        if (typeof toastNotification !== 'undefined') {
            toastNotification.show(message, mappedType);
        } else {
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Render a value as a JS literal safe to drop into an inline onclick
     * attribute. Serial numbers are user-entered free text, so they can carry
     * quotes or backslashes that would otherwise break out of the handler.
     * escapeHtml() is not enough on its own — it leaves both quote characters
     * untouched. Returns the literal `null` for absent values so the receiving
     * parameter falls back to its default.
     */
    jsArg(value) {
        if (value === null || value === undefined || value === '') return 'null';
        const js = String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `'${js.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}'`;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.serverBuilder = new ServerBuilder();
});

