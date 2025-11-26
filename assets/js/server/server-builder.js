/**
 * Server Builder - Component Selection and Management
 * Modern minimalistic interface for building server configurations
 */

// ============================================
// Responsive Mobile Menu Handler
// ============================================

(function initResponsiveMenu() {
    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupMobileMenu);
    } else {
        setupMobileMenu();
    }

    function setupMobileMenu() {
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const mobileOverlay = document.getElementById('mobileOverlay');
        const sidebar = document.querySelector('.sidebar');

        if (!hamburgerBtn || !mobileOverlay || !sidebar) return;

        // Toggle sidebar on hamburger click
        hamburgerBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleSidebar();
        });

        // Close sidebar when clicking overlay
        mobileOverlay.addEventListener('click', function() {
            closeSidebar();
        });

        // Close sidebar when clicking close button (::before pseudo element)
        sidebar.addEventListener('click', function(e) {
            const rect = sidebar.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            
            // Check if click is in the close button area (top-right)
            if (clickX > rect.width - 60 && clickY < 60) {
                closeSidebar();
            }
        });

        // Close sidebar on ESC key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && sidebar.classList.contains('active')) {
                closeSidebar();
            }
        });

        function toggleSidebar() {
            const isActive = sidebar.classList.toggle('active');
            mobileOverlay.classList.toggle('active', isActive);
            hamburgerBtn.classList.toggle('active', isActive);
            
            // Prevent body scroll when sidebar is open
            document.body.style.overflow = isActive ? 'hidden' : '';
        }

        function closeSidebar() {
            sidebar.classList.remove('active');
            mobileOverlay.classList.remove('active');
            hamburgerBtn.classList.remove('active');
            document.body.style.overflow = '';
        }

        // Close sidebar when clicking menu items on mobile
        const menuItems = sidebar.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            item.addEventListener('click', function() {
                // Only auto-close on mobile
                if (window.innerWidth <= 680) {
                    closeSidebar();
                }
            });
        });

        // Handle window resize
        let resizeTimeout;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(function() {
                // Close sidebar if resizing to desktop view
                if (window.innerWidth > 680 && sidebar.classList.contains('active')) {
                    closeSidebar();
                }
            }, 250);
        });
    }
})();

class ServerBuilder {
    constructor() {
        this.currentConfig = null;
        this.selectedComponents = {
            cpu: [],
            motherboard: [],
            ram: [],
            storage: [],
            chassis: [],
            caddy: [],
            pciecard: [],
            nic: []
        };

        // Component type limits (based on typical server configurations)
        this.componentLimits = {
            cpu: 2,          // Dual CPU support
            motherboard: 1,  // Single motherboard
            ram: 24,         // Up to 24 RAM slots
            storage: 24,     // Up to 24 storage devices
            chassis: 1,      // Single chassis
            caddy: 24,       // Up to 24 caddies
            pciecard: 8,     // Up to 8 PCIe cards
            nic: 4           // Up to 4 NICs
        };

        this.validationState = {
            isValidated: false,
            isValid: false,
            message: ''
        };

        this.componentTypes = [
            {
                type: 'cpu',
                name: 'CPU',
                description: 'Processor',
                icon: 'fas fa-microchip',
                multiple: false,
                jsonPath: '../data/cpu-jsons/'
            },
            {
                type: 'motherboard',
                name: 'Motherboard',
                description: 'System Board',
                icon: 'fas fa-th-large',
                multiple: false,
                jsonPath: '../data/motherboard-jsons/'
            },
            {
                type: 'ram',
                name: 'RAM',
                description: 'Memory Modules',
                icon: 'fas fa-memory',
                multiple: true,
                jsonPath: '../data/Ram-jsons/'
            },
            {
                type: 'storage',
                name: 'Storage',
                description: 'Hard Drives, SSDs, NVMe',
                icon: 'fas fa-hdd',
                multiple: true,
                jsonPath: '../data/storage-jsons/'
            },
            {
                type: 'chassis',
                name: 'Chassis',
                description: 'Server Cabinet/Case',
                icon: 'fas fa-server',
                multiple: false,
                jsonPath: null
            },
            {
                type: 'caddy',
                name: 'Caddy',
                description: 'Drive Mounting Hardware',
                icon: 'fas fa-box',
                multiple: true,
                jsonPath: null
            },
            {
                type: 'pciecard',
                name: 'PCI Cards',
                description: 'Expansion Cards (GPU, RAID)',
                icon: 'fas fa-credit-card',
                multiple: true,
                jsonPath: null
            },
            {
                type: 'nic',
                name: 'Network Cards',
                description: 'Network Interface Cards',
                icon: 'fas fa-network-wired',
                multiple: true,
                jsonPath: null
            }
        ];

        this.init();
    }

    init() {

        // Check authentication
        if (!this.checkAuthentication()) {
            return;
        }

        // Check if PC part picker builder is available
        if (window.pcppBuilder) {
            // Let PC part picker builder handle everything
            return;
        }

        this.loadServerConfig();
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
    loadServerConfig() {
        const urlParams = new URLSearchParams(window.location.search);
        const configUuid = urlParams.get('config');


        if (configUuid) {
            this.loadExistingConfig(configUuid);
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
        try {
            this.showLoading('Loading server configuration...');

            const result = await serverAPI.getServerConfig(configUuid);

            if (result.success && result.data) {
                // Handle both direct data and nested configuration
                const configData = result.data.configuration || result.data;

                this.currentConfig = configData;
                this.parseExistingComponents(configData);
                this.renderBuilder();
            } else {
                console.error('Failed to load configuration:', result);
                this.showAlert(result.message || 'Failed to load configuration', 'danger');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
            }
        } catch (error) {
            console.error('Error loading configuration:', error);
            this.showAlert('Failed to load server configuration', 'danger');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2000);
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Parse existing components from configuration
     */
    parseExistingComponents(config) {

        // Reset components first
        this.selectedComponents = {
            cpu: [],
            motherboard: [],
            ram: [],
            storage: [],
            chassis: [],
            caddy: [],
            pciecard: [],
            nic: []
        };

        // Parse components from the new API structure
        if (config.components) {
            const components = config.components;

            // Parse each component type
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

        const totalSelected = this.getTotalComponentCount();
    }

    /**
     * Render the server builder interface
     */
    renderBuilder() {
        if (!this.currentConfig) {
            console.error('No configuration loaded');
            return;
        }


        // Use PC Part Picker style interface if available
        if (window.pcppBuilder) {
            window.pcppBuilder.currentConfig = this.currentConfig;
            window.pcppBuilder.parseExistingComponents(this.currentConfig);
            window.pcppBuilder.renderPCPartPickerInterface();
        } else {
            this.renderOriginalInterface();
        }
    }

    /**
     * Render original interface as fallback
     */
    renderOriginalInterface() {
        const selectedCount = this.getSelectedCount();
        const totalCount = this.componentTypes.length;
        const progressPercent = totalCount > 0 ? Math.min((selectedCount / totalCount) * 100, 100) : 0;

        const serverName = this.currentConfig.server_name || this.currentConfig.ServerName || 'Unnamed Server';
        document.title = `${serverName} - Server Builder`;

        const builderHtml = `
            <div class="server-builder-container">
                <!-- Header -->
                <div class="builder-header">
                    <h1 class="builder-title">
                        <i class="fas fa-server"></i>
                        ${serverName}
                    </h1>
                    <div class="builder-actions">
                        <button class="btn btn-secondary" onclick="window.location.href='index.html'">
                            <i class="fas fa-arrow-left"></i>
                            Back to List
                        </button>
                    </div>
                </div>

                <!-- Progress Section -->
                <div class="progress-section">
                    <div class="progress-header">
                        <span class="progress-text">Component Selection Progress</span>
                        <span class="progress-count">${selectedCount}/${totalCount} Components</span>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${progressPercent}%"></div>
                    </div>
                </div>

                <!-- Components Grid -->
                <div class="components-grid">
                    ${this.componentTypes.map(type => this.renderComponentCard(type)).join('')}
                </div>

                <!-- Validation Section -->
                <div class="validation-section">
                    <div class="validation-actions">
                        <button class="validation-button ${this.validationState.isValidated ? (this.validationState.isValid ? 'success' : 'error') : ''}"
                                id="validateButton"
                                ${selectedCount === 0 ? 'disabled' : ''}>
                            <i class="fas ${this.validationState.isValidated ? (this.validationState.isValid ? 'fa-check-circle' : 'fa-times-circle') : 'fa-clipboard-check'}"></i>
                            ${this.validationState.isValidated ? (this.validationState.isValid ? 'Validated Successfully' : 'Validation Failed') : 'Validate Configuration'}
                        </button>

                        <button class="deploy-button"
                                id="deployButton"
                                ${!this.validationState.isValid || !this.validationState.isValidated ? 'disabled' : ''}>
                            <i class="fas fa-rocket"></i>
                            Deploy Server
                        </button>
                    </div>

                    ${this.validationState.message ? `
                        <div class="validation-result ${this.validationState.isValid ? 'success' : 'error'}">
                            <div class="validation-result-title">
                                <i class="fas ${this.validationState.isValid ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
                                ${this.validationState.isValid ? 'Validation Successful' : 'Validation Failed'}
                            </div>
                            <div class="validation-result-message">${this.validationState.message}</div>
                            ${this.validationState.warningsHtml || ''}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        document.getElementById('app').innerHTML = builderHtml;
        this.attachEventListeners();
    }

    /**
     * Render component card
     */
    renderComponentCard(componentType) {
        const count = this.getComponentCount(componentType.type);
        const limit = this.componentLimits[componentType.type] || 1;
        const isAtLimit = count >= limit;
        const isSelected = count > 0;

        let statusClass = isSelected ? 'selected' : 'available';
        let statusIcon = isSelected ? 'fa-check-circle' : 'fa-plus-circle';
        let statusText = 'Select Component';

        if (isSelected) {
            statusText = `${count} of ${limit}`;
            if (isAtLimit) {
                statusClass = 'limit-reached';
                statusIcon = 'fa-ban';
            }
        }

        let detailsSection = '';

        if (isSelected) {
            const components = this.selectedComponents[componentType.type];
            if (Array.isArray(components) && components.length > 0) {
                const componentsList = components.map(comp => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: var(--bg-secondary); border-radius: 0.375rem; margin-bottom: 0.5rem;">
                        <div>
                            <div style="font-weight: 500; font-size: 0.875rem;">${comp.serial_number}</div>
                            ${comp.slot_position ? `<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">Slot: ${comp.slot_position}</div>` : ''}
                        </div>
                        <button class="btn-remove-component" onclick="event.stopPropagation(); window.serverBuilder.removeSpecificComponent('${componentType.type}', '${comp.uuid}')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `).join('');

                detailsSection = `
                    <div class="component-details-section" style="max-height: 200px; overflow-y: auto;">
                        ${componentsList}
                    </div>
                `;
            }
        }

        return `
            <div class="component-card ${statusClass} ${isAtLimit ? 'disabled' : ''}" data-component-type="${componentType.type}" ${isAtLimit ? 'style="cursor: not-allowed; opacity: 0.7;"' : ''}>
                <div class="component-icon-wrapper">
                    <i class="${componentType.icon}"></i>
                </div>
                <div class="component-info">
                    <div class="component-name">${componentType.name}</div>
                    <div class="component-description">${componentType.description}</div>
                    <div class="component-status ${statusClass}">
                        <i class="fas ${statusIcon}"></i>
                        ${statusText}
                    </div>
                </div>
                ${detailsSection}
            </div>
        `;
    }

    /**
     * Get selected component count (count of component types that have at least one component)
     */
    getSelectedCount() {
        let count = 0;
        this.componentTypes.forEach(type => {
            if (this.isComponentSelected(type.type)) {
                count++;
            }
        });
        return count;
    }

    /**
     * Get total component count (sum of all individual components)
     */
    getTotalComponentCount() {
        let total = 0;
        Object.keys(this.selectedComponents).forEach(type => {
            const components = this.selectedComponents[type];
            if (Array.isArray(components)) {
                total += components.length;
            }
        });
        return total;
    }

    /**
     * Check if component type is selected
     */
    isComponentSelected(type) {
        const component = this.selectedComponents[type];
        if (Array.isArray(component)) {
            return component.length > 0;
        }
        return component !== null && component !== undefined;
    }

    /**
     * Get component count for a type
     */
    getComponentCount(type) {
        const component = this.selectedComponents[type];
        if (Array.isArray(component)) {
            return component.length;
        }
        return 0;
    }

    /**
     * Get component display info
     */
    getComponentInfo(type) {
        const component = this.selectedComponents[type];

        if (Array.isArray(component) && component.length > 0) {
            if (component.length === 1) {
                return {
                    name: component[0].serial_number || component[0].uuid,
                    specs: null
                };
            } else {
                return {
                    name: `${component.length} items selected`,
                    specs: null
                };
            }
        }

        return { name: '', specs: null };
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Component card clicks
        document.querySelectorAll('.component-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const type = card.getAttribute('data-component-type');

                // Check if at limit
                const count = this.getComponentCount(type);
                const limit = this.componentLimits[type] || 1;

                if (count >= limit) {
                    this.showAlert(`Maximum ${limit} ${type} component(s) already added`, 'warning');
                    return;
                }

                this.handleComponentClick(type);
            });
        });

        // Validate button
        const validateBtn = document.getElementById('validateButton');
        if (validateBtn && !validateBtn.disabled) {
            validateBtn.addEventListener('click', () => this.validateConfiguration());
        }

        // Deploy button
        const deployBtn = document.getElementById('deployButton');
        if (deployBtn && !deployBtn.disabled) {
            deployBtn.addEventListener('click', () => this.deployConfiguration());
        }
    }

    /**
     * Handle component card click
     */
    async handleComponentClick(type) {

        try {
            // Check if we have a valid configuration
            if (!this.currentConfig || !this.currentConfig.config_uuid) {
                this.showAlert('No server configuration loaded', 'error');
                return;
            }

            // Redirect to configuration page with proper parameters
            const configUuid = this.currentConfig.config_uuid;
            window.location.href = `configuration.html?config=${configUuid}&type=${type}&return=builder`;

        } catch (error) {
            console.error('Error handling component click:', error);
            this.showAlert('Failed to open component selection', 'error');
        }
    }

    /**
     * Show component selection modal
     */
    async showComponentSelectionModal(type, typeInfo) {
        const modalHtml = `
            <div class="modal-overlay" id="componentModal">
                <div class="component-modal">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            <i class="${typeInfo.icon}"></i>
                            Select ${typeInfo.name}
                        </h3>
                        <button class="modal-close" id="closeModal">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body" id="componentListContainer">
                        <div style="text-align: center; padding: 2rem;">
                            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary-color);"></i>
                            <p style="margin-top: 1rem; color: var(--text-secondary);">Loading compatible components...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer.firstElementChild);

        const modal = document.getElementById('componentModal');
        setTimeout(() => modal.classList.add('active'), 10);

        document.getElementById('closeModal').addEventListener('click', () => {
            this.closeModal();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal();
            }
        });

        await this.loadCompatibleComponents(type, typeInfo);
    }

    /**
     * Load compatible components
     */
    async loadCompatibleComponents(type, typeInfo) {
        try {
            const result = await serverAPI.getCompatibleComponents(
                this.currentConfig.config_uuid,
                type,
                true
            );

            const container = document.getElementById('componentListContainer');

            if (result.success && result.data && result.data.data && result.data.data.compatible_components) {
                const compatibleComponents = result.data.data.compatible_components;

                if (compatibleComponents.length > 0) {
                    container.innerHTML = `
                        <div class="component-list">
                            ${compatibleComponents.map(component => this.renderComponentOption(component, type, typeInfo)).join('')}
                        </div>
                    `;

                    document.querySelectorAll('.component-option').forEach(option => {
                        option.addEventListener('click', async () => {
                            const uuid = option.getAttribute('data-uuid');
                            const notes = option.getAttribute('data-notes');
                            const componentType = option.getAttribute('data-type');
                            await this.showComponentDetailsModal(uuid, componentType, type, notes, typeInfo);
                        });
                    });
                } else {
                    container.innerHTML = `
                        <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                            <i class="fas fa-inbox" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                            <p>No compatible ${typeInfo.name.toLowerCase()} found</p>
                        </div>
                    `;
                }
            } else {
                container.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                        <i class="fas fa-inbox" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                        <p>No compatible ${typeInfo.name.toLowerCase()} found</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading compatible components:', error);
            const container = document.getElementById('componentListContainer');
            container.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--danger-color);">
                    <i class="fas fa-exclamation-circle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                    <p>Failed to load components</p>
                </div>
            `;
        }
    }

    /**
     * Render component option with JSON details
     */
    renderComponentOption(component, type, typeInfo) {
        const status = component.status === 1 ? 'available' : 'in-use';
        const statusText = component.status === 1 ? 'Available' : 'In Use';

        // Extract relevant specs from notes field (which contains model info)
        let specs = '';
        if (component.notes) {
            // Parse model name from notes
            const modelMatch = component.notes.match(/([A-Za-z0-9\s\-+]+)/);
            if (modelMatch) {
                specs = `<span class="spec-badge">${modelMatch[1].trim()}</span>`;
            }
        }

        if (component.location) {
            specs += `<span class="spec-badge"><i class="fas fa-map-marker-alt"></i> ${component.location}</span>`;
        }

        // Add compatibility info
        if (component.compatibility_score) {
            specs += `<span class="spec-badge"><i class="fas fa-check"></i> ${Math.round(component.compatibility_score * 100)}% Compatible</span>`;
        }

        return `
            <div class="component-option" data-uuid="${component.uuid}" data-notes="${component.notes || ''}" data-type="${type}">
                <div class="component-option-icon">
                    <i class="${typeInfo.icon}"></i>
                </div>
                <div class="component-option-details">
                    <div class="component-option-name">${component.serial_number || component.uuid}</div>
                    <div class="component-option-specs">
                        ${specs}
                        ${component.compatibility_reason ? `<div style="margin-top: 0.5rem; font-size: 0.8125rem; color: var(--success-color);"><i class="fas fa-info-circle"></i> ${component.compatibility_reason}</div>` : ''}
                    </div>
                </div>
                <div class="component-option-status ${status}">
                    <i class="fas ${status === 'available' ? 'fa-check' : 'fa-lock'}"></i>
                    ${statusText}
                </div>
            </div>
        `;
    }

    /**
     * Load component details from JSON files
     */
    async loadComponentDetailsFromJSON(uuid, type) {
        try {
            const jsonMapping = {
                'cpu': 'cpu-jsons/Cpu-details-level-3.json',
                'motherboard': 'motherboad-jsons/motherboard-level-3.json',
                'ram': 'Ram-jsons/ram_detail.json',
                'storage': 'storage-jsons/storage-level-3.json',
                'chassis': 'chasis-jsons/chasis-level-3.json',
                'pciecard': 'pci-jsons/pci-level-3.json',
                'nic': 'nic-jsons/nic-level-3.json',
                'caddy': 'caddy-jsons/caddy_details.json'
            };

            const jsonPath = jsonMapping[type];
            if (!jsonPath) {
                console.warn('No JSON mapping for type:', type);
                return null;
            }

            // Use relative path from current location (server-builder.js is in /server/)
            const response = await fetch(`../data/${jsonPath}`);
            if (!response.ok) {
                console.error('Failed to fetch JSON:', response.status);
                return null;
            }

            const jsonData = await response.json();

            // Search for component by UUID in nested structure
            // Handle both lowercase 'uuid' and uppercase 'UUID' field names
            for (const brand of jsonData) {
                if (brand.models) {
                    for (const model of brand.models) {
                        const modelUuid = model.uuid || model.UUID;

                        if (modelUuid === uuid) {
                            return {
                                brand: brand.brand,
                                series: brand.series,
                                generation: brand.generation,
                                family: brand.family,
                                ...model,
                                fullData: model
                            };
                        }

                        // Check nested models array
                        if (model.models && Array.isArray(model.models)) {
                            for (const nestedModel of model.models) {
                                const nestedUuid = nestedModel.uuid || nestedModel.UUID;

                                if (nestedUuid === uuid) {
                                    return {
                                        brand: brand.brand,
                                        series: brand.series,
                                        generation: brand.generation,
                                        family: brand.family || model.family,
                                        ...nestedModel,
                                        fullData: nestedModel
                                    };
                                }
                            }
                        }
                    }
                }
            }

            return null;
        } catch (error) {
            console.error('Error loading component details from JSON:', error);
            return null;
        }
    }

    /**
     * Format component details for display
     */
    formatComponentDetails(details, type) {
        if (!details) {
            return '<p style="color: var(--text-secondary);">No detailed specifications available.</p>';
        }

        let html = '';

        // General Info
        html += '<div class="detail-section">';
        html += '<h4 class="detail-section-title">General Information</h4>';
        if (details.brand) html += `<div class="detail-row"><span>Brand:</span><span>${details.brand}</span></div>`;
        if (details.series) html += `<div class="detail-row"><span>Series:</span><span>${details.series}</span></div>`;
        if (details.family) html += `<div class="detail-row"><span>Family:</span><span>${details.family}</span></div>`;
        if (details.model) html += `<div class="detail-row"><span>Model:</span><span>${details.model}</span></div>`;
        html += '</div>';

        // Type-specific details
        switch (type) {
            case 'cpu':
                html += this.formatCPUDetails(details);
                break;
            case 'motherboard':
                html += this.formatMotherboardDetails(details);
                break;
            case 'ram':
                html += this.formatRAMDetails(details);
                break;
            case 'storage':
                html += this.formatStorageDetails(details);
                break;
            case 'chassis':
                html += this.formatChassisDetails(details);
                break;
            case 'pciecard':
                html += this.formatPCIeDetails(details);
                break;
            case 'nic':
                html += this.formatNICDetails(details);
                break;
            case 'caddy':
                html += this.formatCaddyDetails(details);
                break;
        }

        return html;
    }

    formatCPUDetails(details) {
        let html = '<div class="detail-section"><h4 class="detail-section-title">Performance</h4>';
        if (details.cores) html += `<div class="detail-row"><span>Cores:</span><span>${details.cores}</span></div>`;
        if (details.threads) html += `<div class="detail-row"><span>Threads:</span><span>${details.threads}</span></div>`;
        if (details.base_frequency_GHz) html += `<div class="detail-row"><span>Base Frequency:</span><span>${details.base_frequency_GHz} GHz</span></div>`;
        if (details.max_frequency_GHz) html += `<div class="detail-row"><span>Max Frequency:</span><span>${details.max_frequency_GHz} GHz</span></div>`;
        if (details.tdp_W) html += `<div class="detail-row"><span>TDP:</span><span>${details.tdp_W}W</span></div>`;
        html += '</div>';

        html += '<div class="detail-section"><h4 class="detail-section-title">Memory & I/O</h4>';
        if (details.socket) html += `<div class="detail-row"><span>Socket:</span><span>${details.socket}</span></div>`;
        if (details.memory_channels) html += `<div class="detail-row"><span>Memory Channels:</span><span>${details.memory_channels}</span></div>`;
        if (details.memory_types) html += `<div class="detail-row"><span>Memory Types:</span><span>${details.memory_types.join(', ')}</span></div>`;
        if (details.pcie_lanes) html += `<div class="detail-row"><span>PCIe Lanes:</span><span>${details.pcie_lanes}</span></div>`;
        if (details.pcie_generation) html += `<div class="detail-row"><span>PCIe Gen:</span><span>${details.pcie_generation}</span></div>`;
        html += '</div>';

        if (details.l1_cache || details.l2_cache || details.l3_cache) {
            html += '<div class="detail-section"><h4 class="detail-section-title">Cache</h4>';
            if (details.l1_cache) html += `<div class="detail-row"><span>L1 Cache:</span><span>${details.l1_cache}</span></div>`;
            if (details.l2_cache) html += `<div class="detail-row"><span>L2 Cache:</span><span>${details.l2_cache}</span></div>`;
            if (details.l3_cache) html += `<div class="detail-row"><span>L3 Cache:</span><span>${details.l3_cache}</span></div>`;
            html += '</div>';
        }

        return html;
    }

    formatMotherboardDetails(details) {
        let html = '<div class="detail-section"><h4 class="detail-section-title">Specifications</h4>';
        if (details.socket) html += `<div class="detail-row"><span>Socket:</span><span>${details.socket}</span></div>`;
        if (details.chipset) html += `<div class="detail-row"><span>Chipset:</span><span>${details.chipset}</span></div>`;
        if (details.form_factor) html += `<div class="detail-row"><span>Form Factor:</span><span>${details.form_factor}</span></div>`;
        if (details.memory_slots) html += `<div class="detail-row"><span>Memory Slots:</span><span>${details.memory_slots}</span></div>`;
        if (details.max_memory_GB) html += `<div class="detail-row"><span>Max Memory:</span><span>${details.max_memory_GB}GB</span></div>`;
        html += '</div>';

        if (details.expansion_slots) {
            html += '<div class="detail-section"><h4 class="detail-section-title">Expansion</h4>';
            html += `<div class="detail-row"><span>PCIe Slots:</span><span>${details.expansion_slots}</span></div>`;
            html += '</div>';
        }

        return html;
    }

    formatRAMDetails(details) {
        let html = '<div class="detail-section"><h4 class="detail-section-title">Memory Specifications</h4>';
        if (details.memory_type) html += `<div class="detail-row"><span>Type:</span><span>${details.memory_type}</span></div>`;
        if (details.module_type) html += `<div class="detail-row"><span>Module:</span><span>${details.module_type}</span></div>`;
        if (details.capacity_GB) html += `<div class="detail-row"><span>Capacity:</span><span>${details.capacity_GB}GB</span></div>`;
        if (details.frequency_MHz) html += `<div class="detail-row"><span>Frequency:</span><span>${details.frequency_MHz} MHz</span></div>`;
        if (details.speed_MTs) html += `<div class="detail-row"><span>Speed:</span><span>${details.speed_MTs} MT/s</span></div>`;
        if (details.voltage_V) html += `<div class="detail-row"><span>Voltage:</span><span>${details.voltage_V}V</span></div>`;
        if (details.features?.ecc_support) html += `<div class="detail-row"><span>ECC:</span><span>Yes</span></div>`;
        html += '</div>';
        return html;
    }

    formatStorageDetails(details) {
        let html = '<div class="detail-section"><h4 class="detail-section-title">Storage Specifications</h4>';
        if (details.storage_type) html += `<div class="detail-row"><span>Type:</span><span>${details.storage_type}</span></div>`;
        if (details.subtype) html += `<div class="detail-row"><span>Subtype:</span><span>${details.subtype}</span></div>`;
        if (details.capacity_GB) html += `<div class="detail-row"><span>Capacity:</span><span>${details.capacity_GB}GB</span></div>`;
        if (details.interface) html += `<div class="detail-row"><span>Interface:</span><span>${details.interface}</span></div>`;
        if (details.form_factor) html += `<div class="detail-row"><span>Form Factor:</span><span>${details.form_factor}</span></div>`;

        if (details.specifications) {
            if (details.specifications.rpm) html += `<div class="detail-row"><span>RPM:</span><span>${details.specifications.rpm}</span></div>`;
            if (details.specifications.cache_MB) html += `<div class="detail-row"><span>Cache:</span><span>${details.specifications.cache_MB}MB</span></div>`;
            if (details.specifications.transfer_speed_MBps) html += `<div class="detail-row"><span>Transfer Speed:</span><span>${details.specifications.transfer_speed_MBps} MB/s</span></div>`;
        }

        if (details.power_consumption_W) {
            html += `<div class="detail-row"><span>Power (Idle):</span><span>${details.power_consumption_W.idle}W</span></div>`;
            html += `<div class="detail-row"><span>Power (Active):</span><span>${details.power_consumption_W.active}W</span></div>`;
        }
        html += '</div>';
        return html;
    }

    formatChassisDetails(details) {
        let html = '<div class="detail-section"><h4 class="detail-section-title">Chassis Specifications</h4>';
        if (details.form_factor) html += `<div class="detail-row"><span>Form Factor:</span><span>${details.form_factor}</span></div>`;
        if (details.rack_units) html += `<div class="detail-row"><span>Rack Units:</span><span>${details.rack_units}U</span></div>`;
        if (details.drive_bays) html += `<div class="detail-row"><span>Drive Bays:</span><span>${details.drive_bays}</span></div>`;
        html += '</div>';
        return html;
    }

    formatPCIeDetails(details) {
        let html = '<div class="detail-section"><h4 class="detail-section-title">PCIe Card Specifications</h4>';
        if (details.card_type) html += `<div class="detail-row"><span>Type:</span><span>${details.card_type}</span></div>`;
        if (details.interface) html += `<div class="detail-row"><span>Interface:</span><span>${details.interface}</span></div>`;
        if (details.slots_required) html += `<div class="detail-row"><span>Slots Required:</span><span>${details.slots_required}</span></div>`;
        html += '</div>';
        return html;
    }

    formatNICDetails(details) {
        let html = '<div class="detail-section"><h4 class="detail-section-title">Network Card Specifications</h4>';
        if (details.interface_type) html += `<div class="detail-row"><span>Interface:</span><span>${details.interface_type}</span></div>`;
        if (details.ports) html += `<div class="detail-row"><span>Ports:</span><span>${details.ports}</span></div>`;
        if (details.speed_Gbps) html += `<div class="detail-row"><span>Speed:</span><span>${details.speed_Gbps} Gbps</span></div>`;
        html += '</div>';
        return html;
    }

    formatCaddyDetails(details) {
        let html = '<div class="detail-section"><h4 class="detail-section-title">Caddy Specifications</h4>';
        if (details.compatible_drives) html += `<div class="detail-row"><span>Compatible:</span><span>${details.compatible_drives}</span></div>`;
        if (details.form_factor) html += `<div class="detail-row"><span>Form Factor:</span><span>${details.form_factor}</span></div>`;
        html += '</div>';
        return html;
    }

    

    /**
     * Show component details modal before adding
     */
    async showComponentDetailsModal(uuid, componentType, type, notes, typeInfo) {
        // Close current modal
        this.closeModal();

        // Create details modal
        const detailsModalHtml = `
            <div class="modal-overlay" id="detailsModal">
                <div class="component-details-modal">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            <i class="${typeInfo.icon}"></i>
                            Component Details
                        </h3>
                        <button class="modal-close" id="closeDetailsModal">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body" id="detailsContainer">
                        <div style="text-align: center; padding: 2rem;">
                            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary-color);"></i>
                            <p style="margin-top: 1rem; color: var(--text-secondary);">Loading component details...</p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="cancelDetailsBtn">
                            <i class="fas fa-times"></i>
                            Cancel
                        </button>
                        <button class="btn btn-primary" id="confirmAddBtn">
                            <i class="fas fa-plus"></i>
                            Add to Configuration
                        </button>
                    </div>
                </div>
            </div>
        `;

        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = detailsModalHtml;
        document.body.appendChild(modalContainer.firstElementChild);

        const modal = document.getElementById('detailsModal');
        setTimeout(() => modal.classList.add('active'), 10);

        // Close handlers
        document.getElementById('closeDetailsModal').addEventListener('click', () => {
            this.closeDetailsModal();
            this.handleComponentClick(type); // Reopen component selection
        });

        document.getElementById('cancelDetailsBtn').addEventListener('click', () => {
            this.closeDetailsModal();
            this.handleComponentClick(type); // Reopen component selection
        });

        // Load and display details
        const details = await this.loadComponentDetailsFromJSON(uuid, componentType);
        const detailsContainer = document.getElementById('detailsContainer');

        if (details) {
            detailsContainer.innerHTML = `
                <div class="component-full-details">
                    <div class="component-header-info">
                        <div class="component-serial-info">
                            <i class="${typeInfo.icon}" style="font-size: 2rem; color: var(--primary-color);"></i>
                            <div style="margin-left: 1rem;">
                                <h4 style="margin: 0; font-size: 1.25rem;">${details.model || details.memory_type || details.storage_type || 'Component'}</h4>
                                <p style="margin: 0.25rem 0 0 0; color: var(--text-secondary); font-size: 0.875rem;">UUID: ${uuid}</p>
                            </div>
                        </div>
                    </div>
                    ${this.formatComponentDetails(details, componentType)}
                </div>
            `;
        } else {
            detailsContainer.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                    <i class="fas fa-info-circle" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                    <p>Component details not found in JSON database.</p>
                    <p style="margin-top: 0.5rem; font-size: 0.875rem;">UUID: ${uuid}</p>
                    <p style="margin-top: 0.5rem; font-size: 0.875rem;">Notes: ${notes || 'None'}</p>
                </div>
            `;
        }

        // Confirm add handler
        document.getElementById('confirmAddBtn').addEventListener('click', async () => {
            this.closeDetailsModal();
            await this.addComponentToConfig(type, uuid, notes, typeInfo);
        });
    }

    /**
     * Close details modal
     */
    closeDetailsModal() {
        const modal = document.getElementById('detailsModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.remove();
            }, 300);
        }
    }

    /**
     * Add component to configuration
     */
    async addComponentToConfig(type, uuid, notes, typeInfo) {
        try {
            this.showLoading('Adding component to configuration...');

            const result = await serverAPI.addComponentToServer(
                this.currentConfig.config_uuid,
                type,
                uuid,
                1,
                '',
                false
            );

            if (result.success) {
                this.showAlert(`${typeInfo.name} added successfully`, 'success');

                // Reset validation state when component is added
                this.validationState = {
                    isValidated: false,
                    isValid: false,
                    message: ''
                };

                await this.loadExistingConfig(this.currentConfig.config_uuid);
                this.closeModal();
            } else {
                this.showAlert(result.message || 'Failed to add component', 'danger');
            }
        } catch (error) {
            console.error('Error adding component:', error);
            this.showAlert('Failed to add component', 'danger');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Remove specific component from configuration
     */
    async removeSpecificComponent(type, uuid) {
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

                // Reset validation state
                this.validationState = {
                    isValidated: false,
                    isValid: false,
                    message: ''
                };

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
     * Remove component from configuration (legacy method for backward compatibility)
     */
    async removeComponent(type) {
        const component = this.selectedComponents[type];
        if (!component || (Array.isArray(component) && component.length === 0)) return;

        // Get the UUID to remove
        let uuid;
        if (Array.isArray(component) && component.length > 0) {
            uuid = component[0].uuid || component[0].UUID;
        } else {
            uuid = component.uuid || component.UUID;
        }

        await this.removeSpecificComponent(type, uuid);
    }

    /**
     * Close modal
     */
    closeModal() {
        const modal = document.getElementById('componentModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.remove();
            }, 300);
        }
    }

    /**
     * Validate server configuration
     */
    async validateConfiguration() {
        try {
            this.showLoading('Validating server configuration...', 'Checking component compatibility...');

            const result = await serverAPI.validateServerConfig(this.currentConfig.config_uuid);

            if (result.success) {
                // Extract performance warnings if present
                const performanceWarnings = result.data?.performance_warnings || [];

                let warningsHtml = '';
                if (performanceWarnings.length > 0) {
                    warningsHtml = '<div class="performance-warnings"><h5><i class="fas fa-exclamation-triangle"></i> Performance Warnings</h5><ul>';
                    performanceWarnings.forEach(warning => {
                        warningsHtml += `<li>${warning}</li>`;
                    });
                    warningsHtml += '</ul></div>';
                }

                this.validationState = {
                    isValidated: true,
                    isValid: true,
                    message: result.message || 'All components are compatible. Server configuration is ready for deployment.',
                    warnings: performanceWarnings,
                    warningsHtml: warningsHtml
                };
                this.showAlert('Configuration validated successfully!', 'success');
            } else {
                this.validationState = {
                    isValidated: true,
                    isValid: false,
                    message: result.message || 'Validation failed. Please check component compatibility.',
                    warnings: [],
                    warningsHtml: ''
                };
                this.showAlert(result.message || 'Validation failed', 'danger');
            }

            this.renderBuilder();
        } catch (error) {
            console.error('Error validating configuration:', error);
            this.validationState = {
                isValidated: true,
                isValid: false,
                message: 'An error occurred during validation. Please try again.',
                warnings: [],
                warningsHtml: ''
            };
            this.showAlert('Failed to validate configuration', 'danger');
            this.renderBuilder();
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Deploy server configuration
     */
    async deployConfiguration() {
        if (!this.validationState.isValid || !this.validationState.isValidated) {
            this.showAlert('Please validate the configuration before deploying', 'warning');
            return;
        }

        const notes = prompt('Enter deployment notes (optional):');

        try {
            this.showLoading('Deploying server configuration...');

            const result = await serverAPI.finalizeServerConfig(
                this.currentConfig.config_uuid,
                notes || ''
            );

            if (result.success) {
                this.showAlert('Server deployed successfully!', 'success');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
            } else {
                this.showAlert(result.message || 'Deployment failed', 'danger');
            }
        } catch (error) {
            console.error('Error deploying configuration:', error);
            this.showAlert('Failed to deploy configuration', 'danger');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Show loading overlay
     */
    showLoading(message = 'Loading...', subtext = '') {
        const loadingHtml = `
            <div class="loading-overlay active">
                <div class="loading-content">
                    <div class="server-loader">
                        <div class="server-layer"></div>
                        <div class="server-layer"></div>
                        <div class="server-layer"></div>
                        <div class="server-layer"></div>
                    </div>
                    <div class="loading-text">${message}</div>
                    ${subtext ? `<div class="loading-subtext">${subtext}</div>` : ''}
                </div>
            </div>
        `;

        const existingLoader = document.querySelector('.loading-overlay');
        if (existingLoader) {
            existingLoader.remove();
        }

        document.body.insertAdjacentHTML('beforeend', loadingHtml);
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        const loader = document.querySelector('.loading-overlay');
        if (loader) {
            loader.classList.remove('active');
            setTimeout(() => loader.remove(), 300);
        }
    }

    /**
     * Show toast notification - Uses standardized toast system
     */
    showAlert(message, type = 'info') {
        // Map type names for consistency
        const typeMap = {
            'danger': 'error',
            'info': 'info',
            'success': 'success',
            'warning': 'warning'
        };

        const mappedType = typeMap[type] || 'info';

        // Use standardized toast notification system
        if (typeof toastNotification !== 'undefined') {
            toastNotification.show(message, mappedType);
        } else {
            // Fallback to console if toast not loaded
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    
    // Only initialize if PC part picker builder is not available
    if (!window.pcppBuilder) {
        window.serverBuilder = new ServerBuilder();
    } else {
    }
});

// Add CSS animations
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
`;
document.head.appendChild(style);
