/**
 * RackView — Rack View page controller.
 * Renders the rack list + true-to-scale U-slot elevation, and drives
 * create/edit/delete rack and place/move/remove server actions.
 */
class RackView {
    constructor() {
        this.loginURL = window.BDC_CONFIG?.FRONTEND_LOGIN_URL || 'https://ims.bdcms.bharatdatacenter.com/Ims_frontend/';
        this.racks = [];
        this.selectedRackUuid = null;
        this.currentRack = null;
        this.currentServers = [];
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
        const token = localStorage.getItem('bdc_token') || sessionStorage.getItem('bdc_token');
        if (!token) {
            window.location.href = this.loginURL;
            return false;
        }

        // Rack View is restricted to super_admin (UI guard; API enforces server-side).
        if (!(window.api && window.api.utils && window.api.utils.hasRole('super_admin'))) {
            if (window.toast) toast.error('You do not have access to Rack View.');
            window.location.href = 'index.html';
            return false;
        }
        return true;
    }

    bindStaticEvents() {
        document.getElementById('newRackBtn')?.addEventListener('click', () => this.openRackForm());
        document.getElementById('placeServerBtn')?.addEventListener('click', () => this.openPlaceServer());
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

        // Elevation — event delegation for sleds and empty slots
        this.el.elevation?.addEventListener('click', (e) => {
            const sled = e.target.closest('.rk-sled');
            if (sled && sled.dataset.configUuid) { this.openServerActions(sled.dataset.configUuid); return; }
            const slot = e.target.closest('.rk-slot');
            if (slot && slot.dataset.u) this.openPlaceServer(parseInt(slot.dataset.u, 10));
        });
    }

    /* ---------------- data loading ---------------- */

    async loadRacks() {
        this.el.list.innerHTML = this.spinner('Loading racks…');
        const res = await rackAPI.listRacks();

        if (!res || !res.success) {
            this.el.list.innerHTML = `<div class="text-center text-danger text-sm py-6">${this.esc(res?.message || 'Failed to load racks')}</div>`;
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
                <button type="button" class="rk-rackcard${active}" data-rack-uuid="${this.esc(r.rack_uuid)}">
                    <div class="flex items-center justify-between gap-2">
                        <span class="font-semibold text-text-primary truncate">${this.esc(r.name)}</span>
                        <span class="rk-badge"><i class="fas fa-server text-[10px]"></i> ${r.server_count}</span>
                    </div>
                    <div class="text-xs text-text-muted mt-0.5 truncate">
                        <i class="fas fa-location-dot"></i> ${this.esc(r.location || 'No location')}
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
            this.el.elevation.innerHTML = `<div class="text-center text-danger text-sm py-6">${this.esc(res?.message || 'Failed to load rack')}</div>`;
            return;
        }

        this.currentRack = res.data.rack;
        this.currentServers = res.data.servers || [];
        this.renderToolbar();
        this.renderElevation();
    }

    showEmptyDetail() {
        this.currentRack = null;
        this.currentServers = [];
        this.el.detail.classList.add('hidden');
        this.el.detailEmpty.classList.remove('hidden');
    }

    /* ---------------- detail rendering ---------------- */

    renderToolbar() {
        const r = this.currentRack;
        this.el.name.textContent = r.name;
        this.el.location.innerHTML = `<i class="fas fa-location-dot"></i> ${this.esc(r.location || 'No location')}`;
        this.el.occText.textContent = `${r.used_u} / ${r.total_u}U used`;
        const pct = r.total_u > 0 ? Math.min(100, Math.round((r.used_u / r.total_u) * 100)) : 0;
        this.el.occBar.style.width = `${pct}%`;
    }

    renderElevation() {
        const r = this.currentRack;
        const N = r.total_u;
        const topDown = r.numbering_top_down === 1;
        const servers = this.currentServers;

        // Map every covered U so we know which rows are empty.
        const covered = new Set();
        servers.forEach(s => {
            for (let u = s.start_u; u <= s.end_u; u++) covered.add(u);
        });

        // Vertical offset (in U rows from the top of the bay) for a given U number.
        const rowsFromTop = (u) => topDown ? (u - 1) : (N - u);

        // ---- gutter (U numbers) ----
        const gutterCells = [];
        for (let i = 0; i < N; i++) {
            // Top-to-bottom order
            const u = topDown ? (i + 1) : (N - i);
            gutterCells.push(`<div class="rk-gutter__cell rk-mono">${u}</div>`);
        }

        // ---- empty slots ----
        const slots = [];
        for (let u = 1; u <= N; u++) {
            if (covered.has(u)) continue;
            const top = rowsFromTop(u);
            slots.push(`
                <button type="button" class="rk-slot" data-u="${u}"
                    style="top:calc(${top} * var(--rk-u)); height:var(--rk-u);"
                    aria-label="Place a server at U${u}">
                    <span class="rk-slot__hint"><i class="fas fa-plus"></i> Place</span>
                </button>`);
        }

        // ---- server sleds ----
        const sleds = servers.map(s => {
            const top = rowsFromTop(topDown ? s.start_u : s.end_u);
            const statusClass = s.orphaned ? 'st-orphaned' : this.statusClass(s.configuration_status);
            const uLabel = s.u_height > 1 ? `U${s.start_u}–U${s.end_u}` : `U${s.start_u}`;
            const chassis = s.chassis_name ? `<span class="rk-sled__chassis">${this.esc(s.chassis_name)}</span>` : '';
            return `
                <div class="rk-sled ${statusClass}" data-config-uuid="${this.esc(s.config_uuid)}"
                    tabindex="0" role="button"
                    style="top:calc(${top} * var(--rk-u)); height:calc(${s.u_height} * var(--rk-u));"
                    aria-label="${this.esc(s.server_name)} at ${uLabel}, ${s.u_height}U">
                    <span class="rk-sled__led"></span>
                    <span class="rk-sled__name">${this.esc(s.server_name)}</span>
                    ${chassis}
                    <span class="rk-sled__u rk-mono">${uLabel}</span>
                    <span class="rk-sled__h rk-mono">${s.u_height}U</span>
                </div>`;
        });

        const rightGutter = gutterCells.map(c => c).join('');

        this.el.elevation.innerHTML = `
            <div class="rk-cabinet">
                <div class="rk-cabinet__plate">
                    <span class="rk-cabinet__name">${this.esc(r.name)}</span>
                    <span class="rk-cabinet__meta rk-mono">${N}U · ${r.used_u} used · ${r.free_u} free</span>
                </div>
                <div class="rk-rack">
                    <div class="rk-gutter">${gutterCells.join('')}</div>
                    <div class="rk-bay">
                        <div class="rk-grid" style="height:calc(${N} * var(--rk-u));">
                            ${slots.join('')}
                            ${sleds.join('')}
                        </div>
                    </div>
                    <div class="rk-gutter rk-gutter--right">${rightGutter}</div>
                </div>
            </div>`;

        // Keyboard activation for sleds
        this.el.elevation.querySelectorAll('.rk-sled').forEach(sled => {
            sled.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openServerActions(sled.dataset.configUuid); }
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
                    <input id="rf_name" type="text" required maxlength="100" value="${isEdit ? this.esc(rack.name) : ''}"
                        placeholder="e.g. RACK 683" class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                </div>
                <div>
                    <label class="block text-sm font-medium text-text-primary mb-1">Location</label>
                    <input id="rf_location" type="text" maxlength="100" value="${isEdit ? this.esc(rack.location || '') : ''}"
                        placeholder="e.g. Noida" class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
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
                        class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">${isEdit ? this.esc(rack.notes || '') : ''}</textarea>
                </div>
                <div class="flex justify-end gap-2 pt-2">
                    <button type="button" id="rf_cancel" class="px-4 py-2 border border-border rounded-lg text-text-primary hover:bg-surface-hover">Cancel</button>
                    <button type="submit" class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-600">${isEdit ? 'Save changes' : 'Create rack'}</button>
                </div>
            </form>`;
        this.openModal(title, body);

        document.getElementById('rf_cancel').addEventListener('click', () => this.closeModal());
        document.getElementById('rackForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitRackForm(isEdit ? rack.rack_uuid : null);
        });
    }

    async submitRackForm(rackUuid) {
        const name = document.getElementById('rf_name').value.trim();
        const location = document.getElementById('rf_location').value.trim();
        const totalU = parseInt(document.getElementById('rf_total_u').value, 10);
        const numberingTopDown = document.getElementById('rf_numbering').value === '1';
        const notes = document.getElementById('rf_notes').value.trim();

        if (!name) { toast.error('Rack name is required'); return; }
        if (!totalU || totalU < 1 || totalU > 100) { toast.error('Height must be between 1 and 100 U'); return; }

        let res;
        if (rackUuid) {
            res = await rackAPI.updateRack(rackUuid, { name, location, totalU, numberingTopDown, notes });
        } else {
            res = await rackAPI.createRack({ name, location, totalU, numberingTopDown, notes });
        }

        if (!res || !res.success) { toast.error(res?.message || 'Could not save rack'); return; }

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
            options = `<option value="${this.esc(lockedServer.config_uuid)}" data-h="${lockedServer.u_height}" selected>${this.esc(lockedServer.server_name)}</option>`;
        } else {
            const res = await rackAPI.unassignedServers();
            if (!res || !res.success) { this.el.modalBody.innerHTML = `<p class="text-danger text-sm">${this.esc(res?.message || 'Failed to load servers')}</p>`; return; }
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
                servers.map(s => `<option value="${this.esc(s.config_uuid)}" data-h="${s.u_height}">${this.esc(s.server_name)} · ${s.u_height}U · ${this.esc(s.status_text)}</option>`).join('');
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
                <p class="text-xs text-text-muted">Height defaults to the server's chassis size. Adjust if needed. It occupies <span id="pf_range" class="rk-mono"></span> in ${this.esc(this.currentRack.name)}.</p>
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

    openServerActions(configUuid) {
        const s = this.currentServers.find(x => x.config_uuid === configUuid);
        if (!s) return;
        const uLabel = s.u_height > 1 ? `U${s.start_u}–U${s.end_u}` : `U${s.start_u}`;
        const builderHref = `../server/builder.html?config=${encodeURIComponent(s.config_uuid)}`;

        const body = `
            <div class="space-y-4">
                <div class="flex items-start gap-3">
                    <span class="rk-sled__led ${s.orphaned ? 'st-orphaned' : this.statusClass(s.configuration_status)}" style="margin-top:6px"></span>
                    <div class="min-w-0">
                        <p class="font-semibold text-text-primary break-words">${this.esc(s.server_name)}</p>
                        <p class="text-sm text-text-muted rk-mono">${uLabel} · ${s.u_height}U · ${this.esc(s.status_text)}</p>
                        ${s.chassis_name ? `<p class="text-xs text-text-muted mt-0.5">${this.esc(s.chassis_name)}</p>` : ''}
                    </div>
                </div>
                <div class="grid grid-cols-1 gap-2 pt-1">
                    ${s.orphaned ? '' : `<a href="${builderHref}" class="w-full px-4 py-2 border border-border rounded-lg text-text-primary hover:bg-surface-hover flex items-center gap-2"><i class="fas fa-wrench"></i> Open in builder</a>`}
                    <button id="sa_move" class="w-full px-4 py-2 border border-border rounded-lg text-text-primary hover:bg-surface-hover flex items-center gap-2"><i class="fas fa-arrows-up-down"></i> Move to another position</button>
                    <button id="sa_remove" class="w-full px-4 py-2 border border-danger/40 text-danger rounded-lg hover:bg-danger/10 flex items-center gap-2"><i class="fas fa-trash"></i> Remove from rack</button>
                </div>
            </div>`;
        this.openModal('Server', body);

        document.getElementById('sa_move').addEventListener('click', () => {
            this.openPlaceServer(s.start_u, { config_uuid: s.config_uuid, server_name: s.server_name, u_height: s.u_height });
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

    /* ---------------- modal + utils ---------------- */

    openModal(title, bodyHtml) {
        this.el.modalTitle.textContent = title;
        this.el.modalBody.innerHTML = bodyHtml;
        this.el.modal.classList.remove('hidden');
    }

    closeModal() {
        this.el.modal?.classList.add('hidden');
    }

    statusClass(status) {
        return { 0: 'st-draft', 1: 'st-validated', 2: 'st-built', 3: 'st-finalized' }[status] || 'st-draft';
    }

    spinner(label) {
        return `<div class="text-center py-8 text-text-muted text-sm"><i class="fas fa-spinner fa-spin mr-2"></i>${this.esc(label)}</div>`;
    }

    esc(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }
}

// Initialize
const rackView = new RackView();
window.rackView = rackView;
document.addEventListener('DOMContentLoaded', () => rackView.init());
