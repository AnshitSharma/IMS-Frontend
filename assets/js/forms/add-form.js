/**
 * Add Component Form JavaScript - Updated Version with Custom Specifications
 * forms/js/add-form.js
 */

class AddComponentForm {
    constructor() {
        this.currentComponentType = null;
        this.jsonData = {};
        this.selectedComponent = null;
        this.componentSpecification = {};
        
        this.init();
    }

    async init(preselectedType = null) {

        // Get component type from parameter, URL, or dashboard context
        let componentType = preselectedType;

        if (!componentType) {
            const urlParams = new URLSearchParams(window.location.search);
            componentType = urlParams.get('type');
        }

        if (!componentType && window.dashboard && window.dashboard.currentComponent) {
            componentType = window.dashboard.currentComponent;
        }

        if (componentType && componentType !== 'dashboard') {
            document.getElementById('componentType').value = componentType;

            // Hide the component type section when pre-selected
            const componentTypeSection = document.querySelector('.form-section');
            if (componentTypeSection) {
                componentTypeSection.style.display = 'none';
            }

            // Make component type select readonly to prevent changes
            document.getElementById('componentType').setAttribute('readonly', true);
            document.getElementById('componentType').style.pointerEvents = 'none';

            await this.handleComponentTypeChange(componentType);
        }

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Component type selection
        document.getElementById('componentType').addEventListener('change', (e) => {
            this.handleComponentTypeChange(e.target.value);
        });

        // Dynamic dropdown event listeners (supports 4 levels)
        for (let i = 1; i <= 4; i++) {
            const dropdown = document.getElementById(`dropdown${i}Select`);
            if (dropdown) {
                dropdown.addEventListener('change', (e) => {
                    this.handleDropdownChange(i, e.target.value);
                });
            }
        }

        // Custom specification handlers
        this.setupCustomSpecificationListeners();

        // Form submission
        document.getElementById('addComponentForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleFormSubmit();
        });

        // Validation on input
        this.setupValidation();
    }

    setupCustomSpecificationListeners() {
        // No longer needed - all components use JSON-based cascading dropdowns
    }

    async handleComponentTypeChange(componentType) {
        if (!componentType) {
            this.hideAllSections();
            return;
        }

        this.currentComponentType = componentType;
        this.componentSpecification = {};
        document.getElementById('formTitle').textContent = `Add ${componentType.toUpperCase()} Component`;

        try {
            // Show loading
            this.showLoading(true, 'Loading component specifications...');

            // All components now use JSON-based cascading dropdowns
            await this.loadJSONData(componentType);

            // Show relevant sections
            this.showFormSections();

            // Initialize dropdowns if JSON data is available
            if (this.jsonData && Array.isArray(this.jsonData) && this.jsonData.length > 0) {
                // Special handling for Caddy (flat structure, no brand/series)
                if (componentType === 'caddy') {
                    this.initializeCaddyDropdown();
                } else {
                    this.initializeDropdowns();
                }
            } else {
                this.showBasicFormOnly();
            }

        } catch (error) {
            console.error('Error loading component type:', error);
            this.showAlert('Failed to load component specifications', 'error');
        } finally {
            this.showLoading(false);
        }
    }


    hideJSONDropdowns() {
        const cascadingDropdowns = document.getElementById('cascadingDropdowns');
        const componentDetails = document.getElementById('componentDetails');
        
        if (cascadingDropdowns) {
            cascadingDropdowns.style.display = 'none';
            
            // Remove required attribute from hidden dropdowns to prevent validation errors
            const brandSelect = document.getElementById('brandSelect');
            const seriesSelect = document.getElementById('seriesSelect');
            const modelSelect = document.getElementById('modelSelect');
            
            if (brandSelect) {
                brandSelect.removeAttribute('required');
                brandSelect.value = '';
            }
            if (seriesSelect) {
                seriesSelect.removeAttribute('required');
                seriesSelect.value = '';
            }
            if (modelSelect) {
                modelSelect.removeAttribute('required');
                modelSelect.value = '';
            }
        }
        if (componentDetails) {
            componentDetails.style.display = 'none';
        }
    }

    showJSONDropdowns() {
        const cascadingDropdowns = document.getElementById('cascadingDropdowns');
        
        if (cascadingDropdowns) {
            cascadingDropdowns.style.display = 'block';
            
            // Re-add required attribute to visible dropdowns
            const brandSelect = document.getElementById('brandSelect');
            const seriesSelect = document.getElementById('seriesSelect');
            const modelSelect = document.getElementById('modelSelect');
            
            if (brandSelect) brandSelect.setAttribute('required', 'required');
            if (seriesSelect) seriesSelect.setAttribute('required', 'required');
            if (modelSelect) modelSelect.setAttribute('required', 'required');
        }
    }


    async loadJSONData(componentType) {
        try {
            // Load JSON data directly from All-JSON folder
            const jsonPaths = {
                'cpu': '../../data/cpu-jsons/Cpu-details-level-3.json',
                'motherboard': '../../data/motherboad-jsons/motherboard-level-3.json',
                'ram': '../../data/Ram-jsons/ram_detail.json',
                'storage': '../../data/storage-jsons/storage-level-3.json',
                'nic': '../../data/nic-jsons/nic-level-3.json',
                'hbacard': '../../data/hbacard-jsons/hbacard-level-3.json',
                'pciecard': '../../data/pci-jsons/pci-level-3.json',
                'chassis': '../../data/chasis-jsons/chasis-level-3.json',
                'caddy': '../../data/caddy-jsons/caddy_details.json'
            };

            if (jsonPaths[componentType]) {
                const response = await fetch(jsonPaths[componentType]);
                if (response.ok) {
                    this.jsonData = await response.json();

                    // Handle special JSON structures
                    if (componentType === 'chassis') {
                        // Chassis JSON has different structure: chassis_specifications.manufacturers[]
                        this.jsonData = this.jsonData.chassis_specifications?.manufacturers || [];
                    } else if (componentType === 'caddy') {
                        // Caddy JSON has flat structure: { caddies: [] }
                        this.jsonData = this.jsonData.caddies || [];
                    }
                } else {
                    console.warn(`Failed to load JSON data for ${componentType}`);
                    this.jsonData = [];
                }
            } else {
                this.jsonData = [];
            }
        } catch (error) {
            console.error('Error loading JSON data:', error);
            this.jsonData = [];
        }
    }

    initializeDropdowns() {
        // Route to appropriate dropdown population based on component type
        switch (this.currentComponentType) {
            case 'ram':
                this.populateRAMDropdown1(); // Memory Type
                break;
            case 'storage':
                this.populateStorageDropdown1(); // Storage Type
                break;
            case 'caddy':
                this.populateCaddyDropdown1(); // Size
                break;
            case 'chassis':
                this.populateChassisDropdown1(); // Manufacturer
                break;
            case 'pciecard':
                this.populatePCICardDropdown1(); // Component Subtype
                break;
            default:
                // For CPU, Motherboard, NIC, HBA Card - use standard Brand → Series → Model
                this.populateStandardDropdown1(); // Brand
                break;
        }

        this.resetDependentDropdowns();
    }

    // Helper: Configure dropdown labels
    configureDropdownLabels(labels) {
        // labels = {d1: "Label 1", d2: "Label 2", d3: "Label 3", d4: "Label 4" (optional)}
        for (let i = 1; i <= 4; i++) {
            const label = document.getElementById(`dropdown${i}Label`);
            const group = document.getElementById(`dropdown${i}Group`);

            if (labels[`d${i}`]) {
                if (label) label.textContent = labels[`d${i}`];
                if (group) group.style.display = 'block';
            } else {
                if (group) group.style.display = 'none';
            }
        }

        // Show/hide 4th dropdown row
        const row4 = document.getElementById('dropdown4Row');
        if (row4) {
            row4.style.display = labels.d4 ? 'block' : 'none';
        }
    }

    // ==================== RAM DROPDOWNS ====================
    // Flow: Memory Type → Capacity → Form Factor → Model

    populateRAMDropdown1() {
        this.configureDropdownLabels({
            d1: 'Memory Type',
            d2: 'Capacity (GB)',
            d3: 'Form Factor',
            d4: 'Specific Model'
        });

        const dropdown1 = document.getElementById('dropdown1Select');
        if (!dropdown1 || !Array.isArray(this.jsonData)) return;

        dropdown1.innerHTML = '<option value="">Select Memory Type</option>';

        // Extract unique memory types from all models
        const memoryTypes = new Set();
        this.jsonData.forEach(item => {
            if (item.models && Array.isArray(item.models)) {
                item.models.forEach(model => {
                    if (model.memory_type) memoryTypes.add(model.memory_type);
                });
            }
        });

        [...memoryTypes].sort().forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            dropdown1.appendChild(option);
        });

        dropdown1.disabled = false;
    }

    populateRAMDropdown2(memoryType) {
        const dropdown2 = document.getElementById('dropdown2Select');
        if (!dropdown2) return;

        dropdown2.innerHTML = '<option value="">Select Capacity</option>';

        // Get unique capacities for selected memory type
        const capacities = new Set();
        this.jsonData.forEach(item => {
            if (item.models && Array.isArray(item.models)) {
                item.models.forEach(model => {
                    if (model.memory_type === memoryType && model.capacity_GB) {
                        capacities.add(model.capacity_GB);
                    }
                });
            }
        });

        [...capacities].sort((a, b) => a - b).forEach(capacity => {
            const option = document.createElement('option');
            option.value = capacity;
            option.textContent = `${capacity}GB`;
            dropdown2.appendChild(option);
        });

        dropdown2.disabled = false;
    }

    populateRAMDropdown3(memoryType, capacity) {
        const dropdown3 = document.getElementById('dropdown3Select');
        if (!dropdown3) return;

        dropdown3.innerHTML = '<option value="">Select Form Factor</option>';

        // Get unique form factors for selected memory type and capacity
        const formFactors = new Set();
        this.jsonData.forEach(item => {
            if (item.models && Array.isArray(item.models)) {
                item.models.forEach(model => {
                    if (model.memory_type === memoryType &&
                        model.capacity_GB == capacity &&
                        model.form_factor) {
                        formFactors.add(model.form_factor);
                    }
                });
            }
        });

        [...formFactors].sort().forEach(formFactor => {
            const option = document.createElement('option');
            option.value = formFactor;
            option.textContent = formFactor;
            dropdown3.appendChild(option);
        });

        dropdown3.disabled = false;
    }

    populateRAMDropdown4(memoryType, capacity, formFactor) {
        const dropdown4 = document.getElementById('dropdown4Select');
        if (!dropdown4) return;

        dropdown4.innerHTML = '<option value="">Select Model</option>';

        // Get models matching all criteria
        this.jsonData.forEach(item => {
            if (item.models && Array.isArray(item.models)) {
                item.models.forEach(model => {
                    if (model.memory_type === memoryType &&
                        model.capacity_GB == capacity &&
                        model.form_factor === formFactor) {

                        const option = document.createElement('option');
                        option.value = model.uuid;

                        // Build descriptive model name
                        const modelName = `${item.brand} ${item.series} ${model.capacity_GB}GB ${model.memory_type}-${model.frequency_MHz}MHz ${model.module_type}`;
                        option.textContent = modelName;

                        // Store full model data
                        option.dataset.modelData = JSON.stringify({
                            ...model,
                            _brand: item.brand,
                            _series: item.series
                        });

                        dropdown4.appendChild(option);
                    }
                });
            }
        });

        dropdown4.disabled = false;
    }

    // ==================== STORAGE DROPDOWNS ====================
    // Flow: Storage Type → Form Factor → Capacity → Model

    populateStorageDropdown1() {
        this.configureDropdownLabels({
            d1: 'Storage Type',
            d2: 'Form Factor',
            d3: 'Capacity (GB)',
            d4: 'Specific Model'
        });

        const dropdown1 = document.getElementById('dropdown1Select');
        if (!dropdown1 || !Array.isArray(this.jsonData)) return;

        dropdown1.innerHTML = '<option value="">Select Storage Type</option>';

        // Extract unique storage types
        const storageTypes = new Set();
        this.jsonData.forEach(item => {
            if (item.models && Array.isArray(item.models)) {
                item.models.forEach(model => {
                    if (model.storage_type) storageTypes.add(model.storage_type);
                });
            }
        });

        [...storageTypes].sort().forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            dropdown1.appendChild(option);
        });

        dropdown1.disabled = false;
    }

    populateStorageDropdown2(storageType) {
        const dropdown2 = document.getElementById('dropdown2Select');
        if (!dropdown2) return;

        dropdown2.innerHTML = '<option value="">Select Form Factor</option>';

        const formFactors = new Set();
        this.jsonData.forEach(item => {
            if (item.models && Array.isArray(item.models)) {
                item.models.forEach(model => {
                    if (model.storage_type === storageType && model.form_factor) {
                        formFactors.add(model.form_factor);
                    }
                });
            }
        });

        [...formFactors].sort().forEach(formFactor => {
            const option = document.createElement('option');
            option.value = formFactor;
            option.textContent = formFactor;
            dropdown2.appendChild(option);
        });

        dropdown2.disabled = false;
    }

    populateStorageDropdown3(storageType, formFactor) {
        const dropdown3 = document.getElementById('dropdown3Select');
        if (!dropdown3) return;

        dropdown3.innerHTML = '<option value="">Select Capacity</option>';

        const capacities = new Set();
        this.jsonData.forEach(item => {
            if (item.models && Array.isArray(item.models)) {
                item.models.forEach(model => {
                    if (model.storage_type === storageType &&
                        model.form_factor === formFactor &&
                        model.capacity_GB) {
                        capacities.add(model.capacity_GB);
                    }
                });
            }
        });

        [...capacities].sort((a, b) => a - b).forEach(capacity => {
            const option = document.createElement('option');
            option.value = capacity;
            option.textContent = `${capacity}GB`;
            dropdown3.appendChild(option);
        });

        dropdown3.disabled = false;
    }

    populateStorageDropdown4(storageType, formFactor, capacity) {
        const dropdown4 = document.getElementById('dropdown4Select');
        if (!dropdown4) return;

        dropdown4.innerHTML = '<option value="">Select Model</option>';

        this.jsonData.forEach(item => {
            if (item.models && Array.isArray(item.models)) {
                item.models.forEach(model => {
                    if (model.storage_type === storageType &&
                        model.form_factor === formFactor &&
                        model.capacity_GB == capacity) {

                        const option = document.createElement('option');
                        option.value = model.uuid;

                        const modelName = `${item.brand} ${item.series} ${model.capacity_GB}GB ${model.storage_type} ${model.form_factor}`;
                        option.textContent = modelName;

                        option.dataset.modelData = JSON.stringify({
                            ...model,
                            _brand: item.brand,
                            _series: item.series
                        });

                        dropdown4.appendChild(option);
                    }
                });
            }
        });

        dropdown4.disabled = false;
    }

    // ==================== CADDY DROPDOWNS ====================
    // Flow: Size → Drive Type → Model

    populateCaddyDropdown1() {
        this.configureDropdownLabels({
            d1: 'Size',
            d2: 'Drive Type',
            d3: 'Specific Model'
        });

        const dropdown1 = document.getElementById('dropdown1Select');
        if (!dropdown1 || !Array.isArray(this.jsonData)) return;

        dropdown1.innerHTML = '<option value="">Select Size</option>';

        const sizes = new Set();
        this.jsonData.forEach(caddy => {
            if (caddy.compatibility && caddy.compatibility.size) {
                sizes.add(caddy.compatibility.size);
            }
        });

        [...sizes].sort().forEach(size => {
            const option = document.createElement('option');
            option.value = size;
            option.textContent = size;
            dropdown1.appendChild(option);
        });

        dropdown1.disabled = false;
    }

    populateCaddyDropdown2(size) {
        const dropdown2 = document.getElementById('dropdown2Select');
        if (!dropdown2) return;

        dropdown2.innerHTML = '<option value="">Select Drive Type</option>';

        const driveTypes = new Set();
        this.jsonData.forEach(caddy => {
            if (caddy.compatibility &&
                caddy.compatibility.size === size &&
                caddy.compatibility.drive_type) {

                // Handle array of drive types
                if (Array.isArray(caddy.compatibility.drive_type)) {
                    caddy.compatibility.drive_type.forEach(type => driveTypes.add(type));
                } else {
                    driveTypes.add(caddy.compatibility.drive_type);
                }
            }
        });

        [...driveTypes].sort().forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            dropdown2.appendChild(option);
        });

        dropdown2.disabled = false;
    }

    populateCaddyDropdown3(size, driveType) {
        const dropdown3 = document.getElementById('dropdown3Select');
        if (!dropdown3) return;

        dropdown3.innerHTML = '<option value="">Select Model</option>';

        this.jsonData.forEach(caddy => {
            if (caddy.compatibility &&
                caddy.compatibility.size === size) {

                // Check if drive type matches (handle arrays)
                const driveTypeMatch = Array.isArray(caddy.compatibility.drive_type)
                    ? caddy.compatibility.drive_type.includes(driveType)
                    : caddy.compatibility.drive_type === driveType;

                if (driveTypeMatch) {
                    const option = document.createElement('option');
                    option.value = caddy.uuid;
                    option.textContent = caddy.model || caddy.type;
                    option.dataset.modelData = JSON.stringify(caddy);
                    dropdown3.appendChild(option);
                }
            }
        });

        dropdown3.disabled = false;
    }

    // ==================== CHASSIS DROPDOWNS ====================
    // Flow: Manufacturer → Series → Form Factor → Model

    populateChassisDropdown1() {
        this.configureDropdownLabels({
            d1: 'Manufacturer',
            d2: 'Series',
            d3: 'Form Factor',
            d4: 'Specific Model'
        });

        const dropdown1 = document.getElementById('dropdown1Select');
        if (!dropdown1 || !Array.isArray(this.jsonData)) return;

        dropdown1.innerHTML = '<option value="">Select Manufacturer</option>';

        const manufacturers = [...new Set(this.jsonData.map(item => item.manufacturer))].filter(Boolean);

        manufacturers.sort().forEach(manufacturer => {
            const option = document.createElement('option');
            option.value = manufacturer;
            option.textContent = manufacturer;
            dropdown1.appendChild(option);
        });

        dropdown1.disabled = false;
    }

    populateChassisDropdown2(manufacturer) {
        const dropdown2 = document.getElementById('dropdown2Select');
        if (!dropdown2) return;

        dropdown2.innerHTML = '<option value="">Select Series</option>';

        const manufacturerData = this.jsonData.find(item => item.manufacturer === manufacturer);
        if (!manufacturerData || !manufacturerData.series) return;

        manufacturerData.series.forEach(s => {
            if (s.series_name) {
                const option = document.createElement('option');
                option.value = s.series_name;
                option.textContent = s.series_name;
                dropdown2.appendChild(option);
            }
        });

        dropdown2.disabled = false;
    }

    populateChassisDropdown3(manufacturer, seriesName) {
        const dropdown3 = document.getElementById('dropdown3Select');
        if (!dropdown3) return;

        dropdown3.innerHTML = '<option value="">Select Form Factor</option>';

        const manufacturerData = this.jsonData.find(item => item.manufacturer === manufacturer);
        if (!manufacturerData || !manufacturerData.series) return;

        const seriesData = manufacturerData.series.find(s => s.series_name === seriesName);
        if (!seriesData || !seriesData.models) return;

        const formFactors = new Set();
        seriesData.models.forEach(model => {
            if (model.form_factor) formFactors.add(model.form_factor);
        });

        [...formFactors].sort().forEach(formFactor => {
            const option = document.createElement('option');
            option.value = formFactor;
            option.textContent = formFactor;
            dropdown3.appendChild(option);
        });

        dropdown3.disabled = false;
    }

    populateChassisDropdown4(manufacturer, seriesName, formFactor) {
        const dropdown4 = document.getElementById('dropdown4Select');
        if (!dropdown4) return;

        dropdown4.innerHTML = '<option value="">Select Model</option>';

        const manufacturerData = this.jsonData.find(item => item.manufacturer === manufacturer);
        if (!manufacturerData || !manufacturerData.series) return;

        const seriesData = manufacturerData.series.find(s => s.series_name === seriesName);
        if (!seriesData || !seriesData.models) return;

        seriesData.models.forEach(model => {
            if (model.form_factor === formFactor) {
                const option = document.createElement('option');
                option.value = model.uuid;
                option.textContent = model.model;

                option.dataset.modelData = JSON.stringify({
                    ...model,
                    _manufacturer: manufacturer,
                    _series: seriesName
                });

                dropdown4.appendChild(option);
            }
        });

        dropdown4.disabled = false;
    }

    // ==================== PCI CARD DROPDOWNS ====================
    // Flow: Component Subtype → Brand → Series → Model

    populatePCICardDropdown1() {
        this.configureDropdownLabels({
            d1: 'Component Subtype',
            d2: 'Brand',
            d3: 'Series',
            d4: 'Specific Model'
        });

        const dropdown1 = document.getElementById('dropdown1Select');
        if (!dropdown1 || !Array.isArray(this.jsonData)) return;

        dropdown1.innerHTML = '<option value="">Select Component Subtype</option>';

        const subtypes = [...new Set(this.jsonData.map(item => item.component_subtype))].filter(Boolean);

        subtypes.sort().forEach(subtype => {
            const option = document.createElement('option');
            option.value = subtype;
            option.textContent = subtype;
            dropdown1.appendChild(option);
        });

        dropdown1.disabled = false;
    }

    populatePCICardDropdown2(subtype) {
        const dropdown2 = document.getElementById('dropdown2Select');
        if (!dropdown2) return;

        dropdown2.innerHTML = '<option value="">Select Brand</option>';

        const brands = new Set();
        this.jsonData.forEach(item => {
            if (item.component_subtype === subtype && item.brand) {
                brands.add(item.brand);
            }
        });

        [...brands].sort().forEach(brand => {
            const option = document.createElement('option');
            option.value = brand;
            option.textContent = brand;
            dropdown2.appendChild(option);
        });

        dropdown2.disabled = false;
    }

    populatePCICardDropdown3(subtype, brand) {
        const dropdown3 = document.getElementById('dropdown3Select');
        if (!dropdown3) return;

        dropdown3.innerHTML = '<option value="">Select Series</option>';

        const series = new Set();
        this.jsonData.forEach(item => {
            if (item.component_subtype === subtype &&
                item.brand === brand &&
                item.series) {
                series.add(item.series);
            }
        });

        [...series].sort().forEach(s => {
            const option = document.createElement('option');
            option.value = s;
            option.textContent = s;
            dropdown3.appendChild(option);
        });

        dropdown3.disabled = false;
    }

    populatePCICardDropdown4(subtype, brand, series) {
        const dropdown4 = document.getElementById('dropdown4Select');
        if (!dropdown4) return;

        dropdown4.innerHTML = '<option value="">Select Model</option>';

        this.jsonData.forEach(item => {
            if (item.component_subtype === subtype &&
                item.brand === brand &&
                item.series === series &&
                item.models && Array.isArray(item.models)) {

                item.models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.UUID;
                    option.textContent = model.model;

                    option.dataset.modelData = JSON.stringify({
                        ...model,
                        _subtype: subtype,
                        _brand: brand,
                        _series: series
                    });

                    dropdown4.appendChild(option);
                });
            }
        });

        dropdown4.disabled = false;
    }

    // ==================== STANDARD DROPDOWNS (CPU, Motherboard, NIC, HBA) ====================
    // Flow: Brand → Series → Model

    populateStandardDropdown1() {
        this.configureDropdownLabels({
            d1: 'Brand',
            d2: 'Series',
            d3: 'Model'
        });

        const dropdown1 = document.getElementById('dropdown1Select');
        if (!dropdown1 || !Array.isArray(this.jsonData)) return;

        dropdown1.innerHTML = '<option value="">Select Brand</option>';

        const brandField = this.currentComponentType === 'chassis' ? 'manufacturer' : 'brand';
        const brands = [...new Set(this.jsonData.map(item => item[brandField]))].filter(Boolean);

        brands.sort().forEach(brand => {
            const option = document.createElement('option');
            option.value = brand;
            option.textContent = brand;
            dropdown1.appendChild(option);
        });

        dropdown1.disabled = false;
    }

    // ==================== UNIFIED DROPDOWN CHANGE HANDLER ====================

    handleDropdownChange(level, value) {
        if (!value) {
            this.clearDropdownsFrom(level + 1);
            return;
        }

        // Clear subsequent dropdowns
        this.clearDropdownsFrom(level + 1);

        // Get previous dropdown values
        const values = {};
        for (let i = 1; i < level; i++) {
            const dropdown = document.getElementById(`dropdown${i}Select`);
            if (dropdown) values[`d${i}`] = dropdown.value;
        }
        values[`d${level}`] = value;

        // Route to appropriate population function
        switch (this.currentComponentType) {
            case 'ram':
                if (level === 1) this.populateRAMDropdown2(value);
                else if (level === 2) this.populateRAMDropdown3(values.d1, value);
                else if (level === 3) this.populateRAMDropdown4(values.d1, values.d2, value);
                else if (level === 4) this.handleModelSelection(value);
                break;

            case 'storage':
                if (level === 1) this.populateStorageDropdown2(value);
                else if (level === 2) this.populateStorageDropdown3(values.d1, value);
                else if (level === 3) this.populateStorageDropdown4(values.d1, values.d2, value);
                else if (level === 4) this.handleModelSelection(value);
                break;

            case 'caddy':
                if (level === 1) this.populateCaddyDropdown2(value);
                else if (level === 2) this.populateCaddyDropdown3(values.d1, value);
                else if (level === 3) this.handleModelSelection(value);
                break;

            case 'chassis':
                if (level === 1) this.populateChassisDropdown2(value);
                else if (level === 2) this.populateChassisDropdown3(values.d1, value);
                else if (level === 3) this.populateChassisDropdown4(values.d1, values.d2, value);
                else if (level === 4) this.handleModelSelection(value);
                break;

            case 'pciecard':
                if (level === 1) this.populatePCICardDropdown2(value);
                else if (level === 2) this.populatePCICardDropdown3(values.d1, value);
                else if (level === 3) this.populatePCICardDropdown4(values.d1, values.d2, value);
                else if (level === 4) this.handleModelSelection(value);
                break;

            default:
                // Standard components (CPU, Motherboard, NIC, HBA)
                if (level === 1) this.populateStandardDropdown2(value);
                else if (level === 2) this.populateStandardDropdown3(values.d1, value);
                else if (level === 3) this.handleModelSelection(value);
                break;
        }
    }

    handleModelSelection(uuid) {
        if (!uuid) {
            document.getElementById('componentUUID').value = '';
            this.clearComponentDetails();
            return;
        }

        // Auto-fill UUID
        document.getElementById('componentUUID').value = uuid;

        // Get model data from the selected option
        let modelData = null;
        for (let i = 1; i <= 4; i++) {
            const dropdown = document.getElementById(`dropdown${i}Select`);
            if (dropdown && dropdown.value === uuid) {
                const selectedOption = dropdown.options[dropdown.selectedIndex];
                if (selectedOption && selectedOption.dataset.modelData) {
                    try {
                        modelData = JSON.parse(selectedOption.dataset.modelData);
                        break;
                    } catch (error) {
                        console.error('Error parsing model data:', error);
                    }
                }
            }
        }

        if (modelData) {
            this.displayComponentDetails(modelData);
            this.selectedComponent = modelData;
        }
    }

    clearDropdownsFrom(startLevel) {
        for (let i = startLevel; i <= 4; i++) {
            const dropdown = document.getElementById(`dropdown${i}Select`);
            if (dropdown) {
                dropdown.innerHTML = '<option value="">Select</option>';
                dropdown.disabled = true;
                dropdown.value = '';
            }
        }

        document.getElementById('componentUUID').value = '';
        this.clearComponentDetails();
        this.selectedComponent = null;
    }

    // Standard dropdowns level 2 and 3 (for CPU, Motherboard, NIC, HBA)
    populateStandardDropdown2(brand) {
        const dropdown2 = document.getElementById('dropdown2Select');
        if (!dropdown2) return;

        dropdown2.innerHTML = '<option value="">Select Series</option>';

        let series = [];

        if (this.currentComponentType === 'nic') {
            // NIC has nested series array
            this.jsonData.forEach(item => {
                if (item.brand === brand && item.series && Array.isArray(item.series)) {
                    item.series.forEach(s => {
                        if (s.name) series.push(s.name);
                    });
                }
            });
        } else if (this.currentComponentType === 'hbacard') {
            // HBA cards have series field directly
            series = [...new Set(this.jsonData.filter(item => item.brand === brand).map(item => item.series))].filter(Boolean);
        } else {
            // Standard: CPU, Motherboard
            series = [...new Set(this.jsonData.filter(item => item.brand === brand).map(item => item.series))].filter(Boolean);
        }

        series.sort().forEach(s => {
            const option = document.createElement('option');
            option.value = s;
            option.textContent = s;
            dropdown2.appendChild(option);
        });

        dropdown2.disabled = false;
    }

    populateStandardDropdown3(brand, series) {
        const dropdown3 = document.getElementById('dropdown3Select');
        if (!dropdown3) return;

        dropdown3.innerHTML = '<option value="">Select Model</option>';

        let models = [];

        if (this.currentComponentType === 'nic') {
            // NIC structure: brand → series[] → models[]
            this.jsonData.forEach(item => {
                if (item.brand === brand && item.series && Array.isArray(item.series)) {
                    item.series.forEach(s => {
                        if (s.name === series && s.models && Array.isArray(s.models)) {
                            s.models.forEach(model => {
                                models.push({
                                    ...model,
                                    _brand: brand,
                                    _series: s.name
                                });
                            });
                        }
                    });
                }
            });
        } else {
            // Standard structure: brand → series → models[]
            this.jsonData.forEach(item => {
                if (item.brand === brand && item.series === series && item.models && Array.isArray(item.models)) {
                    item.models.forEach(model => {
                        models.push({
                            ...model,
                            _brand: brand,
                            _series: series
                        });
                    });
                }
            });
        }

        models.forEach(model => {
            const option = document.createElement('option');
            const uuid = model.UUID || model.uuid || model.inventory?.UUID;
            const modelName = model.model || model.name;

            if (uuid && modelName) {
                option.value = uuid;
                option.textContent = modelName;
                option.dataset.modelData = JSON.stringify(model);
                dropdown3.appendChild(option);
            }
        });

        dropdown3.disabled = false;
    }

    populateBrandDropdown() {
        const brandSelect = document.getElementById('brandSelect');
        if (!brandSelect || !Array.isArray(this.jsonData)) return;

        // Determine the correct field name based on component type
        const brandField = this.currentComponentType === 'chassis' ? 'manufacturer' : 'brand';
        const labelText = this.currentComponentType === 'chassis' ? 'Manufacturer' : 'Brand';

        // Update label text
        const brandLabel = brandSelect.previousElementSibling;
        if (brandLabel && brandLabel.classList.contains('form-label')) {
            brandLabel.textContent = labelText;
        }

        // Clear existing options
        brandSelect.innerHTML = `<option value="">Select ${labelText}</option>`;

        // Get unique brands/manufacturers from the JSON data
        const brands = [...new Set(this.jsonData.map(item => item[brandField]))].filter(Boolean);

        // Populate brand options
        brands.forEach(brand => {
            const option = document.createElement('option');
            option.value = brand;
            option.textContent = brand;
            brandSelect.appendChild(option);
        });

        brandSelect.disabled = false;
    }

    handleBrandChange(selectedBrand) {
        if (!selectedBrand) {
            this.resetDependentDropdowns();
            return;
        }

        // For most components, populate series based on selected brand
        this.populateSeriesDropdown(selectedBrand);
    }

    populateSeriesDropdown(selectedBrand) {
        const seriesSelect = document.getElementById('seriesSelect');
        if (!seriesSelect || !Array.isArray(this.jsonData)) return;

        // Clear existing options
        seriesSelect.innerHTML = '<option value="">Select Series</option>';

        // Determine the correct field name based on component type
        const brandField = this.currentComponentType === 'chassis' ? 'manufacturer' : 'brand';

        // Find all series for the selected brand
        const brandItems = this.jsonData.filter(item => item[brandField] === selectedBrand);

        let series = [];

        // Handle different JSON structures
        if (this.currentComponentType === 'nic') {
            // NIC has nested series array: brand → series[] → models[]
            brandItems.forEach(item => {
                if (item.series && Array.isArray(item.series)) {
                    item.series.forEach(s => {
                        if (s.name) series.push(s.name);
                    });
                }
            });
        } else if (this.currentComponentType === 'hbacard' || this.currentComponentType === 'pciecard') {
            // HBA/PCI cards have series field directly
            series = [...new Set(brandItems.map(item => item.series).filter(Boolean))];
        } else if (this.currentComponentType === 'chassis') {
            // Chassis has series array with series_name
            brandItems.forEach(item => {
                if (item.series && Array.isArray(item.series)) {
                    item.series.forEach(s => {
                        if (s.series_name) series.push(s.series_name);
                    });
                }
            });
        } else {
            // Standard structure: brand → series → models[]
            series = [...new Set(brandItems.map(item => item.series).filter(Boolean))];
        }

        series.forEach(seriesName => {
            const option = document.createElement('option');
            option.value = seriesName;
            option.textContent = seriesName;
            seriesSelect.appendChild(option);
        });

        seriesSelect.disabled = false;
        this.clearModelDropdown();
    }

    handleSeriesChange(selectedSeries) {
        if (!selectedSeries) {
            this.clearModelDropdown();
            return;
        }

        const selectedBrand = document.getElementById('brandSelect').value;
        this.populateModelDropdown(selectedBrand, selectedSeries);
    }

    populateModelDropdown(selectedBrand, selectedSeries = null) {
        const modelSelect = document.getElementById('modelSelect');
        if (!modelSelect || !Array.isArray(this.jsonData)) return;

        // Clear existing options
        modelSelect.innerHTML = '<option value="">Select Model</option>';

        // Determine the correct field name based on component type
        const brandField = this.currentComponentType === 'chassis' ? 'manufacturer' : 'brand';

        // Get models based on component type structure
        let models = [];

        if (this.currentComponentType === 'nic') {
            // NIC structure: brand → series[] → models[]
            this.jsonData.forEach(item => {
                if (item[brandField] === selectedBrand && item.series && Array.isArray(item.series)) {
                    item.series.forEach(s => {
                        if (s.name === selectedSeries && s.models && Array.isArray(s.models)) {
                            s.models.forEach(model => {
                                models.push({
                                    ...model,
                                    _brand: item[brandField],
                                    _series: s.name
                                });
                            });
                        }
                    });
                }
            });
        } else if (this.currentComponentType === 'chassis') {
            // Chassis structure: manufacturer → series[] → models[]
            this.jsonData.forEach(item => {
                if (item[brandField] === selectedBrand && item.series && Array.isArray(item.series)) {
                    item.series.forEach(s => {
                        if (s.series_name === selectedSeries && s.models && Array.isArray(s.models)) {
                            s.models.forEach(model => {
                                models.push({
                                    ...model,
                                    _brand: item[brandField],
                                    _series: s.series_name
                                });
                            });
                        }
                    });
                }
            });
        } else {
            // Standard structure: brand → series → models[]
            let filteredData = this.jsonData.filter(item =>
                item[brandField] === selectedBrand &&
                (!selectedSeries || item.series === selectedSeries)
            );

            filteredData.forEach(item => {
                if (item.models && Array.isArray(item.models)) {
                    item.models.forEach(model => {
                        models.push({
                            ...model,
                            _brand: item[brandField],
                            _series: item.series
                        });
                    });
                }
            });
        }

        // Populate models
        models.forEach((model, index) => {
            const option = document.createElement('option');
            const modelName = model.model || model.name || model.series;

            // Get UUID from model or generate if not present
            let uuid = model.UUID || model.uuid || model.inventory?.UUID;
            if (!uuid) {
                // Generate UUID based on brand-series-model
                uuid = this.generateModelUUID(model._brand, model._series, modelName, index);
            }

            if (modelName) {
                option.value = uuid;
                option.textContent = modelName;
                option.dataset.modelData = JSON.stringify(model);
                modelSelect.appendChild(option);
            }
        });

        modelSelect.disabled = false;
    }

    generateModelUUID(brand, series, model, index) {
        // Create a consistent UUID based on brand-series-model
        const baseString = `${brand}-${series}-${model}-${index}`;
        const hash = this.simpleHash(baseString);
        
        // Format as UUID
        const uuid = `${hash.substr(0,8)}-${hash.substr(8,4)}-4${hash.substr(13,3)}-${hash.substr(16,4)}-${hash.substr(20,12)}`;
        return uuid;
    }

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(16).padStart(32, '0');
    }

    handleModelChange(selectedUUID) {
        if (!selectedUUID) {
            this.clearComponentDetails();
            return;
        }

        // Auto-fill UUID
        document.getElementById('componentUUID').value = selectedUUID;

        // Get selected model data
        const modelSelect = document.getElementById('modelSelect');
        const selectedOption = modelSelect.options[modelSelect.selectedIndex];
        
        if (selectedOption.dataset.modelData) {
            try {
                const modelData = JSON.parse(selectedOption.dataset.modelData);
                this.displayComponentDetails(modelData);
                this.selectedComponent = modelData;
            } catch (error) {
                console.error('Error parsing model data:', error);
            }
        }
    }

    displayComponentDetails(modelData) {
        const detailsSection = document.getElementById('componentDetails');
        const detailsContent = document.getElementById('detailsContent');

        if (!detailsSection || !detailsContent) return;

        // Clear existing details
        detailsContent.innerHTML = '';

        // Create details based on component type
        let details = {};

        if (this.currentComponentType === 'cpu') {
            details = {
                'Model': { value: modelData.model || 'N/A', icon: 'fas fa-microchip' },
                'Cores': { value: modelData.cores || 'N/A', icon: 'fas fa-hashtag' },
                'Threads': { value: modelData.threads || 'N/A', icon: 'fas fa-stream' },
                'Base Frequency': { value: modelData.base_frequency_GHz ? `${modelData.base_frequency_GHz}GHz` : 'N/A', icon: 'fas fa-tachometer-alt' },
                'Max Frequency': { value: modelData.max_frequency_GHz ? `${modelData.max_frequency_GHz}GHz` : 'N/A', icon: 'fas fa-rocket' },
                'TDP': { value: modelData.tdp_W ? `${modelData.tdp_W}W` : 'N/A', icon: 'fas fa-bolt' },
                'Socket': { value: modelData.socket || 'N/A', icon: 'fas fa-plug' },
                'Architecture': { value: modelData.architecture || 'N/A', icon: 'fas fa-cogs' }
            };
        } else if (this.currentComponentType === 'motherboard') {
            // Handle socket - can be string or object with nested properties
            let socketValue = 'N/A';
            if (modelData.socket) {
                if (typeof modelData.socket === 'string') {
                    socketValue = modelData.socket;
                } else if (typeof modelData.socket === 'object') {
                    // Socket is nested: socket.type, socket.count
                    const socketType = modelData.socket.type || 'N/A';
                    const socketCount = modelData.socket.count || 1;
                    socketValue = socketCount > 1 ? `${socketCount}x ${socketType}` : socketType;
                }
            }

            // Handle memory slots - nested in memory object
            let memorySlotsValue = 'N/A';
            if (modelData.memory && modelData.memory.slots) {
                memorySlotsValue = modelData.memory.slots;
            } else if (modelData.memory_slots !== undefined) {
                memorySlotsValue = modelData.memory_slots;
            } else if (modelData.ram_slots) {
                memorySlotsValue = modelData.ram_slots;
            }

            // Handle max memory - nested in memory object
            let maxMemoryValue = 'N/A';
            if (modelData.memory && modelData.memory.max_capacity_TB) {
                maxMemoryValue = `${modelData.memory.max_capacity_TB}TB`;
            } else if (modelData.memory && modelData.memory.max_capacity_GB) {
                maxMemoryValue = `${modelData.memory.max_capacity_GB}GB`;
            } else if (modelData.max_memory) {
                maxMemoryValue = modelData.max_memory;
            }

            // Get memory type
            let memoryType = 'N/A';
            if (modelData.memory && modelData.memory.type) {
                memoryType = modelData.memory.type;
            }

            details = {
                'Model': { value: modelData.model || 'N/A', icon: 'fas fa-memory' },
                'Socket': { value: socketValue, icon: 'fas fa-plug' },
                'Chipset': { value: modelData.chipset || 'N/A', icon: 'fas fa-chip' },
                'Memory Type': { value: memoryType, icon: 'fas fa-microchip' },
                'Memory Slots': { value: memorySlotsValue, icon: 'fas fa-sim-card' },
                'Max Memory': { value: maxMemoryValue, icon: 'fas fa-database' }
            };
        } else if (this.currentComponentType === 'ram') {
            details = {
                'Memory Type': { value: modelData.memory_type || 'N/A', icon: 'fas fa-memory' },
                'Capacity': { value: modelData.capacity_GB ? `${modelData.capacity_GB}GB` : 'N/A', icon: 'fas fa-database' },
                'Frequency': { value: modelData.frequency_MHz ? `${modelData.frequency_MHz}MHz` : 'N/A', icon: 'fas fa-tachometer-alt' },
                'Module Type': { value: modelData.module_type || 'N/A', icon: 'fas fa-th' },
                'ECC Support': { value: modelData.features?.ecc_support ? 'Yes' : 'No', icon: 'fas fa-shield-alt' },
                'Voltage': { value: modelData.voltage_V ? `${modelData.voltage_V}V` : 'N/A', icon: 'fas fa-bolt' }
            };
        } else if (this.currentComponentType === 'storage') {
            details = {
                'Storage Type': { value: modelData.storage_type || 'N/A', icon: 'fas fa-hdd' },
                'Capacity': { value: modelData.capacity_GB ? `${modelData.capacity_GB}GB` : 'N/A', icon: 'fas fa-database' },
                'Form Factor': { value: modelData.form_factor || 'N/A', icon: 'fas fa-square' },
                'Interface': { value: modelData.interface || 'N/A', icon: 'fas fa-plug' },
                'RPM': { value: modelData.specifications?.rpm || 'N/A', icon: 'fas fa-circle-notch' },
                'Cache': { value: modelData.specifications?.cache_MB ? `${modelData.specifications.cache_MB}MB` : 'N/A', icon: 'fas fa-memory' }
            };
        } else if (this.currentComponentType === 'nic') {
            details = {
                'Model': { value: modelData.model || 'N/A', icon: 'fas fa-network-wired' },
                'Ports': { value: modelData.ports || 'N/A', icon: 'fas fa-ethernet' },
                'Port Type': { value: modelData.port_type || 'N/A', icon: 'fas fa-plug' },
                'Speeds': { value: modelData.speeds?.join(', ') || 'N/A', icon: 'fas fa-tachometer-alt' },
                'Interface': { value: modelData.interface || 'N/A', icon: 'fas fa-server' },
                'Power': { value: modelData.power || 'N/A', icon: 'fas fa-bolt' }
            };
        } else if (this.currentComponentType === 'hbacard') {
            details = {
                'Model': { value: modelData.model || 'N/A', icon: 'fas fa-plug' },
                'Interface': { value: modelData.interface || 'N/A', icon: 'fas fa-server' },
                'Protocol': { value: modelData.protocol || 'N/A', icon: 'fas fa-exchange-alt' },
                'Data Rate': { value: modelData.data_rate || 'N/A', icon: 'fas fa-tachometer-alt' },
                'Internal Ports': { value: modelData.internal_ports || 'N/A', icon: 'fas fa-ethernet' },
                'External Ports': { value: modelData.external_ports || 'N/A', icon: 'fas fa-ethernet' },
                'Max Devices': { value: modelData.max_devices || 'N/A', icon: 'fas fa-hdd' }
            };
        } else if (this.currentComponentType === 'pciecard') {
            details = {
                'Model': { value: modelData.model || 'N/A', icon: 'fas fa-credit-card' },
                'Interface': { value: modelData.interface || 'N/A', icon: 'fas fa-server' },
                'M.2 Slots': { value: modelData.m2_slots || 'N/A', icon: 'fas fa-th' },
                'Form Factors': { value: modelData.m2_form_factors?.join(', ') || 'N/A', icon: 'fas fa-ruler' },
                'Max Capacity': { value: modelData.total_max_capacity || 'N/A', icon: 'fas fa-database' },
                'Power': { value: modelData.power_consumption?.typical_W ? `${modelData.power_consumption.typical_W}W` : 'N/A', icon: 'fas fa-bolt' }
            };
        } else if (this.currentComponentType === 'chassis') {
            details = {
                'Model': { value: modelData.model || 'N/A', icon: 'fas fa-server' },
                'Form Factor': { value: modelData.form_factor || 'N/A', icon: 'fas fa-square' },
                'U Size': { value: modelData.u_size ? `${modelData.u_size}U` : 'N/A', icon: 'fas fa-arrows-alt-v' },
                'Type': { value: modelData.chassis_type || 'N/A', icon: 'fas fa-tag' },
                'Total Bays': { value: modelData.drive_bays?.total_bays || 'N/A', icon: 'fas fa-hdd' },
                'Backplane': { value: modelData.backplane?.model || 'N/A', icon: 'fas fa-microchip' },
                'PSU Wattage': { value: modelData.power_supply?.wattage ? `${modelData.power_supply.wattage}W` : 'N/A', icon: 'fas fa-bolt' }
            };
        } else if (this.currentComponentType === 'caddy') {
            details = {
                'Model': { value: modelData.model || 'N/A', icon: 'fas fa-box' },
                'Type': { value: modelData.type || 'N/A', icon: 'fas fa-tag' },
                'Size': { value: modelData.compatibility?.size || 'N/A', icon: 'fas fa-ruler' },
                'Interface': { value: modelData.compatibility?.interface || 'N/A', icon: 'fas fa-plug' },
                'Material': { value: modelData.material || 'N/A', icon: 'fas fa-cube' },
                'Weight': { value: modelData.weight || 'N/A', icon: 'fas fa-weight' }
            };
        } else {
            // Generic details
            details = {
                'Model': { value: modelData.model || modelData.name || 'N/A', icon: 'fas fa-tag' },
                'Brand': { value: modelData._brand || 'N/A', icon: 'fas fa-building' },
                'Series': { value: modelData._series || 'N/A', icon: 'fas fa-layer-group' }
            };
        }

        // Display details with new structure
        for (const [label, data] of Object.entries(details)) {
            const detailItem = document.createElement('div');
            detailItem.className = 'spec-item';
            detailItem.innerHTML = `
                <div class="spec-label">
                    <i class="${data.icon}"></i>
                    ${label}
                </div>
                <div class="spec-value">${data.value}</div>
            `;
            detailsContent.appendChild(detailItem);
        }

        detailsSection.style.display = 'block';
    }

    resetDependentDropdowns() {
        this.clearDropdownsFrom(2);
    }

    clearComponentDetails() {
        const detailsSection = document.getElementById('componentDetails');
        if (detailsSection) {
            detailsSection.style.display = 'none';
        }
        this.selectedComponent = null;
    }

    showFormSections() {
        // Show all relevant sections
        const sections = [
            'specificationSection',
            'identificationSection', 
            'statusSection',
            'locationSection',
            'datesSection',
            'flagSection',
            'notesSection'
        ];

        sections.forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.style.display = 'block';
            }
        });

        // Show JSON dropdowns for CPU/Motherboard
        this.showJSONDropdowns();
    }

    showBasicFormOnly() {
        // Hide specification section for components without JSON data
        const specSection = document.getElementById('specificationSection');
        if (specSection) {
            specSection.style.display = 'none';
        }

        // Generate a basic UUID for non-JSON components
        this.generateBasicUUID();

        // Show other sections
        const sections = [
            'identificationSection', 
            'statusSection',
            'locationSection',
            'datesSection',
            'flagSection',
            'notesSection'
        ];

        sections.forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.style.display = 'block';
            }
        });
    }

    generateBasicUUID() {
        // Generate a simple UUID for components without JSON specifications
        const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
        document.getElementById('componentUUID').value = uuid;
    }

    hideAllSections() {
        const sections = [
            'specificationSection',
            'identificationSection',
            'statusSection',
            'locationSection',
            'datesSection',
            'flagSection',
            'notesSection'
        ];

        sections.forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.style.display = 'none';
            }
        });
    }

    async handleFormSubmit() {
        try {
            const submitBtn = document.getElementById('submitBtn');
            const btnText = submitBtn.querySelector('.btn-text');
            const btnLoader = submitBtn.querySelector('.btn-loader');

            // Show loading state
            submitBtn.disabled = true;
            btnText.style.display = 'none';
            btnLoader.style.display = 'inline-block';

            // Validate required fields
            if (!this.validateForm()) {
                throw new Error('Please fill in all required fields');
            }

            // Collect form data
            const formData = this.collectFormData();


            // Submit to API
            const result = await this.submitComponent(formData);


            if (result.success || result.status === 1) {
                this.showAlert('Component added successfully!', 'success');

                // Reset form and close modal
                setTimeout(() => {
                    this.resetForm();
                    // Close modal if in dashboard context
                    if (window.dashboard && typeof window.dashboard.closeModal === 'function') {
                        window.dashboard.closeModal();
                        // Refresh component list and dashboard
                        if (window.dashboard.loadComponentList) {
                            window.dashboard.loadComponentList(this.currentComponentType);
                        }
                        if (window.dashboard.loadDashboard) {
                            window.dashboard.loadDashboard();
                        }
                    } else {
                        window.history.back(); // Fallback: go back to component list
                    }
                }, 1500);
            } else {
                throw new Error(result.message || 'Failed to add component');
            }

        } catch (error) {
            console.error('Error submitting form:', error);
            this.showAlert(error.message, 'error');
        } finally {
            // Reset button state
            const submitBtn = document.getElementById('submitBtn');
            const btnText = submitBtn.querySelector('.btn-text');
            const btnLoader = submitBtn.querySelector('.btn-loader');
            
            submitBtn.disabled = false;
            btnText.style.display = 'inline-block';
            btnLoader.style.display = 'none';
        }
    }

    validateForm() {
        // Get all currently visible required fields
        const form = document.getElementById('addComponentForm');
        const visibleRequiredFields = [];
        
        // Get all required fields that are currently visible
        const allRequiredFields = form.querySelectorAll('[required]');
        
        allRequiredFields.forEach(field => {
            // Check if field is visible (not in a hidden section)
            const fieldSection = field.closest('.form-section, #customSpecForm');
            if (!fieldSection || fieldSection.style.display !== 'none') {
                // Additional check: ensure the field itself is not hidden
                const fieldStyle = window.getComputedStyle(field);
                if (fieldStyle.display !== 'none' && fieldStyle.visibility !== 'hidden') {
                    visibleRequiredFields.push(field);
                }
            }
        });

        // Validate visible required fields
        for (const field of visibleRequiredFields) {
            if (!field.value.trim()) {
                field.focus();
                const fieldLabel = this.getFieldLabel(field);
                this.showAlert(`Please fill in the ${fieldLabel} field`, 'warning');
                return false;
            }
        }

        return true;
    }

    getFieldLabel(field) {
        // Helper function to get a readable field name
        const fieldId = field.id;
        const labelMap = {
            'componentType': 'Component Type',
            'componentUUID': 'Component UUID',
            'serialNumber': 'Serial Number',
            'status': 'Status',
            'brandSelect': 'Brand',
            'seriesSelect': 'Series',
            'modelSelect': 'Model',
            'ramType': 'RAM Type',
            'ramECC': 'ECC Support',
            'ramSize': 'RAM Size',
            'storageType': 'Storage Type',
            'storageCapacity': 'Storage Capacity',
            'caddyType': 'Caddy Type'
        };
        
        return labelMap[fieldId] || fieldId.replace(/([A-Z])/g, ' $1').toLowerCase();
    }

    collectFormData() {
        // Base form data
        const formData = {
            action: `${this.currentComponentType}-add`,
            UUID: document.getElementById('componentUUID').value,
            SerialNumber: document.getElementById('serialNumber').value,
            Status: document.getElementById('status').value,
            Location: document.getElementById('location').value || null,
            RackPosition: document.getElementById('rackPosition').value || null,
            PurchaseDate: document.getElementById('purchaseDate').value || null,
            InstallationDate: document.getElementById('installationDate').value || null,
            WarrantyEndDate: document.getElementById('warrantyEndDate').value || null,
            Flag: document.getElementById('flag').value || null,
            Notes: this.buildNotesWithSpecification()
        };

        return formData;
    }

    buildNotesWithSpecification() {
        let notes = document.getElementById('notes').value || '';
        let specificationText = '';

        // Build specification text from selected component
        if (this.selectedComponent) {
            const brand = this.selectedComponent._brand || '';
            const series = this.selectedComponent._series || '';
            const model = this.selectedComponent.model || this.selectedComponent.name || '';

            if (brand && series && model) {
                specificationText = `Brand: ${brand}, Series: ${series}, Model: ${model}`;
            } else if (model) {
                specificationText = `Model: ${model}`;
            }
        }

        // Combine specification with user notes
        if (specificationText && notes) {
            return `${specificationText}\n\nAdditional Notes: ${notes}`;
        } else if (specificationText) {
            return specificationText;
        } else {
            return notes;
        }
    }

    async submitComponent(formData) {
        // Use the global api object if available
        if (window.api && window.api.components && window.api.components.add) {
            return await window.api.components.add(this.currentComponentType, {
                UUID: formData.UUID,
                SerialNumber: formData.SerialNumber,
                Status: formData.Status,
                Location: formData.Location,
                RackPosition: formData.RackPosition,
                PurchaseDate: formData.PurchaseDate,
                InstallationDate: formData.InstallationDate,
                WarrantyEndDate: formData.WarrantyEndDate,
                Flag: formData.Flag,
                Notes: formData.Notes
            });
        }

        // Fallback to direct API call
        const response = await fetch('../../api/api.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Bearer ${localStorage.getItem('bdc_token')}`
            },
            body: new URLSearchParams(formData)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    }

    resetForm() {
        document.getElementById('addComponentForm').reset();
        this.hideAllSections();
        this.currentComponentType = null;
        this.jsonData = [];
        this.selectedComponent = null;
        this.componentSpecification = {};

        // Remove custom specification forms
        const existingCustomForm = document.getElementById('customSpecForm');
        if (existingCustomForm) {
            existingCustomForm.remove();
        }

        // Reset all dropdown requirements
        const brandSelect = document.getElementById('brandSelect');
        const seriesSelect = document.getElementById('seriesSelect');
        const modelSelect = document.getElementById('modelSelect');
        
        if (brandSelect) {
            brandSelect.removeAttribute('required');
            brandSelect.value = '';
        }
        if (seriesSelect) {
            seriesSelect.removeAttribute('required');
            seriesSelect.value = '';
        }
        if (modelSelect) {
            modelSelect.removeAttribute('required');
            modelSelect.value = '';
        }
    }

    setupValidation() {
        // Basic form validation only - no serial number validation
        const form = document.getElementById('addComponentForm');
        if (form) {
            form.addEventListener('input', (e) => {
                // Reset any previous validation styling
                if (e.target.style.borderColor) {
                    e.target.style.borderColor = '';
                }
            });
        }
    }

    showLoading(show, message = 'Loading...') {
        if (window.globalLoading) {
            window.globalLoading.showLoading(show, message);
        } else {
            console.warn('Global loading manager not available');
        }
    }

    showAlert(message, type = 'info') {
        const container = document.getElementById('alertContainer');
        if (!container) {
            alert(message);
            return;
        }

        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        alert.innerHTML = `
            <span>${message}</span>
            <button type="button" class="alert-close" onclick="this.parentElement.remove()">×</button>
        `;

        container.appendChild(alert);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (alert.parentElement) {
                alert.remove();
            }
        }, 5000);
    }
}

// Global initialization function for dashboard integration
function initializeAddComponentForm(componentType = null) {
    const form = new AddComponentForm();
    if (componentType) {
        form.init(componentType);
    }
    return form;
}

// Initialize when DOM is loaded (for standalone use)
document.addEventListener('DOMContentLoaded', () => {
    // Only auto-initialize if not in dashboard context
    if (!window.dashboard) {
        new AddComponentForm();
    }
});

// Global functions for navigation
function goBack() {
    if (window.dashboard && typeof window.dashboard.closeModal === 'function') {
        window.dashboard.closeModal();
    } else {
        window.history.back();
    }
}

function closeForm() {
    if (confirm('Are you sure you want to close this form? Any unsaved changes will be lost.')) {
        if (window.dashboard && typeof window.dashboard.closeModal === 'function') {
            window.dashboard.closeModal();
        } else {
            window.history.back();
        }
    }
}