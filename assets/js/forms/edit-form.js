class EditFormComponent {
    /**
     * @param {object} options
     *   embedded — this form is mounted inside another modal that owns
     *     submission and supplies its own footer (the create-Request modal).
     *     It then reads the changed fields itself via collectChangedFields()
     *     rather than saving or raising anything on its own.
     *   record   — the record's current values, already fetched by the host.
     *     Supplied because the host route reaches this form through
     *     pipeline-inventory-record: a requester raising Update Inventory
     *     Record does not hold {type}.view, so {type}-get is closed to them.
     */
    constructor(componentType, componentId, options = {}) {
        this.componentType = componentType;
        this.componentId = componentId;
        this.embedded = options.embedded === true;
        this.componentData = options.record || null;
        // What the record said when the form was rendered. The diff against it
        // is what a save or a request actually carries.
        this.originalData = null;
        this.formContainer = document.getElementById('formFields');
        this.ready = this.init();
    }

    async init() {
        document.getElementById('formTitle').textContent = `Edit ${this.componentType.toUpperCase()} (ID: ${this.componentId})`;
        document.getElementById('formComponentType').textContent = this.componentType;

        document.getElementById('editComponentForm').addEventListener('submit', (e) => this.handleSubmit(e));
        const cancel = document.getElementById('cancelEditComponent');
        if (cancel) cancel.addEventListener('click', () => this.handleCancel());

        // The host modal supplies its own footer, so this fragment's Cancel /
        // Save pair would be a second, conflicting submit. Inline display, not
        // the `hidden` class: .hidden is emitted before .flex in the compiled
        // Tailwind, so it would not win against `flex` here.
        if (this.embedded) {
            const ownActions = document.querySelector('#editComponentForm .form-actions');
            if (ownActions) ownActions.style.display = 'none';
        }

        // Already supplied by the host — fetching again would only ask for a
        // permission the requester does not have.
        if (!this.componentData) {
            await this.fetchComponentData();
        }
        await this.renderForm();
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

    async renderForm() {
        if (!this.componentData) {
            this.formContainer.innerHTML = `<p>Component data not found.</p>`;
            return;
        }

        let fieldsHtml = this.renderCommonFields();

        this.formContainer.innerHTML = fieldsHtml;

        // Awaited so the snapshot below is taken with the Vendor and Location
        // selects already on their current values. Snapshotting first would make
        // every save report a vendor and a location change it is not making.
        await Promise.all([this.loadVendors(), this.loadLocations()]);
        this.snapshot();

        // Show/hide Fail Date based on the Status select, then sync to the
        // current value so an already-failed component shows its date.
        //
        // Deliberately AFTER the snapshot: toggleFailDate() auto-fills today on
        // a failed record with no date and clears the date on a record that is
        // no longer failed, and both of those ARE changes the save should carry.
        const statusSelect = document.getElementById('Status');
        if (statusSelect) {
            statusSelect.addEventListener('change', () => this.toggleFailDate());
        }
        this.toggleFailDate();
    }

    /** What the form said before the user touched it. */
    snapshot() {
        const form = document.getElementById('editComponentForm');
        if (!form) return;
        this.originalData = Object.fromEntries(new FormData(form).entries());
    }

    /**
     * Only the fields the user actually changed.
     *
     * Both routes out of this form use it, for the same two reasons. A save that
     * only writes what moved cannot stamp stale values over an edit somebody
     * else made in the meantime; and a REQUEST that carries only what moved is
     * one an approver can read — "Status, Location" rather than twenty fields
     * of which eighteen are unchanged. RequestActionExecutor::summarise() prints
     * exactly these keys.
     */
    collectChangedFields() {
        const form = document.getElementById('editComponentForm');
        if (!form) return {};

        const current = Object.fromEntries(new FormData(form).entries());
        // No snapshot means the form never finished rendering; sending the whole
        // form is the honest fallback rather than silently sending nothing.
        if (!this.originalData) return current;

        const changed = {};
        Object.keys(current).forEach((key) => {
            const before = this.originalData[key] === undefined ? '' : this.originalData[key];
            if (String(current[key]) !== String(before)) {
                changed[key] = current[key];
            }
        });
        return changed;
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
                    <div class="form-group">
                        <label for="Location" class="form-label">Location</label>
                        <select id="Location" name="Location" class="form-select">
                            <option value="">Loading locations\u2026</option>
                        </select>
                        <!-- The display name goes in Location for every existing
                             reader; this carries the real foreign key alongside it,
                             kept in sync by the change handler in loadLocations(). -->
                        <input type="hidden" id="location_uuid" name="location_uuid" value="${this.escapeHtml(this.componentData.location_uuid || '')}">
                    </div>
                    ${this.renderTextField('StoreLocation', 'Store / Shelf', this.componentData.StoreLocation)}
                    <div class="form-group">
                        <label for="RackPosition" class="form-label">Rack Position</label>
                        <input type="text" id="RackPosition" name="RackPosition" class="form-input" readonly
                               value="${this.escapeHtml(this.componentData.RackPosition || '')}">
                        <small class="form-hint">Derived from the server's rack placement \u2014 it updates on its own when the server moves.</small>
                    </div>
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

    /**
     * Fill the Location dropdown from the real `locations` rows, preselecting
     * whatever this component currently reports.
     *
     * The hidden location_uuid input is updated on every change: the visible
     * select posts the NAME (which every existing reader of the Location column
     * expects) while the key travels with it, so an edit leaves the row both
     * readable and filterable by site.
     */
    async loadLocations() {
        const select = document.getElementById('Location');
        const hidden = document.getElementById('location_uuid');
        if (!select) return;

        if (!(window.api && api.locations)) {
            select.innerHTML = '<option value="">No locations available</option>';
            select.disabled = true;
            return;
        }

        await api.locations.populateSelect(select, {
            selectedName: this.componentData.Location || ''
        });

        // Keep the key in step with the name, including the empty choice, so
        // clearing the location clears both halves rather than leaving a
        // dangling key behind.
        const sync = () => {
            if (hidden) hidden.value = api.locations.selectedUuid(select) || '';
        };
        select.addEventListener('change', sync);
        sync();
    }

    async loadVendors() {
        const vendorSelect = document.getElementById('VendorID');
        if (!vendorSelect) return;

        const currentVendorId = this.componentData.VendorID;
        let listed = false;

        try {
            if (window.api && window.api.vendors) {
                const result = await window.api.vendors.list();
                if (result.success && result.data.vendors) {
                    result.data.vendors.forEach(vendor => {
                        const option = document.createElement('option');
                        option.value = vendor.id;
                        option.textContent = vendor.name;
                        if (currentVendorId && vendor.id == currentVendorId) {
                            option.selected = true;
                            listed = true;
                        }
                        vendorSelect.appendChild(option);
                    });
                }
            }
        } catch (e) {
            console.error('Error loading vendors:', e);
        }

        // The vendor list is gated; a requester raising Update Inventory Record
        // typically cannot read it. Without this the dropdown would sit on
        // "-- No Vendor --" for a record that HAS one, and the change submitted
        // would read as "clear the vendor" — a correction nobody asked for.
        // pipeline-inventory-record sends vendor_name for exactly this.
        if (currentVendorId && !listed) {
            const option = document.createElement('option');
            option.value = currentVendorId;
            option.textContent = this.componentData.vendor_name || `Vendor #${currentVendorId}`;
            option.selected = true;
            vendorSelect.appendChild(option);
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

        // Embedded, the host modal owns submission: an Enter keypress in a field
        // must not save the record behind the host's back.
        if (this.embedded) return;

        const data = this.collectChangedFields();
        if (!Object.keys(data).length) {
            utils.showAlert('Nothing has changed yet.', 'info');
            return;
        }

        try {
            // Without the permission, the same form becomes a request for the
            // work. The requester is not given edit access; an admin approves
            // and the system applies exactly these fields on their behalf.
            const canEditDirectly = !(window.api && api.utils && api.utils.hasPermission)
                || api.utils.hasPermission(`${this.componentType}.edit`);

            const result = canEditDirectly
                ? await window.api.components.update(this.componentType, this.componentId, data)
                : await api.requests.submitAction('inventory.component.edit', {
                    component_type: this.componentType,
                    inventory_id: this.componentId,
                    data: data
                }, {
                    title: `Update ${this.componentType.toUpperCase()} inventory record #${this.componentId}`,
                    description: 'Raised from the Edit Component form because I cannot edit inventory records directly.'
                });

            if (result.success) {
                // Say which of the two things actually happened. "Updated
                // successfully" on a request would claim a change that has not
                // been made and may yet be rejected.
                const ticketNumber = result.data && result.data.ticket_number;
                utils.showAlert(
                    ticketNumber
                        ? `Request ${ticketNumber} submitted. The record will be updated once an admin approves it.`
                        : 'Component updated successfully!',
                    'success'
                );
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

/**
 * @returns {EditFormComponent} the instance, so an embedding modal can read its
 *          changed fields when the host's own footer is submitted. Await its
 *          `ready` promise to know the form has finished rendering.
 */
function initializeEditFormComponent(componentType, componentId, options = {}) {
    return new EditFormComponent(componentType, componentId, options);
}