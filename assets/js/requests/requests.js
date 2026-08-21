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
        // Server list behind the create form's picker (pipeline-servers).
        this.servers = [];
        this.serversTotal = 0;
        this.serversTruncated = false;
        // The title is composed for the requester until they type their own.
        this.titleTouched = false;
        this.currentUsername = null;

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
            this.currentUsername = user.username || null;
            const roles = Array.isArray(user.roles) ? user.roles : [];
            this.currentRoleIds = roles.map((r) => (typeof r === 'object' ? Number(r.id) : null)).filter((x) => x);
            this.currentRoleNames = roles.map((r) => (typeof r === 'string' ? r : (r.name || r.display_name || ''))).filter(Boolean);
        }

        // Reveal manager-only affordances
        if (this.perms.viewAll || this.perms.manage) {
            document.getElementById('scopeAllTab')?.classList.remove('hidden');
        } else {
            // "My Queue" means "requests waiting on MY step". A request you raised
            // is normally waiting on somebody else, so for a non-privileged user
            // that tab is empty and their own request looks lost. Start them on
            // "Created by me" instead.
            this.scope = 'created';
            document.querySelectorAll('.scope-tab').forEach((t) => {
                t.classList.toggle('active', t.dataset.scope === 'created');
            });
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
        await Promise.all([this.loadComponentData(), this.loadServers()]);

        const body = document.getElementById('modalBody');
        document.getElementById('modalTitle').textContent = 'New Request';

        // Layout rule for this form: anything the system can answer from a list is
        // a dropdown that OVERLAYS the modal instead of expanding it, so the form
        // stays about one screen tall however much a request type can grant — the
        // access ceiling alone runs to 27 permissions. Left in the open is only the
        // pair nobody else can write: what to call this, and why it is needed.
        const TRIGGER = 'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left border border-border rounded-lg bg-surface-card text-text-primary hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-primary';
        // NOTE: never add a display utility next to `hidden` — the compiled
        // stylesheet emits .hidden BEFORE .flex/.grid, so flex would win and the
        // panel would sit open.
        const PANEL = 'hidden absolute left-0 right-0 z-30 mt-1 rounded-lg border border-border bg-surface-card shadow-lg overflow-hidden';
        const EYEBROW = 'block text-xs font-semibold uppercase tracking-wide text-text-muted mb-1';
        const SELECT = 'w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary';
        const CHEVRON = '<i class="fas fa-chevron-down text-xs text-text-muted shrink-0"></i>';

        body.innerHTML = `
            <form id="pipelineForm" class="space-y-4">
                <!-- The ask. Five questions, four of them answered from a list. -->
                <div class="rounded-lg border border-border bg-surface-secondary p-3 space-y-3">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label for="plType" class="${EYEBROW}">Request type <span class="text-danger">*</span></label>
                            <select id="plType" required class="${SELECT}">
                                <option value="">Select a type...</option>
                                ${activeTypes.map((t) => `<option value="${t.id}">${this.esc(t.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label for="plPriority" class="${EYEBROW}">Priority</label>
                            <select id="plPriority" class="${SELECT}">
                                <option value="low">Low</option>
                                <option value="medium" selected>Medium</option>
                                <option value="high">High</option>
                                <option value="urgent">Urgent</option>
                            </select>
                        </div>
                    </div>

                    <p id="plStagePreview" class="hidden text-xs"></p>

                    <!-- Access. Hidden for request types whose approval grants nothing;
                         filled in by applyRequestType() from the step's effect_config. -->
                    <div id="plAccessRow" class="hidden">
                        <label for="plAccessTrigger" class="${EYEBROW}">Access needed</label>
                        <div class="relative" data-popover="access">
                            <button type="button" id="plAccessTrigger" aria-haspopup="true" aria-expanded="false" class="${TRIGGER}">
                                <span id="plAccessTriggerText" class="min-w-0 truncate"></span>
                                ${CHEVRON}
                            </button>
                            <div id="plAccessPanel" class="${PANEL}">
                                <div id="plAccessPanelBody" class="max-h-96 overflow-y-auto p-3"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Server. One control for the whole question, including
                         "any server" — see renderServerPicker(). -->
                    <div id="plServerRow">
                        <label id="plServerLabel" for="plServerTrigger" class="${EYEBROW}"></label>
                        <div id="plServerBlock"></div>
                        <p id="plServerHint" class="text-xs text-text-muted mt-1"></p>
                    </div>

                    <div id="plItemsRow">
                        <label for="plItemsTrigger" class="${EYEBROW}">Components</label>
                        <div class="relative" data-popover="items">
                            <button type="button" id="plItemsTrigger" aria-haspopup="true" aria-expanded="false" class="${TRIGGER}">
                                <span id="plItemsTriggerText" class="min-w-0 truncate text-text-muted"></span>
                                ${CHEVRON}
                            </button>
                            <div id="plItemsPanel" class="${PANEL}">
                                <div class="p-3">
                                    <div class="flex items-center justify-between gap-2 mb-2">
                                        <p class="text-xs text-text-muted">Hardware this request involves. Optional.</p>
                                        <button type="button" id="plAddComponent" data-autofocus class="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-600 flex items-center gap-2 shrink-0">
                                            <i class="fas fa-plus"></i> Add
                                        </button>
                                    </div>
                                    <div id="plComponents" class="space-y-2 max-h-96 overflow-y-auto"></div>
                                    <p id="plItemsEmpty" class="text-xs text-text-muted">Nothing added yet.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- What you say about it. -->
                <div>
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <label for="plTitle" class="text-sm font-medium text-text-primary">Title <span class="text-danger">*</span></label>
                        <button type="button" id="plTitleAuto" class="text-xs text-text-muted"></button>
                    </div>
                    <input type="text" id="plTitle" required maxlength="255" placeholder="Choose a request type and this writes itself"
                        class="w-full px-3 py-2 text-base font-medium border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                </div>
                <div>
                    <label for="plDescription" class="block text-sm font-medium text-text-primary mb-1">Description <span class="text-danger">*</span></label>
                    <textarea id="plDescription" required rows="3" placeholder="What needs to happen, and why?"
                        class="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"></textarea>
                </div>

                <div class="flex justify-end gap-3 pt-3 border-t border-border">
                    <button type="button" id="plCancel" class="px-5 py-2 border border-border rounded-lg hover:bg-surface-hover text-text-primary">Cancel</button>
                    <button type="submit" class="px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary-600 flex items-center gap-2">
                        <i class="fas fa-play"></i> Create request
                    </button>
                </div>
            </form>`;

        document.getElementById('modalContainer').classList.remove('hidden');
        this.titleTouched = false;
        this.accessCeiling = [];
        this.accessHours = 24;
        this.serverAccessOffered = false;

        this.renderServerPicker();
        this.wirePopoverDismiss();
        this.setServerPickerMode('standalone');
        this.updateItemsSummary();
        this.updateTitleChip();

        const titleField = document.getElementById('plTitle');
        titleField.addEventListener('input', () => {
            // Emptying the box is how you ask for the suggestion back.
            this.titleTouched = titleField.value.trim() !== '';
            this.updateTitleChip();
        });
        document.getElementById('plTitleAuto').addEventListener('click', () => {
            this.titleTouched = false;
            this.autoTitle();
            this.updateTitleChip();
        });
        document.getElementById('plAccessTrigger').addEventListener('click', () => this.togglePopover('access'));
        document.getElementById('plItemsTrigger').addEventListener('click', () => this.togglePopover('items'));
        document.getElementById('plCancel').addEventListener('click', () => this.closeModal('modalContainer'));
        document.getElementById('plAddComponent').addEventListener('click', () => this.addComponentItem());
        document.getElementById('plType').addEventListener('change', (e) => this.previewType(e.target.value));
        document.getElementById('pipelineForm').addEventListener('submit', (e) => { e.preventDefault(); this.submitCreate(); });
    }

    /**
     * Human labels for the permissions a request can ask for. Anything not listed
     * still works — it just shows its raw name — so a new grantable permission on
     * the backend never breaks this screen.
     */
    static get ACCESS_LABELS() {
        return {
            'server.create': 'Build a new server, or add parts to one',
            'server.view': 'View server configurations',
            'server.edit': 'Change a server configuration (add / remove parts)',
            'server.replace': 'Swap a component in a server',
            'server.transition': 'Change a server\u2019s status'
        };
    }

    componentTypeLabel(type) {
        const names = {
            cpu: 'CPU', ram: 'RAM', storage: 'Storage', motherboard: 'Motherboard',
            nic: 'NIC', caddy: 'Caddy', chassis: 'Chassis', pciecard: 'PCIe card',
            risercard: 'Riser card', hbacard: 'HBA card', sfp: 'SFP'
        };
        return names[type] || type;
    }

    /**
     * The same five permissions worded for access limited to ONE configuration.
     *
     * server.create is why this map has to exist: under a scoped grant
     * `server-add-component` works (it carries a config_uuid) while
     * `server-create-start` is refused by the coarse gate, so "Build a new server"
     * would be a promise the grant cannot keep.
     */
    static get ACCESS_LABELS_SCOPED() {
        return {
            'server.create': 'Add parts to this server',
            'server.view': 'View this server’s configuration',
            'server.edit': 'Add or remove this server’s parts',
            'server.replace': 'Swap a component in this server',
            'server.transition': 'Change this server’s status'
        };
    }

    accessLabel(permission, scoped = false) {
        const direct = (scoped ? RequestsManager.ACCESS_LABELS_SCOPED[permission] : null)
            || RequestsManager.ACCESS_LABELS[permission];
        if (direct) return direct;
        const [type, action] = permission.split('.');
        const verb = action === 'create' ? 'Add' : (action === 'edit' ? 'Edit' : action);
        return `${verb} ${this.componentTypeLabel(type)} inventory`;
    }

    // ----- Popovers ----------------------------------------------------------
    /**
     * The three questions that used to stretch the create form: which access,
     * which server, which components. Each is answered in a panel that overlays
     * the form, and only one is open at a time.
     */
    static get POPOVERS() {
        return ['access', 'server', 'items'];
    }

    popoverPart(name, part) {
        return document.getElementById('pl' + name.charAt(0).toUpperCase() + name.slice(1) + part);
    }

    /**
     * Open or close one panel; called with no second argument it toggles.
     *
     * The modal body is a scroll container, so the trigger is scrolled into view
     * first — one sitting near the bottom edge would otherwise open into clipped
     * space.
     */
    togglePopover(name, open) {
        const panel = this.popoverPart(name, 'Panel');
        const trigger = this.popoverPart(name, 'Trigger');
        if (!panel || !trigger) return;

        const next = (open === undefined) ? panel.classList.contains('hidden') : !!open;
        if (next) this.closePopovers(name);
        panel.classList.toggle('hidden', !next);
        trigger.setAttribute('aria-expanded', next ? 'true' : 'false');
        if (next) {
            trigger.scrollIntoView?.({ block: 'nearest' });
            panel.querySelector('[data-autofocus]')?.focus();
        }
    }

    closePopovers(except) {
        RequestsManager.POPOVERS.forEach((name) => {
            if (name !== except) this.togglePopover(name, false);
        });
    }

    /**
     * Dismissal has to live on the document, and the modal body is rebuilt on
     * every open — so replace the previous pair instead of stacking another.
     */
    wirePopoverDismiss() {
        if (this.popoverDismiss) {
            document.removeEventListener('click', this.popoverDismiss, true);
            document.removeEventListener('keydown', this.popoverEscape, true);
        }
        this.popoverDismiss = (e) => {
            RequestsManager.POPOVERS.forEach((name) => {
                const panel = this.popoverPart(name, 'Panel');
                if (!panel || panel.classList.contains('hidden')) return;
                if (!panel.closest('[data-popover]')?.contains(e.target)) this.togglePopover(name, false);
            });
        };
        this.popoverEscape = (e) => {
            if (e.key === 'Escape') this.closePopovers();
        };
        document.addEventListener('click', this.popoverDismiss, true);
        document.addEventListener('keydown', this.popoverEscape, true);
    }

    /** The server list is one of the three panels; this is the name it is opened by. */
    toggleServerDropdown(open) {
        this.togglePopover('server', open);
    }

    // ----- Server picker -----------------------------------------------------
    /**
     * The list of server configurations behind the picker.
     *
     * `pipeline-servers`, not `server-list-configs`: the latter is gated on
     * server.view, which the typical requester does not hold — and that gap is
     * exactly why this form used to ask for a hand-typed config_uuid, which in
     * practice meant no server was named and the approval granted server access
     * globally.
     */
    async loadServers(search = '') {
        try {
            const result = await this.apiPost('pipeline-servers', { search, limit: 100 });
            this.servers = (result.success && result.data?.servers) ? result.data.servers : [];
            this.serversTotal = result.data?.total ?? this.servers.length;
            this.serversTruncated = !!result.data?.truncated;
        } catch (e) {
            this.servers = [];
            this.serversTotal = 0;
            this.serversTruncated = false;
        }
    }

    /**
     * One control answers the whole question.
     *
     * "Which server?" and "or every server?" used to be two controls — a pair of
     * scope radios above a list — which meant the two could disagree and the
     * picker had to be physically moved between two homes to sit next to them.
     * Now "Any server" is simply the last row of the same radio group, in the
     * panel footer where filtering cannot hide it: one question, one answer.
     * Its value is deliberately empty, so selectedServerUuid() returning ''
     * for a system-wide ask is true by construction rather than by a special case.
     */
    renderServerPicker() {
        const block = document.getElementById('plServerBlock');
        if (!block) return;

        block.innerHTML = `
            <div class="relative" data-popover="server">
                <button type="button" id="plServerTrigger" aria-haspopup="listbox" aria-expanded="false"
                    class="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left border border-border rounded-lg bg-surface-card hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-primary">
                    <span id="plServerTriggerText" class="min-w-0 truncate text-text-muted"></span>
                    <i class="fas fa-chevron-down text-xs text-text-muted shrink-0"></i>
                </button>
                <div id="plServerPanel" class="hidden absolute left-0 right-0 z-30 mt-1 rounded-lg border border-border bg-surface-card shadow-lg overflow-hidden">
                    <div class="relative p-2 border-b border-border">
                        <i class="fas fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-xs text-text-muted"></i>
                        <input type="text" id="plServerSearch" data-autofocus autocomplete="off" placeholder="Search by name, location, rack or UUID"
                            class="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-md bg-surface-main text-text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                    </div>
                    <div id="plServerList" class="max-h-96 overflow-y-auto divide-y divide-border"></div>
                    <div id="plServerAnyOption" class="hidden border-t border-border">
                        <label class="flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-surface-hover">
                            <input type="radio" name="plServerPick" value="" data-scope="any" class="mt-1 shrink-0">
                            <span class="min-w-0">
                                <span class="block text-sm font-medium text-text-primary">Any server</span>
                                <span class="block text-xs text-text-muted">Every configuration in the system, including ones built later.</span>
                            </span>
                        </label>
                    </div>
                    <div class="flex justify-end px-3 py-1.5 border-t border-border">
                        <button type="button" id="plServerClear" class="text-xs text-text-muted hover:text-danger">Clear selection</button>
                    </div>
                </div>
            </div>`;

        this.renderServerRows();

        const search = document.getElementById('plServerSearch');
        document.getElementById('plServerTrigger').addEventListener('click', () => this.togglePopover('server'));
        search.addEventListener('input', () => this.filterServerList(search.value));
        document.getElementById('plServerAnyOption').querySelector('input').addEventListener('change', () => {
            this.updateServerSelection();
            this.togglePopover('server', false);
        });
        document.getElementById('plServerClear').addEventListener('click', () => {
            const picked = document.querySelector('input[name="plServerPick"]:checked');
            if (picked) picked.checked = false;
            this.updateServerSelection();
        });
    }

    /** Everything downstream of which server is picked, in one call. */
    updateServerSelection() {
        this.updateServerTrigger();
        this.updateServerHint();
        this.relabelAccess();
        this.autoTitle();
    }

    /** A closed dropdown has to say what is selected, or it says nothing at all. */
    updateServerTrigger() {
        const text = document.getElementById('plServerTriggerText');
        if (!text) return;

        const input = document.querySelector('input[name="plServerPick"]:checked');
        const muted = () => { text.classList.add('text-text-muted'); text.classList.remove('text-text-primary'); };
        const solid = () => { text.classList.remove('text-text-muted'); text.classList.add('text-text-primary'); };

        if (!input) {
            text.textContent = this.servers.length || this.serverAccessOffered
                ? 'Choose a server...'
                : 'No server configurations found';
            return muted();
        }
        if (input.dataset.scope === 'any') {
            text.textContent = 'Any server in the system';
            return solid();
        }

        const picked = this.servers.find((srv) => srv.config_uuid === input.value);
        const bits = [picked?.status, picked?.location, picked?.rack_position].filter(Boolean).join(' · ');
        text.textContent = (picked?.server_name || input.value) + (bits ? ' — ' + bits : '');
        solid();
    }

    /**
     * Rows only. Kept separate from renderServerPicker() so a server-side
     * re-query can replace the list without stealing focus from the search box.
     */
    renderServerRows(keepUuid = '') {
        const list = document.getElementById('plServerList');
        if (!list) return;

        if (!this.servers.length) {
            list.innerHTML = `<p class="px-3 py-3 text-sm text-text-muted">No server configurations found.</p>`;
            this.updateServerSelection();
            return;
        }

        list.innerHTML = this.servers.map((srv) => this.serverRow(srv)).join('');
        list.querySelectorAll('input[name="plServerPick"]').forEach((radio) => {
            if (keepUuid && radio.value === keepUuid) radio.checked = true;
            radio.addEventListener('change', () => {
                this.updateServerSelection();
                // Picking one is the whole reason the list was open.
                this.togglePopover('server', false);
            });
        });
        this.updateServerSelection();
    }

    serverRow(srv) {
        const uuid = String(srv.config_uuid || '');
        const tag = (text, tone) => `<span class="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${tone}">${this.esc(text)}</span>`;
        const bits = [srv.location, srv.rack_position, srv.platform_name].filter(Boolean);
        const haystack = [srv.server_name, uuid, srv.location, srv.rack_position, srv.platform_name]
            .filter(Boolean).join(' ').toLowerCase();

        return `
            <label class="pl-server-row flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-surface-hover" data-haystack="${this.esc(haystack)}">
                <input type="radio" name="plServerPick" value="${this.esc(uuid)}" class="mt-1 shrink-0">
                <span class="min-w-0 flex-1">
                    <span class="flex items-center gap-1.5 flex-wrap">
                        <span class="text-sm font-medium text-text-primary">${this.esc(srv.server_name || 'Unnamed server')}</span>
                        ${srv.status ? tag(srv.status, 'border-border text-text-secondary') : ''}
                        ${srv.is_sandbox ? tag('sandbox', 'border-border text-text-muted') : ''}
                        ${(!srv.is_sandbox && srv.is_virtual) ? tag('virtual', 'border-border text-text-muted') : ''}
                        ${srv.is_own ? tag('yours', 'border-primary/30 text-primary') : ''}
                    </span>
                    <span class="block text-xs text-text-muted mt-0.5 truncate">
                        ${bits.map((b) => this.esc(b)).join(' · ')}${bits.length ? ' · ' : ''}<code title="${this.esc(uuid)}">${this.esc(uuid.slice(-8))}</code>
                    </span>
                </span>
            </label>`;
    }

    /**
     * Filter what is already loaded, and only go back to the API when the first
     * page was capped — so a small installation never waits on the network to
     * type, and a large one can still reach the hundredth server.
     */
    filterServerList(term) {
        const t = String(term || '').trim().toLowerCase();
        const list = document.getElementById('plServerList');
        if (!list) return;

        let shown = 0;
        list.querySelectorAll('.pl-server-row').forEach((row) => {
            const match = !t || (row.dataset.haystack || '').includes(t);
            row.classList.toggle('hidden', !match);
            if (match) shown += 1;
        });

        const note = list.querySelector('#plServerNoMatch');
        if (shown === 0 && this.servers.length && !note) {
            list.insertAdjacentHTML('beforeend', `<p id="plServerNoMatch" class="px-3 py-3 text-sm text-text-muted">Nothing matches that.</p>`);
        } else if (shown > 0 && note) {
            note.remove();
        }

        if (this.serversTruncated) {
            clearTimeout(this.serverSearchTimer);
            this.serverSearchTimer = setTimeout(async () => {
                const keep = this.selectedServerUuid();
                await this.loadServers(t);
                this.renderServerRows(keep);
            }, 350);
        }
    }

    /** The line under the control: only what the closed trigger cannot say. */
    updateServerHint() {
        const hint = document.getElementById('plServerHint');
        if (!hint) return;

        const capped = this.serversTruncated
            ? `Showing ${this.servers.length} of ${this.serversTotal} — search to narrow it down.`
            : '';

        if (!this.serverChoiceMade()) {
            hint.textContent = this.serverAccessOffered
                ? ('Pick the server this access is for, or choose Any server. ' + capped).trim()
                : capped;
            return;
        }
        if (this.serverScopeMode() === 'any') {
            hint.textContent = ('Approving this unlocks every configuration in the system. ' + capped).trim();
            return;
        }

        // Owners can always act on their own configuration, so asking for access
        // to one is usually a wasted round-trip through an approver.
        const picked = this.servers.find((srv) => srv.config_uuid === this.selectedServerUuid());
        hint.textContent = ((picked?.is_own
            ? 'You created this one — you can already change it without asking. '
            : '') + capped).trim();
    }

    /**
     * The picker asks a different question depending on whether the chosen type
     * grants server access, so its label and its "any server" row follow.
     */
    setServerPickerMode(mode) {
        const label = document.getElementById('plServerLabel');
        if (label) {
            label.innerHTML = mode === 'scoped'
                ? 'Server this access is for <span class="text-danger">*</span>'
                : 'Server this request is about';
        }

        const anyRow = document.getElementById('plServerAnyOption');
        if (anyRow) {
            anyRow.classList.toggle('hidden', mode !== 'scoped');
            // A leftover system-wide ask must not survive into a request type that
            // cannot grant it.
            const anyInput = anyRow.querySelector('input');
            if (mode !== 'scoped' && anyInput) anyInput.checked = false;
        }
        this.updateServerSelection();
    }

    /**
     * Short verbs for a title. Deliberately not ACCESS_LABELS: those are checkbox
     * copy ("Add or remove this server's parts") and read badly in a sentence.
     */
    static get TITLE_VERBS() {
        return {
            'server.create': 'add parts',
            'server.view': 'view',
            'server.edit': 'change parts',
            'server.replace': 'swap a component',
            'server.transition': 'change status'
        };
    }

    /**
     * Fill the Title in from the rest of the form, unless the requester has typed
     * their own. A queue full of "test" and "need access" tells an approver
     * nothing, and by this point the form knows who is asking, what they ticked
     * and which server — so it can say it.
     */
    autoTitle() {
        const field = document.getElementById('plTitle');
        if (!field || this.titleTouched) return;
        field.value = this.composeTitle().slice(0, 255);
    }

    /** The chip beside the Title: a status while it writes itself, a way back once you type. */
    updateTitleChip() {
        const chip = document.getElementById('plTitleAuto');
        if (!chip) return;
        chip.textContent = this.titleTouched ? 'Use the suggested title' : 'Written from your choices';
        chip.disabled = !this.titleTouched;
        chip.classList.toggle('text-primary', this.titleTouched);
        chip.classList.toggle('text-text-muted', !this.titleTouched);
    }

    composeTitle() {
        const typeId = document.getElementById('plType')?.value || '';
        const type = this.types.find((t) => String(t.id) === String(typeId));
        if (!type) return '';

        const who = this.currentUsername ? ` — ${this.currentUsername}` : '';
        const uuid = this.selectedServerUuid();
        const picked = this.servers.find((srv) => srv.config_uuid === uuid);
        const serverName = uuid ? (picked?.server_name || uuid) : '';
        const scope = this.serverScopeMode();

        // An ordinary request type grants nothing, so its name is the subject.
        // Keyed off the ceiling, NOT off the server scope: a type that grants
        // inventory access only has no scope to speak of but is still an access
        // request, and its title should say what was ticked.
        if (!(this.accessCeiling || []).length) {
            return `${type.name}${serverName ? ` for ${serverName}` : ''}${who}`;
        }

        const asked = this.collectRequestedAccess();
        const serverAsks = asked.filter((perm) => perm.startsWith('server.'));
        const inventoryAsks = asked.filter((perm) => !perm.startsWith('server.'));

        const parts = [];
        if (!asked.length) {
            // Nothing ticked means "everything this type grants" (see the picker).
            parts.push('Full access this request type allows');
        } else {
            if (serverAsks.length) {
                parts.push(serverAsks.map((perm) => RequestsManager.TITLE_VERBS[perm] || perm).join(', '));
            }
            if (inventoryAsks.length) {
                const invTypes = Array.from(new Set(inventoryAsks.map((perm) => this.componentTypeLabel(perm.split('.')[0]))));
                parts.push(`add/edit ${this.joinList(invTypes)} inventory`);
            }
        }

        // "Where" only means something when server access is in play; inventory is
        // never per-server.
        // With nothing ticked the ask covers the whole ceiling, so it only
        // reaches servers if this type can grant server access at all.
        const wantsServers = serverAsks.length > 0 || (!asked.length && scope !== null);
        const where = wantsServers
            ? (scope === 'specific' ? (serverName ? ` on ${serverName}` : '') : ' on any server')
            : '';

        const what = parts.join(' + ');
        return (what.charAt(0).toUpperCase() + what.slice(1)) + where + who;
    }

    /** ['CPU','RAM','SFP'] -> 'CPU, RAM and SFP' */
    joinList(items) {
        if (items.length <= 1) return items.join('');
        return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
    }

    /** 'specific' | 'any' | null when the chosen type grants no server access. */
    serverScopeMode() {
        if (!this.serverAccessOffered) return null;
        return document.querySelector('input[name="plServerPick"]:checked')?.dataset.scope === 'any'
            ? 'any'
            : 'specific';
    }

    /** Has the requester answered the server question at all — either way? */
    serverChoiceMade() {
        return !!document.querySelector('input[name="plServerPick"]:checked');
    }

    /**
     * The picked configuration. The "Any server" row carries an empty value, so
     * this is '' for a system-wide ask by construction — a leftover selection can
     * never quietly scope a grant the requester asked to be system-wide.
     */
    selectedServerUuid() {
        return document.querySelector('input[name="plServerPick"]:checked')?.value || '';
    }

    // ----- Access picker -----------------------------------------------------
    /**
     * A per-configuration grant really does allow something different from a
     * system-wide one, so the permission labels say which they are — but only
     * once a specific server has actually been chosen, rather than guessing.
     */
    relabelAccess() {
        const scoped = this.serverScopeMode() === 'specific' && !!this.selectedServerUuid();
        document.querySelectorAll('[data-access-label]').forEach((el) => {
            el.textContent = this.accessLabel(el.dataset.accessLabel, scoped);
        });
        document.getElementById('plScopeNote')?.classList.toggle('hidden', this.serverScopeMode() === 'any');
        this.updateAccessTrigger();
    }

    /** The closed Access control reports how much of the ceiling is being asked for. */
    updateAccessTrigger() {
        const text = document.getElementById('plAccessTriggerText');
        if (!text) return;
        const total = (this.accessCeiling || []).length;
        const picked = this.collectRequestedAccess().length;
        const lasts = `${this.accessHours || 24}h`;
        text.textContent = picked
            ? `${picked} of ${total} permissions · ${lasts}`
            : `Everything this type allows · ${lasts}`;
    }

    /**
     * Let the requester pick WHICH access they need, from the ceiling the chosen
     * request type is able to grant (its approval step's effect_config).
     *
     * A type with no access effect hides the Access control entirely and turns
     * the server question back into optional context, so ordinary request types
     * stay plain requests that happen to mention a machine.
     *
     * Ticking nothing still means "whatever this type grants".
     */
    applyRequestType(type) {
        const stage = (type?.stages || []).find((st) => st.effect_type === 'grant_temporary_permission');
        let ceiling = [];
        let hours = 24;
        if (stage) {
            try {
                const cfg = typeof stage.effect_config === 'string'
                    ? JSON.parse(stage.effect_config)
                    : (stage.effect_config || {});
                ceiling = Array.isArray(cfg.permissions) ? cfg.permissions : [];
                if (cfg.duration_hours) hours = Number(cfg.duration_hours) || 24;
            } catch (e) {
                ceiling = [];
            }
        }

        this.accessCeiling = ceiling;
        this.accessHours = hours;
        this.serverAccessOffered = ceiling.some((perm) => perm.startsWith('server.'));

        const row = document.getElementById('plAccessRow');
        const panelBody = document.getElementById('plAccessPanelBody');
        if (!row || !panelBody) return;

        if (!ceiling.length) {
            row.classList.add('hidden');
            panelBody.innerHTML = '';
            this.togglePopover('access', false);
            this.setServerPickerMode('standalone');
            return;
        }

        // Group so a 27-entry list reads as two short lists rather than one wall.
        const serverPerms = ceiling.filter((perm) => perm.startsWith('server.'));
        const inventoryPerms = ceiling.filter((perm) => !perm.startsWith('server.'));

        const checkbox = (perm) => `
            <label class="flex items-start gap-2 py-1 cursor-pointer">
                <input type="checkbox" class="pl-access mt-0.5" value="${this.esc(perm)}">
                <span class="text-sm text-text-secondary"><span data-access-label="${this.esc(perm)}">${this.esc(this.accessLabel(perm))}</span>
                    <code class="ml-1 text-xs text-text-muted">${this.esc(perm)}</code></span>
            </label>`;

        panelBody.innerHTML = `
            <p class="text-xs text-text-muted mb-3">Approved access lasts ${hours} hour${hours === 1 ? '' : 's'} and then expires on its own. Leave everything unticked to ask for all of it.</p>
            ${serverPerms.length ? `
            <div class="mb-3">
                <div class="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Servers</div>
                ${serverPerms.map(checkbox).join('')}
                <p id="plScopeNote" class="text-xs text-text-muted mt-2">
                    <i class="fas fa-circle-info mr-1"></i>Access to one server lets you change that build. Starting a brand-new server needs <span class="font-medium text-text-secondary">Any server</span>.
                </p>
            </div>` : ''}
            ${inventoryPerms.length ? `
            <div class="${serverPerms.length ? 'border-t border-border pt-3' : ''}">
                <div class="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Inventory</div>
                <p class="text-xs text-text-muted mb-1">Inventory is not owned by a server, so this access always applies system-wide.</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4">${inventoryPerms.map(checkbox).join('')}</div>
            </div>` : ''}`;

        panelBody.querySelectorAll('.pl-access').forEach((tick) => {
            tick.addEventListener('change', () => {
                this.updateAccessTrigger();
                this.autoTitle();
            });
        });

        row.classList.remove('hidden');
        this.setServerPickerMode(this.serverAccessOffered ? 'scoped' : 'standalone');
    }

    collectRequestedAccess() {
        return Array.from(document.querySelectorAll('.pl-access:checked')).map((c) => c.value);
    }

    /** The closed Components control counts what will actually be sent. */
    updateItemsSummary() {
        const text = document.getElementById('plItemsTriggerText');
        const empty = document.getElementById('plItemsEmpty');
        const rows = document.querySelectorAll('#plComponents .component-item').length;
        const ready = this.collectComponentItems().length;

        if (empty) empty.classList.toggle('hidden', rows > 0);
        if (!text) return;

        if (!rows) {
            text.textContent = 'No components';
        } else if (ready === rows) {
            text.textContent = `${ready} component${ready === 1 ? '' : 's'}`;
        } else {
            // Half-filled rows are dropped on submit; say so rather than silently
            // sending fewer components than the form appears to hold.
            text.textContent = `${ready} of ${rows} filled in`;
        }
        text.classList.toggle('text-text-muted', !ready);
        text.classList.toggle('text-text-primary', ready > 0);
    }

    previewType(typeId) {
        const type = this.types.find((t) => String(t.id) === String(typeId));
        this.applyRequestType(type);
        this.autoTitle();
        this.updateTitleChip();

        const box = document.getElementById('plStagePreview');
        if (!box) return;
        if (!type || !type.stages || !type.stages.length) { box.classList.add('hidden'); return; }
        box.classList.remove('hidden');
        box.innerHTML = `<span class="text-text-muted">Approval path:</span> ` + type.stages.map((s, i) =>
            `${i ? '<span class="text-text-muted mx-1">→</span>' : ''}<span class="text-text-primary font-medium">${this.esc(s.name)}</span> <span class="text-text-muted">(${this.esc(s.default_assignee?.name || 'unassigned')})</span>`
        ).join('');
    }

    async submitCreate() {
        const pipeline_template_id = document.getElementById('plType').value;
        const title = document.getElementById('plTitle').value.trim();
        const description = document.getElementById('plDescription').value.trim();
        const priority = document.getElementById('plPriority').value;
        const target_server_uuid = this.selectedServerUuid();
        const requested_access = this.collectRequestedAccess();
        const items = this.collectComponentItems();

        if (!pipeline_template_id) return this.toast('Choose a request type', 'error');
        if (!title) return this.toast('Title is required', 'error');
        if (!description) return this.toast('Description is required', 'error');

        // Leaving the server question unanswered would be approved as a GLOBAL
        // server grant — the silent mistake the old free-text UUID field made
        // easy — so a type that can grant server access needs an answer either
        // way: a named configuration, or a deliberate "Any server". An empty tick
        // list counts as asking for server access too, because it means
        // "everything this type grants".
        const asksServerAccess = requested_access.length === 0
            || requested_access.some((perm) => perm.startsWith('server.'));
        if (this.serverAccessOffered && asksServerAccess && !this.serverChoiceMade()) {
            return this.toast('Choose which server this access is for, or pick "Any server"', 'error');
        }

        const fields = { pipeline_template_id, title, description, priority, items: JSON.stringify(items) };
        if (target_server_uuid) fields.target_server_uuid = target_server_uuid;
        // Omitted entirely when nothing was ticked, which the backend reads as
        // "grant whatever this request type grants".
        if (requested_access.length) fields.requested_access = JSON.stringify(requested_access);

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

        // What this request is ASKING for, shown while it is still pending so the
        // approver can see it without reading the description.
        const asked = Array.isArray(p.requested_access) ? p.requested_access : [];
        const askedBlock = asked.length ? `
            <div class="mt-4 px-4 py-3 rounded-lg border border-border bg-surface-secondary/40">
                <div class="text-sm font-medium text-text-primary mb-1.5">
                    <i class="fas fa-key mr-1.5 text-text-muted"></i>Access requested
                </div>
                <ul class="text-xs text-text-secondary space-y-0.5">
                    ${asked.map((a) => `<li>&bull; ${this.esc(this.accessLabel(a, !!p.target_server_uuid))} <code class="text-text-muted">${this.esc(a)}</code></li>`).join('')}
                </ul>
                ${asked.some((a) => a.startsWith('server.')) ? `<div class="text-xs mt-2">${this.accessScopeLine(p)}</div>` : ''}
            </div>` : '';

        // If approving this request granted temporary access, say so plainly rather
        // than leaving it buried in the activity list. new_value holds the expiry.
        const grantEntry = (p.history || []).find((h) => h.action === 'access_granted');
        let accessBanner = '';
        if (grantEntry) {
            const expires = new Date(String(grantEntry.new_value || '').replace(' ', 'T'));
            const valid = !isNaN(expires.getTime());
            const live = valid && expires.getTime() > Date.now();
            accessBanner = `
            <div class="mt-4 flex items-start gap-2 px-4 py-3 rounded-lg border ${live ? 'border-primary/30 bg-primary/5' : 'border-border bg-surface-hover'}">
                <i class="fas ${live ? 'fa-unlock text-primary' : 'fa-lock text-text-muted'} mt-0.5"></i>
                <div class="text-sm">
                    <div class="font-medium text-text-primary">${live ? 'Temporary access granted' : 'Temporary access has expired'}</div>
                    <div class="text-xs text-text-secondary mt-0.5">
                        ${this.esc(grantEntry.notes || '')}${valid ? ` · ${this.esc(expires.toLocaleString())}` : ''}
                    </div>
                </div>
            </div>`;
        }

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
                ${p.target_server_uuid ? `<span title="${this.esc(p.target_server_uuid)}"><i class="fas fa-server mr-1"></i>${this.esc(p.target_server?.name || p.target_server_uuid)}</span>` : ''}
                ${p.cancel_reason ? `<span class="text-danger"><i class="fas fa-ban mr-1"></i>${this.esc(p.cancel_reason)}</span>` : ''}
            </div>
            ${askedBlock}
            ${accessBanner}

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

    /**
     * How far the server half of a request reaches. This is the single most
     * important line for an approver, and a bare config_uuid never told them:
     * no server named means every configuration in the system.
     */
    accessScopeLine(p) {
        if (!p.target_server_uuid) {
            return `<span class="text-amber-600 dark:text-amber-400"><i class="fas fa-triangle-exclamation mr-1"></i>No server named — server access would apply to every configuration.</span>`;
        }
        // pipeline-get resolves the name; a row it could not find has been deleted
        // since the request was raised. Older payloads omit target_server
        // entirely, which is not the same thing as "deleted".
        if (p.target_server && p.target_server.exists === false) {
            return `<span class="text-danger"><i class="fas fa-triangle-exclamation mr-1"></i>The named configuration <code>${this.esc(p.target_server_uuid)}</code> no longer exists — server access granted now would apply to nothing.</span>`;
        }
        return `<span class="text-text-muted">Server access limited to ${this.serverIdentity(p)}</span>`;
    }

    /** Name plus uuid for a request's target server, with however much we know. */
    serverIdentity(p) {
        const ts = p.target_server;
        const uuid = p.target_server_uuid || '';
        if (!ts || !ts.name) return `<code>${this.esc(uuid)}</code>`;
        const bits = [ts.status, ts.location, ts.rack_position].filter(Boolean).join(' · ');
        return `<span class="font-medium text-text-primary">${this.esc(ts.name)}</span>`
            + (bits ? ` <span class="text-text-muted">(${this.esc(bits)})</span>` : '')
            + ` <code class="text-text-muted">${this.esc(uuid)}</code>`;
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
                    <div data-reassign-form="${stage.id}" class="hidden pt-1">
                        <div class="flex flex-wrap items-center gap-2">
                            <select data-reassign-type="${stage.id}" class="px-3 py-2 text-sm border border-border rounded-lg bg-surface-card text-text-primary">
                                <option value="role">Team (role)</option>
                                <option value="user">Person</option>
                            </select>
                            <select data-reassign-id="${stage.id}" class="px-3 py-2 text-sm border border-border rounded-lg bg-surface-card text-text-primary flex-1"></select>
                            <button data-act="reassign-apply" data-stage="${stage.id}" class="px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-600">Apply</button>
                        </div>
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
        this.componentData = { cpu: [], ram: [], storage: [], motherboard: [], nic: [], caddy: [], chassis: [], pciecard: [], risercard: [], hbacard: [] };
        const paths = {
            cpu: '/ims-data/cpu/Cpu-details-level-3.json',
            ram: '/ims-data/ram/ram_detail.json',
            storage: '/ims-data/storage/storage-level-3.json',
            motherboard: '/ims-data/motherboard/motherboard-level-3.json',
            nic: '/ims-data/nic/nic-level-3.json',
            caddy: '/ims-data/caddy/caddy_details.json',
            chassis: '/ims-data/chassis/chasis-level-3.json',
            pciecard: '/ims-data/pciecard/pci-level-3.json',
            risercard: '/ims-data/risercard/riser-level-3.json',
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
        const types = ['cpu', 'ram', 'storage', 'motherboard', 'nic', 'caddy', 'chassis', 'pciecard', 'risercard', 'hbacard'];
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
        typeSel.addEventListener('change', () => {
            this.fillComponentUUIDs(typeSel.value, uuidSel);
            this.updateItemsSummary();
        });
        uuidSel.addEventListener('change', () => this.updateItemsSummary());
        row.querySelector('.ci-remove').addEventListener('click', () => {
            row.remove();
            this.updateItemsSummary();
        });
        this.updateItemsSummary();
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
