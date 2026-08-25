/**
 * LocationsManager — the Locations page.
 *
 * A location is a physical site. It is the top of the address chain:
 *   location -> rack (+ floor) -> server -> component
 * Which means everything here has consequences well beyond this page: renaming
 * a location re-stamps every component at it, and deleting one is refused while
 * anything still points at it.
 *
 * WHY ITS OWN MODULE
 *   dashboard.js is 3,800 lines and already owns servers, vendors, components
 *   and every modal. Vendors is the pattern this follows, but it lives inside
 *   that file; this does not. Nothing here needs Dashboard's state.
 *
 * WHAT IT BORROWS
 *   showModal/closeModal from `dashboard` (the shared modal chrome lives there),
 *   utils.escapeHtml / utils.confirm / utils.showLoading, and toast. Every
 *   Tailwind class used is one the Vendors page already uses, so no CSS rebuild
 *   is required for this file.
 *
 * Every interpolated value goes through utils.escapeHtml() — this page renders
 * user-entered names and addresses through innerHTML.
 */

class LocationsManager {
    constructor() {
        this.allLocations = [];
        this.bound = false;
    }

    /**
     * Called from Dashboard.init()'s route branch for locations.html.
     */
    async init() {
        this.bindEvents();
        await this.load();
    }

    bindEvents() {
        // init() can be reached twice on a soft re-route; listeners must not
        // stack or one click would fire two API calls.
        if (this.bound) return;
        this.bound = true;

        const search = document.getElementById('componentSearch');
        if (search) {
            search.addEventListener('input', () => this.filterAndRender());
        }

        const refresh = document.getElementById('refreshLocations');
        if (refresh) {
            refresh.addEventListener('click', () => this.load());
        }

        const add = document.getElementById('addLocationBtn');
        if (add) {
            add.addEventListener('click', () => this.showAddForm());
        }
    }

    /* ============================================================
     * Loading
     * ============================================================ */

    async load() {
        try {
            utils.showLoading(true, 'Loading locations...');
            // includeCounts drives the Objects column. It is the only caller
            // that asks for it — everywhere else a plain list is enough.
            const result = await api.locations.list({ includeCounts: true, includeInactive: true });

            if (!result.success) {
                toast.error(result.message || 'Failed to load locations');
                this.allLocations = [];
            } else {
                this.allLocations = (result.data && result.data.locations) || [];
            }
            this.filterAndRender();
        } catch (error) {
            // 503 = the seeders have not been run on the server yet. Say that
            // plainly instead of a generic failure: it is the single most likely
            // reason this page is empty on a fresh deploy.
            const message = error.code === 503
                ? 'Locations are not available yet — the database migration for this feature has not been applied.'
                : (error.message || 'Failed to load locations');
            toast.error(message);
            this.allLocations = [];
            this.filterAndRender();
        } finally {
            utils.showLoading(false);
        }
    }

    filterAndRender() {
        const input = document.getElementById('componentSearch');
        const term = (input ? input.value : '').trim().toLowerCase();

        const filtered = term === ''
            ? this.allLocations
            : this.allLocations.filter(l => [l.name, l.description, l.address]
                .some(v => (v || '').toLowerCase().includes(term)));

        this.render(filtered);
    }

    /* ============================================================
     * Rendering
     * ============================================================ */

    render(locations) {
        const tbody = document.getElementById('locationsTableBody');
        if (!tbody) return;

        const total = this.allLocations.length;

        const info = document.getElementById('locationPaginationInfo');
        if (info) {
            info.textContent = `Showing ${locations.length} of ${total} location${total === 1 ? '' : 's'}`;
        }

        const badge = document.getElementById('locationCountBadge');
        if (badge) {
            badge.textContent = total;
            badge.classList.remove('hidden');
            badge.classList.add('inline-flex');
        }

        if (locations.length === 0) {
            tbody.innerHTML = this.emptyStateRow(total === 0);
            return;
        }

        tbody.innerHTML = locations.map(l => this.rowHtml(l)).join('');
    }

    emptyStateRow(isUnfiltered) {
        const icon = isUnfiltered ? 'fa-map-marker-alt' : 'fa-search';
        const heading = isUnfiltered ? 'No locations yet' : 'No matching locations';
        const message = isUnfiltered
            ? 'Add your first site. Racks belong to a location, and every server and component in them inherits it.'
            : 'Try a different name, description or address.';
        const action = isUnfiltered
            ? `<button class="inline-flex items-center gap-2 h-10 px-4 mt-4 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-600 transition-colors" onclick="locationsManager.showAddForm()">
                   <i class="fas fa-plus text-xs"></i> Add Location
               </button>`
            : '';

        return `<tr><td colspan="6" class="px-5 py-16 text-center">
            <div class="w-14 h-14 mx-auto mb-4 rounded-full bg-surface-secondary flex items-center justify-center">
                <i class="fas ${icon} text-2xl text-text-muted"></i>
            </div>
            <h3 class="text-base font-semibold text-text-primary mb-1">${heading}</h3>
            <p class="text-sm text-text-muted">${message}</p>
            ${action}
        </td></tr>`;
    }

    rowHtml(l) {
        const uuid = utils.escapeHtml(l.location_uuid);
        const name = utils.escapeHtml(l.name || '');
        const retired = Number(l.is_active) !== 1;

        return `
            <tr class="hover:bg-surface-hover transition-colors">
                <td class="px-4 sm:px-5 py-3.5 align-middle" data-label="Name">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 shrink-0 rounded-full bg-primary/10 text-primary dark:text-primary-light flex items-center justify-center text-sm">
                            <i class="fas fa-map-marker-alt"></i>
                        </div>
                        <div>
                            <span class="font-semibold text-text-primary">${name}</span>
                            ${retired ? '<span class="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-surface-secondary text-text-muted">Retired</span>' : ''}
                        </div>
                    </div>
                </td>
                <td class="px-4 sm:px-5 py-3.5 align-middle" data-label="Objects">${this.objectsCell(l)}</td>
                <td class="px-4 sm:px-5 py-3.5 align-middle text-sm text-text-secondary" data-label="Description">${l.description ? utils.escapeHtml(l.description) : '<span class="text-text-muted">—</span>'}</td>
                <td class="px-4 sm:px-5 py-3.5 align-middle text-sm text-text-secondary" data-label="Address">${l.address ? utils.escapeHtml(l.address) : '<span class="text-text-muted">—</span>'}</td>
                <td class="px-4 sm:px-5 py-3.5 align-middle text-sm font-mono tabular-nums text-text-secondary" data-label="Coordinates">${this.coordinatesCell(l)}</td>
                <td class="px-4 sm:px-5 py-3.5 align-middle" data-label="Actions">
                    <div class="flex items-center justify-end gap-1">
                        <button class="action-btn w-9 h-9 inline-flex items-center justify-center rounded-lg text-text-muted hover:text-info hover:bg-info/10 transition-colors" onclick="locationsManager.showEditForm('${uuid}')" title="Edit">
                            <i class="fas fa-edit text-sm"></i>
                        </button>
                        <button class="action-btn w-9 h-9 inline-flex items-center justify-center rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" onclick="locationsManager.handleDelete('${uuid}')" title="Delete">
                            <i class="fas fa-trash text-sm"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    /**
     * The Objects column: what this site actually holds.
     *
     * Shown as three separate counts rather than one total, because they are the
     * three things that block a delete and the operator needs to know which.
     */
    objectsCell(l) {
        const racks = Number(l.racks || 0);
        const servers = Number(l.servers || 0);
        const components = Number(l.components || 0);

        if (racks + servers + components === 0) {
            return '<span class="text-sm text-text-muted">Empty</span>';
        }

        const chip = (n, label) => n === 0 ? '' :
            `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary dark:text-primary-light tabular-nums">${n} ${label}${n === 1 ? '' : 's'}</span>`;

        return `<div class="flex flex-wrap items-center gap-1">
            ${chip(racks, 'rack')}
            ${chip(servers, 'server')}
            ${chip(components, 'component')}
        </div>`;
    }

    coordinatesCell(l) {
        if (l.latitude === null || l.longitude === null ||
            l.latitude === undefined || l.longitude === undefined) {
            return '<span class="font-sans text-text-muted">—</span>';
        }
        return `${utils.escapeHtml(String(l.latitude))} / ${utils.escapeHtml(String(l.longitude))}`;
    }

    /* ============================================================
     * Add / Edit
     * ============================================================ */

    /**
     * The shared form body. Add and Edit ask for exactly the same things, so
     * they share one renderer — two copies would drift.
     */
    formFields(l) {
        const v = (key) => l && l[key] !== null && l[key] !== undefined ? utils.escapeHtml(String(l[key])) : '';

        return `
            <div class="form-group mb-4">
                <label class="block text-sm font-medium text-text-secondary mb-2 required after:content-['_*'] after:text-red-500">Location Name</label>
                <input type="text" id="locationName" maxlength="100" class="form-input w-full px-4 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary" required placeholder="e.g. Yotta Noida" value="${v('name')}">
                <p class="text-xs text-text-muted mt-1">Must be unique. Renaming this updates every rack, server and component that reports it.</p>
            </div>
            <div class="form-group mb-4">
                <label class="block text-sm font-medium text-text-secondary mb-2">Description</label>
                <input type="text" id="locationDescription" maxlength="255" class="form-input w-full px-4 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary" placeholder="e.g. CtrlS" value="${v('description')}">
            </div>
            <div class="form-group mb-4">
                <label class="block text-sm font-medium text-text-secondary mb-2">Address</label>
                <input type="text" id="locationAddress" maxlength="255" class="form-input w-full px-4 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Street, city, postcode" value="${v('address')}">
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div class="form-group">
                    <label class="block text-sm font-medium text-text-secondary mb-2">Latitude</label>
                    <input type="text" id="locationLatitude" class="form-input w-full px-4 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary" placeholder="28.5523120" value="${v('latitude')}">
                </div>
                <div class="form-group">
                    <label class="block text-sm font-medium text-text-secondary mb-2">Longitude</label>
                    <input type="text" id="locationLongitude" class="form-input w-full px-4 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary" placeholder="77.4834370" value="${v('longitude')}">
                </div>
            </div>
            <div class="form-group mb-4">
                <label class="block text-sm font-medium text-text-secondary mb-2">Notes</label>
                <textarea id="locationNotes" class="form-textarea w-full px-4 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary resize-y" rows="3" placeholder="Additional notes...">${l && l.notes ? utils.escapeHtml(l.notes) : ''}</textarea>
            </div>
        `;
    }

    /**
     * Read the form. Coordinates are sent as typed (including empty, which
     * clears them) — the backend validates the range and rejects non-numbers,
     * so there is one rule for it rather than two that can disagree.
     */
    readForm() {
        return {
            name: document.getElementById('locationName').value.trim(),
            description: document.getElementById('locationDescription').value.trim(),
            address: document.getElementById('locationAddress').value.trim(),
            latitude: document.getElementById('locationLatitude').value.trim(),
            longitude: document.getElementById('locationLongitude').value.trim(),
            notes: document.getElementById('locationNotes').value.trim()
        };
    }

    showAddForm() {
        const html = `
            <form id="addLocationForm" class="max-w-2xl">
                ${this.formFields(null)}
                <div class="flex gap-3 justify-end mt-6 pt-4 border-t border-border">
                    <button type="button" class="btn btn-secondary px-5 py-2 bg-surface-secondary text-text-primary rounded-lg hover:bg-surface-hover" onclick="dashboard.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary-600">Add Location</button>
                </div>
            </form>
        `;
        dashboard.showModal('Add New Location', html);
        document.getElementById('addLocationForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleAdd();
        });
    }

    async handleAdd() {
        const fields = this.readForm();
        if (!fields.name) {
            toast.error('Location name is required');
            return;
        }

        try {
            utils.showLoading(true, 'Creating location...');
            const result = await api.locations.create(fields);
            if (result.success) {
                toast.success('Location created successfully');
                dashboard.closeModal();
                await this.load();
            } else {
                toast.error(result.message || 'Failed to create location');
            }
        } catch (error) {
            // 409 = a location of this name already exists. The backend's own
            // message names it and says whether it is retired, which is more
            // use than "duplicate".
            toast.error(error.message || 'Failed to create location');
        } finally {
            utils.showLoading(false);
        }
    }

    showEditForm(locationUuid) {
        const location = this.allLocations.find(l => l.location_uuid === locationUuid);
        if (!location) {
            toast.error('Location not found — try refreshing the list');
            return;
        }

        const retired = Number(location.is_active) !== 1;
        const html = `
            <form id="editLocationForm" class="max-w-2xl">
                ${this.formFields(location)}
                <div class="form-group mb-4">
                    <label class="flex items-center gap-2 text-sm font-medium text-text-secondary">
                        <input type="checkbox" id="locationIsActive" class="rounded border-border" ${retired ? '' : 'checked'}>
                        <span>In service</span>
                    </label>
                    <p class="text-xs text-text-muted mt-1">Clearing this retires the site: it stays on every historical record, but nothing new can be moved into it.</p>
                </div>
                <div class="flex gap-3 justify-end mt-6 pt-4 border-t border-border">
                    <button type="button" class="btn btn-secondary px-5 py-2 bg-surface-secondary text-text-primary rounded-lg hover:bg-surface-hover" onclick="dashboard.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary-600">Save Changes</button>
                </div>
            </form>
        `;
        dashboard.showModal(`Edit ${location.name}`, html);
        document.getElementById('editLocationForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleUpdate(locationUuid);
        });
    }

    async handleUpdate(locationUuid) {
        const fields = this.readForm();
        if (!fields.name) {
            toast.error('Location name is required');
            return;
        }
        fields.is_active = document.getElementById('locationIsActive').checked ? '1' : '0';

        try {
            utils.showLoading(true, 'Saving location...');
            const result = await api.locations.update(locationUuid, fields);
            if (result.success) {
                // A rename re-stamps everything that reported the old name. Say
                // how much moved — it is a bigger change than it looks.
                const resynced = (result.data && result.data.resynced) || null;
                if (resynced && (resynced.configs > 0 || resynced.components > 0)) {
                    toast.success(`Location saved · re-stamped ${resynced.configs} server(s) and ${resynced.components} component(s)`);
                } else {
                    toast.success('Location saved');
                }
                dashboard.closeModal();
                await this.load();
            } else {
                toast.error(result.message || 'Failed to save location');
            }
        } catch (error) {
            toast.error(error.message || 'Failed to save location');
        } finally {
            utils.showLoading(false);
        }
    }

    /* ============================================================
     * Delete
     * ============================================================ */

    /**
     * Deleting a location that still holds things is refused by the backend
     * (409) with the counts. Rather than dead-ending there, that refusal opens
     * the reassign dialog — the operator's actual intent is almost always "this
     * site is gone, its contents are somewhere else now".
     */
    async handleDelete(locationUuid) {
        const location = this.allLocations.find(l => l.location_uuid === locationUuid);
        if (!location) {
            toast.error('Location not found — try refreshing the list');
            return;
        }

        const held = Number(location.racks || 0) + Number(location.servers || 0) + Number(location.components || 0);
        if (held > 0) {
            this.showReassignForm(location);
            return;
        }

        const confirmed = await utils.confirm(
            `Delete "${location.name}"? This cannot be undone. Movement history that names it is kept.`,
            'Delete location'
        );
        if (!confirmed) return;

        await this.performDelete(locationUuid, '');
    }

    /**
     * Move everything to another site, then delete this one.
     */
    showReassignForm(location) {
        const others = this.allLocations
            .filter(l => l.location_uuid !== location.location_uuid && Number(l.is_active) === 1);

        const parts = [];
        if (Number(location.racks || 0))      { parts.push(`${location.racks} rack(s)`); }
        if (Number(location.servers || 0))    { parts.push(`${location.servers} server(s)`); }
        if (Number(location.components || 0)) { parts.push(`${location.components} component(s)`); }

        if (others.length === 0) {
            dashboard.showModal(`Cannot delete ${location.name}`, `
                <div class="max-w-2xl">
                    <p class="text-sm text-text-secondary mb-4">
                        <strong>${utils.escapeHtml(location.name)}</strong> still holds ${utils.escapeHtml(parts.join(', '))},
                        and there is no other active location to move them to.
                    </p>
                    <p class="text-sm text-text-muted mb-4">
                        Create another location first, or retire this one instead of deleting it — retiring keeps every
                        record intact and simply stops new hardware being moved in.
                    </p>
                    <div class="flex gap-3 justify-end mt-6 pt-4 border-t border-border">
                        <button type="button" class="btn btn-secondary px-5 py-2 bg-surface-secondary text-text-primary rounded-lg hover:bg-surface-hover" onclick="dashboard.closeModal()">Close</button>
                    </div>
                </div>
            `);
            return;
        }

        const options = others
            .map(l => `<option value="${utils.escapeHtml(l.location_uuid)}">${utils.escapeHtml(l.name)}</option>`)
            .join('');

        dashboard.showModal(`Delete ${location.name}`, `
            <form id="reassignLocationForm" class="max-w-2xl">
                <p class="text-sm text-text-secondary mb-4">
                    <strong>${utils.escapeHtml(location.name)}</strong> still holds ${utils.escapeHtml(parts.join(', '))}.
                    Choose where they should go; they are moved first, then this location is deleted.
                </p>
                <div class="form-group mb-4">
                    <label class="block text-sm font-medium text-text-secondary mb-2 required after:content-['_*'] after:text-red-500">Move everything to</label>
                    <select id="reassignTarget" class="form-input w-full px-4 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary" required>
                        ${options}
                    </select>
                    <p class="text-xs text-text-muted mt-1">Racks move with their servers and every component inside them. Loose stock moves too.</p>
                </div>
                <div class="flex gap-3 justify-end mt-6 pt-4 border-t border-border">
                    <button type="button" class="btn btn-secondary px-5 py-2 bg-surface-secondary text-text-primary rounded-lg hover:bg-surface-hover" onclick="dashboard.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary px-5 py-2 bg-danger text-white rounded-lg hover:bg-primary-600">Move and delete</button>
                </div>
            </form>
        `);

        document.getElementById('reassignLocationForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const target = document.getElementById('reassignTarget').value;
            const targetName = (others.find(l => l.location_uuid === target) || {}).name || 'the new location';

            const confirmed = await utils.confirm(
                `Move everything at "${location.name}" to "${targetName}" and then delete "${location.name}"? This cannot be undone.`,
                'Move and delete'
            );
            if (!confirmed) return;

            await this.performDelete(location.location_uuid, target);
        });
    }

    async performDelete(locationUuid, reassignTo) {
        try {
            utils.showLoading(true, reassignTo ? 'Moving and deleting...' : 'Deleting location...');
            const result = await api.locations.delete(locationUuid, reassignTo);
            if (result.success) {
                toast.success(result.message || 'Location deleted');
                dashboard.closeModal();
                await this.load();
            } else {
                toast.error(result.message || 'Failed to delete location');
            }
        } catch (error) {
            // The backend's 409 names exactly what is still there — far more
            // useful than anything this layer could compose.
            toast.error(error.message || 'Failed to delete location');
        } finally {
            utils.showLoading(false);
        }
    }
}

// Explicit global, matching the house pattern (window.dashboard, window.toast).
// The inline onclick handlers in the rendered rows call through this name.
window.locationsManager = new LocationsManager();
