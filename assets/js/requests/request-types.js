/**
 * request-types.js
 * Admin UI for defining request TYPES and their ordered steps.
 *
 * A type has N steps; each step has a default owner (a user or a role).
 * The built-in "General Request" type (is_system) can have its steps edited
 * but cannot be renamed, archived, or deleted.
 *
 * Internal element IDs and API actions keep the original `pipeline*` lineage
 * by design (the UI says "Request Types / Steps"; the engine stays "pipeline").
 */

class RequestTypesManager {
    constructor() {
        this.apiBaseUrl = window.BDC_CONFIG?.API_BASE_URL || 'https://ims.bdcms.bharatdatacenter.com/Ims_backend/api/api.php';
        this.types = [];
        this.actionTypes = [];
        this.users = [];
        this.roles = [];
        this.canManage = true; // refined in init() once api utils are ready
    }

    init() {
        if (window.api && window.api.utils) {
            this.canManage = window.api.utils.hasPermission('pipeline.template_manage')
                || window.api.utils.hasPermission('pipeline.manage');
        }

        const byId = (id) => document.getElementById(id);
        byId('createTypeBtn')?.addEventListener('click', () => this.showEditor());
        byId('createFirstTypeBtn')?.addEventListener('click', () => this.showEditor());
        byId('refreshTypesBtn')?.addEventListener('click', () => this.load());
        byId('modalClose')?.addEventListener('click', () => this.closeModal());
        byId('modalContainer')?.addEventListener('click', (e) => {
            if (e.target.id === 'modalContainer') this.closeModal();
        });

        if (!this.canManage) {
            byId('createTypeBtn')?.classList.add('hidden');
        }

        this.loadUsersAndRoles().finally(() => this.load());
    }

    // ----- API helpers -------------------------------------------------------
    getToken() {
        return sessionStorage.getItem('bdc_token') || localStorage.getItem('bdc_token');
    }

    // Renew an expired token once and retry, rather than rendering the API's 401
    // body as a page error. Mirrors requests.js — see the note there.
    async apiFetch(url, options) {
        const withAuth = () => ({
            ...options,
            headers: { ...(options.headers || {}), 'Authorization': `Bearer ${this.getToken()}` }
        });

        let res = await fetch(url, withAuth());
        if (res.status !== 401 || !window.api) {
            return res.json();
        }

        const refreshed = await window.api.refreshToken();
        if (!refreshed) {
            window.api.handleAuthFailure();
            return res.json();
        }

        res = await fetch(url, withAuth());
        if (res.status === 401) {
            window.api.handleAuthFailure();
        }
        return res.json();
    }

    async apiPost(action, fields = {}) {
        const fd = new FormData();
        fd.append('action', action);
        Object.entries(fields).forEach(([k, v]) => {
            if (v !== undefined && v !== null) fd.append(k, v);
        });
        return this.apiFetch(this.apiBaseUrl, { method: 'POST', body: fd });
    }

    async apiGet(action) {
        return this.apiFetch(`${this.apiBaseUrl}?action=${encodeURIComponent(action)}`, { method: 'GET' });
    }

    async loadUsersAndRoles() {
        try {
            const [u, r] = await Promise.all([this.apiGet('users-list'), this.apiGet('roles-list')]);
            this.users = (u.success && u.data?.users) ? u.data.users : [];
            this.roles = (r.success && r.data?.roles) ? r.data.roles : [];
        } catch (e) {
            this.users = [];
            this.roles = [];
        }
    }

    // ----- Load + render -----------------------------------------------------
    async load() {
        this.setState('loading');
        try {
            const result = await this.apiPost('pipeline-template-list', {
                include_stages: 'true',
                include_inactive: this.canManage ? 'true' : 'false'
            });
            if (!result.success) throw new Error(result.message || 'Failed to load');
            this.types = result.data?.templates || [];
            // The catalogue of work an approval can perform, served alongside the
            // types from RequestActionExecutor's own registry — never a second
            // copy kept here, which would drift silently the moment an action is
            // added or renamed.
            this.actionTypes = result.data?.action_types || [];
            this.render();
        } catch (e) {
            this.setState('error', e.message);
        }
    }

    render() {
        const grid = document.getElementById('typesGrid');
        if (!grid) return;

        if (this.types.length === 0) {
            this.setState('empty');
            return;
        }
        this.setState('ready');
        grid.innerHTML = this.types.map((t) => this.renderCard(t)).join('');

        grid.querySelectorAll('[data-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id, 10);
                const type = this.types.find((t) => t.id === id);
                if (!type) return;
                if (btn.dataset.action === 'edit') this.showEditor(type);
                else if (btn.dataset.action === 'archive') this.toggleArchive(type);
                else if (btn.dataset.action === 'delete') this.remove(type);
            });
        });
    }

    renderCard(type) {
        const inactive = type.is_active === 0;
        const isSystem = type.is_system === 1;
        // Types shipped by a seeder carry created_by = NULL; only ones built in
        // this UI have a creator. Seeded types are part of the product, so they
        // can be edited and archived but never deleted.
        const isSeeded = type.created_by === null || type.created_by === undefined;
        const stages = type.stages || [];
        const flow = stages.length
            ? `<div class="flow-rail mt-3">${stages.map((s) => `
                <div class="flow-node">
                    <span class="flow-stage-name text-text-primary">${this.esc(s.name)}</span>
                    <span class="flow-owner">${this.ownerBadge(s.default_assignee)}</span>
                </div>`).join('')}</div>`
            : `<p class="text-xs text-text-muted mt-3 italic">No steps defined</p>`;

        // Built-in types can have their steps edited, but never archived/deleted.
        // Seeded types keep Archive but lose Delete.
        const manageBtns = this.canManage ? `
            <button data-action="edit" data-id="${type.id}" class="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-surface-hover text-text-secondary transition-colors" title="Edit">
                <i class="fas fa-pen mr-1"></i>Edit
            </button>
            ${isSystem ? '' : `
            <button data-action="archive" data-id="${type.id}" class="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-surface-hover text-text-secondary transition-colors" title="${inactive ? 'Restore' : 'Archive'}">
                <i class="fas fa-${inactive ? 'box-open' : 'box-archive'} mr-1"></i>${inactive ? 'Restore' : 'Archive'}
            </button>
            ${isSeeded ? '' : `
            <button data-action="delete" data-id="${type.id}" class="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-danger-light hover:text-danger text-text-muted transition-colors" title="Delete">
                <i class="fas fa-trash"></i>
            </button>`}`}` : '';

        return `
            <div class="bg-surface-card border border-border rounded-xl p-5 shadow-sm ${inactive ? 'opacity-70' : ''}">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <h3 class="text-lg font-semibold text-text-primary truncate">${this.esc(type.name)}</h3>
                            ${isSystem ? `<span class="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">Built-in</span>` : ''}
                            ${inactive ? `<span class="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-surface-secondary text-text-muted border border-border">Archived</span>` : ''}
                        </div>
                        ${type.description ? `<p class="text-sm text-text-muted mt-1">${this.esc(type.description)}</p>` : ''}
                    </div>
                    <span class="shrink-0 text-xs font-medium text-text-muted bg-surface-secondary border border-border rounded-full px-2.5 py-1">
                        ${stages.length} step${stages.length === 1 ? '' : 's'}
                    </span>
                </div>
                ${flow}
                ${manageBtns ? `<div class="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-border">${manageBtns}</div>` : ''}
            </div>`;
    }

    ownerBadge(owner) {
        if (!owner) return `<span class="text-text-muted"><i class="fas fa-user-slash mr-1"></i>Unassigned</span>`;
        const isRole = owner.type === 'role';
        return `<span class="${isRole ? 'text-primary' : 'text-text-secondary'}">
            <i class="fas fa-${isRole ? 'users' : 'user'} mr-1"></i>${this.esc(owner.name || (isRole ? 'Role' : 'User'))}
        </span>`;
    }

    // ----- Editor modal ------------------------------------------------------
    showEditor(type = null) {
        if (!this.canManage) return;
        const modal = document.getElementById('modalContainer');
        const title = document.getElementById('modalTitle');
        const body = document.getElementById('modalBody');
        if (!modal || !body) return;

        this.editingId = type ? type.id : null;
        title.textContent = type ? `Edit "${type.name}"` : 'New Request Type';
        body.innerHTML = this.getEditorHTML(type);
        modal.classList.remove('hidden');

        document.getElementById('addStageBtn')?.addEventListener('click', () => this.addStageRow());
        document.getElementById('cancelTypeBtn')?.addEventListener('click', () => this.closeModal());
        document.getElementById('typeForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submit();
        });

        // Seed steps (existing, or one empty row for a brand-new type)
        //
        // effect_type / effect_config MUST be carried through. updateTemplate()
        // deletes every pipeline_stages row and re-inserts from what this form
        // sends, so any field the editor does not round-trip is destroyed on
        // save. Before this, opening any request type and pressing Save silently
        // wiped its effect — the type went on looking normal while quietly doing
        // nothing on approval.
        const stages = (type && type.stages && type.stages.length) ? type.stages : [null];
        stages.forEach((s) => this.addStageRow(s ? {
            name: s.name,
            assignee_type: s.default_assignee?.type || 'role',
            assignee_id: s.default_assignee?.id || '',
            instructions: s.instructions || '',
            effect_type: s.effect_type || '',
            effect_config: s.effect_config || null
        } : null));
    }

    getEditorHTML(type) {
        const isSystem = type && type.is_system === 1;
        return `
            <form id="typeForm" class="space-y-5">
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div class="sm:col-span-2">
                        <label class="block text-sm font-semibold text-text-primary mb-1.5">Name <span class="text-danger">*</span></label>
                        <input type="text" id="typeName" required maxlength="120"
                            value="${type ? this.esc(type.name) : ''}"
                            placeholder="e.g. RAM Upgrade" ${isSystem ? 'readonly' : ''}
                            class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary ${isSystem ? 'opacity-70 cursor-not-allowed' : ''}">
                        ${isSystem ? `<p class="text-xs text-text-muted mt-1">Built-in type — name can't be changed.</p>` : ''}
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-text-primary mb-1.5">Status</label>
                        <select id="typeActive" ${isSystem ? 'disabled' : ''} class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary ${isSystem ? 'opacity-70 cursor-not-allowed' : ''}">
                            <option value="1" ${!type || type.is_active === 1 ? 'selected' : ''}>Active</option>
                            <option value="0" ${type && type.is_active === 0 ? 'selected' : ''}>Archived</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-semibold text-text-primary mb-1.5">Description</label>
                    <textarea id="typeDescription" rows="2" maxlength="1000"
                        placeholder="What is this request type for?"
                        class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">${type && type.description ? this.esc(type.description) : ''}</textarea>
                </div>

                <div class="px-3 py-2 rounded-lg border border-border bg-surface-hover">
                    <h4 class="text-sm font-semibold text-text-primary">What the form asks for</h4>
                    <p class="text-xs text-text-muted mb-2">
                        Used only when no step performs the request's work — a type that
                        does asks for whatever its action needs. Turn both off for a
                        request that is about neither, such as being let into a room.
                    </p>
                    <label class="flex items-center gap-2 text-sm text-text-primary">
                        <input type="checkbox" id="typeAsksServer" ${!type || type.asks_for_server !== 0 ? 'checked' : ''}>
                        Which server this request is about
                    </label>
                    <label class="flex items-center gap-2 text-sm text-text-primary mt-1">
                        <input type="checkbox" id="typeAsksComponents" ${!type || type.asks_for_components !== 0 ? 'checked' : ''}>
                        A list of components
                    </label>
                </div>

                <div>
                    <div class="flex items-center justify-between mb-2">
                        <div>
                            <h4 class="text-sm font-semibold text-text-primary">Steps</h4>
                            <p class="text-xs text-text-muted">Order = flow. Each step routes to its owner; a role-owned step is claimed by the first member who accepts it.</p>
                        </div>
                        <button type="button" id="addStageBtn" class="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-600 transition-colors flex items-center gap-2">
                            <i class="fas fa-plus"></i> Add Step
                        </button>
                    </div>
                    <div id="stageRows" class="space-y-2"></div>
                </div>

                <div class="flex justify-end gap-3 pt-3 border-t border-border">
                    <button type="button" id="cancelTypeBtn" class="px-5 py-2 border border-border rounded-lg hover:bg-surface-hover text-text-primary">Cancel</button>
                    <button type="submit" class="px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary-600 flex items-center gap-2">
                        <i class="fas fa-save"></i> ${type ? 'Save Changes' : 'Create Type'}
                    </button>
                </div>
            </form>`;
    }

    addStageRow(stage = null) {
        const container = document.getElementById('stageRows');
        if (!container) return;
        const idx = container.children.length;
        const ownerType = stage?.assignee_type || 'role';

        const row = document.createElement('div');
        row.className = 'stage-row bg-surface-secondary/40 border border-border rounded-lg p-3';
        row.innerHTML = `
            <div class="flex items-start gap-2">
                <div class="shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-1 stage-pos">${idx + 1}</div>
                <div class="flex-1 grid grid-cols-1 md:grid-cols-12 gap-2">
                    <input type="text" class="stage-name md:col-span-4 px-3 py-2 text-sm border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Step name" maxlength="120" value="${stage ? this.esc(stage.name) : ''}">
                    <select class="stage-owner-type md:col-span-3 px-3 py-2 text-sm border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                        <option value="role" ${ownerType === 'role' ? 'selected' : ''}>Team (role)</option>
                        <option value="user" ${ownerType === 'user' ? 'selected' : ''}>Person</option>
                    </select>
                    <select class="stage-owner-id md:col-span-5 px-3 py-2 text-sm border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"></select>
                    <input type="text" class="stage-instructions md:col-span-12 px-3 py-2 text-sm border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Instructions for this step (optional)" maxlength="1000" value="${stage && stage.instructions ? this.esc(stage.instructions) : ''}">
                    <div class="stage-effect md:col-span-12"></div>
                </div>
                <div class="shrink-0 flex flex-col gap-1">
                    <button type="button" class="stage-up p-1.5 text-text-muted hover:text-primary hover:bg-surface-hover rounded" title="Move up"><i class="fas fa-chevron-up text-xs"></i></button>
                    <button type="button" class="stage-down p-1.5 text-text-muted hover:text-primary hover:bg-surface-hover rounded" title="Move down"><i class="fas fa-chevron-down text-xs"></i></button>
                    <button type="button" class="stage-remove p-1.5 text-text-muted hover:text-danger hover:bg-danger-light rounded" title="Remove"><i class="fas fa-trash text-xs"></i></button>
                </div>
            </div>`;
        container.appendChild(row);

        const ownerTypeSel = row.querySelector('.stage-owner-type');
        const ownerIdSel = row.querySelector('.stage-owner-id');
        this.populateOwnerOptions(ownerIdSel, ownerTypeSel.value, stage?.assignee_id);
        ownerTypeSel.addEventListener('change', () => this.populateOwnerOptions(ownerIdSel, ownerTypeSel.value));

        row.querySelector('.stage-remove').addEventListener('click', () => {
            row.remove();
            this.renumberStages();
        });
        row.querySelector('.stage-up').addEventListener('click', () => {
            if (row.previousElementSibling) {
                row.parentNode.insertBefore(row, row.previousElementSibling);
                this.renumberStages();
            }
        });
        row.querySelector('.stage-down').addEventListener('click', () => {
            if (row.nextElementSibling) {
                row.parentNode.insertBefore(row.nextElementSibling, row);
                this.renumberStages();
            }
        });

        this.renderStageEffect(row, stage);
    }

    /**
     * "On approval, perform" — what completing this step actually does.
     *
     * The chosen set is a CEILING, not an instruction: a requester can only
     * build actions from this list, and the list is snapshotted onto each
     * request when it is raised, so editing it here never changes a request
     * that is already open.
     *
     * State lives on `row._effect`, a plain JS property rather than a
     * data-attribute: the config is JSON, and JSON inside an HTML attribute
     * inside an innerHTML template literal is exactly the escaping hazard the
     * project's rules exist to prevent.
     */
    renderStageEffect(row, stage) {
        const host = row.querySelector('.stage-effect');
        if (!host) return;

        const type = (stage && stage.effect_type) || '';
        let config = null;
        if (stage && stage.effect_config) {
            try {
                config = typeof stage.effect_config === 'string'
                    ? JSON.parse(stage.effect_config)
                    : stage.effect_config;
            } catch (e) {
                config = null;
            }
        }
        row._effect = { type, config };

        // A retired effect from the temporary-access model. Shown read-only and
        // preserved verbatim: an admin editing an unrelated step of an old type
        // must not silently destroy it, and must not be able to author a new one.
        if (type && type !== 'execute_request') {
            host.innerHTML = `
                <div class="px-3 py-2 rounded-lg border border-border bg-surface-hover text-xs text-text-secondary">
                    <i class="fas fa-clock-rotate-left mr-1.5 text-text-muted"></i>
                    <span class="font-medium text-text-primary">Legacy effect — grants temporary access.</span>
                    This model was retired; approving this step no longer grants anything.
                    Switch it to actions when you are ready.
                </div>`;
            return;
        }

        const chosen = (config && Array.isArray(config.action_types)) ? config.action_types : [];
        const on = type === 'execute_request';

        const groups = { server: [], inventory: [] };
        (this.actionTypes || []).forEach((a) => {
            (groups[a.scope] || (groups[a.scope] = [])).push(a);
        });

        const groupHtml = (key, heading) => {
            const list = groups[key] || [];
            if (!list.length) return '';
            return `
                <div class="mt-2">
                    <div class="text-xs font-semibold text-text-secondary mb-1">${heading}</div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-1">
                        ${list.map((a) => `
                            <label class="flex items-start gap-2 text-xs text-text-primary">
                                <input type="checkbox" class="stage-action mt-0.5" value="${this.esc(a.action_type)}"
                                    ${chosen.includes(a.action_type) ? 'checked' : ''}>
                                <span>${this.esc(a.label)}
                                    <code class="text-text-muted">${this.esc(a.action_type)}</code></span>
                            </label>`).join('')}
                    </div>
                </div>`;
        };

        host.innerHTML = `
            <div class="px-3 py-2 rounded-lg border border-border bg-surface-hover">
                <label class="flex items-center gap-2 text-xs font-medium text-text-primary">
                    <input type="checkbox" class="stage-effect-on" ${on ? 'checked' : ''}>
                    On approval, perform the request's work
                </label>
                <div class="stage-effect-body ${on ? '' : 'hidden'}">
                    <div class="text-xs text-text-muted mt-1">
                        The ceiling for this type. A requester can only build actions from this list,
                        and the list is copied onto each request when it is raised — editing it here
                        never changes a request that is already open.
                    </div>
                    ${groupHtml('server', 'Server builds')}
                    ${groupHtml('inventory', 'Component inventory')}
                </div>
            </div>`;

        const toggle = host.querySelector('.stage-effect-on');
        const body = host.querySelector('.stage-effect-body');
        toggle.addEventListener('change', () => body.classList.toggle('hidden', !toggle.checked));
    }

    /** Read one row's effect back out of the DOM, for collectStages(). */
    readStageEffect(row) {
        const host = row.querySelector('.stage-effect');
        const stored = row._effect || { type: '', config: null };

        // A legacy effect has no editor — preserve exactly what was loaded.
        if (stored.type && stored.type !== 'execute_request') {
            return stored;
        }

        const toggle = host && host.querySelector('.stage-effect-on');
        if (!toggle || !toggle.checked) {
            return { type: '', config: null };
        }

        const chosen = Array.from(host.querySelectorAll('.stage-action:checked')).map((c) => c.value);
        return { type: 'execute_request', config: { action_types: chosen } };
    }

    populateOwnerOptions(select, ownerType, selectedId = null) {
        const source = ownerType === 'user' ? this.users : this.roles;
        select.innerHTML = `<option value="">Select ${ownerType === 'user' ? 'a person' : 'a team'}...</option>`;
        source.forEach((item) => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = ownerType === 'user'
                ? `${item.username}${item.email ? ` (${item.email})` : ''}`
                : (item.display_name || item.name);
            if (selectedId && String(selectedId) === String(item.id)) opt.selected = true;
            select.appendChild(opt);
        });
    }

    renumberStages() {
        document.querySelectorAll('#stageRows .stage-row .stage-pos').forEach((el, i) => {
            el.textContent = i + 1;
        });
    }

    collectStages() {
        const rows = document.querySelectorAll('#stageRows .stage-row');
        const stages = [];
        for (const row of rows) {
            const name = row.querySelector('.stage-name').value.trim();
            const assignee_type = row.querySelector('.stage-owner-type').value;
            const assignee_id = row.querySelector('.stage-owner-id').value;
            const instructions = row.querySelector('.stage-instructions').value.trim();
            if (!name && !assignee_id) continue; // skip fully-empty rows

            const stage = { name, assignee_type, assignee_id, instructions };

            // Round-trip the effect. updateTemplate() re-inserts every step from
            // exactly what is sent here, so omitting these two fields deletes
            // them — which is what used to happen on every save.
            const effect = this.readStageEffect(row);
            if (effect.type) {
                stage.effect_type = effect.type;
                stage.effect_config = effect.config ? JSON.stringify(effect.config) : null;
            }

            stages.push(stage);
        }
        return stages;
    }

    async submit() {
        const name = document.getElementById('typeName').value.trim();
        const description = document.getElementById('typeDescription').value.trim();
        const is_active = document.getElementById('typeActive').value;
        const stages = this.collectStages();

        if (!name) return this.toast('Name is required', 'error');
        if (stages.length === 0) return this.toast('Add at least one step', 'error');
        for (let i = 0; i < stages.length; i++) {
            if (!stages[i].name) return this.toast(`Step ${i + 1}: name is required`, 'error');
            if (!stages[i].assignee_id) return this.toast(`Step ${i + 1}: choose an owner`, 'error');
        }

        const fields = {
            name,
            description,
            is_active,
            asks_for_server: document.getElementById('typeAsksServer').checked ? '1' : '0',
            asks_for_components: document.getElementById('typeAsksComponents').checked ? '1' : '0',
            stages: JSON.stringify(stages)
        };
        const action = this.editingId ? 'pipeline-template-update' : 'pipeline-template-create';
        if (this.editingId) fields.template_id = this.editingId;

        try {
            const result = await this.apiPost(action, fields);
            if (!result.success) {
                const msg = result.data?.errors?.length ? result.data.errors.join('; ') : (result.message || 'Save failed');
                return this.toast(msg, 'error');
            }
            this.toast(this.editingId ? 'Request type updated' : 'Request type created', 'success');
            this.closeModal();
            this.load();
        } catch (e) {
            this.toast('Save failed: ' + e.message, 'error');
        }
    }

    async toggleArchive(type) {
        try {
            const result = await this.apiPost('pipeline-template-update', {
                template_id: type.id,
                is_active: type.is_active === 1 ? '0' : '1'
            });
            if (!result.success) return this.toast(result.message || 'Update failed', 'error');
            this.toast(type.is_active === 1 ? 'Type archived' : 'Type restored', 'success');
            this.load();
        } catch (e) {
            this.toast('Update failed: ' + e.message, 'error');
        }
    }

    async remove(type) {
        if (!confirm(`Delete request type "${type.name}"? This can't be undone.`)) return;
        try {
            let result = await this.apiPost('pipeline-template-delete', { template_id: type.id });

            // Requests were raised from this type. The backend refuses the first
            // attempt and hands back how many, so the question can name the real
            // number instead of asking "are you sure" twice.
            const used = Number(result?.data?.request_count || 0);
            if (!result.success && used > 0) {
                const plural = used === 1 ? 'request' : 'requests';
                if (!confirm(`${used} ${plural} ${used === 1 ? 'was' : 'were'} created from "${type.name}".\n\n`
                    + `Those ${plural} are kept and will still show "${type.name}" as their type. `
                    + `The type itself disappears from the New Request list.\n\nDelete it anyway?`)) return;
                result = await this.apiPost('pipeline-template-delete', { template_id: type.id, force: '1' });
            }

            if (!result.success) {
                const msg = result.data?.errors?.length ? result.data.errors.join('; ') : (result.message || 'Delete failed');
                return this.toast(msg, 'error');
            }
            this.toast('Request type deleted', 'success');
            this.load();
        } catch (e) {
            this.toast('Delete failed: ' + e.message, 'error');
        }
    }

    // ----- UI utilities ------------------------------------------------------
    closeModal() {
        document.getElementById('modalContainer')?.classList.add('hidden');
    }

    setState(state, message = '') {
        const map = {
            loading: 'typesLoadingState',
            error: 'typesErrorState',
            empty: 'typesEmptyState'
        };
        ['typesLoadingState', 'typesErrorState', 'typesEmptyState'].forEach((id) => {
            document.getElementById(id)?.classList.add('hidden');
        });
        const grid = document.getElementById('typesGrid');
        if (state === 'ready') {
            grid?.classList.remove('hidden');
            return;
        }
        grid?.classList.add('hidden');
        if (map[state]) document.getElementById(map[state])?.classList.remove('hidden');
        if (state === 'error') {
            const el = document.getElementById('typesErrorMessage');
            if (el) el.textContent = message || 'An error occurred';
        }
    }

    toast(message, type = 'info') {
        if (window.toastNotification) window.toastNotification.show(message, type);
        else if (window.toast && window.toast[type]) window.toast[type](message);
        else alert(message);
    }

    esc(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
}

let requestTypesManager = null;
function initRequestTypes() {
    if (!requestTypesManager) {
        requestTypesManager = new RequestTypesManager();
        window.requestTypesManager = requestTypesManager;
    }
    requestTypesManager.init();
}
window.initRequestTypes = initRequestTypes;
