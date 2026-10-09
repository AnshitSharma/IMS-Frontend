/**
 * request-types.js
 * Admin UI for defining request TYPES and their ordered steps.
 *
 * A type has N steps; each step has a default owner (a user or a role).
 * The built-in "General Request" type (is_system) can have its steps edited
 * but cannot be renamed, archived, or deleted.
 *
 * Layout: the list of types on the left, the selected type's editor on the
 * right — its steps drawn as a flow of cards, and the selected step's
 * "on approval" actions in a panel under the flow.
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
        // The type in the editor: its id, 'new' for an unsaved draft, or null.
        this.selectedId = null;
        // Whether the editor holds edits not yet saved. Asked about before
        // they are thrown away by picking another type.
        this.dirty = false;
        // The step card whose actions the panel under the flow is showing.
        this.activeRow = null;
    }

    init() {
        // Page-level access gate. This page is admin + super_admin only, and the
        // redirect used to live in dashboard.js's page router — the single reason
        // request-types.html loaded that 230 KB file. It belongs with the page it
        // guards. UI-only, as ever: the backend enforces the same rule.
        if (window.api?.utils?.hasRole && !window.api.utils.hasRole(['admin', 'super_admin'])) {
            window.location.href = 'index.html';
            return;
        }

        if (window.api && window.api.utils) {
            this.canManage = window.api.utils.hasPermission('pipeline.template_manage')
                || window.api.utils.hasPermission('pipeline.manage');
        }

        const byId = (id) => document.getElementById(id);
        byId('createTypeBtn')?.addEventListener('click', () => this.select('new'));
        byId('createFirstTypeBtn')?.addEventListener('click', () => {
            this.setState('ready');
            this.select('new');
        });
        byId('typesNav')?.addEventListener('click', (e) => {
            const item = e.target.closest('[data-type-id]');
            if (item) this.select(parseInt(item.dataset.typeId, 10));
        });
        window.addEventListener('beforeunload', (e) => {
            if (!this.dirty) return;
            e.preventDefault();
            e.returnValue = '';
        });

        if (!this.canManage) {
            byId('createTypeBtn')?.classList.add('hidden');
            // The empty state offers the same action as the "New type" entry and
            // has to obey the same permission — otherwise the only "New type"
            // a read-only viewer can see is the one that 403s.
            byId('createFirstTypeBtn')?.classList.add('hidden');
        }

        this.loadUsersAndRoles().finally(() => this.load());
    }

    async loadUsersAndRoles() {
        try {
            const [u, r] = await Promise.all([api.requestEnvelope('users-list'), api.requestEnvelope('roles-list')]);
            this.users = (u.success && u.data?.users) ? u.data.users : [];
            this.roles = (r.success && r.data?.roles) ? r.data.roles : [];
        } catch (e) {
            this.users = [];
            this.roles = [];
        }
    }

    // ----- Load + render -----------------------------------------------------
    async load(keepId = this.selectedId) {
        this.setState('loading');
        try {
            const result = await api.requestEnvelope('pipeline-template-list', {
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

            if (this.types.length === 0) {
                this.setState('empty');
                return;
            }
            this.setState('ready');
            const keep = this.types.find((t) => t.id === keepId);
            this.dirty = false;
            this.select(keep ? keep.id : this.types[0].id, true);
        } catch (e) {
            this.setState('error', e.message);
        }
    }

    renderNav() {
        const nav = document.getElementById('typesNav');
        if (!nav) return;
        nav.innerHTML = this.types.map((t) => {
            const steps = (t.stages || []).length;
            const tags = [`${steps} step${steps === 1 ? '' : 's'}`];
            if (t.is_system === 1) tags.push('built-in');
            if (t.is_active === 0) tags.push('archived');
            const on = t.id === this.selectedId;
            return `
                <button type="button" class="rtx-nav-item${on ? ' is-on' : ''}${t.is_active === 0 ? ' is-archived' : ''}" data-type-id="${t.id}"${on ? ' aria-current="true"' : ''}>
                    <span class="rtx-nav-name">${utils.escapeHtml(t.name)}</span>
                    <span class="rtx-nav-meta rtx-mono">${tags.join(' · ')}</span>
                </button>`;
        }).join('');
    }

    /**
     * Open a type (or 'new') in the editor. Asks before discarding unsaved
     * edits, unless `force` — a reload after saving has nothing to discard.
     */
    async select(id, force = false) {
        if (!force && id === this.selectedId) return;
        if (!force && this.dirty) {
            const ok = await utils.confirm('You have unsaved changes to this request type. Discard them?', 'Discard changes');
            if (!ok) return;
        }
        if (id === 'new' && !this.canManage) return;
        this.selectedId = id;
        this.dirty = false;
        this.renderNav();
        const type = id === 'new' ? null : this.types.find((t) => t.id === id);
        this.renderEditor(type || null);
    }

    // ----- Editor -------------------------------------------------------------
    renderEditor(type) {
        const host = document.getElementById('typeEditor');
        if (!host) return;
        this.editingId = type ? type.id : null;
        this.currentType = type;
        this.activeRow = null;
        host.innerHTML = this.getEditorHTML(type);

        const form = document.getElementById('typeForm');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submit();
        });
        form.addEventListener('input', () => this.markDirty());
        form.addEventListener('change', () => this.markDirty());
        document.getElementById('addStageBtn')?.addEventListener('click', () => {
            this.addStageRow();
            this.markDirty();
        });
        document.getElementById('typeArchiveBtn')?.addEventListener('click', () => this.toggleArchive(type));
        document.getElementById('typeDeleteBtn')?.addEventListener('click', () => this.remove(type));
        document.getElementById('typeDiscardBtn')?.addEventListener('click', () => this.select(this.selectedId, true));
        const name = document.getElementById('typeName');
        name?.addEventListener('input', () => {
            document.getElementById('rtxTitle').textContent = name.value.trim() || 'New request type';
        });

        // Seed steps (existing, or one empty card for a brand-new type)
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

        // Open the actions of the step that performs the work, if any — that is
        // the step worth looking at — else the first.
        const rows = [...document.querySelectorAll('#stageRows .stage-row')];
        const performing = rows.find((r) => r._effect && r._effect.type);
        this.selectStage(performing || rows[0]);

        if (!this.canManage) {
            form.querySelectorAll('input, select, textarea, button').forEach((el) => { el.disabled = true; });
        }
        this.dirty = false;
        this.updateSaveState();
    }

    markDirty() {
        this.dirty = true;
        this.updateSaveState();
    }

    updateSaveState() {
        const save = document.getElementById('typeSaveBtn');
        if (save) save.disabled = !this.canManage || (!this.dirty && this.editingId !== null);
        const discard = document.getElementById('typeDiscardBtn');
        if (discard) discard.classList.toggle('hidden', !this.dirty || this.editingId === null);
    }

    getEditorHTML(type) {
        const isSystem = type && type.is_system === 1;
        // Types shipped by a seeder carry created_by = NULL; only ones built in
        // this UI have a creator. Seeded types are part of the product, so they
        // can be edited and archived but never deleted.
        const isSeeded = type && (type.created_by === null || type.created_by === undefined);
        const inactive = type && type.is_active === 0;

        let badge = '';
        if (type) {
            badge = inactive
                ? '<span class="rtx-badge is-archived">Archived</span>'
                : '<span class="rtx-badge is-active">Active</span>';
            if (isSystem) badge += ' <span class="rtx-badge is-system">Built-in</span>';
        }

        const actions = this.canManage ? `
            <button type="button" id="typeDiscardBtn" class="rtx-btn hidden">Discard changes</button>
            ${type && !isSystem ? `<button type="button" id="typeArchiveBtn" class="rtx-btn">${inactive ? 'Restore' : 'Archive'}</button>` : ''}
            ${type && !isSystem && !isSeeded ? `<button type="button" id="typeDeleteBtn" class="rtx-btn rtx-btn-danger">Delete</button>` : ''}
            <button type="submit" id="typeSaveBtn" class="rtx-btn rtx-btn-primary">${type ? 'Save' : 'Create type'}</button>` : '';

        return `
            <form id="typeForm" class="rtx-editor" novalidate>
                <div class="rtx-top">
                    <h1 id="rtxTitle">${type ? utils.escapeHtml(type.name) : 'New request type'}</h1>
                    ${badge}
                    <div class="rtx-top-actions">${actions}</div>
                </div>

                <section class="rtx-card rtx-details" aria-label="Details">
                    <div class="rtx-field">
                        <label for="typeName">Name${isSystem ? '' : ' <span class="text-danger">*</span>'}</label>
                        <input type="text" id="typeName" maxlength="120" ${isSystem ? '' : 'aria-required="true"'}
                            value="${type ? utils.escapeHtml(type.name) : ''}"
                            placeholder="e.g. RAM upgrade" ${isSystem ? 'readonly' : ''}>
                        ${isSystem ? '<span class="rtx-hint">Built-in type. Its name can\'t be changed.</span>' : ''}
                    </div>
                    <div class="rtx-field">
                        <span class="rtx-flabel">The new-request form asks for</span>
                        <div class="rtx-checks" style="min-height:38px;align-items:center">
                            <label><input type="checkbox" id="typeAsksServer" ${!type || type.asks_for_server !== 0 ? 'checked' : ''}> A server</label>
                            <label><input type="checkbox" id="typeAsksComponents" ${!type || type.asks_for_components !== 0 ? 'checked' : ''}> A list of components</label>
                        </div>
                        <span class="rtx-hint">Only used when no step performs the work. A step that does asks for whatever its actions need.</span>
                    </div>
                    <div class="rtx-field rtx-span">
                        <label for="typeDescription">Description</label>
                        <textarea id="typeDescription" rows="2" maxlength="1000"
                            placeholder="What is this request type for?">${type && type.description ? utils.escapeHtml(type.description) : ''}</textarea>
                    </div>
                </section>

                <section aria-label="Flow">
                    <div class="rtx-sec-head">
                        <span class="rtx-label">Flow</span>
                        <span class="rtx-hint">Left to right is the order. A team-owned step goes to whoever on that team accepts it first.</span>
                    </div>
                    <div class="rtx-flowwrap">
                        <div id="stageRows" class="rtx-flow"></div>
                        ${this.canManage ? '<button type="button" id="addStageBtn" class="rtx-add">+ Add step</button>' : ''}
                    </div>
                </section>

                <section class="rtx-card rtx-effect" aria-labelledby="rtxEffectTitle">
                    <span class="rtx-label" id="rtxEffectTitle">Step 1 · on approval</span>
                    <div id="rtxEffectSlot"></div>
                </section>
            </form>`;
    }

    addStageRow(stage = null) {
        const container = document.getElementById('stageRows');
        if (!container) return;
        const idx = container.children.length;
        const ownerType = stage?.assignee_type || 'role';

        const row = document.createElement('div');
        row.className = 'stage-row rtx-step';
        row.innerHTML = `
            <div class="rtx-step-top">
                <span class="rtx-step-n">STEP <span class="stage-pos">${String(idx + 1).padStart(2, '0')}</span></span>
                <div class="rtx-step-tools">
                    <button type="button" class="stage-up" title="Move earlier" aria-label="Move step earlier"><i class="fas fa-arrow-left"></i></button>
                    <button type="button" class="stage-down" title="Move later" aria-label="Move step later"><i class="fas fa-arrow-right"></i></button>
                    <button type="button" class="stage-remove" title="Remove step" aria-label="Remove step"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <div class="rtx-field">
                <label>Name <span class="text-danger">*</span></label>
                <input type="text" class="stage-name" placeholder="e.g. Approval" maxlength="120" aria-required="true" value="${stage ? utils.escapeHtml(stage.name) : ''}">
            </div>
            <div class="rtx-field">
                <span class="rtx-flabel">Owner <span class="text-danger">*</span></span>
                <div class="rtx-owner">
                    <select class="stage-owner-type" aria-label="Owner kind">
                        <option value="role" ${ownerType === 'role' ? 'selected' : ''}>Team</option>
                        <option value="user" ${ownerType === 'user' ? 'selected' : ''}>Person</option>
                    </select>
                    <select class="stage-owner-id" aria-label="Owner" aria-required="true"></select>
                </div>
            </div>
            <div class="rtx-field">
                <label>Instructions</label>
                <textarea class="stage-instructions" rows="2" maxlength="1000" placeholder="What the owner should do (optional)">${stage && stage.instructions ? utils.escapeHtml(stage.instructions) : ''}</textarea>
            </div>
            <button type="button" class="rtx-does"></button>
            <div class="stage-effect"></div>`;
        container.appendChild(row);

        // Labels point at their own inputs; ids are per card.
        const uid = `st${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        row.querySelectorAll('.rtx-field > label').forEach((label) => {
            const input = label.nextElementSibling;
            if (input) { input.id = `${uid}-${input.className}`; label.htmlFor = input.id; }
        });

        const ownerTypeSel = row.querySelector('.stage-owner-type');
        const ownerIdSel = row.querySelector('.stage-owner-id');
        this.populateOwnerOptions(ownerIdSel, ownerTypeSel.value, stage?.assignee_id);
        ownerTypeSel.addEventListener('change', () => this.populateOwnerOptions(ownerIdSel, ownerTypeSel.value));

        row.querySelector('.stage-remove').addEventListener('click', () => {
            const rows = [...container.querySelectorAll('.stage-row')];
            if (rows.length === 1) return utils.showAlert('A request type needs at least one step', 'error');
            const next = row.nextElementSibling || row.previousElementSibling;
            if (this.activeRow === row) this.activeRow = null;
            row.remove();
            this.renumberStages();
            this.selectStage(next);
            this.markDirty();
        });
        row.querySelector('.stage-up').addEventListener('click', () => {
            if (row.previousElementSibling) {
                row.parentNode.insertBefore(row, row.previousElementSibling);
                this.renumberStages();
                this.markDirty();
            }
        });
        row.querySelector('.stage-down').addEventListener('click', () => {
            if (row.nextElementSibling) {
                row.parentNode.insertBefore(row.nextElementSibling, row);
                this.renumberStages();
                this.markDirty();
            }
        });
        // Any interaction with a card makes it the step the panel describes.
        row.addEventListener('focusin', () => this.selectStage(row));
        row.addEventListener('click', () => this.selectStage(row));

        this.renderStageEffect(row, stage);
        this.updateStepSummary(row);
        if (!stage) this.selectStage(row);
    }

    /**
     * Show `row`'s "on approval" editor in the panel under the flow. The editor
     * element itself moves (it is not re-rendered), so what was ticked travels
     * with it; readStageEffect() follows it through row._effectHost.
     */
    selectStage(row) {
        // A removed card still bubbles its click; it has nothing left to show.
        if (!row || row === this.activeRow || !document.contains(row)) return;
        const slot = document.getElementById('rtxEffectSlot');
        if (!slot) return;
        if (this.activeRow && this.activeRow._effectHost && document.contains(this.activeRow)) {
            this.activeRow.appendChild(this.activeRow._effectHost);
            this.activeRow.classList.remove('is-on');
        }
        this.activeRow = row;
        row.classList.add('is-on');
        if (row._effectHost) slot.appendChild(row._effectHost);
        this.updateEffectTitle();
    }

    updateEffectTitle() {
        const title = document.getElementById('rtxEffectTitle');
        if (!title || !this.activeRow) return;
        const n = this.activeRow.querySelector('.stage-pos')?.textContent || '';
        title.textContent = `Step ${Number(n)} · on approval`;
    }

    /** The one-line "what this step does" on its card. */
    updateStepSummary(row) {
        const does = row.querySelector('.rtx-does');
        if (!does) return;
        const effect = this.readStageEffect(row);
        does.classList.toggle('is-acts', !!effect.type);
        if (effect.type && effect.type !== 'execute_request') {
            does.textContent = '◷ legacy access grant (retired)';
        } else if (effect.type) {
            const n = (effect.config?.action_types || []).length;
            does.textContent = n ? `⚙ can run ${n} action${n === 1 ? '' : 's'} on approval` : '⚙ performs work · no actions picked';
        } else {
            does.textContent = '• approve and pass on';
        }
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
        row._effectHost = host;

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
                <div class="text-sm text-text-secondary">
                    <span class="font-medium text-text-primary">Legacy effect: grants temporary access.</span>
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
                <div style="margin-top:14px">
                    <div class="rtx-hint" style="font-weight:600;margin-bottom:8px">${heading}</div>
                    <div class="grid">
                        ${list.map((a) => `
                            <label style="display:flex;gap:10px;align-items:flex-start">
                                <input type="checkbox" class="stage-action" style="margin-top:2px" value="${utils.escapeHtml(a.action_type)}"
                                    ${chosen.includes(a.action_type) ? 'checked' : ''}>
                                <span>${utils.escapeHtml(a.label)}
                                    <code class="rtx-mono" style="color:var(--color-text-muted)">${utils.escapeHtml(a.action_type)}</code></span>
                            </label>`).join('')}
                    </div>
                </div>`;
        };

        host.innerHTML = `
            <div>
                <label style="display:inline-flex;align-items:center;gap:8px;font-size:13.5px;font-weight:500;cursor:pointer">
                    <input type="checkbox" class="stage-effect-on" ${on ? 'checked' : ''}>
                    When this step is approved, perform the request's work
                </label>
                <div class="stage-effect-body" style="${on ? '' : 'display:none'}">
                    <p class="rtx-hint" style="margin:8px 0 0">
                        These are the most a requester can ask for. The list is copied onto each
                        request when it is raised, so editing it never changes a request that is already open.
                    </p>
                    ${groupHtml('server', 'Server builds')}
                    ${groupHtml('inventory', 'Component inventory')}
                </div>
            </div>`;

        const toggle = host.querySelector('.stage-effect-on');
        const body = host.querySelector('.stage-effect-body');
        toggle.addEventListener('change', () => { body.style.display = toggle.checked ? '' : 'none'; });
        // The panel lives outside the card, so its changes are not inside the
        // card's own listeners; the form's still see them (it is in the form).
        host.addEventListener('change', () => this.updateStepSummary(row));
    }

    /** Read one row's effect back out of the DOM, for collectStages(). */
    readStageEffect(row) {
        const host = row._effectHost || row.querySelector('.stage-effect');
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
            el.textContent = String(i + 1).padStart(2, '0');
        });
        this.updateEffectTitle();
    }

    collectStages() {
        const rows = document.querySelectorAll('#stageRows .stage-row');
        const stages = [];
        for (const row of rows) {
            const name = row.querySelector('.stage-name').value.trim();
            const assignee_type = row.querySelector('.stage-owner-type').value;
            const assignee_id = row.querySelector('.stage-owner-id').value;
            const instructions = row.querySelector('.stage-instructions').value.trim();
            if (!name && !assignee_id) continue; // skip fully-empty steps

            const stage = { name, assignee_type, assignee_id, instructions };
            // Which card it came from, so a refusal can point at the field.
            // Non-enumerable: it must not ride along in JSON.stringify(stages).
            Object.defineProperty(stage, 'row', { value: row, enumerable: false });

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
        if (!this.canManage) return;
        const name = document.getElementById('typeName').value.trim();
        const description = document.getElementById('typeDescription').value.trim();
        const stages = this.collectStages();

        // The toast announces it; the message under the field stays until edited.
        const invalid = (input, message, after) => {
            utils.showAlert(message, 'error');
            if (input && typeof utils.fieldError === 'function') utils.fieldError(input, message, { after });
            else input?.focus();
        };
        if (!name) return invalid(document.getElementById('typeName'), 'Enter a name for this request type');
        if (stages.length === 0) return utils.showAlert('Add at least one step', 'error');
        for (let i = 0; i < stages.length; i++) {
            const row = stages[i].row;
            if (!stages[i].name) return invalid(row?.querySelector('.stage-name'), `Step ${i + 1}: enter a name`);
            if (!stages[i].assignee_id) return invalid(row?.querySelector('.stage-owner-id'), `Step ${i + 1}: choose an owner`, row?.querySelector('.rtx-owner'));
        }

        const fields = {
            name,
            description,
            // Archiving has its own button; saving keeps whatever state the type is in.
            is_active: this.currentType ? String(this.currentType.is_active) : '1',
            asks_for_server: document.getElementById('typeAsksServer').checked ? '1' : '0',
            asks_for_components: document.getElementById('typeAsksComponents').checked ? '1' : '0',
            stages: JSON.stringify(stages)
        };
        const action = this.editingId ? 'pipeline-template-update' : 'pipeline-template-create';
        if (this.editingId) fields.template_id = this.editingId;

        const save = document.getElementById('typeSaveBtn');
        try {
            if (save) save.disabled = true;
            const result = await api.requestEnvelope(action, fields);
            if (!result.success) {
                const msg = result.data?.errors?.length ? result.data.errors.join('; ') : (result.message || 'Save failed');
                this.updateSaveState();
                return utils.showAlert(msg, 'error');
            }
            utils.showAlert(this.editingId ? 'Request type saved' : 'Request type created', 'success');
            const savedId = this.editingId
                || Number(result.data?.template_id || result.data?.id || result.data?.template?.id) || null;
            this.dirty = false;
            await this.load(savedId);
            // A create that did not hand its id back: find it by name instead.
            if (!savedId) {
                const made = this.types.find((t) => t.name === name);
                if (made) this.select(made.id, true);
            }
        } catch (e) {
            this.updateSaveState();
            utils.showAlert('Save failed: ' + e.message, 'error');
        }
    }

    async toggleArchive(type) {
        if (!type) return;
        if (this.dirty) {
            const ok = await utils.confirm('Archiving reloads this type and discards your unsaved changes. Continue?', 'Unsaved changes');
            if (!ok) return;
        }
        try {
            const result = await api.requestEnvelope('pipeline-template-update', {
                template_id: type.id,
                is_active: type.is_active === 1 ? '0' : '1'
            });
            if (!result.success) return utils.showAlert(result.message || 'Update failed', 'error');
            utils.showAlert(type.is_active === 1 ? 'Type archived' : 'Type restored', 'success');
            this.dirty = false;
            this.load(type.id);
        } catch (e) {
            utils.showAlert('Update failed: ' + e.message, 'error');
        }
    }

    async remove(type) {
        if (!type) return;
        const ok = await utils.confirm(`Delete request type "${type.name}"? This can't be undone.`, 'Delete request type');
        if (!ok) return;
        try {
            let result = await api.requestEnvelope('pipeline-template-delete', { template_id: type.id });

            // Requests were raised from this type. The backend refuses the first
            // attempt and hands back how many, so the question can name the real
            // number instead of asking "are you sure" twice.
            const used = Number(result?.data?.request_count || 0);
            if (!result.success && used > 0) {
                const plural = used === 1 ? 'request' : 'requests';
                const again = await utils.confirm(
                    `${used} ${plural} ${used === 1 ? 'was' : 'were'} created from "${type.name}". `
                    + `Those ${plural} are kept and will still show "${type.name}" as their type; `
                    + 'the type itself disappears from the New request list. Delete it anyway?',
                    'Type is in use'
                );
                if (!again) return;
                result = await api.requestEnvelope('pipeline-template-delete', { template_id: type.id, force: '1' });
            }

            if (!result.success) {
                const msg = result.data?.errors?.length ? result.data.errors.join('; ') : (result.message || 'Delete failed');
                return utils.showAlert(msg, 'error');
            }
            utils.showAlert('Request type deleted', 'success');
            this.dirty = false;
            this.selectedId = null;
            this.load(null);
        } catch (e) {
            utils.showAlert('Delete failed: ' + e.message, 'error');
        }
    }

    // ----- UI utilities ------------------------------------------------------
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
