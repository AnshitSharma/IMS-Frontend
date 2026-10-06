/**
 * RackView — Rack View page controller.
 * Renders the rack list + true-to-scale U-slot elevation, and drives
 * create/edit/delete rack and place/move/remove server actions.
 */
class RackView {
    constructor() {
        this.loginURL = window.BDC_CONFIG?.FRONTEND_LOGIN_URL || 'https://ims.bdcms.bharatdatacenter.com/';
        this.racks = [];
        this.selectedRackUuid = null;
        this.currentRack = null;
        // Servers placed DIRECTLY in the rack. Sleds are not here — they live in
        // currentEnclosures[].slots, which is where the elevation draws them.
        this.currentServers = [];
        this.currentEnclosures = [];
        // Routers, switches and MUXes racked here. Empty until seeder 2026_09_29_001.
        this.currentDevices = [];
    }

    init() {
        if (!this.checkAuth()) return;

        // Cache DOM references
        this.el = {
            list: document.getElementById('rackListContainer'),
            countChip: document.getElementById('rackCountChip'),
            detail: document.getElementById('rackDetail'),
            detailEmpty: document.getElementById('rackDetailEmpty'),
            name: document.getElementById('detailRackName'),
            location: document.getElementById('detailRackLocation'),
            occText: document.getElementById('detailRackOccText'),
            occBar: document.getElementById('detailRackOccBar'),
            elevation: document.getElementById('rackElevation'),
            modal: document.getElementById('rackModal'),
            modalTitle: document.getElementById('rackModalTitle'),
            modalBody: document.getElementById('rackModalBody'),
            modalClose: document.getElementById('rackModalClose'),
        };

        this.bindStaticEvents();
        this.loadRacks();
    }

    checkAuth() {
        const token = window.api ? window.api.getToken()
            : (localStorage.getItem('bdc_token') || sessionStorage.getItem('bdc_token'));
        if (!token) {
            window.location.href = this.loginURL;
            return false;
        }

        // Rack View is accessible to admin and super_admin (UI guard; API enforces server-side).
        if (!(window.api && window.api.utils && window.api.utils.hasRole(['admin', 'super_admin']))) {
            if (window.toast) toast.error('You do not have access to Rack View.');
            window.location.href = 'index.html';
            return false;
        }
        return true;
    }

    bindStaticEvents() {
        document.getElementById('newRackBtn')?.addEventListener('click', () => this.openRackForm());
        document.getElementById('placeServerBtn')?.addEventListener('click', () => this.openPlaceServer());
        document.getElementById('addEnclosureBtn')?.addEventListener('click', () => this.openEnclosureForm());
        document.getElementById('placeDeviceBtn')?.addEventListener('click', () => this.openPlaceDevice());
        document.getElementById('editRackBtn')?.addEventListener('click', () => this.openRackForm(this.currentRack));
        document.getElementById('deleteRackBtn')?.addEventListener('click', () => this.deleteRack());

        this.el.modalClose?.addEventListener('click', () => this.closeModal());
        this.el.modal?.addEventListener('click', (e) => { if (e.target === this.el.modal) this.closeModal(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.closeModal(); });

        // Rack list — event delegation
        this.el.list?.addEventListener('click', (e) => {
            const card = e.target.closest('[data-rack-uuid]');
            if (card) this.selectRack(card.getAttribute('data-rack-uuid'));
        });

        // Elevation — event delegation for sleds, enclosures, empty U and empty bays.
        // Order matters: a sled inside a bay carries .rk-sled AND sits inside
        // .rk-encl, so it must be tested before the enclosure rail.
        this.el.elevation?.addEventListener('click', (e) => {
            const sled = e.target.closest('.rk-sled');
            if (sled) this.markSelected(sled);
            if (sled && sled.dataset.deviceId) { this.openDeviceActions(parseInt(sled.dataset.deviceId, 10)); return; }
            if (sled && sled.dataset.configUuid) { this.openServerActions(sled.dataset.configUuid); return; }

            const bay = e.target.closest('.rk-encl__bay');
            if (bay && bay.dataset.enclosureUuid) {
                this.openPlaceInBay(bay.dataset.enclosureUuid, parseInt(bay.dataset.slot, 10));
                return;
            }

            const rail = e.target.closest('.rk-encl__rail');
            if (rail && rail.dataset.enclosureUuid) {
                this.markSelected(rail.closest('.rk-encl'));
                this.openEnclosureActions(rail.dataset.enclosureUuid);
                return;
            }

            const slot = e.target.closest('.rk-slot');
            if (slot && slot.dataset.u) this.openPlaceServer(parseInt(slot.dataset.u, 10));
        });
    }

    /* ---------------- data loading ---------------- */

    async loadRacks() {
        this.el.list.innerHTML = this.spinner('Loading racks…');
        const res = await rackAPI.listRacks();

        if (!res || !res.success) {
            this.el.list.innerHTML = `<div class="text-center text-danger text-sm py-6">${utils.escapeHtml(res?.message || 'Failed to load racks')}</div>`;
            return;
        }

        this.racks = res.data?.racks || [];
        this.el.countChip.textContent = this.racks.length;
        this.renderRackList();

        if (this.racks.length === 0) {
            this.selectedRackUuid = null;
            this.showEmptyDetail();
            return;
        }

        // ?rack=<uuid> — how the Locations page hands off a specific rack. Honoured
        // once, on the first load only, so a later refresh keeps the user's choice.
        if (!this.deepLinkUsed) {
            this.deepLinkUsed = true;
            const wanted = new URLSearchParams(window.location.search).get('rack');
            if (wanted && this.racks.some(r => r.rack_uuid === wanted)) {
                this.selectedRackUuid = wanted;
            }
        }

        // Keep current selection if still present, else select the first rack.
        const stillExists = this.racks.some(r => r.rack_uuid === this.selectedRackUuid);
        this.selectRack(stillExists ? this.selectedRackUuid : this.racks[0].rack_uuid);
    }

    renderRackList() {
        if (this.racks.length === 0) {
            this.el.list.innerHTML = `
                <div class="text-center py-8 px-2">
                    <i class="fas fa-server text-2xl text-text-muted mb-2"></i>
                    <p class="text-text-muted text-sm">No racks yet</p>
                    <button onclick="rackView.openRackForm()" class="mt-3 text-primary text-sm font-medium hover:underline">Create your first rack</button>
                </div>`;
            return;
        }

        this.el.list.innerHTML = this.racks.map(r => {
            const pct = r.total_u > 0 ? Math.min(100, Math.round((r.used_u / r.total_u) * 100)) : 0;
            const active = r.rack_uuid === this.selectedRackUuid ? ' is-active' : '';
            return `
                <button type="button" class="rk-rackcard${active}" data-rack-uuid="${utils.escapeHtml(r.rack_uuid)}">
                    <div class="flex items-center justify-between gap-2">
                        <span class="font-semibold text-text-primary truncate">${utils.escapeHtml(r.name)}</span>
                        <span class="flex items-center gap-1">
                            ${r.device_count > 0 ? `<span class="rk-badge" title="Network devices"><i class="fas fa-sitemap text-[10px]"></i> ${r.device_count}</span>` : ''}
                            <span class="rk-badge"><i class="fas fa-server text-[10px]"></i> ${r.server_count}</span>
                        </span>
                    </div>
                    <div class="text-xs text-text-muted mt-0.5 truncate">
                        <i class="fas fa-location-dot"></i> ${utils.escapeHtml(r.location || 'No location')}
                    </div>
                    <div class="rk-occ mt-2"><div class="rk-occ__fill" style="width:${pct}%"></div></div>
                    <div class="rk-mono text-[11px] text-text-muted mt-1">${r.used_u} / ${r.total_u}U used</div>
                </button>`;
        }).join('');
    }

    async selectRack(uuid) {
        this.selectedRackUuid = uuid;
        // Update active state without a full re-render
        this.el.list.querySelectorAll('[data-rack-uuid]').forEach(c => {
            c.classList.toggle('is-active', c.getAttribute('data-rack-uuid') === uuid);
        });
        await this.loadRackDetail(uuid);
    }

    async loadRackDetail(uuid) {
        this.el.elevation.innerHTML = this.spinner('Loading rack…');
        this.el.detailEmpty.classList.add('hidden');
        this.el.detail.classList.remove('hidden');

        const res = await rackAPI.getRack(uuid);
        if (!res || !res.success) {
            this.el.elevation.innerHTML = `<div class="text-center text-danger text-sm py-6">${utils.escapeHtml(res?.message || 'Failed to load rack')}</div>`;
            return;
        }

        this.currentRack = res.data.rack;
        this.currentServers = res.data.servers || [];
        // Absent until seeder 2026_09_03_003 has been run; the elevation then
        // renders exactly as it did before, with no enclosures to draw.
        this.currentEnclosures = res.data.enclosures || [];
        this.currentDevices = res.data.network_devices || [];
        this.renderToolbar();
        this.renderElevation();
    }

    showEmptyDetail() {
        this.currentRack = null;
        this.currentServers = [];
        this.currentEnclosures = [];
        this.currentDevices = [];
        this.el.detail.classList.add('hidden');
        this.el.detailEmpty.classList.remove('hidden');
    }

    /* ---------------- detail rendering ---------------- */

    renderToolbar() {
        const r = this.currentRack;
        this.el.name.textContent = r.name;
        this.el.location.innerHTML = `<i class="fas fa-location-dot"></i> ${utils.escapeHtml(r.location || 'No location')}`;
        this.el.occText.textContent = `${r.used_u} / ${r.total_u}U used`;
        const pct = r.total_u > 0 ? Math.min(100, Math.round((r.used_u / r.total_u) * 100)) : 0;
        this.el.occBar.style.width = `${pct}%`;
    }

    renderElevation() {
        const r = this.currentRack;
        const N = r.total_u;
        const topDown = r.numbering_top_down === 1;
        const servers = this.currentServers;
        const enclosures = this.currentEnclosures;
        const devices = this.currentDevices;

        // Map every covered U so we know which rows are empty. Enclosures count:
        // their U is occupied by the box whether or not any bay is filled, so a
        // "Place here" target must never appear on top of one.
        const covered = new Set();
        servers.forEach(s => {
            for (let u = s.start_u; u <= s.end_u; u++) covered.add(u);
        });
        enclosures.forEach(e => {
            for (let u = e.start_u; u <= e.end_u; u++) covered.add(u);
        });
        devices.forEach(d => {
            for (let u = d.start_u; u <= d.end_u; u++) covered.add(u);
        });

        // Vertical offset (in U rows from the top of the bay) for a given U number.
        const rowsFromTop = (u) => topDown ? (u - 1) : (N - u);
        // An entry covering `h` U whose visually-top U is `topU`: one pitch
        // (U + gap) per row, minus the trailing gap so neighbours never touch.
        const place = (topU, h) => `top:calc(${rowsFromTop(topU)} * var(--rk-pitch)); height:calc(${h} * var(--rk-pitch) - var(--rk-gap));`;
        const visualTop = (x) => topDown ? x.start_u : x.end_u;
        const uRange = (x) => x.u_height > 1 ? `U${x.start_u}–U${x.end_u}` : `U${x.start_u}`;
        // "ProLiant DL360 Gen9 (823840-B21)" -> "ProLiant DL360 Gen9": the part
        // number is noise at this size; the full name stays in the title.
        const shortModel = (name) => String(name || '').replace(/\s*\(.*\)\s*$/, '');

        // One U label per entry, at the entry's top row, as on a real rack.
        const labels = [];
        const label = (topU) => labels.push(
            `<span class="rk-ulabel rk-mono" style="top:calc(${rowsFromTop(topU)} * var(--rk-pitch));">U${topU}</span>`);

        // ---- empty slots ----
        const slots = [];
        for (let u = 1; u <= N; u++) {
            if (covered.has(u)) continue;
            label(u);
            slots.push(`
                <button type="button" class="rk-slot" data-u="${u}" style="${place(u, 1)}"
                    aria-label="Empty U${u}, place a server here">
                    <span class="rk-slot__hint rk-mono">place here</span>
                </button>`);
        }

        // ---- servers ----
        const sleds = servers.map(s => {
            label(visualTop(s));
            const statusClass = s.orphaned ? 'st-orphaned' : this.statusClass(s.configuration_status);
            const model = shortModel(s.chassis_name);
            const meta = [model, `${s.u_height}U`].filter(Boolean).join(' ');
            const title = `${s.server_name} · ${uRange(s)}${s.chassis_name ? ' · ' + s.chassis_name : ''} · ${s.orphaned ? 'Orphaned' : this.statusText(s.configuration_status)}`;
            return `
                <div class="rk-sled ${statusClass}" data-config-uuid="${utils.escapeHtml(s.config_uuid)}"
                    tabindex="0" role="button" style="${place(visualTop(s), s.u_height)}"
                    title="${utils.escapeHtml(title)}"
                    aria-label="${utils.escapeHtml(s.server_name)} at ${uRange(s)}, ${s.u_height}U">
                    <span class="rk-sled__led" aria-hidden="true"></span>
                    <span class="rk-sled__name rk-mono">${utils.escapeHtml(s.server_name)}</span>
                    <span class="rk-sled__meta rk-mono">${utils.escapeHtml(meta)}</span>
                </div>`;
        });

        // ---- network devices ----
        // Drawn with the server block's own markup and classes, so a switch reads
        // as the same kind of object; only the hue and the data attribute differ.
        const deviceBlocks = devices.map(d => {
            label(visualTop(d));
            const tag = d.serial_number || d.asset_tag || '';
            const kind = d.device_type ? ` (${d.device_type})` : '';
            const meta = [d.device_type, `${d.u_height}U`].filter(Boolean).join(' ');
            return `
                <div class="rk-sled st-device" data-device-id="${d.inventory_id}"
                    tabindex="0" role="button" style="${place(visualTop(d), d.u_height)}"
                    title="${utils.escapeHtml(`${d.model_name}${tag ? ' · ' + tag : ''} · ${uRange(d)}`)}"
                    aria-label="${utils.escapeHtml(d.model_name)}${utils.escapeHtml(kind)} at ${uRange(d)}, ${d.u_height}U">
                    <span class="rk-sled__led" aria-hidden="true"></span>
                    <span class="rk-sled__name rk-mono">${utils.escapeHtml(d.model_name)}</span>
                    <span class="rk-sled__meta rk-mono">${utils.escapeHtml(meta)}</span>
                </div>`;
        });

        // ---- enclosures ----
        // The bays are a CSS grid, so grid row-major order is the backend's
        // 1-based slot numbering: slot 1 is top-left, matching Dell's own FX2s
        // bay labelling.
        const enclosureFrames = enclosures.map(e => {
            label(visualTop(e));
            const bays = e.slots.map(slot => {
                if (!slot.occupied) {
                    return `
                        <button type="button" class="rk-encl__bay rk-mono" data-enclosure-uuid="${utils.escapeHtml(e.enclosure_uuid)}"
                            data-slot="${slot.slot_index}"
                            aria-label="Install a server in bay ${slot.slot_index} of ${utils.escapeHtml(e.name)}">
                            <span class="rk-slot__hint">bay ${slot.slot_index}</span>
                        </button>`;
                }
                const statusClass = slot.orphaned ? 'st-orphaned' : this.statusClass(slot.configuration_status);
                return `
                    <div class="rk-sled rk-sled--bay ${statusClass}" data-config-uuid="${utils.escapeHtml(slot.config_uuid)}"
                        tabindex="0" role="button" title="${utils.escapeHtml(`${slot.server_name} · bay ${slot.slot_index}`)}"
                        aria-label="${utils.escapeHtml(slot.server_name)} in bay ${slot.slot_index} of ${utils.escapeHtml(e.name)}">
                        <span class="rk-sled__led" aria-hidden="true"></span>
                        <span class="rk-sled__name rk-mono">${utils.escapeHtml(slot.server_name)}</span>
                    </div>`;
            }).join('');

            return `
                <div class="rk-encl" data-enclosure-uuid="${utils.escapeHtml(e.enclosure_uuid)}" style="${place(visualTop(e), e.u_height)}">
                    <button type="button" class="rk-encl__rail" data-enclosure-uuid="${utils.escapeHtml(e.enclosure_uuid)}"
                        title="${utils.escapeHtml(`${e.name} · ${e.model || 'enclosure'} · ${uRange(e)}`)}"
                        aria-label="${utils.escapeHtml(e.name)}, ${utils.escapeHtml(e.model || 'enclosure')}, ${uRange(e)}, ${e.slots_used} of ${e.slot_count} bays used">
                        <span class="rk-sled__led" aria-hidden="true"></span>
                        <span class="rk-encl__name rk-mono">${utils.escapeHtml(e.name)}</span>
                        <span class="rk-encl__meta rk-mono">${e.slots_used}/${e.slot_count} sleds</span>
                    </button>
                    <div class="rk-encl__bays"
                        style="grid-template-columns:repeat(${e.slot_cols},minmax(0,1fr));grid-template-rows:repeat(${e.slot_rows},minmax(0,1fr));">
                        ${bays}
                    </div>
                </div>`;
        });

        this.el.elevation.innerHTML = `
            <div class="rk-cabinet">
                <div class="rk-cabinet__plate">
                    <span class="rk-cabinet__name">${utils.escapeHtml(r.name)}</span>
                    <span class="rk-cabinet__meta rk-mono">${r.used_u} / ${N}U · ${r.free_u} free</span>
                </div>
                <div class="rk-rack">
                    <div class="rk-rail" aria-hidden="true"></div>
                    <div class="rk-grid" style="height:calc(${N} * var(--rk-pitch) - var(--rk-gap));">
                        ${labels.join('')}
                        ${slots.join('')}
                        ${sleds.join('')}
                        ${deviceBlocks.join('')}
                        ${enclosureFrames.join('')}
                    </div>
                    <div class="rk-rail" aria-hidden="true"></div>
                </div>
            </div>`;

        // Keyboard activation for sleds
        this.el.elevation.querySelectorAll('.rk-sled').forEach(sled => {
            sled.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.markSelected(sled);
                    if (sled.dataset.deviceId) { this.openDeviceActions(parseInt(sled.dataset.deviceId, 10)); }
                    else { this.openServerActions(sled.dataset.configUuid); }
                }
            });
        });
    }

    /* ---------------- modals: rack create/edit ---------------- */

    openRackForm(rack = null) {
        const isEdit = !!rack;
        const title = isEdit ? 'Edit rack' : 'New rack';
        const body = `
            <form id="rackForm" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-text-primary mb-1">Name <span class="text-danger">*</span></label>
                    <input id="rf_name" type="text" required maxlength="100" value="${isEdit ? utils.escapeHtml(rack.name) : ''}"
                        placeholder="e.g. RACK 683" class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium text-text-primary mb-1">Location</label>
                        <select id="rf_location_uuid" class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                            <option value="">Loading locations\u2026</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-text-primary mb-1">Floor / Room</label>
                        <input id="rf_floor" type="text" maxlength="50" value="${isEdit ? utils.escapeHtml(rack.floor || '') : ''}"
                            placeholder="e.g. 2 or DC-1" class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium text-text-primary mb-1">Height (U)</label>
                        <input id="rf_total_u" type="number" min="1" max="100" value="${isEdit ? rack.total_u : 42}"
                            class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-text-primary mb-1">Numbering</label>
                        <select id="rf_numbering" class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                            <option value="0" ${isEdit && rack.numbering_top_down === 1 ? '' : 'selected'}>U1 at bottom</option>
                            <option value="1" ${isEdit && rack.numbering_top_down === 1 ? 'selected' : ''}>U1 at top</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-text-primary mb-1">Notes</label>
                    <textarea id="rf_notes" rows="2" maxlength="500"
                        class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">${isEdit ? utils.escapeHtml(rack.notes || '') : ''}</textarea>
                </div>
                <div class="flex justify-end gap-2 pt-2">
                    <button type="button" id="rf_cancel" class="px-4 py-2 border border-border rounded-lg text-text-primary hover:bg-surface-hover">Cancel</button>
                    <button type="submit" class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-600">${isEdit ? 'Save changes' : 'Create rack'}</button>
                </div>
            </form>`;
        this.openModal(title, body);

        // Populated after the modal is in the DOM. Preselected by NAME rather
        // than uuid so a rack backfilled from the old free-text column still
        // opens on the right site even before it has a location_uuid.
        this.populateRackLocations(isEdit ? rack : null);

        document.getElementById('rf_cancel').addEventListener('click', () => this.closeModal());
        document.getElementById('rackForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitRackForm(isEdit ? rack.rack_uuid : null);
        });
    }

    /**
     * Fill the rack form's Location dropdown.
     *
     * A rack's location used to be typed by hand, which is why production held
     * both "Noida" and "Noida Yotta" as if they were different places. It is a
     * real reference now.
     *
     * Falls back to a disabled notice when no locations exist yet (the seeders
     * have not been run) so the rest of the form still works.
     */
    async populateRackLocations(rack) {
        const select = document.getElementById('rf_location_uuid');
        if (!select) return;

        if (!(window.api && api.locations)) {
            select.innerHTML = '<option value="">No locations available</option>';
            select.disabled = true;
            return;
        }

        let locations = [];
        try {
            const result = await api.locations.list();
            locations = (result?.success && result.data?.locations) || [];
        } catch (e) {
            locations = [];
        }

        if (!locations.length) {
            select.innerHTML = '<option value="">No locations available</option>';
            select.disabled = true;
            return;
        }

        // Match on uuid when the rack has one, else on the legacy text.
        const currentUuid = rack?.location_uuid || '';
        const currentName = rack?.location || '';

        select.innerHTML = '<option value="">-- No location --</option>' + locations.map(loc => {
            const selected = (currentUuid && loc.location_uuid === currentUuid)
                || (!currentUuid && currentName && loc.name === currentName);
            return `<option value="${utils.escapeHtml(loc.location_uuid)}"${selected ? ' selected' : ''}>${utils.escapeHtml(loc.name)}</option>`;
        }).join('');
        select.disabled = false;
    }

    async submitRackForm(rackUuid) {
        const name = document.getElementById('rf_name').value.trim();
        const locationUuid = document.getElementById('rf_location_uuid')?.value || '';
        const floor = document.getElementById('rf_floor')?.value.trim() || '';
        const totalU = parseInt(document.getElementById('rf_total_u').value, 10);
        const numberingTopDown = document.getElementById('rf_numbering').value === '1';
        const notes = document.getElementById('rf_notes').value.trim();

        if (!name) { toast.error('Rack name is required'); return; }
        if (!totalU || totalU < 1 || totalU > 100) { toast.error('Height must be between 1 and 100 U'); return; }

        let res;
        if (rackUuid) {
            res = await rackAPI.updateRack(rackUuid, { name, locationUuid, floor, totalU, numberingTopDown, notes });
        } else {
            res = await rackAPI.createRack({ name, locationUuid, floor, totalU, numberingTopDown, notes });
        }

        if (!res || !res.success) { toast.error(res?.message || 'Could not save rack'); return; }

        // Changing a rack's site re-stamps every server in it and every component
        // in those servers. Say how much moved -- it is a far bigger change than
        // editing a rack looks like.
        const resynced = res.data?.resynced;
        if (resynced && (resynced.configs > 0 || resynced.components > 0)) {
            toast.success(`Rack updated \u00b7 re-stamped ${resynced.configs} server(s) and ${resynced.components} component(s)`);
            this.closeModal();
            await this.loadRacks();
            return;
        }

        toast.success(rackUuid ? 'Rack updated' : 'Rack created');
        this.closeModal();
        if (!rackUuid && res.data?.rack_uuid) this.selectedRackUuid = res.data.rack_uuid;
        await this.loadRacks();
    }

    async deleteRack() {
        if (!this.currentRack) return;
        if (!confirm(`Delete rack "${this.currentRack.name}"? This can't be undone.`)) return;

        const res = await rackAPI.deleteRack(this.currentRack.rack_uuid);
        if (!res || !res.success) { toast.error(res?.message || 'Could not delete rack'); return; }

        toast.success('Rack deleted');
        this.selectedRackUuid = null;
        await this.loadRacks();
    }

    /* ---------------- modals: place / move / remove server ---------------- */

    async openPlaceServer(prefillStartU = null, lockedServer = null) {
        const isMove = !!lockedServer;
        this.openModal(isMove ? 'Move server' : 'Place server', this.spinner('Loading…'));

        let options = '';
        if (isMove) {
            options = `<option value="${utils.escapeHtml(lockedServer.config_uuid)}" data-h="${lockedServer.u_height}" selected>${utils.escapeHtml(lockedServer.server_name)}</option>`;
        } else {
            const res = await rackAPI.unassignedServers();
            if (!res || !res.success) { this.el.modalBody.innerHTML = `<p class="text-danger text-sm">${utils.escapeHtml(res?.message || 'Failed to load servers')}</p>`; return; }
            const servers = res.data?.servers || [];
            if (servers.length === 0) {
                this.el.modalBody.innerHTML = `
                    <div class="text-center py-6">
                        <i class="fas fa-circle-check text-3xl text-success mb-3"></i>
                        <p class="text-text-primary font-medium mb-1">Every server is already racked</p>
                        <p class="text-text-muted text-sm">Build a new server or remove one from its rack to place it here.</p>
                        <a href="servers.html" class="inline-block mt-3 text-primary text-sm font-medium hover:underline">Go to Servers</a>
                    </div>`;
                return;
            }
            options = '<option value="" disabled selected>Select a server…</option>' +
                servers.map(s => `<option value="${utils.escapeHtml(s.config_uuid)}" data-h="${s.u_height}">${utils.escapeHtml(s.server_name)} · ${s.u_height}U · ${utils.escapeHtml(s.status_text)}</option>`).join('');
        }

        const defaultHeight = lockedServer ? lockedServer.u_height : 1;
        const body = `
            <form id="placeForm" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-text-primary mb-1">Server</label>
                    <select id="pf_server" ${isMove ? 'disabled' : ''} required
                        class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                        ${options}
                    </select>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium text-text-primary mb-1">Start U</label>
                        <input id="pf_start" type="number" min="1" max="${this.currentRack.total_u}" value="${prefillStartU || ''}" required
                            class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-text-primary mb-1">Height (U)</label>
                        <input id="pf_height" type="number" min="1" max="${this.currentRack.total_u}" value="${defaultHeight}"
                            class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                    </div>
                </div>
                <p class="text-xs text-text-muted">Height defaults to the server's chassis size. Adjust if needed. It occupies <span id="pf_range" class="rk-mono"></span> in ${utils.escapeHtml(this.currentRack.name)}.</p>
                <div class="flex justify-end gap-2 pt-2">
                    <button type="button" id="pf_cancel" class="px-4 py-2 border border-border rounded-lg text-text-primary hover:bg-surface-hover">Cancel</button>
                    <button type="submit" class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-600">${isMove ? 'Move here' : 'Place server'}</button>
                </div>
            </form>`;
        this.el.modalBody.innerHTML = body;

        const serverSel = document.getElementById('pf_server');
        const startInput = document.getElementById('pf_start');
        const heightInput = document.getElementById('pf_height');
        const rangeLabel = document.getElementById('pf_range');

        const syncHeightFromServer = () => {
            const opt = serverSel.options[serverSel.selectedIndex];
            if (opt && opt.dataset.h && !isMove) heightInput.value = opt.dataset.h;
            updateRange();
        };
        const updateRange = () => {
            const start = parseInt(startInput.value, 10);
            const h = parseInt(heightInput.value, 10);
            if (start >= 1 && h >= 1) {
                rangeLabel.textContent = h > 1 ? `U${start}–U${start + h - 1}` : `U${start}`;
            } else {
                rangeLabel.textContent = '—';
            }
        };

        serverSel.addEventListener('change', syncHeightFromServer);
        startInput.addEventListener('input', updateRange);
        heightInput.addEventListener('input', updateRange);
        updateRange();

        document.getElementById('pf_cancel').addEventListener('click', () => this.closeModal());
        document.getElementById('placeForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitPlace(isMove ? lockedServer.config_uuid : serverSel.value);
        });
    }

    async submitPlace(configUuid) {
        const startU = parseInt(document.getElementById('pf_start').value, 10);
        const height = parseInt(document.getElementById('pf_height').value, 10);

        if (!configUuid) { toast.error('Select a server'); return; }
        if (!startU || startU < 1) { toast.error('Enter a valid start U'); return; }

        const res = await rackAPI.assignServer(this.selectedRackUuid, configUuid, startU, height || '');
        if (!res || !res.success) { toast.error(res?.message || 'Could not place server'); return; }

        toast.success(res.data?.moved ? 'Server moved' : 'Server placed');
        this.closeModal();
        await this.loadRackDetail(this.selectedRackUuid);
        await this.refreshRackOccupancy();
    }

    /**
     * A placed server by config uuid, whether it sits directly in the rack or in
     * an enclosure bay. A sled is normalised into the same shape as a direct
     * server — plus `enclosure` and `slot_index` — so the actions modal below
     * does not need two versions of itself.
     */
    findPlacedServer(configUuid) {
        const direct = this.currentServers.find(x => x.config_uuid === configUuid);
        if (direct) return direct;

        for (const e of this.currentEnclosures) {
            const slot = e.slots.find(sl => sl.occupied && sl.config_uuid === configUuid);
            if (slot) {
                return {
                    config_uuid: slot.config_uuid,
                    server_name: slot.server_name,
                    configuration_status: slot.configuration_status,
                    status_text: this.statusText(slot.configuration_status),
                    chassis_name: slot.chassis_name,
                    orphaned: slot.orphaned,
                    // A sled's U range is its enclosure's — it does not own one.
                    start_u: e.start_u,
                    end_u: e.end_u,
                    u_height: e.u_height,
                    enclosure: e,
                    slot_index: slot.slot_index,
                };
            }
        }
        return null;
    }

    openServerActions(configUuid) {
        const s = this.findPlacedServer(configUuid);
        if (!s) return;
        const uRange = s.u_height > 1 ? `U${s.start_u}–U${s.end_u}` : `U${s.start_u}`;
        const uLabel = s.enclosure ? `${uRange} · ${s.enclosure.name} bay ${s.slot_index}` : uRange;
        const builderHref = `../server/builder.html?config=${encodeURIComponent(s.config_uuid)}`;

        const body = `
            <div class="space-y-4">
                <div class="flex items-start gap-3">
                    <span class="rk-sled__led ${s.orphaned ? 'st-orphaned' : this.statusClass(s.configuration_status)}" style="margin-top:6px"></span>
                    <div class="min-w-0">
                        <p class="font-semibold text-text-primary break-words">${utils.escapeHtml(s.server_name)}</p>
                        <p class="text-sm text-text-muted rk-mono">${uLabel} · ${s.u_height}U · ${utils.escapeHtml(s.status_text)}</p>
                        ${s.chassis_name ? `<p class="text-xs text-text-muted mt-0.5">${utils.escapeHtml(s.chassis_name)}</p>` : ''}
                    </div>
                </div>
                <div class="grid grid-cols-1 gap-2 pt-1">
                    ${s.orphaned ? '' : `<a href="${builderHref}" class="w-full px-4 py-2 border border-border rounded-lg text-text-primary hover:bg-surface-hover flex items-center gap-2"><i class="fas fa-wrench"></i> Open in builder</a>`}
                    ${s.enclosure ? `<button id="sa_bay" class="w-full px-4 py-2 border border-border rounded-lg text-text-primary hover:bg-surface-hover flex items-center gap-2"><i class="fas fa-grip"></i> Move to another bay</button>` : ''}
                    <button id="sa_move" class="w-full px-4 py-2 border border-border rounded-lg text-text-primary hover:bg-surface-hover flex items-center gap-2"><i class="fas fa-arrows-up-down"></i> ${s.enclosure ? 'Move into the rack directly' : 'Move to another position'}</button>
                    <button id="sa_remove" class="w-full px-4 py-2 border border-danger/40 text-danger rounded-lg hover:bg-danger/10 flex items-center gap-2"><i class="fas fa-trash"></i> Remove from rack</button>
                </div>
            </div>`;
        this.openModal('Server', body);

        document.getElementById('sa_bay')?.addEventListener('click', () => {
            this.openMoveToBay(s);
        });
        document.getElementById('sa_move').addEventListener('click', async () => {
            if (!s.enclosure) {
                this.openPlaceServer(s.start_u, {
                    config_uuid: s.config_uuid, server_name: s.server_name, u_height: s.u_height,
                });
                return;
            }
            // A sled has no U of its own and its u_height is the enclosure's, so
            // neither is a sensible default for a direct placement. Ask the
            // backend what this server would actually occupy on its own.
            const res = await rackAPI.placement(s.config_uuid);
            const needed = (res && res.success && res.data?.required_u_height) || 1;
            this.openPlaceServer(null, {
                config_uuid: s.config_uuid, server_name: s.server_name, u_height: needed,
            });
        });
        document.getElementById('sa_remove').addEventListener('click', () => this.removeServer(s));
    }

    async removeServer(s) {
        if (!confirm(`Remove "${s.server_name}" from ${this.currentRack.name}?`)) return;
        const res = await rackAPI.unassignServer(s.config_uuid);
        if (!res || !res.success) { toast.error(res?.message || 'Could not remove server'); return; }
        toast.success('Server removed from rack');
        this.closeModal();
        await this.loadRackDetail(this.selectedRackUuid);
        await this.refreshRackOccupancy();
    }

    /** Refresh just the rack list occupancy numbers without losing selection. */
    async refreshRackOccupancy() {
        const res = await rackAPI.listRacks();
        if (res && res.success) {
            this.racks = res.data?.racks || [];
            this.el.countChip.textContent = this.racks.length;
            this.renderRackList();
        }
    }


    /* ---------------- modals: network devices ---------------- */

    /**
     * Rack a network device, or (with lockedDevice) move one that is already racked.
     *
     * The list is available stock at ANY site, same-site units first. Racking a unit
     * from another site is allowed -- the rack decides where it is -- and the dialog
     * says so plainly, because it is a site change as well as a placement.
     */
    async openPlaceDevice(prefillStartU = null, lockedDevice = null) {
        if (!this.currentRack) return;
        const isMove = !!lockedDevice;
        this.openModal(isMove ? 'Move network device' : 'Place network device', this.spinner('Loading…'));

        let options = '';
        let devices = [];
        if (isMove) {
            options = `<option value="${lockedDevice.inventory_id}" data-h="${lockedDevice.u_height}" selected>${utils.escapeHtml(lockedDevice.model_name)}${lockedDevice.serial_number ? ' · ' + utils.escapeHtml(lockedDevice.serial_number) : ''}</option>`;
        } else {
            const res = await rackAPI.placeableDevices(this.currentRack.rack_uuid);
            if (!res || !res.success) {
                this.el.modalBody.innerHTML = `<p class="text-danger text-sm">${utils.escapeHtml(res?.message || 'Failed to load network devices')}</p>`;
                return;
            }
            devices = res.data?.devices || [];
            if (devices.length === 0) {
                this.el.modalBody.innerHTML = `
                    <div class="text-center py-6">
                        <i class="fas fa-sitemap text-3xl text-text-muted mb-3"></i>
                        <p class="text-text-primary font-medium mb-1">No network devices in stock</p>
                        <p class="text-text-muted text-sm">Add the router, switch or MUX to inventory first, then rack it here.</p>
                        <a href="component.html?type=networkdevice" class="inline-block mt-3 text-primary text-sm font-medium hover:underline">Go to Network Devices</a>
                    </div>`;
                return;
            }
            options = '<option value="" disabled selected>Select a device…</option>' + devices.map(d => {
                const where = d.location_name ? ` · ${d.location_name}` : '';
                const size = d.u_height ? `${d.u_height}U` : 'no rack height';
                const label = `${d.model_name}${d.serial_number ? ' · ' + d.serial_number : (d.asset_tag ? ' · ' + d.asset_tag : '')} · ${size}${where}`;
                return `<option value="${d.inventory_id}" data-h="${d.u_height || ''}" data-site="${utils.escapeHtml(d.location_name || '')}" data-same="${d.same_site ? '1' : '0'}">${utils.escapeHtml(label)}</option>`;
            }).join('');
        }

        this.el.modalBody.innerHTML = `
            <form id="deviceForm" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-text-primary mb-1">Device</label>
                    <select id="df_device" ${isMove ? 'disabled' : ''} required
                        class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                        ${options}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-text-primary mb-1">Start U</label>
                    <input id="df_start" type="number" min="1" max="${this.currentRack.total_u}" value="${prefillStartU || ''}" required
                        class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                </div>
                <p class="text-xs text-text-muted">Its height comes from the catalogue. It occupies <span id="df_range" class="rk-mono">—</span> in ${utils.escapeHtml(this.currentRack.name)}.</p>
                <p id="df_note" class="text-xs text-warning hidden"></p>
                <div class="flex justify-end gap-2 pt-2">
                    <button type="button" id="df_cancel" class="px-4 py-2 border border-border rounded-lg text-text-primary hover:bg-surface-hover">Cancel</button>
                    <button type="submit" id="df_submit" class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-600">${isMove ? 'Move here' : 'Place device'}</button>
                </div>
            </form>`;

        const sel = document.getElementById('df_device');
        const startInput = document.getElementById('df_start');
        const rangeLabel = document.getElementById('df_range');
        const note = document.getElementById('df_note');
        const submit = document.getElementById('df_submit');
        const rackSite = this.currentRack.location_name || this.currentRack.location || 'this rack\'s site';

        const refresh = () => {
            const opt = sel.options[sel.selectedIndex];
            const h = opt && opt.dataset.h ? parseInt(opt.dataset.h, 10) : NaN;
            const start = parseInt(startInput.value, 10);
            rangeLabel.textContent = (start >= 1 && h >= 1)
                ? (h > 1 ? `U${start}–U${start + h - 1}` : `U${start}`)
                : '—';

            let msg = '';
            if (opt && opt.value && !(h >= 1)) {
                msg = 'This model has no rack height in the catalogue, so it cannot be placed yet.';
            } else if (!isMove && opt && opt.dataset.same === '0' && opt.dataset.site) {
                msg = `This device is at ${opt.dataset.site}. Racking it here moves it to ${rackSite}.`;
            }
            note.textContent = msg;
            note.classList.toggle('hidden', msg === '');
            submit.disabled = !!(opt && opt.value && !(h >= 1));
        };
        sel.addEventListener('change', refresh);
        startInput.addEventListener('input', refresh);
        refresh();

        document.getElementById('df_cancel').addEventListener('click', () => this.closeModal());
        document.getElementById('deviceForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const inventoryId = isMove ? lockedDevice.inventory_id : parseInt(sel.value, 10);
            const startU = parseInt(startInput.value, 10);
            if (!inventoryId) { toast.error('Select a device'); return; }
            if (!startU || startU < 1) { toast.error('Enter a valid start U'); return; }

            const res = await rackAPI.assignDevice(this.currentRack.rack_uuid, inventoryId, startU);
            if (!res || !res.success) { toast.error(res?.message || 'Could not place the device'); return; }

            toast.success(res.data?.moved === false ? 'Nothing changed' : (isMove ? 'Device moved' : 'Device placed'));
            this.closeModal();
            await this.loadRackDetail(this.selectedRackUuid);
            await this.refreshRackOccupancy();
        });
    }

    /** What can be done with one racked device: move it, take it out, or open its record. */
    openDeviceActions(inventoryId) {
        const d = this.currentDevices.find(x => x.inventory_id === inventoryId);
        if (!d) return;
        const uLabel = d.u_height > 1 ? `U${d.start_u}–U${d.end_u}` : `U${d.start_u}`;

        this.openModal('Network device', `
            <div class="space-y-4">
                <div class="flex items-start gap-3">
                    <span class="rk-sled__led st-device" style="margin-top:6px"></span>
                    <div class="min-w-0">
                        <p class="font-semibold text-text-primary break-words">${utils.escapeHtml(d.model_name)}</p>
                        <p class="text-sm text-text-muted rk-mono">${uLabel} · ${d.u_height}U${d.device_type ? ' · ' + utils.escapeHtml(d.device_type) : ''}</p>
                        ${d.serial_number ? `<p class="text-xs text-text-muted rk-mono mt-0.5">Serial ${utils.escapeHtml(d.serial_number)}</p>` : ''}
                        ${d.asset_tag ? `<p class="text-xs text-text-muted rk-mono mt-0.5">${utils.escapeHtml(d.asset_tag)}</p>` : ''}
                    </div>
                </div>
                <div class="grid grid-cols-1 gap-2 pt-1">
                    <a href="component.html?type=networkdevice" class="w-full px-4 py-2 border border-border rounded-lg text-text-primary hover:bg-surface-hover flex items-center gap-2"><i class="fas fa-list"></i> Open in inventory</a>
                    <button id="da_move" class="w-full px-4 py-2 border border-border rounded-lg text-text-primary hover:bg-surface-hover flex items-center gap-2"><i class="fas fa-arrows-up-down"></i> Move to another position</button>
                    <button id="da_remove" class="w-full px-4 py-2 border border-danger/40 text-danger rounded-lg hover:bg-danger/10 flex items-center gap-2"><i class="fas fa-trash"></i> Remove from rack</button>
                </div>
            </div>`);

        document.getElementById('da_move').addEventListener('click', () => this.openPlaceDevice(d.start_u, d));
        document.getElementById('da_remove').addEventListener('click', async () => {
            if (!confirm(`Remove ${d.model_name} from ${this.currentRack.name}? It stays at the same site, back in stock.`)) return;
            const res = await rackAPI.unassignDevice(d.inventory_id);
            if (!res || !res.success) { toast.error(res?.message || 'Could not remove the device'); return; }
            toast.success('Device removed from rack');
            this.closeModal();
            await this.loadRackDetail(this.selectedRackUuid);
            await this.refreshRackOccupancy();
        });
    }

    /* ---------------- modals: enclosures and bays ---------------- */

    /**
     * Install a blade enclosure in the current rack.
     *
     * The model list comes from ims-data, which has no deploy watcher — so an
     * empty list is an expected state with a real explanation, not a failure.
     */
    async openEnclosureForm() {
        if (!this.currentRack) return;
        this.openModal('Add enclosure', this.spinner('Loading enclosure models…'));

        const res = await rackAPI.enclosureModels();
        if (!res || !res.success) {
            this.el.modalBody.innerHTML = `<p class="text-danger text-sm">${utils.escapeHtml(res?.message || 'Failed to load enclosure models')}</p>`;
            return;
        }

        const models = res.data?.models || [];
        if (models.length === 0) {
            this.el.modalBody.innerHTML = `
                <div class="text-center py-6">
                    <i class="fas fa-layer-group text-3xl text-text-muted mb-3"></i>
                    <p class="text-text-primary font-medium mb-1">No enclosure models available</p>
                    <p class="text-text-muted text-sm">The component catalog has no chassis that declares bays yet.</p>
                </div>`;
            return;
        }

        const options = '<option value="" disabled selected>Select a model…</option>' +
            models.map(m => `<option value="${utils.escapeHtml(m.chassis_uuid)}" data-h="${m.u_height}" data-slots="${m.slot_count}">${utils.escapeHtml(m.model)} · ${m.u_height}U · ${m.slot_count} bays</option>`).join('');

        this.el.modalBody.innerHTML = `
            <form id="enclForm" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-text-primary mb-1">Model</label>
                    <select id="ef_model" required
                        class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                        ${options}
                    </select>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium text-text-primary mb-1">Name</label>
                        <input id="ef_name" type="text" maxlength="100" required placeholder="FX2S-01"
                            class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-text-primary mb-1">Start U</label>
                        <input id="ef_start" type="number" min="1" max="${this.currentRack.total_u}" required
                            class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-text-primary mb-1">Service tag <span class="text-text-muted font-normal">(optional)</span></label>
                    <input id="ef_serial" type="text" maxlength="50"
                        class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                </div>
                <p class="text-xs text-text-muted">It occupies <span id="ef_range" class="rk-mono">—</span> in ${utils.escapeHtml(this.currentRack.name)}, and holds <span id="ef_bays">—</span> servers. Install servers into its bays afterwards.</p>
                <div class="flex justify-end gap-2 pt-2">
                    <button type="button" id="ef_cancel" class="px-4 py-2 border border-border rounded-lg text-text-primary hover:bg-surface-hover">Cancel</button>
                    <button type="submit" class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-600">Add enclosure</button>
                </div>
            </form>`;

        const modelSel = document.getElementById('ef_model');
        const startInput = document.getElementById('ef_start');
        const rangeLabel = document.getElementById('ef_range');
        const baysLabel = document.getElementById('ef_bays');

        const updateRange = () => {
            const opt = modelSel.options[modelSel.selectedIndex];
            const h = opt ? parseInt(opt.dataset.h, 10) : NaN;
            const start = parseInt(startInput.value, 10);
            baysLabel.textContent = (opt && opt.dataset.slots) ? opt.dataset.slots : '—';
            rangeLabel.textContent = (start >= 1 && h >= 1)
                ? (h > 1 ? `U${start}–U${start + h - 1}` : `U${start}`)
                : '—';
        };
        modelSel.addEventListener('change', updateRange);
        startInput.addEventListener('input', updateRange);
        updateRange();

        document.getElementById('ef_cancel').addEventListener('click', () => this.closeModal());
        document.getElementById('enclForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const res2 = await rackAPI.addEnclosure(this.currentRack.rack_uuid, {
                name: document.getElementById('ef_name').value.trim(),
                chassisUuid: modelSel.value,
                startU: parseInt(startInput.value, 10),
                serialNumber: document.getElementById('ef_serial').value.trim(),
            });
            if (!res2 || !res2.success) { toast.error(res2?.message || 'Could not add the enclosure'); return; }
            toast.success(res2.message || 'Enclosure added');
            this.closeModal();
            await this.loadRackDetail(this.selectedRackUuid);
            await this.refreshRackOccupancy();
        });
    }

    /**
     * The bay roster: what is actually inside this enclosure.
     *
     * The one place that answers "what is in this FX2s" without clicking each
     * bay in turn — every bay in slot order, filled or not, with the server's
     * status, how many components are installed in it, and a way straight into
     * the builder or into filling the bay.
     */
    renderEnclosureRoster(e) {
        const rows = e.slots.map(slot => {
            if (!slot.occupied) {
                return `
                    <li class="rk-roster__row flex items-center gap-3 px-3 py-2">
                        <span class="rk-mono text-xs text-text-muted w-8 shrink-0">B${slot.slot_index}</span>
                        <span class="flex-1 min-w-0 text-sm text-text-muted italic">Empty</span>
                        <button type="button" class="rk-roster__fill rk-roster__link text-primary text-xs font-medium shrink-0"
                            data-slot="${slot.slot_index}">Install</button>
                    </li>`;
            }

            const builderHref = `../server/builder.html?config=${encodeURIComponent(slot.config_uuid)}`;
            // null means the count could not be taken, which is not the same as
            // a server with nothing in it.
            const count = (slot.component_count === null || slot.component_count === undefined)
                ? 'components unknown'
                : `${slot.component_count} component${slot.component_count === 1 ? '' : 's'}`;

            return `
                <li class="rk-roster__row flex items-center gap-3 px-3 py-2">
                    <span class="rk-mono text-xs text-text-muted w-8 shrink-0">B${slot.slot_index}</span>
                    <span class="rk-sled__led ${slot.orphaned ? 'st-orphaned' : this.statusClass(slot.configuration_status)} shrink-0"></span>
                    <span class="flex-1 min-w-0">
                        <span class="block text-sm text-text-primary truncate">${utils.escapeHtml(slot.server_name)}</span>
                        <span class="block text-xs text-text-muted">${utils.escapeHtml(this.statusText(slot.configuration_status))} · ${utils.escapeHtml(count)}</span>
                    </span>
                    ${slot.orphaned ? '' : `<a href="${builderHref}" class="rk-roster__link text-primary text-xs font-medium shrink-0">Open</a>`}
                </li>`;
        }).join('');

        return `
            <div>
                <p class="text-sm font-medium text-text-primary mb-2">Bays</p>
                <ul class="border border-border rounded-lg overflow-hidden">${rows}</ul>
            </div>`;
    }

    /** Rename / re-tag / move / remove one enclosure. */
    openEnclosureActions(enclosureUuid) {
        const e = this.currentEnclosures.find(x => x.enclosure_uuid === enclosureUuid);
        if (!e) return;
        const uLabel = e.u_height > 1 ? `U${e.start_u}–U${e.end_u}` : `U${e.start_u}`;

        this.openModal('Enclosure', `
            <div class="space-y-4">
                <div>
                    <p class="font-semibold text-text-primary break-words">${utils.escapeHtml(e.name)}</p>
                    <p class="text-sm text-text-muted rk-mono">${uLabel} · ${e.u_height}U · ${e.slots_used}/${e.slot_count} bays used</p>
                    ${e.model ? `<p class="text-xs text-text-muted mt-0.5">${utils.escapeHtml(e.model)}</p>` : ''}
                    ${e.serial_number ? `<p class="text-xs text-text-muted rk-mono mt-0.5">Service tag ${utils.escapeHtml(e.serial_number)}</p>` : ''}
                </div>
                ${this.renderEnclosureRoster(e)}
                <form id="enclEditForm" class="space-y-3">
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm font-medium text-text-primary mb-1">Name</label>
                            <input id="ee_name" type="text" maxlength="100" required value="${utils.escapeHtml(e.name)}"
                                class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-text-primary mb-1">Start U</label>
                            <input id="ee_start" type="number" min="1" max="${this.currentRack.total_u}" required value="${e.start_u}"
                                class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-text-primary mb-1">Service tag</label>
                        <input id="ee_serial" type="text" maxlength="50" value="${utils.escapeHtml(e.serial_number || '')}"
                            class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                    </div>
                    ${e.slots_used > 0 ? `<p class="text-xs text-text-muted"><i class="fas fa-circle-info mr-1"></i>Moving this enclosure moves the ${e.slots_used} server(s) in it, and every component inside them.</p>` : ''}
                    <div class="flex justify-end gap-2 pt-1">
                        <button type="button" id="ee_cancel" class="px-4 py-2 border border-border rounded-lg text-text-primary hover:bg-surface-hover">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-600">Save</button>
                    </div>
                </form>
                <button id="ee_remove" class="w-full px-4 py-2 border border-danger/40 text-danger rounded-lg hover:bg-danger/10 flex items-center gap-2"><i class="fas fa-trash"></i> Remove enclosure from rack</button>
            </div>`);

        // Roster "Install" on an empty bay — same dialog the bay tile opens.
        this.el.modalBody.querySelectorAll('.rk-roster__fill').forEach(btn => {
            btn.addEventListener('click', () => {
                this.openPlaceInBay(e.enclosure_uuid, parseInt(btn.dataset.slot, 10));
            });
        });

        document.getElementById('ee_cancel').addEventListener('click', () => this.closeModal());
        document.getElementById('enclEditForm').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const res = await rackAPI.updateEnclosure(e.enclosure_uuid, {
                name: document.getElementById('ee_name').value.trim(),
                serialNumber: document.getElementById('ee_serial').value.trim(),
                startU: parseInt(document.getElementById('ee_start').value, 10),
            });
            if (!res || !res.success) { toast.error(res?.message || 'Could not update the enclosure'); return; }
            toast.success(res.message || 'Enclosure updated');
            this.closeModal();
            await this.loadRackDetail(this.selectedRackUuid);
            await this.refreshRackOccupancy();
        });
        document.getElementById('ee_remove').addEventListener('click', () => this.removeEnclosure(e));
    }

    async removeEnclosure(e) {
        if (!confirm(`Remove enclosure "${e.name}" from ${this.currentRack.name}?`)) return;
        const res = await rackAPI.removeEnclosure(e.enclosure_uuid);
        if (!res || !res.success) { toast.error(res?.message || 'Could not remove the enclosure'); return; }
        toast.success(res.message || 'Enclosure removed');
        this.closeModal();
        await this.loadRackDetail(this.selectedRackUuid);
        await this.refreshRackOccupancy();
    }

    /**
     * Install an unracked server into one bay.
     *
     * No U and no height are asked for: the enclosure already has both, and
     * offering them would invite a choice the backend is going to ignore.
     */
    async openPlaceInBay(enclosureUuid, slotIndex) {
        const e = this.currentEnclosures.find(x => x.enclosure_uuid === enclosureUuid);
        if (!e) return;

        this.openModal(`Install in ${e.name} bay ${slotIndex}`, this.spinner('Loading…'));

        // Racked servers are offered too, grouped separately and labelled with
        // where they are now. Restricting this to unracked servers made the bays
        // unfillable in an estate where everything is already in a rack, even
        // though moving a server from a U into a bay is an ordinary move the
        // backend already validates and performs.
        const res = await rackAPI.placeableServers();
        if (!res || !res.success) {
            this.el.modalBody.innerHTML = `<p class="text-danger text-sm">${utils.escapeHtml(res?.message || 'Failed to load servers')}</p>`;
            return;
        }

        const servers = res.data?.servers || [];
        if (servers.length === 0) {
            this.el.modalBody.innerHTML = `
                <div class="text-center py-6">
                    <i class="fas fa-server text-3xl text-text-muted mb-3"></i>
                    <p class="text-text-primary font-medium mb-1">No servers exist yet</p>
                    <p class="text-text-muted text-sm">Build a server first, then install it into this bay.</p>
                    <a href="servers.html" class="inline-block mt-3 text-primary text-sm font-medium hover:underline">Go to Servers</a>
                </div>`;
            return;
        }

        const free = servers.filter(s => !s.is_racked);
        const placed = servers.filter(s => s.is_racked);
        const opt = (s, suffix) =>
            `<option value="${utils.escapeHtml(s.config_uuid)}">${utils.escapeHtml(s.server_name)} · ${utils.escapeHtml(s.status_text)}${suffix}</option>`;

        const options = '<option value="" disabled selected>Select a server…</option>'
            + (free.length ? `<optgroup label="Not in a rack">${free.map(s => opt(s, '')).join('')}</optgroup>` : '')
            + (placed.length ? `<optgroup label="Already placed — will be moved here">${
                placed.map(s => opt(s, ` · now at ${s.current_position || 'a rack'}`)).join('')
              }</optgroup>` : '');

        this.el.modalBody.innerHTML = `
            <form id="bayForm" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-text-primary mb-1">Server</label>
                    <select id="bf_server" required
                        class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                        ${options}
                    </select>
                </div>
                <p class="text-xs text-text-muted">Goes into bay ${slotIndex} of ${utils.escapeHtml(e.name)}, which occupies ${e.u_height > 1 ? `U${e.start_u}–U${e.end_u}` : `U${e.start_u}`} of ${utils.escapeHtml(this.currentRack.name)}. The bay decides the position — there is no separate U to choose.</p>
                <div class="flex justify-end gap-2 pt-2">
                    <button type="button" id="bf_cancel" class="px-4 py-2 border border-border rounded-lg text-text-primary hover:bg-surface-hover">Cancel</button>
                    <button type="submit" class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-600">Install here</button>
                </div>
            </form>`;

        document.getElementById('bf_cancel').addEventListener('click', () => this.closeModal());
        document.getElementById('bayForm').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            await this.submitBayPlacement(enclosureUuid, document.getElementById('bf_server').value, slotIndex);
        });
    }

    /** Move a server already in a bay to a different free bay of any enclosure. */
    async openMoveToBay(s) {
        // Every free bay in this rack, plus the one the server is in now, which
        // is listed as its current position rather than offered as a target.
        const choices = [];
        this.currentEnclosures.forEach(e => {
            e.slots.forEach(slot => {
                if (!slot.occupied) {
                    choices.push({ enclosure: e, slotIndex: slot.slot_index });
                }
            });
        });

        if (choices.length === 0) {
            this.openModal('Move to another bay', `
                <div class="text-center py-6">
                    <i class="fas fa-layer-group text-3xl text-text-muted mb-3"></i>
                    <p class="text-text-primary font-medium mb-1">No free bays in ${utils.escapeHtml(this.currentRack.name)}</p>
                    <p class="text-text-muted text-sm">Every enclosure in this rack is full. Add an enclosure, or free a bay first.</p>
                </div>`);
            return;
        }

        const options = '<option value="" disabled selected>Select a bay…</option>' +
            choices.map(c => `<option value="${utils.escapeHtml(c.enclosure.enclosure_uuid)}|${c.slotIndex}">${utils.escapeHtml(c.enclosure.name)} · bay ${c.slotIndex}</option>`).join('');

        this.openModal('Move to another bay', `
            <form id="moveBayForm" class="space-y-4">
                <p class="text-sm text-text-muted">${utils.escapeHtml(s.server_name)} is in ${utils.escapeHtml(s.enclosure.name)} bay ${s.slot_index}.</p>
                <div>
                    <label class="block text-sm font-medium text-text-primary mb-1">Move to</label>
                    <select id="mb_target" required
                        class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                        ${options}
                    </select>
                </div>
                <div class="flex justify-end gap-2 pt-2">
                    <button type="button" id="mb_cancel" class="px-4 py-2 border border-border rounded-lg text-text-primary hover:bg-surface-hover">Cancel</button>
                    <button type="submit" class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-600">Move here</button>
                </div>
            </form>`);

        document.getElementById('mb_cancel').addEventListener('click', () => this.closeModal());
        document.getElementById('moveBayForm').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const [enclosureUuid, slot] = document.getElementById('mb_target').value.split('|');
            await this.submitBayPlacement(enclosureUuid, s.config_uuid, parseInt(slot, 10));
        });
    }

    async submitBayPlacement(enclosureUuid, configUuid, slotIndex) {
        if (!configUuid) { toast.error('Select a server'); return; }

        const res = await rackAPI.assignServerToSlot(enclosureUuid, configUuid, slotIndex);
        if (!res || !res.success) { toast.error(res?.message || 'Could not install the server'); return; }

        toast.success(res.message || 'Server installed');
        this.closeModal();
        await this.loadRackDetail(this.selectedRackUuid);
        await this.refreshRackOccupancy();
    }

    /* ---------------- modal + utils ---------------- */

    openModal(title, bodyHtml) {
        this.el.modalTitle.textContent = title;
        this.el.modalBody.innerHTML = bodyHtml;
        this.el.modal.classList.remove('hidden');
    }

    closeModal() {
        this.el.modal?.classList.add('hidden');
        this.markSelected(null);
    }

    /** Outline the unit whose actions are open; null clears it. */
    markSelected(el) {
        this.el.elevation?.querySelectorAll('.is-selected').forEach(x => x.classList.remove('is-selected'));
        if (el) el.classList.add('is-selected');
    }

    statusClass(status) {
        return { 0: 'st-draft', 1: 'st-validated', 2: 'st-built', 3: 'st-finalized' }[status] || 'st-draft';
    }

    // Mirrors rackConfigStatusText() in the backend. Direct servers arrive with
    // status_text already resolved; a sled carries only the numeric status.
    statusText(status) {
        return { 0: 'Draft', 1: 'Validated', 2: 'Building', 3: 'Finalized' }[status] || 'Unknown';
    }

    spinner(label) {
        return `<div class="text-center py-8 text-text-muted text-sm"><i class="fas fa-spinner fa-spin mr-2"></i>${utils.escapeHtml(label)}</div>`;
    }
}

// Initialize
const rackView = new RackView();
window.rackView = rackView;
document.addEventListener('DOMContentLoaded', () => rackView.init());
