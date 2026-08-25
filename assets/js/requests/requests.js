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
        // The catalogue of actions an approval can perform, served from the
        // backend's own RequestActionExecutor registry. A request type's ceiling
        // is resolved against this, so without it no type can offer any action.
        this.actionTypes = [];
        this.users = [];
        this.roles = [];
        this.componentData = null;
        // The embedded Add Component form, while an inventory action is being
        // built. Its collectFormData() becomes the action payload.
        this.inventoryForm = null;
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
        // The request a new one is being raised as a PREREQUISITE for, while the
        // create form is open. Set by showCreate(parent), read by submitCreate().
        this.parentContext = null;
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
            this.actionTypes = (t.success && t.data?.action_types) ? t.data.action_types : [];
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
                            ${p.last_attempt_failed ? `
                            <span class="text-[11px] text-danger bg-danger-light border border-danger rounded px-2 py-0.5"
                                title="The last approval was rolled back. Open the request for the reason.">
                                <i class="fas fa-rotate-left"></i> Last attempt failed
                            </span>` : ''}
                            ${p.is_blocked ? `
                            <span class="text-[11px] text-amber-600 dark:text-amber-400 bg-surface-secondary border border-border rounded px-2 py-0.5"
                                title="Waiting on a prerequisite request. Open it to see which.">
                                <i class="fas fa-lock"></i> Blocked
                            </span>` : ''}
                            ${p.parent_ticket_number ? `
                            <span class="text-[11px] text-text-muted bg-surface-secondary border border-border rounded px-2 py-0.5"
                                title="Raised as a prerequisite for #${this.esc(p.parent_ticket_number)}">
                                <i class="fas fa-link"></i> for #${this.esc(p.parent_ticket_number)}
                            </span>` : ''}
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
                    <span class="text-[11px] ${p.is_blocked ? 'text-amber-600 dark:text-amber-400' : 'text-text-muted'} shrink-0">${p.progress ? `${p.progress.done}/${p.progress.total}` : ''} steps${p.is_blocked ? ' &middot; frozen' : ''}</span>
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
    async showCreate(parent = null) {
        if (!this.perms.create && !this.perms.manage) return;
        const activeTypes = this.types.filter((t) => t.is_active !== 0);
        if (activeTypes.length === 0) {
            return this.toast('No active request types. Ask an admin to create one first.', 'warning');
        }
        await Promise.all([this.loadComponentData(), this.loadServers()]);

        // Raised from inside another request. Both modals sit at the same
        // z-index, so the detail one has to go before this one appears.
        this.parentContext = parent;
        if (parent) this.closeModal('detailModal');

        const body = document.getElementById('modalBody');
        document.getElementById('modalTitle').textContent = parent ? 'New Prerequisite Request' : 'New Request';

        // Said at the TOP of the form, because it changes what the request
        // means rather than being a detail to discover after submitting it.
        const parentChip = parent ? `
            <div class="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-border bg-surface-hover">
                <i class="fas fa-link text-primary mt-0.5"></i>
                <div class="text-sm min-w-0">
                    <div class="text-text-primary">Prerequisite for
                        <span class="font-mono text-xs font-semibold text-primary">#${this.esc(parent.ticket_number)}</span>
                        &mdash; ${this.esc(parent.title)}
                    </div>
                    <div class="text-xs text-text-muted mt-1">
                        That request stays frozen until this one is resolved, and still needs its own
                        approval afterwards. Resolving this does not approve it.
                    </div>
                </div>
            </div>` : '';

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

        // Deliberately a <div>, not a <form>: an inventory action mounts the real
        // Add Component form inside it, and the HTML parser drops a nested <form>
        // start tag — which would leave add-form.js with no #addComponentForm to
        // bind to. submitCreate() already validates type and title itself, so
        // native form validation is not doing any work here.
        body.innerHTML = `
            <div id="pipelineForm" class="space-y-4">
                ${parentChip}
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

                    <!-- What this request will DO once approved. Populated by
                         applyRequestType() from the chosen type's action ceiling.
                         Hidden for a type whose approval performs nothing. -->
                    <div id="plActionRow" class="hidden">
                        <label for="plAction" class="${EYEBROW}">What should happen <span class="text-danger">*</span></label>
                        <select id="plAction" class="${SELECT}"></select>
                        <p id="plActionHint" class="text-xs text-text-muted mt-1"></p>
                        <div id="plActionFields" class="space-y-3 mt-3"></div>
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
                                        <p id="plItemsHint" class="text-xs text-text-muted">Hardware this request involves. Optional.</p>
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
                    <label for="plDescription" class="block text-sm font-medium text-text-primary mb-1">Description</label>
                    <textarea id="plDescription" rows="3" placeholder="What needs to happen, and why? (optional)"
                        class="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"></textarea>
                </div>

                <div class="flex justify-end gap-3 pt-3 border-t border-border">
                    <button type="button" id="plCancel" class="px-5 py-2 border border-border rounded-lg hover:bg-surface-hover text-text-primary">Cancel</button>
                    <button type="button" id="plSubmit" class="px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary-600 flex items-center gap-2">
                        <i class="fas fa-play"></i> Create request
                    </button>
                </div>
            </div>`;

        document.getElementById('modalContainer').classList.remove('hidden');
        this.titleTouched = false;
        // The action ceiling of the chosen request type, and which of its actions
        // this request is building. A type usually allows exactly one.
        this.actionCeiling = [];
        this.actionType = '';
        this.inventoryForm = null;

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
        document.getElementById('plItemsTrigger').addEventListener('click', () => this.togglePopover('items'));
        document.getElementById('plCancel').addEventListener('click', () => this.closeModal('modalContainer'));
        document.getElementById('plAddComponent').addEventListener('click', () => this.addComponentItem());
        document.getElementById('plType').addEventListener('change', (e) => this.previewType(e.target.value));
        document.getElementById('plAction').addEventListener('change', (e) => this.setActionType(e.target.value));
        document.getElementById('plSubmit').addEventListener('click', () => this.submitCreate());
    }

    // ----- Popovers ----------------------------------------------------------
    /**
     * The three questions that used to stretch the create form: which access,
     * which server, which components. Each is answered in a panel that overlays
     * the form, and only one is open at a time.
     */
    static get POPOVERS() {
        return ['server', 'items'];
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
            text.textContent = this.servers.length
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
            hint.textContent = (this.actionNeedsServer(this.actionType)
                ? 'Pick the server this should happen on. '
                : '') + capped;
            hint.textContent = hint.textContent.trim();
            return;
        }
        hint.textContent = capped;
    }

    /**
     * Forget which server was picked.
     *
     * Not cosmetic: submitCreate() sends target_server_uuid whenever one is
     * selected, so a choice made under a previous request type would otherwise
     * ride along and name a server the request has nothing to do with.
     */
    clearServerSelection() {
        document.querySelectorAll('input[name="plServerPick"]:checked')
            .forEach((input) => { input.checked = false; });
    }

    /**
     * The Components list is free-form context for a plain tracking request. An
     * action carries its own component fields, so showing both would ask the same
     * question twice, in two places, with only one of them reaching the executor.
     */
    setItemsRowVisible(visible) {
        const row = document.getElementById('plItemsRow');
        if (row) row.classList.toggle('hidden', !visible);

        if (!visible) {
            const list = document.getElementById('plComponents');
            if (list) list.innerHTML = '';
            this.updateItemsSummary();
        }
    }

    /**
     * The picker asks a different question depending on what the chosen type
     * does, so its label and its "any server" row follow — and when the answer
     * would mean nothing it is not asked at all.
     *
     * 'action'     — the action names one configuration; required.
     * 'standalone' — a plain tracking request; optional context.
     * 'none'       — the action has no server (an inventory record, a brand-new
     *                build). Asking would invite an answer that is then silently
     *                dropped, so the row goes away and the selection is cleared.
     */
    setServerPickerMode(mode) {
        const row = document.getElementById('plServerRow');
        if (row) row.classList.toggle('hidden', mode === 'none');

        if (mode === 'none') this.clearServerSelection();

        const label = document.getElementById('plServerLabel');
        if (label) {
            label.innerHTML = mode === 'action'
                ? 'Which server <span class="text-danger">*</span>'
                : 'Server this request is about';
        }

        const anyRow = document.getElementById('plServerAnyOption');
        if (anyRow) {
            // "Any server" was a grant SCOPE — it never meant anything for a
            // single action, which has to name the one machine it changes.
            anyRow.classList.add('hidden');
            // A leftover system-wide ask must not survive into a request type that
            // cannot grant it.
            const anyInput = anyRow.querySelector('input');
            if (anyInput) anyInput.checked = false;
        }
        this.updateServerSelection();
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

    /**
     * Write the Title from what the form now knows: the type, the action being
     * built, and the server it names. A queue full of "test" and "need access"
     * tells an approver nothing.
     *
     * Built from the action's own fields rather than a verb table — there is one
     * phrasing per action type, and it belongs next to the action.
     */
    composeTitle() {
        const typeId = document.getElementById('plType')?.value || '';
        const type = this.types.find((t) => String(t.id) === String(typeId));
        if (!type) return '';

        const who = this.currentUsername ? ` — ${this.currentUsername}` : '';
        const uuid = this.selectedServerUuid();
        const picked = this.servers.find((srv) => srv.config_uuid === uuid);
        const serverName = uuid ? (picked?.server_name || uuid) : '';

        // A plain tracking type performs nothing, so its name is the subject.
        if (!this.actionType) {
            return `${type.name}${serverName ? ` for ${serverName}` : ''}${who}`;
        }

        const action = this.collectAction();
        const p = (action && action.payload) || {};
        const where = serverName ? ` on ${serverName}` : '';
        const model = p.component_type ? p.component_type.toUpperCase() : 'a component';

        let what;
        switch (this.actionType) {
            case 'server.component.add':     what = `Fit ${model}${where}`; break;
            case 'server.component.remove':  what = `Remove ${model}${where}`; break;
            case 'server.component.replace': what = `Swap ${model}${where}`; break;
            case 'server.config.create':     what = `New server${p.server_name ? ` "${p.server_name}"` : ''}`; break;
            case 'server.config.update':     what = `Update details${where}`; break;
            case 'server.config.transition': what = `Set${where || ' server'} to ${p.to_status || 'a new status'}`; break;
            case 'inventory.component.add':  what = `Add ${model} to inventory`; break;
            case 'inventory.component.edit': what = `Update ${model} inventory record`; break;
            default:                         what = type.name;
        }

        return `${what}${who}`;
    }

    /** ['CPU','RAM','SFP'] -> 'CPU, RAM and SFP' */
    joinList(items) {
        if (items.length <= 1) return items.join('');
        return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
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

    /**
     * Shape the form around what the chosen request type can actually DO.
     *
     * A type's approval step carries an `execute_request` effect whose
     * `action_types` list is its ceiling. That list drives everything below: the
     * action dropdown, which fields appear, and whether the server question is
     * asked at all.
     *
     * A type with no such effect performs nothing, so there is no ceiling to
     * shape it and the type's own asks_for_server / asks_for_components settle
     * the two optional questions. They apply ONLY here: a type that performs an
     * action asks whatever that action needs, which is the stronger signal.
     */
    applyRequestType(type) {
        this.actionCeiling = this.typeActionCeiling(type);
        this.actionType = '';
        this.inventoryForm = null;

        const row = document.getElementById('plActionRow');
        const select = document.getElementById('plAction');
        const fields = document.getElementById('plActionFields');
        if (!row || !select || !fields) return;

        if (!this.actionCeiling.length) {
            row.classList.add('hidden');
            select.innerHTML = '';
            fields.innerHTML = '';
            // Nothing is performed, so there is no action to shape the form and
            // the TYPE answers instead: a request to be let through a door is
            // about neither a server nor a parts list, while a general one is
            // about both. Absent — before seeder 2026_08_25_009, or with no type
            // chosen yet — reads as 1, which is what this branch always did.
            this.setServerPickerMode(type?.asks_for_server === 0 ? 'none' : 'standalone');
            this.setItemsRowVisible(type?.asks_for_components !== 0);
            this.autoTitle();
            return;
        }

        row.classList.remove('hidden');

        // A type normally allows exactly one action, so there is nothing to
        // choose — preselect it and let the dropdown just say what will happen.
        const options = this.actionCeiling.map((a) =>
            `<option value="${this.esc(a.action_type)}">${this.esc(a.label)}</option>`).join('');
        select.innerHTML = this.actionCeiling.length === 1
            ? options
            : `<option value="">Choose what should happen...</option>${options}`;

        this.setActionType(this.actionCeiling.length === 1 ? this.actionCeiling[0].action_type : '');
    }

    /**
     * The actions a request type may perform, resolved against the catalogue the
     * backend serves from RequestActionExecutor's own registry.
     *
     * Anything in a type's ceiling that the catalogue does not recognise is
     * dropped rather than offered: the executor would refuse it anyway, and a
     * dropdown entry that always fails is worse than one that is missing.
     */
    typeActionCeiling(type) {
        const stage = (type && type.stages || []).find((s) => s.effect_type === 'execute_request');
        if (!stage || !stage.effect_config) return [];

        let config;
        try {
            config = typeof stage.effect_config === 'string'
                ? JSON.parse(stage.effect_config)
                : stage.effect_config;
        } catch (e) {
            return [];
        }
        if (!config || !Array.isArray(config.action_types)) return [];

        const catalogue = this.actionTypes || [];
        return config.action_types
            .map((t) => catalogue.find((a) => a.action_type === t))
            .filter(Boolean);
    }

    /**
     * Fill the relocate form's Location dropdown, and wire it to the Rack one.
     *
     * This is the cascade: choose Jaipur and the Rack dropdown lists Jaipur's
     * racks and nothing else. Without it a requester could name a rack at one
     * site and a location at another, and the backend would (correctly) refuse
     * the whole request at approval time — after an admin had already looked at
     * it. Better to make the impossible unpickable.
     */
    async fillRelocateLocations() {
        const locationSelect = document.getElementById('plRelocateLocation');
        const rackSelect = document.getElementById('plRelocateRack');
        if (!locationSelect) return;

        let locations = [];
        try {
            const result = await api.locations.list();
            locations = (result?.success && result.data?.locations) || [];
        } catch (error) {
            locations = [];
        }

        if (!locations.length) {
            locationSelect.innerHTML = '<option value="">No locations available</option>';
            locationSelect.disabled = true;
            return;
        }

        locationSelect.innerHTML = '<option value="">Choose a location...</option>' + locations.map(loc =>
            `<option value="${this.esc(loc.location_uuid)}" data-name="${this.esc(loc.name)}">${this.esc(loc.name)}</option>`
        ).join('');
        locationSelect.disabled = false;

        locationSelect.addEventListener('change', async () => {
            if (!rackSelect) return;
            const locationUuid = locationSelect.value;

            if (!locationUuid) {
                rackSelect.innerHTML = '<option value="">Choose a location first</option>';
                return;
            }

            rackSelect.innerHTML = '<option value="">Loading racks\u2026</option>';
            let racks = [];
            try {
                const result = await api.locations.racks(locationUuid);
                racks = (result?.success && result.data?.racks) || [];
            } catch (error) {
                racks = [];
            }

            // The user may have changed the location while this was loading.
            if (locationSelect.value !== locationUuid) return;

            if (!racks.length) {
                rackSelect.innerHTML = '<option value="">No racks at this location</option>';
                return;
            }

            // Blank stays available on purpose: "move it to the site, leave it
            // out of a rack" is a real request.
            rackSelect.innerHTML = '<option value="">-- No rack --</option>' + racks.map(rack => {
                const floor = rack.floor ? ` \u00b7 Floor ${this.esc(rack.floor)}` : '';
                return `<option value="${this.esc(rack.rack_uuid)}" data-name="${this.esc(rack.name)}">${this.esc(rack.name)}${floor} (${rack.free_u}U free of ${rack.total_u}U)</option>`;
            }).join('');
        });
    }

    /** Which action this request is building, and the fields it needs. */
    setActionType(actionType) {
        this.actionType = actionType || '';
        this.inventoryForm = null;

        const hint = document.getElementById('plActionHint');
        const fields = document.getElementById('plActionFields');
        if (!fields) return;

        fields.innerHTML = this.actionType ? this.actionFieldsHTML(this.actionType) : '';

        // Adding to inventory needs the real Add Component form — its cascading
        // dropdowns are what produce a UUID the executor will accept. Mounted
        // rather than reimplemented, so there is one such form, not two.
        if (this.actionType === 'inventory.component.add') {
            this.mountInventoryForm();
        }
        if (this.actionType === 'server.relocate') {
            this.fillRelocateLocations();
        }
        // The create/update forms ask for a location by NAME (that is the column
        // they write), so they get the same list rendered with names as values.
        fields.querySelectorAll('[data-location-name-select]').forEach((el) => {
            api.locations.populateSelect(el, { placeholder: el.options[0]?.text || 'Optional' });
        });
        if (hint) {
            hint.textContent = this.actionType
                ? 'An admin approves, and the system does this for you. You are not given access to anything.'
                : '';
        }

        // Server actions name a configuration; the rest do not, so the server
        // question is asked only where it means something — and where it means
        // nothing it is removed rather than demoted to optional.
        const needsServer = this.actionNeedsServer(this.actionType);
        this.setServerPickerMode(needsServer ? 'action' : 'none');
        this.setItemsRowVisible(false);

        fields.querySelectorAll('[data-action-field]').forEach((el) => {
            el.addEventListener('change', () => {
                if (el.dataset.actionField === 'component_type') this.fillActionModels();
                this.autoTitle();
            });
            el.addEventListener('input', () => this.autoTitle());
        });

        this.fillActionModels();
        this.autoTitle();
    }

    /**
     * Mount the real Add Component form for an inventory action.
     *
     * The fragment and its script are the same pair the dashboard's Add
     * Component modal loads (see dashboard.showAddForm()), initialised with no
     * preselected type so its own component-type dropdown stays in play. It runs
     * embedded: this modal owns submission, and collectAction() harvests the
     * fields through the form's own collectFormData().
     *
     * Mounted rather than reimplemented because the cascading dropdowns are what
     * produce a UUID that exists in ims-data — a hand-typed one is rejected.
     */
    async mountInventoryForm() {
        if (!document.getElementById('plInventoryMount')) return;

        try {
            const response = await fetch('../../pages/forms/add-component.html');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();

            // The requester may have moved to another type while this was in
            // flight; mounting now would leave a form nothing reads.
            if (this.actionType !== 'inventory.component.add') return;
            const mount = document.getElementById('plInventoryMount');
            if (!mount) return;
            mount.innerHTML = html;

            await this.loadAddFormScript();
            if (this.actionType !== 'inventory.component.add') return;
            if (typeof initializeAddComponentForm !== 'function') {
                throw new Error('initializeAddComponentForm is unavailable');
            }

            this.inventoryForm = initializeAddComponentForm(null, { embedded: true });

            // The composed title names the component type, so it has to hear
            // about it — the form's own fields are outside autoTitle()'s reach.
            const typeSelect = document.getElementById('componentType');
            if (typeSelect) typeSelect.addEventListener('change', () => this.autoTitle());
        } catch (e) {
            const mount = document.getElementById('plInventoryMount');
            if (mount) {
                mount.innerHTML = `<p class="text-xs text-danger">Could not load the component form. Close this and reopen the request to try again.</p>`;
            }
        }
    }

    /** Load add-form.js once, the same way the dashboard's Add modal does. */
    loadAddFormScript() {
        const src = '../../assets/js/forms/add-form.js';
        if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load add-form.js'));
            document.body.appendChild(script);
        });
    }

    /** Does this action operate on an existing server configuration? */
    actionNeedsServer(actionType) {
        return [
            'server.component.add',
            'server.component.remove',
            'server.component.replace',
            'server.config.update',
            'server.config.transition',
            'server.relocate'
        ].includes(actionType);
    }

    /**
     * The parameters for one action.
     *
     * Adding to inventory needs the real Add Component form, whose four-level
     * dropdowns know each component type's own shape — so that form is mounted
     * here rather than reimplemented, and this returns only its mount point.
     * A cut-down copy would be a second, worse form for the same job.
     *
     * Correcting a record still starts from the record: Update Inventory Record
     * points at the Edit Component screen, which already knows which row it is
     * on and raises the request itself when the user cannot write directly.
     */
    actionFieldsHTML(actionType) {
        const INPUT = 'w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary';
        const LABEL = 'block text-xs font-medium text-text-secondary mb-1';

        const componentPair = (typeField, modelField, modelLabel) => `
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label class="${LABEL}">Component type <span class="text-danger">*</span></label>
                    <select data-action-field="${typeField}" class="${INPUT}">
                        <option value="">Choose a type...</option>
                        ${this.actionComponentTypeOptions()}
                    </select>
                </div>
                <div>
                    <label class="${LABEL}">${modelLabel} <span class="text-danger">*</span></label>
                    <select data-action-field="${modelField}" class="${INPUT}">
                        <option value="">Choose a type first</option>
                    </select>
                </div>
            </div>`;

        switch (actionType) {
            case 'server.component.add':
                return `
                    ${componentPair('component_type', 'component_uuid', 'Model')}
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="${LABEL}">Serial number</label>
                            <input type="text" data-action-field="serial_number" maxlength="100" class="${INPUT}"
                                placeholder="Leave blank to let the system pick a free unit">
                        </div>
                        <div>
                            <label class="${LABEL}">Slot position</label>
                            <input type="text" data-action-field="slot_position" maxlength="50" class="${INPUT}" placeholder="Optional">
                        </div>
                    </div>`;

            case 'server.component.remove':
                return `
                    ${componentPair('component_type', 'component_uuid', 'Model')}
                    <div>
                        <label class="${LABEL}">Serial number</label>
                        <input type="text" data-action-field="serial_number" maxlength="100" class="${INPUT}"
                            placeholder="Which unit, when the build has more than one of this model">
                    </div>`;

            case 'server.component.replace':
                return `
                    ${componentPair('component_type', 'old_component_uuid', 'Model to take out')}
                    <div>
                        <label class="${LABEL}">Model to put in <span class="text-danger">*</span></label>
                        <select data-action-field="new_component_uuid" class="${INPUT}">
                            <option value="">Choose a type first</option>
                        </select>
                    </div>
                    <div>
                        <label class="${LABEL}">Serial number of the unit coming out</label>
                        <input type="text" data-action-field="old_serial_number" maxlength="100" class="${INPUT}" placeholder="Optional">
                    </div>`;

            case 'server.config.create':
                return `
                    <div>
                        <label class="${LABEL}">Server name <span class="text-danger">*</span></label>
                        <input type="text" data-action-field="server_name" maxlength="150" class="${INPUT}" placeholder="e.g. web-prod-04">
                    </div>
                    <div>
                        <label class="${LABEL}">Location</label>
                        <select data-action-field="location" class="${INPUT}" data-location-name-select>
                            <option value="">Optional</option>
                        </select>
                    </div>
                    <div>
                        <label class="${LABEL}">Description</label>
                        <input type="text" data-action-field="description" maxlength="255" class="${INPUT}" placeholder="Optional">
                    </div>
                    <p class="text-xs text-text-muted">The rack and U position are set when the server is placed in a rack \u2014 ask for a move once it exists.</p>`;

            case 'server.config.update':
                return `
                    <p class="text-xs text-text-muted">Fill in only what should change. Anything left blank is left alone.</p>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="${LABEL}">New name</label>
                            <input type="text" data-action-field="server_name" maxlength="150" class="${INPUT}">
                        </div>
                        <div>
                            <label class="${LABEL}">Location</label>
                            <select data-action-field="location" class="${INPUT}" data-location-name-select>
                                <option value="">Leave unchanged</option>
                            </select>
                        </div>
                        <div>
                            <label class="${LABEL}">Description</label>
                            <input type="text" data-action-field="description" maxlength="255" class="${INPUT}">
                        </div>
                    </div>
                    <div>
                        <label class="${LABEL}">Notes</label>
                        <input type="text" data-action-field="notes" maxlength="255" class="${INPUT}">
                    </div>`;

            case 'server.relocate':
                // Location first, then the racks AT that location, then the U.
                // The same order as the Move server dialog on the server card,
                // because it is the same decision.
                return `
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="${LABEL}">Location <span class="text-danger">*</span></label>
                            <select data-action-field="location_uuid" class="${INPUT}" id="plRelocateLocation">
                                <option value="">Loading locations\u2026</option>
                            </select>
                        </div>
                        <div>
                            <label class="${LABEL}">Rack</label>
                            <select data-action-field="rack_uuid" class="${INPUT}" id="plRelocateRack">
                                <option value="">Choose a location first</option>
                            </select>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="${LABEL}">Start U</label>
                            <input type="number" min="1" max="100" data-action-field="start_u" class="${INPUT}" placeholder="e.g. 21">
                        </div>
                        <div>
                            <label class="${LABEL}">Reason</label>
                            <input type="text" data-action-field="reason" maxlength="255" class="${INPUT}" placeholder="Optional">
                        </div>
                    </div>
                    <p class="text-xs text-text-muted">Every component installed in the server moves with it. Leave the rack blank to ask for it to be moved to the site but left out of a rack. The position is checked against the rack when the request is approved, so a slot that fills up in the meantime means the move is refused rather than forced.</p>`;

            case 'server.config.transition':
                return `
                    <div>
                        <label class="${LABEL}">New status <span class="text-danger">*</span></label>
                        <select data-action-field="to_status" class="${INPUT}">
                            <option value="">Choose a status...</option>
                            ${['draft', 'building', 'validating', 'validated', 'finalized', 'deployed', 'maintenance', 'retired']
                                .map((v) => `<option value="${v}">${v.charAt(0).toUpperCase() + v.slice(1)}</option>`).join('')}
                        </select>
                        <p class="text-xs text-text-muted mt-1">
                            The same lifecycle rules apply as when anyone makes the change directly —
                            an illegal move is refused and the approval is rolled back.
                        </p>
                    </div>
                    <div>
                        <label class="${LABEL}">Why</label>
                        <input type="text" data-action-field="notes" maxlength="255" class="${INPUT}" placeholder="Optional">
                    </div>`;

            case 'inventory.component.add':
                // The real Add Component form is mounted here by
                // mountInventoryForm() once its fragment has been fetched.
                return `<div id="plInventoryMount"><p class="text-xs text-text-muted">Loading the component form...</p></div>`;

            case 'inventory.component.edit':
                return `
                    <div class="px-3 py-2 rounded-lg border border-border bg-surface-hover text-xs text-text-secondary">
                        <i class="fas fa-arrow-right-from-bracket mr-1.5 text-text-muted"></i>
                        Raise this from the <span class="font-medium text-text-primary">Edit Component</span> screen
                        instead — correcting a record starts from the record itself, and that form is already sitting
                        on it. If you cannot edit directly, it submits the request for you.
                    </div>`;
        }
        return '';
    }

    /**
     * The 11 component types, as options for an ACTION field.
     *
     * Named apart from componentTypeOptions(types), which serves the item picker
     * and takes an explicit list — two same-named methods in one class body
     * collapse into whichever is declared last, silently.
     */
    actionComponentTypeOptions() {
        return Object.keys(this.componentSpecPaths())
            .map((t) => `<option value="${t}">${this.esc(this.componentTypeLabel(t))}</option>`).join('');
    }

    /**
     * Fill every model dropdown from the chosen component type's catalogue.
     *
     * Models come from the static ims-data files, which need no permission — the
     * requester is naming a piece of hardware, not reading inventory.
     */
    fillActionModels() {
        const fields = document.getElementById('plActionFields');
        if (!fields) return;

        const typeSel = fields.querySelector('[data-action-field="component_type"]');
        const type = typeSel ? typeSel.value : '';
        const models = (type && this.componentData && this.componentData[type]) || [];

        fields.querySelectorAll('[data-action-field$="component_uuid"]').forEach((sel) => {
            const keep = sel.value;
            if (!type) {
                sel.innerHTML = '<option value="">Choose a type first</option>';
                return;
            }
            sel.innerHTML = '<option value="">Choose a model...</option>'
                + models.map((m) => {
                    const label = [m.brand, m.name].filter(Boolean).join(' ') || m.uuid;
                    return `<option value="${this.esc(m.uuid)}">${this.esc(label)}</option>`;
                }).join('');
            if (keep) sel.value = keep;
        });
    }

    /**
     * The action this request will perform, as {action_type, payload}, or null.
     *
     * Blank optional fields are omitted rather than sent empty: the executor
     * rejects an unexpected parameter outright, and for server.config.update an
     * empty string would mean "set this field to nothing" rather than "leave it
     * alone".
     */
    collectAction() {
        if (!this.actionType) return null;

        // The embedded Add Component form holds its own fields, so it reports
        // them itself — the same payload a direct add would have sent, which is
        // what makes one validation path serve both routes.
        if (this.actionType === 'inventory.component.add') {
            if (!this.inventoryForm || !this.inventoryForm.currentComponentType) return null;

            const data = Object.assign({}, this.inventoryForm.collectFormData());
            delete data.action;   // the request names the action; the payload is fields only

            return {
                action_type: this.actionType,
                payload: {
                    component_type: this.inventoryForm.currentComponentType,
                    data: data
                }
            };
        }

        const fields = document.getElementById('plActionFields');
        const payload = {};
        if (fields) {
            fields.querySelectorAll('[data-action-field]').forEach((el) => {
                const value = (el.value || '').trim();
                if (value !== '') payload[el.dataset.actionField] = value;
            });
        }

        if (this.actionNeedsServer(this.actionType)) {
            const uuid = this.selectedServerUuid();
            if (uuid) payload.config_uuid = uuid;
        }

        // server.config.update carries its changes in a nested object, because
        // "which fields did they mean to change" has to survive to the executor.
        // The names ride along so the request list and the approver's
        // confirmation can read "move to Jaipur Office - RACK 12 - U8" without a
        // join. They are display-only: the executor moves by uuid.
        if (this.actionType === 'server.relocate') {
            const locationSelect = document.getElementById('plRelocateLocation');
            const rackSelect = document.getElementById('plRelocateRack');
            const locName = locationSelect?.selectedOptions?.[0]?.dataset?.name;
            const rackName = rackSelect?.selectedOptions?.[0]?.dataset?.name;
            if (locName) payload.location_name = locName;
            if (rackName) payload.rack_name = rackName;
        }

        if (this.actionType === 'server.config.update') {
            // rack_position removed 2026-08-26: it is derived from the real rack
            // placement, and the executor no longer writes it.
            const editable = ['server_name', 'description', 'location', 'notes'];
            const changes = {};
            editable.forEach((f) => {
                if (payload[f] !== undefined) {
                    changes[f] = payload[f];
                    delete payload[f];
                }
            });
            payload.fields = changes;
        }

        return { action_type: this.actionType, payload };
    }

    /**
     * What is missing before this request can be submitted.
     *
     * Mirrors the executor's required-field list. It is a courtesy, not a
     * boundary — the backend shape-checks and dry-runs every action regardless.
     */
    actionProblems() {
        if (!this.actionCeiling.length) return [];
        if (!this.actionType) return ['Choose what should happen'];

        // The embedded form already knows which of its fields are required for
        // the chosen component type, and says which one is missing.
        if (this.actionType === 'inventory.component.add') {
            if (!this.inventoryForm || !this.inventoryForm.currentComponentType) {
                return ['Choose a component type and fill in its details'];
            }
            // validateForm() focuses the offending field and names it in a toast
            // of its own, so the blocker is reported — an empty string here says
            // "stop, already explained" without stacking a second, vaguer toast.
            return this.inventoryForm.validateForm() ? [] : [''];
        }

        if (this.actionType === 'inventory.component.edit') {
            return ['Raise this from the Edit Component screen instead'];
        }

        const action = this.collectAction();
        const p = action ? action.payload : {};
        const problems = [];

        if (this.actionNeedsServer(this.actionType) && !p.config_uuid) {
            problems.push('Pick which server this is about');
        }

        const REQUIRED = {
            'server.component.add': ['component_type', 'component_uuid'],
            'server.component.remove': ['component_type', 'component_uuid'],
            'server.component.replace': ['component_type', 'old_component_uuid', 'new_component_uuid'],
            'server.config.create': ['server_name'],
            'server.config.transition': ['to_status']
        };
        (REQUIRED[this.actionType] || []).forEach((f) => {
            if (!p[f]) problems.push(`${f.replace(/_/g, ' ')} is required`);
        });

        if (this.actionType === 'server.config.update'
            && (!p.fields || Object.keys(p.fields).length === 0)) {
            problems.push('Change at least one detail');
        }

        return problems;
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
        const items = this.collectComponentItems();

        if (!pipeline_template_id) return this.toast('Choose a request type', 'error');
        if (!title) return this.toast('Title is required', 'error');

        // A half-filled action would be refused by the backend anyway — it
        // shape-checks every action and dry-runs the command-backed ones — but
        // saying so here means the requester fixes it while still looking at the
        // field rather than after a round trip.
        const problems = this.actionProblems();
        if (problems.length) {
            // An empty message means the field's own form already said what is
            // wrong and put the cursor in it.
            if (problems[0]) this.toast(problems[0], 'error');
            return;
        }

        const fields = { pipeline_template_id, title, description, priority, items: JSON.stringify(items) };
        if (target_server_uuid) fields.target_server_uuid = target_server_uuid;

        const action = this.collectAction();
        if (action) fields.actions = JSON.stringify([action]);

        const parent = this.parentContext;
        if (parent) fields.parent_ticket_id = parent.id;

        try {
            const result = await this.apiPost('pipeline-create', fields);
            if (!result.success) {
                const msg = result.data?.errors?.length ? result.data.errors.join('; ') : (result.message || 'Failed to create');
                return this.toast(msg, 'error');
            }
            this.toast(parent ? 'Prerequisite raised' : 'Request created', 'success');
            this.closeModal('modalContainer');
            this.parentContext = null;
            this.load();
            // Back to the PARENT, not the new child: the frozen request is where
            // the user came from, and it now shows the prerequisite it is
            // waiting on. The child is one click away from there.
            if (parent) this.openDetail(parent.id);
            else if (result.data?.pipeline_id) this.openDetail(result.data.pipeline_id);
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
        // Historical only. A request raised before 2026-08-23 named the
        // PERMISSIONS it wanted. Nothing asks for permissions any more, so the
        // names are shown raw rather than dressed in labels describing a model
        // no longer in use — the point here is the audit trail, not the pitch.
        const asked = Array.isArray(p.requested_access) ? p.requested_access : [];
        const askedBlock = asked.length ? `
            <div class="mt-4 px-4 py-3 rounded-lg border border-border bg-surface-hover">
                <div class="text-sm font-medium text-text-primary mb-1.5">
                    <i class="fas fa-key mr-1.5 text-text-muted"></i>Access requested (historical)
                </div>
                <ul class="text-xs text-text-secondary space-y-0.5">
                    ${asked.map((a) => `<li>&bull; <code class="font-mono">${this.esc(a)}</code></li>`).join('')}
                </ul>
                <div class="text-xs text-text-muted mt-2">
                    Raised under the old model, where approval handed these permissions over for
                    24 hours. Approval now performs the work instead.
                </div>
            </div>` : '';

        // Requests raised before 2026-08-23 were granted temporary access on
        // approval. That model is retired — the grants have been removed and
        // nothing re-issues them — so this says what HAPPENED, in the past
        // tense, instead of implying anyone still holds anything.
        const grantEntry = (p.history || []).find((h) => h.action === 'access_granted');
        const accessBanner = grantEntry ? `
            <div class="mt-4 flex items-start gap-2 px-4 py-3 rounded-lg border border-border bg-surface-hover">
                <i class="fas fa-clock-rotate-left text-text-muted mt-0.5"></i>
                <div class="text-sm">
                    <div class="font-medium text-text-primary">Granted temporary access (retired)</div>
                    <div class="text-xs text-text-secondary mt-0.5">
                        This request pre-dates the change to automation. Approval used to hand out
                        permissions for 24 hours; it now performs the work instead. That access has ended.
                    </div>
                </div>
            </div>` : '';

        const actionsBlock = this.renderActionsBlock(p);

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
            ${p.description ? `<p class="text-sm text-text-secondary mt-1 whitespace-pre-wrap">${this.esc(p.description)}</p>` : ''}
            <div class="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-xs text-text-muted">
                <span><i class="fas fa-user-pen mr-1"></i>Created by ${this.esc(p.created_by?.username || 'N/A')}</span>
                ${p.target_server_uuid ? `<span title="${this.esc(p.target_server_uuid)}"><i class="fas fa-server mr-1"></i>${this.esc(p.target_server?.name || p.target_server_uuid)}</span>` : ''}
                ${p.parent ? `<span><i class="fas fa-link mr-1"></i>Prerequisite for <button type="button" data-open-request="${p.parent.id}" class="text-primary hover:underline font-medium">#${this.esc(p.parent.ticket_number)}</button></span>` : ''}
                ${p.cancel_reason ? `<span class="text-danger"><i class="fas fa-ban mr-1"></i>${this.esc(p.cancel_reason)}</span>` : ''}
            </div>
            ${this.blockedBanner(p)}
            ${actionsBlock}
            ${askedBlock}
            ${accessBanner}
            ${this.executionFailureBanner()}
            ${this.prerequisitesBlock(p)}

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
     * Why this request cannot move.
     *
     * Rendered from `blocked_by`, which the backend derives from the child rows
     * on every read rather than storing — so this banner, the list's Blocked
     * chip and the engine's own refusal can never disagree.
     *
     * A REJECTED prerequisite gets its own line because waiting will not fix it.
     * Without saying so, an approver comes back tomorrow and clicks the same
     * button.
     */
    blockedBanner(p) {
        const blockers = Array.isArray(p.blocked_by) ? p.blocked_by : [];
        if (!blockers.length) return '';

        const refused = blockers.filter((b) => b.status === 'rejected');
        const tone = refused.length ? 'border-danger bg-danger-light' : 'border-border bg-surface-secondary';
        const icon = refused.length ? 'text-danger' : 'text-amber-600 dark:text-amber-400';

        const rows = blockers.map((b) => `
            <li class="flex items-center gap-2 flex-wrap">
                <button type="button" data-open-request="${b.id}" class="font-mono text-xs font-semibold text-primary hover:underline">#${this.esc(b.ticket_number)}</button>
                <span class="text-xs text-text-secondary">${this.esc(b.pipeline_type_name || 'Request')}</span>
                ${this.statusBadge(b.status)}
                ${(b.status === 'rejected' && this.perms.manage) ? `
                    <button type="button" data-unlink-child="${b.id}"
                        class="px-2 py-0.5 text-xs border border-border rounded text-text-muted hover:bg-surface-hover transition-colors">
                        <i class="fas fa-link-slash mr-1"></i>Detach
                    </button>` : ''}
            </li>`).join('');

        const explain = refused.length
            ? 'A rejected prerequisite does not clear by itself. Reject or cancel this request, or detach the refused one so a replacement can be raised.'
            : 'No step can be completed until it is resolved. Rejecting or cancelling this request is still possible.';

        return `
            <div class="mt-4 flex items-start gap-2 px-4 py-3 rounded-lg border ${tone}">
                <i class="fas fa-lock ${icon} mt-0.5"></i>
                <div class="min-w-0">
                    <div class="text-sm font-medium text-text-primary">
                        Frozen &mdash; waiting on ${blockers.length === 1 ? 'a prerequisite' : blockers.length + ' prerequisites'}
                    </div>
                    <ul class="mt-1.5 space-y-1">${rows}</ul>
                    <div class="text-xs text-text-secondary mt-2">${explain}</div>
                </div>
            </div>`;
    }

    /**
     * Every prerequisite ever raised on this request, resolved ones included,
     * plus the button that raises another.
     *
     * Resolved ones stay listed on purpose: "this was approved because the room
     * access came through first" is the part of the story an audit needs, and it
     * disappears if the list only shows what is still outstanding.
     */
    prerequisitesBlock(p) {
        const children = Array.isArray(p.children) ? p.children : [];
        const canRaise = this.canRaisePrerequisite(p);
        if (!children.length && !canRaise) return '';

        const rows = children.map((c) => `
            <li class="flex items-start justify-between gap-3 px-3 py-2 rounded-lg border border-border ${c.blocks ? 'bg-surface-hover' : 'bg-surface-card'}">
                <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <button type="button" data-open-request="${c.id}" class="font-mono text-xs font-semibold text-primary hover:underline">#${this.esc(c.ticket_number)}</button>
                        <span class="text-xs text-text-muted">${this.esc(c.pipeline_type_name || 'Request')}</span>
                    </div>
                    <div class="text-sm text-text-primary mt-0.5">${this.esc(c.title)}</div>
                    ${(c.status === 'rejected' && c.rejection_reason)
                        ? `<div class="text-xs text-danger mt-1"><i class="fas fa-xmark mr-1"></i>${this.esc(c.rejection_reason)}</div>`
                        : ''}
                </div>
                <div class="shrink-0">${this.statusBadge(c.status)}</div>
            </li>`).join('');

        return `
            <div class="mt-5">
                <div class="flex items-center justify-between gap-3 mb-2">
                    <h4 class="text-sm font-semibold text-text-primary">Prerequisites</h4>
                    ${canRaise ? `
                        <button type="button" id="plRaisePrerequisite"
                            class="px-3 py-1.5 text-sm border border-border rounded-lg text-text-secondary hover:bg-surface-hover transition-colors flex items-center gap-1.5">
                            <i class="fas fa-plus"></i> Raise a prerequisite
                        </button>` : ''}
                </div>
                ${children.length
                    ? `<ul class="space-y-1.5">${rows}</ul>`
                    : `<p class="text-xs text-text-muted">Nothing is holding this request up. Raise a prerequisite if something has to happen first &mdash; physical room access, for example.</p>`}
            </div>`;
    }

    /**
     * Freezing somebody's request is a real imposition, so raising a
     * prerequisite on one takes more than being logged in: you must already be
     * part of it. Mirrors PipelineManager::validateParent(), which is the actual
     * gate — this only decides whether to show the button. The depth cap is left
     * to the backend, because the full chain is not in this response.
     */
    canRaisePrerequisite(p) {
        if (['completed', 'cancelled', 'rejected'].includes(p.status)) return false;
        if (!this.perms.create && !this.perms.manage) return false;
        if (this.perms.manage) return true;
        if (Number(p.created_by?.id) === Number(this.currentUserId)) return true;
        return (p.stages || []).some((s) => this.eligibleForStage(s));
    }

    /**
     * What this request will DO, in the order it will do it.
     *
     * This is the thing an approver is actually deciding about. It replaces the
     * old "Access requested" list, which named permissions the requester wanted
     * to be handed — a question nobody has to answer any more.
     *
     * `summary` is composed by the backend (RequestActionExecutor::summarise)
     * rather than here, so the request list, this panel and the audit history
     * all describe an action in exactly the same words.
     */
    renderActionsBlock(p) {
        const actions = Array.isArray(p.actions) ? p.actions : [];
        if (!actions.length) return '';

        const done = actions.every((a) => a.status === 'executed');

        const rows = actions.map((a) => {
            const failed = a.status === 'failed';
            const executed = a.status === 'executed';

            const border = failed ? 'border-danger' : 'border-border';
            const bg = failed ? 'bg-danger-light' : (executed ? 'bg-success-light' : 'bg-surface-hover');
            const icon = failed
                ? '<i class="fas fa-triangle-exclamation text-danger"></i>'
                : (executed
                    ? '<i class="fas fa-check text-success"></i>'
                    : '<i class="fas fa-hourglass-half text-text-muted"></i>');

            return `
                <li class="flex items-start gap-2 px-3 py-2 rounded-lg border ${border} ${bg}">
                    <span class="mt-0.5">${icon}</span>
                    <div class="min-w-0">
                        <div class="text-sm text-text-primary">${this.esc(a.summary || a.action_type)}</div>
                        <div class="text-xs text-text-muted mt-0.5">
                            <code class="font-mono">${this.esc(a.action_type)}</code>
                        </div>
                        ${this.renderActionPayload(a)}
                        ${this.renderActionResult(a)}
                    </div>
                </li>`;
        }).join('');

        return `
            <div class="mt-4 px-4 py-3 rounded-lg border border-border bg-surface-secondary">
                <div class="text-sm font-medium text-text-primary mb-1">
                    <i class="fas fa-bolt mr-1.5 text-text-muted"></i>${done ? 'What was performed' : 'What this will do'}
                </div>
                <div class="text-xs text-text-secondary mb-2.5">
                    ${done
                        ? 'Performed automatically when this was approved. Nobody was given access.'
                        : 'Runs automatically when the final step is approved. Nobody is given access.'}
                </div>
                <ul class="space-y-1.5">${rows}</ul>
            </div>`;
    }

    /**
     * What the requester actually entered, where the one-line summary cannot
     * carry it. "Add a cpu to inventory" is not something an approver can judge:
     * deciding whether a component belongs in inventory means seeing the
     * component. The model name arrives inside Notes, put there by the Add
     * Component form's own buildNotesWithSpecification().
     */
    renderActionPayload(a) {
        if (a.action_type !== 'inventory.component.add') return '';

        const data = (a.payload && a.payload.data) || {};
        const LABELS = {
            UUID: 'Component UUID',
            SerialNumber: 'Serial number',
            Status: 'Status',
            Location: 'Location',
            RackPosition: 'Rack position',
            PurchaseDate: 'Purchased',
            InstallationDate: 'Installed',
            WarrantyEndDate: 'Warranty ends',
            FailDate: 'Failed on',
            Flag: 'Flag',
            Notes: 'Notes'
        };
        const STATUS = { '0': 'Failed', '1': 'Available', '2': 'In use' };

        const rows = Object.keys(LABELS)
            .filter((k) => data[k] !== undefined && data[k] !== null && String(data[k]).trim() !== '')
            .map((k) => {
                const value = k === 'Status' ? (STATUS[String(data[k])] || data[k]) : data[k];
                return `<div class="text-xs">
                    <span class="text-text-muted">${this.esc(LABELS[k])}:</span>
                    <span class="text-text-secondary">${this.esc(String(value))}</span>
                </div>`;
            }).join('');

        if (!rows) return '';
        return `<div class="mt-1.5 space-y-0.5">${rows}</div>`;
    }

    /** An action's outcome: what it created, or why it refused. */
    renderActionResult(a) {
        if (!a.result) return '';

        if (a.status === 'failed') {
            const code = a.result.error_code
                ? `<code class="font-mono">${this.esc(a.result.error_code)}</code> — ` : '';
            return `<div class="text-xs text-danger mt-1">${code}${this.esc(a.result.message || 'Failed')}</div>`;
        }

        // Named facts, not raw JSON: an approver reading back what happened
        // should not have to parse an object to find the asset tag.
        const LABELS = {
            asset_tag: 'Asset tag',
            inventory_id: 'Inventory ID',
            config_uuid: 'Server',
            server_name: 'Name',
            revision: 'Revision',
            fields: 'Changed'
        };
        const facts = Object.keys(LABELS)
            .filter((k) => a.result[k] !== undefined && a.result[k] !== null && a.result[k] !== '')
            .map((k) => {
                const raw = Array.isArray(a.result[k]) ? a.result[k].join(', ') : a.result[k];
                return `${LABELS[k]}: ${this.esc(String(raw))}`;
            });

        return facts.length
            ? `<div class="text-xs text-text-secondary mt-1">${facts.join(' · ')}</div>`
            : '';
    }

    /**
     * The most recent execution attempt, but only when it FAILED.
     *
     * History arrives newest-first, so the first execution event encountered is
     * the current one. If that is `actions_executed` the request has since been
     * performed successfully and any earlier failure no longer describes it —
     * return nothing rather than leaving a red banner over a request that
     * worked. This replaces the old "clear the field on success" bookkeeping,
     * which could only ever be right within one page view.
     */
    latestExecutionFailure() {
        const history = (this.currentDetail && this.currentDetail.history) || [];

        for (const entry of history) {
            if (entry.action === 'actions_executed') return null;
            if (entry.action !== 'execution_failed') continue;

            let detail = {};
            try {
                detail = JSON.parse(entry.new_value || '{}') || {};
            } catch (e) {
                detail = {};
            }
            // notes is the fallback: a row written before new_value carried
            // structure, or one whose JSON did not survive the round trip.
            if (!detail.message) detail.message = entry.notes || '';
            return detail;
        }
        return null;
    }

    /**
     * A rolled-back approval, shown as the state of the request rather than a
     * toast that vanishes in four seconds.
     *
     * When execution fails, the whole approval is rolled back: the step is still
     * active, the request is still open, and nothing was changed. The approver
     * needs to see WHY, and that retrying is the expected next move — so this is
     * a persistent banner and the Approve button stays enabled.
     *
     * Read from the request's HISTORY, not from the approve response. The
     * response is seen once, by one person: the approver lost it on reload and
     * the requester never saw it at all, leaving them watching a request that
     * had been tried, had failed, and looked untouched. The backend writes the
     * attempt after the rollback (PipelineManager::recordExecutionFailure), so
     * the same banner now serves both of them, permanently.
     */
    executionFailureBanner() {
        const failure = this.latestExecutionFailure();
        if (!failure) return '';

        const where = failure.position
            ? `Action ${failure.position}${failure.action_type ? ` (${this.esc(failure.action_type)})` : ''}`
            : 'An action';
        const code = failure.error_code
            ? ` <code class="font-mono">${this.esc(failure.error_code)}</code>` : '';

        return `
            <div class="mt-4 flex items-start gap-2 px-4 py-3 rounded-lg border border-danger bg-danger-light">
                <i class="fas fa-rotate-left text-danger mt-0.5"></i>
                <div class="text-sm">
                    <div class="font-medium text-danger">Approval was rolled back — nothing was changed</div>
                    <div class="text-xs text-text-secondary mt-1">
                        ${where} failed:${code} ${this.esc(failure.message || 'no reason given')}
                    </div>
                    <div class="text-xs text-text-muted mt-1">
                        The request is still open and the step is still active. Fix the cause and approve again.
                    </div>
                </div>
            </div>`;
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
        // A frozen request gets no Approve/Complete/Accept button at all. A
        // disabled-looking button that 400s is worse than no button: the
        // engine refuses this anyway (PipelineManager::completeStage), so the
        // only honest thing to render is why, and the ways out that DO work.
        // Reject and Cancel stay available deliberately — they are the exits.
        if (pipeline.blocked) {
            const showReject = (this.perms.act || this.perms.manage)
                && (this.perms.manage
                    || (stage.owner && stage.owner.type === 'user' && Number(stage.owner.id) === Number(this.currentUserId))
                    || (stage.claimed_by && Number(stage.claimed_by.id) === Number(this.currentUserId)));

            return `
                <div class="mt-3 space-y-2" data-stage-actions="${stage.id}">
                    <p class="text-xs text-text-muted italic">
                        <i class="fas fa-lock mr-1"></i>This step is frozen until the prerequisite above is resolved.
                    </p>
                    ${showReject ? `
                        <div class="flex flex-wrap gap-2">
                            <button data-act="reject-toggle" data-stage="${stage.id}" class="px-3 py-1.5 text-sm border border-danger rounded-lg text-danger hover:bg-danger-light flex items-center gap-1.5"><i class="fas fa-xmark"></i> Reject</button>
                        </div>
                        <div data-reject-form="${stage.id}" class="hidden pt-1">
                            <textarea data-reject-reason="${stage.id}" rows="2" placeholder="Why are you rejecting this? The requester will see it."
                                class="w-full px-3 py-2 text-sm border border-danger rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"></textarea>
                            <div class="flex flex-wrap gap-2 mt-2">
                                <button data-act="reject" data-stage="${stage.id}" class="px-3 py-1.5 text-sm bg-danger text-white rounded-lg flex items-center gap-1.5"><i class="fas fa-xmark"></i> Confirm rejection</button>
                                <button data-act="reject-cancel" data-stage="${stage.id}" class="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-surface-hover text-text-secondary">Keep it open</button>
                            </div>
                        </div>` : ''}
                </div>`;
        }

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

        // Does completing THIS step perform the request's work? Only the step
        // carrying the effect does, and it is the one that gets an explicit
        // Approve / Reject pair — "Complete & advance" is the wrong verb for a
        // decision that fits hardware into a live machine.
        const performs = stage.effect_type === 'execute_request'
            && Array.isArray(pipeline.actions) && pipeline.actions.length > 0;
        const count = performs ? pipeline.actions.length : 0;
        const approveLabel = performs
            ? `Approve &amp; run ${count} action${count === 1 ? '' : 's'}`
            : 'Complete &amp; advance';

        return `
            <div class="mt-3 space-y-2" data-stage-actions="${stage.id}">
                ${showComplete ? `
                    <textarea data-complete-notes="${stage.id}" rows="2" placeholder="${performs ? 'Approval note (optional)' : 'Notes about what you did (optional)'}"
                        class="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"></textarea>` : ''}
                <div class="flex flex-wrap gap-2">
                    ${showAccept ? `<button data-act="claim" data-stage="${stage.id}" class="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-600 flex items-center gap-1.5"><i class="fas fa-hand"></i> Accept</button>` : ''}
                    ${showComplete ? `<button data-act="complete" data-stage="${stage.id}" ${performs ? `data-performs="${count}"` : ''} class="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1.5"><i class="fas fa-check"></i> ${approveLabel}</button>` : ''}
                    ${showComplete ? `<button data-act="reject-toggle" data-stage="${stage.id}" class="px-3 py-1.5 text-sm border border-danger rounded-lg text-danger hover:bg-danger-light flex items-center gap-1.5"><i class="fas fa-xmark"></i> Reject</button>` : ''}
                    ${showReassign ? `<button data-act="reassign-toggle" data-stage="${stage.id}" class="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-surface-hover text-text-secondary flex items-center gap-1.5"><i class="fas fa-user-gear"></i> Reassign</button>` : ''}
                </div>
                ${showComplete ? `
                    <div data-reject-form="${stage.id}" class="hidden pt-1">
                        <textarea data-reject-reason="${stage.id}" rows="2" placeholder="Why are you rejecting this? The requester will see it."
                            class="w-full px-3 py-2 text-sm border border-danger rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"></textarea>
                        <div class="flex flex-wrap gap-2 mt-2">
                            <button data-act="reject" data-stage="${stage.id}" class="px-3 py-1.5 text-sm bg-danger text-white rounded-lg flex items-center gap-1.5"><i class="fas fa-xmark"></i> Confirm rejection</button>
                            <button data-act="reject-cancel" data-stage="${stage.id}" class="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-surface-hover text-text-secondary">Keep it open</button>
                        </div>
                    </div>` : ''}
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
        body.querySelector('#plRaisePrerequisite')?.addEventListener('click', () => this.showCreate(p));

        // Navigating up and down the chain. Re-entrant on purpose: openDetail()
        // replaces the whole modal body, so this is the same one modal being
        // repointed rather than a stack of them.
        body.querySelectorAll('[data-open-request]').forEach((btn) => {
            btn.addEventListener('click', () => this.openDetail(parseInt(btn.dataset.openRequest, 10)));
        });

        body.querySelectorAll('[data-unlink-child]').forEach((btn) => {
            btn.addEventListener('click', () => this.unlinkChild(p.id, parseInt(btn.dataset.unlinkChild, 10)));
        });

        body.querySelectorAll('[data-act]').forEach((btn) => {
            const stageId = parseInt(btn.dataset.stage, 10);
            const act = btn.dataset.act;
            if (act === 'claim') btn.addEventListener('click', () => this.claimStage(p.id, stageId));
            else if (act === 'complete') {
                btn.addEventListener('click', async () => {
                    // Approving is the one click in this app that changes real
                    // hardware records, so when it will perform work, say what
                    // work — by name — before it happens.
                    const performs = parseInt(btn.dataset.performs || '0', 10);
                    if (performs > 0) {
                        // One line: utils.confirm() escapes into a <p> with no
                        // pre-wrap, so newlines would silently collapse.
                        const summaries = (p.actions || [])
                            .map((a) => a.summary || a.action_type).join('; ');
                        const ok = await this.confirm(
                            `Approving runs ${performs} action${performs === 1 ? '' : 's'} now — ${summaries}. `
                            + 'This happens immediately and cannot be undone from here.',
                            'Approve and run?'
                        );
                        if (!ok) return;
                    }
                    const notes = body.querySelector(`[data-complete-notes="${stageId}"]`)?.value || '';
                    this.completeStage(p.id, stageId, notes);
                });
            } else if (act === 'reject-toggle') {
                btn.addEventListener('click', () => {
                    body.querySelector(`[data-reject-form="${stageId}"]`)?.classList.toggle('hidden');
                });
            } else if (act === 'reject-cancel') {
                btn.addEventListener('click', () => {
                    body.querySelector(`[data-reject-form="${stageId}"]`)?.classList.add('hidden');
                });
            } else if (act === 'reject') {
                btn.addEventListener('click', () => {
                    const reason = body.querySelector(`[data-reject-reason="${stageId}"]`)?.value.trim() || '';
                    if (!reason) return this.toast('Give a reason — the requester will see it', 'error');
                    this.rejectStage(p.id, stageId, reason);
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
    async rejectStage(pipelineId, stageId, reason) {
        await this.stageAction('pipeline-reject', { pipeline_id: pipelineId, stage_progress_id: stageId, reason }, 'Request rejected — nothing was performed');
    }
    /**
     * Detach a refused prerequisite so this request can move again.
     *
     * Confirmed first because it is the one action that lifts a freeze, and the
     * freeze is the whole point: the request goes from "cannot be approved" to
     * "can be approved" without the thing it was waiting for ever happening.
     */
    async unlinkChild(parentId, childId) {
        const ok = await this.confirm(
            'This request will stop waiting for that prerequisite and can be approved without it. '
            + 'The prerequisite itself is unchanged — it stays rejected, and its own record is kept. '
            + 'Detach it only if the requirement is being re-raised or no longer applies.',
            'Detach this prerequisite?'
        );
        if (!ok) return;

        await this.stageAction('pipeline-unlink-child', { child_id: childId }, null);
        // stageAction re-renders from result.data.pipeline, which this endpoint
        // does not return — it returns `parent`. Re-open explicitly instead.
        this.openDetail(parentId);
    }

    async cancelPipeline(pipelineId) {
        // In-app modal, not native confirm()/prompt(): this codebase is
        // toast-and-modal only, and a native prompt cannot be styled, cannot be
        // dismissed consistently, and is blocked outright by some browsers.
        const ok = await this.confirm(
            'Cancel this request? Remaining steps will be skipped and nothing will be performed.',
            'Cancel request?'
        );
        if (!ok) return;
        await this.stageAction('pipeline-cancel', { pipeline_id: pipelineId, reason: '' }, 'Request cancelled');
    }

    /**
     * In-app confirmation. Falls back to the native dialog only if utils.js
     * somehow did not load — never the other way round.
     */
    async confirm(message, title) {
        if (window.utils && typeof utils.confirm === 'function') {
            return await utils.confirm(message, title);
        }
        return window.confirm(`${title ? title + '\n\n' : ''}${message}`);
    }

    async stageAction(action, fields, successMsg) {
        try {
            const result = await this.apiPost(action, fields);

            if (!result.success) {
                const msg = result.data?.errors?.length ? result.data.errors.join('; ') : (result.message || 'Action failed');

                // A rolled-back approval is the STATE of the request, not a
                // passing error: the work was attempted, refused, and undone
                // whole. A toast is gone in four seconds and the old code also
                // returned without re-rendering, leaving a stale screen behind.
                if (result.data?.execution) {
                    // The banner is rendered from the request's own history,
                    // which the backend wrote after the rollback and before
                    // building this response — so re-rendering the returned
                    // pipeline is all it takes, and the same banner is still
                    // there on reload and in the requester's own view.
                    if (result.data.pipeline) {
                        this.currentDetail = result.data.pipeline;
                        this.renderDetail(this.currentDetail);
                    }
                    this.toast('Approval was rolled back — nothing was changed', 'error');
                    return;
                }

                // Any refusal that came back with live state re-renders it.
                // A block is the clearest case: the request really did change
                // under the approver (somebody raised a prerequisite), and the
                // screen has to show that, not just flash a message about it.
                if (result.data?.pipeline) {
                    this.currentDetail = result.data.pipeline;
                    this.renderDetail(this.currentDetail);
                }
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

    /**
     * The 11 component types and their ims-data spec files, served from the shared
     * /ims-data web alias. Filenames are irregular by design - never guess one;
     * this mirrors ims-ftp/core/models/components/ComponentSpecPaths.php.
     */
    componentSpecPaths() {
        return {
            cpu: '/ims-data/cpu/Cpu-details-level-3.json',
            ram: '/ims-data/ram/ram_detail.json',
            storage: '/ims-data/storage/storage-level-3.json',
            motherboard: '/ims-data/motherboard/motherboard-level-3.json',
            nic: '/ims-data/nic/nic-level-3.json',
            caddy: '/ims-data/caddy/caddy_details.json',
            chassis: '/ims-data/chassis/chasis-level-3.json',
            pciecard: '/ims-data/pciecard/pci-level-3.json',
            risercard: '/ims-data/risercard/riser-level-3.json',
            hbacard: '/ims-data/hbacard/hbacard-level-3.json',
            sfp: '/ims-data/sfp/sfp-level-3.json'
        };
    }

    /**
     * A component type as a person says it. The wording matches the Add
     * Component form's own type dropdown, so the same hardware is not called two
     * different things on two screens.
     */
    componentTypeLabel(type) {
        const LABELS = {
            cpu: 'CPU',
            motherboard: 'Motherboard',
            ram: 'RAM',
            storage: 'Storage',
            nic: 'Network Card',
            hbacard: 'HBA Card',
            pciecard: 'PCIe Card',
            risercard: 'Riser Card',
            chassis: 'Chassis',
            caddy: 'Drive Caddy',
            sfp: 'SFP Transceiver'
        };
        return LABELS[type] || String(type || '').toUpperCase();
    }

    async loadComponentData() {
        if (this.componentData) return;
        const paths = this.componentSpecPaths();
        this.componentData = {};
        Object.keys(paths).forEach((type) => { this.componentData[type] = []; });
        for (const [type, path] of Object.entries(paths)) {
            try {
                const res = await fetch(path);
                if (res.ok) this.componentData[type] = this.flattenComponents(await res.json());
            } catch (e) { /* optional */ }
        }
    }

    /**
     * ims-data JSON shapes are NOT uniform: brand -> models[] (cpu, ram, storage,
     * motherboard, pciecard, risercard, hbacard), brand -> series[] -> models[]
     * (nic, sfp), { caddies: [] }, and chassis_specifications -> manufacturers[]
     * -> series[] -> models[]. The UUID key is `UUID` in some files and `uuid` in
     * others. Every UUID-bearing node is a leaf model in all of them, so walk the
     * tree and accept either casing rather than assuming one depth and one key.
     */
    flattenComponents(data) {
        const out = [];
        const walk = (node, brand) => {
            if (Array.isArray(node)) {
                node.forEach((child) => walk(child, brand));
                return;
            }
            if (!node || typeof node !== 'object') return;
            const inheritedBrand = node.brand || node.manufacturer || brand;
            const uuid = node.UUID || node.uuid;
            if (uuid) {
                out.push({ uuid, brand: inheritedBrand || '', name: this.componentModelName(node) });
                return;
            }
            Object.values(node).forEach((child) => walk(child, inheritedBrand));
        };
        walk(data, '');
        return out;
    }

    /** Label for a spec model - RAM and storage models carry no `model` field. */
    componentModelName(model) {
        const direct = model.model || model.name || model.label || model.part_number;
        if (direct) return String(direct);
        const parts = [
            model.memory_type || model.storage_type || model.type,
            model.subtype,
            model.capacity_GB ? `${model.capacity_GB}GB` : null,
            model.frequency_MHz ? `${model.frequency_MHz}MHz` : null,
            model.form_factor
        ].filter(Boolean);
        return parts.length ? parts.join(' ') : 'Component';
    }

    /**
     * The component types this request is allowed to name. A hardware request
     * whose access ask is `sfp.create` is a request about SFPs, so offering all
     * 11 types invites an item list the approved grant could never cover.
     * Ticking nothing means "everything this type grants", so the whole ceiling
     * counts. Falls back to every type when the ceiling names no component type
     * at all - server-scoped asks (`server.*`), and ordinary request types that
     * grant no access, where the items are context rather than a scope.
     */
    allowedComponentTypes() {
        // The items list is CONTEXT for the approver, not a scope: the action
        // says what will actually be touched, and the backend validates that on
        // its own. Narrowing this used to mirror the access ask, which no longer
        // exists, and guessing a narrower list from the action would hide types a
        // requester may legitimately want to mention.
        return Object.keys(this.componentSpecPaths());
    }

    componentTypeOptions(types) {
        return `<option value="">Type</option>`
            + types.map((t) => `<option value="${t}">${this.esc(this.componentTypeLabel(t))}</option>`).join('');
    }

    /**
     * Re-scope the type dropdowns after the access ask changes. A row naming a
     * type the request no longer asks to touch is emptied rather than left to be
     * submitted quietly outside the grant being requested.
     */
    refreshComponentTypeOptions() {
        const types = this.allowedComponentTypes();
        const options = this.componentTypeOptions(types);
        document.querySelectorAll('#plComponents .component-item').forEach((row) => {
            const typeSel = row.querySelector('.ci-type');
            const uuidSel = row.querySelector('.ci-uuid');
            const current = typeSel.value;
            const keep = types.includes(current) ? current : '';
            typeSel.innerHTML = options;
            typeSel.value = keep;
            if (keep !== current) this.fillComponentUUIDs(keep, uuidSel);
        });

        const hint = document.getElementById('plItemsHint');
        if (hint) {
            hint.textContent = types.length < Object.keys(this.componentSpecPaths()).length
                ? `Limited to the access you asked for: ${types.map((t) => this.componentTypeLabel(t)).join(', ')}.`
                : 'Hardware this request involves. Optional.';
        }
        this.updateItemsSummary();
    }

    addComponentItem() {
        const container = document.getElementById('plComponents');
        if (!container) return;
        const row = document.createElement('div');
        row.className = 'component-item bg-surface-secondary/30 border border-border rounded-lg p-3';
        row.innerHTML = `
            <div class="flex items-start gap-2">
                <div class="flex-1 grid grid-cols-1 md:grid-cols-12 gap-2">
                    <select class="ci-type md:col-span-3 px-3 py-2 text-sm border border-border rounded-lg bg-surface-card text-text-primary">
                        ${this.componentTypeOptions(this.allowedComponentTypes())}
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
            opt.textContent = c.brand ? `${c.brand} - ${c.name}` : c.name;
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
