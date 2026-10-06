const EDIT_FORM_FLAGS = ['Backup', 'Critical', 'Maintenance', 'Testing', 'Production'];

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
     *   row      — the inventory list's row for this unit, when opened from
     *     the list. {type}-get carries neither the model name nor the server
     *     name; the drawer header and the "Installed in" line read them here.
     */
    constructor(componentType, componentId, options = {}) {
        this.componentType = componentType;
        this.componentId = componentId;
        this.embedded = options.embedded === true;
        this.componentData = options.record || null;
        this.row = options.row || null;
        // What the record said when the form was rendered. The diff against it
        // is what a save or a request actually carries.
        this.originalData = null;
        this.formContainer = document.getElementById('formFields');
        this.ready = this.init();
    }

    get singular() {
        return (window.utils && utils.componentLabelsSingular && utils.componentLabelsSingular[this.componentType])
            || this.componentType.toUpperCase();
    }

    /** Whether Save performs the change or raises a request for it. */
    get canEditDirectly() {
        return !(window.api && api.utils && api.utils.hasPermission)
            || api.utils.hasPermission(`${this.componentType}.edit`);
    }

    async init() {
        const form = document.getElementById('editComponentForm');
        document.getElementById('formTitle').textContent = `${this.singular} #${this.componentId}`;
        document.getElementById('formComponentType').textContent = this.singular;

        form.addEventListener('submit', (e) => this.handleSubmit(e));
        const cancel = document.getElementById('cancelEditComponent');
        if (cancel) cancel.addEventListener('click', () => this.handleCancel());

        // The host modal supplies its own title and footer, so this fragment's
        // head and Discard / Save pair would be a second, conflicting set.
        if (this.embedded) {
            form.classList.add('is-embedded');
            const ownActions = document.querySelector('#editComponentForm .form-actions');
            if (ownActions) ownActions.style.display = 'none';
        } else if (!this.canEditDirectly) {
            const save = document.getElementById('saveComponentBtn');
            if (save) save.textContent = 'Submit request';
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
            this.formContainer.innerHTML = `<p class="cd-hint">Could not load this unit. Close the panel and try again.</p>`;
        }
    }

    async renderForm() {
        if (!this.componentData) {
            if (!this.formContainer.innerHTML.trim()) {
                this.formContainer.innerHTML = `<p class="cd-hint">This unit was not found.</p>`;
            }
            return;
        }

        this.renderHeading();
        this.formContainer.innerHTML = this.renderCommonFields();

        // Awaited so the snapshot below is taken with the Vendor and Location
        // selects already on their current values. Snapshotting first would make
        // every save report a vendor and a location change it is not making.
        await Promise.all([this.loadVendors(), this.loadLocations()]);
        this.snapshot();

        // Show/hide the Failed panel from the Status choice, then sync to the
        // current value so an already-failed component shows its date.
        //
        // Deliberately AFTER the snapshot: toggleFailDate() auto-fills today on
        // a failed record with no date and clears the date on a record that is
        // no longer failed, and both of those ARE changes the save should carry.
        document.querySelectorAll('#editComponentForm input[name="Status"]').forEach(radio => {
            radio.addEventListener('change', () => this.toggleFailDate());
        });
        this.toggleFailDate();

        const warranty = document.getElementById('WarrantyEndDate');
        if (warranty) warranty.addEventListener('input', () => this.updateWarrantyNote());
        this.updateWarrantyNote();

        const form = document.getElementById('editComponentForm');
        form.addEventListener('input', () => this.updateChangeState());
        form.addEventListener('change', () => this.updateChangeState());
        this.updateChangeState();
    }

    /** "CPU · BDC-CPU-000311" over the model name. */
    renderHeading() {
        const data = this.componentData;
        const id = data.SerialNumber || data.AssetTag || (this.row && (this.row.SerialNumber || this.row.AssetTag)) || `#${this.componentId}`;
        const model = (this.row && this.row.ModelName) || data.ModelName || `${this.singular} #${this.componentId}`;
        document.getElementById('formComponentType').textContent = `${this.singular} · ${id}`;
        document.getElementById('formTitle').textContent = model;
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
     * The footer's "3 changes" and the Save button's enabled state. Location is
     * one change even though it moves two fields (the name and its key).
     */
    updateChangeState() {
        const changed = this.collectChangedFields();
        if (changed.location_uuid !== undefined && changed.Location !== undefined) delete changed.location_uuid;
        const count = this.originalData ? Object.keys(changed).length : 0;
        const label = document.getElementById('editChangeCount');
        if (label) label.textContent = count === 0 ? 'No changes' : `${count} ${count === 1 ? 'change' : 'changes'}`;
        const save = document.getElementById('saveComponentBtn');
        if (save) save.disabled = count === 0;
    }

    /**
     * Reveal the Failed panel only when Status = Failed (0). Auto-fills today's
     * date (editable) when revealed and empty; clears it otherwise so the
     * update sends an empty value for non-failed components.
     */
    toggleFailDate() {
        const checked = document.querySelector('#editComponentForm input[name="Status"]:checked');
        const group = document.getElementById('FailDateGroup');
        const input = document.getElementById('FailDate');
        if (!group || !input) return;

        if (checked && String(checked.value) === '0' && !checked.disabled) {
            group.style.display = '';
            if (!input.value) {
                input.value = new Date().toISOString().split('T')[0];
            }
        } else {
            group.style.display = 'none';
            input.value = '';
        }
    }

    /** "Under warranty for 2 years 4 months." under the dates. */
    updateWarrantyNote() {
        const note = document.getElementById('warrantyNote');
        const input = document.getElementById('WarrantyEndDate');
        if (!note || !input) return;
        if (!input.value) {
            note.style.display = 'none';
            return;
        }
        const end = new Date(`${input.value}T00:00:00`);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateText = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        note.style.display = '';
        if (end < today) {
            note.classList.add('is-expired');
            note.textContent = `Warranty ended on ${dateText}.`;
            return;
        }
        note.classList.remove('is-expired');
        let months = (end.getFullYear() - today.getFullYear()) * 12 + (end.getMonth() - today.getMonth());
        if (end.getDate() < today.getDate()) months -= 1;
        const years = Math.floor(months / 12);
        const rest = months % 12;
        const parts = [];
        if (years) parts.push(`${years} ${years === 1 ? 'year' : 'years'}`);
        if (rest) parts.push(`${rest} ${rest === 1 ? 'month' : 'months'}`);
        note.textContent = parts.length
            ? `Under warranty for ${parts.join(' ')}, until ${dateText}.`
            : `Warranty ends this month, on ${dateText}.`;
    }

    renderCommonFields() {
        const data = this.componentData;
        const installed = !!data.ServerUUID;
        const status = String(data.Status);

        // "In use" is never a choice here. A unit becomes in-use by being
        // installed in a configuration, and the backend refuses the value from
        // this form [H-03/F-10]. An installed unit shows its status locked and
        // can only be freed by removing it from its server.
        const choice = (value, label, extra = '') => `
            <label class="cd-choice${value === '0' ? ' is-failed' : ''}"${extra}>
                <input type="radio" name="Status" value="${value}" ${status === value ? 'checked' : ''} ${installed || value === '2' ? 'disabled' : ''}>
                ${label}
            </label>`;

        let installedText = 'Not installed';
        if (installed) {
            const server = (this.row && this.row.server_name) || data.server_name || data.ServerUUID;
            installedText = [server, data.RackPosition].filter(Boolean).join(' · ');
        }

        return `
            <div class="cd-section">
                <span class="cd-section-title" id="editStatusTitle">Status</span>
                <div class="cd-choices" role="radiogroup" aria-labelledby="editStatusTitle">
                    ${choice('1', 'Available')}
                    ${choice('2', 'In use', ' title="Set automatically when the unit is installed in a server"')}
                    ${choice('0', 'Failed')}
                </div>
                ${installed ? '<p class="cd-hint">Installed in a server. Remove it from that configuration to change its status.</p>' : ''}
                <div class="cd-failed-panel" id="FailDateGroup" style="display: none;">
                    <div class="cd-grid">
                        ${this.renderDateField('FailDate', 'Failed on', data.FailDate)}
                    </div>
                </div>
            </div>

            <div class="cd-section">
                <span class="cd-section-title">Location</span>
                <div class="cd-grid">
                    <div class="cd-field">
                        <label for="Location">Site</label>
                        <select id="Location" name="Location">
                            <option value="">Loading locations…</option>
                        </select>
                        <!-- The display name goes in Location for every existing
                             reader; this carries the real foreign key alongside it,
                             kept in sync by the change handler in loadLocations(). -->
                        <input type="hidden" id="location_uuid" name="location_uuid" value="${utils.escapeHtml(data.location_uuid || '')}">
                    </div>
                    ${this.renderTextField('StoreLocation', 'Shelf / bin', data.StoreLocation, 'e.g. Shelf B3')}
                    <div class="cd-field cd-span">
                        <span class="cd-label">Installed in</span>
                        <div class="cd-ro">${utils.escapeHtml(installedText)}</div>
                        <span class="cd-hint">Set by installing or removing the unit in the server builder. The rack position follows the server.</span>
                    </div>
                </div>
            </div>

            <div class="cd-section">
                <span class="cd-section-title">Purchase</span>
                <div class="cd-grid">
                    <div class="cd-field">
                        <label for="VendorID">Vendor</label>
                        <select id="VendorID" name="VendorID">
                            <option value="">No vendor</option>
                        </select>
                    </div>
                    ${this.renderFlagField(data.Flag)}
                    ${this.renderDateField('PurchaseDate', 'Purchased', data.PurchaseDate)}
                    ${this.renderDateField('WarrantyEndDate', 'Warranty ends', data.WarrantyEndDate)}
                    ${this.renderDateField('InstallationDate', 'Installed on', data.InstallationDate)}
                </div>
                <div class="cd-note" id="warrantyNote" style="display: none;"></div>
            </div>

            <div class="cd-section">
                <div class="cd-field">
                    <label for="notes">Notes</label>
                    <textarea id="notes" name="Notes" rows="3">${utils.escapeHtml(data.Notes || '')}</textarea>
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
        // "No vendor" for a record that HAS one, and the change submitted
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

    renderTextField(name, label, value, placeholder = '') {
        return `
            <div class="cd-field">
                <label for="${name}">${label}</label>
                <input type="text" id="${name}" name="${name}" value="${utils.escapeHtml(value || '')}" placeholder="${utils.escapeHtml(placeholder)}">
            </div>
        `;
    }

    renderDateField(name, label, value) {
        const dateValue = value ? String(value).split(' ')[0] : '';
        return `
            <div class="cd-field">
                <label for="${name}">${label}</label>
                <input type="date" id="${name}" name="${name}" value="${utils.escapeHtml(dateValue)}">
            </div>
        `;
    }

    /**
     * The same five flags the bulk update offers. A value outside them (typed
     * into the old free-text field) stays selectable so opening the form does
     * not quietly change it.
     */
    renderFlagField(value) {
        const current = value || '';
        const values = EDIT_FORM_FLAGS.includes(current) || !current ? EDIT_FORM_FLAGS : EDIT_FORM_FLAGS.concat(current);
        const options = values.map(v =>
            `<option value="${utils.escapeHtml(v)}" ${v === current ? 'selected' : ''}>${utils.escapeHtml(v)}</option>`
        ).join('');
        return `
            <div class="cd-field">
                <label for="Flag">Flag</label>
                <select id="Flag" name="Flag"><option value="" ${current ? '' : 'selected'}>No flag</option>${options}</select>
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

        const save = document.getElementById('saveComponentBtn');
        try {
            if (save) save.disabled = true;
            // Without the permission, the same form becomes a request for the
            // work. The requester is not given edit access; an admin approves
            // and the system applies exactly these fields on their behalf.
            const result = this.canEditDirectly
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
                // Say which of the two things actually happened. "Saved" on a
                // request would claim a change that has not been made and may
                // yet be rejected.
                const ticketNumber = result.data && result.data.ticket_number;
                utils.showAlert(
                    ticketNumber
                        ? `Request ${ticketNumber} submitted. The record will be updated once an admin approves it.`
                        : 'Changes saved.',
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
                this.updateChangeState();
            }
        } catch (error) {
            console.error('Error updating component:', error);
            utils.showAlert(error.message || 'An error occurred while updating the component', 'error');
            this.updateChangeState();
        }
    }

    /** Discard: close without saving. The edits are thrown away on purpose. */
    handleCancel() {
        if (window.dashboard && typeof window.dashboard.closeDrawer === 'function' && window.dashboard._drawerRoot) {
            window.dashboard.closeDrawer();
        } else if (window.dashboard && typeof window.dashboard.closeModal === 'function') {
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
