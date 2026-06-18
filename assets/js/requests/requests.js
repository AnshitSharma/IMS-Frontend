/**
 * requests.js
 * Request list / create / detail with an interactive step stepper.
 *
 * A request moves through admin-defined steps (see request-types.js). Each
 * step routes to its owner; a role-owned step is claimed by the first member
 * who accepts it. Completing the active step auto-advances to the next owner.
 *
 * Internal element IDs and API actions keep the original `pipeline*` lineage
 * by design (see the project naming policy: the UI says "Requests", the engine
 * stays "pipeline"). Only the product-facing vocabulary is "Requests / Steps".
 */

class RequestsManager {
    constructor() {
        this.apiBaseUrl = window.BDC_CONFIG?.API_BASE_URL || 'https://ims.bdcms.bharatdatacenter.com/Ims_backend/api/api.php';
        this.pipelines = [];
        this.types = [];
        this.users = [];
        this.roles = [];
        this.componentData = null;

        this.scope = 'my_queue';
        this.page = 1;
        this.limit = 20;
        this.total = 0;
        this.filters = { search: '', status: '', priority: '', pipeline_template_id: '' };

        this.perms = {};
        this.currentUserId = null;
        this.currentRoleIds = [];
        this.currentRoleNames = [];
        this.currentDetail = null;
    }

    init() {
        const can = (p) => (window.api && window.api.utils) ? window.api.utils.hasPermission(p) : true;
        this.perms = {
            manage: can('pipeline.manage'),
            create: can('pipeline.create'),
            viewAll: can('pipeline.view_all'),
            claim: can('pipeline.claim'),
            act: can('pipeline.act'),
            reassign: can('pipeline.reassign'),
            cancel: can('pipeline.cancel'),
            templateManage: can('pipeline.template_manage')
        };

        const user = (window.api && window.api.getUser) ? window.api.getUser() : null;
        if (user) {
            this.currentUserId = user.id;
            const roles = Array.isArray(user.roles) ? user.roles : [];
            this.currentRoleIds = roles.map((r) => (typeof r === 'object' ? Number(r.id) : null)).filter((x) => x);
            this.currentRoleNames = roles.map((r) => (typeof r === 'string' ? r : (r.name || r.display_name || ''))).filter(Boolean);
        }

        // Reveal manager-only affordances
        if (this.perms.viewAll || this.perms.manage) {
            document.getElementById('scopeAllTab')?.classList.remove('hidden');
        }
        if (this.perms.templateManage || this.perms.manage) {
            const link = document.getElementById('typesLink');
            link?.classList.remove('hidden');
            link?.classList.add('flex');
        }
        if (!this.perms.create && !this.perms.manage) {
            document.getElementById('createPipelineBtn')?.classList.add('hidden');
        }

        this.wireEvents();
        this.loadSupportData().finally(() => this.load());
    }

    wireEvents() {
        const byId = (id) => document.getElementById(id);

        byId('createPipelineBtn')?.addEventListener('click', () => this.showCreate());
        byId('createFirstPipelineBtn')?.addEventListener('click', () => this.showCreate());
        byId('refreshPipelinesBtn')?.addEventListener('click', () => this.load());

        document.querySelectorAll('.scope-tab').forEach((tab) => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.scope-tab').forEach((t) => t.classList.remove('active'));
                tab.classList.add('active');
                this.scope = tab.dataset.scope;
                this.page = 1;
                this.load();
            });
        });

        const debounce = (fn, ms) => {
            let t;
            return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
        };
        byId('pipelineSearch')?.addEventListener('input', debounce((e) => {
            this.filters.search = e.target.value.trim();
            this.page = 1;
            this.load();
        }, 350));
        byId('pipelineStatusFilter')?.addEventListener('change', (e) => { this.filters.status = e.target.value; this.page = 1; this.load(); });
        byId('pipelinePriorityFilter')?.addEventListener('change', (e) => { this.filters.priority = e.target.value; this.page = 1; this.load(); });
        byId('pipelineTypeFilter')?.addEventListener('change', (e) => { this.filters.pipeline_template_id = e.target.value; this.page = 1; this.load(); });

        byId('pipelinesPrev')?.addEventListener('click', () => { if (this.page > 1) { this.page--; this.load(); } });
        byId('pipelinesNext')?.addEventListener('click', () => { if (this.page * this.limit < this.total) { this.page++; this.load(); } });

        byId('modalClose')?.addEventListener('click', () => this.closeModal('modalContainer'));
        byId('detailClose')?.addEventListener('click', () => this.closeModal('detailModal'));
        byId('modalContainer')?.addEventListener('click', (e) => { if (e.target.id === 'modalContainer') this.closeModal('modalContainer'); });
        byId('detailModal')?.addEventListener('click', (e) => { if (e.target.id === 'detailModal') this.closeModal('detailModal'); });
    }

    // ----- API helpers -------------------------------------------------------
    getToken() {
        return sessionStorage.getItem('bdc_token') || localStorage.getItem('bdc_token');
    }

    async apiPost(action, fields = {}) {
        const fd = new FormData();
        fd.append('action', action);
        Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== null) fd.append(k, v); });
        const res = await fetch(this.apiBaseUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.getToken()}` },
            body: fd
        });
        return res.json();
    }

    async apiGet(action) {
        const res = await fetch(`${this.apiBaseUrl}?action=${encodeURIComponent(action)}`, {
            headers: { 'Authorization': `Bearer ${this.getToken()}` }
        });
        return res.json();
    }

    async loadSupportData() {
        try {
            const [t, u, r] = await Promise.all([
                this.apiPost('pipeline-template-list', { include_stages: 'true' }),
                this.apiGet('users-list'),
                this.apiGet('roles-list')
            ]);
            this.types = (t.success && t.data?.templates) ? t.data.templates : [];
            this.users = (u.success && u.data?.users) ? u.data.users : [];
            this.roles = (r.success && r.data?.roles) ? r.data.roles : [];

            const typeFilter = document.getElementById('pipelineTypeFilter');
            if (typeFilter) {
                this.types.forEach((ty) => {
                    const opt = document.createElement('option');
                    opt.value = ty.id;
                    opt.textContent = ty.name;
                    typeFilter.appendChild(opt);
                });
            }
        } catch (e) {
            // support data is non-critical for listing
        }
    }

    // ----- List --------------------------------------------------------------
    async load() {
        this.setState('loading');
        try {
            const result = await this.apiPost('pipeline-list', {
                scope: this.scope,
                page: this.page,
                limit: this.limit,
                search: this.filters.search,
                status: this.filters.status,
                priority: this.filters.priority,
                pipeline_template_id: this.filters.pipeline_template_id
            });
            if (!result.success) throw new Error(result.message || 'Failed to load');
            this.pipelines = result.data?.pipelines || [];
            this.total = result.data?.total || 0;
            this.renderList();
        } catch (e) {
            this.setState('error', e.message);
        }
    }

    renderList() {
        const list = document.getElementById('pipelinesList');
        if (!list) return;

        if (this.pipelines.length === 0) {
            const hint = document.getElementById('pipelinesEmptyHint');
            if (hint) {
                hint.textContent = this.scope === 'my_queue'
                    ? 'No steps are waiting on you or your team right now.'
                    : (this.scope === 'created' ? "You haven't created any requests yet." : 'No requests match this view.');
            }
            this.setState('empty');
            this.renderPagination();
            return;
        }

        this.setState('ready');
        list.innerHTML = this.pipelines.map((p) => this.renderCard(p)).join('');
        list.querySelectorAll('[data-pipeline-id]').forEach((el) => {
            el.addEventListener('click', () => this.openDetail(parseInt(el.dataset.pipelineId, 10)));
        });
        this.renderPagination();
    }

    renderCard(p) {
        const stage = p.current_stage;
        const pct = p.progress && p.progress.total ? Math.round((p.progress.done / p.progress.total) * 100) : (p.status === 'completed' ? 100 : 0);
        const stageLine = stage
            ? `<span class="text-text-secondary"><i class="fas fa-circle-dot text-primary text-[10px] mr-1"></i>${this.esc(stage.name)}</span>
               <span class="text-text-muted mx-1.5">→</span>${this.ownerBadge(stage.owner, stage.claimed_by)}`
            : `<span class="text-text-muted">${p.status === 'completed' ? 'All steps complete' : 'No active step'}</span>`;

        return `
            <div data-pipeline-id="${p.id}" role="button" tabindex="0"
                class="bg-surface-card border border-border rounded-xl p-4 shadow-sm hover:border-primary/40 hover:shadow transition-all cursor-pointer">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-mono text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">#${this.esc(p.ticket_number)}</span>
                            <span class="text-xs text-text-muted">${this.esc(p.pipeline_type || 'Request')}</span>
                        </div>
                        <h3 class="text-base font-semibold text-text-primary mt-1 truncate">${this.esc(p.title)}</h3>
                    </div>
                    <div class="flex flex-col items-end gap-1.5 shrink-0">
                        ${this.statusBadge(p.status)}
                        ${this.priorityBadge(p.priority)}
                    </div>
                </div>
                <div class="text-sm mt-3 flex items-center flex-wrap gap-y-1">${stageLine}</div>
                <div class="flex items-center gap-3 mt-3">
                    <div class="flex-1 h-1.5 bg-surface-secondary rounded-full overflow-hidden">
                        <div class="h-full bg-primary rounded-full transition-all" style="width:${pct}%"></div>
                    </div>
                    <span class="text-[11px] text-text-muted shrink-0">${p.progress ? `${p.progress.done}/${p.progress.total}` : ''} steps</span>
                </div>
            </div>`;
    }

    renderPagination() {
        const container = document.getElementById('pipelinesPagination');
        const info = document.getElementById('pipelinesPaginationInfo');
        if (!container || !info) return;
        const totalPages = Math.ceil(this.total / this.limit);
        if (this.total === 0) { container.classList.add('hidden'); return; }
        const start = (this.page - 1) * this.limit + 1;
        const end = Math.min(this.page * this.limit, this.total);
        info.textContent = `Showing ${start}-${end} of ${this.total}`;
        container.classList.toggle('hidden', totalPages <= 1);
        document.getElementById('pipelinesPrev')?.toggleAttribute('disabled', this.page <= 1);
        document.getElementById('pipelinesNext')?.toggleAttribute('disabled', this.page >= totalPages);
    }

    // ----- Create ------------------------------------------------------------
    async showCreate() {
        if (!this.perms.create && !this.perms.manage) return;
        const activeTypes = this.types.filter((t) => t.is_active !== 0);
        if (activeTypes.length === 0) {
            return this.toast('No active request types. Ask an admin to create one first.', 'warning');
        }
        await this.loadComponentData();

        const body = document.getElementById('modalBody');
        document.getElementById('modalTitle').textContent = 'New Request';
        body.innerHTML = `
            <form id="pipelineForm" class="space-y-5">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-semibold text-text-primary mb-1.5">Request type <span class="text-danger">*</span></label>
                        <select id="plType" required class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                            <option value="">Select a type...</option>
                            ${activeTypes.map((t) => `<option value="${t.id}">${this.esc(t.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-text-primary mb-1.5">Priority</label>
                        <select id="plPriority" class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                            <option value="low">Low</option>
                            <option value="medium" selected>Medium</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                        </select>
                    </div>
                </div>

                <div id="plStagePreview" class="hidden text-sm bg-surface-secondary/40 border border-border rounded-lg p-3"></div>

                <div>
                    <label class="block text-sm font-semibold text-text-primary mb-1.5">Title <span class="text-danger">*</span></label>
                    <input type="text" id="plTitle" required maxlength="255" placeholder="e.g. Add 64GB RAM to server NODE-12"
                        class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-text-primary mb-1.5">Description <span class="text-danger">*</span></label>
                    <textarea id="plDescription" required rows="3" placeholder="What needs to happen, and why?"
                        class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"></textarea>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-text-primary mb-1.5">Target server UUID <span class="text-text-muted text-xs">(optional)</span></label>
                    <input type="text" id="plServer" placeholder="Server configuration UUID"
                        class="w-full px-3 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                </div>

                <div class="border-t border-border pt-4">
                    <div class="flex items-center justify-between mb-3">
                        <div>
                            <h4 class="text-sm font-semibold text-text-primary">Components <span class="text-text-muted">(optional)</span></h4>
                            <p class="text-xs text-text-muted">Hardware this request involves.</p>
                        </div>
                        <button type="button" id="plAddComponent" class="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-600 flex items-center gap-2">
                            <i class="fas fa-plus"></i> Add
                        </button>
                    </div>
                    <div id="plComponents" class="space-y-2"></div>
                </div>

                <div class="flex justify-end gap-3 pt-3 border-t border-border">
                    <button type="button" id="plCancel" class="px-5 py-2 border border-border rounded-lg hover:bg-surface-hover text-text-primary">Cancel</button>
                    <button type="submit" class="px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary-600 flex items-center gap-2">
                        <i class="fas fa-play"></i> Create Request
                    </button>
                </div>
            </form>`;

        document.getElementById('modalContainer').classList.remove('hidden');
        document.getElementById('plCancel').addEventListener('click', () => this.closeModal('modalContainer'));
        document.getElementById('plAddComponent').addEventListener('click', () => this.addComponentItem());
        document.getElementById('plType').addEventListener('change', (e) => this.previewType(e.target.value));
        document.getElementById('pipelineForm').addEventListener('submit', (e) => { e.preventDefault(); this.submitCreate(); });
    }

    previewType(typeId) {
        const box = document.getElementById('plStagePreview');
        if (!box) return;
        const type = this.types.find((t) => String(t.id) === String(typeId));
        if (!type || !type.stages || !type.stages.length) { box.classList.add('hidden'); return; }
        box.classList.remove('hidden');
        box.innerHTML = `<span class="text-text-muted font-medium">Flow:</span> ` + type.stages.map((s, i) =>
            `${i ? '<span class="text-text-muted mx-1">→</span>' : ''}<span class="text-text-primary font-medium">${this.esc(s.name)}</span> <span class="text-text-muted text-xs">(${this.esc(s.default_assignee?.name || 'unassigned')})</span>`
        ).join('');
    }

    async submitCreate() {
        const pipeline_template_id = document.getElementById('plType').value;
        const title = document.getElementById('plTitle').value.trim();
        const description = document.getElementById('plDescription').value.trim();
        const priority = document.getElementById('plPriority').value;
        const target_server_uuid = document.getElementById('plServer').value.trim();
        const items = this.collectComponentItems();

        if (!pipeline_template_id) return this.toast('Choose a request type', 'error');
        if (!title) return this.toast('Title is required', 'error');
        if (!description) return this.toast('Description is required', 'error');

        const fields = { pipeline_template_id, title, description, priority, items: JSON.stringify(items) };
        if (target_server_uuid) fields.target_server_uuid = target_server_uuid;

        try {
            const result = await this.apiPost('pipeline-create', fields);
            if (!result.success) {
                const msg = result.data?.errors?.length ? result.data.errors.join('; ') : (result.message || 'Failed to create');
                return this.toast(msg, 'error');
            }
            this.toast('Request created', 'success');
            this.closeModal('modalContainer');
            this.load();
            if (result.data?.pipeline_id) this.openDetail(result.data.pipeline_id);
        } catch (e) {
            this.toast('Failed to create request: ' + e.message, 'error');
        }
    }

    // ----- Detail + stepper --------------------------------------------------
    async openDetail(id) {
        try {
            const result = await this.apiPost('pipeline-get', { pipeline_id: id });
            if (!result.success) return this.toast(result.message || 'Failed to load request', 'error');
            this.currentDetail = result.data.pipeline;
            this.renderDetail(this.currentDetail);
            document.getElementById('detailModal').classList.remove('hidden');
        } catch (e) {
            this.toast('Failed to load request: ' + e.message, 'error');
        }
    }

    renderDetail(p) {
        document.getElementById('detailTitle').textContent = `#${p.ticket_number}`;
        const body = document.getElementById('detailBody');
        const terminal = ['completed', 'cancelled', 'rejected'].includes(p.status);

        const items = (p.items && p.items.length) ? `
            <div class="mt-5">
                <h4 class="text-sm font-semibold text-text-primary mb-2">Components</h4>
                <div class="border border-border rounded-lg overflow-hidden">
                    <table class="w-full text-sm">
                        <thead class="bg-surface-secondary/40 text-text-muted">
                            <tr><th class="text-left px-3 py-2 font-medium">Type</th><th class="text-left px-3 py-2 font-medium">Component</th><th class="text-left px-3 py-2 font-medium">Qty</th><th class="text-left px-3 py-2 font-medium">Action</th></tr>
                        </thead>
                        <tbody class="divide-y divide-border">
                            ${p.items.map((it) => `<tr>
                                <td class="px-3 py-2 text-text-secondary">${this.esc(it.component_type)}</td>
                                <td class="px-3 py-2 text-text-primary">${this.esc(it.component_name || 'N/A')}</td>
                                <td class="px-3 py-2 text-text-secondary">${this.esc(it.quantity)}</td>
                                <td class="px-3 py-2 capitalize text-text-secondary">${this.esc(it.action)}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>` : '';

        const history = (p.history && p.history.length) ? `
            <div class="mt-5">
                <h4 class="text-sm font-semibold text-text-primary mb-2">Activity</h4>
                <ul class="space-y-1.5">
                    ${p.history.map((h) => `<li class="text-xs text-text-muted flex gap-2">
                        <i class="fas fa-circle text-[5px] mt-1.5 text-text-muted"></i>
                        <span><span class="text-text-secondary font-medium">${this.esc((h.action || '').replace(/_/g, ' '))}</span>${h.notes ? ` — ${this.esc(h.notes)}` : ''} <span class="text-text-disabled">· ${this.esc(h.changed_by || 'system')} · ${this.fmtDate(h.created_at)}</span></span>
                    </li>`).join('')}
                </ul>
            </div>` : '';

        body.innerHTML = `
            <div class="flex flex-wrap items-center gap-2 mb-1">
                ${this.statusBadge(p.status)} ${this.priorityBadge(p.priority)}
                <span class="text-xs text-text-muted">${this.esc(p.pipeline_type?.name || 'Request')}</span>
            </div>
            <h3 class="text-lg font-semibold text-text-primary">${this.esc(p.title)}</h3>
            <p class="text-sm text-text-secondary mt-1 whitespace-pre-wrap">${this.esc(p.description)}</p>
            <div class="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-xs text-text-muted">
                <span><i class="fas fa-user-pen mr-1"></i>Created by ${this.esc(p.created_by?.username || 'N/A')}</span>
                ${p.target_server_uuid ? `<span><i class="fas fa-server mr-1"></i>${this.esc(p.target_server_uuid)}</span>` : ''}
                ${p.cancel_reason ? `<span class="text-danger"><i class="fas fa-ban mr-1"></i>${this.esc(p.cancel_reason)}</span>` : ''}
            </div>

            <div class="mt-5">
                <h4 class="text-sm font-semibold text-text-primary mb-3">Steps</h4>
                <div class="pl-stepper">${(p.stages || []).map((s) => this.renderStep(s, p, terminal)).join('')}</div>
            </div>
            ${items}
            ${history}
            ${(!terminal && (this.perms.cancel || this.perms.manage)) ? `
                <div class="mt-6 pt-4 border-t border-border flex justify-end">
                    <button id="plCancelPipeline" class="px-4 py-2 text-sm border border-border rounded-lg text-text-muted hover:bg-danger-light hover:text-danger transition-colors">
                        <i class="fas fa-ban mr-1.5"></i>Cancel request
                    </button>
                </div>` : ''}`;

        this.wireDetailActions(p);
    }

    renderStep(stage, pipeline, terminal) {
        const statusClass = {
            completed: 'is-done', active: 'is-active', pending: 'is-pending', skipped: 'is-skipped', rejected: 'is-rejected'
        }[stage.status] || 'is-pending';

        const nodeIcon = {
            completed: '<i class="fas fa-check"></i>', active: '<i class="fas fa-circle-dot"></i>',
            skipped: '<i class="fas fa-minus"></i>', rejected: '<i class="fas fa-xmark"></i>'
        }[stage.status] || `${stage.position}`;

        const isActive = stage.status === 'active';
        let meta = '';
        if (stage.status === 'completed') {
            meta = `<span class="text-text-muted">Done by ${this.esc(stage.completed_by?.username || 'N/A')} · ${this.fmtDate(stage.completed_at)}</span>`;
            if (stage.notes) meta += `<div class="text-text-secondary mt-1 bg-surface-secondary/40 border border-border rounded-md px-2.5 py-1.5">${this.esc(stage.notes)}</div>`;
        } else if (isActive) {
            meta = stage.claimed_by
                ? `<span class="text-text-secondary"><i class="fas fa-hand mr-1 text-primary"></i>Claimed by ${this.esc(stage.claimed_by.username)}</span>`
                : `<span class="text-text-muted">Waiting to be accepted</span>`;
        }

        const instructions = (isActive && stage.instructions)
            ? `<p class="text-xs text-text-muted mt-1.5"><i class="fas fa-circle-info mr-1"></i>${this.esc(stage.instructions)}</p>` : '';

        const actions = isActive && !terminal ? this.stepActions(stage, pipeline) : '';

        return `
            <div class="pl-step ${statusClass}">
                <div class="pl-node">${nodeIcon}</div>
                <div class="${isActive ? 'bg-surface-secondary/40 border border-border rounded-lg p-3' : 'py-1'}">
                    <div class="flex items-center justify-between gap-2 flex-wrap">
                        <span class="text-sm font-semibold ${isActive ? 'text-text-primary' : (stage.status === 'completed' ? 'text-text-primary' : 'text-text-secondary')}">${this.esc(stage.name)}</span>
                        ${this.ownerBadge(stage.owner, stage.claimed_by)}
                    </div>
                    <div class="text-xs mt-1">${meta}</div>
                    ${instructions}
                    ${actions}
                </div>
            </div>`;
    }

    stepActions(stage, pipeline) {
        const eligible = this.eligibleForStage(stage);
        const needsClaim = stage.owner && stage.owner.type === 'role' && !stage.claimed_by;
        const claimedByMe = stage.claimed_by && Number(stage.claimed_by.id) === Number(this.currentUserId);
        const ownedByMe = stage.owner && stage.owner.type === 'user' && Number(stage.owner.id) === Number(this.currentUserId);

        const showAccept = needsClaim && eligible && (this.perms.claim || this.perms.manage);
        const canComplete = this.perms.manage || ownedByMe || claimedByMe;
        const showComplete = (this.perms.act || this.perms.manage) && canComplete && (!needsClaim || this.perms.manage);
        const showReassign = this.perms.reassign || this.perms.manage;

        if (!showAccept && !showComplete && !showReassign) {
            return `<p class="text-xs text-text-muted mt-2 italic">This step is with ${this.esc(stage.owner?.name || 'someone else')}.</p>`;
        }

        return `
            <div class="mt-3 space-y-2" data-stage-actions="${stage.id}">
                ${showComplete ? `
                    <textarea data-complete-notes="${stage.id}" rows="2" placeholder="Notes about what you did (optional)"
                        class="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"></textarea>` : ''}
                <div class="flex flex-wrap gap-2">
                    ${showAccept ? `<button data-act="claim" data-stage="${stage.id}" class="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-600 flex items-center gap-1.5"><i class="fas fa-hand"></i> Accept</button>` : ''}
                    ${showComplete ? `<button data-act="complete" data-stage="${stage.id}" class="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1.5"><i class="fas fa-check"></i> Complete &amp; advance</button>` : ''}
                    ${showReassign ? `<button data-act="reassign-toggle" data-stage="${stage.id}" class="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-surface-hover text-text-secondary flex items-center gap-1.5"><i class="fas fa-user-gear"></i> Reassign</button>` : ''}
                </div>
                ${showReassign ? `
                    <div data-reassign-form="${stage.id}" class="hidden flex flex-wrap items-center gap-2 pt-1">
                        <select data-reassign-type="${stage.id}" class="px-3 py-2 text-sm border border-border rounded-lg bg-surface-card text-text-primary">
                            <option value="role">Team (role)</option>
                            <option value="user">Person</option>
                        </select>
                        <select data-reassign-id="${stage.id}" class="px-3 py-2 text-sm border border-border rounded-lg bg-surface-card text-text-primary flex-1 min-w-[160px]"></select>
                        <button data-act="reassign-apply" data-stage="${stage.id}" class="px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-600">Apply</button>
                    </div>` : ''}
            </div>`;
    }

    wireDetailActions(p) {
        const body = document.getElementById('detailBody');
        if (!body) return;

        body.querySelector('#plCancelPipeline')?.addEventListener('click', () => this.cancelPipeline(p.id));

        body.querySelectorAll('[data-act]').forEach((btn) => {
            const stageId = parseInt(btn.dataset.stage, 10);
            const act = btn.dataset.act;
            if (act === 'claim') btn.addEventListener('click', () => this.claimStage(p.id, stageId));
            else if (act === 'complete') {
                btn.addEventListener('click', () => {
                    const notes = body.querySelector(`[data-complete-notes="${stageId}"]`)?.value || '';
                    this.completeStage(p.id, stageId, notes);
                });
            } else if (act === 'reassign-toggle') {
                btn.addEventListener('click', () => {
                    const form = body.querySelector(`[data-reassign-form="${stageId}"]`);
                    if (!form) return;
                    form.classList.toggle('hidden');
                    form.classList.toggle('flex');
                    const typeSel = body.querySelector(`[data-reassign-type="${stageId}"]`);
                    const idSel = body.querySelector(`[data-reassign-id="${stageId}"]`);
                    this.fillOwnerSelect(idSel, typeSel.value);
                    typeSel.onchange = () => this.fillOwnerSelect(idSel, typeSel.value);
                });
            } else if (act === 'reassign-apply') {
                btn.addEventListener('click', () => {
                    const type = body.querySelector(`[data-reassign-type="${stageId}"]`).value;
                    const id = body.querySelector(`[data-reassign-id="${stageId}"]`).value;
                    if (!id) return this.toast('Pick who to reassign to', 'error');
                    this.reassignStage(p.id, stageId, type, id);
                });
            }
        });
    }

    fillOwnerSelect(select, type) {
        const source = type === 'user' ? this.users : this.roles;
        select.innerHTML = `<option value="">Select ${type === 'user' ? 'a person' : 'a team'}...</option>`;
        source.forEach((item) => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = type === 'user' ? item.username : (item.display_name || item.name);
            select.appendChild(opt);
        });
    }

    eligibleForStage(stage) {
        if (this.perms.manage) return true;
        const o = stage.owner;
        if (o && o.type === 'user' && Number(o.id) === Number(this.currentUserId)) return true;
        if (o && o.type === 'role' && (this.currentRoleIds.includes(Number(o.id)) || this.currentRoleNames.includes(o.name))) return true;
        if (stage.claimed_by && Number(stage.claimed_by.id) === Number(this.currentUserId)) return true;
        return false;
    }

    async claimStage(pipelineId, stageId) {
        await this.stageAction('pipeline-claim', { pipeline_id: pipelineId, stage_progress_id: stageId }, 'Step accepted');
    }
    async completeStage(pipelineId, stageId, notes) {
        await this.stageAction('pipeline-complete', { pipeline_id: pipelineId, stage_progress_id: stageId, notes }, null);
    }
    async reassignStage(pipelineId, stageId, type, id) {
        await this.stageAction('pipeline-reassign', { pipeline_id: pipelineId, stage_progress_id: stageId, assignee_type: type, assignee_id: id }, 'Step reassigned');
    }
    async cancelPipeline(pipelineId) {
        if (!confirm('Cancel this request? Remaining steps will be skipped.')) return;
        const reason = window.prompt('Reason for cancelling (optional):') || '';
        await this.stageAction('pipeline-cancel', { pipeline_id: pipelineId, reason }, 'Request cancelled');
    }

    async stageAction(action, fields, successMsg) {
        try {
            const result = await this.apiPost(action, fields);
            if (!result.success) {
                const msg = result.data?.errors?.length ? result.data.errors.join('; ') : (result.message || 'Action failed');
                return this.toast(msg, 'error');
            }
            this.toast(successMsg || result.message || 'Done', 'success');
            if (result.data?.pipeline) {
                this.currentDetail = result.data.pipeline;
                this.renderDetail(this.currentDetail);
            }
            this.load();
        } catch (e) {
            this.toast('Action failed: ' + e.message, 'error');
        }
    }

    // ----- Component item picker --------------------------------------------
    async loadComponentData() {
        if (this.componentData) return;
        this.componentData = { cpu: [], ram: [], storage: [], motherboard: [], nic: [], caddy: [], chassis: [], pciecard: [], hbacard: [] };
        const paths = {
            cpu: '/ims-data/cpu/Cpu-details-level-3.json',
            ram: '/ims-data/ram/ram_detail.json',
            storage: '/ims-data/storage/storage-level-3.json',
            motherboard: '/ims-data/motherboard/motherboard-level-3.json',
            nic: '/ims-data/nic/nic-level-3.json',
            caddy: '/ims-data/caddy/caddy_details.json',
            chassis: '/ims-data/chassis/chasis-level-3.json',
            pciecard: '/ims-data/pciecard/pci-level-3.json',
            hbacard: '/ims-data/hbacard/hbacard-level-3.json'
        };
        for (const [type, path] of Object.entries(paths)) {
            try {
                const res = await fetch(path);
                if (res.ok) this.componentData[type] = this.flattenComponents(await res.json());
            } catch (e) { /* optional */ }
        }
    }

    flattenComponents(data) {
        const out = [];
        if (Array.isArray(data)) {
            data.forEach((brand) => {
                (brand.models || []).forEach((model) => {
                    if (model.uuid) {
                        out.push({ uuid: model.uuid, brand: brand.brand || 'Unknown', name: model.model || model.memory_type || model.storage_type || model.name || 'Component' });
                    }
                });
            });
        }
        return out;
    }

    addComponentItem() {
        const container = document.getElementById('plComponents');
        if (!container) return;
        const types = ['cpu', 'ram', 'storage', 'motherboard', 'nic', 'caddy', 'chassis', 'pciecard', 'hbacard'];
        const row = document.createElement('div');
        row.className = 'component-item bg-surface-secondary/30 border border-border rounded-lg p-3';
        row.innerHTML = `
            <div class="flex items-start gap-2">
                <div class="flex-1 grid grid-cols-1 md:grid-cols-12 gap-2">
                    <select class="ci-type md:col-span-3 px-3 py-2 text-sm border border-border rounded-lg bg-surface-card text-text-primary">
                        <option value="">Type</option>
                        ${types.map((t) => `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
                    </select>
                    <select class="ci-uuid md:col-span-5 px-3 py-2 text-sm border border-border rounded-lg bg-surface-card text-text-primary"><option value="">Component</option></select>
                    <input type="number" min="1" max="99" value="1" class="ci-qty md:col-span-2 px-3 py-2 text-sm border border-border rounded-lg bg-surface-card text-text-primary" placeholder="Qty">
                    <select class="ci-action md:col-span-2 px-3 py-2 text-sm border border-border rounded-lg bg-surface-card text-text-primary">
                        <option value="add">Add</option><option value="remove">Remove</option><option value="replace">Replace</option>
                    </select>
                </div>
                <button type="button" class="ci-remove mt-1 p-2 text-text-muted hover:text-danger hover:bg-danger-light rounded-lg"><i class="fas fa-trash text-xs"></i></button>
            </div>`;
        container.appendChild(row);

        const typeSel = row.querySelector('.ci-type');
        const uuidSel = row.querySelector('.ci-uuid');
        typeSel.addEventListener('change', () => this.fillComponentUUIDs(typeSel.value, uuidSel));
        row.querySelector('.ci-remove').addEventListener('click', () => row.remove());
    }

    fillComponentUUIDs(type, select) {
        select.innerHTML = '<option value="">Component</option>';
        (this.componentData[type] || []).forEach((c) => {
            const opt = document.createElement('option');
            opt.value = c.uuid;
            opt.textContent = `${c.brand} - ${c.name}`;
            select.appendChild(opt);
        });
    }

    collectComponentItems() {
        const items = [];
        document.querySelectorAll('#plComponents .component-item').forEach((row) => {
            const type = row.querySelector('.ci-type').value;
            const uuid = row.querySelector('.ci-uuid').value;
            const qty = parseInt(row.querySelector('.ci-qty').value, 10) || 1;
            const action = row.querySelector('.ci-action').value;
            if (type && uuid) items.push({ component_type: type, component_uuid: uuid, quantity: qty, action });
        });
        return items;
    }

    // ----- Shared UI helpers -------------------------------------------------
    ownerBadge(owner, claimedBy) {
        if (claimedBy) {
            return `<span class="text-xs text-primary"><i class="fas fa-user-check mr-1"></i>${this.esc(claimedBy.username)}</span>`;
        }
        if (!owner) return `<span class="text-xs text-text-muted"><i class="fas fa-user-slash mr-1"></i>Unassigned</span>`;
        const isRole = owner.type === 'role';
        return `<span class="text-xs ${isRole ? 'text-primary' : 'text-text-secondary'}"><i class="fas fa-${isRole ? 'users' : 'user'} mr-1"></i>${this.esc(owner.name || (isRole ? 'Role' : 'User'))}</span>`;
    }

    statusBadge(status) {
        const map = {
            in_progress: { c: 'text-sky-600 dark:text-sky-400', i: 'fa-circle-notch', l: 'In Progress' },
            completed: { c: 'text-green-700 dark:text-green-400', i: 'fa-check-circle', l: 'Completed' },
            cancelled: { c: 'text-text-muted', i: 'fa-ban', l: 'Cancelled' },
            rejected: { c: 'text-red-600 dark:text-red-400', i: 'fa-times-circle', l: 'Rejected' },
            draft: { c: 'text-text-muted', i: 'fa-file', l: 'Draft' }
        };
        const cfg = map[status] || { c: 'text-text-muted', i: 'fa-circle', l: status || 'Unknown' };
        return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider border border-border bg-surface-secondary ${cfg.c}"><i class="fas ${cfg.i} text-[9px]"></i>${this.esc(cfg.l)}</span>`;
    }

    priorityBadge(priority) {
        const map = {
            low: { c: 'text-text-muted', i: 'fa-arrow-down' },
            medium: { c: 'text-amber-600 dark:text-amber-400', i: 'fa-minus' },
            high: { c: 'text-orange-600 dark:text-orange-400', i: 'fa-arrow-up' },
            urgent: { c: 'text-red-600 dark:text-red-400', i: 'fa-exclamation' }
        };
        const cfg = map[priority] || { c: 'text-text-muted', i: 'fa-circle' };
        const label = priority ? priority.charAt(0).toUpperCase() + priority.slice(1) : 'Normal';
        return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider border border-border bg-surface-secondary ${cfg.c}"><i class="fas ${cfg.i} text-[9px]"></i>${this.esc(label)}</span>`;
    }

    closeModal(id) {
        document.getElementById(id)?.classList.add('hidden');
    }

    setState(state, message = '') {
        ['pipelinesLoadingState', 'pipelinesErrorState', 'pipelinesEmptyState'].forEach((id) => document.getElementById(id)?.classList.add('hidden'));
        const list = document.getElementById('pipelinesList');
        if (state === 'ready') { list?.classList.remove('hidden'); return; }
        if (state !== 'empty') list?.classList.add('hidden');
        const map = { loading: 'pipelinesLoadingState', error: 'pipelinesErrorState', empty: 'pipelinesEmptyState' };
        if (map[state]) document.getElementById(map[state])?.classList.remove('hidden');
        if (state === 'empty') list?.classList.remove('hidden');
        if (state === 'error') {
            const el = document.getElementById('pipelinesErrorMessage');
            if (el) el.textContent = message || 'An error occurred';
        }
    }

    fmtDate(dateString) {
        if (!dateString) return '';
        const d = new Date(dateString.replace(' ', 'T'));
        if (isNaN(d.getTime())) return dateString;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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

let requestsManager = null;
function initRequests() {
    if (!requestsManager) {
        requestsManager = new RequestsManager();
        window.requestsManager = requestsManager;
    }
    requestsManager.init();
}
window.initRequests = initRequests;
