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
    }

    renderCommonFields() {
        return `
            <div class="form-section">
                <h4 class="form-section-title">Inventory Details</h4>
                <div class="form-grid two-column">
                    ${this.renderSelectField('Status', 'Status', this.componentData.Status, [{ value: 1, text: 'Available' }, { value: 2, text: 'In Use' }, { value: 0, text: 'Failed' }])}
                    ${this.renderTextField('ServerUUID', 'Server UUID', this.componentData.ServerUUID)}
                    ${this.renderTextField('Location', 'Location', this.componentData.Location)}
                    ${this.renderTextField('RackPosition', 'Rack Position', this.componentData.RackPosition)}
                    ${this.renderDateField('PurchaseDate', 'Purchase Date', this.componentData.PurchaseDate)}
                    ${this.renderDateField('InstallationDate', 'Installation Date', this.componentData.InstallationDate)}
                    ${this.renderDateField('WarrantyEndDate', 'Warranty End Date', this.componentData.WarrantyEndDate)}
                    ${this.renderTextField('Flag', 'Flag', this.componentData.Flag)}
                    <div class="form-group form-column-span-2">
                        <label for="notes" class="form-label">Notes</label>
                        <textarea id="notes" name="Notes" class="form-textarea" rows="3">${this.componentData.Notes || ''}</textarea>
                    </div>
                </div>
            </div>
        `;
    }





    renderTextField(name, label, value) {
        return `
            <div class="form-group">
                <label for="${name}" class="form-label">${label}</label>
                <input type="text" id="${name}" name="${name}" class="form-input" value="${value || ''}">
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