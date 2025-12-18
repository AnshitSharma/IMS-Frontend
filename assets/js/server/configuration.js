/**
 * Server Configuration Page - Component Selection Interface
 * Based on PC Part Picker design with compatibility warnings
 */

class ConfigurationPage {
    constructor() {
        this.currentComponentType = 'cpu';
        this.selectedComponents = [];
        this.compatibilityState = {
            hasWarnings: false,
            hasErrors: false,
            messages: []
        };
        this.filters = {
            manufacturer: 'all',
            rating: 'all',
            coreCount: { min: 1, max: 64 },
            baseClock: { min: 1.0, max: 5.0 },
            maxMemoryCapacity: { min: 1, max: 32 },
            memoryType: 'all'
        };
        this.components = [];
        this.filteredComponents = [];

        this.init();
    }

    init() {

        // Check authentication
        if (!this.checkAuthentication()) {
            return;
        }

        // Note: Navbar is now initialized by shared navbar.js
        this.setupEventListeners();
        this.initializeComponentTypeSelect();
        this.setupMobileFilters();
        this.initBackButton();

        // loadComponents() will render filters based on URL parameter
        this.loadComponents();
        this.updateCompatibilityBanner();
    }

    /**
     * Check if user is authenticated
     */
    checkAuthentication() {
        const token = localStorage.getItem('bdc_token') || localStorage.getItem('jwt_token');
        if (!token) {
            localStorage.removeItem('bdc_token');
            localStorage.removeItem('jwt_token');
            localStorage.removeItem('bdc_refresh_token');
            localStorage.removeItem('bdc_user');
            window.location.href = '/ims_frontend/';
            return false;
        }
        return true;
    }

    /**
     * Initialize Back to Builder button
     * Shows button when navigating from builder and handles return navigation
     */
    initBackButton() {
        const urlParams = new URLSearchParams(window.location.search);
        const configUuid = urlParams.get('config');
        const returnTo = urlParams.get('return'); // 'builder' when from builder

        if (configUuid && returnTo === 'builder') {
            const backButton = document.getElementById('backButton');
            if (backButton) {
                backButton.classList.remove('hidden');
                backButton.addEventListener('click', () => {
                    window.location.href = `../../pages/dashboard/servers.html?view=serverBuilder&config=${configUuid}`;
                });
            }
        }
    }

    /**
     * Initialize user information display
     */
    initializeUserInfo() {
        const user = api.getUser();
        if (user) {
            // Update display name
            const displayNameElement = document.getElementById('userDisplayName');
            if (displayNameElement) {
                displayNameElement.textContent = user.name || user.username || 'User';
            }

            // Update role
            const roleElement = document.getElementById('userRole');
            if (roleElement) {
                const primaryRole = user.primary_role;
                const roles = user.roles;

                if (primaryRole) {
                    roleElement.textContent = primaryRole;
                } else if (roles && roles.length > 0) {
                    roleElement.textContent = roles[0].name || roles[0];
                } else {
                    roleElement.textContent = 'User';
                }
            }
        } else {
            console.warn('No user data available for initialization');
        }
    }

    /**
     * Setup mobile filter functionality
     */
    setupMobileFilters() {
        // Mobile filter button - use ID selector
        const mobileFilterBtn = document.getElementById('mobile-filter-btn');
        const filterOverlay = document.querySelector('.filter-overlay');
        const mobileFilterClose = document.querySelector('.mobile-filter-close');
        const mobileFilterApply = document.querySelector('.mobile-filter-apply');
        const configSidebar = document.querySelector('.config-sidebar');

        if (mobileFilterBtn && filterOverlay && configSidebar) {
            // Show filter overlay on mobile button click
            mobileFilterBtn.addEventListener('click', () => {
                configSidebar.classList.add('active');
                filterOverlay.classList.add('active');
            });

            // Close filter overlay
            if (mobileFilterClose) {
                mobileFilterClose.addEventListener('click', () => {
                    configSidebar.classList.remove('active');
                    filterOverlay.classList.remove('active');
                });
            }

            // Close on overlay click
            filterOverlay.addEventListener('click', () => {
                configSidebar.classList.remove('active');
                filterOverlay.classList.remove('active');
            });

            // Apply filters and close
            if (mobileFilterApply) {
                mobileFilterApply.addEventListener('click', () => {
                    this.applyFilters();
                    configSidebar.classList.remove('active');
                    filterOverlay.classList.remove('active');
                });
            }

            // Prevent overlay close when clicking sidebar
            configSidebar.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }
    }

    /**
     * Setup event listeners
     * Note: Filter event listeners (pill buttons and range inputs) are attached dynamically
     * by attachFilterListeners() when filters are rendered
     */
    setupEventListeners() {
        // Search
        const searchInput = document.getElementById('componentSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchComponents(e.target.value);
            });
        }

        // Action buttons
        const selectAllBtn = document.getElementById('selectAll');
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => {
                this.selectAllComponents();
            });
        }

        const selectNoneBtn = document.getElementById('selectNone');
        if (selectNoneBtn) {
            selectNoneBtn.addEventListener('click', () => {
                this.selectNoneComponents();
            });
        }

        const addFromFilterBtn = document.getElementById('addFromFilter');
        if (addFromFilterBtn) {
            addFromFilterBtn.addEventListener('click', () => {
                this.addSelectedComponents();
            });
        }

        // Compatibility banner
        const viewDetailsBtn = document.getElementById('viewDetails');
        if (viewDetailsBtn) {
            viewDetailsBtn.addEventListener('click', () => {
                this.showCompatibilityDetails();
            });
        }

        const dismissBannerBtn = document.getElementById('dismissBanner');
        if (dismissBannerBtn) {
            dismissBannerBtn.addEventListener('click', () => {
                this.dismissBanner();
            });
        }

        // Compatibility filter checkbox
        const compatibilityFilter = document.getElementById('compatibilityFilter');
        if (compatibilityFilter) {
            compatibilityFilter.addEventListener('change', () => {
                this.applyFilters();
            });
        }

        // Back button
        const backButton = document.getElementById('backButton');
        if (backButton) {
            backButton.addEventListener('click', () => {
                this.goBack();
            });
        }
    }

    /**
     * Initialize component type select dropdown
     */
    initializeComponentTypeSelect() {
        const select = document.getElementById('componentTypeSelect');
        if (!select) return;

        // Set initial value based on URL parameter or default to 'cpu'
        const urlParams = new URLSearchParams(window.location.search);
        const componentType = urlParams.get('type') || 'cpu';
        select.value = componentType;

        // Add change event listener
        select.addEventListener('change', (e) => {
            this.switchComponentType(e.target.value);
        });
    }

    /**
     * Switch to a different component type
     */
    async switchComponentType(componentType) {

        // Update current component type
        this.currentComponentType = componentType;

        // Clear selected components
        this.selectedComponents = [];

        // Render dynamic filters for the new component type
        this.renderFilters(componentType);

        // Reload components for the new type
        await this.loadComponents();

        // Update UI elements
        this.updatePageTitle(componentType);
        this.updateCompatibilityBanner();
    }

    /**
     * Reset filters to default values
     */
    resetFilters() {
        // Get filter config for current component type
        const filterConfig = this.getFiltersForComponentType(this.currentComponentType);

        // Reset each filter based on its configuration
        for (const [key, config] of Object.entries(filterConfig)) {
            if (config.type === 'radio') {
                // Set first option (All) as checked
                const radios = document.querySelectorAll(`input[name="${key}"]`);
                radios.forEach((radio, index) => {
                    radio.checked = index === 0;
                });
            } else if (config.type === 'range') {
                // Set to minimum value
                const rangeInput = document.getElementById(`${key}Range`);
                if (rangeInput) {
                    rangeInput.value = config.min;
                }
            }
        }

        // Reset search
        const searchInput = document.getElementById('componentSearch');
        if (searchInput) {
            searchInput.value = '';
        }

        // Apply filters to refresh the component list
        this.applyFilters();
    }

    /**
     * Get filter configuration for a specific component type
     */
    getFiltersForComponentType(componentType) {
        const filterConfigs = {
            'cpu': {
                manufacturer: { type: 'radio', label: 'MANUFACTURER', options: ['All', 'AMD', 'Intel'] },
                memoryType: { type: 'radio', label: 'MEMORY TYPES', options: ['All', 'DDR4', 'DDR5'] },
                coreCount: { type: 'range', label: 'CORE COUNT', min: 1, max: 64, step: 1, unit: '' },
                baseClock: { type: 'range', label: 'BASE CLOCK', min: 1.0, max: 5.0, step: 0.1, unit: ' GHz' },
                maxMemoryCapacity: { type: 'range', label: 'MAX MEMORY CAPACITY', min: 1, max: 32, step: 1, unit: ' TB' }
            },
            'ram': {
                capacity: { type: 'range', label: 'CAPACITY (GB)', min: 4, max: 128, step: 4, unit: ' GB' },
                speed: { type: 'range', label: 'SPEED', min: 2133, max: 6000, step: 100, unit: ' MHz' },
                type: { type: 'radio', label: 'TYPE', options: ['All', 'DDR4', 'DDR5'] },
                formFactor: { type: 'radio', label: 'FORM FACTOR', options: ['All', 'DIMM', 'SO-DIMM'] }
            },
            'motherboard': {
                manufacturer: { type: 'radio', label: 'MANUFACTURER', options: ['All', 'ASUS', 'MSI', 'Gigabyte', 'Intel', 'AMD'] },
                formFactor: { type: 'radio', label: 'FORM FACTOR', options: ['All', 'ATX', 'Micro ATX', 'Mini ITX', 'E-ATX'] },
                memoryType: { type: 'radio', label: 'MEMORY TYPES', options: ['All', 'DDR4', 'DDR5'] },
                socket: { type: 'radio', label: 'SOCKET', options: ['All', 'AM5', 'LGA1700', 'LGA1200', 'AM4'] },
                maxMemoryCapacity: { type: 'range', label: 'MAX MEMORY CAPACITY', min: 8, max: 256, step: 8, unit: ' GB' }
            },

            'storage': {
                manufacturer: { type: 'radio', label: 'MANUFACTURER', options: ['All', 'Samsung', 'WD', 'Seagate', 'Crucial', 'Intel'] },
                capacity: { type: 'range', label: 'CAPACITY (TB)', min: 0.25, max: 20, step: 0.25, unit: ' TB' },
                type: { type: 'radio', label: 'TYPE', options: ['All', 'SSD', 'HDD', 'NVMe'] },
                interface: { type: 'radio', label: 'INTERFACE', options: ['All', 'SATA', 'NVMe', 'SAS'] },
                formFactor: { type: 'radio', label: 'FORM FACTOR', options: ['All', '2.5"', '3.5"', 'M.2'] }
            },
            'nic': {
                speed: { type: 'radio', label: 'SPEED', options: ['All', '1 Gbps', '10 Gbps', '25 Gbps', '40 Gbps', '100 Gbps'] },
                ports: { type: 'range', label: 'PORTS', min: 1, max: 4, step: 1, unit: '' },
                interface: { type: 'radio', label: 'INTERFACE', options: ['All', 'PCIe', 'USB', 'Thunderbolt'] }
            },
            'chassis': {
                manufacturer: { type: 'radio', label: 'MANUFACTURER', options: ['All', 'Dell', 'HPE', 'Supermicro', 'Lenovo'] },
                formFactor: { type: 'radio', label: 'FORM FACTOR', options: ['All', '1U', '2U', '4U', 'Tower'] },
                maxDrives: { type: 'range', label: 'MAX DRIVES', min: 1, max: 24, step: 1, unit: '' }
            },
            'caddy': {
                formFactor: { type: 'radio', label: 'SIZE', options: ['All', '2.5"', '3.5"'] }
            },
            'pciecard': {
                manufacturer: { type: 'radio', label: 'MANUFACTURER', options: ['All', 'NVIDIA', 'AMD', 'Intel'] },
                interface: { type: 'radio', label: 'INTERFACE', options: ['All', 'PCIe 3.0', 'PCIe 4.0', 'PCIe 5.0'] },
                formFactor: { type: 'radio', label: 'FORM FACTOR', options: ['All', 'Single Slot', 'Dual Slot', 'Triple Slot', 'Quad Slot'] }
            },
            'hbacard': {
                protocol: { type: 'radio', label: 'PROTOCOL', options: ['All', 'SAS', 'SATA', 'NVMe'] },
                maxDevice: { type: 'range', label: 'MAX DEVICE', min: 1, max: 256, step: 1, unit: '' },
                interface: { type: 'radio', label: 'INTERFACE', options: ['All', 'PCIe 3.0', 'PCIe 4.0'] },
                dataRate: { type: 'radio', label: 'DATA RATE', options: ['All', '6 Gb/s', '12 Gb/s', '24 Gb/s'] }
            },
            'sfp': {
                type: { type: 'radio', label: 'TYPE', options: ['All', 'SFP', 'SFP+', 'SFP28', 'SFP+ DAC'] },
                speed: { type: 'radio', label: 'SPEED', options: ['All', '1Gbps', '10Gbps', '25Gbps'] },
                manufacturer: { type: 'radio', label: 'MANUFACTURER', options: ['All', 'Intel', 'Cisco', 'HP/HPE', 'Dell', 'Mellanox', 'Generic'] },
                fiberType: { type: 'radio', label: 'FIBER TYPE', options: ['All', 'MMF', 'SMF', 'Copper'] },
                reach: { type: 'range', label: 'REACH (m)', min: 1, max: 10000, step: 50, unit: 'm' }
            }
        };

        return filterConfigs[componentType] || filterConfigs['cpu'];
    }
    renderFilters(componentType) {
        const filterConfig = this.getFiltersForComponentType(componentType);
        const filtersSection = document.querySelector('.filters-section');
        if (!filtersSection) return;

        let filtersHTML = '<h4 class="font-semibold text-text-primary text-sm mb-4">Filters</h4>';

        for (const [key, config] of Object.entries(filterConfig)) {
            if (config.type === 'radio') {
                // Generate PILL BUTTONS instead of radio buttons
                filtersHTML += `
                    <div class="mb-6">
                        <label class="block text-xs font-semibold text-text-muted mb-3 uppercase tracking-wider">${config.label}</label>
                        <div class="flex flex-wrap gap-2" data-filter-group="${key}">
                            ${config.options.map((option, index) => {
                    const value = option.toLowerCase();
                    const isActive = index === 0;
                    return `
                                    <button type="button"
                                        class="filter-pill px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all
                                            ${isActive
                            ? 'border-primary bg-primary text-white'
                            : 'border-border-light bg-surface-card text-text-secondary hover:border-primary hover:text-primary'}"
                                        data-filter="${key}"
                                        data-value="${value}">
                                        ${option}
                                    </button>
                                `;
                }).join('')}
                        </div>
                    </div>
                `;
            } else if (config.type === 'range') {
                // Keep range sliders with Tailwind classes
                filtersHTML += `
                    <div class="mb-6">
                        <label class="block text-xs font-semibold text-text-muted mb-2 uppercase tracking-wider">${config.label}</label>
                        <input type="range" id="${key}Range" min="${config.min}" max="${config.max}"
                               step="${config.step}" value="${config.min}"
                               class="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer accent-primary">
                        <div class="flex justify-between text-xs text-text-muted mt-2">
                            <span>${config.min}${config.unit}</span>
                            <span>${config.max}${config.unit}</span>
                        </div>
                    </div>
                `;
            }
        }

        filtersSection.innerHTML = filtersHTML;

        // Re-attach event listeners for the new filters
        this.attachFilterListeners();
    }

    /**
     * Attach event listeners to filter controls
     */
    attachFilterListeners() {
        // Pill button filters (click event)
        document.querySelectorAll('.filters-section .filter-pill').forEach(button => {
            button.addEventListener('click', (e) => {
                const filterGroup = e.target.dataset.filter;

                // Remove active state from all buttons in this group
                document.querySelectorAll(`.filter-pill[data-filter="${filterGroup}"]`).forEach(btn => {
                    btn.classList.remove('border-primary', 'bg-primary', 'text-white');
                    btn.classList.add('border-border-light', 'bg-surface-card', 'text-text-secondary');
                });

                // Add active state to clicked button
                e.target.classList.remove('border-border-light', 'bg-surface-card', 'text-text-secondary');
                e.target.classList.add('border-primary', 'bg-primary', 'text-white');

                // Apply filters
                this.applyFilters();
            });
        });

        // Range filters (input event)
        document.querySelectorAll('.filters-section input[type="range"]').forEach(range => {
            range.addEventListener('input', () => this.applyFilters());
        });
    }

    /**
     * Load components from API
     */
    async loadComponents() {
        try {
            this.showLoading(true);

            // Get config UUID and component type from URL parameters
            const urlParams = new URLSearchParams(window.location.search);
            const configUuid = urlParams.get('config');
            const componentType = urlParams.get('type') || 'cpu';

            // Update the current component type
            this.currentComponentType = componentType;

            // Render filters for the current component type
            this.renderFilters(componentType);

            // Update the page title and header
            this.updatePageTitle(componentType);

            // Show back button if we came from another page
            const returnPage = urlParams.get('return');
            if (returnPage) {
                this.showBackButton(returnPage, configUuid);
            }

            if (configUuid) {
                // Load real components from API
                await this.loadRealComponents(configUuid);
            } else {
                // Load mock components for demonstration
                const mockComponents = await this.loadMockComponents();
                this.components = mockComponents;
                this.filteredComponents = [...this.components];
            }

            this.renderComponentHeaders();
            this.renderComponents();
            this.updateComponentCount();

        } catch (error) {
            console.error('Error loading components:', error);
            this.showAlert(error.message || 'Failed to load components', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * Load real components from server API and JSON files
     */
    async loadRealComponents(configUuid) {
        try {
            // Get compatible components from API with both compatible and incompatible
            const result = await serverAPI.getCompatibleComponents(
                configUuid,
                this.currentComponentType,
                true // Send true to get both available and in-use components
            );

            if (result.success && result.data && result.data.data) {
                const apiData = result.data.data;
                const compatibleComponents = apiData.compatible_components || [];
                const incompatibleComponents = apiData.incompatible_components || [];

                // Load JSON data for this component type
                const jsonData = await this.fetchJSONData(this.currentComponentType);

                // Combine compatible and incompatible components
                const allApiComponents = [...compatibleComponents, ...incompatibleComponents];

                // Map UUIDs to full JSON component data
                this.components = await this.matchUUIDsWithJSON(allApiComponents, jsonData);

                this.filteredComponents = [...this.components];
            } else {
                // Fallback to JSON data if API fails or returns no data
                console.warn('API returned no compatible components data, falling back to JSON');
                await this.loadComponentsFromJSON();
            }
        } catch (error) {
            console.error('Error loading real components from API:', error);
            // Fallback to JSON data
            await this.loadComponentsFromJSON();
        }
    }

    /**
     * Match API component UUIDs with JSON component data
     */
    async matchUUIDsWithJSON(apiComponents, jsonDataArray) {
        const matchedComponents = [];
        let componentId = 1;

        // Create a map of API components by UUID for quick lookup
        const apiComponentMap = {};
        apiComponents.forEach(apiComp => {
            apiComponentMap[apiComp.uuid] = apiComp;
        });

        // Search through all JSON data to find matching UUIDs
        for (const jsonData of jsonDataArray) {
            const components = this.extractComponentsFromJSON(jsonData);

            for (const jsonComponent of components) {
                // Handle both 'uuid' (lowercase) and 'UUID' (uppercase)
                const uuid = jsonComponent.UUID || jsonComponent.uuid;

                // Check if this UUID is in our API response
                if (uuid && apiComponentMap[uuid]) {
                    const apiComp = apiComponentMap[uuid];

                    // Create enriched component with JSON specs and API compatibility data
                    const component = {
                        id: uuid,
                        name: this.generateComponentNameFromJSON(jsonComponent),
                        type: this.currentComponentType,
                        rating: 5, // Default rating
                        reviewCount: Math.floor(Math.random() * 100),
                        price: Math.floor(Math.random() * 2000) + 100,
                        manufacturer: this.extractManufacturerFromComponent(jsonComponent),
                        compatible: apiComp.is_compatible === true,
                        compatibilityScore: apiComp.compatibility_score || 0,
                        compatibilityIssues: apiComp.compatibility_reason ? [apiComp.compatibility_reason] : [],
                        // Add database info
                        serial_number: apiComp.serial_number || 'N/A',
                        status: apiComp.status || 1,
                        location: apiComp.location || '',
                        notes: apiComp.notes || ''
                    };

                    // Add type-specific specifications from JSON
                    this.addJSONSpecsToComponent(component, jsonComponent);

                    matchedComponents.push(component);
                    componentId++;
                }
            }
        }
        return matchedComponents;
    }


    /**
     * Extract all components from JSON data structure
     */
    extractComponentsFromJSON(jsonData) {
        const components = [];

        if (Array.isArray(jsonData)) {
            // Handle array of component groups
            jsonData.forEach(group => {
                if (group.models && Array.isArray(group.models)) {
                    // Direct models array
                    components.push(...group.models);
                } else if (group.series && Array.isArray(group.series)) {
                    // Nested series -> models structure
                    group.series.forEach(series => {
                        if (series.models && Array.isArray(series.models)) {
                            components.push(...series.models);
                        } else if (series.tiers && Array.isArray(series.tiers)) {
                            // CPU structure: series -> tiers -> models
                            series.tiers.forEach(tier => {
                                if (tier.models && Array.isArray(tier.models)) {
                                    components.push(...tier.models);
                                }
                            });
                        }
                    });
                }
            });
        } else if (typeof jsonData === 'object' && jsonData !== null) {
            // Handle chassis_specifications structure
            if (jsonData.chassis_specifications && jsonData.chassis_specifications.manufacturers) {
                jsonData.chassis_specifications.manufacturers.forEach(manufacturer => {
                    if (manufacturer.series && Array.isArray(manufacturer.series)) {
                        manufacturer.series.forEach(series => {
                            if (series.models && Array.isArray(series.models)) {
                                components.push(...series.models);
                            }
                        });
                    }
                });
            }
            // Handle motherboard specifications structure
            else if (jsonData.motherboard_specifications && jsonData.motherboard_specifications.manufacturers) {
                jsonData.motherboard_specifications.manufacturers.forEach(manufacturer => {
                    if (manufacturer.series && Array.isArray(manufacturer.series)) {
                        manufacturer.series.forEach(series => {
                            if (series.models && Array.isArray(series.models)) {
                                components.push(...series.models);
                            }
                        });
                    }
                });
            }
            // Handle storage specifications structure
            else if (jsonData.storage_specifications && jsonData.storage_specifications.manufacturers) {
                jsonData.storage_specifications.manufacturers.forEach(manufacturer => {
                    if (manufacturer.series && Array.isArray(manufacturer.series)) {
                        manufacturer.series.forEach(series => {
                            if (series.models && Array.isArray(series.models)) {
                                components.push(...series.models);
                            }
                        });
                    }
                });
            }
            // Handle caddies array structure
            else if (jsonData.caddies && Array.isArray(jsonData.caddies)) {
                components.push(...jsonData.caddies);
            }
            // Handle direct models array
            else if (jsonData.models && Array.isArray(jsonData.models)) {
                components.push(...jsonData.models);
            }
            // Handle series -> models structure
            else if (jsonData.series && Array.isArray(jsonData.series)) {
                jsonData.series.forEach(series => {
                    if (series.models && Array.isArray(series.models)) {
                        components.push(...series.models);
                    } else if (series.tiers && Array.isArray(series.tiers)) {
                        // CPU structure: series -> tiers -> models
                        series.tiers.forEach(tier => {
                            if (tier.models && Array.isArray(tier.models)) {
                                components.push(...tier.models);
                            }
                        });
                    }
                });
            }
            // Handle direct storage array (if your JSON is just an array of storage items)
            else if (Array.isArray(jsonData.storage) || Array.isArray(jsonData.storage_devices)) {
                const storageArray = jsonData.storage || jsonData.storage_devices;
                components.push(...storageArray);
            }
            // Handle direct chassis array (fallback)
            else if (Array.isArray(jsonData.chassis) || Array.isArray(jsonData.chassis_models)) {
                const chassisArray = jsonData.chassis || jsonData.chassis_models;
                components.push(...chassisArray);
            }
            // Handle direct cpu array (fallback)
            else if (Array.isArray(jsonData.cpu) || Array.isArray(jsonData.cpus)) {
                const cpuArray = jsonData.cpu || jsonData.cpus;
                components.push(...cpuArray);
            }
            // Handle direct ram array (fallback)
            else if (Array.isArray(jsonData.ram) || Array.isArray(jsonData.memory)) {
                const ramArray = jsonData.ram || jsonData.memory;
                components.push(...ramArray);
            }
            // Handle direct nic array (fallback)
            else if (Array.isArray(jsonData.nic) || Array.isArray(jsonData.network_cards)) {
                const nicArray = jsonData.nic || jsonData.network_cards;
                components.push(...nicArray);
            }
            // Handle direct pciecard array (fallback)
            else if (Array.isArray(jsonData.pciecard) || Array.isArray(jsonData.pcie_cards)) {
                const pcieArray = jsonData.pciecard || jsonData.pcie_cards;
                components.push(...pcieArray);
            }
            // Handle direct hbacard array (fallback)
            else if (Array.isArray(jsonData.hbacard) || Array.isArray(jsonData.hba_cards)) {
                const hbaArray = jsonData.hbacard || jsonData.hba_cards;
                components.push(...hbaArray);
            }
        }
        return components;
    }

    /**
 * Generate component name from JSON data
 */
    generateComponentNameFromJSON(jsonComponent) {
        // Try different naming patterns based on component type
        if (jsonComponent.model) {
            return jsonComponent.model;
        } else if (jsonComponent.name) {
            return jsonComponent.name;
        } else if (jsonComponent.memory_type && jsonComponent.capacity_GB) {
            // RAM naming
            return `${jsonComponent.memory_type} ${jsonComponent.capacity_GB}GB ${jsonComponent.module_type || 'DIMM'}`;
        } else if (jsonComponent.storage_type && jsonComponent.capacity_GB) {
            // Storage naming
            const capacityTB = jsonComponent.capacity_GB >= 1000
                ? `${(jsonComponent.capacity_GB / 1000).toFixed(1)}TB`
                : `${jsonComponent.capacity_GB}GB`;
            return `${jsonComponent.subtype || jsonComponent.storage_type} ${capacityTB}`;
        } else if (jsonComponent.type && jsonComponent.capacity) {
            return `${jsonComponent.type} ${jsonComponent.capacity}`;
        }
        // Add storage-specific naming
        else if (jsonComponent.capacity_GB && jsonComponent.interface) {
            const capacityTB = jsonComponent.capacity_GB >= 1000
                ? `${(jsonComponent.capacity_GB / 1000).toFixed(1)}TB`
                : `${jsonComponent.capacity_GB}GB`;
            return `${jsonComponent.interface} ${jsonComponent.form_factor || ''} ${capacityTB}`.trim();
        }
        return 'Unknown Component';
    }

    /**
     * Extract manufacturer from JSON component
     */
    extractManufacturerFromComponent(jsonComponent) {
        if (jsonComponent.brand) {
            return jsonComponent.brand.toLowerCase();
        } else if (jsonComponent.manufacturer) {
            return jsonComponent.manufacturer.toLowerCase();
        }
        return 'unknown';
    }

    /**
     * Add JSON specifications to component based on type
     */
    addJSONSpecsToComponent(component, jsonComponent) {
        switch (this.currentComponentType) {
            case 'cpu':
                component.cores = jsonComponent.cores || 0;
                component.threads = jsonComponent.threads || 0;
                component.baseClock = jsonComponent.base_frequency_GHz || 0;
                component.boostClock = jsonComponent.max_frequency_GHz || 0;
                component.architecture = jsonComponent.architecture || 'Unknown';
                component.tdp = jsonComponent.tdp_W || 0;
                component.graphics = jsonComponent.integrated_graphics || 'None';
                component.l2Cache = this.extractCacheSize(jsonComponent.l2_cache) || 0;
                component.l3Cache = this.extractCacheSize(jsonComponent.l3_cache) || 0;
                component.maxMemoryCapacity = jsonComponent.max_memory_capacity_TB || 0;
                component.memoryTypes = jsonComponent.memory_types || [];
                break;

            case 'motherboard':
                // Handle socket (could be string or object)

                if (typeof jsonComponent.socket === 'object' && jsonComponent.socket !== null) {
                    component.socket = jsonComponent.socket.type || 'N/A';
                } else {
                    component.socket = jsonComponent.socket || 'N/A';
                }


                component.formFactor = jsonComponent.form_factor || 'ATX';
                component.chipset = jsonComponent.chipset || 'N/A';
                console.log('JSON Component for Motherboard:', jsonComponent.memory);
                // Handle memory specifications - check multiple possible property names
                if (jsonComponent.memory) {
                    console.log('Memory Specifications:', jsonComponent.memory);
                    component.ramSlots = jsonComponent.memory.slots?.toString() || 'N/A';
                    component.memoryType = jsonComponent.memory.type || 'N/A';
                    component.maxMemory = jsonComponent.memory.max_capacity_TB || 'N/A';
                }
                // Check for direct memory properties
                else if (jsonComponent.memory_slots || jsonComponent.memory_type || jsonComponent.max_memory_GB) {
                    component.ramSlots = jsonComponent.memory_slots?.toString() || 'N/A';
                    component.memoryType = jsonComponent.memory_type ||
                        jsonComponent.supported_memory_types?.[0] || 'N/A';
                    component.maxMemory = jsonComponent.max_memory_GB ||
                        jsonComponent.max_memory_capacity_GB || 'N/A';
                }
                // Check for memory in notes field (fallback)
                else if (jsonComponent.notes) {
                    component.ramSlots = this.extractMemorySlotsFromNotes(jsonComponent.notes) || 'N/A';
                    component.memoryType = this.extractMemoryTypeFromNotes(jsonComponent.notes) || 'N/A';
                    component.maxMemory = this.extractMaxMemoryFromNotes(jsonComponent.notes) || 'N/A';
                }
                // Final fallback
                else {
                    component.ramSlots = 'N/A';
                    component.memoryType = 'N/A';
                    component.maxMemory = 'N/A';
                }

                component.pcieSlots = jsonComponent.pcie_slots?.toString() || 'N/A';
                component.sataPorts = jsonComponent.sata_ports?.toString() || 'N/A';
                break;


            case 'ram':
                component.capacity = jsonComponent.capacity || 'N/A';
                component.speed = jsonComponent.speed_MHz?.toString() || 'N/A';
                component.type = jsonComponent.type || 'DDR4';
                component.cas = jsonComponent.cas_latency?.toString() || 'N/A';
                component.voltage = jsonComponent.voltage?.toString() || 'N/A';
                component.formFactor = jsonComponent.form_factor || 'DIMM';
                break;

            case 'storage':
                component.capacity = jsonComponent.capacity || 'N/A';
                component.type = jsonComponent.type || 'SSD';
                component.interface = jsonComponent.interface || 'SATA';
                component.readSpeed = jsonComponent.read_speed_MBps?.toString() || 'N/A';
                component.writeSpeed = jsonComponent.write_speed_MBps?.toString() || 'N/A';
                component.formFactor = jsonComponent.form_factor || '2.5"';
                break;

            case 'nic':
                component.speed = jsonComponent.speed || '1Gbps';
                component.interface = jsonComponent.interface || 'PCIe';
                component.ports = jsonComponent.ports?.toString() || '1';
                component.connector = jsonComponent.connector || 'RJ45';
                component.protocol = jsonComponent.protocol || 'Ethernet';
                component.features = jsonComponent.features || 'N/A';
                break;

            case 'chassis':
                // console.log('JSON Component for Chassis:', jsonComponent);
                component.formFactor = jsonComponent.form_factor || 'N/A';
                // Handle nested drive_bays structure
                if (jsonComponent.drive_bays && jsonComponent.drive_bays.total_bays) {
                    component.maxDrives = jsonComponent.drive_bays.total_bays.toString();
                } else {
                    component.maxDrives = jsonComponent.max_drives?.toString() || 'N/A';
                }
                component.maxRAM = jsonComponent.max_ram || 'N/A';
                // Handle nested power_supply structure
                if (jsonComponent.power_supply && jsonComponent.power_supply.wattage) {
                    component.powerSupply = `${jsonComponent.power_supply.wattage}W`;
                } else {
                    component.powerSupply = jsonComponent.power_supply || 'N/A';
                }
                // Handle nested dimensions structure
                if (jsonComponent.dimensions && typeof jsonComponent.dimensions === 'object') {
                    const dims = jsonComponent.dimensions;
                    component.dimensions = `${dims.height || 'N/A'} × ${dims.width || 'N/A'} × ${dims.depth || 'N/A'}`;
                } else {
                    component.dimensions = jsonComponent.dimensions || 'N/A';
                }
                component.weight = jsonComponent.weight || 'N/A';
                break;

            case 'caddy':
                // Handle caddy JSON structure
                if (jsonComponent.compatibility && typeof jsonComponent.compatibility === 'object') {
                    component.formFactor = jsonComponent.compatibility.size || 'N/A';
                    component.interface = jsonComponent.compatibility.interface || 'N/A';
                    component.compatibility = jsonComponent.compatibility.drive_type?.join(', ') || 'N/A';
                } else {
                    component.formFactor = jsonComponent.form_factor || 'N/A';
                    component.interface = jsonComponent.interface || 'N/A';
                    component.compatibility = jsonComponent.compatibility || 'N/A';
                }
                component.capacity = jsonComponent.type || 'N/A';
                component.speed = jsonComponent.connector || 'N/A';
                component.hotSwap = jsonComponent.hot_swap ? 'Yes' : 'No';
                break;
            case 'pciecard':
                console.log('JSON Component for PCIe Card:', jsonComponent.max_capacity_per_slot);
                component.model = jsonComponent.model || 'N/A';
                component.interface = jsonComponent.interface || 'PCIe';
                component.max_capacity = jsonComponent.total_max_capacity || 'N/A';
                component.busWidth = jsonComponent.bus_width || 'N/A';
                component.powerConsumption = jsonComponent.power_consumption_W || 'N/A';
                component.features = jsonComponent.features || 'N/A';
                break;

            case 'hbacard':
                console.log('JSON Component for HBA Card:', jsonComponent.internal_ports);
                component.model = jsonComponent.model || 'N/A';
                component.interface = jsonComponent.interface || 'PCIe';
                component.ports = jsonComponent.ports?.toString() || 'N/A';
                component.internal_ports = jsonComponent.internal_ports || 'N/A';
                // component.dataRate = jsonComponent.data_rate || jsonComponent.speed || 'N/A';
                // component.features = jsonComponent.features || 'N/A';
                break;

            default:
                // Generic specs
                component.spec1 = 'N/A';
                component.spec2 = 'N/A';
                component.spec3 = 'N/A';
                component.spec4 = 'N/A';
                component.spec5 = 'N/A';
                component.spec6 = 'N/A';
        }
    }

    /**
     * Extract cache size from string (e.g., "56 × 2 MB" -> 112)
     */
    extractCacheSize(cacheString) {
        if (!cacheString) return 0;

        // Try to extract numeric value from string
        const match = cacheString.match(/(\d+\.?\d*)\s*MB/i);
        if (match) {
            return parseFloat(match[1]);
        }

        // Handle multiplication pattern (e.g., "56 × 2 MB")
        const multiplyMatch = cacheString.match(/(\d+)\s*×\s*(\d+\.?\d*)\s*MB/i);
        if (multiplyMatch) {
            return parseInt(multiplyMatch[1]) * parseFloat(multiplyMatch[2]);
        }

        return 0;
    }

    /**
     * Load components from JSON files
     */
    async loadComponentsFromJSON() {
        try {
            const jsonData = await this.fetchJSONData(this.currentComponentType);
            this.components = this.transformJSONToComponents(jsonData);
            this.filteredComponents = [...this.components];
        } catch (error) {
            console.error('Error loading components from JSON:', error);
            // Final fallback to mock data
            const mockComponents = await this.loadMockComponents();
            this.components = mockComponents;
            this.filteredComponents = [...this.components];
        }
    }

    /**
     * Fetch JSON data for specific component type
     * Only loads level-3 and detailed JSON files for UUID matching
     */
    async fetchJSONData(componentType) {
        const jsonPaths = {
            'cpu': ['../data/cpu-jsons/Cpu-details-level-3.json'],
            'motherboard': ['../data/motherboad-jsons/motherboard-level-3.json'],
            'ram': ['../data/Ram-jsons/ram_detail.json'],
            'storage': ['../data/storage-jsons/storage-level-3.json'],
            'nic': ['../data/nic-jsons/nic-level-3.json'],
            'chassis': ['../data/chasis-jsons/chasis-level-3.json'],
            'caddy': ['../data/caddy-jsons/caddy_details.json'],
            'pciecard': ['../data/pci-jsons/pci-level-3.json'],
            'hbacard': ['../data/hbacard-jsons/hbacard-level-3.json'],
            'sfp': ['../data/sfp-jsons/sfp-level-3.json']
        };

        const paths = jsonPaths[componentType] || [];
        const allData = [];

        for (const path of paths) {
            try {
                const response = await fetch(`../../${path}`);
                if (response.ok) {
                    const data = await response.json();
                    allData.push(data);
                } else {
                    console.warn(`✗ Failed to load JSON from ${path}: ${response.status} ${response.statusText}`);
                }
            } catch (error) {
                console.warn(`✗ Error loading JSON from ${path}:`, error);
            }
        }
        return allData;
    }

    /**
     * Transform JSON data to component format
     */
    transformJSONToComponents(jsonDataArray) {
        const components = [];
        let componentId = 1;

        jsonDataArray.forEach((jsonData, index) => {
            if (Array.isArray(jsonData)) {
                jsonData.forEach(item => {
                    const component = this.createComponentFromJSON(item, componentId++);
                    if (component) {
                        components.push(component);
                    }
                });
            } else if (typeof jsonData === 'object') {
                const component = this.createComponentFromJSON(jsonData, componentId++);
                if (component) {
                    components.push(component);
                }
            }
        });

        return components;
    }

    /**
     * Create component object from JSON data
     */
    createComponentFromJSON(jsonItem, id) {
        const component = {
            id: `${this.currentComponentType}-${id}`,
            name: this.generateComponentName(jsonItem),
            type: this.currentComponentType,
            rating: Math.floor(Math.random() * 2) + 4, // 4-5 stars
            reviewCount: Math.floor(Math.random() * 200) + 50,
            price: Math.floor(Math.random() * 2000) + 100,
            manufacturer: this.extractManufacturerFromJSON(jsonItem),
            compatible: true, // Assume compatible for JSON data
            compatibilityScore: 0.9 + Math.random() * 0.1
        };

        // Add type-specific specifications based on JSON structure
        return this.addJSONSpecificSpecs(component, jsonItem);
    }

    /**
     * Generate component name from JSON data
     */
    generateComponentName(jsonItem) {
        switch (this.currentComponentType) {
            case 'cpu':
                if (jsonItem.brand && jsonItem.series) {
                    const series = jsonItem.series[0];
                    return `${jsonItem.brand} ${series.name} ${series.tiers?.[0] || 'Processor'}`;
                }
                break;
            case 'motherboard':
                if (jsonItem.brand && jsonItem.series) {
                    const series = jsonItem.series[0];
                    return `${jsonItem.brand} ${series.name} ${series.form_factors?.[0] || 'Motherboard'}`;
                }
                break;
            case 'ram':
                if (jsonItem.RAM) {
                    const ram = jsonItem.RAM;
                    return `${ram.type?.[0] || 'DDR4'} ${ram.size?.[0] || 16}GB ${ram.DIMM?.[0] || 'RDIMM'}`;
                }
                break;
            case 'storage':
                if (jsonItem.storage_types) {
                    const storageType = jsonItem.storage_types[0];
                    const subtype = storageType.subtypes?.[0];
                    return `${subtype?.name || storageType.type || 'SSD'} ${Math.floor(Math.random() * 8) + 1}TB`;
                }
                break;
            case 'sfp':
                if (jsonItem.brand && jsonItem.series) {
                    const series = jsonItem.series[0];
                    const model = series.models?.[0];
                    return `${jsonItem.brand} ${model?.model || series.name} ${model?.speed || ''}`;
                }
                break;
            default:
                return `${this.currentComponentType.toUpperCase()} Component ${id}`;
        }
        return `${this.currentComponentType.toUpperCase()} Component`;
    }

    /**
     * Extract manufacturer from JSON data
     */
    extractManufacturerFromJSON(jsonItem) {
        if (jsonItem.brand) {
            return jsonItem.brand.toLowerCase();
        }
        return 'unknown';
    }

    /**
     * Add JSON-specific specifications to component
     */
    addJSONSpecificSpecs(component, jsonItem) {
        switch (this.currentComponentType) {
            case 'cpu':
                if (jsonItem.series && jsonItem.series[0]) {
                    const series = jsonItem.series[0];
                    component.cores = this.extractNumberFromRange(series.core_range) || 8;
                    component.threads = component.cores * 2; // Assume 2 threads per core
                    component.baseClock = 2.0 + Math.random() * 2.0; // 2.0-4.0 GHz
                    component.boostClock = component.baseClock + 0.5 + Math.random() * 0.5;
                    component.architecture = series.name || 'Unknown';
                    component.tdp = 65 + Math.floor(Math.random() * 100); // 65-165W
                    component.graphics = 'Integrated';
                    component.l2Cache = 0.5 + Math.random() * 1.0; // 0.5-1.5 MB
                    component.l3Cache = 8 + Math.floor(Math.random() * 32); // 8-40 MB
                    component.maxMemoryCapacity = 4 + Math.floor(Math.random() * 4); // 4-8 TB
                    component.memoryTypes = ['DDR5-4800']; // Default to DDR5
                }
                break;
            case 'motherboard':
                if (jsonItem.series && jsonItem.series[0]) {
                    const series = jsonItem.series[0];
                    component.socket = series.socket_types?.[0] || 'Unknown';
                    component.formFactor = series.form_factors?.[0] || 'ATX';
                    component.chipset = series.chipsets?.[0] || 'Unknown';
                    component.ramSlots = series.memory_slots || '4';
                    component.pcieSlots = '3';
                    component.sataPorts = '6';
                }
                break;
            case 'ram':
                if (jsonItem.RAM) {
                    const ram = jsonItem.RAM;
                    component.capacity = `${ram.size?.[0] || 16}GB`;
                    component.speed = '3200';
                    component.type = ram.type?.[0] || 'DDR4';
                    component.cas = '16';
                    component.voltage = '1.35';
                    component.formFactor = ram.DIMM?.[0] || 'RDIMM';
                }
                break;
            case 'storage':
                if (jsonItem.storage_types) {
                    const storageType = jsonItem.storage_types[0];
                    const subtype = storageType.subtypes?.[0];
                    component.capacity = `${Math.floor(Math.random() * 8) + 1}TB`; // 1-8TB
                    component.type = subtype?.name || storageType.type || 'SSD';
                    component.interface = subtype?.name?.includes('SATA') ? 'SATA' :
                        subtype?.name?.includes('NVMe') ? 'PCIe' : 'SATA';
                    component.readSpeed = subtype?.name?.includes('NVMe') ? '7000' : '550';
                    component.writeSpeed = subtype?.name?.includes('NVMe') ? '5000' : '520';
                    component.formFactor = subtype?.form_factors?.[0] || '2.5-inch';
                }
                break;
            case 'sfp':
                if (jsonItem.series && jsonItem.series[0]) {
                    const series = jsonItem.series[0];
                    const model = series.models?.[0];
                    if (model) {
                        component.type = model.type || 'SFP';
                        component.speed = model.speed || '1Gbps';
                        component.wavelength = model.wavelength || 'N/A';
                        component.reach = model.reach || 'N/A';
                        component.connector = model.connector || 'LC';
                        component.fiberType = model.fiber_type || 'N/A';
                    }
                }
                break;
            default:
                // Generic specs for other types
                component.spec1 = 'N/A';
                component.spec2 = 'N/A';
                component.spec3 = 'N/A';
                component.spec4 = 'N/A';
                component.spec5 = 'N/A';
                component.spec6 = 'N/A';
        }

        return component;
    }

    /**
     * Extract number from range string (e.g., "4-80 cores" -> 8)
     */
    extractNumberFromRange(rangeString) {
        if (!rangeString) return null;
        const match = rangeString.match(/(\d+)-(\d+)/);
        if (match) {
            const min = parseInt(match[1]);
            const max = parseInt(match[2]);
            return Math.floor((min + max) / 2); // Return average
        }
        return null;
    }

    /**
     * Extract specification from component notes
     */
    extractSpec(notes, specType) {
        if (!notes) return null;

        const patterns = {
            cores: /(\d+)\s*cores?/i,
            threads: /(\d+)\s*threads?/i,
            base_clock: /(\d+\.?\d*)\s*ghz/i,
            boost_clock: /(\d+\.?\d*)\s*ghz/i,
            architecture: /(zen\s*\d+|raptor\s*lake|sapphire\s*rapids)/i,
            tdp: /(\d+)\s*w/i,
            graphics: /(radeon|intel\s*uhd|none)/i,
            l2_cache: /(\d+)\s*mb\s*l2/i,
            l3_cache: /(\d+)\s*mb\s*l3/i
        };

        const pattern = patterns[specType];
        if (pattern) {
            const match = notes.match(pattern);
            return match ? match[1] : null;
        }

        return null;
    }

    /**
     * Extract manufacturer from component notes
     */
    extractManufacturer(notes) {
        if (!notes) return 'unknown';

        if (/amd|ryzen/i.test(notes)) return 'amd';
        if (/intel|core/i.test(notes)) return 'intel';
        if (/corsair/i.test(notes)) return 'corsair';
        if (/kingston/i.test(notes)) return 'kingston';
        if (/samsung/i.test(notes)) return 'samsung';
        if (/western digital|wd/i.test(notes)) return 'western digital';
        if (/seagate/i.test(notes)) return 'seagate';
        if (/asus/i.test(notes)) return 'asus';
        if (/msi/i.test(notes)) return 'msi';
        if (/gigabyte/i.test(notes)) return 'gigabyte';

        return 'unknown';
    }

    /**
     * Add type-specific specifications to component
     */
    addTypeSpecificSpecs(baseComponent, notes) {
        const component = { ...baseComponent };

        switch (component.type) {
            case 'cpu':
                component.cores = this.extractSpec(notes, 'cores') || 0;
                component.threads = this.extractSpec(notes, 'threads') || 0;
                component.baseClock = this.extractSpec(notes, 'base_clock') || 0;
                component.boostClock = this.extractSpec(notes, 'boost_clock') || 0;
                component.architecture = this.extractSpec(notes, 'architecture') || 'Unknown';
                component.tdp = this.extractSpec(notes, 'tdp') || 0;
                component.graphics = this.extractSpec(notes, 'graphics') || 'None';
                component.l2Cache = this.extractSpec(notes, 'l2_cache') || 0;
                component.l3Cache = this.extractSpec(notes, 'l3_cache') || 0;
                component.maxMemoryCapacity = this.extractSpec(notes, 'max_memory_capacity') || 0;
                component.memoryTypes = this.extractSpec(notes, 'memory_types') || [];
                break;

            case 'ram':
                component.capacity = this.extractSpec(notes, 'capacity') || 'N/A';
                component.speed = this.extractSpec(notes, 'speed') || 'N/A';
                component.type = this.extractSpec(notes, 'type') || 'DDR4';
                component.cas = this.extractSpec(notes, 'cas') || 'N/A';
                component.voltage = this.extractSpec(notes, 'voltage') || 'N/A';
                component.formFactor = this.extractSpec(notes, 'form_factor') || 'DIMM';
                break;

            case 'motherboard':
                component.socket = this.extractSpec(notes, 'socket') || 'N/A';
                component.formFactor = this.extractSpec(notes, 'form_factor') || 'ATX';
                component.chipset = this.extractSpec(notes, 'chipset') || 'N/A';
                component.ramSlots = this.extractSpec(notes, 'ram_slots') || 'N/A';
                component.pcieSlots = this.extractSpec(notes, 'pcie_slots') || 'N/A';
                component.sataPorts = this.extractSpec(notes, 'sata_ports') || 'N/A';
                break;

            case 'storage':
                component.capacity = this.extractSpec(notes, 'capacity') || 'N/A';
                component.type = this.extractSpec(notes, 'type') || 'SSD';
                component.interface = this.extractSpec(notes, 'interface') || 'SATA';
                component.readSpeed = this.extractSpec(notes, 'read_speed') || 'N/A';
                component.writeSpeed = this.extractSpec(notes, 'write_speed') || 'N/A';
                component.formFactor = this.extractSpec(notes, 'form_factor') || '2.5"';
                break;

            case 'nic':
                component.speed = this.extractSpec(notes, 'speed') || '1Gbps';
                component.interface = this.extractSpec(notes, 'interface') || 'PCIe';
                component.ports = this.extractSpec(notes, 'ports') || '1';
                component.connector = this.extractSpec(notes, 'connector') || 'RJ45';
                component.protocol = this.extractSpec(notes, 'protocol') || 'Ethernet';
                component.features = this.extractSpec(notes, 'features') || 'N/A';
                break;

            default:
                // Generic specs for unknown types
                component.spec1 = this.extractSpec(notes, 'spec1') || 'N/A';
                component.spec2 = this.extractSpec(notes, 'spec2') || 'N/A';
                component.spec3 = this.extractSpec(notes, 'spec3') || 'N/A';
                component.spec4 = this.extractSpec(notes, 'spec4') || 'N/A';
                component.spec5 = this.extractSpec(notes, 'spec5') || 'N/A';
                component.spec6 = this.extractSpec(notes, 'spec6') || 'N/A';
        }

        return component;
    }

    /**
     * Load mock components for demonstration
     */
    async loadMockComponents() {
        const type = this.currentComponentType;

        switch (type) {
            case 'cpu':
                return this.getMockCPUs();
            case 'ram':
                return this.getMockRAM();
            case 'motherboard':
                return this.getMockMotherboards();
            case 'storage':
                return this.getMockStorage();
            case 'nic':
                return this.getMockNICs();
            case 'chassis':
                return this.getMockChassis();
            case 'caddy':
                return this.getMockCaddies();
            case 'pciecard':
                return this.getMockPCIeCards();
            case 'sfp':
                return this.getMockSFPs();
            default:
                return this.getMockCPUs(); // Default to CPU
        }
    }

    /**
     * Get mock CPU data
     */
    getMockCPUs() {
        return [
            {
                id: 'cpu-1',
                name: 'AMD Ryzen 7 9800X3D',
                type: 'cpu',
                cores: 8,
                threads: 16,
                baseClock: 4.7,
                boostClock: 5.2,
                architecture: 'Zen 5',
                tdp: 120,
                graphics: 'Radeon',
                rating: 5,
                reviewCount: 280,
                price: 459.98,
                manufacturer: 'amd',
                l2Cache: 8,
                l3Cache: 96,
                compatible: true,
                compatibilityScore: 0.95
            },
            {
                id: 'cpu-2',
                name: 'AMD Ryzen 7 7800X3D',
                type: 'cpu',
                cores: 8,
                threads: 16,
                baseClock: 4.2,
                boostClock: 5.0,
                architecture: 'Zen 4',
                tdp: 120,
                graphics: 'Radeon',
                rating: 5,
                reviewCount: 552,
                price: 409.00,
                manufacturer: 'amd',
                l2Cache: 8,
                l3Cache: 96,
                compatible: true,
                compatibilityScore: 0.92
            },
            {
                id: 'cpu-3',
                name: 'Intel Core i7-14700K',
                type: 'cpu',
                cores: 20,
                threads: 28,
                baseClock: 3.4,
                boostClock: 5.6,
                architecture: 'Raptor Lake Refresh',
                tdp: 125,
                graphics: 'Intel UHD Graphics 770',
                rating: 5,
                reviewCount: 43,
                price: 279.99,
                manufacturer: 'intel',
                l2Cache: 20,
                l3Cache: 33,
                compatible: true,
                compatibilityScore: 0.88
            }
        ];
    }

    /**
     * Get mock RAM data
     */
    getMockRAM() {
        return [
            {
                id: 'ram-1',
                name: 'Corsair Vengeance LPX 32GB',
                type: 'ram',
                capacity: '32GB',
                speed: '3200',
                type: 'DDR4',
                cas: '16',
                voltage: '1.35',
                formFactor: 'DIMM',
                rating: 5,
                reviewCount: 1250,
                price: 129.99,
                manufacturer: 'corsair',
                compatible: true,
                compatibilityScore: 0.95
            },
            {
                id: 'ram-2',
                name: 'G.Skill Trident Z5 64GB',
                type: 'ram',
                capacity: '64GB',
                speed: '5600',
                type: 'DDR5',
                cas: '36',
                voltage: '1.25',
                formFactor: 'DIMM',
                rating: 4,
                reviewCount: 89,
                price: 299.99,
                manufacturer: 'gskill',
                compatible: true,
                compatibilityScore: 0.88
            },
            {
                id: 'ram-3',
                name: 'Kingston Fury Beast 16GB',
                type: 'ram',
                capacity: '16GB',
                speed: '3600',
                type: 'DDR4',
                cas: '18',
                voltage: '1.35',
                formFactor: 'DIMM',
                rating: 4,
                reviewCount: 567,
                price: 79.99,
                manufacturer: 'kingston',
                compatible: false,
                compatibilityScore: 0.45,
                compatibilityIssues: ['Incompatible with selected motherboard']
            }
        ];
    }

    /**
     * Get mock Motherboard data
     */
    getMockMotherboards() {
        return [
            {
                id: 'mb-1',
                name: 'ASUS ROG Strix X670E-E',
                type: 'motherboard',
                socket: 'AM5',
                formFactor: 'ATX',
                chipset: 'X670E',
                ramSlots: '4',
                pcieSlots: '3',
                sataPorts: '6',
                rating: 5,
                reviewCount: 234,
                price: 449.99,
                manufacturer: 'asus',
                compatible: true,
                compatibilityScore: 0.92
            },
            {
                id: 'mb-2',
                name: 'MSI MPG Z790 Carbon',
                type: 'motherboard',
                socket: 'LGA1700',
                formFactor: 'ATX',
                chipset: 'Z790',
                ramSlots: '4',
                pcieSlots: '4',
                sataPorts: '8',
                rating: 4,
                reviewCount: 156,
                price: 329.99,
                manufacturer: 'msi',
                compatible: true,
                compatibilityScore: 0.89
            }
        ];
    }

    /**
     * Get mock Storage data
     */
    getMockStorage() {
        return [
            {
                id: 'storage-1',
                name: 'Samsung 980 PRO 2TB',
                type: 'storage',
                capacity: '2TB',
                type: 'NVMe SSD',
                interface: 'PCIe 4.0',
                readSpeed: '7000',
                writeSpeed: '5000',
                formFactor: 'M.2',
                rating: 5,
                reviewCount: 1890,
                price: 199.99,
                manufacturer: 'samsung',
                compatible: true,
                compatibilityScore: 0.96
            },
            {
                id: 'storage-2',
                name: 'Western Digital Black SN850X 1TB',
                type: 'storage',
                capacity: '1TB',
                type: 'NVMe SSD',
                interface: 'PCIe 4.0',
                readSpeed: '7300',
                writeSpeed: '6300',
                formFactor: 'M.2',
                rating: 5,
                reviewCount: 567,
                price: 129.99,
                manufacturer: 'western digital',
                compatible: true,
                compatibilityScore: 0.94
            }
        ];
    }

    /**
     * Get mock NIC data
     */
    getMockNICs() {
        return [
            {
                id: 'nic-1',
                name: 'Intel I350-T4 Quad Port',
                type: 'nic',
                speed: '1Gbps',
                interface: 'PCIe',
                ports: '4',
                connector: 'RJ45',
                protocol: 'Ethernet',
                features: 'VLAN, QoS',
                rating: 5,
                reviewCount: 234,
                price: 89.99,
                manufacturer: 'intel',
                compatible: true,
                compatibilityScore: 0.91
            },
            {
                id: 'nic-2',
                name: 'Mellanox ConnectX-3 10GbE',
                type: 'nic',
                speed: '10Gbps',
                interface: 'PCIe',
                ports: '1',
                connector: 'SFP+',
                protocol: 'Ethernet',
                features: 'RDMA, SR-IOV',
                rating: 4,
                reviewCount: 89,
                price: 149.99,
                manufacturer: 'mellanox',
                compatible: true,
                compatibilityScore: 0.87
            }
        ];
    }

    /**
     * Get mock Chassis data
     */
    getMockChassis() {
        return [
            {
                id: 'chassis-1',
                name: 'Dell PowerEdge R750',
                type: 'chassis',
                formFactor: '2U Rack',
                maxDrives: '8',
                maxRAM: '2TB',
                powerSupply: '800W',
                rating: 5,
                reviewCount: 156,
                price: 1299.99,
                manufacturer: 'dell',
                compatible: true,
                compatibilityScore: 0.95
            },
            {
                id: 'chassis-2',
                name: 'HP ProLiant DL380 Gen10',
                type: 'chassis',
                formFactor: '2U Rack',
                maxDrives: '12',
                maxRAM: '3TB',
                powerSupply: '1000W',
                rating: 4,
                reviewCount: 234,
                price: 1499.99,
                manufacturer: 'hp',
                compatible: true,
                compatibilityScore: 0.92
            }
        ];
    }

    /**
     * Get mock Caddy data
     */
    getMockCaddies() {
        return [
            {
                id: 'caddy-1',
                name: 'Dell 2.5" Hot-Swap Caddy',
                type: 'caddy',
                formFactor: '2.5"',
                interface: 'SATA',
                capacity: '1TB',
                speed: '6Gbps',
                rating: 4,
                reviewCount: 89,
                price: 49.99,
                manufacturer: 'dell',
                compatible: true,
                compatibilityScore: 0.88
            },
            {
                id: 'caddy-2',
                name: 'HP 3.5" Hot-Swap Caddy',
                type: 'caddy',
                formFactor: '3.5"',
                interface: 'SATA',
                capacity: '2TB',
                speed: '6Gbps',
                rating: 5,
                reviewCount: 123,
                price: 59.99,
                manufacturer: 'hp',
                compatible: true,
                compatibilityScore: 0.91
            }
        ];
    }

    /**
     * Get mock PCIe Card data
     */
    getMockPCIeCards() {
        return [
            {
                id: 'pcie-1',
                name: 'NVIDIA Tesla V100',
                type: 'pciecard',
                interface: 'PCIe 3.0 x16',
                memory: '32GB HBM2',
                cores: '5120',
                baseClock: '1246 MHz',
                boostClock: '1380 MHz',
                tdp: '300W',
                rating: 5,
                reviewCount: 67,
                price: 8999.99,
                manufacturer: 'nvidia',
                compatible: true,
                compatibilityScore: 0.96
            },
            {
                id: 'pcie-2',
                name: 'AMD Radeon Pro WX 8200',
                type: 'pciecard',
                interface: 'PCIe 3.0 x16',
                memory: '8GB GDDR5',
                cores: '3584',
                baseClock: '1200 MHz',
                boostClock: '1500 MHz',
                tdp: '230W',
                rating: 4,
                reviewCount: 45,
                price: 1299.99,
                manufacturer: 'amd',
                compatible: true,
                compatibilityScore: 0.89
            }
        ];
    }

    /**
     * Get mock SFP data
     */
    getMockSFPs() {
        return [
            {
                id: 'sfp-1',
                name: 'Intel FTLX8571D3BCL-IN 10Gbps',
                type: 'sfp',
                sfpType: 'SFP+',
                speed: '10Gbps',
                wavelength: '850nm',
                reach: '300m',
                connector: 'LC',
                fiberType: 'MMF',
                rating: 5,
                reviewCount: 125,
                price: 89.99,
                manufacturer: 'intel',
                compatible: true,
                compatibilityScore: 0.95
            },
            {
                id: 'sfp-2',
                name: 'Cisco SFP-10G-SR 10Gbps',
                type: 'sfp',
                sfpType: 'SFP+',
                speed: '10Gbps',
                wavelength: '850nm',
                reach: '300m',
                connector: 'LC',
                fiberType: 'MMF',
                rating: 5,
                reviewCount: 245,
                price: 125.00,
                manufacturer: 'cisco',
                compatible: true,
                compatibilityScore: 0.98
            },
            {
                id: 'sfp-3',
                name: 'Generic SFP-10G-DAC-1M',
                type: 'sfp',
                sfpType: 'SFP+ DAC',
                speed: '10Gbps',
                wavelength: 'N/A',
                reach: '1m',
                connector: 'SFP+ to SFP+',
                fiberType: 'Copper',
                rating: 4,
                reviewCount: 89,
                price: 24.99,
                manufacturer: 'generic',
                compatible: true,
                compatibilityScore: 0.90
            }
        ];
    }

    /**
     * Apply filters to components dynamically based on current component type
     */
    applyFilters() {
        const compatibilityFilter = document.getElementById('compatibilityFilter');
        const isCompatibilityFilterEnabled = compatibilityFilter ? compatibilityFilter.checked : true;
        const filterConfig = this.getFiltersForComponentType(this.currentComponentType);

        // Property mapping for filters to component properties
        const propertyMap = {
            'coreCount': 'cores',
            'baseClock': 'baseClock',
            'maxMemoryCapacity': 'maxMemoryCapacity'
        };

        this.filteredComponents = this.components.filter(component => {
            // Apply each filter based on configuration
            for (const [key, config] of Object.entries(filterConfig)) {
                if (config.type === 'radio') {
                    // Get current pill button selection (active button has bg-primary class)
                    const activeButton = document.querySelector(`.filter-pill[data-filter="${key}"].bg-primary`);
                    if (activeButton) {
                        const selectedValue = activeButton.dataset.value;
                        if (selectedValue !== 'all') {
                            // Special handling for memory types (array comparison)
                            if (key === 'memoryType') {
                                const componentMemoryTypes = component.memoryTypes || [];
                                const selectedType = selectedValue.toLowerCase();
                                // Check if any of the component's memory types match the selected filter
                                const hasMatchingType = componentMemoryTypes.some(type =>
                                    type.toLowerCase().includes(selectedType)
                                );
                                if (!hasMatchingType) {
                                    return false;
                                }
                            } else {
                                // Handle other pill button filters
                                const componentValue = this.formatValue(component[key]);
                                if (componentValue && componentValue.toLowerCase() !== selectedValue.toLowerCase()) {
                                    // Check if component value contains the filter value
                                    if (!componentValue.toLowerCase().includes(selectedValue.toLowerCase())) {
                                        return false;
                                    }
                                }
                            }
                        }
                    }
                } else if (config.type === 'range') {
                    // Get current range value
                    const rangeInput = document.getElementById(`${key}Range`);
                    if (rangeInput) {
                        const rangeValue = parseFloat(rangeInput.value);
                        const property = propertyMap[key] || key;
                        const componentValue = parseFloat(this.formatValue(component[property]));

                        // Other ranges: filter components with value >= selected value (min to max)
                        if (!isNaN(componentValue) && componentValue < rangeValue) {
                            return false;
                        }
                    }
                }
            }

            // Compatibility filter
            if (isCompatibilityFilterEnabled && !component.compatible) {
                return false;
            }

            return true;
        });

        this.renderComponents();
        this.updateComponentCount();
        this.updateCompatibilityBanner();
    }

    /**
     * Search components
     */
    searchComponents(query) {
        if (!query.trim()) {
            this.applyFilters();
            return;
        }

        const searchTerm = query.toLowerCase();
        this.filteredComponents = this.components.filter(component => {
            return component.name.toLowerCase().includes(searchTerm) ||
                component.architecture.toLowerCase().includes(searchTerm);
        });

        this.renderComponents();
        this.updateComponentCount();
    }

    /**
     * Render component list headers
     */
    renderComponentHeaders() {
        const headerContainer = document.getElementById('componentListHeader');

        const headers = this.getComponentHeaders(this.currentComponentType);

        headerContainer.innerHTML = `
            <tr class="bg-surface-secondary">
                <th class="px-4 py-3 text-left font-semibold text-xs text-text-muted uppercase tracking-wider w-12"></th>
                <th class="px-4 py-3 text-left font-semibold text-xs text-text-muted uppercase tracking-wider w-16"></th>
                <th class="px-4 py-3 text-left font-semibold text-xs text-text-muted uppercase tracking-wider">Name</th>
                ${headers.map(header => `<th class="px-4 py-3 text-left font-semibold text-xs text-text-muted uppercase tracking-wider">${header}</th>`).join('')}
            </tr>
        `;
    }

    /**
     * Get component headers based on type
     */
    getComponentHeaders(componentType) {
        const headerMap = {
            'cpu': ['Cores', 'Base Clock', 'Boost Clock', 'Architecture', 'TDP', 'Action'],
            'ram': ['Capacity', 'Speed', 'Type', 'Form Factor', 'Action'],
            'motherboard': ['Socket', 'Form Factor', 'Chipset', 'Memory Slots', 'Memory Type', 'Max Memory', 'Action'],
            'storage': ['Capacity', 'Storage Type', 'Interface', 'Form Factor', 'Action'],
            'nic': ['Speed', 'Interface', 'Ports', 'Connector', 'Protocol', 'Action'],
            'chassis': ['Brand', 'Form Factor', 'Action'],
            'caddy': ['Form Factor', 'Interface', 'Size', 'Action'],
            'pciecard': ['Interface', 'max_capacity', 'Form Factor', 'Action'],
            'hbacard': ['Interface', 'Protocol', 'Internal Ports', 'Action'],
            'sfp': ['Type', 'Speed', 'Wavelength', 'Reach', 'Connector', 'Action']
        };

        const headers = headerMap[componentType] || ['Spec 1', 'Spec 2', 'Spec 3', 'Spec 4', 'Spec 5'];

        // Ensure we have exactly 5 spec headers (plus Action makes 6)
        // If we have more than 5, truncate. If less, pad with empty strings.

        // First, remove 'Action' if it exists in the array to avoid duplication
        const cleanHeaders = headers.filter(h => h !== 'Action');

        // Truncate to max 5
        const truncatedHeaders = cleanHeaders.slice(0, 5);

        // Pad with empty strings if less than 5
        while (truncatedHeaders.length < 5) {
            truncatedHeaders.push('');
        }

        // Add Action as the 6th header
        truncatedHeaders.push('Action');

        return truncatedHeaders;
    }

    /**
     * Render components list as proper table rows
     */
    renderComponents() {
        const container = document.getElementById('componentList');

        if (this.filteredComponents.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="8" class="py-12 px-6 text-center">
                        <div class="flex flex-col items-center justify-center">
                            <i class="fas fa-search text-5xl text-text-muted/30 mb-4"></i>
                            <p class="text-sm text-text-muted font-medium">No components found matching your criteria</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        container.innerHTML = this.filteredComponents.map(component => `
            <tr class="border-b border-border-light hover:bg-surface-hover transition-colors ${!component.compatible ? 'opacity-60' : ''}" data-id="${component.id}">
                <td class="px-4 py-3 w-12">
                    <input type="checkbox" ${!component.compatible ? 'disabled' : ''}
                           onchange="window.configPage.toggleComponent('${component.id}')"
                           class="w-4 h-4 accent-primary">
                </td>
                <td class="px-4 py-3 w-16">
                    <div class="w-10 h-10 bg-surface-secondary rounded-lg flex items-center justify-center">
                        <i class="${this.getComponentIcon(component.type || this.currentComponentType)} text-lg text-primary"></i>
                    </div>
                </td>
                <td class="px-4 py-3">
                    <div class="font-semibold text-sm text-text-primary">${component.name}</div>
                    ${component.serial_number && component.serial_number !== 'N/A' ? `
                        <div class="text-xs text-text-muted mt-1">S/N: ${component.serial_number}</div>
                    ` : ''}
                </td>
                ${this.renderComponentSpecsCells(component)}
                <td class="px-4 py-3 text-center">
                    <button class="px-4 py-2 text-sm font-medium rounded-lg transition-all ${component.compatible
                ? 'bg-primary text-white hover:bg-primary-600'
                : 'bg-surface-secondary text-text-muted cursor-not-allowed'
            }" ${!component.compatible ? 'disabled' : ''}
                        onclick="window.configPage.addComponent('${component.id}')">
                        ${component.compatible ? 'Add' : 'Incompatible'}
                    </button>
                </td>
            </tr>
        `).join('');
    }

    /**
     * Get component icon based on type
     */
    getComponentIcon(componentType) {
        const iconMap = {
            'cpu': 'fas fa-microchip',
            'motherboard': 'fas fa-memory',
            'ram': 'fas fa-memory',
            'storage': 'fas fa-hdd',
            'nic': 'fas fa-network-wired',
            'psu': 'fas fa-plug',
            'gpu': 'fas fa-display',
            'chassis': 'fas fa-server',
            'caddy': 'fas fa-server',
            'pciecard': 'fas fa-expand-arrows-alt',
            'hbacard': 'fas fa-hdd',
            'sfp': 'fas fa-plug'
        };
        return iconMap[componentType] || 'fas fa-microchip';
    }

    /**
     * Safely format a value for display, handling objects, arrays, and primitives
     */
    formatValue(value, defaultValue = 'N/A') {
        if (value === null || value === undefined || value === '') {
            return defaultValue;
        }

        // Handle arrays - join with comma or return first element
        if (Array.isArray(value)) {
            return value.length > 0 ? value.join(', ') : defaultValue;
        }

        // Handle objects - extract first property or stringify
        if (typeof value === 'object') {
            // Check if it's a plain object with properties
            const keys = Object.keys(value);
            if (keys.length > 0) {
                // Return first property value if it's a simple value
                const firstValue = value[keys[0]];
                if (typeof firstValue !== 'object') {
                    return firstValue;
                }
            }
            return defaultValue;
        }

        return value;
    }

    /**
     * Render component specifications as table cells based on type
     */
    renderComponentSpecsCells(component) {
        let type = component.type || this.currentComponentType || this.component?.memory_type || this.component?.storage_type;

        if (type === 'DDR4' || type === 'DDR5') {
            type = 'ram';
        }

        if (type === "HDD" || type === "SSD") {
            type = 'storage';
        }

        const cellClass = 'px-4 py-3 text-sm text-text-secondary text-center whitespace-nowrap';

        // Desktop table layout with proper <td> elements
        switch (type) {
            case 'cpu':
                return `
                <td class="${cellClass}">${this.formatValue(component.cores)}</td>
                <td class="${cellClass}">${component.baseClock ? parseFloat(component.baseClock).toFixed(2) + ' GHz' : 'N/A'}</td>
                <td class="${cellClass}">${component.boostClock ? parseFloat(component.boostClock).toFixed(2) + ' GHz' : 'N/A'}</td>
                <td class="${cellClass}">${this.formatValue(component.architecture)}</td>
                <td class="${cellClass}">${this.formatValue(component.tdp) !== 'N/A' ? this.formatValue(component.tdp) + ' W' : 'N/A'}</td>
            `;
            case 'ram':
                return `
                <td class="${cellClass}">${this.formatValue(component.notes)}</td>
                <td class="${cellClass}">${this.formatValue(component.speed) !== 'N/A' ? this.formatValue(component.speed_MTs) + ' MT/s' : 'N/A'}</td>
                <td class="${cellClass}">${this.formatValue(component.type)}</td>
                <td class="${cellClass}">${this.formatValue(component.formFactor)}</td>
                <td class="${cellClass}"></td>
            `;
            case 'motherboard':
                return `
                <td class="${cellClass}">${this.formatValue(component.socket)}</td>
                <td class="${cellClass}">${this.formatValue(component.formFactor)}</td>
                <td class="${cellClass}">${this.formatValue(component.chipset)}</td>
                <td class="${cellClass}">${this.formatValue(component.ramSlots)}</td>
                <td class="${cellClass}">${this.formatValue(component.memoryType)}</td>
            `;
            case 'storage':
                return `
                <td class="${cellClass}">${this.formatValue(component.capacity)}</td>
                <td class="${cellClass}">${this.formatValue(component.storage_type || component.type)}</td>
                <td class="${cellClass}">${this.formatValue(component.interface)}</td>
                <td class="${cellClass}">${this.formatValue(component.formFactor)}</td>
                <td class="${cellClass}"></td>
            `;
            case 'nic':
                return `
                <td class="${cellClass}">${this.formatValue(component.speed)}</td>
                <td class="${cellClass}">${this.formatValue(component.interface)}</td>
                <td class="${cellClass}">${this.formatValue(component.ports)}</td>
                <td class="${cellClass}">${this.formatValue(component.connector)}</td>
                <td class="${cellClass}">${this.formatValue(component.protocol)}</td>
            `;
            case 'chassis':
                return `
                <td class="${cellClass}">${this.formatValue(component.brand || component.manufacturer)}</td>
                <td class="${cellClass}">${this.formatValue(component.formFactor)}</td>
                <td class="${cellClass}"></td>
                <td class="${cellClass}"></td>
                <td class="${cellClass}"></td>
            `;
            case 'caddy':
                return `
                <td class="${cellClass}">${this.formatValue(component.formFactor)}</td>
                <td class="${cellClass}">${this.formatValue(component.interface)}</td>
                <td class="${cellClass}">${this.formatValue(component.capacity || component.size)}</td>
                <td class="${cellClass}"></td>
                <td class="${cellClass}"></td>
            `;
            case 'pciecard':
                return `
                <td class="${cellClass}">${this.formatValue(component.interface)}</td>
                <td class="${cellClass}">${this.formatValue(component.total_max_capacity || component.max_capacity)}</td>
                <td class="${cellClass}">${this.formatValue(component.formFactor)}</td>
                <td class="${cellClass}"></td>
                <td class="${cellClass}"></td>
            `;
            case 'hbacard':
                return `
                <td class="${cellClass}">${this.formatValue(component.interface)}</td>
                <td class="${cellClass}">${this.formatValue(component.protocol)}</td>
                <td class="${cellClass}">${this.formatValue(component.internal_ports)}</td>
                <td class="${cellClass}"></td>
                <td class="${cellClass}"></td>
            `;
            case 'sfp':
                return `
                <td class="${cellClass}">${this.formatValue(component.type)}</td>
                <td class="${cellClass}">${this.formatValue(component.speed)}</td>
                <td class="${cellClass}">${this.formatValue(component.wavelength)}</td>
                <td class="${cellClass}">${this.formatValue(component.reach)}</td>
                <td class="${cellClass}">${this.formatValue(component.connector)}</td>
            `;
            default:
                return `
                <td class="${cellClass}">${this.formatValue(component.spec1)}</td>
                <td class="${cellClass}">${this.formatValue(component.spec2)}</td>
                <td class="${cellClass}">${this.formatValue(component.spec3)}</td>
                <td class="${cellClass}">${this.formatValue(component.spec4)}</td>
                <td class="${cellClass}">${this.formatValue(component.spec5)}</td>
            `;
        }
    }
    /**
     * Render mobile component specifications in card format
     */
    renderMobileComponentSpecs(component, type) {
        const specs = this.getComponentSpecData(component, type);
        return specs.map(spec => `
            <div class="component-spec-item">
                <div class="spec-label">
                    ${spec.label}
                </div>
                <div class="spec-value">${spec.value}</div>
            </div>
        `).join('');
    }

    /**
     * Get component specification data for mobile rendering
     */
    getComponentSpecData(component, type) {
        const specs = [];

        switch (type) {
            case 'cpu':
                specs.push(
                    { label: 'Cores', value: component.cores || 'N/A', icon: 'fas fa-microchip' },
                    { label: 'Base Clock', value: component.baseClock ? `${parseFloat(component.baseClock).toFixed(2)} GHz` : 'N/A', icon: 'fas fa-tachometer-alt' },
                    { label: 'Boost Clock', value: component.boostClock ? `${parseFloat(component.boostClock).toFixed(2)} GHz` : 'N/A', icon: 'fas fa-rocket' },
                    { label: 'Architecture', value: component.architecture || 'N/A', icon: 'fas fa-cogs' },
                    { label: 'TDP', value: component.tdp ? `${component.tdp} W` : 'N/A', icon: 'fas fa-bolt' },
                    { label: 'Graphics', value: component.graphics || 'N/A', icon: 'fas fa-palette' }
                );
                break;
            case 'ram':
                specs.push(
                    { label: 'Capacity', value: component.capacity || 'N/A', icon: 'fas fa-memory' },
                    { label: 'Speed', value: component.speed ? `${component.speed} MHz` : 'N/A', icon: 'fas fa-tachometer-alt' },
                    { label: 'Type', value: component.type || 'N/A', icon: 'fas fa-tag' },
                    { label: 'CAS Latency', value: component.cas || 'N/A', icon: 'fas fa-clock' },
                    { label: 'Voltage', value: component.voltage ? `${component.voltage} V` : 'N/A', icon: 'fas fa-bolt' },
                    { label: 'Form Factor', value: component.formFactor || 'N/A', icon: 'fas fa-shapes' }
                );
                break;
            case 'motherboard':
                specs.push(
                    { label: 'Socket', value: component.socket || 'N/A', icon: 'fas fa-plug' },
                    { label: 'Form Factor', value: component.formFactor || 'N/A', icon: 'fas fa-shapes' },
                    { label: 'Chipset', value: component.chipset || 'N/A', icon: 'fas fa-microchip' },
                    { label: 'Memory Slots', value: component.ramSlots || 'N/A', icon: 'fas fa-memory' },
                    { label: 'Memory Type', value: component.memoryType || 'N/A', icon: 'fas fa-tag' },
                    { label: 'Max Memory', value: component.maxMemory ? `${component.maxMemory} GB` : 'N/A', icon: 'fas fa-database' }
                );
                break;

            case 'storage':
                specs.push(
                    { label: 'Capacity', value: component.capacity || 'N/A', icon: 'fas fa-database' },
                    { label: 'Type', value: component.type || 'N/A', icon: 'fas fa-tag' },
                    { label: 'Interface', value: component.interface || 'N/A', icon: 'fas fa-network-wired' },
                    { label: 'Read Speed', value: component.readSpeed || 'N/A', icon: 'fas fa-download' },
                    { label: 'Write Speed', value: component.writeSpeed || 'N/A', icon: 'fas fa-upload' },
                    { label: 'Form Factor', value: component.formFactor || 'N/A', icon: 'fas fa-shapes' }
                );
                break;
            case 'nic':
                specs.push(
                    { label: 'Speed', value: component.speed || 'N/A', icon: 'fas fa-tachometer-alt' },
                    { label: 'Interface', value: component.interface || 'N/A', icon: 'fas fa-network-wired' },
                    { label: 'Ports', value: component.ports || 'N/A', icon: 'fas fa-plug' },
                    { label: 'Connector', value: component.connector || 'N/A', icon: 'fas fa-ethernet' },
                    { label: 'Protocol', value: component.protocol || 'N/A', icon: 'fas fa-exchange-alt' },
                    { label: 'Features', value: component.features || 'N/A', icon: 'fas fa-star' }
                );
                break;
            case 'chassis':
                specs.push(
                    { label: 'Form Factor', value: component.formFactor || 'N/A', icon: 'fas fa-shapes' },
                    { label: 'Max Drives', value: component.maxDrives || 'N/A', icon: 'fas fa-hdd' },
                    { label: 'Max RAM', value: component.maxRAM || 'N/A', icon: 'fas fa-memory' },
                    { label: 'Power Supply', value: component.powerSupply || 'N/A', icon: 'fas fa-bolt' },
                    { label: 'Dimensions', value: component.dimensions || 'N/A', icon: 'fas fa-ruler-combined' },
                    { label: 'Weight', value: component.weight || 'N/A', icon: 'fas fa-weight' }
                );
                break;
            case 'caddy':
                specs.push(
                    { label: 'Form Factor', value: component.formFactor || 'N/A', icon: 'fas fa-shapes' },
                    { label: 'Interface', value: component.interface || 'N/A', icon: 'fas fa-network-wired' },
                    { label: 'Capacity', value: component.capacity || 'N/A', icon: 'fas fa-database' },
                    { label: 'Speed', value: component.speed || 'N/A', icon: 'fas fa-tachometer-alt' },
                    { label: 'Hot Swap', value: component.hotSwap || 'N/A', icon: 'fas fa-sync-alt' },
                    { label: 'Compatibility', value: component.compatibility || 'N/A', icon: 'fas fa-check-circle' }
                );
                break;
            case 'pciecard':
                console.log('Getting PCIe card specs for component:', component.total_max_capacity);
                specs.push(
                    { label: 'Interface', value: component.interface || 'N/A', icon: 'fas fa-expand-arrows-alt' },
                    { label: 'Memory', value: component.total_max_capacity || 'N/A', icon: 'fas fa-memory' },
                    { label: 'Cores', value: component.cores || 'N/A', icon: 'fas fa-microchip' },
                    // { label: 'Base Clock', value: component.baseClock || 'N/A', icon: 'fas fa-tachometer-alt' },
                    // { label: 'Boost Clock', value: component.boostClock || 'N/A', icon: 'fas fa-rocket' },
                    // { label: 'TDP', value: component.tdp || 'N/A', icon: 'fas fa-bolt' }
                );
                break;
            case 'sfp':
                specs.push(
                    { label: 'Type', value: component.type || 'N/A', icon: 'fas fa-tag' },
                    { label: 'Speed', value: component.speed || 'N/A', icon: 'fas fa-tachometer-alt' },
                    { label: 'Wavelength', value: component.wavelength || 'N/A', icon: 'fas fa-wave-square' },
                    { label: 'Reach', value: component.reach || 'N/A', icon: 'fas fa-arrows-alt-h' },
                    { label: 'Connector', value: component.connector || 'N/A', icon: 'fas fa-plug' },
                    { label: 'Fiber Type', value: component.fiberType || 'N/A', icon: 'fas fa-ethernet' }
                );
                break;
            default:
                specs.push(
                    { label: 'Spec 1', value: component.spec1 || 'N/A', icon: 'fas fa-info-circle' },
                    { label: 'Spec 2', value: component.spec2 || 'N/A', icon: 'fas fa-info-circle' },
                    { label: 'Spec 3', value: component.spec3 || 'N/A', icon: 'fas fa-info-circle' },
                    { label: 'Spec 4', value: component.spec4 || 'N/A', icon: 'fas fa-info-circle' },
                    { label: 'Spec 5', value: component.spec5 || 'N/A', icon: 'fas fa-info-circle' },
                    { label: 'Spec 6', value: component.spec6 || 'N/A', icon: 'fas fa-info-circle' }
                );
        }

        return specs;
    }

    /**
     * Render star rating
     */
    renderStars(rating) {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            stars += `<i class="fas fa-star star ${i <= rating ? '' : 'empty'}"></i>`;
        }
        return stars;
    }

    /**
     * Toggle component selection
     */
    toggleComponent(componentId) {
        const component = this.filteredComponents.find(c => c.id === componentId);
        if (!component) return;

        const index = this.selectedComponents.findIndex(c => c.id === componentId);
        if (index > -1) {
            this.selectedComponents.splice(index, 1);
        } else {
            this.selectedComponents.push(component);
        }

        this.updateCompatibilityBanner();
    }

    /**
     * Add component to configuration
     */
    async addComponent(componentId) {
        const component = this.filteredComponents.find(c => c.id === componentId);
        if (!component || !component.compatible) {
            this.showAlert('Component is not compatible', 'warning');
            return;
        }

        try {
            this.showLoading(true, 'Adding component...');

            // Get config UUID from URL parameters
            const urlParams = new URLSearchParams(window.location.search);
            const configUuid = urlParams.get('config');
            const returnPage = urlParams.get('return');

            if (configUuid) {
                // For JSON-based components, we need to create a temporary component entry
                // in the database first, then add it to the configuration

                // First, try to add as a regular component (in case it exists in DB)
                let result = await serverAPI.addComponentToServer(
                    configUuid,
                    this.currentComponentType,
                    component.id,
                    1, // quantity
                    '', // slot position
                    false // override
                );

                // If that fails because component doesn't exist in DB, create it first
                if (!result.success && result.message &&
                    (result.message.includes('not found') || result.message.includes('Component not found'))) {
                    result = await this.createAndAddComponent(configUuid, component);
                }

                if (result.success) {
                    this.showAlert(`${component.name} added successfully`, 'success');
                    this.updateCompatibilityBanner();

                    // If we came from a specific page, redirect back
                    if (returnPage === 'builder') {
                        setTimeout(() => {
                            window.location.href = `../../pages/dashboard/servers.html?view=serverBuilder&config=${configUuid}`;
                        }, 1500);
                    }
                } else {
                    this.showAlert(result.message || 'Failed to add component', 'error');
                }
            } else {
                // Demo mode - just show success message
                this.showAlert(`${component.name} added successfully (Demo Mode)`, 'success');
                this.updateCompatibilityBanner();
            }

        } catch (error) {
            console.error('Error adding component:', error);
            this.showAlert(error.message || 'Failed to add component', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * Create and add component (for JSON-based components not in database)
     */

    async createAndAddComponent(configUuid, component) {
        try {
            // Generate a unique UUID for the JSON component
            const componentUuid = this.generateComponentUUID(component);


            // Use the existing addComponentToServer method (it now handles JSON components)
            const result = await serverAPI.addComponentToServer(
                configUuid,
                this.currentComponentType,
                componentUuid,
                1, // quantity
                '', // slot position
                false // override
            );

            if (result.success) {
                return result;
            } else {
                console.error('Failed to add JSON component:', result);
                return {
                    success: false,
                    message: result.message || 'Failed to add JSON component'
                };
            }

        } catch (error) {
            console.error('Error creating and adding component:', error);
            return {
                success: false,
                message: 'Failed to add JSON component: ' + error.message
            };
        }
    }

    /**
     * Generate a unique UUID for JSON components
     */
    generateComponentUUID(component) {
        // Create a deterministic UUID based on component properties
        const baseString = `${this.currentComponentType}-${component.name}-${component.manufacturer}`;
        const hash = this.simpleHash(baseString);
        return `json-${this.currentComponentType}-${hash}`;
    }

    /**
     * Simple hash function for generating UUIDs
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Get component specs formatted for API
     */
    getComponentSpecsForAPI(component) {
        const specs = {};

        switch (this.currentComponentType) {
            case 'cpu':
                specs.cores = component.cores;
                specs.threads = component.threads;
                specs.base_clock = component.baseClock;
                specs.boost_clock = component.boostClock;
                specs.architecture = component.architecture;
                specs.tdp = component.tdp;
                specs.graphics = component.graphics;
                specs.l2_cache = component.l2Cache;
                specs.l3_cache = component.l3Cache;
                specs.max_memory_capacity = component.maxMemoryCapacity;
                specs.memory_types = component.memoryTypes;
                break;
            case 'motherboard':
                specs.socket = component.socket;
                specs.form_factor = component.formFactor;
                specs.chipset = component.chipset;
                specs.ram_slots = component.ramSlots;
                specs.pcie_slots = component.pcieSlots;
                specs.sata_ports = component.sataPorts;
                break;
            case 'ram':
                specs.capacity = component.capacity;
                specs.speed = component.speed;
                specs.type = component.type;
                specs.cas = component.cas;
                specs.voltage = component.voltage;
                specs.form_factor = component.formFactor;
                break;
            case 'storage':
                specs.capacity = component.capacity;
                specs.type = component.type;
                specs.interface = component.interface;
                specs.read_speed = component.readSpeed;
                specs.write_speed = component.writeSpeed;
                specs.form_factor = component.formFactor;
                break;
            case 'nic':
                specs.speed = component.speed;
                specs.interface = component.interface;
                specs.ports = component.ports;
                specs.connector = component.connector;
                specs.protocol = component.protocol;
                specs.features = component.features;
                break;
            default:
                // Generic specs
                specs.spec1 = component.spec1;
                specs.spec2 = component.spec2;
                specs.spec3 = component.spec3;
                specs.spec4 = component.spec4;
                specs.spec5 = component.spec5;
                specs.spec6 = component.spec6;
        }

        return specs;
    }

    /**
     * Select all components
     */
    selectAllComponents() {
        const checkboxes = document.querySelectorAll('.component-item input[type="checkbox"]:not(:disabled)');
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
            const componentId = checkbox.closest('.component-item').dataset.id;
            this.toggleComponent(componentId);
        });
    }

    /**
     * Select none components
     */
    selectNoneComponents() {
        const checkboxes = document.querySelectorAll('.component-item input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        this.selectedComponents = [];
        this.updateCompatibilityBanner();
    }

    /**
     * Compare selected components
     */
    compareSelectedComponents() {
        if (this.selectedComponents.length < 2) {
            this.showAlert('Please select at least 2 components to compare', 'warning');
            return;
        }

        // Implement comparison modal
        this.showComparisonModal();
    }

    /**
     * Add selected components
     */
    async addSelectedComponents() {
        if (this.selectedComponents.length === 0) {
            this.showAlert('Please select components to add', 'warning');
            return;
        }

        try {
            this.showLoading(true, 'Adding selected components...');

            for (const component of this.selectedComponents) {
                if (component.compatible) {
                    // Add component via API
                    await serverAPI.addComponentToServer(configUuid, componentType, componentUuid);
                }
            }

            this.showAlert(`${this.selectedComponents.length} components added successfully`, 'success');
            this.selectedComponents = [];
            this.updateCompatibilityBanner();

        } catch (error) {
            console.error('Error adding components:', error);
            this.showAlert(error.message || 'Failed to add components', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * Update component count display
     */
    updateComponentCount() {
        const count = this.filteredComponents.length;
        document.getElementById('componentCount').textContent = `${count} Compatible Products`;
    }

    /**
     * Update compatibility banner
     * Shows banner when compatibility filter is UNCHECKED and there are incompatible items
     */
    updateCompatibilityBanner() {
        const banner = document.getElementById('compatibilityBanner');
        const message = document.getElementById('bannerMessage');
        const compatibilityFilter = document.getElementById('compatibilityFilter');

        // Count incompatible items in full list (not filtered)
        const incompatibleCount = this.components.filter(c => !c.compatible).length;
        const selectedIncompatible = this.selectedComponents.filter(c => !c.compatible);

        // Show warning banner when:
        // 1. User has selected incompatible items OR
        // 2. Compatibility filter is UNCHECKED and there are incompatible items
        if (selectedIncompatible.length > 0) {
            // Warning state: user selected incompatible items
            banner.classList.remove('hidden');
            message.textContent = `Warning: ${selectedIncompatible.length} selected component(s) have compatibility issues`;
            this.compatibilityState.hasWarnings = true;
            this.compatibilityState.hasErrors = true;
        } else if (!compatibilityFilter?.checked && incompatibleCount > 0) {
            // Note state: filter unchecked and incompatible items exist
            banner.classList.remove('hidden');
            message.textContent = `Note: ${incompatibleCount} component(s) are not compatible with your current configuration`;
            this.compatibilityState.hasWarnings = true;
            this.compatibilityState.hasErrors = false;
        } else {
            // Hide banner: either filter is checked or no incompatible items
            banner.classList.add('hidden');
            this.compatibilityState.hasWarnings = false;
            this.compatibilityState.hasErrors = false;
        }
    }

    /**
     * Show compatibility details
     */
    showCompatibilityDetails() {
        const incompatibleComponents = this.filteredComponents.filter(c => !c.compatible);
        const selectedIncompatible = this.selectedComponents.filter(c => !c.compatible);

        let details = '';

        if (selectedIncompatible.length > 0) {
            details = 'Selected incompatible components:\n';
            selectedIncompatible.forEach(component => {
                details += `• ${component.name}: ${component.compatibilityIssues?.join(', ') || 'Compatibility issues detected'}\n`;
            });
        } else if (incompatibleComponents.length > 0) {
            details = 'Incompatible components in list:\n';
            incompatibleComponents.forEach(component => {
                details += `• ${component.name}: ${component.compatibilityIssues?.join(', ') || 'Compatibility issues detected'}\n`;
            });
        } else {
            details = 'All components are compatible with your current configuration.';
        }

        alert(details);
    }

    /**
     * Dismiss banner
     */
    dismissBanner() {
        const banner = document.getElementById('compatibilityBanner');
        banner.classList.add('hidden');
    }

    /**
     * Show comparison modal
     */
    showComparisonModal() {
        // Implement comparison modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3>Component Comparison</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="comparison-table">
                        ${this.renderComparisonTable()}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    /**
     * Render comparison table
     */
    renderComparisonTable() {
        if (this.selectedComponents.length === 0) return '';

        const headers = ['Name', 'Cores', 'Threads', 'Base Clock', 'Boost Clock', 'TDP', 'Price'];

        let table = '<table class="comparison-table-content">';
        table += '<thead><tr>';
        headers.forEach(header => {
            table += `<th>${header}</th>`;
        });
        table += '</tr></thead><tbody>';

        this.selectedComponents.forEach(component => {
            table += '<tr>';
            table += `<td>${component.name}</td>`;
            table += `<td>${component.cores}</td>`;
            table += `<td>${component.threads}</td>`;
            table += `<td>${component.baseClock ? parseFloat(component.baseClock).toFixed(2) : 'N/A'} GHz</td>`;
            table += `<td>${component.boostClock ? parseFloat(component.boostClock).toFixed(2) : 'N/A'} GHz</td>`;
            table += `<td>${component.tdp} W</td>`;
            table += `<td>$${component.price.toFixed(2)}</td>`;
            table += '</tr>';
        });

        table += '</tbody></table>';
        return table;
    }

    /**
     * Show loading overlay (delegates to global loading manager)
     */
    showLoading(show, message = 'Loading...') {
        if (window.globalLoading) {
            window.globalLoading.showLoading(show, message);
        } else {
            console.warn('Global loading manager not available');
        }
    }

    /**
     * Update page title and header based on component type
     */
    updatePageTitle(componentType) {
        const typeMap = {
            'cpu': 'CPU',
            'motherboard': 'Motherboard',
            'ram': 'Memory (RAM)',
            'storage': 'Storage',
            'nic': 'Network Interface',
            'chassis': 'Chassis',
            'caddy': 'Caddy',
            'pciecard': 'PCIe Card',
            'hbacard': 'HBA Card'
        };

        const displayName = typeMap[componentType] || componentType.toUpperCase();

        // Update page title
        document.title = `Choose A ${displayName} - BDC IMS`;

        // Update header
        const header = document.querySelector('.config-header h1');
        if (header) {
            header.textContent = `Choose A ${displayName}`;
        }

        // Update search placeholder
        const searchInput = document.getElementById('componentSearch');
        if (searchInput) {
            searchInput.placeholder = displayName + 's';
        }
    }

    /**
     * Show back button for navigation
     */
    showBackButton(returnPage, configUuid) {
        const backButton = document.getElementById('backButton');
        if (backButton) {
            backButton.style.display = 'inline-flex';
            backButton.setAttribute('data-return-page', returnPage);
            backButton.setAttribute('data-config-uuid', configUuid || '');
        }
    }

    /**
     * Go back to previous page
     */
    goBack() {
        const backButton = document.getElementById('backButton');
        const returnPage = backButton.getAttribute('data-return-page');
        const configUuid = backButton.getAttribute('data-config-uuid');

        if (returnPage === 'builder' && configUuid) {
            // Always redirect to servers page with serverBuilder view
            window.location.href = `../../pages/dashboard/servers.html?view=serverBuilder&config=${configUuid}`;
        } else {
            // Default fallback
            window.history.back();
        }
    }

    /**
     * Show alert notification
     */
    showAlert(message, type = 'info') {
        // Use the existing toast system
        if (typeof toastNotification !== 'undefined') {
            toastNotification.show(message, type);
        } else {
            // Fallback to alert
            alert(message);
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.configPage = new ConfigurationPage();
});



// Add comparison table styles
const style = document.createElement('style');
style.textContent = `
    .comparison-table-content {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1rem;
    }
    
    .comparison-table-content th,
    .comparison-table-content td {
        padding: 0.75rem;
        text-align: left;
        border-bottom: 1px solid var(--border-color);
    }
    
    .comparison-table-content th {
        background-color: var(--sidebar-bg);
        font-weight: 600;
        color: var(--text-primary);
    }
    
    .comparison-table-content tr:hover {
        background-color: var(--sidebar-bg);
    }
    
    .component-item.incompatible {
        opacity: 0.6;
        background-color: #fef2f2;
    }

    .star.empty {
        color: #d1d5db;
    }

    /* Compatibility Badge Styles */
    .compatibility-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
        margin-left: 0.5rem;
        vertical-align: middle;
    }

    .compatibility-badge.compatible {
        background-color: #d1fae5;
        color: #065f46;
        border: 1px solid #6ee7b7;
    }

    .compatibility-badge.incompatible {
        background-color: #fee2e2;
        color: #991b1b;
        border: 1px solid #fca5a5;
    }

    .compatibility-badge i {
        font-size: 0.875rem;
    }

    /* Mobile responsive for compatibility badges */
    @media (max-width: 768px) {
        .compatibility-badge {
            display: flex;
            margin-left: 0;
            margin-top: 0.5rem;
            font-size: 0.7rem;
            padding: 0.2rem 0.4rem;
        }
    }
`;
document.head.appendChild(style);
