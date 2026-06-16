class EditFormComponent {
    constructor(componentType, componentId) {
        this.componentType = componentType;
        this.componentId = componentId;
        this.componentData = null;
        this.formContainer = document.getElementById('formFields');
        this.init();
    }

    async init() {
        document.getElementById('formTitle').textContent = `Edit ${this.componentType.toUpperCase()} (ID: ${this.componentId})`;
        document.getElementById('formComponentType').textContent = this.componentType;

        document.getElementById('editComponentForm').addEventListener('submit', (e) => this.handleSubmit(e));
        document.getElementById('cancelEditComponent').addEventListener('click', () => this.handleCancel());

        await this.fetchComponentData();
        this.renderForm();
    }

    async fetchComponentData() {
        try {
            const result = await window.api.components.get(this.componentType, this.componentId);
            if (result.success) {
                this.componentData = result.data.component;
            } else {
                throw new Error(result.message || 'Failed to fetch component data.');
            }
        } catch (error) {
            console.error('Error fetching component data:', error);
            this.formContainer.innerHTML = `<p class="form-error">Could not load component data. Please try again.</p>`;
        }
    }

    renderForm() {
        if (!this.componentData) {
            this.formContainer.innerHTML = `<p>Component data not found.</p>`;
            return;
        }

        let fieldsHtml = this.renderCommonFields();

        this.formContainer.innerHTML = fieldsHtml;
        this.loadVendors();

        // Show/hide Fail Date based on the Status select, then sync to the
        // current value so an already-failed component shows its date.
        const statusSelect = document.getElementById('Status');
        if (statusSelect) {
            statusSelect.addEventListener('change', () => this.toggleFailDate());
        }
        this.toggleFailDate();
    }

    /**
     * Reveal Fail Date only when Status = Failed (0). Auto-fills today's
     * date (editable) when revealed and empty; clears it otherwise so the
     * update sends an empty value for non-failed components.
     */
    toggleFailDate() {
        const status = document.getElementById('Status');
        const group = document.getElementById('FailDateGroup');
        const input = document.getElementById('FailDate');
        if (!status || !group || !input) return;

        if (String(status.value) === '0') {
            group.style.display = '';
            if (!input.value) {
                input.value = new Date().toISOString().split('T')[0];
            }
        } else {
            group.style.display = 'none';
            input.value = '';
        }
    }

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    renderCommonFields() {
        return `
            <div class="form-section">
                <h4 class="form-section-title">Inventory Details</h4>
                <div class="form-grid two-column">
                    ${this.renderSelectField('Status', 'Status', this.componentData.Status, [{ value: 1, text: 'Available' }, { value: 2, text: 'In Use' }, { value: 0, text: 'Failed' }])}
                    ${this.renderTextField('ServerUUID', 'Server UUID', this.componentData.ServerUUID)}
                    <div class="form-group">
                        <label for="VendorID" class="form-label">Vendor</label>
                        <select id="VendorID" name="VendorID" class="form-select">
                            <option value="">-- No Vendor --</option>
                        </select>
                    </div>
                    ${this.renderSelectField('Location', 'Location', this.componentData.Location, [{ value: '', text: '-- Select Location --' }, { value: 'Noida Yotta', text: 'Noida Yotta' }, { value: 'Noida Ctrls', text: 'Noida Ctrls' }, { value: 'Noida Office', text: 'Noida Office' }, { value: 'Jaipur Office', text: 'Jaipur Office' }, { value: 'Indore Office', text: 'Indore Office' }, { value: 'Sonipat Office', text: 'Sonipat Office' }])}
                    ${this.renderTextField('RackPosition', 'Rack Position', this.componentData.RackPosition)}
                    ${this.renderDateField('PurchaseDate', 'Purchase Date', this.componentData.PurchaseDate)}
                    ${this.renderDateField('InstallationDate', 'Installation Date', this.componentData.InstallationDate)}
                    ${this.renderDateField('WarrantyEndDate', 'Warranty End Date', this.componentData.WarrantyEndDate)}
                    ${this.renderFailDateField(this.componentData.FailDate)}
                    ${this.renderTextField('Flag', 'Flag', this.componentData.Flag)}
                    <div class="form-group form-column-span-2">
                        <label for="notes" class="form-label">Notes</label>
                        <textarea id="notes" name="Notes" class="form-textarea" rows="3">${this.escapeHtml(this.componentData.Notes || '')}</textarea>
                    </div>
                </div>
            </div>
        `;
    }

    async loadVendors() {
        const vendorSelect = document.getElementById('VendorID');
        if (!vendorSelect) return;
        try {
            if (window.api && window.api.vendors) {
                const result = await window.api.vendors.list();
                if (result.success && result.data.vendors) {
                    const currentVendorId = this.componentData.VendorID;
                    result.data.vendors.forEach(vendor => {
                        const option = document.createElement('option');
                        option.value = vendor.id;
                        option.textContent = vendor.name;
                        if (currentVendorId && vendor.id == currentVendorId) {
                            option.selected = true;
                        }
                        vendorSelect.appendChild(option);
                    });
                }
            }
        } catch (e) {
            console.error('Error loading vendors:', e);
        }
    }





    renderTextField(name, label, value) {
        return `
            <div class="form-group">
                <label for="${name}" class="form-label">${label}</label>
                <input type="text" id="${name}" name="${name}" class="form-input" value="${this.escapeHtml(value || '')}">
            </div>
        `;
    }

    renderDateField(name, label, value) {
        const dateValue = value ? value.split(' ')[0] : '';
        return `
            <div class="form-group">
                <label for="${name}" class="form-label">${label}</label>
                <input type="date" id="${name}" name="${name}" class="form-input" value="${dateValue}">
            </div>
        `;
    }

    // Fail Date is only shown when Status = Failed (0). The wrapper id lets
    // toggleFailDate() show/hide it as the status changes.
    renderFailDateField(value) {
        const dateValue = value ? value.split(' ')[0] : '';
        return `
            <div class="form-group" id="FailDateGroup">
                <label for="FailDate" class="form-label">Fail Date</label>
                <input type="date" id="FailDate" name="FailDate" class="form-input" value="${dateValue}">
            </div>
        `;
    }

    renderSelectField(name, label, value, options) {
        let optionsHtml = '';
        options.forEach(opt => {
            optionsHtml += `<option value="${opt.value}" ${opt.value == value ? 'selected' : ''}>${opt.text}</option>`;
        });
        return `
            <div class="form-group">
                <label for="${name}" class="form-label">${label}</label>
                <select id="${name}" name="${name}" class="form-select">${optionsHtml}</select>
            </div>
        `;
    }

    async handleSubmit(event) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        try {
            const result = await window.api.components.update(this.componentType, this.componentId, data);
            if (result.success) {
                utils.showAlert('Component updated successfully!', 'success');
                if (window.dashboard && typeof window.dashboard.closeModal === 'function') {
                    window.dashboard.closeModal();

                    // Refresh component list and dashboard if functions exist
                    if (typeof window.dashboard.loadComponentList === 'function') {
                        window.dashboard.loadComponentList(this.componentType, true);
                    }
                    if (typeof window.dashboard.loadDashboard === 'function') {
                        window.dashboard.loadDashboard();
                    }
                }
            } else {
                utils.showAlert(result.message || 'Failed to update component.', 'error');
            }
        } catch (error) {
            console.error('Error updating component:', error);
            utils.showAlert(error.message || 'An error occurred while updating the component', 'error');
        }
    }

    handleCancel() {
        if (window.dashboard && typeof window.dashboard.closeModal === 'function') {
            window.dashboard.closeModal();
        }
    }
}

function initializeEditFormComponent(componentType, componentId) {
    new EditFormComponent(componentType, componentId);
}