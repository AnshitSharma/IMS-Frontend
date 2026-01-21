/**
 * Server Builder
 * Modern interface for building server configurations
 */

class ServerBuilder {
    constructor() {
        this.currentConfig = null;
        this.motherboardDetails = null; // Will store motherboard JSON data
        this.selectedComponents = {
            cpu: [],
            motherboard: [],
            ram: [],
            storage: [],
            chassis: [],
            caddy: [],
            pciecard: [],
            nic: [],
            hbacard: [],
            sfp: []
        };

        this.componentTypes = [
            {
                type: 'cpu',
                name: 'CPU',
                description: 'Processor',
                icon: 'fas fa-microchip',
                multiple: true,
                required: true
            },
            {
                type: 'motherboard',
                name: 'Motherboard',
                description: 'System Board',
                icon: 'fas fa-th-large',
                multiple: false,
                required: true
            },
            {
                type: 'ram',
                name: 'Memory',
                description: 'RAM Modules',
                icon: 'fas fa-memory',
                multiple: true,
                required: true
            },
            {
                type: 'storage',
                name: 'Storage',
                description: 'Hard Drives, SSDs',
                icon: 'fas fa-hdd',
                multiple: true,
                required: false
            },
            {
                type: 'chassis',
                name: 'Chassis',
                description: 'Server Case',
                icon: 'fas fa-server',
                multiple: false,
                required: true
            },
            {
                type: 'caddy',
                name: 'Caddy',
                description: 'Drive Mounting',
                icon: 'fas fa-box',
                multiple: true,
                required: false
            },
            {
                type: 'pciecard',
                name: 'PCI Cards',
                description: 'Expansion Cards',
                icon: 'fas fa-credit-card',
                multiple: true,
                required: false
            },
            {
                type: 'nic',
                name: 'Network Cards',
                description: 'Network Interface',
                icon: 'fas fa-network-wired',
                multiple: true,
                required: false
            },
            {
                type: 'hbacard',
                name: 'HBA Cards',
                description: 'Host Bus Adapter',
                icon: 'fas fa-hdd',
                multiple: true,
                required: false
            },
            {
                type: 'sfp',
                name: 'SFP Modules',
                description: 'Fiber Transceivers',
                icon: 'fas fa-plug',
                multiple: true,
                required: false
            }
        ];

        this.compatibilityIssues = [];
        this.performanceWarnings = [];

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

                // Pass the object that contains the 'components' key
                // In new format, it is result.data
                // In old format, it might have been result.data or result.data.configuration
                // We prefer result.data if it has components, otherwise fall back
                const dataWithComponents = result.data.components ? result.data : configData;

                await this.parseExistingComponents(dataWithComponents);
                this.renderServerBuilderInterface();
            } else {
                console.error('Failed to load configuration:', result);
                this.showAlert(result.message || 'Failed to load configuration', 'danger');
                this.renderErrorState(result.message || 'Failed to load configuration');
            }
        } catch (error) {
            console.error('Error loading configuration:', error);
            this.showAlert('Failed to load server configuration', 'danger');
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
                        <p class="text-text-secondary mb-6">${errorMessage}</p>
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
                        serial_number: comp.serial_number || 'Not Found',
                        quantity: comp.quantity || 1,
                        slot_position: comp.slot_position || '',
                        added_at: comp.added_at || ''
                    }));
                }
            });
        }

        // Load motherboard details from JSON if motherboard is selected
        if (this.selectedComponents.motherboard.length > 0) {
            await this.loadMotherboardDetails(this.selectedComponents.motherboard[0].uuid);
        }

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
            // Fallback if no chassis data
            return chassisComponents.map((chassis, index) => `
            <div class="flex justify-between items-center p-3 bg-surface-card rounded-md mb-2 border-2 border-primary transition-all">
                <span class="text-[13px] font-medium text-text-secondary">Chassis</span>
                <span class="text-sm font-semibold text-text-primary">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-server"></i>
                        <span>Chassis:</span>
                        <span>${chassis.serial_number}</span>
                    </div>
                </span>
            </div>
        `).join('') || `
            <div class="flex justify-between items-center p-3 bg-surface-card rounded-md mb-2 border-2 border-border opacity-60 transition-all">
                <span class="text-[13px] font-medium text-text-secondary">Chassis</span>
                <span class="text-sm text-text-muted italic">Empty</span>
            </div>
        `;
        }

        // Render detailed chassis information
        return `
        <div class="chassis-details">
            <div class="chassis-header">
                <div class="chassis-model">${chassisData.model}</div>
                <div class="chassis-brand">${chassisData.brand} - ${chassisData.series}</div>
            </div>
            
            <div class="chassis-specs">
                <div class="spec-item">
                    <span class="spec-label">Form Factor:</span>
                    <span class="spec-value">${chassisData.form_factor} (${chassisData.u_size}U)</span>
                </div>
                
                <div class="spec-item">
                    <span class="spec-label">Drive Bays:</span>
                    <span class="spec-value">${chassisData.drive_bays.total_bays} total</span>
                </div>
                
                ${this.renderDriveBays(chassisData.drive_bays)}
                
                ${chassisData.backplane ? `
                <div class="spec-item">
                    <span class="spec-label">Backplane:</span>
                    <span class="spec-value">${chassisData.backplane.model}</span>
                </div>
                
                <div class="spec-item">
                    <span class="spec-label">Interface:</span>
                    <span class="spec-value">${chassisData.backplane.interface}</span>
                </div>
                ` : ''}
                
                ${chassisData.power_supply ? `
                <div class="spec-item">
                    <span class="spec-label">Power Supply:</span>
                    <span class="spec-value">${chassisData.power_supply.wattage}W ${chassisData.power_supply.redundant ? '(Redundant)' : ''}</span>
                </div>
                ` : ''}
            </div>
        </div>
        `;
    }

    /**
     * Render drive bays configuration
     */
    renderDriveBays(driveBays) {
        if (!driveBays.bay_configuration) return '';

        return driveBays.bay_configuration.map(bay => `
        <div class="spec-item indent">
            <span class="spec-label">${bay.bay_type.replace('_', ' ')}:</span>
            <span class="spec-value">${bay.count} bays ${bay.hot_swap ? '(Hot-swap)' : ''}</span>
        </div>
        `).join('');
    }
    /**
     * Load motherboard details from JSON
     */
    // async loadMotherboardDetails(uuid) {
    //     try {
    //         // Fetch motherboard JSON
    //         const response = await fetch('../data/motherboad-jsons/motherboard-level-3.json');
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
     * Load motherboard details from JSON
     */
    async loadMotherboardDetails(uuid) {
        try {
            // Fetch motherboard JSON
            const response = await fetch('../../data/motherboad-jsons/motherboard-level-3.json');
            if (!response.ok) {
                console.error('Failed to fetch motherboard JSON');
                return;
            }

            const motherboardData = await response.json();

            // Search for the motherboard by UUID
            for (const brand of motherboardData) {
                if (brand.models) {
                    for (const model of brand.models) {
                        if (model.uuid === uuid) {
                            this.motherboardDetails = {
                                brand: brand.brand,
                                series: brand.series,
                                family: brand.family,
                                chassisSocket: model.form_factor || 'ATX',
                                caddySockets: model.caddy_sockets || [], // Add caddy sockets
                                ...model
                            };
                            console.log('Loaded motherboard details:', this.motherboardDetails);
                            return;
                        }
                    }
                }
            }

            console.warn('Motherboard UUID not found in JSON:', uuid);
        } catch (error) {
            console.error('Error loading motherboard details:', error);
        }
    }

    /**
     * Render caddy sockets - Dynamic based on motherboard JSON
     */
    renderCaddySockets() {
        const caddyComponents = this.selectedComponents.caddy || [];
        const motherboardData = this.motherboardDetails;

        if (!motherboardData || !motherboardData.caddySockets || motherboardData.caddySockets.length === 0) {
            // Fallback if no caddy socket data
            return caddyComponents.map((caddy, index) => `
            <div class="flex justify-between items-center p-3 bg-surface-card rounded-md mb-2 border-2 border-primary transition-all">
                <span class="text-[13px] font-medium text-text-secondary">Caddy Socket ${index + 1}</span>
                <span class="text-sm font-semibold text-text-primary">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-box"></i>
                        <span>Caddy:</span>
                        <span>${caddy.serial_number}</span>
                    </div>
                </span>
            </div>
        `).join('') || `
            <div class="flex justify-between items-center p-3 bg-surface-card rounded-md mb-2 border-2 border-border opacity-60 transition-all">
                <span class="text-[13px] font-medium text-text-secondary">Caddy Socket</span>
                <span class="text-sm text-text-muted italic">Empty</span>
            </div>
        `;
        }

        let html = '';
        const caddySockets = motherboardData.caddySockets;

        caddySockets.forEach((socket, index) => {
            const caddy = caddyComponents[index];
            const socketType = socket.type || 'Caddy';
            const socketSize = socket.size ? ` (${socket.size})` : '';

            html += `
            <div class="flex justify-between items-center p-3 bg-surface-card rounded-md mb-2 border-2 ${caddy ? 'border-primary' : 'border-border opacity-60'} transition-all">
                <span class="text-[13px] font-medium text-text-secondary">${socketType} Socket ${index + 1}${socketSize}</span>
                <span class="${caddy ? 'text-sm font-semibold text-text-primary' : 'text-sm text-text-muted italic'}">
                    ${caddy ? `
                        <div class="flex items-center gap-2">
                            <i class="fas fa-box"></i>
                            <span>Caddy:</span>
                            <span class="component-name">${caddy.serial_number}</span>
                        </div>
                    ` : 'Empty'}
                </span>
            </div>
        `;
        });

        return html;
    }
    /**
     * Check compatibility issues
     */
    // checkCompatibility() {
    //     this.compatibilityIssues = [];
    //     this.performanceWarnings = [];

    //     // Check for missing required components
    //     this.componentTypes.forEach(compType => {
    //         if (compType.required && this.selectedComponents[compType.type].length === 0) {
    //             this.compatibilityIssues.push({
    //                 severity: 'critical',
    //                 type: 'missing_component',
    //                 icon: 'fas fa-exclamation-triangle',
    //                 title: `Missing ${compType.name}`,
    //                 message: `No ${compType.name} selected. Adding a ${compType.name.toLowerCase()} is required for the system to function.`,
    //                 details: `A ${compType.name.toLowerCase()} is essential for your server configuration. Without it, the system cannot operate properly.`,
    //                 links: [
    //                     { text: 'Learn about server components', url: 'guide/' },
    //                     { text: 'Server build guide', url: 'server-build-guide/' }
    //                 ],
    //                 action: {
    //                     text: `Add ${compType.name}`,
    //                     callback: () => this.addComponent(compType.type),
    //                     actionType: compType.type
    //                 },
    //                 group: 'required_components'
    //             });
    //         }
    //     });

    //     // Check for CPU cooler if CPU is selected
    //     // if (this.selectedComponents.cpu.length > 0) {
    //     //     this.compatibilityIssues.push({
    //     //         severity: 'warning',
    //     //         type: 'cpu_cooler',
    //     //         icon: 'fas fa-fan',
    //     //         title: 'CPU Cooler Required',
    //     //         message: 'The selected CPU does not include a stock cooler. Adding a CPU cooler is recommended.',
    //     //         details: 'High-performance CPUs generate significant heat and require adequate cooling to maintain optimal performance and prevent thermal throttling.',
    //     //         action: {
    //     //             text: 'Add CPU Cooler',
    //     //             callback: () => this.addComponent('cooler'),
    //     //             actionType: 'cooler'
    //     //         },
    //     //         group: 'cooling'
    //     //     });
    //     // }

    //     // Check RAM compatibility
    //     if (this.selectedComponents.ram.length > 0) {
    //         const ramCount = this.selectedComponents.ram.length;
    //         if (ramCount % 2 !== 0) {
    //             this.compatibilityIssues.push({
    //                 severity: 'warning',
    //                 type: 'ram_compatibility',
    //                 icon: 'fas fa-memory',
    //                 title: 'RAM Configuration',
    //                 message: 'Uneven number of RAM modules may affect dual-channel performance.',
    //                 details: 'For optimal performance, install RAM in matched pairs to enable dual-channel memory mode.',
    //                 action: {
    //                     text: 'Review RAM',
    //                     callback: () => this.addComponent('ram'),
    //                     actionType: 'ram'
    //                 },
    //                 group: 'memory'
    //             });
    //         }
    //     }

    //     // Add performance warnings
    //     if (this.selectedComponents.ram.length > 0) {
    //         this.performanceWarnings.push({
    //             severity: 'info',
    //             type: 'physical_constraints',
    //             icon: 'fas fa-ruler-combined',
    //             title: 'Physical Constraints',
    //             message: 'Some physical constraints are not checked, such as RAM clearance with CPU Coolers.',
    //             details: 'Ensure that installed components do not physically interfere with each other. Check manufacturer specifications for clearance requirements.',
    //             action: {
    //                 text: 'Learn More',
    //                 callback: () => window.open('/', '_blank')
    //             },
    //             group: 'compatibility'
    //         });
    //     }

    // }
    /**
 * Check compatibility issues
 */
    checkCompatibility() {
        this.compatibilityIssues = [];
        this.performanceWarnings = [];

        // Check for missing required components
        this.componentTypes.forEach(compType => {
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

        // Check for CPU cooler if CPU is selected
        // if (this.selectedComponents.cpu.length > 0) {
        //     this.compatibilityIssues.push({
        //         severity: 'warning',
        //         type: 'cpu_cooler',
        //         icon: 'fas fa-fan',
        //         title: 'CPU Cooler Required',
        //         message: 'The selected CPU does not include a stock cooler. Adding a CPU cooler is recommended.',
        //         details: 'High-performance CPUs generate significant heat and require adequate cooling to maintain optimal performance and prevent thermal throttling.',
        //         action: {
        //             text: 'Add CPU Cooler',
        //             callback: () => this.addComponent('cooler'),
        //             actionType: 'cooler'
        //         },
        //         group: 'cooling'
        //     });
        // }

        // REMOVED: RAM compatibility check for uneven modules
        // if (this.selectedComponents.ram.length > 0) {
        //     const ramCount = this.selectedComponents.ram.length;
        //     if (ramCount % 2 !== 0) {
        //         this.compatibilityIssues.push({
        //             severity: 'warning',
        //             type: 'ram_compatibility',
        //             icon: 'fas fa-memory',
        //             title: 'RAM Configuration',
        //             message: 'Uneven number of RAM modules may affect dual-channel performance.',
        //             details: 'For optimal performance, install RAM in matched pairs to enable dual-channel memory mode.',
        //             action: {
        //                 text: 'Review RAM',
        //                 callback: () => this.addComponent('ram'),
        //                 actionType: 'ram'
        //             },
        //             group: 'memory'
        //         });
        //     }
        // }

        // REMOVED: Physical constraints warning
        // if (this.selectedComponents.ram.length > 0) {
        //     this.performanceWarnings.push({
        //         severity: 'info',
        //         type: 'physical_constraints',
        //         icon: 'fas fa-ruler-combined',
        //         title: 'Physical Constraints',
        //         message: 'Some physical constraints are not checked, such as RAM clearance with CPU Coolers.',
        //         details: 'Ensure that installed components do not physically interfere with each other. Check manufacturer specifications for clearance requirements.',
        //         action: {
        //             text: 'Learn More',
        //             callback: () => window.open('/', '_blank')
        //         },
        //         group: 'compatibility'
        //     });
        // }
    }

    /**
     * Render Import Template Button (Module Integration)
     */
    renderImportButton() {
        return `
            <div class="flex justify-end mb-4">
                <button class="inline-flex items-center gap-2 px-4 py-2 bg-surface-card border border-primary/20 text-primary rounded-lg text-sm font-medium hover:bg-primary/5 transition-colors" onclick="window.serverBuilder.openImportModal()">
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
            listContainer.innerHTML = '<p class="text-danger text-center p-3">Failed to load templates</p>';
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
                <div class="font-medium text-text-primary group-hover:text-primary transition-colors">${t.server_name}</div>
                <div class="text-xs text-text-secondary truncate">${t.description || 'No description'}</div>
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
                const config = result.data.configuration || result.data;

                // Resolve component names from JSON files before rendering
                await this.resolveTemplateComponentNames(config);

                this.renderTemplatePreview(config);
                importBtn.disabled = false;
            } else {
                previewContainer.innerHTML = '<p class="text-danger">Failed to load template details</p>';
            }
        } catch (error) {
            console.error('Preview error:', error);
            previewContainer.innerHTML = '<p class="text-danger">Error loading template</p>';
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
                    if (!item.product_name && !item.name && !item.model) {
                        try {
                            item.resolved_name = await this.lookupComponentNameByUuid(type, item.uuid);
                        } catch (e) {
                            console.warn(`Failed to resolve name for ${type} ${item.uuid}:`, e);
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
            'cpu': '../../data/cpu-jsons/Cpu-details-level-3.json',
            'motherboard': '../../data/motherboad-jsons/motherboard-level-3.json',
            'chassis': '../../data/chasis-jsons/chasis-level-3.json',
            'ram': '../../data/Ram-jsons/ram_detail.json',
            'storage': '../../data/storage-jsons/storage-level-3.json',
            'nic': '../../data/nic-jsons/nic-level-3.json',
            'pciecard': '../../data/pci-jsons/pci-level-3.json',
            'hbacard': '../../data/hbacard-jsons/hbacard-level-3.json',
            'sfp': '../../data/sfp-jsons/sfp-level-3.json',
            'caddy': '../../data/caddy-jsons/caddy_details.json'
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
                                ${item.resolved_name || item.product_name || item.name || item.model || 'Unknown Component'}
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
            { key: 'nic', icon: 'fas fa-network-wired', label: 'Network' }
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
                <h4 class="text-lg font-bold text-text-primary mb-1">${config.server_name}</h4>
                <p class="text-sm text-text-secondary mb-4">${config.description || 'No description provided'}</p>
                
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
            this.showAlert('An unexpected error occurred during import.', 'danger');
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
            this.showAlert(`Import Complete: ${addedCount} components added based on availability.`, 'success');
        }

        // 2. Warning Toast (if partial)
        if (skippedCount > 0) {
            setTimeout(() => {
                this.showAlert(`Partial Import: ${skippedCount} items skipped (Out of Stock or Mismatch). You can complete them manually.`, 'warning');
            }, 500); // Slight delay so they stack nicely or appear sequentially

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
     * Fetch NIC Details from JSON
     */
    async fetchNICDetails(uuid) {
        try {
            const response = await fetch('../../data/nic-jsons/nic-level-3.json');
            const nicData = await response.json();

            // Search for NIC by UUID in the JSON structure
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
        const estimatedPower = this.calculateEstimatedPower();

        const interfaceHtml = `
            <div class="w-full mx-auto">
                <!-- Import Template Button (Server Templates V2) -->
                ${this.renderImportButton()}

               <!-- Component Selection Table -->
                <div class="bg-surface-card rounded-xl border border-border-light overflow-hidden mb-6">
                    <table class="w-full border-collapse">
                        <thead class="bg-surface-secondary">
                            <tr>
                                <th class="text-left px-6 py-4 font-semibold text-sm text-text-primary uppercase tracking-wider">Component</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.componentTypes.map(type => this.renderComponentRow(type)).join('')}
                        </tbody>
                    </table>
                </div>

                <!-- Finish Configuration Button -->
                <div class="flex justify-center my-6">
                    <button class="inline-flex items-center gap-3 px-8 py-3.5 bg-primary text-white border-none rounded-xl text-base font-semibold cursor-pointer transition-all shadow-md hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-lg" onclick="window.serverBuilder.finishConfiguration()">
                        <i class="fas fa-check-circle text-lg"></i>
                        Finish Setup
                    </button>
                </div>
                

                <!-- Compatibility Warning -->
                ${hasIssues ? `
                    <div class="flex items-center gap-3 px-5 py-4 rounded-xl mb-6 font-medium bg-warning/10 border border-warning text-warning">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span class="text-[15px]">Compatibility: Warning! These parts have potential issues. See details below.</span>
                    </div>
                ` : `
                    <div class="flex items-center gap-3 px-5 py-4 rounded-xl mb-6 font-medium bg-success/10 border border-success text-success">
                        <i class="fas fa-check-circle"></i>
                        <span class="text-[15px]">Compatibility: All components are compatible.</span>
                    </div>
                `}

                <!-- Potential Issues -->
                ${this.compatibilityIssues.length > 0 || this.performanceWarnings.length > 0 ? `
                    <div class="bg-surface-card border border-border-light rounded-xl p-6 mb-6">
                        <div class="flex justify-between items-center mb-4">
                            <h4 class="flex items-center gap-2 text-lg font-semibold text-text-primary m-0">
                                <i class="fas fa-exclamation-triangle text-warning"></i>
                                Potential Issues
                            </h4>
                            <div class="flex items-center gap-2">
                                <span class="text-2xl font-bold text-warning">${this.getTotalIssuesCount()}</span>
                                <span class="text-sm text-text-muted">issues found</span>
                            </div>
                        </div>
                        <div class="mb-6">
                            <div class="w-full h-2 bg-surface-secondary rounded overflow-hidden mb-2">
                                <div class="h-full bg-primary transition-all duration-300" style="width: ${this.getIssuesResolvedPercentage()}%"></div>
                            </div>
                            <div class="text-[13px] text-text-muted">${this.getIssuesResolvedCount()} of ${this.getTotalIssuesCount()} issues resolved</div>
                        </div>
                        ${this.renderGroupedIssues()}
                    </div>
                ` : ''}

                <!-- Motherboard Usage -->
                ${this.selectedComponents.motherboard.length > 0 ? `
                    <div class="bg-surface-card border border-border-light rounded-xl p-6 mb-6">
                        <h4 class="text-lg font-semibold text-text-primary m-0 mb-6">Motherboard Usage</h4>
                        <div class="grid gap-6">
                            <div class="bg-surface-secondary rounded-lg p-4">
                                <div class="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3">CPU Sockets</div>
                                ${this.renderSocketSlots()}
                            </div>
                            <div class="text-center p-8 bg-gradient-to-br from-surface-secondary to-surface-hover rounded-lg">
                                <div class="text-xl font-bold text-text-primary mb-2">${this.selectedComponents.motherboard[0]?.serial_number || 'Motherboard'}</div>
                                <div class="text-sm text-text-secondary">Server Motherboard</div>
                            </div>
                            <div class="bg-surface-secondary rounded-lg p-4">
                                <div class="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3">Memory Slots</div>
                                ${this.renderMemorySlots()}
                            </div>
                            <div class="bg-surface-secondary rounded-lg p-4">
                                <div class="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3">Chassis</div>
                                ${this.renderChassisDetails()}
                            </div>
                            <div class="bg-surface-secondary rounded-lg p-4">
                                <div class="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3">Caddy Sockets</div>
                                ${this.renderCaddySockets()}
                            </div>
                        </div>
                        <div class="mt-4 grid grid-cols-2 gap-4">
                            <div class="bg-surface-secondary rounded-lg p-4">
                                <div class="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3">Expansion Slots</div>
                                ${this.renderExpansionSlots()}
                            </div>
                            <div class="bg-surface-secondary rounded-lg p-4">
                                <div class="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3">Storage</div>
                                ${this.renderStorageAndUSB()}
                            </div>
                        </div>
                    </div>
                ` : ''}


            </div>
        `;

        // Check if we're in the dashboard or standalone
        const targetElement = document.getElementById('serverBuilderContent') || document.getElementById('app');
        if (targetElement) {
            targetElement.innerHTML = interfaceHtml;
            this.attachEventListeners();
        } else {
            console.error('No target element found for rendering');
        }
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
                                            <span class="summary-value">${this.currentConfig.server_name || 'Unnamed Server'}</span>
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
                                    <span class="component-serial">${component.serial_number}</span>
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
            <div class="server-builder-container">
                <div class="server-builder-header">
                    <h1 class="server-builder-title">Builder Test</h1>
                    <p class="server-builder-subtitle">This confirms the builder is working</p>
                </div>
                
                <div class="compatibility-banner success">
                    <i class="fas fa-check-circle"></i>
                    <span class="compatibility-text">Builder is loaded and working!</span>
                </div>
                
                <div class="component-table-container">
                    <table class="component-table">
                        <thead>
                            <tr>
                                <th>Component</th>
                             
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="component-row">
                                <td>
                                    <div class="component-cell">
                                        <div class="component-icon">
                                            <i class="fas fa-microchip"></i>
                                        </div>
                                        <div class="component-info">
                                            <div class="component-name">CPU</div>
                                            <div class="component-specs">Test Component</div>
                                        </div>
                                    </div>
                                </td>
                                <td colspan="8" style="text-align: center; color: var(--text-muted);">
                                    <button class="btn-add">
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
            // Fetch chassis JSON
            const response = await fetch('../../data/chasis-jsons/chasis-level-3.json');
            if (!response.ok) {
                console.error('Failed to fetch chassis JSON');
                return null;
            }

            const chassisData = await response.json();

            // Search for the chassis by UUID
            for (const manufacturer of chassisData.manufacturers) {
                for (const series of manufacturer.series) {
                    for (const model of series.models) {
                        if (model.uuid === uuid) {
                            console.log('Loaded chassis details:', model);
                            return model;
                        }
                    }
                }
            }

            console.warn('Chassis UUID not found in JSON:', uuid);
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

        if (hasComponents) {
            if (isMultiple) {
                // Show all selected components separated by "/" with "Add More" at the end
                const componentsDisplay = components.map((comp, index) => {
                    const displayName = comp.serial_number || 'Unnamed Component';
                    const position = comp.slot_position ? ` (${comp.slot_position})` : '';

                    return `
                    <span class="inline-flex items-center gap-2 bg-surface-secondary px-3 py-2 rounded-lg">
                        <span class="text-sm font-medium">${displayName}${position}</span>
                        <button class="inline-flex items-center justify-center w-6 h-6 bg-transparent text-text-muted border-none rounded cursor-pointer transition-all p-0 hover:bg-danger/10 hover:text-danger" onclick="window.serverBuilder.removeComponent('${componentType.type}', '${comp.uuid}')" title="Remove">
                            <i class="fas fa-times text-xs"></i>
                        </button>
                        ${index < components.length - 1 ? '<span class="text-text-muted font-normal mx-1">/</span>' : ''}
                    </span>
                `;
                }).join('');

                return `
                <tr class="border-t border-border-light transition-colors hover:bg-surface-hover" id="component-row-${componentType.type}">
                    <td class="px-6 py-4 align-middle">
                        <div class="flex items-center gap-4">
                            <div class="w-11 h-11 bg-surface-secondary rounded-lg flex items-center justify-center flex-shrink-0">
                                <i class="${componentType.icon} text-xl text-primary"></i>
                            </div>
                            <div class="flex flex-col gap-1">
                                <div class="font-semibold text-[15px] text-text-primary">${componentType.name}</div>
                                <div class="text-[13px] text-text-muted">${componentType.description}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4 align-middle">
                        <div class="flex flex-wrap items-center gap-2">
                            ${componentsDisplay}
                            <span class="text-text-muted font-normal mx-1">/</span>
                            <button class="inline-flex items-center gap-2 px-5 py-2.5 bg-transparent text-primary border border-primary rounded-lg text-sm font-medium cursor-pointer transition-all hover:bg-primary/10" onclick="window.serverBuilder.addComponent('${componentType.type}')">
                                <i class="fas fa-plus"></i>
                                Add More
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            } else {
                // Single component - show only the component WITHOUT any replace button
                const comp = components[0];
                const displayName = comp.serial_number || 'Unnamed Component';
                const position = comp.slot_position ? ` (${comp.slot_position})` : '';

                return `
                <tr class="border-t border-border-light transition-colors hover:bg-surface-hover" id="component-row-${componentType.type}">
                    <td class="px-6 py-4 align-middle">
                        <div class="flex items-center gap-4">
                            <div class="w-11 h-11 bg-surface-secondary rounded-lg flex items-center justify-center flex-shrink-0">
                                <i class="${componentType.icon} text-xl text-primary"></i>
                            </div>
                            <div class="flex flex-col gap-1">
                                <div class="font-semibold text-[15px] text-text-primary">${componentType.name}</div>
                                <div class="text-[13px] text-text-muted">${componentType.description}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4 align-middle">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="inline-flex items-center gap-2 bg-surface-secondary px-3 py-2 rounded-lg">
                                <span class="text-sm font-medium">${displayName}${position}</span>
                                <button class="inline-flex items-center justify-center w-6 h-6 bg-transparent text-text-muted border-none rounded cursor-pointer transition-all p-0 hover:bg-danger/10 hover:text-danger" onclick="window.serverBuilder.removeComponent('${componentType.type}', '${comp.uuid}')" title="Remove">
                                    <i class="fas fa-times text-xs"></i>
                                </button>
                            </span>
                        </div>
                    </td>
                </tr>
            `;
            }
        } else {
            // No components yet - show add button
            const buttonText = isMultiple ? `Choose ${componentType.name}` : `Add ${componentType.name}`;

            return `
            <tr class="border-t border-border-light transition-colors hover:bg-surface-hover" id="component-row-${componentType.type}">
                <td class="px-6 py-4 align-middle">
                    <div class="flex items-center gap-4">
                        <div class="w-11 h-11 bg-surface-secondary rounded-lg flex items-center justify-center flex-shrink-0">
                            <i class="${componentType.icon} text-xl text-primary"></i>
                        </div>
                        <div class="flex flex-col gap-1">
                            <div class="font-semibold text-[15px] text-text-primary">${componentType.name}</div>
                            <div class="text-[13px] text-text-muted">${componentType.description}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 align-middle text-right">
                    <button class="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white border-none rounded-lg text-sm font-medium cursor-pointer transition-all hover:bg-primary-600 hover:-translate-y-px" onclick="window.serverBuilder.addComponent('${componentType.type}')">
                        <i class="fas fa-plus"></i>
                        ${buttonText}
                    </button>
                </td>
            </tr>
        `;
        }
    }
    renderSocketSlots() {
        const cpuComponents = this.selectedComponents.cpu;
        const motherboardData = this.motherboardDetails;

        if (!motherboardData || !motherboardData.socket) {
            // Fallback if no motherboard data
            return cpuComponents.map((cpu, index) => `
            <div class="socket-item occupied">
                <span class="slot-label">CPU Socket ${cpuComponents.length > 1 ? (index + 1) : ''}</span>
                <span class="slot-component">${cpu.serial_number}</span>
            </div>
        `).join('') || `
            <div class="socket-item empty">
                <span class="slot-label">CPU Socket</span>
                <span class="slot-empty">Empty</span>
            </div>
        `;
        }

        const socketCount = motherboardData.socket.count || 1;
        const socketType = motherboardData.socket.type || 'Unknown';
        let html = '';

        for (let i = 0; i < socketCount; i++) {
            const cpu = cpuComponents[i];
            html += `
            <div class="socket-item ${cpu ? 'occupied' : 'empty'}">
                <span class="slot-label">CPU Socket ${socketCount > 1 ? (i + 1) : ''} (${socketType})</span>
                <span class="${cpu ? 'slot-component' : 'slot-empty'}">
                    ${cpu ? cpu.serial_number : 'Empty'}
                </span>
            </div>
        `;
        }

        return html;
    }

    /**
     * Render chassis socket - Dynamic based on motherboard JSON
     */
    renderChassisSocket() {
        const motherboardData = this.motherboardDetails;

        if (!motherboardData || !motherboardData.chassisSocket) {
            // Fallback if no motherboard data
            return `
                <div class="socket-item">
                    <span class="slot-label">Chassis Socket</span>
                    <span class="slot-component">ATX</span>
                </div>
            `;
        }

        const chassisSocket = motherboardData.chassisSocket;

        return `
            <div class="socket-item">
                <span class="slot-label">Chassis Socket</span>
                <span class="slot-component">${chassisSocket}</span>
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

        if (!motherboardData || !motherboardData.memory) {
            // Fallback to 4 slots if no motherboard data
            let html = '';
            for (let i = 0; i < 4; i++) {
                const ram = ramComponents[i];
                html += `
                <div class="memory-slot ${ram ? 'occupied' : 'empty'}">
                    <span class="slot-label">RAM ${i + 1} (288-pin DIMM)</span>
                    <span class="${ram ? 'slot-component' : 'slot-empty'}">
                        ${ram ? ram.serial_number : 'Empty'}
                    </span>
                </div>
            `;
            }
            return html;
        }

        const memorySlots = motherboardData.memory.slots || 4;
        const memoryType = motherboardData.memory.type || 'DIMM';
        let html = '';

        for (let i = 0; i < memorySlots; i++) {
            const ram = ramComponents[i];
            html += `
            <div class="memory-slot ${ram ? 'occupied' : 'empty'}">
                <span class="slot-label">RAM ${i + 1} (${memoryType})</span>
                <span class="${ram ? 'slot-component' : 'slot-empty'}">
                    ${ram ? ram.serial_number : 'Empty'}
                </span>
            </div>
        `;
        }

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
     * Render expansion slots - Dynamic based on motherboard JSON with component types
     */
    renderExpansionSlots() {
        const pcieComponents = this.selectedComponents.pciecard || [];
        const hbaComponents = this.selectedComponents.hbacard || [];
        const nicComponents = this.selectedComponents.nic || [];
        const motherboardData = this.motherboardDetails;

        // Combine all expansion components with their types
        const allExpansionComponents = [
            ...pcieComponents.map(comp => ({
                ...comp,
                type: 'PCIe Card',
                typeIcon: 'fas fa-credit-card'
            })),
            ...hbaComponents.map(comp => ({
                ...comp,
                type: 'HBA Card',
                typeIcon: 'fas fa-hdd'
            })),
            ...nicComponents.map(comp => ({
                ...comp,
                type: 'Network Card',
                typeIcon: 'fas fa-network-wired'
            }))
        ];

        if (!motherboardData || !motherboardData.expansion_slots) {
            // Fallback to basic PCIe slots with component types
            let html = '';
            const totalSlots = Math.max(4, allExpansionComponents.length);

            for (let i = 0; i < totalSlots; i++) {
                const component = allExpansionComponents[i];
                html += `
                <div class="expansion-slot ${component ? 'occupied' : 'empty'}">
                    <span class="slot-label">PCIe Slot ${i + 1}</span>
                    <span class="${component ? 'slot-component' : 'slot-empty'}">
                        ${component ? `
                            <div class="component-with-type">
                                <i class="${component.typeIcon}"></i>
                                <span class="component-type">${component.type}:</span>
                                <span class="component-name">${component.serial_number}</span>
                            </div>
                        ` : 'Empty'}
                    </span>
                </div>
            `;
            }
            return html;
        }

        let html = '';
        let componentIndex = 0;

        // Handle regular PCIe slots
        if (motherboardData.expansion_slots.pcie_slots) {
            motherboardData.expansion_slots.pcie_slots.forEach((slotGroup, groupIndex) => {
                const slotCount = slotGroup.count || 1;
                const slotType = slotGroup.type || 'PCIe';

                for (let i = 0; i < slotCount; i++) {
                    const component = allExpansionComponents[componentIndex];
                    html += `
                    <div class="expansion-slot ${component ? 'occupied' : 'empty'}">
                        <span class="slot-label">${slotType} Slot ${componentIndex + 1}</span>
                        <span class="${component ? 'slot-component' : 'slot-empty'}">
                            ${component ? `
                                <div class="component-with-type">
                                    <i class="${component.typeIcon}"></i>
                                    <span class="component-type">${component.type}:</span>
                                    <span class="component-name">${component.serial_number}</span>
                                </div>
                            ` : 'Empty'}
                        </span>
                    </div>
                `;
                    componentIndex++;
                }
            });
        }

        return html || '<div class="expansion-slot empty"><span class="slot-label">No expansion slots</span></div>';
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
                html += `
                <div class="expansion-slot occupied">
                    <span class="slot-label">Storage ${index + 1}</span>
                    <span class="slot-component">
                        <div class="component-with-type">
                            <i class="fas fa-hdd"></i>
                            <span class="component-type">Storage:</span>
                            <span class="component-name">${storage.serial_number}</span>
                        </div>
                    </span>
                </div>
            `;
            });

            // Show available slots only if we have storage components
            const remainingSlots = Math.max(2, 4 - storageComponents.length);
            for (let i = 0; i < remainingSlots; i++) {
                html += `
                <div class="expansion-slot empty">
                    <span class="slot-label">Storage ${storageComponents.length + i + 1}</span>
                    <span class="slot-empty">Available</span>
                </div>
            `;
            }

            return html || '<div class="expansion-slot empty"><span class="slot-label">No storage info</span></div>';
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
                    html += `
                    <div class="expansion-slot ${storage ? 'occupied' : 'empty'}">
                        <span class="slot-label">M.2 Slot ${groupIndex * m2Count + i + 1} (${formFactors})</span>
                        <span class="${storage ? 'slot-component' : 'slot-empty'}">
                            ${storage ? `
                                <div class="component-with-type">
                                    <i class="fas fa-hdd"></i>
                                    <span class="component-type">NVMe:</span>
                                    <span class="component-name">${storage.serial_number}</span>
                                </div>
                            ` : 'Empty'}
                        </span>
                    </div>
                `;
                    if (storage) storageIndex++;
                }
            });
        }

        // REMOVED: U.2 slots, SATA ports, and SAS ports sections

        // If no M.2 slots found in motherboard data but we have storage components, show them
        if (html === '' && storageComponents.length > 0) {
            storageComponents.forEach((storage, index) => {
                html += `
                <div class="expansion-slot occupied">
                    <span class="slot-label">Storage ${index + 1}</span>
                    <span class="slot-component">
                        <div class="component-with-type">
                            <i class="fas fa-hdd"></i>
                            <span class="component-type">Storage:</span>
                            <span class="component-name">${storage.serial_number}</span>
                        </div>
                    </span>
                </div>
            `;
            });
        }

        return html || '<div class="expansion-slot empty"><span class="slot-label">No M.2 slots available</span></div>';
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

            const configUuid = this.currentConfig.config_uuid;

            // Special handling for SFP - show NIC selection modal first
            if (type === 'sfp') {
                await this.openNICSelectionModal();
                return;
            }

            // Always redirect to external configuration page (same as server index)
            window.location.href = `../../pages/server/configuration.html?config=${configUuid}&type=${type}&return=builder`;
        } catch (error) {
            console.error('Error adding component:', error);
            this.showAlert(error.message || 'Failed to open component selection', 'error');
        }
    }

    /**
     * Remove component from configuration
     */
    async removeComponent(type, uuid) {
        if (!confirm('Are you sure you want to remove this component?')) {
            return;
        }

        try {
            this.showLoading('Removing component...');

            const result = await serverAPI.removeComponentFromServer(
                this.currentConfig.config_uuid,
                type,
                uuid
            );

            if (result.success) {
                this.showAlert('Component removed successfully', 'success');
                await this.loadExistingConfig(this.currentConfig.config_uuid);
            } else {
                this.showAlert(result.message || 'Failed to remove component', 'danger');
            }
        } catch (error) {
            console.error('Error removing component:', error);
            this.showAlert('Failed to remove component', 'danger');
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
                <div class="issues-group">
                    <div class="issues-group-header">
                        <i class="${groupIcon}"></i>
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
            <div class="issue-item ${severityClass} ${hasComponent ? 'clickable' : ''}" onclick="window.serverBuilder.handleIssueClick('${issue.componentType || ''}', this)">
                <div class="issue-header">
                    <div class="issue-icon">
                        <i class="${iconClass}"></i>
                    </div>
                    <div class="issue-content">
                        <div class="issue-title">${issue.title || issue.message}</div>
                        <div class="issue-message">${issue.message}</div>
                    </div>
                    <div class="issue-actions">
                        ${issue.action ? `<button class="issue-action-btn" onclick="event.stopPropagation(); window.serverBuilder.addComponent('${issue.action.actionType}')">${issue.action.text}</button>` : ''}
                        ${hasComponent ? '<i class="fas fa-arrow-up scroll-icon"></i>' : ''}
                    </div>
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
            element.style.backgroundColor = 'var(--highlight-color, #e3f2fd)';
            element.style.transition = 'background-color 0.3s ease';
            setTimeout(() => {
                element.style.backgroundColor = '';
            }, 2000);
        }
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Toggle switch functionality
        const toggleSwitch = document.getElementById('advancedViewToggle');
        const toggleState = document.getElementById('toggleState');

        if (toggleSwitch && toggleState) {
            toggleSwitch.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                toggleState.textContent = isChecked ? 'On' : 'Off';
                this.toggleAdvancedView(isChecked);
            });
        }
        // Buy button
        const buyButton = document.querySelector('.buy-button');
        if (buyButton) {
            buyButton.addEventListener('click', () => {
                this.showAlert('This would redirect to purchase page in a real implementation', 'info');
            });
        }

        // Issue group expansion toggles
        const issueGroupHeaders = document.querySelectorAll('.issues-group-header');
        issueGroupHeaders.forEach(header => {
            header.addEventListener('click', function () {
                const group = this.closest('.issues-group');
                group.classList.toggle('expanded');
            });
        });

        // Individual issue expansion toggles
        const expandableIssues = document.querySelectorAll('.issue-item.expandable');
        expandableIssues.forEach(issue => {
            issue.addEventListener('click', function () {
                this.classList.toggle('expanded');
            });
        });

        // Initialize groups as expanded by default
        const issueGroups = document.querySelectorAll('.issues-group');
        issueGroups.forEach(group => {
            group.classList.add('expanded');
        });
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
        console.log('Advanced view enabled');

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
        console.log('Advanced view disabled');

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
            console.warn('Global loading manager not available');
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
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.serverBuilder = new ServerBuilder();
});

// Add CSS animations and styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }

    /* Issues Section Styles */
    .issues-section {
        background: var(--bg-primary, #ffffff);
        border: 1px solid var(--border-color, #e1e5e9);
        border-radius: 8px;
        margin: 1.5rem 0;
        overflow: hidden;
    }

    .issues-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem 1.5rem;
        background: var(--bg-secondary, #f8f9fa);
        border-bottom: 1px solid var(--border-color, #e1e5e9);
    }

    .issues-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--text-primary, #2c3e50);
        margin: 0;
    }

    .issues-title i {
        color: var(--warning-color, #f39c12);
    }

    .issues-summary {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
        color: var(--text-secondary, #6c757d);
    }

    .issues-count {
        background: var(--warning-color, #f39c12);
        color: white;
        padding: 0.125rem 0.5rem;
        border-radius: 12px;
        font-weight: 600;
        min-width: 24px;
        text-align: center;
    }

    .issues-progress {
        padding: 1rem 1.5rem;
        background: var(--bg-primary, #ffffff);
        border-bottom: 1px solid var(--border-color, #e1e5e9);
    }

    .progress-bar {
        width: 100%;
        height: 8px;
        background: var(--bg-tertiary, #e9ecef);
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 0.5rem;
    }

    .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--success-color, #27ae60), var(--warning-color, #f39c12));
        transition: width 0.3s ease;
    }

    .progress-text {
        font-size: 0.875rem;
        color: var(--text-secondary, #6c757d);
        text-align: center;
    }

    .issues-group {
        border-bottom: 1px solid var(--border-color, #e1e5e9);
    }

    .issues-group:last-child {
        border-bottom: none;
    }

    .issues-group-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem 1.5rem;
        background: var(--bg-secondary, #f8f9fa);
        cursor: pointer;
        transition: background-color 0.2s ease;
    }

    .issues-group-header:hover {
        background: var(--bg-hover, #e9ecef);
    }

    .issues-group-header i {
        color: var(--text-secondary, #6c757d);
        width: 16px;
    }

    .group-title {
        flex: 1;
        font-weight: 500;
        color: var(--text-primary, #2c3e50);
    }

    .group-count {
        background: var(--primary-color, #3498db);
        color: white;
        padding: 0.125rem 0.5rem;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 600;
        min-width: 20px;
        text-align: center;
    }

    .issues-group-content {
        padding: 0;
        max-height: 0;
        overflow: hidden;
        transition: max-height 0.3s ease;
    }

    .issues-group.expanded .issues-group-content {
        max-height: 1000px;
    }

    .issue-item {
        border-bottom: 1px solid var(--border-light, #f1f3f4);
        transition: background-color 0.2s ease;
    }

    .issue-item:last-child {
        border-bottom: none;
    }

    .issue-item:hover {
        background: var(--bg-hover, #f8f9fa);
    }

    .issue-item.expandable {
        cursor: pointer;
    }

    .issue-item.expanded {
        background: var(--bg-expanded, #f8f9fa);
    }

    .issue-header {
        display: flex;
        align-items: flex-start;
        gap: 1rem;
        padding: 1rem 1.5rem;
    }

    .issue-icon {
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        font-size: 0.875rem;
    }

    .severity-critical .issue-icon {
        background: var(--error-bg, #fee);
        color: var(--error-color, #e74c3c);
    }

    .severity-warning .issue-icon {
        background: var(--warning-bg, #fff3cd);
        color: var(--warning-color, #f39c12);
    }

    .severity-info .issue-icon {
        background: var(--info-bg, #d1ecf1);
        color: var(--info-color, #17a2b8);
    }

    .issue-content {
        flex: 1;
    }

    .issue-title {
        font-weight: 600;
        color: var(--text-primary, #2c3e50);
        margin-bottom: 0.25rem;
        font-size: 0.875rem;
    }

    .issue-message {
        color: var(--text-secondary, #6c757d);
        font-size: 0.8125rem;
        line-height: 1.4;
    }

    .issue-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-shrink: 0;
    }

    .issue-action-btn {
        background: var(--primary-color, #3498db);
        color: white;
        border: none;
        padding: 0.375rem 0.75rem;
        border-radius: 4px;
        font-size: 0.8125rem;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s ease;
    }

    .issue-action-btn:hover {
        background: var(--primary-hover, #2980b9);
    }

    .expand-icon {
        color: var(--text-muted, #adb5bd);
        transition: transform 0.2s ease;
    }

    .issue-item.expanded .expand-icon {
        transform: rotate(180deg);
    }

    .issue-details {
        padding: 0 1.5rem 1rem 5rem;
        max-height: 0;
        overflow: hidden;
        transition: max-height 0.3s ease, padding 0.3s ease;
    }

    .issue-item.expanded .issue-details {
        max-height: 500px;
        padding: 0 1.5rem 1rem 5rem;
    }

    .issue-detail-text {
        color: var(--text-secondary, #6c757d);
        font-size: 0.8125rem;
        line-height: 1.5;
        margin-bottom: 0.75rem;
    }

    .issue-action-large {
        text-align: left;
    }

    .issue-action-large button {
        background: var(--primary-color, #3498db);
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s ease;
    }

    .issue-action-large button:hover {
        background: var(--primary-hover, #2980b9);
    }

    /* Responsive adjustments */
    @media (max-width: 1024px) {
        .issues-header {
            padding: 1rem;
        }

        .issues-title {
            font-size: 1rem;
        }

        .issues-progress {
            padding: 0.75rem 1rem;
        }

        .issues-group-header {
            padding: 0.75rem 1rem;
        }

        .issue-header {
            padding: 0.75rem 1rem;
            gap: 0.75rem;
        }

        .issue-details {
            padding: 0 1rem 0.75rem 4rem;
        }

        .issue-item.expanded .issue-details {
            padding: 0 1rem 0.75rem 4rem;
        }
    }

    @media (max-width: 360px) {
        .issues-header {
            padding: 0.375rem 0.5rem;
        }

        .issues-title {
            font-size: 0.85rem;
        }

        .issues-progress {
            padding: 0.375rem 0.5rem;
        }

        .issues-group-header {
            padding: 0.375rem 0.5rem;
        }

        .issue-header {
            padding: 0.375rem 0.5rem;
        }

        .issue-details {
            padding: 0 0.5rem 0.375rem 0.5rem;
        }

        .issue-item.expanded .issue-details {
            padding: 0 0.5rem 0.375rem 0.5rem;
        }
    }
`;
document.head.appendChild(style);
