/**
 * Dashboard JavaScript for BDC Inventory Management System
 * Mobile menu now handled by SidebarManager in sidebar-manager.js
 */

/**
 * The lifecycle vocabulary the state machine actually uses (status_v2), and how
 * each value reads on a card.
 *
 * Colours are NOT new: each value keeps the colour its legacy
 * configuration_status int already had (StatusMap::CONFIG_V2_TO_LEGACY -- draft
 * 0, validated 1, building/validating 2, finalized/deployed/maintenance/retired
 * 3), so nothing that is on screen today changes appearance. Only the LABEL gets
 * more precise. That also keeps this to the four badge palettes actually
 * compiled into tailwind.css -- a class missing from that file renders as
 * nothing.
 */
const SERVER_STATUS_V2_PRESENTATION = {
    draft:       { label: 'Draft',       dotClass: 'bg-amber-500', textClass: 'text-amber-600 dark:text-amber-400' },
    building:    { label: 'Building',    dotClass: 'bg-green-500', textClass: 'text-green-600 dark:text-green-400' },
    validating:  { label: 'Validating',  dotClass: 'bg-green-500', textClass: 'text-green-600 dark:text-green-400' },
    validated:   { label: 'Validated',   dotClass: 'bg-sky-500',   textClass: 'text-sky-600 dark:text-sky-400' },
    finalized:   { label: 'Finalized',   dotClass: 'bg-teal-500',  textClass: 'text-teal-600 dark:text-teal-400' },
    deployed:    { label: 'Deployed',    dotClass: 'bg-teal-500',  textClass: 'text-teal-600 dark:text-teal-400' },
    maintenance: { label: 'Maintenance', dotClass: 'bg-teal-500',  textClass: 'text-teal-600 dark:text-teal-400' },
    retired:     { label: 'Retired',     dotClass: 'bg-teal-500',  textClass: 'text-teal-600 dark:text-teal-400' }
};

/**
 * Legacy configuration_status int -> the same presentation, for a row that
 * pre-dates the status_v2 backfill. Unchanged from what the cards showed before
 * status_v2 was consulted at all.
 */
const SERVER_STATUS_LEGACY_PRESENTATION = {
    '0': SERVER_STATUS_V2_PRESENTATION.draft,
    '1': SERVER_STATUS_V2_PRESENTATION.validated,
    '2': SERVER_STATUS_V2_PRESENTATION.building,
    '3': SERVER_STATUS_V2_PRESENTATION.finalized
};

class Dashboard {
    constructor() {
        this.currentComponent = 'dashboard';
        this.currentPage = 1;
        this.itemsPerPage = 50;
        this.searchTimeout = null;
        this.selectedItems = new Set();
        this.cardListenersInitialized = false;
        this.loadingStates = {
            dashboard: false,
            components: false,
            servers: false
        };

        this.init();
    }

    async init() {
        // Wait for sidebar HTML to be loaded first (if loading asynchronously)
        if (window.sidebarReady) {
            await window.sidebarReady;
        }

        // Initialize sidebar manager (loads counts with caching)
        if (window.sidebarManager) {
            await window.sidebarManager.init();
        }

        await this.initializeUserInfo();
        this.setupEventListeners();

        // Determine current page and load appropriate data. The 12 component
        // inventories share one page (component.html?type=cpu), so ask utils for
        // the slug rather than reading the filename.
        const slug = utils.currentPageSlug();
        const page = slug === null ? '' : slug + '.html';

        if (page === 'index.html' || page === '' || page === 'dashboard') {
            this.currentComponent = 'dashboard';
            await this.loadDashboard();
        } else if (page === 'servers.html') {
            this.currentComponent = 'servers';
            this.applyServerCreateGate();
            await this.loadServerList();
        // ACL, Rack View, Activity Log, Help & Guide, Requests and Request Types
        // no longer load this file at all (2026-09-21). Each of them wanted exactly
        // two things from it — the sidebar counts, and a branch here to stop the
        // fall-through firing a bogus `{page}-list` action — and SidebarManager now
        // does the first from its own init(). Their branches are gone with them;
        // the role gate that was here for Request Types moved into
        // request-types.js, next to the page it guards.
        } else if (page === 'locations.html') {
            // LocationsManager (locations.js) loads its own data. Claiming the
            // page here is mandatory: the fall-through branch below would treat
            // it as a component inventory page and fire an invalid
            // `locations-list` action against the API.
            //
            // No role redirect — viewing locations is a basic permission, and the
            // page's own writes are refused by the backend for anyone else. A
            // user without location.view has no menu entry to get here.
            this.currentComponent = 'locations';
            await this.loadSidebarCounts();
            if (window.locationsManager) {
                await window.locationsManager.init();
            }
        } else if (page === 'vendors.html') {
            this.currentComponent = 'vendors';
            if (!api.utils.hasRole(['admin', 'super_admin'])) {
                window.location.href = 'index.html';
                return;
            }
            await this.loadVendorList();
        } else {
            // Assume it's a component page
            const component = slug;
            this.currentComponent = component;
            this.applyComponentCreateGate(component);
            await this.loadComponentList(component);
        }
    }

    async initializeUserInfo() {
        // The name and role sit in the navbar, which components/navbar.js fills
        // in when it mounts. Kept as a hook for callers that refresh the user.
        if (window.sharedNavbar) {
            window.sharedNavbar.updateUserDisplay(api.getUser());
        }
    }

    setupEventListeners() {
        // Dashboard refresh
        const refreshDashboard = document.getElementById('refreshDashboard');
        if (refreshDashboard) {
            refreshDashboard.addEventListener('click', () => this.loadDashboard());
        }

        // Add component - Use event delegation
        document.addEventListener('click', (e) => {
            if (e.target.closest('#addComponentBtn')) {
                e.preventDefault();
                e.stopPropagation();
                this.showAddForm();
            }
        });

        // Refresh components
        const refreshComponents = document.getElementById('refreshComponents');
        if (refreshComponents) {
            refreshComponents.addEventListener('click', () => this.loadComponentList(this.currentComponent, true));
        }

        // Refresh servers
        const refreshServers = document.getElementById('refreshServers');
        if (refreshServers) {
            refreshServers.addEventListener('click', () => this.loadServerList(true));
        }

        // Server search
        const serverSearch = document.getElementById('serverSearch');
        if (serverSearch) {
            serverSearch.addEventListener('input', utils.debounce(() => {
                this.filterAndRenderServers();
            }, 300));
        }

        // Server status filter
        const serverStatusFilter = document.getElementById('serverStatusFilter');
        if (serverStatusFilter) {
            serverStatusFilter.addEventListener('change', () => {
                this.filterAndRenderServers();
            });
        }

        // Component search
        const componentSearch = document.getElementById('componentSearch');
        if (componentSearch) {
            componentSearch.addEventListener('input', utils.debounce((e) => {
                this.handleSearch(e.target.value);
            }, 300));
        }

        // Status filter: a segmented control writing the hidden #statusFilter
        // that loadComponentList() reads.
        const statusSegments = document.getElementById('statusSegments');
        const statusFilter = document.getElementById('statusFilter');
        if (statusSegments && statusFilter) {
            statusSegments.addEventListener('click', (e) => {
                const button = e.target.closest('button[data-status]');
                if (!button || button.getAttribute('aria-pressed') === 'true') return;
                statusSegments.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
                statusFilter.value = button.dataset.status;
                this.handleFilterChange('status', statusFilter.value);
            });
        }

        const exportCsv = document.getElementById('exportComponentsCsv');
        if (exportCsv) {
            exportCsv.addEventListener('click', () => this.exportComponentsCsv());
        }

        const importBtn = document.getElementById('importComponentsBtn');
        if (importBtn) {
            importBtn.addEventListener('click', () => this.showImportDrawer());
        }

        // Select all
        const selectAllComponents = document.getElementById('selectAllComponents');
        if (selectAllComponents) {
            selectAllComponents.addEventListener('change', (e) => this.toggleSelectAll(e.target.checked));
        }

        // Bulk actions. Status, location and flag are one modal; each button
        // opens it on its own field.
        const bulkButtons = { bulkUpdateStatus: 'bulkStatus', bulkMoveLocation: 'bulkLocation', bulkSetFlag: 'bulkFlag' };
        Object.entries(bulkButtons).forEach(([id, field]) => {
            const button = document.getElementById(id);
            if (button) button.addEventListener('click', () => this.showBulkUpdateModal(field));
        });

        const bulkClearSelection = document.getElementById('bulkClearSelection');
        if (bulkClearSelection) {
            bulkClearSelection.addEventListener('click', () => this.clearSelection());
        }

        const bulkDelete = document.getElementById('bulkDelete');
        if (bulkDelete) {
            bulkDelete.addEventListener('click', () => this.handleBulkDelete());
        }

        // Add server button
        const addServerBtn = document.getElementById('addServerBtn');
        if (addServerBtn) {
            addServerBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showAddServerForm();
            });
        }

        // The user dropdown, Change Password and Logout live in the navbar, and
        // components/navbar.js binds all three. Change Password is entirely the
        // navbar's now; Logout still calls back into this.handleLogout() when a
        // page loads dashboard.js, because that path confirms first and asks the
        // backend to revoke the token. Binding them a second time here would
        // toggle the dropdown open and shut on one click.
    }

    // switchView removed - MPA handles navigation natively via links



    renderComponentHeader() {
        const thead = document.getElementById('componentsTableHeader');
        if (!thead) return;
        thead.innerHTML = `
            <tr>
                <th><input type="checkbox" id="selectAllComponents"></th>
                <th>Model</th><th>Status</th><th>Server UUID</th><th>Location</th><th>Purchase Date</th><th>Actions</th>
            </tr>
        `;
    }

    async loadDashboard() {
        if (this.loadingStates.dashboard) {
            return;
        }

        try {
            this.loadingStates.dashboard = true;
            utils.showLoading(true, 'Loading dashboard...');
            // JSON-009: pull the type vocabulary from the backend once, so the two lists
            // below stop being hand-maintained copies. Failure is non-fatal -- each list
            // falls back to its literal -- because a dashboard that cannot render counts is
            // a worse outcome than one rendering a stale vocabulary.
            await this.loadTypeVocabulary();

            const result = await api.dashboard.getData();
            if (result.success && result.data.component_counts) {
                this.updateDashboardStats(result.data.component_counts);
                this.updateSidebarCounts(result.data.component_counts);
                await Promise.all([this.loadRequestQueue(), this.loadRecentActivity()]);
                this.renderAttention();
            }
        } catch (error) {
            console.error('Error loading dashboard:', error);
            utils.showAlert(error.message || 'Failed to load dashboard data', 'error');
        } finally {
            this.loadingStates.dashboard = false;
            utils.showLoading(false);
        }
    }

    /**
     * Fetch the canonical component-type list. Sets this.componentTypes on success and
     * leaves it null otherwise; every reader treats null as "use the built-in list".
     */
    async loadTypeVocabulary() {
        if (this.componentTypes) {
            return;
        }
        try {
            const manifest = await api.dashboard.typeManifest();
            const types = manifest && manifest.data && manifest.data.types;
            if (Array.isArray(types) && types.length) {
                this.componentTypes = types.map(t => t.type);
            }
        } catch (error) {
            // Older backend, or the endpoint is unreachable. Not worth an alert.
            console.debug('Type manifest unavailable, using built-in list:', error);
        }
    }

    /**
     * How the dashboard names one part, or several, inside a sentence
     * ("3 SFP modules are marked failed"). Row titles use the sidebar's names.
     */
    static DASH_NOUNS = {
        cpu: ['CPU', 'CPUs'],
        ram: ['RAM module', 'RAM modules'],
        storage: ['storage drive', 'storage drives'],
        motherboard: ['motherboard', 'motherboards'],
        nic: ['network card', 'network cards'],
        caddy: ['drive caddy', 'drive caddies'],
        chassis: ['chassis', 'chassis'],
        pciecard: ['PCIe card', 'PCIe cards'],
        risercard: ['riser card', 'riser cards'],
        hbacard: ['HBA card', 'HBA cards'],
        sfp: ['SFP module', 'SFP modules'],
        serverplatform: ['compute platform', 'compute platforms'],
        networkdevice: ['network device', 'network devices']
    };

    dashNoun(type, count) {
        const pair = Dashboard.DASH_NOUNS[type] || [type, type];
        return Number(count) === 1 ? pair[0] : pair[1];
    }

    dashTypeTitle(type) {
        if (type === 'serverplatform') return 'Compute Platforms';
        return utils.componentLabels[type] || type;
    }

    /**
     * Parts: one bar for everything, then one row per type that has stock,
     * worded as what you can still use ("20 spare of 136"). Types with nothing
     * on record collapse into one line. Also records which types have failed
     * parts or (almost) no spares, for "Needs your attention".
     */
    updateDashboardStats(stats) {
        const components = this.componentTypes
            || ['cpu', 'ram', 'storage', 'motherboard', 'nic', 'caddy', 'chassis', 'pciecard', 'risercard', 'hbacard', 'sfp', 'serverplatform', 'networkdevice'];
        const fmt = (n) => (Number(n) || 0).toLocaleString('en-IN');
        const num = (n) => Number(n) || 0;
        const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
        const pct = (v, t) => t > 0 ? (num(v) / t) * 100 : 0;
        const bar = (spare, installed, failed, total) => [
            ['is-spare', spare], ['is-installed', installed], ['is-failed', failed]
        ].filter(([, v]) => num(v) > 0)
            .map(([cls, v]) => `<span class="${cls}" style="width:calc(${pct(v, total)}% - 2px)"></span>`).join('');

        const sum = { total: 0, available: 0, in_use: 0, failed: 0 };
        const rows = components.filter(type => stats[type]).map(type => {
            const s = stats[type];
            Object.keys(sum).forEach(k => { sum[k] += num(s[k]); });
            return { type, total: num(s.total), spare: num(s.available), installed: num(s.in_use), failed: num(s.failed) };
        });

        setText('dashPartsTotal', fmt(sum.total));
        setText('dashPartsSpare', fmt(sum.available));
        setText('dashPartsInstalled', fmt(sum.in_use));
        setText('dashPartsFailed', fmt(sum.failed));
        const bigBar = document.getElementById('dashPartsBar');
        if (bigBar) {
            bigBar.innerHTML = bar(sum.available, sum.in_use, sum.failed, sum.total);
            bigBar.setAttribute('aria-label', `${fmt(sum.available)} spare, ${fmt(sum.in_use)} installed, ${fmt(sum.failed)} failed`);
        }

        // Almost none left: no spares at all, or fewer than 1 in 20.
        const isLow = (r) => r.total > 0 && (r.spare === 0 || r.spare / r.total < 0.05);
        this.dashStock = {
            failed: rows.filter(r => r.failed > 0),
            none: rows.filter(r => r.total > 0 && r.spare === 0),
            low: rows.filter(r => r.spare > 0 && isLow(r))
        };

        const list = document.getElementById('dashTypes');
        if (list) {
            const stocked = rows.filter(r => r.total > 0);
            list.innerHTML = stocked.map(r => {
                const href = `component.html?type=${encodeURIComponent(r.type)}`;
                const low = isLow(r);
                const note = r.spare === 0
                    ? `None spare, all <b class="rf-mono">${fmt(r.installed)}</b> installed`
                    : `<b class="rf-mono">${fmt(r.spare)}</b> spare of <span class="rf-mono">${fmt(r.total)}</span>`;
                const failed = r.failed ? `, <span class="is-failed"><b class="rf-mono is-failed">${fmt(r.failed)}</b> failed</span>` : '';
                const label = `${this.dashTypeTitle(r.type)}: ${fmt(r.spare)} spare, ${fmt(r.installed)} installed, ${fmt(r.failed)} failed`;
                return `<li><a class="dash-type" href="${utils.escapeHtml(href)}">
                    <span class="dash-type-name">${utils.escapeHtml(this.dashTypeTitle(r.type))}</span>
                    <span class="dash-bar" role="img" aria-label="${utils.escapeHtml(label)}">${bar(r.spare, r.installed, r.failed, r.total)}</span>
                    <span class="dash-type-note${low ? ' is-low' : ''}">${note}${failed}</span>
                </a></li>`;
            }).join('') || '<li class="rf-state">No parts recorded yet. Add parts from any inventory page in the sidebar.</li>';

            const empty = document.getElementById('dashTypesEmpty');
            const unstocked = rows.filter(r => r.total === 0);
            if (empty) {
                empty.classList.toggle('hidden', !unstocked.length || !stocked.length);
                empty.innerHTML = unstocked.length
                    ? `Nothing on record yet: ${unstocked.map(r =>
                        `<a href="component.html?type=${encodeURIComponent(r.type)}">${utils.escapeHtml(this.dashTypeTitle(r.type))}</a>`).join(', ')}`
                    : '';
            }
        }

        if (stats.servers) {
            const s = stats.servers;
            setText('dashServersTotal', fmt(s.total));
            // Legacy configuration_status 2 is building/validating
            // (StatusMap::CONFIG_V2_TO_LEGACY); the API still calls it "built".
            const counts = { draft: s.draft, building: s.built, validated: s.validated, finalized: s.finalized };
            document.querySelectorAll('#dashStages .dash-stage').forEach(li => {
                const n = num(counts[li.dataset.stage]);
                li.classList.toggle('has-servers', n > 0);
                const el = li.querySelector('.dash-stage-n');
                if (el) el.textContent = fmt(n);
            });
        }
    }

    /**
     * Requests whose current step is waiting on the signed-in user or one of
     * their roles. null when the list can't be read (no permission, error), so
     * the attention panel says nothing rather than claiming zero.
     */
    async loadRequestQueue() {
        this.dashQueue = null;
        try {
            const result = await api.requestEnvelope('pipeline-list', { scope: 'my_queue', status: 'in_progress', limit: 1 });
            if (result.success && result.data) {
                this.dashQueue = { total: Number(result.data.total) || 0, latest: (result.data.pipelines || [])[0] || null };
            }
        } catch (err) {
            this.dashQueue = null;
        }
    }

    /** "Needs your attention": waiting requests, failed parts, types with (almost) no spares. */
    renderAttention() {
        const host = document.getElementById('dashAttention');
        if (!host) return;
        const fmt = (n) => (Number(n) || 0).toLocaleString('en-IN');
        const esc = (s) => utils.escapeHtml(String(s));
        const items = [];
        const item = (kind, icon, title, detail, href, action) => items.push(`<li class="dash-attn is-${kind}">
            <span class="dash-attn-ic" aria-hidden="true"><i class="fas ${icon}"></i></span>
            <span class="dash-attn-text"><strong>${title}</strong>${detail ? `<span>${detail}</span>` : ''}</span>
            ${href ? `<a class="rf-btn" href="${esc(href)}">${esc(action)}</a>` : ''}
        </li>`);
        const typeHref = (type) => `component.html?type=${encodeURIComponent(type)}`;

        const q = this.dashQueue;
        if (q && q.total > 0) {
            const latest = q.latest && q.latest.title ? `Latest: ${esc(q.latest.title)}` : '';
            item('request', 'fa-inbox',
                q.total === 1 ? '1 request is waiting on you or your team' : `${fmt(q.total)} requests are waiting on you or your team`,
                latest, 'requests.html', 'Open requests');
        }

        const stock = this.dashStock || { failed: [], none: [], low: [] };
        stock.failed.forEach(r => item('failed', 'fa-triangle-exclamation',
            `${fmt(r.failed)} ${esc(this.dashNoun(r.type, r.failed))} ${r.failed === 1 ? 'is' : 'are'} marked failed`,
            'Check them, then repair, replace or remove them from stock.',
            typeHref(r.type), `View ${this.dashNoun(r.type, 2)}`));
        stock.none.forEach(r => item('low', 'fa-box-open',
            `No ${esc(this.dashNoun(r.type, 2))} spare`,
            `All ${fmt(r.installed)} are installed in servers, so a new build can't use one until more arrive.`,
            typeHref(r.type), `View ${this.dashNoun(r.type, 2)}`));
        stock.low.forEach(r => item('low', 'fa-box-open',
            `Only ${fmt(r.spare)} ${esc(this.dashNoun(r.type, r.spare))} spare`,
            `${fmt(r.installed)} of ${fmt(r.total)} are installed in servers.`,
            typeHref(r.type), `View ${this.dashNoun(r.type, 2)}`));

        if (!items.length) {
            const parts = ['no parts have failed', 'every part type you stock has spares'];
            if (q) parts.unshift('no requests are waiting on you');
            item('clear', 'fa-check', 'Nothing needs you right now',
                `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}.`.replace(/^./, c => c.toUpperCase()));
        }
        host.innerHTML = items.join('');
    }

    updateSidebarCounts(stats) {
        // JSON-009: 'sfp' was missing from this list while updateDashboardStats() above had
        // it, so the sidebar silently showed no count for SFPs -- 46 stocked units -- and the
        // main dashboard tile showed them. Two copies of the same vocabulary, one of them
        // stale. 'servers' is not a component type; it is the extra bucket the dashboard
        // response adds alongside the twelve.
        // 'servers' is not a component type; it is the extra bucket the dashboard response
        // adds alongside the twelve, so it is appended to whichever list is in use.
        const components = (this.componentTypes
            || ['cpu', 'ram', 'storage', 'motherboard', 'nic', 'caddy', 'chassis', 'pciecard', 'risercard', 'hbacard', 'sfp', 'serverplatform', 'networkdevice']
        ).concat(['servers']);
        components.forEach(component => {
            const countElement = document.getElementById(`${component}Count`);
            if (countElement && stats[component]) {
                countElement.textContent = stats[component].total || 0;
            }
        });
    }

    // SidebarManager owns the counts (cache, fetch and render) and refreshes them
    // from its own init(). Kept as a one-line forwarder because a handful of
    // dashboard flows re-read them after a write — e.g. deleting a server.
    async loadSidebarCounts(forceRefresh = false) {
        return window.sidebarManager?.refreshCounts(forceRefresh);
    }

    /**
     * The last few things that happened, in plain words: real server names
     * instead of config UUIDs, and a run of identical entries (one person
     * adding six parts to one server) folded into one line. Timestamps are UTC
     * without an offset; shown in IST.
     */
    async loadRecentActivity() {
        const feed = document.getElementById('recentActivityBody');
        if (!feed) return;
        const state = (text) => { feed.innerHTML = `<div class="rf-state">${utils.escapeHtml(text)}</div>`; };

        try {
            const result = await api.requestEnvelope('dashboard-get-logs', { limit: 40, offset: 0 });
            if (!result.success) {
                document.getElementById('recentActivityAll')?.classList.add('hidden');
                return state(Number(result.code) === 403
                    ? 'The activity log is visible to administrators.'
                    : "Couldn't load recent activity.");
            }
            const logs = result.data?.logs || [];
            if (!logs.length) return state('Nothing has happened yet.');

            const servers = logs.some(l => l.component_type === 'server') ? await this.loadServerNames() : new Map();
            const groups = [];
            logs.forEach(log => {
                const last = groups[groups.length - 1];
                const key = [log.username, log.action, log.component_type, log.component_id].join('|');
                if (last && log.component_id != null && last.key === key) last.logs.push(log);
                else groups.push({ key, logs: [log] });
            });

            feed.innerHTML = groups.slice(0, 7).map(g => this.activityRow(g.logs, servers)).join('');
        } catch (err) {
            state("Couldn't load recent activity.");
        }
    }

    /** server config id -> { name, uuid }, for naming servers in the feed. Empty on failure. */
    async loadServerNames() {
        const names = new Map();
        try {
            const result = await api.requestEnvelope('server-list-configs', { limit: 500 });
            (result.success ? (result.data?.configurations || []) : []).forEach(c => {
                names.set(String(c.id), { name: c.server_name || '', uuid: c.config_uuid || '' });
            });
        } catch (err) { /* the feed falls back to "server #id" */ }
        return names;
    }

    activityRow(logs, servers) {
        const esc = (s) => utils.escapeHtml(String(s ?? ''));
        const log = logs[0];
        const n = logs.length;
        const notes = String(log.notes || '');
        const action = String(log.action || '');
        const who = log.username || (log.user_id ? `user #${log.user_id}` : 'System');

        const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
        const serverLink = () => {
            const known = servers.get(String(log.component_id));
            const uuid = known?.uuid || (notes.match(new RegExp('server config (' + UUID.source + ')', 'i')) || [])[1] || '';
            const name = known?.name || (log.component_id != null ? `server #${log.component_id}` : 'a server');
            return uuid
                ? `<a href="../server/builder.html?config=${encodeURIComponent(uuid)}">${esc(name)}</a>`
                : esc(name);
        };
        // "2 storage drives, 1 PCIe card" from the notes of a run of add/remove entries.
        const partsDetail = () => {
            const counts = new Map();
            logs.forEach(l => {
                const m = String(l.notes || '').match(/^(?:Added|Removed) (\w+) \(/);
                if (m) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
            });
            return [...counts].map(([type, c]) => `${c} ${this.dashNoun(type, c)}`).join(', ');
        };
        const partsPhrase = () => {
            if (n > 1) return `${n} parts`;
            const m = notes.match(/^(?:Added|Removed) (\w+) \(/);
            if (!m) return 'a part';
            const noun = this.dashNoun(m[1], 1);
            return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
        };

        let line;
        let detail = '';
        switch (action) {
            case 'Component added':
                line = `added ${esc(partsPhrase())} to ${serverLink()}`;
                if (n > 1) detail = partsDetail();
                break;
            case 'Component removed':
                line = `removed ${esc(partsPhrase())} from ${serverLink()}`;
                if (n > 1) detail = partsDetail();
                break;
            case 'Server created':
                line = `created ${serverLink()}`;
                break;
            case 'Server configuration started':
                line = `started building ${serverLink()}`;
                break;
            case 'Compute platform installed': {
                const platform = (notes.match(/^Installed (.+?) \(unit/) || [])[1];
                line = platform
                    ? `installed a ${esc(platform)} in ${serverLink()}`
                    : `installed a compute platform in ${serverLink()}`;
                break;
            }
            case 'Server relocated': {
                const m = notes.match(/^(.+?): .*?-> (.+?)(?: \(\d+ component\(s\) moved\))?$/);
                line = m ? `moved ${esc(m[1])}` : 'moved a server';
                if (m) detail = `Now at ${m[2]}`;
                break;
            }
            case 'Rack updated': {
                const rack = (notes.match(/^Updated rack: (.+)$/) || [])[1];
                line = rack ? `updated rack ${esc(rack)}` : 'updated a rack';
                break;
            }
            default: {
                const verb = action ? action.charAt(0).toLowerCase() + action.slice(1) : 'changed something';
                line = esc(verb);
                detail = notes.replace(new RegExp(UUID.source, 'gi'), (u) => u.slice(0, 8) + '…');
            }
        }
        if (n > 1 && !['Component added', 'Component removed'].includes(action)) line += ` <span class="rf-mono">×${n}</span>`;

        const t = this.activityTime(log.created_at);
        const initials = (name) => {
            if (!name) return 'SY';
            const parts = String(name).split(/[\s._-]+/).filter(Boolean);
            return ((parts[0] || '')[0] + ((parts[1] || '')[0] || (parts[0] || '')[1] || '')).toUpperCase();
        };

        return `<div class="rf-ev">
            <span class="rf-av${log.username ? '' : ' is-system'}" aria-hidden="true">${esc(initials(log.username))}</span>
            <div class="rf-ev-body">
                <span class="rf-ev-line"><b>${esc(who)}</b> ${line}</span>
                ${detail ? `<span class="rf-ev-detail">${esc(detail)}</span>` : ''}
            </div>
            <span class="rf-ev-time" title="${esc(t.full)}">${esc(t.short)}</span>
        </div>`;
    }

    /** "14:05" today, "Yesterday", otherwise "5 Oct" (IST); full timestamp for the tooltip. */
    activityTime(value) {
        const TZ = 'Asia/Kolkata';
        const d = new Date(String(value || '').replace(' ', 'T') + 'Z');
        if (isNaN(d.getTime())) return { short: '', full: '' };
        const day = (x) => x.toLocaleDateString('en-CA', { timeZone: TZ });
        const now = new Date();
        const yesterday = new Date(now.getTime() - 864e5);
        let short;
        if (day(d) === day(now)) short = d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
        else if (day(d) === day(yesterday)) short = 'Yesterday';
        else {
            const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, day: 'numeric', month: 'short' })
                .formatToParts(d).map(p => [p.type, p.value]));
            short = `${parts.day} ${parts.month}`;
        }
        return { short, full: d.toLocaleString('en-GB', { timeZone: TZ }) + ' IST' };
    }

    /**
     * Put a "filter by location" dropdown in the inventory toolbar, once.
     *
     * Injected rather than written into each of the twelve inventory pages: the
     * six-site list that used to be hardcoded in three files is exactly the
     * mistake this avoids repeating twelve times over.
     *
     * Silently does nothing when there are no locations (the seeders have not
     * been run) — an empty filter is worse than no filter.
     */
    ensureLocationFilter(componentType) {
        if (document.getElementById('componentLocationFilter')) return;

        const search = document.getElementById('componentSearch');
        const host = search?.parentElement;
        if (!search || !host) return;

        // The search sits inside a <label>, so the filter goes in after that
        // label as a sibling chip in the same flex row.
        const anchor = search.closest('label') || search;
        const row = anchor.parentElement;

        const select = document.createElement('select');
        select.id = 'componentLocationFilter';
        select.setAttribute('aria-label', 'Filter by location');
        select.className = 'inv-chip';
        select.innerHTML = '<option value="">Location: Any</option>';
        row.insertBefore(select, anchor.nextSibling);

        api.locations.list().then(result => {
            const locations = (result?.success && result.data?.locations) || [];
            if (!locations.length) {
                // Nothing to filter by — take the control back out rather than
                // leaving a dropdown with one dead option in it.
                select.remove();
                return;
            }
            select.innerHTML = '<option value="">Location: Any</option>' + locations.map(loc =>
                `<option value="${utils.escapeHtml(loc.location_uuid)}">${utils.escapeHtml(loc.name)}</option>`
            ).join('');

            select.addEventListener('change', () => {
                select.classList.toggle('is-active', select.value !== '');
                // A filter change is a new result set, so go back to page 1 —
                // staying on page 4 of a 2-page result shows nothing.
                this.currentPage = 1;
                this.loadComponentList(componentType, true);
            });
        }).catch(() => {
            // 503 until the migration is applied. Remove the control; the page
            // works exactly as it did before this feature.
            select.remove();
        });
    }

    /**
     * Spec + inventory filters (brand, capacity, vendor, warranty...), applied
     * server-side through the list's `filters` param -- see ims-ftp
     * core/helpers/InventoryFilters.php. State is this.componentFilters
     * ({key: [values]}) and is mirrored into the URL as f.<key>=<value> pairs,
     * so a filtered view survives a reload and can be shared.
     *
     * The Filters button stays hidden until {type}-filter-options answers; the
     * page works exactly as before without it.
     */
    ensureFilterPanel() {
        if (this._filterPanelReady) return;
        const button = document.getElementById('filtersBtn');
        const panel = document.getElementById('filtersPanel');
        if (!button || !panel) return;
        this._filterPanelReady = true;
        this.componentFilters = this.readFiltersFromUrl();
        this.filterGroups = [];

        button.addEventListener('click', () => this.toggleFilterPanel());
        document.getElementById('filtersDone')?.addEventListener('click', () => {
            this.toggleFilterPanel(false);
            button.focus();
        });
        document.getElementById('filtersClear')?.addEventListener('click', () => this.setComponentFilters({}));

        panel.addEventListener('change', (e) => {
            const input = e.target.closest('input[data-fkey]');
            if (!input) return;
            this.toggleComponentFilter(input.dataset.fkey, input.dataset.fvalue, input.checked);
        });

        document.addEventListener('click', (e) => {
            if (panel.style.display !== 'none' && !e.target.closest('.inv-fwrap')) this.toggleFilterPanel(false);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || panel.style.display === 'none') return;
            this.toggleFilterPanel(false);
            button.focus();
        });

        document.getElementById('activeFilters')?.addEventListener('click', (e) => {
            const chip = e.target.closest('button[data-fkey]');
            if (chip) {
                this.toggleComponentFilter(chip.dataset.fkey, chip.dataset.fvalue, false);
            } else if (e.target.closest('[data-fclear]')) {
                this.setComponentFilters({});
            }
        });

        this.renderActiveFilters();
    }

    readFiltersFromUrl() {
        const filters = {};
        for (const [name, value] of new URLSearchParams(window.location.search)) {
            if (!name.startsWith('f.') || !value) continue;
            const key = name.slice(2);
            if (!/^[a-z_]{1,40}$/.test(key)) continue;
            filters[key] = filters[key] || [];
            if (!filters[key].includes(value)) filters[key].push(value);
        }
        return filters;
    }

    writeFiltersToUrl() {
        const params = new URLSearchParams(window.location.search);
        [...new Set(params.keys())].filter(k => k.startsWith('f.')).forEach(k => params.delete(k));
        Object.entries(this.componentFilters).forEach(([key, values]) => values.forEach(v => params.append(`f.${key}`, v)));
        window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`);
    }

    /** The list/export `filters` param, or null when nothing is filtered. */
    filtersParam() {
        const filters = this.componentFilters || {};
        return Object.keys(filters).length ? JSON.stringify(filters) : null;
    }

    toggleComponentFilter(key, value, on) {
        const next = { ...this.componentFilters };
        const values = new Set(next[key] || []);
        if (on) values.add(value); else values.delete(value);
        if (values.size) next[key] = [...values]; else delete next[key];
        this.setComponentFilters(next);
    }

    setComponentFilters(filters) {
        this.componentFilters = filters;
        this.writeFiltersToUrl();
        this.syncFilterCheckboxes();
        this.renderActiveFilters();
        // A new result set, so back to page 1. Debounced: ticking three boxes
        // in a row is one reload, not three.
        this.currentPage = 1;
        clearTimeout(this._filterReloadTimer);
        this._filterReloadTimer = setTimeout(() => this.loadComponentList(this.currentComponent, true), 250);
    }

    toggleFilterPanel(open) {
        const panel = document.getElementById('filtersPanel');
        const button = document.getElementById('filtersBtn');
        if (!panel || !button) return;
        const show = open ?? panel.style.display === 'none';
        panel.style.display = show ? 'flex' : 'none';
        button.setAttribute('aria-expanded', String(show));
        if (show) panel.querySelector('input:not([disabled])')?.focus();
    }

    /**
     * Fetch the panel's values and counts for the current search, status and
     * site. Only refetched when one of those changes -- paging and the filters
     * themselves do not move the counts.
     */
    async refreshFilterOptions(componentType, baseParams) {
        const key = `${componentType}|${JSON.stringify(baseParams)}`;
        if (this._filterOptionsKey === key) return;
        this._filterOptionsKey = key;
        try {
            const result = await api.components.filterOptions(componentType, baseParams);
            if (this._filterOptionsKey !== key) return; // superseded by a newer request
            this.filterGroups = result?.data?.filters || [];
            const button = document.getElementById('filtersBtn');
            if (button) button.style.display = this.filterGroups.length ? '' : 'none';
            this.renderFilterPanel();
            this.renderActiveFilters();
        } catch (error) {
            // Decoration, like the counts: without it the list still works.
            console.debug('Filter options unavailable:', error);
        }
    }

    renderFilterPanel() {
        const body = document.getElementById('filtersPanelBody');
        if (!body) return;
        const esc = utils.escapeHtml;
        body.innerHTML = (this.filterGroups || []).map(group => {
            const selected = new Set(this.componentFilters[group.key] || []);
            const options = [...group.options];
            // A ticked value keeps its row even when the current site or status
            // has none of it, so it can still be unticked here.
            selected.forEach(value => {
                if (!options.some(o => o.value === value)) options.push({ value, label: value, count: 0 });
            });
            const rows = options.length ? options.map(o => {
                const checked = selected.has(o.value);
                const empty = !o.count && !checked;
                return `<label class="inv-fopt${empty ? ' is-empty' : ''}">
                    <input type="checkbox" data-fkey="${esc(group.key)}" data-fvalue="${esc(o.value)}"${checked ? ' checked' : ''}${empty ? ' disabled' : ''}>
                    <span class="inv-fopt-label" title="${esc(o.label)}">${esc(o.label)}</span>
                    <span class="inv-fopt-n inv-mono">${Number(o.count || 0).toLocaleString()}</span>
                </label>`;
            }).join('') : '<p class="inv-fempty">Nothing in this list yet</p>';
            return `<fieldset class="inv-fgroup"><legend>${esc(group.label)}</legend><div class="inv-fgroup-list">${rows}</div></fieldset>`;
        }).join('');
    }

    /** Tick state only, so an open panel keeps its scroll position. */
    syncFilterCheckboxes() {
        document.querySelectorAll('#filtersPanel input[data-fkey]').forEach(input => {
            input.checked = (this.componentFilters[input.dataset.fkey] || []).includes(input.dataset.fvalue);
        });
    }

    renderActiveFilters() {
        const host = document.getElementById('activeFilters');
        const badge = document.getElementById('filtersCount');
        const button = document.getElementById('filtersBtn');
        const entries = Object.entries(this.componentFilters || {});
        const total = entries.reduce((n, [, values]) => n + values.length, 0);

        if (badge) {
            badge.textContent = String(total);
            badge.style.display = total ? '' : 'none';
        }
        button?.classList.toggle('is-active', total > 0);
        if (!host) return;
        if (!total) {
            host.style.display = 'none';
            host.innerHTML = '';
            return;
        }

        const esc = utils.escapeHtml;
        const groups = new Map((this.filterGroups || []).map(g => [g.key, g]));
        const chips = entries.flatMap(([key, values]) => values.map(value => {
            const group = groups.get(key);
            const name = group?.label ?? key;
            const label = group?.options.find(o => o.value === value)?.label ?? value;
            return `<button type="button" class="inv-active-chip" data-fkey="${esc(key)}" data-fvalue="${esc(value)}" aria-label="Remove filter ${esc(name)}: ${esc(label)}">
                <span><b>${esc(name)}:</b> ${esc(label)}</span><i class="fas fa-times" aria-hidden="true"></i>
            </button>`;
        }));
        host.innerHTML = chips.join('') + '<button type="button" class="inv-active-clear" data-fclear="1">Clear all</button>';
        host.style.display = 'flex';
    }

    async loadComponentList(componentType, forceRefresh = false) {
        if (!componentType || componentType === 'dashboard') return;
        if (this.loadingStates.components && !forceRefresh) {
            return;
        }

        try {
            this.loadingStates.components = true;
            utils.showLoading(true, `Loading ${componentType} components...`);

            // The location filter is injected into the toolbar rather than added
            // to all twelve inventory pages' markup — one place to change, and no
            // twelve-file diff for one dropdown.
            this.ensureLocationFilter(componentType);
            this.ensureFilterPanel();

            const addLabel = document.getElementById('addComponentLabel');
            if (addLabel) addLabel.textContent = `Add ${utils.componentLabelsSingular?.[componentType] || componentType.toUpperCase()}`;
            // Not awaited: the table should not wait on the counts.
            this.loadInventoryCounts(componentType, forceRefresh);

            const search = document.getElementById('componentSearch')?.value || '';
            const params = { limit: this.itemsPerPage, offset: (this.currentPage - 1) * this.itemsPerPage };
            if (search) params.search = search;

            // Server-side, like search and location_uuid. Filtering here in the
            // browser only ever saw the loaded page: "Show Failed" on page 1 of
            // 40 searched 50 rows, and the footer reported the filtered count
            // against an unfiltered total.
            const statusFilter = document.getElementById('statusFilter')?.value ?? '';
            if (statusFilter !== '') params.status = statusFilter;

            // Filtered server-side: it reads the indexed location_uuid column, so
            // it filters the whole inventory rather than just the loaded page.
            const locationFilter = document.getElementById('componentLocationFilter')?.value || '';
            if (locationFilter) params.location_uuid = locationFilter;

            // The filter panel's counts follow search, status and site, never
            // the page or the filters themselves. Not awaited, like the counts.
            const { limit, offset, ...baseParams } = params;
            if (this._filterPanelReady) this.refreshFilterOptions(componentType, baseParams);
            const filters = this.filtersParam();
            if (filters) params.filters = filters;

            const result = await api.components.list(componentType, params);

            if (result.success) {
                const components = result.data.components || [];
                this.renderComponentTable(components, componentType);

                // Handle pagination - support both formats
                if (result.data.pagination) {
                    this.renderPagination(result.data.pagination);
                } else if (result.data.total_count !== undefined) {
                    // Create pagination object from total_count
                    const pagination = {
                        total: result.data.total_count,
                        limit: this.itemsPerPage,
                        offset: (this.currentPage - 1) * this.itemsPerPage,
                        page: this.currentPage
                    };
                    this.renderPagination(pagination);
                }

                this.updateBulkActions();
            }
        } catch (error) {
            console.error(`Error loading ${componentType} components:`, error);
            utils.showAlert(error.message || `Failed to load ${componentType} components`, 'error');
        } finally {
            this.loadingStates.components = false;
            utils.showLoading(false);
        }
    }

    /**
     * Reveal a write affordance, and record whether using it will PERFORM the
     * change or REQUEST it.
     *
     * The button is now shown to everyone. Someone without the permission is not
     * given a dead button and not offered a way to be handed the permission —
     * they open the same form, and it submits a Request. An admin approves and
     * the system performs the change on their behalf. Nobody is ever granted
     * access to anything.
     *
     * UI-only, like every hasPermission() call in this codebase: the backend
     * still rejects a direct write from someone who cannot make it. All this
     * decides is which of the two honest paths the form takes.
     *
     * @param permission e.g. 'server.create', 'cpu.create'
     * @param btnId      the affordance to reveal
     * @returns {boolean} true when the user can perform the change directly
     */
    applyPermissionGate(permission, btnId) {
        const allowed = api.utils.hasPermission(permission);

        const btn = document.getElementById(btnId);
        if (btn) {
            btn.style.display = '';
            // Read by the form to decide whether to act or to raise a request.
            btn.dataset.requestMode = allowed ? '' : '1';
            btn.title = allowed ? '' : 'You will be asked to submit this as a request for approval';
        }

        return allowed;
    }

    /** Servers page: the Build Server button. */
    applyServerCreateGate() {
        this.applyPermissionGate('server.create', 'addServerBtn');
    }

    /** Inventory page: the Add button for whichever component type is open. */
    applyComponentCreateGate(componentType) {
        if (!componentType) return;
        this.applyPermissionGate(`${componentType}.create`, 'addComponentBtn');
        // Import has no Request fallback -- a Request carries one unit -- so
        // it shows only to someone bulk-add will accept. UI-only, like the rest.
        const importBtn = document.getElementById('importComponentsBtn');
        if (importBtn) importBtn.style.display = api.utils.hasPermission(`${componentType}.create`) ? '' : 'none';
    }

    async loadServerList(forceRefresh = false) {
        if (this.loadingStates.servers && !forceRefresh) {
            return;
        }

        try {
            this.loadingStates.servers = true;

            // Only fetch from API if we don't have cached data or forcing refresh
            if (!this.allServers || forceRefresh) {
                utils.showLoading(true, `Loading servers...`);
                // The card grid has no pagination UI, and every search, status
                // filter and by-serial lookup below runs over this.allServers --
                // so the cache has to hold the whole list. server-list-configs
                // defaults to a 20-row page and caps one at 200, which is why only
                // 20 cards used to appear; walk the pages until has_more is false.
                const pageSize = 200;
                const collected = [];
                let offset = 0;
                // The enclosure roster is page-wide, not per-row: every racked blade
                // chassis, including ones holding nothing, which have no
                // configuration row to arrive with. Identical on every page, so the
                // first one that carries it wins.
                this.allEnclosures = [];

                while (true) {
                    const result = await api.servers.listConfigs({
                        limit: String(pageSize),
                        offset: String(offset)
                    });

                    if (!result.success || !result.data || !Array.isArray(result.data.configurations)) {
                        console.error('Invalid server list response:', result);
                        break;
                    }

                    const page = result.data.configurations;
                    collected.push(...page);

                    if (!this.allEnclosures.length && Array.isArray(result.data.enclosures)) {
                        this.allEnclosures = result.data.enclosures;
                    }

                    const pagination = result.data.pagination || {};
                    const hasMore = pagination.has_more === true || pagination.has_more === 1;
                    if (!hasMore || page.length === 0) break;

                    offset += pageSize;
                    // Guard against a backend that reports has_more forever.
                    if (offset >= 10000) break;
                }

                this.allServers = collected;
            }

            // Apply frontend filtering
            this.filterAndRenderServers();

        } catch (error) {
            console.error(`Error loading servers:`, error);
            utils.showAlert(error.message || 'Failed to load servers', 'error');
            this.renderServerList([]);
        } finally {
            this.loadingStates.servers = false;
            utils.showLoading(false);
        }
    }

    async filterAndRenderServers() {
        if (!this.allServers) {
            this.renderServerList([]);
            return;
        }

        // Get search and filter values
        const search = document.getElementById('serverSearch')?.value?.trim().toLowerCase() || '';
        const status = document.getElementById('serverStatusFilter')?.value || '';

        // Enclosure sections read this: with nothing filtered, the list shows every
        // blade chassis including the empty ones — an empty chassis is a thing you
        // need to find. With a filter on, it is not a hit for "prod-04", so only
        // chassis still holding a matching sled are shown.
        this.serverFilterActive = !!(search || status);

        // Filter servers on frontend (only show non-virtual servers)
        let filteredServers = this.allServers.filter(server => !(server.is_virtual == 1 || server.is_virtual === true));

        // Apply search filter
        if (search) {
            const localMatches = filteredServers.filter(server => {
                const name = (server.server_name || '').toLowerCase();
                const description = (server.description || '').toLowerCase();
                const location = (server.location || '').toLowerCase();
                const notes = (server.notes || '').toLowerCase();
                const uuid = (server.config_uuid || '').toLowerCase();
                // The server's own serial. Matched locally so typing BDC-SRV-000123
                // resolves instantly off the loaded list; the searchBySerial
                // fallback below also matches it server-side, which is what finds
                // a server whose page of the list has not been loaded.
                const serial = (server.serial_number || '').toLowerCase();
                // Recorded public/private IPs, so "10.0.4." or a full address
                // finds the server. search-by-serial matches them server-side too.
                const ips = (server.ip_addresses || []).map(ip => (ip.ip_address || '').toLowerCase());

                return name.includes(search) ||
                    description.includes(search) ||
                    location.includes(search) ||
                    notes.includes(search) ||
                    uuid.includes(search) ||
                    serial.includes(search) ||
                    ips.some(ip => ip.includes(search));
            });

            if (localMatches.length > 0) {
                filteredServers = localMatches;
            } else {
                // No local matches - try searching by component serial number
                try {
                    const result = await api.servers.searchBySerial(search);
                    if (result.success && result.data?.config_uuids?.length > 0) {
                        const matchedUuids = new Set(result.data.config_uuids);
                        filteredServers = this.allServers.filter(server =>
                            matchedUuids.has(server.config_uuid) &&
                            !(server.is_virtual == 1 || server.is_virtual === true)
                        );
                    } else {
                        filteredServers = [];
                    }
                } catch (e) {
                    filteredServers = [];
                }
            }
        }

        // Apply status filter
        if (status) {
            filteredServers = filteredServers.filter(server => {
                return server.configuration_status == status;
            });
        }

        // Render filtered results
        this.renderServerList(filteredServers);
    }

    // loadACLView and loadTicketsView removed as they are now separate pages

    renderComponentTable(components, componentType) {
        const tbody = document.getElementById('componentsTableBody');
        if (!tbody) return;
        this.closeRowMenu();
        // Kept so the row menu and the CSV export can find a row by ID.
        this.componentRows = new Map(components.map(c => [Number(c.ID), c]));
        const singular = utils.componentLabelsSingular?.[componentType] || componentType.toUpperCase();
        if (components.length === 0) {
            const filtered = (document.getElementById('componentSearch')?.value || '') !== ''
                || (document.getElementById('statusFilter')?.value || '') !== ''
                || (document.getElementById('componentLocationFilter')?.value || '') !== ''
                || this.filtersParam() !== null;
            const canAdd = document.getElementById('addComponentBtn')?.style.display !== 'none';
            tbody.innerHTML = `
                <tr><td colspan="7" class="inv-empty">
                    <h3>${filtered ? 'Nothing matches these filters' : `No ${utils.escapeHtml(singular)} units yet`}</h3>
                    <p>${filtered ? 'Change the search, status, location or filters to see more.' : 'Units appear here once they are added to inventory.'}</p>
                    ${!filtered && canAdd ? `<button type="button" class="inv-btn inv-btn-primary" onclick="dashboard.showAddForm()"><i class="fas fa-plus" aria-hidden="true"></i> Add ${utils.escapeHtml(singular)}</button>` : ''}
                </td></tr>`;
            this.updateSelectAllCheckbox();
            return;
        }
        tbody.innerHTML = components.map(component => {
            const id = Number(component.ID);
            const modelName = component.ModelName || null;
            const serialNumber = component.SerialNumber || component.AssetTag || component.UUID || 'N/A';
            // The full physical address the backend resolved for this unit:
            // "Yotta Noida · RACK 682 · U21" when it is installed in a racked
            // server, "Yotta Noida · Shelf B3" when it is free stock. Falls back
            // to the row's own Location text before the location seeders are run.
            const location = component.address_text || component.Location || '';
            const primaryDisplay = utils.escapeHtml(modelName || serialNumber);
            const secondaryDisplay = modelName ? `<span class="inv-mono inv-serial">${utils.escapeHtml(serialNumber)}</span>` : '';
            const selected = this.selectedItems.has(id);

            let installedIn = '<span class="inv-dim">—</span>';
            if (component.ServerUUID) {
                const label = component.server_name || utils.truncateText(component.ServerUUID, 20);
                installedIn = `<a class="inv-link" href="../server/builder.html?config=${encodeURIComponent(component.ServerUUID)}">${utils.escapeHtml(label)}</a>`;
            }

            return `
            <tr class="${selected ? 'is-selected' : ''}">
                <td data-label="Select"><input type="checkbox" class="component-checkbox" value="${id}" ${selected ? 'checked' : ''} aria-label="Select ${primaryDisplay}" onchange="dashboard.handleItemSelection(this)"></td>
                <td data-label="Model"><div class="inv-model"><span class="inv-model-name">${primaryDisplay}</span>${secondaryDisplay}</div></td>
                <td data-label="Status">${this._inventoryStatus(component.Status)}</td>
                <td data-label="Installed in">${installedIn}</td>
                <td data-label="Location" class="inv-loc">${location ? utils.escapeHtml(location) : '<span class="inv-dim">—</span>'}</td>
                <td data-label="Warranty">${this._warrantyCell(component.WarrantyEndDate)}</td>
                <td data-label="Actions"><button type="button" class="inv-more" aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ${primaryDisplay}" onclick="dashboard.openRowMenu(this, ${id})">⋯</button></td>
            </tr>
        `;
        }).join('');
        this.updateSelectAllCheckbox();
    }

    _inventoryStatus(status) {
        const map = { 1: ['s-available', 'Available'], 2: ['s-inuse', 'In use'], 0: ['s-failed', 'Failed'] };
        const [cls, label] = map[Number(status)] || ['s-unknown', 'Unknown'];
        return `<span class="inv-status ${cls}">${label}</span>`;
    }

    /** "Mar 2029", amber inside 90 days, red once past. */
    _warrantyCell(value) {
        if (!value) return '<span class="inv-dim">—</span>';
        const end = new Date(String(value).replace(' ', 'T'));
        if (isNaN(end)) return '<span class="inv-dim">—</span>';
        const days = (end - Date.now()) / 86400000;
        const cls = days < 0 ? 'is-expired' : (days <= 90 ? 'is-soon' : '');
        const text = end.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        const title = days < 0 ? 'Warranty expired' : `Warranty ends ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        return `<span class="inv-mono inv-warranty ${cls}" title="${title}">${text}</span>`;
    }

    /**
     * The per-status counts on the segmented filter and the subtitle. They come
     * from the same cached dashboard counts the sidebar shows, so they describe
     * the whole type, not the current search or location.
     */
    async loadInventoryCounts(componentType, forceRefresh = false) {
        const summary = document.getElementById('inventorySummary');
        if (!window.sidebarManager?.getComponentCounts) return;
        try {
            const counts = (await window.sidebarManager.getComponentCounts(forceRefresh))?.[componentType];
            if (!counts) return;
            document.querySelectorAll('#statusSegments [data-count]').forEach(el => {
                const n = counts[el.dataset.count];
                el.textContent = n === undefined || n === null ? '' : Number(n).toLocaleString();
            });
            if (summary) {
                const total = Number(counts.total || 0);
                summary.textContent = `${total.toLocaleString()} ${total === 1 ? 'unit' : 'units'} · ${Number(counts.available || 0).toLocaleString()} available`;
            }
        } catch (error) {
            // Counts are decoration; the table still works without them.
            console.debug('Inventory counts unavailable:', error);
        }
    }

    /** One menu element for every row, positioned against the clicked button. */
    openRowMenu(button, id) {
        const wasOpen = this._rowMenuButton === button;
        this.closeRowMenu();
        if (wasOpen) return;

        const type = this.currentComponent;
        const items = [`<button type="button" role="menuitem" data-act="view"><i class="fas fa-eye" aria-hidden="true"></i>View details</button>`];
        if (api.utils.hasPermission(`${type}.edit`)) {
            items.push(`<button type="button" role="menuitem" data-act="edit"><i class="fas fa-pen" aria-hidden="true"></i>Edit</button>`);
        }
        if (api.utils.hasPermission(`${type}.delete`)) {
            items.push(`<button type="button" role="menuitem" data-act="delete" class="is-danger"><i class="fas fa-trash" aria-hidden="true"></i>Delete</button>`);
        }

        const menu = document.createElement('div');
        menu.className = 'inv-menu';
        menu.setAttribute('role', 'menu');
        menu.innerHTML = items.join('');
        document.body.appendChild(menu);

        const rect = button.getBoundingClientRect();
        const width = menu.offsetWidth;
        const height = menu.offsetHeight;
        const top = rect.bottom + 4 + height > window.innerHeight ? rect.top - 4 - height : rect.bottom + 4;
        menu.style.top = `${Math.max(8, top)}px`;
        menu.style.left = `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`;

        button.setAttribute('aria-expanded', 'true');
        this._rowMenu = menu;
        this._rowMenuButton = button;

        menu.addEventListener('click', (e) => {
            const act = e.target.closest('button[data-act]')?.dataset.act;
            if (!act) return;
            this.closeRowMenu();
            if (act === 'view') this.showComponentViewModal(type, id);
            else if (act === 'edit') this.showEditForm(type, id);
            else if (act === 'delete') this.handleDeleteComponent(type, id);
        });
        menu.addEventListener('keydown', (e) => {
            const buttons = [...menu.querySelectorAll('button')];
            const i = buttons.indexOf(document.activeElement);
            if (e.key === 'ArrowDown') { e.preventDefault(); buttons[(i + 1) % buttons.length].focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length].focus(); }
            else if (e.key === 'Escape') { e.preventDefault(); this.closeRowMenu(); button.focus(); }
            else if (e.key === 'Tab') { this.closeRowMenu(); }
        });
        menu.querySelector('button').focus();

        // Any click elsewhere, scroll or resize closes it. Added on the next
        // tick so the click that opened it does not also close it.
        this._rowMenuDismiss = (e) => {
            if (e.type === 'mousedown' && (menu.contains(e.target) || button.contains(e.target))) return;
            this.closeRowMenu();
        };
        setTimeout(() => {
            if (this._rowMenu !== menu) return;
            document.addEventListener('mousedown', this._rowMenuDismiss);
            window.addEventListener('resize', this._rowMenuDismiss);
            document.addEventListener('scroll', this._rowMenuDismiss, true);
        });
    }

    closeRowMenu() {
        if (this._rowMenuDismiss) {
            document.removeEventListener('mousedown', this._rowMenuDismiss);
            window.removeEventListener('resize', this._rowMenuDismiss);
            document.removeEventListener('scroll', this._rowMenuDismiss, true);
            this._rowMenuDismiss = null;
        }
        this._rowMenu?.remove();
        this._rowMenuButton?.setAttribute('aria-expanded', 'false');
        this._rowMenu = null;
        this._rowMenuButton = null;
    }

    clearSelection() {
        this.selectedItems.clear();
        document.querySelectorAll('.component-checkbox').forEach(cb => {
            cb.checked = false;
            cb.closest('tr')?.classList.remove('is-selected');
        });
        this.updateSelectAllCheckbox();
        this.updateBulkActions();
    }

    /**
     * Every row matching the current search, status, location and filters, not
     * just the loaded page: it pages through the list at the API's 500-row cap.
     */
    async exportComponentsCsv() {
        const type = this.currentComponent;
        const button = document.getElementById('exportComponentsCsv');
        const params = {};
        const search = document.getElementById('componentSearch')?.value || '';
        const status = document.getElementById('statusFilter')?.value ?? '';
        const locationUuid = document.getElementById('componentLocationFilter')?.value || '';
        const filters = this.filtersParam();
        if (search) params.search = search;
        if (status !== '') params.status = status;
        if (locationUuid) params.location_uuid = locationUuid;
        if (filters) params.filters = filters;

        try {
            if (button) button.disabled = true;
            utils.showLoading(true, 'Preparing export...');
            const rows = [];
            for (let offset = 0; ; offset += 500) {
                const result = await api.components.list(type, { ...params, limit: 500, offset });
                const page = result?.data?.components || [];
                rows.push(...page);
                const total = Number(result?.data?.total_count ?? 0);
                if (page.length < 500 || rows.length >= total) break;
            }
            if (!rows.length) {
                toast.warning('Nothing to export for these filters');
                return;
            }

            const statusText = { 0: 'Failed', 1: 'Available', 2: 'In use' };
            const header = ['Model', 'Serial number', 'Asset tag', 'Status', 'Installed in', 'Location', 'Warranty ends', 'Purchase date', 'Vendor', 'Flag', 'Notes', 'UUID'];
            // Quote every cell, and defuse anything a spreadsheet would run as a formula.
            const cell = (v) => {
                let s = v === null || v === undefined ? '' : String(v);
                if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
                return `"${s.replace(/"/g, '""')}"`;
            };
            const lines = [header.map(cell).join(',')].concat(rows.map(c => [
                c.ModelName, c.SerialNumber, c.AssetTag, statusText[Number(c.Status)] ?? c.Status,
                c.server_name || c.ServerUUID, c.address_text || c.Location, c.WarrantyEndDate, c.PurchaseDate,
                c.VendorName, c.Flag, c.Notes, c.UUID
            ].map(cell).join(',')));

            const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${type}-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            toast.success(`Exported ${rows.length.toLocaleString()} ${rows.length === 1 ? 'row' : 'rows'}`);
        } catch (error) {
            console.error('Error exporting components:', error);
            utils.showAlert(error.message || 'Export failed', 'error');
        } finally {
            if (button) button.disabled = false;
            utils.showLoading(false);
        }
    }

    renderServerList(servers) {
        const serverCardsGrid = document.getElementById('serverCardsGrid');
        if (!serverCardsGrid) return;

        // Held back rather than returned on straight away: a page with no server
        // rows can still have something to show — an enclosure standing empty is
        // exactly the case this list used to be blind to. Rendered below, once the
        // enclosure sections are known to be empty too.
        const emptyStateHtml = `
                <div class="col-span-full flex flex-col items-center text-center py-16 px-6 bg-surface-card border border-dashed border-border rounded-xl">
                    <div class="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                        <i class="fas fa-server text-primary text-xl"></i>
                    </div>
                    <h3 class="text-lg font-semibold text-text-primary mb-1">No Servers Found</h3>
                    <p class="text-sm text-text-secondary mb-6">${api.utils.hasPermission('server.create')
                        ? 'Start building your first server configuration'
                        : 'Fill in the server form and it is sent to an admin for approval'}</p>
                    <button class="px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors font-medium text-sm inline-flex items-center gap-2" onclick="dashboard.showAddServerForm()">
                        <i class="fas fa-plus text-xs"></i> ${api.utils.hasPermission('server.create') ? 'Create New Server' : 'Request a New Server'}
                    </button>
                </div>`;

        // The badge now reads status_v2 first — see _serverStatusPresentation().
        // Editing details and changing status are gated separately: the backend
        // enforces both, this only decides whether the button is worth showing.
        const canEditDetails = api.utils.hasPermission('server.edit_details');
        const canTransition = api.utils.hasPermission('server.transition');
        const canOpenEditDialog = canEditDetails || canTransition;

        // Rack View (and therefore every placement action) is admin / super_admin only —
        // api.php role-gates the whole rack module on top of ACL. Same gate the Create
        // Server form uses; the backend is what actually enforces it.
        const canManageRacks = api.utils.hasRole(['admin', 'super_admin']);

        // The full physical address: "Yotta Noida · Floor 2 · RACK 682 · U12-U13".
        // Each part is omitted when absent, so an unracked server at a known site
        // reads just "Yotta Noida" rather than a row of dashes.
        //
        // Falls back to the derived rack_position text alone when the list response
        // carries no placement (rack lookup failed, or the location seeders have
        // not been run yet).
        const getRackLabel = (server) => {
            const startU = parseInt(server.rack_start_u, 10);
            const height = Math.max(1, parseInt(server.rack_u_height, 10) || 1);
            const range = startU
                ? (height > 1 ? `U${startU}-U${startU + height - 1}` : `U${startU}`)
                : (server.rack_position || '');
            const parts = [
                server.location_name || server.location,
                server.floor ? `Floor ${server.floor}` : '',
                server.rack_name,
                range
            ].filter(Boolean).map(part => utils.escapeHtml(String(part)));
            return parts.length ? parts.join(' · ') : '—';
        };

        // One labelled fact. `value` is already-escaped HTML; `title` is the long form
        // shown on hover, or '' for none. Every value truncates, so a long platform
        // name cannot widen the card at any width or zoom level.
        const factCell = (label, value, title) => `
                        <div class="min-w-0">
                            <div class="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-1.5">${label}</div>
                            <div class="text-sm font-semibold text-text-primary truncate"${title ? ` title="${title}"` : ''}>${value || '—'}</div>
                        </div>`;

        // Recorded IPs of one type (server-list-configs' ip_addresses; absent on an
        // older backend). The first address, "+N" for the rest, all of them with
        // their labels on hover.
        const ipCell = (server, type, label) => {
            const ips = (server.ip_addresses || []).filter(ip => ip.ip_type === type);
            if (!ips.length) return factCell(label, '', '');
            const value = utils.escapeHtml(ips[0].ip_address)
                + (ips.length > 1 ? ` <span class="text-text-muted font-normal">+${ips.length - 1}</span>` : '');
            const title = ips.map(ip => ip.label ? `${ip.ip_address} (${ip.label})` : ip.ip_address).join(', ');
            return factCell(label, value, utils.escapeHtml(title));
        };

        // One header icon button. They sit in a single bordered cluster, divided
        // rather than spaced, so the group reads as one control.
        const iconButton = (icon, hoverClass, onclick, title, aria) => `
                                <button class="w-9 h-9 flex items-center justify-center text-text-muted transition-colors ${hoverClass}"
                                        onclick="${onclick}" title="${title}" aria-label="${aria}">
                                    <i class="fas ${icon} text-xs"></i>
                                </button>`;

        // One server card. `bayIndex` is the sled's bay in its enclosure, or null
        // for a directly racked server — the only difference the card itself knows
        // about, and it is one strip. Everything else about a sled's card is
        // byte-identical to what it rendered before, which is also what a row with
        // no enclosure_uuid gets on an older backend.
        const serverCard = (server, bayIndex) => `
            <div class="bg-surface-card border border-border rounded-xl overflow-hidden flex flex-col cursor-pointer group transition-colors hover:border-primary-light" data-server-uuid="${server.config_uuid}">${bayIndex ? `
                <div class="px-5 py-2 bg-surface-secondary border-b border-border-light text-[10px] font-semibold uppercase tracking-widest text-text-muted">Bay ${bayIndex}</div>` : ''}
                <!-- Header: name and serial on the left, the three actions and the
                     status on the right. -->
                <div class="p-5 pb-4 flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <h3 class="text-lg font-semibold text-text-primary truncate leading-snug group-hover:text-primary transition-colors" title="${utils.escapeHtml(server.server_name || 'Unnamed Server')}">
                            ${utils.escapeHtml(server.server_name || 'Unnamed Server')}
                        </h3>
                        <p class="text-xs font-mono text-text-muted truncate mt-1" title="${utils.escapeHtml(server.serial_number || '')}">${server.serial_number ? utils.escapeHtml(server.serial_number) : '—'}</p>
                    </div>
                    <div class="flex flex-col items-center gap-2 flex-shrink-0">
                        <div class="flex items-center rounded-lg border border-border divide-x divide-border overflow-hidden">
                            ${canOpenEditDialog ? iconButton('fa-pen', 'hover:bg-primary/10 hover:text-primary',
                                `event.stopPropagation(); dashboard.showServerEditModal('${server.config_uuid}')`,
                                'Edit server — name, details, location, IPs and status',
                                "Edit this server's details or change its status") : ''}
                            ${iconButton('fa-history', 'hover:bg-primary/10 hover:text-primary',
                                `event.stopPropagation(); dashboard.showServerLogs('${server.config_uuid}', ${utils.jsArg(server.server_name || 'Unnamed Server')})`,
                                'View change history', 'View server change history')}
                            ${iconButton('fa-trash', 'hover:bg-danger-light hover:text-danger',
                                `event.stopPropagation(); dashboard.handleDeleteServer('${server.config_uuid}')`,
                                'Delete Server', 'Delete server')}
                        </div>
                        ${this._serverStatusInline(server)}
                    </div>
                </div>

                <!-- The four facts. Storage and memory come from the list endpoint's
                     storage_summary / memory_summary; both are absent on an older
                     backend, and every cell falls back to an em dash. -->
                <div class="px-5 pt-4 pb-5 flex-1 border-t border-border-light grid grid-cols-2 gap-x-5 gap-y-4">
                    ${factCell('Location', this._serverLocationCompact(server), getRackLabel(server))}
                    ${factCell('Server', utils.escapeHtml(server.platform_name || server.motherboard_name || ''), utils.escapeHtml(server.platform_name || server.motherboard_name || ''))}
                    ${factCell('Storage', utils.escapeHtml(this._serverStorageText(server.storage_summary) || ''), utils.escapeHtml(this._serverStorageTitle(server.storage_summary)))}
                    ${factCell('RAM', utils.escapeHtml(this._serverMemoryText(server.memory_summary) || ''), utils.escapeHtml(this._serverMemoryTitle(server.memory_summary)))}
                    ${ipCell(server, 'public', 'Public IP')}
                    ${ipCell(server, 'private', 'Private IP')}
                </div>

                <!-- Dates -->
                <div class="px-5 py-2.5 border-t border-border-light bg-surface-secondary flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                    <span class="truncate">Created <span class="text-text-secondary tabular-nums">${this._serverDate(server.created_at)}</span></span>
                    <span class="truncate">Modified <span class="text-text-secondary tabular-nums">${this._serverModifiedDate(server)}</span></span>
                </div>

                <!-- Actions -->
                <div class="p-4 mt-auto grid gap-3 ${canManageRacks ? 'grid-cols-2' : 'grid-cols-1'}">
                    <button class="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors font-medium text-sm truncate"
                            onclick="event.stopPropagation(); dashboard.showServerBuilder('${server.config_uuid}', ${utils.jsArg(server.server_name || 'Unnamed Server')})"
                            title="Configure server components">Configure</button>
                    ${canManageRacks ? `<button class="px-4 py-2.5 bg-surface-card text-text-primary border border-border rounded-lg hover:bg-surface-hover hover:border-primary hover:text-primary transition-colors font-medium text-sm truncate"
                            onclick="event.stopPropagation(); dashboard.showRackPlacementModal('${server.config_uuid}', ${utils.jsArg(server.server_name || 'Unnamed Server')})"
                            title="Move server — location, rack and U" aria-label="Move server to another location, rack or U position">Move</button>` : ''}
                </div>
            </div>
        `;

        // ---- Blade enclosures -------------------------------------------------
        //
        // A sled mirrors its enclosure's U range, so four blades in one FX2s used
        // to read as four separate machines stacked in the same two U, and a
        // chassis holding nothing had no row at all. Sleds lift out of the flat
        // grid into a section per enclosure; everything else renders below,
        // unchanged.
        const sledsInView = servers.filter(s => s.enclosure_uuid);
        const directServers = servers.filter(s => !s.enclosure_uuid);

        // Occupancy comes from the WHOLE loaded list, not the filtered view: a bay
        // is full whether or not its sled matches the current search, and the
        // header must never claim four of four above three tiles.
        const occupants = new Map();
        (this.allServers || []).forEach(s => {
            if (!s.enclosure_uuid || !s.slot_index) return;
            if (!occupants.has(s.enclosure_uuid)) occupants.set(s.enclosure_uuid, new Map());
            occupants.get(s.enclosure_uuid).set(parseInt(s.slot_index, 10), s);
        });

        const inView = new Set(servers.map(s => s.config_uuid));

        // The roster is what makes an EMPTY enclosure visible. When it is missing
        // (older backend, or the lookup failed) the sleds still group, off their
        // own rows — one chassis per enclosure_uuid, sized by the highest bay seen.
        let roster = Array.isArray(this.allEnclosures) ? this.allEnclosures.slice() : [];
        const known = new Set(roster.map(e => e.enclosure_uuid));
        sledsInView.forEach(s => {
            if (known.has(s.enclosure_uuid)) return;
            known.add(s.enclosure_uuid);
            const bays = Array.from(occupants.get(s.enclosure_uuid)?.keys() || [parseInt(s.slot_index, 10) || 1]);
            roster.push({
                enclosure_uuid: s.enclosure_uuid,
                name: s.enclosure_name || 'Enclosure',
                model: s.enclosure_model || null,
                rack_name: s.rack_name || null,
                location_name: s.location_name || s.location || null,
                floor: s.floor || null,
                start_u: parseInt(s.rack_start_u, 10) || null,
                u_height: Math.max(1, parseInt(s.rack_u_height, 10) || 1),
                slot_count: Math.max(1, ...bays)
            });
        });

        // A bay strip of squares, filled for occupied. Reads at a glance and works
        // for any bay count, unlike a fixed 2x2 grid of one chassis's geometry.
        const occupancyMeter = (slotCount, filledBays) => {
            const unit = 11, size = 8;
            const width = Math.max(size, slotCount * unit - (unit - size));
            let rects = '';
            for (let bay = 1; bay <= slotCount; bay++) {
                rects += filledBays.has(bay)
                    ? `<rect x="${(bay - 1) * unit}" y="0" width="${size}" height="${size}" rx="1.5" fill="currentColor"></rect>`
                    : `<rect x="${(bay - 1) * unit + 0.5}" y="0.5" width="${size - 1}" height="${size - 1}" rx="1.5" fill="none" stroke="currentColor" stroke-opacity="0.4"></rect>`;
            }
            return `<svg width="${width}" height="${size}" viewBox="0 0 ${width} ${size}" aria-hidden="true">${rects}</svg>`;
        };

        // An enclosure's physical address, built like getRackLabel() but from the
        // chassis's own row — it is the thing in the rack, not its sleds.
        const enclosureAddress = (enclosure) => {
            const startU = parseInt(enclosure.start_u, 10);
            const height = Math.max(1, parseInt(enclosure.u_height, 10) || 1);
            const range = startU ? (height > 1 ? `U${startU}-U${startU + height - 1}` : `U${startU}`) : '';
            return [
                enclosure.model,
                enclosure.location_name,
                enclosure.floor ? `Floor ${enclosure.floor}` : '',
                enclosure.rack_name,
                range
            ].filter(Boolean).map(part => utils.escapeHtml(String(part))).join(' · ');
        };

        const sectionsHtml = roster.map(enclosure => {
            const bays = occupants.get(enclosure.enclosure_uuid) || new Map();
            const matching = sledsInView.filter(s => s.enclosure_uuid === enclosure.enclosure_uuid);

            // With a filter on, an enclosure holding nothing that matches is not a
            // result. With no filter, every enclosure shows — empty ones included.
            if (this.serverFilterActive && matching.length === 0) return '';

            const slotCount = Math.max(1, parseInt(enclosure.slot_count, 10) || 1);
            const filled = new Set(Array.from(bays.keys()).filter(bay => bay >= 1 && bay <= slotCount));
            // Counted off the same set the meter and the tiles are drawn from, not
            // off the roster's slots_used: the header must never disagree with the
            // bays underneath it, even if the two ever drift.
            const used = filled.size;

            // Collapsed sections survive a re-render and a reload: the set is kept
            // in localStorage, not in the markup, so filtering, refreshing or
            // reopening the page does not reopen a chassis somebody folded away.
            const collapsed = this.getCollapsedEnclosures().has(enclosure.enclosure_uuid);

            let tiles = '';
            for (let bay = 1; bay <= slotCount; bay++) {
                const occupant = bays.get(bay);
                if (occupant && inView.has(occupant.config_uuid)) {
                    tiles += serverCard(occupant, bay);
                    continue;
                }

                // A full bay whose sled the current filter excludes still says so,
                // by name — otherwise the section would read as having a free bay
                // that is not free.
                const label = occupant
                    ? `<div class="text-sm font-semibold text-text-secondary truncate w-full" title="${utils.escapeHtml(occupant.server_name || '')}">${utils.escapeHtml(occupant.server_name || 'Occupied')}</div>
                       <div class="text-xs text-text-muted mt-1">Hidden by the current filter</div>`
                    : `<div class="text-sm font-semibold text-text-secondary">Free</div>
                       ${canManageRacks ? `<a href="racks.html" class="text-xs text-primary hover:underline mt-1 inline-block">Open rack view</a>` : ''}`;

                tiles += `
            <div class="bg-surface-card border border-dashed border-border rounded-xl flex flex-col items-center justify-center text-center px-5 py-12 min-w-0">
                <div class="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-2">Bay ${bay}</div>
                ${label}
            </div>`;
            }

            return `
        <section class="col-span-full bg-surface-secondary border border-border rounded-xl overflow-hidden" data-enclosure-uuid="${utils.escapeHtml(enclosure.enclosure_uuid)}">
            <header class="px-5 py-4 bg-surface-card flex flex-wrap items-center justify-between gap-4">
                <div class="min-w-0">
                    <h3 class="text-base font-semibold text-text-primary truncate" title="${utils.escapeHtml(enclosure.name || 'Enclosure')}">${utils.escapeHtml(enclosure.name || 'Enclosure')}</h3>
                    <p class="text-xs text-text-muted truncate mt-1">${enclosureAddress(enclosure) || '—'}</p>
                </div>
                <div class="flex items-center gap-3 flex-shrink-0 text-text-secondary">
                    ${occupancyMeter(slotCount, filled)}
                    <span class="text-[10px] font-semibold uppercase tracking-widest text-text-muted">${used} of ${slotCount} bays</span>
                    <button class="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors"
                            onclick="dashboard.toggleEnclosure(this)"
                            aria-expanded="${collapsed ? 'false' : 'true'}"
                            title="${collapsed ? 'Show bays' : 'Hide bays'}"
                            aria-label="${collapsed ? 'Show' : 'Hide'} the bays of ${utils.escapeHtml(enclosure.name || 'this enclosure')}">
                        <i class="fas ${collapsed ? 'fa-chevron-down' : 'fa-chevron-up'} text-xs"></i>
                    </button>
                </div>
            </header>
            <div class="p-5 grid server-cards-grid grid-gap-responsive border-t border-border-light" data-enclosure-body${collapsed ? ' style="display:none"' : ''}>${tiles}
            </div>
        </section>`;
        }).join('');

        const directHtml = directServers.map(server => serverCard(server, null)).join('');

        serverCardsGrid.innerHTML = (sectionsHtml || directHtml)
            ? sectionsHtml + directHtml
            : emptyStateHtml;
    }

    /**
     * Fold an enclosure's bays away, or bring them back.
     *
     * Toggles the section in place rather than re-rendering the whole grid — the
     * list is 74 cards and nothing else about it has changed. The remembered set
     * is what renderServerList() reads, so the state holds across a filter, a
     * search, a refresh or a reload.
     *
     * display is set directly instead of through a utility class: the body is a
     * grid, and a class that has to beat `display: grid` depends on which rule the
     * compiled stylesheet emits last.
     *
     * The uuid is read off the section's dataset rather than passed in: an inline
     * handler built by concatenating an identifier into a quoted JS string is one
     * stray quote away from being an injection point, and the button already knows
     * where it lives.
     */
    toggleEnclosure(button) {
        const section = button?.closest('[data-enclosure-uuid]');
        const body = section?.querySelector('[data-enclosure-body]');
        const enclosureUuid = section?.dataset?.enclosureUuid;
        if (!body || !enclosureUuid) return;

        const collapsedEnclosures = this.getCollapsedEnclosures();
        const collapse = !collapsedEnclosures.has(enclosureUuid);
        if (collapse) {
            collapsedEnclosures.add(enclosureUuid);
        } else {
            collapsedEnclosures.delete(enclosureUuid);
        }
        try {
            localStorage.setItem('collapsed_enclosures', JSON.stringify(Array.from(collapsedEnclosures)));
        } catch (e) { /* storage blocked: the fold still holds for this visit */ }

        body.style.display = collapse ? 'none' : '';
        button.setAttribute('aria-expanded', collapse ? 'false' : 'true');
        button.setAttribute('title', collapse ? 'Show bays' : 'Hide bays');
        const icon = button.querySelector('i');
        if (icon) {
            icon.className = `fas ${collapse ? 'fa-chevron-down' : 'fa-chevron-up'} text-xs`;
        }
    }

    /**
     * The enclosures this browser has folded away. Read from localStorage once,
     * so a fold outlives closing the tab and only the toggle reopens it.
     */
    getCollapsedEnclosures() {
        if (!(this.collapsedEnclosures instanceof Set)) {
            let saved = [];
            try {
                saved = JSON.parse(localStorage.getItem('collapsed_enclosures') || '[]');
            } catch (e) { /* unreadable or blocked storage: start with none folded */ }
            this.collapsedEnclosures = new Set(Array.isArray(saved) ? saved : []);
        }
        return this.collapsedEnclosures;
    }

    renderPagination(pagination) {
        const paginationContainer = document.getElementById('pagination');
        const paginationInfo = document.getElementById('paginationInfo');
        if (!paginationContainer || !pagination) return;
        const total = Number(pagination.total) || 0;
        const start = total === 0 ? 0 : pagination.offset + 1;
        const end = Math.min(pagination.offset + pagination.limit, total);
        paginationInfo.textContent = total === 0
            ? '0 matching'
            : `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()} matching`;
        const totalPages = Math.max(1, Math.ceil(total / pagination.limit));
        const currentPage = pagination.page;

        // Previous / page / Next. The page indicator only appears when there is
        // more than one page to be on.
        paginationContainer.innerHTML = totalPages === 1 ? '' : `
            <button type="button" class="inv-btn" ${currentPage <= 1 ? 'disabled' : ''}
                    onclick="window.dashboard.goToPage(${currentPage - 1})">Previous</button>
            <span class="inv-page-no inv-mono">${currentPage} / ${totalPages}</span>
            <button type="button" class="inv-btn" ${currentPage >= totalPages ? 'disabled' : ''}
                    onclick="window.dashboard.goToPage(${currentPage + 1})">Next</button>`;
    }

    goToPage(page) {
        this.currentPage = page;
        this.loadComponentList(this.currentComponent);
    }

    handleSearch(query) {
        // Locations and Vendors reuse the #componentSearch box but filter their own
        // lists. Reloading here sent `locations-list` / `vendors-list`, which the API
        // rejects, so every keystroke raised an "Invalid module" error toast.
        if (this.currentComponent === 'locations' || this.currentComponent === 'vendors') return;
        this.currentPage = 1;
        this.loadComponentList(this.currentComponent, true);
    }

    handleFilterChange(filterType, value) {
        // Every filter is server-side now, status included, so they all reset to
        // page 1 and reload. Status used to re-render the loaded page instead,
        // which searched one page of a paginated table and counted against the
        // wrong total.
        this.currentPage = 1;
        this.loadComponentList(this.currentComponent, true);
    }

    handleItemSelection(checkbox) {
        const id = parseInt(checkbox.value);
        if (checkbox.checked) this.selectedItems.add(id); else this.selectedItems.delete(id);
        checkbox.closest('tr')?.classList.toggle('is-selected', checkbox.checked);
        this.updateBulkActions();
        this.updateSelectAllCheckbox();
    }

    toggleSelectAll(checked) {
        document.querySelectorAll('.component-checkbox').forEach(checkbox => {
            checkbox.checked = checked;
            this.handleItemSelection(checkbox);
        });
    }

    updateSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById('selectAllComponents');
        const checkboxes = document.querySelectorAll('.component-checkbox');
        if (!selectAllCheckbox) return;
        const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
        selectAllCheckbox.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
        selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
    }

    updateBulkActions() {
        const bulkActions = document.getElementById('bulkActions');
        const selectedCount = document.getElementById('selectedCount');
        if (bulkActions && selectedCount) {
            if (this.selectedItems.size > 0) {
                selectedCount.textContent = this.selectedItems.size;
                bulkActions.style.display = 'flex';
            } else {
                bulkActions.style.display = 'none';
            }
        }
    }

    async showAddForm() {
        if (this.currentComponent === 'dashboard') {
            utils.showAlert('Please select a specific component type (CPU, RAM, etc.) to add.', 'warning');
            return;
        }

        try {
            utils.showLoading(true, 'Loading form...');

            // Load the full add component form HTML
            const formUrl = '../../pages/forms/add-component.html';

            const response = await fetch(formUrl);

            if (!response.ok) {
                throw new Error(`Could not load form HTML. Status: ${response.status}`);
            }

            const formHtml = await response.text();

            // Hide loading spinner before showing the drawer
            utils.showLoading(false);

            const singular = utils.componentLabelsSingular?.[this.currentComponent] || this.currentComponent.toUpperCase();
            this.openDrawer(formHtml, `Add ${singular}`);

            await this._loadFormScript('../../assets/js/forms/add-form.js', 'initializeAddComponentForm');
            const form = initializeAddComponentForm(this.currentComponent);
            this._drawerGuard = () => (typeof form.hasUserInput === 'function' && form.hasUserInput() ? 1 : 0);
        } catch (error) {
            this.closeDrawer();
            console.error('Error loading add form:', error);
            utils.showAlert(`Failed to load the add component form: ${error.message}`, 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    /**
     * Excel import for the open component type, in the same drawer as Add.
     * assets/js/dashboard/component-import.js is loaded on first use; it
     * owns the sample file, the checks and the import.
     */
    async showImportDrawer() {
        const type = this.currentComponent;
        if (!type || type === 'dashboard') return;
        try {
            await this._loadFormScript('../../assets/js/dashboard/component-import.js', 'ComponentImport');
            await new ComponentImport(this, type).open();
        } catch (error) {
            console.error('Error opening import:', error);
            this.closeDrawer();
            utils.showAlert(error.message || 'The import could not be opened', 'error');
        }
    }

    async showAddServerForm() {
        // Without server.create the same form raises a New Server request; an
        // admin approves it and the server is created and placed for them.
        const asRequest = !api.utils.hasPermission('server.create');
        const formContent = `
        <form id="createServerForm" class="max-w-lg mx-auto">
            <!-- Header Section with Icon -->
            <div class="flex items-center justify-center mb-6 pb-6 border-b border-slate-200">
                <div class="flex flex-col items-center gap-4">
                    <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center shadow-lg transform transition-transform hover:scale-105">
                        <i class="fas fa-server text-white text-2xl"></i>
                    </div>
                    <div class="text-center">
                        <p class="text-sm text-slate-500">${asRequest
                            ? 'This is sent as a request. Once an admin approves it, the server is created for you.'
                            : 'Configure your new server infrastructure'}</p>
                    </div>
                </div>
            </div>

            <!-- Toggle Section -->
            <div class="flex items-center justify-between p-4 bg-slate-50 rounded-xl mb-6 border border-slate-200">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center">
                        <i class="fas fa-cog text-teal-600 text-sm"></i>
                    </div>
                    <div>
                        <span class="text-sm font-medium text-slate-700">Server Template</span>
                        <p class="text-xs text-slate-500">Show additional options</p>
                    </div>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" id="advancedViewToggle">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            
            <!-- Standard Form Fields -->
            <div id="standardForm" class="space-y-5">
                <div class="form-group">
                    <label for="serverName" class="form-label required flex items-center gap-2">
                        <i class="fas fa-tag text-teal-600 text-sm"></i>
                        Server Name
                    </label>
                    <input type="text" class="form-input" id="serverName" required
                           placeholder="e.g., Production Web Server">
                </div>
                <div class="form-group" id="serialNumberGroup">
                    <label for="serverSerialNumber" class="form-label required flex items-center gap-2">
                        <i class="fas fa-barcode text-teal-600 text-sm"></i>
                        Serial Number
                    </label>
                    <input type="text" class="form-input" id="serverSerialNumber" maxlength="50"
                           placeholder="Serial printed on the server">
                    <p class="text-xs text-slate-500 mt-1">The manufacturer serial on the physical machine. Each server's must be unique.</p>
                </div>
                <div class="form-group">
                    <label for="description" class="form-label flex items-center gap-2">
                        <i class="fas fa-align-left text-teal-600 text-sm"></i>
                        Description
                    </label>
                    <textarea class="form-textarea" id="description" rows="3"
                              placeholder="Enter server description and purpose"></textarea>
                </div>
                <div class="form-group">
                    <label for="serverLocation" class="form-label required flex items-center gap-2">
                        <i class="fas fa-map-marker-alt text-teal-600 text-sm"></i>
                        Location
                    </label>
                    <select class="form-select" id="serverLocation" required>
                        <option value="">Loading locations…</option>
                    </select>
                </div>
                <div class="form-group" id="rackFieldGroup">
                    <label for="serverRack" class="form-label required flex items-center gap-2">
                        <i class="fas fa-th-large text-teal-600 text-sm"></i>
                        Rack
                    </label>
                    <select class="form-select" id="serverRack" disabled>
                        <option value="">Loading racks…</option>
                    </select>
                    <div id="rackFieldHint" class="hidden items-start gap-2 mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <i class="fas fa-info-circle text-slate-500 text-sm mt-0.5"></i>
                        <p class="text-xs text-slate-500" id="rackFieldHintText"></p>
                    </div>
                </div>
                <div class="form-group" id="rackHeightGroup">
                    <label for="rackUHeight" class="form-label required flex items-center gap-2">
                        <i class="fas fa-arrows-alt-v text-teal-600 text-sm"></i>
                        Rack Units (U)
                    </label>
                    <select class="form-select" id="rackUHeight">
                        <option value="1" selected>1U</option>
                        <option value="2">2U</option>
                        <option value="3">3U</option>
                        <option value="4">4U</option>
                        <option value="5">5U</option>
                        <option value="6">6U</option>
                        <option value="8">8U</option>
                        <option value="10">10U</option>
                    </select>
                </div>
                <div class="form-group" id="rackPositionGroup">
                    <label for="rackPosition" class="form-label required flex items-center gap-2">
                        <i class="fas fa-layer-group text-teal-600 text-sm"></i>
                        Position
                    </label>
                    <select class="form-select" id="rackPosition" disabled>
                        <option value="">-- Select a rack first --</option>
                    </select>
                </div>
            </div>
            
            <!-- Advanced Form Fields -->
            <div id="advancedForm" class="hidden space-y-5">
                <div class="form-group">
                    <label for="startWith" class="form-label flex items-center gap-2">
                        <i class="fas fa-play-circle text-teal-600 text-sm"></i>
                        Start Configuration With
                    </label>
                    <select class="form-select" id="startWith">
                        <option value="motherboard">Motherboard (Recommended)</option>
                        <option value="cpu">CPU</option>
                        <option value="ram">RAM</option>
                        <option value="storage">Storage</option>
                        <option value="nic">Network Interface Card</option>
                    </select>
                    <div class="flex items-start gap-2 mt-3 p-3 bg-teal-50 rounded-lg border border-teal-200">
                        <i class="fas fa-lightbulb text-teal-600 text-sm mt-0.5"></i>
                        <p class="text-xs text-teal-700">Starting with Motherboard ensures better component compatibility and smoother configuration workflow.</p>
                    </div>
                </div>
            </div>
            
            <!-- Form Actions -->
            <div class="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-slate-200">
                <button type="button" class="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-all duration-200 flex items-center gap-2" onclick="dashboard.closeModal()">
                    <i class="fas fa-times text-sm"></i>
                    Cancel
                </button>
                <button type="submit" class="px-5 py-2.5 bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-lg font-medium hover:from-teal-700 hover:to-teal-800 shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2 transform hover:-translate-y-0.5">
                    <i class="fas fa-plus text-sm"></i>
                    ${asRequest ? 'Submit request' : 'Create Server'}
                </button>
            </div>
        </form>
    `;

        this.showModal(asRequest ? 'Request a New Server' : 'Create New Server', formContent);

        // Initialize toggle functionality
        const toggle = document.getElementById('advancedViewToggle');
        const standardForm = document.getElementById('standardForm');
        const advancedForm = document.getElementById('advancedForm');


        // Rack placement fields, shown to EVERYONE who can reach this form.
        //
        // They used to be removed for anyone who was not admin/super_admin, on
        // the reasoning that Rack View is admin-only. Both halves of that have
        // gone: api.php no longer role-gates the rack module (rack.view /
        // rack.assign decide now), and placement is no longer something an admin
        // adds afterwards — a physical server is refused without it. Removing
        // the fields would therefore not create an unracked server, it would make
        // creating a server impossible for everyone else.
        //
        // Placing a server AS IT IS CREATED is part of server.create, which this
        // form already requires; it is not a move, and it does not need
        // rack.assign. Moving an existing server still does.
        const rackGroup = document.getElementById('rackFieldGroup');
        const positionGroup = document.getElementById('rackPositionGroup');
        const heightGroup = document.getElementById('rackHeightGroup');

        this.initRackFields();

        // The six sites this dropdown used to hardcode are real `locations` rows
        // now (seeder 2026_08_26_002), so the list is loaded rather than written
        // into the markup in three different files.
        api.locations.populateSelect(document.getElementById('serverLocation'));

        if (toggle) {
            toggle.addEventListener('change', function () {
                if (this.checked) {
                    // Show both standard and advanced fields
                    advancedForm.classList.remove('hidden');
                } else {
                    // Hide only advanced fields, keep standard visible
                    advancedForm.classList.add('hidden');
                }

                // Advanced view creates a VIRTUAL config, and virtual configs cannot
                // occupy a physical rack — hide the placement fields rather than let
                // the user pick a slot the backend will refuse.
                if (rackGroup && positionGroup) {
                    rackGroup.classList.toggle('hidden', this.checked);
                    positionGroup.classList.toggle('hidden', this.checked);
                    heightGroup?.classList.toggle('hidden', this.checked);
                }

                // Same reasoning for the serial: a virtual config has no physical
                // machine to read one off, and the backend only requires it for a
                // physical build. Hiding the field beats showing a mandatory box
                // with nothing that could legitimately go in it.
                document.getElementById('serialNumberGroup')?.classList.toggle('hidden', this.checked);
            });
        }

        // Initialize form handler
        const createServerForm = document.getElementById('createServerForm');
        if (createServerForm) {
            createServerForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const isAdvancedView = toggle.checked;
                const serverName = document.getElementById('serverName').value.trim();
                const description = document.getElementById('description').value.trim();
                const locationSelect = document.getElementById('serverLocation');
                const location = locationSelect.value.trim();
                const locationUuid = api.locations.selectedUuid(locationSelect);

                // Determine is_virtual based on toggle state
                const isVirtual = isAdvancedView;

                // Rack placement is a separate step after the config exists (and is
                // never offered for virtual configs).
                const rackUuid = !isVirtual ? (document.getElementById('serverRack')?.value || '') : '';
                // A position is EITHER a start U ("30") or an enclosure bay
                // ("bay:<enclosure_uuid>:<slot>"). parseInt would silently turn
                // the latter into NaN, so the shape is tested before it is read.
                const positionValue = !isVirtual ? (document.getElementById('rackPosition')?.value || '') : '';
                const bayMatch = /^bay:([^:]+):(\d+)$/.exec(positionValue);
                const startU = bayMatch ? NaN : parseInt(positionValue || '', 10);
                // How many U the server occupies. Sent explicitly so a 2U/4U box is
                // racked at its real size instead of the 1U this form used to assume.
                const uHeight = !isVirtual ? parseInt(document.getElementById('rackUHeight')?.value || '1', 10) : 1;

                if (!location || !locationUuid) {
                    utils.showAlert('Please choose a location for this server', 'warning');
                    locationSelect.focus();
                    return;
                }

                // A PHYSICAL SERVER MUST BE PLACED. The rack used to be optional
                // because the dropdown offered "-- Not racked --", which let a
                // real machine be recorded with no position at all. That option
                // is gone and the backend refuses without a destination, so
                // asking here is only about giving a better message than a 400.
                if (!isVirtual && !rackUuid) {
                    utils.showAlert('Please choose the rack this server is installed in', 'warning');
                    document.getElementById('serverRack')?.focus();
                    return;
                }
                if (!isVirtual && !positionValue) {
                    utils.showAlert('Please choose the position this server occupies in the rack', 'warning');
                    document.getElementById('rackPosition')?.focus();
                    return;
                }

                // Only get startWith if advanced view is enabled
                let startWith = null;
                if (isAdvancedView) {
                    startWith = document.getElementById('startWith').value;
                }

                if (!serverName) {
                    utils.showAlert('Please enter a server name', 'warning');
                    return;
                }

                // The serial off the physical machine. Required for a real server,
                // never asked for on a virtual/template build — the field is hidden
                // in that case and the backend applies the same rule.
                const serialEl = document.getElementById('serverSerialNumber');
                const serialNumber = (serialEl?.value || '').trim();
                if (!isVirtual && !serialNumber) {
                    utils.showAlert("Please enter the server's serial number", 'warning');
                    serialEl?.focus();
                    return;
                }

                if (asRequest) {
                    await this.submitServerRequest({
                        serverName, description, isVirtual, serialNumber,
                        location, locationUuid, rackUuid, bayMatch, startU, uHeight
                    });
                    return;
                }

                try {
                    utils.showLoading(true, 'Creating server...');
                    // ONE CALL. Creation, location and placement commit together
                    // on the backend, so there is no longer a window in which the
                    // server exists but has nowhere to be — and no compensating
                    // cleanup for this code to get wrong. A refusal means nothing
                    // was created, so it is reported as a plain failure rather
                    // than the old "created, but not placed" half-success.
                    const result = await api.servers.createConfig(
                        serverName, description, startWith, isVirtual, location, false,
                        isVirtual ? '' : serialNumber,
                        isVirtual ? {} : {
                            locationUuid,
                            // A bay and a U are exclusive: the enclosure owns the
                            // rack and the U range, so only one shape is sent.
                            enclosureUuid: bayMatch ? bayMatch[1] : null,
                            slotIndex: bayMatch ? parseInt(bayMatch[2], 10) : null,
                            rackUuid: bayMatch ? null : rackUuid,
                            startU: bayMatch ? null : startU,
                            uHeight: bayMatch ? null : uHeight,
                        }
                    );
                    if (result.success) {
                        utils.showAlert(result.message || 'Server created successfully!', 'success');
                        this.closeModal();
                        await this.loadServerList(true);
                        await this.loadDashboard();
                        // Open server builder view if config_uuid is returned
                        if (result.data && result.data.config_uuid) {
                            setTimeout(() => {
                                this.showServerBuilder(result.data.config_uuid, serverName);
                            }, 500);
                        }
                    } else {
                        utils.showAlert(result.message || 'Failed to create server', 'error');
                    }
                } catch (error) {
                    console.error('Create server error:', error);
                    utils.showAlert(error.message || 'An error occurred while creating the server', 'error');
                } finally {
                    utils.showLoading(false);
                }
            });
        }
    }

    /**
     * The Create Server form, raised as a New Server request.
     *
     * The payload is what the direct create sends, so an approval creates and
     * places the server exactly as the button would have, owned by the
     * requester. The request's own description repeats the serial and the
     * placement in words, because the approver sees the description and not
     * the uuids.
     *
     * @param f  the fields the submit handler has already validated
     */
    async submitServerRequest(f) {
        const payload = { server_name: f.serverName };
        if (f.description) payload.description = f.description;

        const lines = ['Raised from the Build Server form because I cannot create servers directly.'];
        if (f.isVirtual) {
            payload.is_virtual = true;
            lines.push('Template build (virtual): no serial, location or rack.');
        } else {
            payload.serial_number = f.serialNumber;
            payload.location_uuid = f.locationUuid;
            if (f.bayMatch) {
                payload.enclosure_uuid = f.bayMatch[1];
                payload.slot_index = parseInt(f.bayMatch[2], 10);
            } else {
                payload.rack_uuid = f.rackUuid;
                payload.start_u = f.startU;
                payload.u_height = f.uHeight;
            }
            const text = (id) => {
                const select = document.getElementById(id);
                return (select?.selectedOptions[0]?.textContent || '').trim();
            };
            // The rack option ends in "(10U free of 42U)" -- true when picked, not
            // later -- and, for a rack.view user, carries " — <site>" before that.
            const rack = text('serverRack')
                .replace(/\s*\([^)]*free of[^)]*\)\s*$/, '')
                .replace(/ — .*$/, '');
            // Display-only snapshots for the request's one-line summary.
            payload.location_name = f.location;
            payload.rack_name = rack;
            if (f.bayMatch) payload.enclosure_name = text('rackPosition').replace(/ — bay \d+$/, '');
            lines.push(`Serial: ${f.serialNumber}`);
            lines.push(`Where: ${f.location}, ${rack}, ${text('rackPosition')}`
                + (f.bayMatch ? '' : ` (${f.uHeight}U)`));
        }
        if (f.description) lines.push(`Notes: ${f.description}`);

        try {
            utils.showLoading(true, 'Submitting request...');
            const result = await api.requests.submitAction('server.config.create', payload, {
                title: `New server "${f.serverName}"`,
                description: lines.join('\n')
            });
            const ref = result?.data?.ticket_number ? `Request ${result.data.ticket_number}` : 'Request';
            toast.success(`${ref} submitted. The server will be created once an admin approves it.`, 8000);
            this.closeModal();
        } catch (error) {
            // A refused request carries its reasons in data.errors, and the
            // message alone is only "Failed to create pipeline".
            const reasons = (error.data?.errors || []).map(e => String(e).replace(/^Action \d+: /, ''));
            utils.showAlert(reasons.length ? reasons.join(' ') : (error.message || 'The request could not be submitted'), 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    /**
     * Populate the Create Server form's Rack + Position dropdowns from the real
     * racks / rack_servers data. Position lists only the FREE U slots of the chosen
     * rack. A new server has no chassis yet, so it is placed as 1U and the placement
     * resizes itself when the chassis is added.
     */
    async initRackFields() {
        const rackSelect = document.getElementById('serverRack');
        const positionSelect = document.getElementById('rackPosition');
        const heightSelect = document.getElementById('rackUHeight');
        const hint = document.getElementById('rackFieldHint');
        const hintText = document.getElementById('rackFieldHintText');
        if (!rackSelect || !positionSelect) return;

        const showHint = (message) => {
            if (!hint || !hintText) return;
            hintText.textContent = message;
            hint.classList.remove('hidden');
            hint.classList.add('flex');
        };
        const clearHint = () => {
            hint?.classList.add('hidden');
            hint?.classList.remove('flex');
        };
        const resetPositions = (label) => {
            positionSelect.innerHTML = `<option value="">${utils.escapeHtml(label)}</option>`;
            positionSelect.disabled = true;
        };

        // Layout of the rack currently selected, so changing the U-height can
        // re-filter the positions without re-fetching it.
        let currentRack = null;
        let occupied = new Set();
        // Blade enclosures standing in this rack. Their U is occupied by the BOX
        // (whether or not any bay is filled), and their free bays are offered as
        // positions in their own right.
        let enclosures = [];

        // A server that is N U tall needs N CONTIGUOUS free U, and must not run
        // past the top of the rack. Offering every free U regardless of height
        // would just push the refusal down to the backend after the server was
        // already created.
        const renderPositions = () => {
            if (!currentRack) return;

            const height = Math.max(1, parseInt(heightSelect?.value || '1', 10));
            const totalU = currentRack.total_u || 0;
            const starts = [];

            for (let u = 1; u + height - 1 <= totalU; u++) {
                let fits = true;
                for (let i = 0; i < height; i++) {
                    if (occupied.has(u + i)) { fits = false; break; }
                }
                if (fits) starts.push(u);
            }

            // Free bays across every enclosure in this rack. A bay is a position
            // in its own right: a blade sled does not choose a U, it is bolted
            // into a box that already has one, so the U-height filter above does
            // not apply to these and they are offered whatever it is set to.
            const bayOptions = [];
            enclosures.forEach(e => {
                (e.slots || []).forEach(slot => {
                    if (slot.occupied) return;
                    bayOptions.push({
                        value: `bay:${e.enclosure_uuid}:${slot.slot_index}`,
                        label: `${e.name} — bay ${slot.slot_index}`,
                    });
                });
            });

            if (starts.length === 0 && bayOptions.length === 0) {
                resetPositions(`No ${height}U slot free`);
                showHint(`${currentRack.name} has no run of ${height} free U and no free enclosure bay — pick another rack or a smaller size.`);
                return;
            }

            const previous = positionSelect.value;
            const uGroup = starts.length === 0 ? '' :
                `<optgroup label="Rack position">` +
                starts.map(u => {
                    const label = height > 1 ? `U${u}–U${u + height - 1}` : `U${u}`;
                    return `<option value="${u}">${label}</option>`;
                }).join('') + `</optgroup>`;
            const bayGroup = bayOptions.length === 0 ? '' :
                `<optgroup label="Enclosure bay">` +
                bayOptions.map(b =>
                    `<option value="${utils.escapeHtml(b.value)}">${utils.escapeHtml(b.label)}</option>`
                ).join('') + `</optgroup>`;

            positionSelect.innerHTML = '<option value="">-- Select position --</option>' + uGroup + bayGroup;
            positionSelect.disabled = false;

            // Restore the previous choice only if it is still on offer — a bay
            // may have been taken, or a U-height change may have removed a run.
            if (previous && Array.from(positionSelect.options).some(o => o.value === previous)) {
                positionSelect.value = previous;
            }

            const bayNote = bayOptions.length > 0
                ? ` A bay takes its position from its enclosure, so the U size above is ignored for one.`
                : '';
            showHint((height > 1
                ? `Placed as ${height}U — adding a chassis re-derives the height from its spec.`
                : 'Placed as 1U — adding a chassis re-derives the height from its spec.') + bayNote);
        };

        heightSelect?.addEventListener('change', renderPositions);

        // WITHOUT rack.view, rack-list and rack-get are refused, and this form is
        // how such a user raises a New Server request. location-racks is the
        // requester-facing view of the same occupancy -- free runs and free bays,
        // nothing else -- so their racks come from the location they pick.
        if (!api.utils.hasPermission('rack.view')) {
            const locationSelect = document.getElementById('serverLocation');
            let racksHere = [];
            rackSelect.innerHTML = '<option value="">-- Choose a location first --</option>';
            rackSelect.disabled = true;
            resetPositions('-- Select a rack first --');

            locationSelect?.addEventListener('change', async () => {
                const locationUuid = api.locations.selectedUuid(locationSelect);
                racksHere = [];
                currentRack = null;
                resetPositions('-- Select a rack first --');
                clearHint();
                rackSelect.disabled = true;

                if (!locationUuid) {
                    rackSelect.innerHTML = '<option value="">-- Choose a location first --</option>';
                    return;
                }

                rackSelect.innerHTML = '<option value="">Loading racks…</option>';
                let racks = null;
                try {
                    const result = await api.locations.racks(locationUuid);
                    racks = result?.success ? (result.data?.racks || []) : null;
                } catch (error) {
                    racks = null;
                }

                // The location may have changed while this was loading.
                if (api.locations.selectedUuid(locationSelect) !== locationUuid) return;

                if (racks === null) {
                    rackSelect.innerHTML = '<option value="">Racks unavailable</option>';
                    showHint('Could not load the racks at this location.');
                    return;
                }
                if (racks.length === 0) {
                    rackSelect.innerHTML = '<option value="">No racks at this location</option>';
                    showHint('This location has no racks yet — pick another location.');
                    return;
                }

                racksHere = racks;
                rackSelect.innerHTML = '<option value="">-- Choose a rack --</option>' + racks.map(r =>
                    `<option value="${utils.escapeHtml(r.rack_uuid)}">${utils.escapeHtml(r.name)} (${r.free_u}U free of ${r.total_u}U)</option>`
                ).join('');
                rackSelect.disabled = false;
            });

            rackSelect.addEventListener('change', () => {
                const rack = racksHere.find(r => r.rack_uuid === rackSelect.value);
                currentRack = null;
                occupied = new Set();
                enclosures = [];

                if (!rack) {
                    resetPositions('-- Select a rack first --');
                    clearHint();
                    return;
                }

                // location-racks lists the FREE runs; every U outside them is taken,
                // enclosures included, so renderPositions() can work unchanged.
                const free = new Set();
                (rack.free_intervals || []).forEach(gap => {
                    for (let u = gap.start_u; u <= gap.end_u; u++) free.add(u);
                });
                for (let u = 1; u <= rack.total_u; u++) {
                    if (!free.has(u)) occupied.add(u);
                }
                // Free bays only, by index, in the shape renderPositions() reads.
                enclosures = (rack.enclosures || []).map(e => ({
                    enclosure_uuid: e.enclosure_uuid,
                    name: e.name,
                    slots: (e.free_slots || []).map(slot => ({ slot_index: slot, occupied: false }))
                }));

                currentRack = rack;
                renderPositions();
            });
            return;
        }

        const res = await api.racks.list();

        if (!res?.success) {
            rackSelect.innerHTML = '<option value="">Racks unavailable</option>';
            rackSelect.disabled = true;
            resetPositions('—');
            showHint(res?.message || 'Could not load racks, so a server cannot be created right now — a physical server has to be placed when it is created.');
            return;
        }

        const racks = res.data?.racks || [];
        if (racks.length === 0) {
            rackSelect.innerHTML = '<option value="">No racks available</option>';
            rackSelect.disabled = true;
            resetPositions('—');
            showHint('No racks exist yet — create one in Rack View before creating a server.');
            return;
        }

        // No "-- Not racked --": a physical server must be placed, and offering a
        // choice the backend refuses is a trap rather than an option.
        rackSelect.innerHTML = '<option value="">-- Choose a rack --</option>' + racks.map(r => {
            const loc = r.location ? ` — ${utils.escapeHtml(r.location)}` : '';
            return `<option value="${utils.escapeHtml(r.rack_uuid)}">${utils.escapeHtml(r.name)}${loc} (${r.free_u}U free of ${r.total_u}U)</option>`;
        }).join('');
        rackSelect.disabled = false;
        resetPositions('-- Select a rack first --');
        clearHint();

        rackSelect.addEventListener('change', async () => {
            const rackUuid = rackSelect.value;
            currentRack = null;
            occupied = new Set();

            if (!rackUuid) {
                resetPositions('-- Select a rack first --');
                clearHint();
                return;
            }

            resetPositions('Loading positions…');
            const detail = await api.racks.get(rackUuid);
            if (!detail?.success) {
                resetPositions('—');
                showHint(detail?.message || 'Could not load the rack layout.');
                return;
            }

            currentRack = detail.data?.rack || {};
            enclosures = detail.data?.enclosures || [];
            (detail.data?.servers || []).forEach(s => {
                for (let u = s.start_u; u <= s.end_u; u++) occupied.add(u);
            });
            // An enclosure occupies its U range whether or not it holds any
            // servers. Without this the FX2s at U30-U31 would be offered as a
            // free slot and the backend would refuse the placement with a 409
            // AFTER the server had already been created.
            enclosures.forEach(e => {
                for (let u = e.start_u; u <= e.end_u; u++) occupied.add(u);
            });

            renderPositions();
        });
    }

    /**
     * MOVE A SERVER: change its location, its rack, its U position, or take it out
     * of the rack entirely. Reached from the move button on the server card.
     *
     * WHAT CHANGED ON 2026-08-26
     *   This dialog used to offer only rack + U, and a rack's location was free
     *   text nobody could pick. Worse, the move updated the server and left every
     *   component inside it still reporting the OLD location, rack and U — a
     *   server moved from Noida U21 to Jaipur U8 kept 14 parts claiming Noida U21.
     *
     *   Now Location comes first and the Rack dropdown is repopulated from it, so
     *   picking Jaipur offers Jaipur's racks and nothing else. The backend carries
     *   every installed component with the server in the same transaction, and the
     *   count is shown here BEFORE the move is committed — it is the part of the
     *   change the user cannot see for themselves.
     *
     * The move is still rack-assign-server: one door, shared with Rack View and
     * with an approved Move Server request. This dialog only shows the current
     * truth and offers positions the server actually fits, so the backend's
     * bounds/overlap refusals stay a last line of defence rather than the norm.
     *
     * PRE-MIGRATION FALLBACK. Until the location seeders are run there are no
     * locations, so the Location field is hidden and the Rack dropdown lists every
     * rack — exactly what this dialog did before. Nothing here requires the
     * migration to have happened.
     */
    async showRackPlacementModal(configUuid, serverName) {
        this.rackPlacementContext = {
            configUuid,
            serverName,
            height: 1,
            placement: null,
            racks: [],           // every rack, for the no-locations fallback
            locations: [],
            locationRacks: {},   // locationUuid -> rack[] (lazy, cached)
            rackDetails: {},
            componentCount: 0,
            currentLocationUuid: null,
            currentAddressText: null
        };

        this.showModal(`Move server — ${serverName}`, `
            <div id="rackPlacementPanel">
                <div class="py-16 text-center text-text-muted">
                    <i class="fas fa-spinner fa-spin text-2xl mb-3"></i>
                    <p class="text-sm">Loading current position…</p>
                </div>
            </div>`);

        try {
            // The location list is allowed to fail (503 before its seeder is run)
            // without taking the dialog down — the fallback below covers it.
            const [placementResult, rackListResult, locationResult] = await Promise.all([
                api.racks.getPlacement(configUuid),
                api.racks.list(),
                api.locations.list().catch(() => null)
            ]);

            if (!placementResult?.success) {
                throw new Error(placementResult?.message || 'Could not read the current position');
            }
            if (!rackListResult?.success) {
                throw new Error(rackListResult?.message || 'Could not load the rack list');
            }

            const ctx = this.rackPlacementContext;
            // The dialog may have been closed or reopened for another server while
            // these were in flight — only paint into the context we still own.
            if (!ctx || ctx.configUuid !== configUuid) return;

            ctx.placement = placementResult.data?.placement || null;
            ctx.height = Math.max(1, parseInt(placementResult.data?.required_u_height, 10) || 1);
            ctx.componentCount = parseInt(placementResult.data?.component_count, 10) || 0;
            ctx.currentLocationUuid = placementResult.data?.location_uuid || null;
            ctx.currentAddressText = placementResult.data?.address_text || null;
            ctx.racks = rackListResult.data?.racks || [];
            ctx.locations = (locationResult?.success && locationResult.data?.locations) || [];

            const panel = document.getElementById('rackPlacementPanel');
            if (!panel) return;
            panel.innerHTML = this._renderRackPlacementForm();
            this._bindRackPlacementForm();
        } catch (error) {
            const panel = document.getElementById('rackPlacementPanel');
            if (panel) {
                panel.innerHTML = `
                    <div class="py-16 text-center">
                        <i class="fas fa-exclamation-circle text-2xl text-danger mb-3"></i>
                        <p class="text-sm text-text-secondary">${utils.escapeHtml(error.message || 'Failed to load the current position')}</p>
                    </div>`;
            }
        }
    }

    /**
     * Racks that belong to no location. Real during the migration window, and a
     * legitimate state afterwards for a rack nobody has filed yet. Without this
     * option those racks would be unreachable from a location-first dialog.
     */
    _unassignedRacks() {
        return (this.rackPlacementContext?.racks || []).filter(r => !r.location_uuid);
    }

    _renderRackPlacementForm() {
        const ctx = this.rackPlacementContext;
        const placement = ctx.placement;
        const hasLocations = ctx.locations.length > 0;

        const currentText = ctx.currentAddressText
            ? utils.escapeHtml(ctx.currentAddressText)
            : (placement
                ? `${utils.escapeHtml(placement.rack_name || 'Unknown rack')} · U${placement.start_u}${placement.u_height > 1 ? `-U${placement.end_u}` : ''}`
                : 'Not installed in any rack');

        const unassigned = this._unassignedRacks();
        const locationOptions = ctx.locations.map(loc => {
            const selected = ctx.currentLocationUuid && loc.location_uuid === ctx.currentLocationUuid ? ' selected' : '';
            return `<option value="${utils.escapeHtml(loc.location_uuid)}"${selected}>${utils.escapeHtml(loc.name)}</option>`;
        }).join('');

        return `
            <div class="space-y-5">
                <div class="flex items-start gap-3 p-4 bg-surface-secondary border border-border-light rounded-lg">
                    <i class="fas fa-map-marker-alt text-primary mt-0.5"></i>
                    <div class="min-w-0">
                        <p class="text-xs uppercase tracking-wider text-text-muted font-semibold">Current position</p>
                        <p class="text-sm text-text-primary font-medium mt-0.5">${currentText}</p>
                        <p class="text-xs text-text-muted mt-1">Occupies ${ctx.height}U${ctx.height > 1 ? ' — only positions with that many free units in a row are offered' : ''}</p>
                    </div>
                </div>

                ${hasLocations ? `
                <div class="form-group">
                    <label for="rackPlacementLocation" class="form-label flex items-center gap-2">
                        <i class="fas fa-map-marker-alt text-primary text-sm"></i>
                        Location
                    </label>
                    <select class="form-select" id="rackPlacementLocation">
                        <option value="">-- Select a location --</option>
                        ${locationOptions}
                        ${unassigned.length ? `<option value="__none__">— Racks with no location (${unassigned.length}) —</option>` : ''}
                    </select>
                </div>` : ''}

                <div class="form-group">
                    <label for="rackPlacementRack" class="form-label flex items-center gap-2">
                        <i class="fas fa-th-large text-primary text-sm"></i>
                        Rack
                    </label>
                    ${ctx.racks.length
                        ? `<select class="form-select" id="rackPlacementRack">
                                <option value="">${hasLocations ? '-- Select a location first --' : '-- Select a rack --'}</option>
                           </select>`
                        : `<p class="text-sm text-text-secondary">No racks exist yet — create one in Rack View first.</p>`}
                </div>

                <div class="form-group">
                    <label for="rackPlacementPosition" class="form-label flex items-center gap-2">
                        <i class="fas fa-layer-group text-primary text-sm"></i>
                        Position
                    </label>
                    <select class="form-select" id="rackPlacementPosition" disabled>
                        <option value="">-- Select a rack first --</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="rackPlacementReason" class="form-label flex items-center gap-2">
                        <i class="fas fa-comment-dots text-primary text-sm"></i>
                        Reason <span class="text-xs font-normal text-text-muted">(optional)</span>
                    </label>
                    <input type="text" class="form-input" id="rackPlacementReason" maxlength="255"
                        placeholder="e.g. Site consolidation, ticket BDC-1421">
                    <p class="text-xs text-text-muted mt-1">Recorded in this server's movement history.</p>
                </div>

                ${ctx.componentCount > 0 ? `
                <div class="flex items-start gap-2 p-3 bg-surface-secondary rounded-lg border border-border-light">
                    <i class="fas fa-boxes text-primary text-sm mt-0.5"></i>
                    <p class="text-xs text-text-secondary">
                        <strong class="text-text-primary">${ctx.componentCount} installed component${ctx.componentCount === 1 ? '' : 's'}</strong>
                        move with this server. Their location, rack and U are updated in the same step.
                    </p>
                </div>` : ''}

                <div id="rackPlacementHint" class="hidden items-start gap-2 p-3 bg-surface-secondary rounded-lg border border-border-light">
                    <i class="fas fa-info-circle text-text-muted text-sm mt-0.5"></i>
                    <p class="text-xs text-text-muted" id="rackPlacementHintText"></p>
                </div>

                <div class="flex items-center justify-between gap-3 pt-6 border-t border-border">
                    ${placement
                        ? `<button type="button" class="px-4 py-2.5 rounded-lg font-medium text-sm text-text-secondary border border-border hover:border-danger hover:text-danger transition-colors flex items-center gap-2" onclick="dashboard.removeRackPlacement()">
                                <i class="fas fa-eject text-xs"></i> Remove from rack
                           </button>`
                        : '<span></span>'}
                    <div class="flex items-center gap-3">
                        <button type="button" class="px-5 py-2.5 bg-surface-secondary text-text-primary rounded-lg font-medium text-sm hover:bg-surface-hover transition-colors" onclick="dashboard.closeModal()">Cancel</button>
                        <button type="button" class="px-5 py-2.5 bg-primary text-white rounded-lg font-medium text-sm hover:bg-primary-hover transition-colors flex items-center gap-2" onclick="dashboard.saveRackPlacement()" ${ctx.racks.length ? '' : 'disabled'}>
                            <i class="fas fa-truck-moving text-xs"></i> Move server
                        </button>
                    </div>
                </div>
            </div>`;
    }

    _bindRackPlacementForm() {
        const locationSelect = document.getElementById('rackPlacementLocation');
        const rackSelect = document.getElementById('rackPlacementRack');
        if (!rackSelect) return;

        rackSelect.addEventListener('change', () => this._loadRackPlacementPositions());

        if (locationSelect) {
            // THE POINT OF THIS DIALOG: choosing a location reloads the rack list
            // for that location, so a site with 2 racks offers 2 and a site with
            // 10 offers 10.
            locationSelect.addEventListener('change', () => this._loadRackPlacementRacks());
            // Preselected to where the server already is — fill its racks now.
            this._loadRackPlacementRacks();
        } else {
            // No locations yet: every rack, as this dialog always did.
            this._fillRackOptions(this.rackPlacementContext.racks);
        }
    }

    /**
     * Paint the Rack dropdown, preselecting the rack the server is currently in
     * when it is among them.
     */
    _fillRackOptions(racks) {
        const ctx = this.rackPlacementContext;
        const rackSelect = document.getElementById('rackPlacementRack');
        if (!ctx || !rackSelect) return;

        if (!racks.length) {
            rackSelect.innerHTML = '<option value="">-- No racks at this location --</option>';
            this._resetRackPlacementPositions('-- Select a rack first --');
            return;
        }

        const currentRackUuid = ctx.placement?.rack_uuid || null;
        rackSelect.innerHTML = '<option value="">-- Select a rack --</option>' + racks.map(rack => {
            const selected = currentRackUuid && rack.rack_uuid === currentRackUuid ? ' selected' : '';
            const floor = rack.floor ? ` · Floor ${utils.escapeHtml(rack.floor)}` : '';
            return `<option value="${utils.escapeHtml(rack.rack_uuid)}"${selected}>${utils.escapeHtml(rack.name)}${floor} (${rack.free_u}U free of ${rack.total_u}U)</option>`;
        }).join('');

        if (rackSelect.value) {
            this._loadRackPlacementPositions();
        } else {
            this._resetRackPlacementPositions('-- Select a rack first --');
        }
    }

    _resetRackPlacementPositions(label) {
        const positionSelect = document.getElementById('rackPlacementPosition');
        if (!positionSelect) return;
        positionSelect.innerHTML = `<option value="">${label}</option>`;
        positionSelect.disabled = true;
    }

    /**
     * Load the racks at the selected location.
     *
     * Cached per location, and guarded against the user changing the dropdown
     * while a fetch is in flight — the same race the position loader guards.
     */
    async _loadRackPlacementRacks() {
        const ctx = this.rackPlacementContext;
        const locationSelect = document.getElementById('rackPlacementLocation');
        const rackSelect = document.getElementById('rackPlacementRack');
        if (!ctx || !locationSelect || !rackSelect) return;

        const locationUuid = locationSelect.value;

        if (!locationUuid) {
            rackSelect.innerHTML = '<option value="">-- Select a location first --</option>';
            this._resetRackPlacementPositions('-- Select a rack first --');
            this._setRackPlacementHint('');
            return;
        }

        if (locationUuid === '__none__') {
            this._fillRackOptions(this._unassignedRacks());
            this._setRackPlacementHint('These racks have no location on file. Give them one in Rack View so the servers in them report a site.');
            return;
        }

        if (ctx.locationRacks[locationUuid]) {
            this._fillRackOptions(ctx.locationRacks[locationUuid]);
            this._setLocationMoveHint(locationUuid);
            return;
        }

        rackSelect.innerHTML = '<option value="">Loading racks…</option>';
        this._resetRackPlacementPositions('-- Select a rack first --');

        let result;
        try {
            result = await api.locations.racks(locationUuid);
        } catch (error) {
            rackSelect.innerHTML = '<option value="">—</option>';
            this._setRackPlacementHint(error.message || 'Could not load the racks at this location.');
            return;
        }

        // The user may have picked a different location while this was loading.
        if (locationSelect.value !== locationUuid) return;

        if (!result?.success) {
            rackSelect.innerHTML = '<option value="">—</option>';
            this._setRackPlacementHint(result?.message || 'Could not load the racks at this location.');
            return;
        }

        ctx.locationRacks[locationUuid] = result.data?.racks || [];
        this._fillRackOptions(ctx.locationRacks[locationUuid]);
        this._setLocationMoveHint(locationUuid);
    }

    _setLocationMoveHint(locationUuid) {
        const ctx = this.rackPlacementContext;
        if (!ctx) return;

        const racks = ctx.locationRacks[locationUuid] || [];
        const locationName = (ctx.locations.find(l => l.location_uuid === locationUuid) || {}).name || 'this location';

        if (!racks.length) {
            this._setRackPlacementHint(`${locationName} has no racks yet — create one in Rack View, or pick another location.`);
            return;
        }

        if (ctx.currentLocationUuid && ctx.currentLocationUuid !== locationUuid) {
            const from = (ctx.locations.find(l => l.location_uuid === ctx.currentLocationUuid) || {}).name || 'its current location';
            this._setRackPlacementHint(`This moves the server from ${from} to ${locationName}.`);
            return;
        }

        this._setRackPlacementHint('');
    }

    _setRackPlacementHint(message) {
        const hint = document.getElementById('rackPlacementHint');
        const hintText = document.getElementById('rackPlacementHintText');
        if (!hint || !hintText) return;
        hintText.textContent = message || '';
        hint.classList.toggle('hidden', !message);
        hint.classList.toggle('flex', !!message);
    }

    /**
     * Start-U values where the server's full height fits, treating its OWN current
     * range as free — otherwise a racked server could never keep (or shift near) the
     * position it already occupies.
     */
    _rackFreeStarts(rackDetail, height, ownConfigUuid) {
        const totalU = parseInt(rackDetail?.rack?.total_u, 10) || 0;
        const occupied = new Set();
        (rackDetail?.servers || []).forEach(server => {
            if (server.config_uuid === ownConfigUuid) return;
            for (let u = server.start_u; u <= server.end_u; u++) occupied.add(u);
        });
        // A blade enclosure occupies its U range too, and is never listed in
        // `servers`. Omitting it would offer a start U the backend then refuses.
        // Its own bays are NOT treated as free here: this dialog moves a server
        // to a U, and installing it in a bay is a different operation.
        (rackDetail?.enclosures || []).forEach(e => {
            for (let u = e.start_u; u <= e.end_u; u++) occupied.add(u);
        });

        const starts = [];
        for (let u = 1; u + height - 1 <= totalU; u++) {
            let fits = true;
            for (let unit = u; unit < u + height; unit++) {
                if (occupied.has(unit)) { fits = false; break; }
            }
            if (fits) starts.push(u);
        }
        return starts;
    }

    async _loadRackPlacementPositions() {
        const ctx = this.rackPlacementContext;
        const rackSelect = document.getElementById('rackPlacementRack');
        const positionSelect = document.getElementById('rackPlacementPosition');
        if (!ctx || !rackSelect || !positionSelect) return;

        const rackUuid = rackSelect.value;
        if (!rackUuid) {
            this._resetRackPlacementPositions('-- Select a rack first --');
            return;
        }

        positionSelect.innerHTML = '<option value="">Loading positions…</option>';
        positionSelect.disabled = true;

        let detail = ctx.rackDetails[rackUuid];
        if (!detail) {
            const result = await api.racks.get(rackUuid);
            if (!result?.success) {
                positionSelect.innerHTML = '<option value="">—</option>';
                this._setRackPlacementHint(result?.message || 'Could not load the rack layout.');
                return;
            }
            detail = result.data;
            ctx.rackDetails[rackUuid] = detail;
        }

        // The user may have picked a different rack while this was loading.
        if (rackSelect.value !== rackUuid) return;

        const starts = this._rackFreeStarts(detail, ctx.height, ctx.configUuid);
        const rackName = detail?.rack?.name || 'This rack';

        if (!starts.length) {
            positionSelect.innerHTML = `<option value="">No ${ctx.height}U slot free</option>`;
            positionSelect.disabled = true;
            this._setRackPlacementHint(`${rackName} has no run of ${ctx.height} free unit${ctx.height === 1 ? '' : 's'} — pick another rack.`);
            return;
        }

        const currentStart = (ctx.placement && ctx.placement.rack_uuid === rackUuid) ? parseInt(ctx.placement.start_u, 10) : null;
        positionSelect.innerHTML = '<option value="">-- Select position --</option>' + starts.map(u => {
            const label = ctx.height > 1 ? `U${u}-U${u + ctx.height - 1}` : `U${u}`;
            const isCurrent = u === currentStart;
            return `<option value="${u}"${isCurrent ? ' selected' : ''}>${label}${isCurrent ? ' (current)' : ''}</option>`;
        }).join('');
        positionSelect.disabled = false;

        if (ctx.placement && ctx.placement.rack_uuid !== rackUuid) {
            this._setRackPlacementHint(`Saving moves this server out of ${ctx.placement.rack_name || 'its current rack'} and into ${rackName}.`);
        }
    }

    async saveRackPlacement() {
        const ctx = this.rackPlacementContext;
        if (!ctx) return;

        const locationSelectEl = document.getElementById('rackPlacementLocation');
        const rawLocation = locationSelectEl?.value || '';
        // '__none__' is a client-side grouping for racks with no location on
        // file; it is not a location and must never be sent as one.
        const locationUuid = rawLocation === '__none__' ? '' : rawLocation;

        const rackUuid = document.getElementById('rackPlacementRack')?.value || '';
        const startU = parseInt(document.getElementById('rackPlacementPosition')?.value || '', 10);
        const reason = (document.getElementById('rackPlacementReason')?.value || '').trim();

        if (locationSelectEl && !rawLocation) {
            utils.showAlert('Choose a location first', 'warning');
            return;
        }
        if (!rackUuid) {
            utils.showAlert('Choose a rack, or use "Remove from rack" to take this server out', 'warning');
            return;
        }
        if (!startU) {
            utils.showAlert('Choose a position in the rack', 'warning');
            return;
        }
        if (ctx.placement && ctx.placement.rack_uuid === rackUuid && parseInt(ctx.placement.start_u, 10) === startU) {
            utils.showAlert('That is already this server’s position', 'info');
            return;
        }

        try {
            utils.showLoading(true, 'Moving server...');
            const result = await api.racks.assignServer(rackUuid, ctx.configUuid, startU, { locationUuid, reason });
            if (!result?.success) {
                utils.showAlert(result?.message || 'Failed to move the server', 'error');
                return;
            }
            // The API's own message names the destination and how many components
            // travelled with it — more useful than anything composed here.
            utils.showAlert(result.message || 'Server moved', 'success');
            this.closeModal();
            await this.loadServerList(true);
        } catch (error) {
            console.error('Move server error:', error);
            utils.showAlert(error.message || 'An error occurred while moving the server', 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    async removeRackPlacement() {
        const ctx = this.rackPlacementContext;
        if (!ctx) return;

        // The copy is precise about what happens now: nothing is released from the
        // build, but the components DO stop reporting a U, because they no longer
        // occupy one. Saying "its components are not touched" would be wrong.
        const componentNote = ctx.componentCount > 0
            ? ` Its ${ctx.componentCount} installed component${ctx.componentCount === 1 ? '' : 's'} stay in the build and keep the location, but stop reporting a U position.`
            : '';

        const confirmed = await utils.confirm(
            `Remove "${ctx.serverName}" from ${ctx.placement?.rack_name || 'its rack'}? The server stays at the same location and nothing is released from the build — it just stops occupying a slot.${componentNote}`,
            'Remove from Rack'
        );
        if (!confirmed) return;

        const reason = (document.getElementById('rackPlacementReason')?.value || '').trim();

        try {
            utils.showLoading(true, 'Removing server from rack...');
            const result = await api.racks.unassignServer(ctx.configUuid, reason);
            if (!result?.success) {
                utils.showAlert(result?.message || 'Failed to remove the server from its rack', 'error');
                return;
            }
            utils.showAlert(result.message || 'Server removed from rack', 'success');
            this.closeModal();
            await this.loadServerList(true);
        } catch (error) {
            console.error('Remove from rack error:', error);
            utils.showAlert(error.message || 'An error occurred while removing the server from its rack', 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    // ---------------------------------------------------- edit server / status

    /**
     * Edit one server's own attributes, and move it along its lifecycle.
     *
     * TWO independent actions in one dialog, deliberately — they are two API
     * calls with two different permissions and two different failure modes:
     *
     *   Details → server-update-config (server.edit_details), plus
     *             server-update-location for the location field, which is the
     *             canonical location writer: it sets location_uuid AND the
     *             free-text column AND re-stamps every installed component.
     *             server-update-config's own `location` field does not do the
     *             first of those, so it is not used here.
     *   Status  → server-transition-status (server.transition + whatever the
     *             EDGE requires), the only path that writes status_v2 and the
     *             mapped legacy int together.
     *
     * A finalized server's details are locked by the backend, so the details
     * half renders read-only in that state while the status half stays live.
     * That is the way back out of a Finalize clicked by mistake — which is the
     * whole reason this dialog exists.
     */
    async showServerEditModal(configUuid) {
        const server = (this.allServers || []).find(s => s.config_uuid === configUuid);
        if (!server) {
            utils.showAlert('Could not find that server in the current list — refresh and try again', 'error');
            return;
        }

        this.serverEditContext = { configUuid, server, transitions: null };

        this.showModal(`Edit server — ${server.server_name || 'Unnamed Server'}`, `
            <div id="serverEditPanel">
                <div class="py-16 text-center text-text-muted">
                    <i class="fas fa-spinner fa-spin text-2xl mb-3"></i>
                    <p class="text-sm">Loading…</p>
                </div>
            </div>`);

        // Allowed to fail without taking the dialog down: the details half does
        // not depend on it, and the renderer says so when it is missing.
        let transitions = null;
        try {
            const result = await api.servers.allowedTransitions(configUuid);
            if (result?.success) { transitions = result.data || null; }
        } catch (error) {
            console.warn('Could not load the allowed status changes:', error);
        }

        // The dialog may have been closed, or reopened for another server, while
        // that was in flight — only paint into the context we still own.
        const ctx = this.serverEditContext;
        if (!ctx || ctx.configUuid !== configUuid) return;
        ctx.transitions = transitions;

        const panel = document.getElementById('serverEditPanel');
        if (!panel) return;
        panel.innerHTML = this._renderServerEditForm();

        // populateSelect() enables the element it fills, so it is only called for
        // a server whose location this dialog may actually change.
        const locationSelect = document.getElementById('serverEditLocation');
        if (locationSelect) {
            await api.locations.populateSelect(locationSelect, {
                placeholder: '-- No location --',
                selectedName: server.location_name || server.location || ''
            });
        }
    }

    _renderServerEditForm() {
        const ctx = this.serverEditContext;
        const server = ctx.server;
        const status = this._serverStatusPresentation(server);

        // The legacy int is the right thing to test here: it is what
        // handleUpdateConfiguration's own finalized guard reads.
        const isFinalized = (parseInt(server.configuration_status, 10) || 0) === 3;
        const isRacked = !!server.rack_uuid;
        const canEditDetails = api.utils.hasPermission('server.edit_details');
        const detailsLocked = isFinalized || !canEditDetails;
        // A racked server's location IS its rack's, and the backend refuses to set
        // it directly (409). server-update-location is gated on server.edit_details
        // like the rest of the details, but it is NOT blocked on a finalized
        // config — a finalized machine still gets physically moved.
        const canEditLocation = !isRacked && canEditDetails;

        // Only moves the backend has already said this user may make. It computed
        // that with the same ACL checker the command itself uses, so nothing here
        // can be offered and then refused.
        const moves = (ctx.transitions?.transitions || []).filter(move => move.allowed);
        const blocked = (ctx.transitions?.transitions || []).filter(move => !move.allowed);

        const statusOptions = moves.map(move => {
            const label = this._serverStatusLabel(move.to_status);
            const suffix = move.requires_validation ? ' — validates the build first' : '';
            return `<option value="${utils.escapeHtml(move.to_status)}">${utils.escapeHtml(label + suffix)}</option>`;
        }).join('');

        let statusBody;
        if (!ctx.transitions) {
            statusBody = `<p class="text-sm text-text-secondary">The available status changes could not be loaded. Close this dialog and try again.</p>`;
        } else if (moves.length) {
            statusBody = `
                <div class="form-group">
                    <label for="serverEditStatus" class="form-label flex items-center gap-2">
                        <i class="fas fa-exchange-alt text-primary text-sm"></i>
                        Move to
                    </label>
                    <select class="form-select" id="serverEditStatus">
                        <option value="">-- Select a status --</option>
                        ${statusOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label for="serverEditStatusNotes" class="form-label flex items-center gap-2">
                        <i class="fas fa-comment-dots text-primary text-sm"></i>
                        Reason <span class="text-xs font-normal text-text-muted">(optional)</span>
                    </label>
                    <input type="text" class="form-input" id="serverEditStatusNotes" maxlength="255"
                        placeholder="e.g. Finalized by mistake, reopening for a RAM swap">
                    <p class="text-xs text-text-muted mt-1">Saved to this server's notes and recorded against the change.</p>
                </div>
                <div class="flex items-center justify-end pt-2">
                    <button type="button" class="px-5 py-2.5 bg-primary text-white rounded-lg font-medium text-sm hover:bg-primary-hover transition-colors flex items-center gap-2"
                            onclick="dashboard.changeServerStatus()">
                        <i class="fas fa-exchange-alt text-xs"></i> Change status
                    </button>
                </div>`;
        } else {
            // Naming the missing permission is the point: every edge out of
            // 'finalized' needs server.unfinalize, and until its seeder is run
            // that permission does not exist for anyone.
            const needed = [...new Set(blocked.map(move => move.required_permission))];
            statusBody = `
                <p class="text-sm text-text-secondary">
                    There is no status change you can make from <strong class="text-text-primary">${utils.escapeHtml(status.label)}</strong>.
                    ${needed.length ? `It would need ${needed.map(p => `<code class="font-mono text-xs bg-surface-secondary border border-border-light rounded px-1.5 py-0.5">${utils.escapeHtml(p)}</code>`).join(' or ')}.` : ''}
                </p>`;
        }

        const locationHint = isRacked
            ? `This server is installed in rack <strong class="text-text-secondary">${utils.escapeHtml(server.rack_name || 'unknown')}</strong>, so its location is that rack's. Use <em>Move server</em> to put it somewhere else.`
            : "You do not have permission to change this server's location.";

        // The manufacturer serial, editable because it is typed in by a person and
        // typed values get mistyped. Built out here rather than inline for the same
        // reason locationField is: the two-branch markup does not nest cleanly
        // inside the return template.
        //
        // Omitted entirely for a virtual build -- there is no physical machine to
        // read a serial off, which is also why the create form hides the field and
        // the backend requires it only when is_virtual is 0. Empty when the column
        // has not been seeded yet, in which case the box is simply blank and the
        // backend ignores what is sent.
        const serialHint = server.serial_number
            ? 'Correct this if it was recorded wrongly. Each serial must be unique.'
            : 'Not recorded yet — enter the serial on the physical machine.';

        const serialField = server.is_virtual
            ? ''
            : `<div class="form-group">
                   <label for="serverEditSerial" class="form-label flex items-center gap-2">
                       <i class="fas fa-barcode text-primary text-sm"></i>
                       Serial Number
                   </label>
                   <input type="text" class="form-input" id="serverEditSerial" maxlength="50"
                       placeholder="Serial printed on the server"
                       value="${utils.escapeHtml(server.serial_number || '')}" ${detailsLocked ? 'disabled' : ''}>
                   <p class="text-xs text-text-muted mt-1">${serialHint}</p>
               </div>`;

        const locationField = canEditLocation
            ? `<div class="form-group">
                   <label for="serverEditLocation" class="form-label flex items-center gap-2">
                       <i class="fas fa-map-marker-alt text-primary text-sm"></i>
                       Location
                   </label>
                   <select class="form-select" id="serverEditLocation">
                       <option value="">Loading locations…</option>
                   </select>
                   <p class="text-xs text-text-muted mt-1">Every component installed in this server moves with it.</p>
               </div>`
            : `<div class="form-group">
                   <label class="form-label flex items-center gap-2">
                       <i class="fas fa-map-marker-alt text-primary text-sm"></i>
                       Location
                   </label>
                   <input type="text" class="form-input" value="${utils.escapeHtml(server.location_name || server.location || '—')}" disabled>
                   <p class="text-xs text-text-muted mt-1">${locationHint}</p>
               </div>`;

        return `
            <div class="space-y-5">
                <div class="flex items-start gap-3 p-4 bg-surface-secondary border border-border-light rounded-lg">
                    <i class="fas fa-server text-primary mt-0.5"></i>
                    <div class="min-w-0">
                        <p class="text-xs uppercase tracking-wider text-text-muted font-semibold">Current status</p>
                        <div class="mt-1">${this._serverStatusBadge(server)}</div>
                    </div>
                </div>

                <div>
                    <h4 class="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4 pb-2 border-b border-border-light">Details</h4>
                    ${detailsLocked ? `
                    <div class="flex items-start gap-2 p-3 mb-4 bg-surface-secondary rounded-lg border border-border-light">
                        <i class="fas fa-lock text-text-muted text-sm mt-0.5"></i>
                        <p class="text-xs text-text-secondary">${isFinalized
                            ? 'A finalized server\'s details are locked. Move it back to Building or Draft below, then edit it.'
                            : 'You do not have permission to change this server\'s details.'}</p>
                    </div>` : ''}
                    <div class="space-y-5">
                        <div class="form-group">
                            <label for="serverEditName" class="form-label required flex items-center gap-2">
                                <i class="fas fa-tag text-primary text-sm"></i>
                                Server Name
                            </label>
                            <input type="text" class="form-input" id="serverEditName" maxlength="100"
                                value="${utils.escapeHtml(server.server_name || '')}" ${detailsLocked ? 'disabled' : ''}>
                        </div>
                        ${serialField}
                        <div class="form-group">
                            <label for="serverEditDescription" class="form-label flex items-center gap-2">
                                <i class="fas fa-align-left text-primary text-sm"></i>
                                Description
                            </label>
                            <textarea class="form-textarea" id="serverEditDescription" rows="3"
                                placeholder="What this server is for" ${detailsLocked ? 'disabled' : ''}>${utils.escapeHtml(server.description || '')}</textarea>
                        </div>
                        ${locationField}
                        <div class="form-group">
                            <label for="serverEditNotes" class="form-label flex items-center gap-2">
                                <i class="fas fa-clipboard text-primary text-sm"></i>
                                Notes
                            </label>
                            <textarea class="form-textarea" id="serverEditNotes" rows="2"
                                placeholder="Anything worth recording about this build" ${detailsLocked ? 'disabled' : ''}>${utils.escapeHtml(server.notes || '')}</textarea>
                        </div>
                    </div>
                    <div class="flex items-center justify-end gap-3 pt-4">
                        <button type="button" class="px-5 py-2.5 bg-surface-secondary text-text-primary rounded-lg font-medium text-sm hover:bg-surface-hover transition-colors" onclick="dashboard.closeModal()">Cancel</button>
                        <button type="button" class="px-5 py-2.5 bg-primary text-white rounded-lg font-medium text-sm hover:bg-primary-hover transition-colors flex items-center gap-2"
                                onclick="dashboard.saveServerDetails()" ${detailsLocked && !canEditLocation ? 'disabled' : ''}>
                            <i class="fas fa-save text-xs"></i> Save changes
                        </button>
                    </div>
                </div>

                <div>
                    <h4 class="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4 pb-2 border-b border-border-light">IP addresses</h4>
                    <p class="text-xs text-text-muted mb-3">Optional, for records. Still editable after the server is finalized.</p>
                    <div id="serverEditIpRows" class="space-y-3">
                        ${(server.ip_addresses || []).map(ip => this._renderServerIpRow(ip, !canEditDetails)).join('')}
                    </div>
                    ${canEditDetails ? `
                    <div class="flex items-center justify-between gap-3 pt-4">
                        <button type="button" class="px-4 py-2 bg-surface-secondary text-text-primary rounded-lg font-medium text-sm hover:bg-surface-hover transition-colors flex items-center gap-2"
                                onclick="dashboard.addServerIpRow()">
                            <i class="fas fa-plus text-xs"></i> Add IP
                        </button>
                        <button type="button" class="px-5 py-2.5 bg-primary text-white rounded-lg font-medium text-sm hover:bg-primary-hover transition-colors flex items-center gap-2"
                                onclick="dashboard.saveServerIps()">
                            <i class="fas fa-save text-xs"></i> Save IPs
                        </button>
                    </div>` : `${(server.ip_addresses || []).length ? '' : '<p class="text-sm text-text-secondary">None recorded.</p>'}`}
                </div>

                <div>
                    <h4 class="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4 pb-2 border-b border-border-light">Status</h4>
                    ${statusBody}
                </div>
            </div>`;
    }

    // One editable IP row in the edit dialog. Read by saveServerIps() through
    // the data-ip-* hooks, so the markup can change without touching the save.
    _renderServerIpRow(ip = {}, disabled = false) {
        const type = ip.ip_type === 'public' ? 'public' : 'private';
        return `
            <div class="flex flex-col sm:flex-row gap-2" data-ip-row>
                <input type="text" class="form-input flex-1 min-w-0 font-mono" data-ip-address maxlength="45"
                    placeholder="e.g. 10.0.4.12" value="${utils.escapeHtml(ip.ip_address || '')}" ${disabled ? 'disabled' : ''}>
                <select class="form-select flex-1 min-w-0" data-ip-type ${disabled ? 'disabled' : ''}>
                    <option value="private" ${type === 'private' ? 'selected' : ''}>Private</option>
                    <option value="public" ${type === 'public' ? 'selected' : ''}>Public</option>
                </select>
                <input type="text" class="form-input flex-1 min-w-0" data-ip-label maxlength="100"
                    placeholder="Label (optional), e.g. iDRAC" value="${utils.escapeHtml(ip.label || '')}" ${disabled ? 'disabled' : ''}>
                ${disabled ? '' : `
                <button type="button" class="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg text-text-muted hover:bg-danger-light hover:text-danger transition-colors"
                        onclick="this.closest('[data-ip-row]').remove()" title="Remove this IP" aria-label="Remove this IP">
                    <i class="fas fa-times text-xs"></i>
                </button>`}
            </div>`;
    }

    addServerIpRow() {
        const rows = document.getElementById('serverEditIpRows');
        if (!rows) return;
        rows.insertAdjacentHTML('beforeend', this._renderServerIpRow());
        rows.lastElementChild?.querySelector('[data-ip-address]')?.focus();
    }

    /**
     * Save the IP addresses half of the edit dialog. Its own endpoint
     * (server-update-ips), which replaces the whole set; a blank row is skipped,
     * and no rows at all clears them. The backend validates each address.
     */
    async saveServerIps() {
        const ctx = this.serverEditContext;
        if (!ctx) return;

        const ips = [...document.querySelectorAll('#serverEditIpRows [data-ip-row]')]
            .map(row => ({
                ip_address: (row.querySelector('[data-ip-address]')?.value || '').trim(),
                ip_type: row.querySelector('[data-ip-type]')?.value || 'private',
                label: (row.querySelector('[data-ip-label]')?.value || '').trim()
            }))
            .filter(ip => ip.ip_address !== '');

        try {
            utils.showLoading(true, 'Saving IP addresses...');
            const result = await api.servers.updateIps(ctx.configUuid, ips);
            if (!result?.success) {
                utils.showAlert(result?.message || 'Failed to save the IP addresses', 'error');
                return;
            }
            utils.showAlert('IP addresses saved', 'success');
            this.closeModal();
            await this.loadServerList(true);
        } catch (error) {
            console.error('Save server IPs error:', error);
            utils.showAlert(error.message || 'An error occurred while saving the IP addresses', 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    /**
     * Save the details half of the edit dialog.
     *
     * Sends only what actually changed — server-update-config leaves an absent
     * field alone, and this keeps the configuration change log free of no-op
     * entries.
     */
    async saveServerDetails() {
        const ctx = this.serverEditContext;
        if (!ctx) return;
        const server = ctx.server;

        const nameEl = document.getElementById('serverEditName');
        const name = (nameEl?.value || '').trim();
        const locationSelect = document.getElementById('serverEditLocation');

        // A locked details half still has a live location select for an unracked
        // server only when the lock is the finalized one; in every other case the
        // inputs are disabled and nothing below finds a change to send.
        if (nameEl && !nameEl.disabled && !name) {
            utils.showAlert('Server name cannot be empty', 'warning');
            return;
        }

        const fields = {};
        if (nameEl && !nameEl.disabled && name !== (server.server_name || '')) {
            fields.server_name = name;
        }
        const descriptionEl = document.getElementById('serverEditDescription');
        if (descriptionEl && !descriptionEl.disabled) {
            const description = descriptionEl.value.trim();
            if (description !== (server.description || '')) { fields.description = description; }
        }
        const notesEl = document.getElementById('serverEditNotes');
        if (notesEl && !notesEl.disabled) {
            const notes = notesEl.value.trim();
            if (notes !== (server.notes || '')) { fields.notes = notes; }
        }
        // Absent for a virtual build (no field is rendered) and skipped while the
        // details are locked. A cleared box is sent as '', which the backend
        // stores as NULL — blanking a wrongly recorded serial is allowed.
        const serialEl = document.getElementById('serverEditSerial');
        if (serialEl && !serialEl.disabled) {
            const serial = serialEl.value.trim();
            if (serial !== (server.serial_number || '')) { fields.serial_number = serial; }
        }

        const newLocationUuid = locationSelect && !locationSelect.disabled
            ? api.locations.selectedUuid(locationSelect)
            : null;
        const locationChanged = newLocationUuid !== null && newLocationUuid !== (server.location_uuid || '');

        if (!Object.keys(fields).length && !locationChanged) {
            utils.showAlert('Nothing changed', 'info');
            return;
        }

        try {
            utils.showLoading(true, 'Saving server...');

            if (Object.keys(fields).length) {
                const result = await api.servers.updateConfig(ctx.configUuid, fields);
                if (!result?.success) {
                    utils.showAlert(result?.message || 'Failed to save the server details', 'error');
                    return;
                }
            }

            // Separate endpoint on purpose (see showServerEditModal). Reported
            // rather than swallowed: the details are already saved by this point,
            // so a bare "saved" would be a lie about the location.
            if (locationChanged) {
                const locationResult = await api.servers.updateLocation(ctx.configUuid, newLocationUuid);
                if (!locationResult?.success) {
                    utils.showAlert(locationResult?.message || 'Details saved, but the location could not be changed', 'warning');
                    this.closeModal();
                    await this.loadServerList(true);
                    return;
                }
            }

            utils.showAlert('Server updated', 'success');
            this.closeModal();
            await this.loadServerList(true);
        } catch (error) {
            console.error('Save server details error:', error);
            utils.showAlert(error.message || 'An error occurred while saving the server', 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    /**
     * Walk one lifecycle edge.
     *
     * to_status is a status_v2 value; the command maps it onto the legacy int.
     * This is also the way back out of finalized — the edges finalized →
     * building and finalized → draft, both gated on server.unfinalize.
     */
    async changeServerStatus() {
        const ctx = this.serverEditContext;
        if (!ctx) return;

        const toStatus = document.getElementById('serverEditStatus')?.value || '';
        if (!toStatus) {
            utils.showAlert('Choose the status to move this server to', 'warning');
            return;
        }

        const move = (ctx.transitions?.transitions || []).find(t => t.to_status === toStatus);
        const targetLabel = this._serverStatusLabel(toStatus);
        const notes = (document.getElementById('serverEditStatusNotes')?.value || '').trim();

        // requires_validation === 'full' is what makes a move fail late, so it is
        // said before the click rather than reported as a surprise after it.
        const validationNote = move?.requires_validation
            ? ' The whole build is validated first, and the move is refused if it does not pass.'
            : '';
        // Leaving 'finalized' is the case this dialog was built for, and the
        // consequence is worth stating: the build becomes editable again.
        const unlockNote = (parseInt(ctx.server.configuration_status, 10) || 0) === 3
            ? ' Its components become editable again.'
            : '';

        const confirmed = await utils.confirm(
            `Move "${ctx.server.server_name || 'this server'}" to ${targetLabel}?${validationNote}${unlockNote}`,
            'Change Server Status'
        );
        if (!confirmed) return;

        try {
            utils.showLoading(true, 'Changing server status...');
            const result = await api.servers.transitionStatus(ctx.configUuid, toStatus, notes);
            if (!result?.success) {
                utils.showAlert(result?.message || 'Failed to change the server status', 'error');
                return;
            }
            utils.showAlert(`Status changed to ${targetLabel}`, 'success');
            this.closeModal();
            await this.loadServerList(true);
        } catch (error) {
            console.error('Change server status error:', error);
            utils.showAlert(error.message || 'An error occurred while changing the server status', 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    /**
     * How one server's status reads on screen.
     *
     * status_v2 is the authoritative lifecycle state — StateGuard consults it
     * FIRST and STATE_MACHINE_ENABLED is enforce in production. The legacy
     * configuration_status int is a lossy projection of it (draft→0, validated→1,
     * building/validating→2, and finalized/deployed/maintenance/retired ALL →3),
     * so labelling from the int alone calls a deployed or maintenance server
     * "Finalized" — which would make the new status control look like it had
     * done nothing.
     *
     * Falls back to the int for a row that pre-dates the status_v2 backfill.
     */
    _serverStatusPresentation(server) {
        const v2 = server?.status_v2;
        if (v2 && SERVER_STATUS_V2_PRESENTATION[v2]) {
            return SERVER_STATUS_V2_PRESENTATION[v2];
        }
        return SERVER_STATUS_LEGACY_PRESENTATION[String(server?.configuration_status)]
            || SERVER_STATUS_LEGACY_PRESENTATION['0'];
    }

    /** The display name for one status_v2 value. */
    _serverStatusLabel(statusV2) {
        return SERVER_STATUS_V2_PRESENTATION[statusV2]?.label || statusV2;
    }

    /**
     * The card's status: a plain letterspaced word under the action cluster, in the
     * status colour. The pill form below is still what the edit dialog shows.
     */
    _serverStatusInline(server) {
        const s = this._serverStatusPresentation(server);
        return `<span class="text-[10px] font-semibold uppercase tracking-widest ${s.textClass}">${utils.escapeHtml(s.label)}</span>`;
    }

    _serverStatusBadge(server) {
        const s = this._serverStatusPresentation(server);
        return `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider border border-border bg-surface-secondary ${s.textClass}"><span class="w-1.5 h-1.5 rounded-full ${s.dotClass}"></span>${s.label}</span>`;
    }

    // ---------------------------------------------------------------------------
    // Server card formatters.
    //
    // server-list-configs sends NUMBERS -- storage_summary.groups, memory_summary --
    // and every string the card prints is built here, where the design lives. Each
    // returns null when there is nothing to say, and the card renders an em dash.
    // ---------------------------------------------------------------------------

    /**
     * "1.92TB", "512GB". `divisor` is 1000 for drives, which are sold in decimal
     * TB, and 1024 for memory, which is not.
     */
    _formatSize(gb, divisor) {
        const n = Number(gb);
        if (!Number.isFinite(n) || n <= 0) return null;
        return n >= divisor
            ? `${parseFloat((n / divisor).toFixed(2))}TB`
            : `${parseFloat(n.toFixed(2))}GB`;
    }

    /**
     * Drive capacity. Decimal TB, which is how drives are sold and how ims-data
     * writes them (1920 is a 1.92TB NVMe) -- EXCEPT for a capacity that is a whole
     * number of binary GB, where the spec plainly means the binary figure and the
     * decimal one would print a 2048GB drive as "2.05TB".
     */
    _formatDriveSize(gb) {
        const n = Number(gb);
        if (!Number.isFinite(n) || n <= 0) return null;
        return this._formatSize(n, n % 1024 === 0 ? 1024 : 1000);
    }

    /** "2× 1.92TB NVMe". The bus is dropped when the spec does not name one. */
    _formatStorageGroup(group) {
        if (!group) return null;
        const parts = [`${group.count}×`, this._formatDriveSize(group.capacity_gb), group.kind];
        return parts.filter(Boolean).join(' ');
    }

    /**
     * The largest backplane group, with a trailing "+" when the server holds more
     * than one kind of drive -- "2× 1.92TB NVMe +" reads as "two NVMe in the bays,
     * and there is more inside". The backend has already sorted them.
     */
    _serverStorageText(summary) {
        const groups = summary?.groups;
        if (!Array.isArray(groups) || groups.length === 0) return null;
        const first = this._formatStorageGroup(groups[0]);
        if (!first) return null;
        return groups.length > 1 ? `${first} +` : first;
    }

    /** The whole breakdown, for the hover title. */
    _serverStorageTitle(summary) {
        const groups = summary?.groups;
        if (!Array.isArray(groups) || groups.length === 0) return '';
        return groups
            .map(g => `${this._formatStorageGroup(g)} (${g.bay ? 'backplane' : 'internal'})`)
            .join(' · ');
    }

    /**
     * Installed over the board's ceiling: "128/512GB" when both sides share a unit,
     * "512GB/3TB" when they do not, and the installed figure alone for the three
     * boards in ims-data that state no maximum.
     */
    _serverMemoryText(summary) {
        const installed = this._formatSize(summary?.installed_gb, 1024);
        if (!installed) return null;
        const max = this._formatSize(summary?.max_gb, 1024);
        if (!max) return installed;
        // Write the unit once only when both sides are in GB: "128/512GB". In TB the
        // numbers are small enough that "1/4TB" reads as a fraction, so both keep
        // their unit -- "1TB/4TB", "512GB/3TB".
        return installed.endsWith('GB') && max.endsWith('GB')
            ? `${installed.slice(0, -2)}/${max}`
            : `${installed}/${max}`;
    }

    /** "4 × DDR4 · 128GB installed of 512GB". */
    _serverMemoryTitle(summary) {
        const installed = this._formatSize(summary?.installed_gb, 1024);
        if (!installed) return '';
        const max = this._formatSize(summary?.max_gb, 1024);
        const modules = Number(summary?.modules);
        const head = [
            Number.isFinite(modules) && modules > 0 ? `${modules} ×` : '',
            summary?.type || 'module'
        ].filter(Boolean).join(' ');
        return `${head} · ${installed} installed${max ? ` of ${max}` : ''}`;
    }

    /**
     * "YN682/28-29U" -- site initials, rack number, U range. The full path is the
     * hover title. There is no short-code column on locations, so the initials are
     * derived from the name; if one is ever added, this is the only place to change.
     */
    _serverLocationCompact(server) {
        const site = String(server.location_name || server.location || '').trim();
        const initials = site
            .split(/[^A-Za-z0-9]+/)
            .filter(Boolean)
            .map(word => word[0].toUpperCase())
            .join('')
            .slice(0, 3);

        const rackDigits = String(server.rack_name || '').match(/\d+/g);
        const rackNumber = rackDigits ? rackDigits[rackDigits.length - 1] : '';

        const startU = parseInt(server.rack_start_u, 10);
        const height = Math.max(1, parseInt(server.rack_u_height, 10) || 1);
        const range = startU
            ? (height > 1 ? `${startU}-${startU + height - 1}U` : `${startU}U`)
            : String(server.rack_position || '');

        const parts = [initials + rackNumber, range].filter(Boolean);
        return parts.length ? utils.escapeHtml(parts.join('/')) : null;
    }

    /** utils.formatDate, with the card's em dash instead of its hyphen. */
    _serverDate(value) {
        const text = utils.formatDate(value);
        return text === '-' ? '—' : utils.escapeHtml(text);
    }

    /**
     * Modified shows updated_at, and an em dash when the row has never been touched
     * since it was created -- repeating the created date there says nothing.
     */
    _serverModifiedDate(server) {
        const updated = server.last_modified || server.updated_at;
        if (!updated || updated === server.created_at) return '—';
        return this._serverDate(updated);
    }

    async showServerBuilder(configUuid, serverName) {

        // Switch to server builder view
        document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
        document.getElementById('serverBuilderView').classList.add('active');

        // Update title. The serial comes from the already-loaded list rather than
        // a new argument, the same lookup showServerEditModal() uses -- so the
        // card click, the Configure button and the post-create jump all get it
        // without four call sites having to pass it. Absent (a config created
        // moments ago, a virtual build, or the seeder not yet applied) simply
        // means no serial is shown.
        const builderServer = (this.allServers || []).find(s => s.config_uuid === configUuid);
        const builderSerial = builderServer?.serial_number
            ? `<span class="ml-2 text-sm font-mono text-text-muted align-middle">${utils.escapeHtml(builderServer.serial_number)}</span>`
            : '';
        // serverName is stored text a user chose, so it is escaped the same way the
        // serial beside it already was. It used to be interpolated raw.
        const builderTitle = utils.escapeHtml(serverName || 'Server Builder');
        document.getElementById('serverBuilderTitle').innerHTML = `<i class="fas fa-wrench"></i> ${builderTitle}${builderSerial}`;
        // document.getElementById('serverBuilderSubtitle').textContent = `PC Part Picker Style Interface`;

        // Store current config
        this.currentServerConfig = {
            uuid: configUuid,
            name: serverName
        };

        // Use PC part picker builder if available
        if (window.serverBuilder) {
            try {
                window.serverBuilder.currentConfig = null;
                await window.serverBuilder.loadExistingConfig(configUuid);
                // The PC part picker builder will now render directly to serverBuilderContent
            } catch (error) {
                console.error('Error loading PC part picker builder:', error);
                this.showServerBuilderError('Failed to load server builder: ' + error.message);
            }
        } else {
            // Unreachable in practice: the only two pages carrying #serverBuilderView
            // (servers.html, server-compatibility.html) both load server-builder.js,
            // and on servers.html it loads BEFORE dashboard.js, so window.serverBuilder
            // is always assigned first. This used to fall back to a second, drifted
            // copy of the whole builder living inside this file; that copy is deleted.
            // Reports the same way loadServerBuilder() already does.
            this.showServerBuilderError('PC Part Picker Builder not available');
        }
    }

    showServerView() {
        // Switch back to server list view
        document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
        document.getElementById('serverView').classList.add('active');

        // Clear current config
        this.currentServerConfig = null;
    }

    async validateServerConfiguration() {
        try {
            utils.showLoading(true, 'Validating server configuration...');

            const result = await serverAPI.validateServerConfig(this.currentServerConfig.uuid);

            if (result.success) {
                const performanceWarnings = result.data?.performance_warnings || [];

                let warningsHtml = '';
                if (performanceWarnings.length > 0) {
                    warningsHtml = '<div class="performance-warnings"><h5><i class="fas fa-exclamation-triangle"></i> Performance Warnings</h5><ul>';
                    performanceWarnings.forEach(warning => {
                        warningsHtml += `<li>${warning}</li>`;
                    });
                    warningsHtml += '</ul></div>';
                }

                utils.showAlert(
                    'Server configuration validated successfully!' + (warningsHtml ? '\n\nWarnings:\n' + performanceWarnings.join('\n') : ''),
                    'success'
                );

                const deployBtn = document.getElementById('deployButton');
                if (deployBtn) deployBtn.disabled = false;
            } else {
                utils.showAlert('Validation failed: ' + (result.message || 'Unknown error'), 'error');
                const deployBtn = document.getElementById('deployButton');
                if (deployBtn) deployBtn.disabled = true;
            }
        } catch (error) {
            console.error('Error validating configuration:', error);
            utils.showAlert(error.message || 'Failed to validate configuration', 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    async deployServerConfiguration() {
        if (!confirm('Are you sure you want to deploy this server configuration? This action cannot be undone.')) {
            return;
        }

        try {
            utils.showLoading(true, 'Deploying server configuration...');

            const result = await serverAPI.finalizeServerConfig(this.currentServerConfig.uuid, '');

            if (result.success) {
                utils.showAlert('Server configuration deployed successfully!', 'success');
                await this.switchView('servers');
            } else {
                utils.showAlert('Deployment failed: ' + (result.message || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Error deploying configuration:', error);
            utils.showAlert(error.message || 'Failed to deploy configuration', 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    async showEditForm(componentType, componentId) {
        try {
            utils.showLoading(true, 'Loading form...');
            const response = await fetch('../../pages/forms/edit-component.html');
            if (!response.ok) throw new Error('Could not load form HTML.');
            const formHtml = await response.text();
            // Opened from the details modal, that modal goes first: the drawer
            // replaces it rather than stacking over it.
            this._closeCenteredModal();
            const singular = utils.componentLabelsSingular?.[componentType] || componentType.toUpperCase();
            this.openDrawer(formHtml, `Edit ${singular}`);

            // The list row carries the model name and server name; {type}-get
            // does not, and the drawer's header wants both.
            const row = this.componentRows?.get(Number(componentId)) || null;
            await this._loadFormScript('../../assets/js/forms/edit-form.js', 'initializeEditFormComponent');
            const form = initializeEditFormComponent(componentType, componentId, { row });
            this._drawerGuard = () => Object.keys(form.collectChangedFields() || {}).length;
        } catch (error) {
            console.error('Error loading edit form:', error);
            this.closeDrawer();
            utils.showAlert(error.message || 'Failed to load the edit component form', 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    /**
     * Load a form script once. Resolves when `globalName` (the function the
     * script declares) exists.
     */
    _loadFormScript(src, globalName) {
        if (typeof window[globalName] === 'function') return Promise.resolve();
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load the form script'));
            document.body.appendChild(script);
        });
    }

    /**
     * The Add / Edit component drawer ("B · Focus"). Holds one form fragment;
     * the fragment's own head and footer supply the title, Close, Discard and
     * Save. Styles: assets/css/component-drawer.css.
     */
    openDrawer(html, label) {
        this.closeDrawer();
        const root = document.createElement('div');
        root.className = 'cd-root';
        root.innerHTML = `
            <div class="cd-backdrop" data-drawer-dismiss></div>
            <aside class="cd-drawer" role="dialog" aria-modal="true" aria-label="${utils.escapeHtml(label)}">${html}</aside>`;
        document.body.appendChild(root);
        document.body.classList.add('cd-open');
        this._drawerRoot = root;
        this._drawerOpener = document.activeElement;
        this._drawerGuard = null;
        requestAnimationFrame(() => root.classList.add('is-open'));

        root.addEventListener('click', (e) => {
            if (e.target.closest('[data-drawer-dismiss], [data-drawer-close]')) {
                e.preventDefault();
                this.requestCloseDrawer();
            }
        });
        this._drawerKeydown = (e) => {
            // While the discard confirm is up, it owns the keyboard.
            if (!this._drawerRoot || this._drawerConfirming) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                this.requestCloseDrawer();
            } else if (e.key === 'Tab') {
                const focusable = [...root.querySelectorAll('.cd-drawer a[href], .cd-drawer button, .cd-drawer input, .cd-drawer select, .cd-drawer textarea')]
                    .filter(el => !el.disabled && el.type !== 'hidden' && el.offsetParent !== null);
                if (!focusable.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        };
        document.addEventListener('keydown', this._drawerKeydown);
        setTimeout(() => root.querySelector('.cd-close')?.focus(), 50);
    }

    /** Close, asking first when the form reports unsaved changes. */
    async requestCloseDrawer() {
        if (!this._drawerRoot || this._drawerConfirming) return;
        const pending = typeof this._drawerGuard === 'function' ? this._drawerGuard() : 0;
        if (pending > 0) {
            this._drawerConfirming = true;
            let ok = false;
            try {
                ok = await utils.confirm(
                    `You have ${pending} unsaved ${pending === 1 ? 'change' : 'changes'}. Close and discard ${pending === 1 ? 'it' : 'them'}?`,
                    'Discard changes'
                );
            } finally {
                this._drawerConfirming = false;
            }
            if (!ok) return;
        }
        this.closeDrawer();
    }

    closeDrawer() {
        if (!this._drawerRoot) return;
        document.removeEventListener('keydown', this._drawerKeydown);
        this._drawerRoot.remove();
        this._drawerRoot = null;
        this._drawerGuard = null;
        document.body.classList.remove('cd-open');
        if (this._drawerOpener && document.contains(this._drawerOpener)) this._drawerOpener.focus();
        this._drawerOpener = null;
    }

    async showComponentViewModal(componentType, componentId) {
        try {
            utils.showLoading(true, 'Loading component details...');

            // Fetch inventory data from API
            const result = await api.components.get(componentType, componentId);
            if (!result.success || !result.data) {
                throw new Error(result.message || 'Failed to load component details');
            }
            const component = result.data.component || result.data;

            // Fetch specs from JSON data by matching UUID
            const specData = await this._fetchComponentSpecsByUUID(componentType, component.UUID);

            const content = this._buildComponentViewContent(componentType, component, specData);
            this.showModal(`${componentType.toUpperCase()} Details`, content);
        } catch (error) {
            console.error('Error loading component details:', error);
            utils.showAlert(error.message || 'Failed to load component details', 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    async _fetchComponentSpecsByUUID(componentType, uuid) {
        if (!uuid) return null;
        const typeLower = String(componentType).toLowerCase();

        // One map, served by dashboard-type-manifest from ComponentSpecPaths.php.
        const jsonPath = await utils.specPathFor(componentType);
        if (!jsonPath) return null;

        try {
            const response = await fetch(jsonPath);
            if (!response.ok) return null;
            let jsonData = await response.json();

            // Normalize JSON structures
            if (typeLower === 'chassis') {
                jsonData = jsonData.chassis_specifications?.manufacturers || [];
            } else if (typeLower === 'caddy') {
                jsonData = jsonData.caddies || [];
            }

            // Search for model matching UUID across all JSON structures
            return this._findModelByUUID(typeLower, jsonData, uuid);
        } catch (error) {
            console.error('Error fetching component specs JSON:', error);
            return null;
        }
    }

    _findModelByUUID(componentType, jsonData, uuid) {
        if (!Array.isArray(jsonData)) return null;

        for (const item of jsonData) {
            // Standard structure (CPU, Motherboard, HBA, Storage, PCIe): brand/series → models[]
            if (item.models && Array.isArray(item.models)) {
                for (const model of item.models) {
                    const modelUUID = model.UUID || model.uuid;
                    if (modelUUID === uuid) {
                        return {
                            ...model,
                            _brand: item.brand || item.manufacturer || '',
                            _series: item.series || '',
                            // Server platforms put the product name in `family`; every
                            // other file leaves it undefined and the field is dropped.
                            _family: item.family || '',
                            _component_subtype: item.component_subtype || '',
                        };
                    }
                }
            }

            // NIC structure: brand → series[] → models[]
            if (item.series && Array.isArray(item.series)) {
                for (const s of item.series) {
                    if (s.models && Array.isArray(s.models)) {
                        for (const model of s.models) {
                            const modelUUID = model.UUID || model.uuid;
                            if (modelUUID === uuid) {
                                return {
                                    ...model,
                                    _brand: item.brand || '',
                                    _series: s.name || '',
                                };
                            }
                        }
                    }
                }
            }

            // Chassis structure: manufacturer → series[] → models[]
            if (componentType === 'chassis' && item.series && Array.isArray(item.series)) {
                for (const s of item.series) {
                    if (s.models && Array.isArray(s.models)) {
                        for (const model of s.models) {
                            const modelUUID = model.UUID || model.uuid;
                            if (modelUUID === uuid) {
                                return {
                                    ...model,
                                    _brand: item.manufacturer || '',
                                    _series: s.name || '',
                                };
                            }
                        }
                    }
                }
            }

            // Caddy: flat items with uuid directly
            if (componentType === 'caddy') {
                const itemUUID = item.UUID || item.uuid;
                if (itemUUID === uuid) {
                    return { ...item };
                }
            }

            // SFP/flat items: uuid directly on item
            const itemUUID = item.UUID || item.uuid;
            if (itemUUID === uuid) {
                return { ...item };
            }
        }

        return null;
    }

    _buildComponentViewContent(componentType, component, specData) {
        // Map JSON field names to display labels per component type
        // Uses actual field names from the JSON data files (see add-form.js displayComponentDetails)
        const fieldSchemas = {
            cpu: [
                ['_brand', 'Brand'], ['_series', 'Series'], ['model', 'Model'],
                ['cores', 'Cores'], ['threads', 'Threads'],
                ['base_frequency_GHz', 'Base Frequency (GHz)'], ['max_frequency_GHz', 'Max Frequency (GHz)'],
                ['tdp_W', 'TDP (W)'], ['socket', 'Socket'], ['architecture', 'Architecture'],
            ],
            ram: [
                ['_brand', 'Brand'], ['_series', 'Series'], ['memory_type', 'Memory Type'],
                ['module_type', 'Module Type'], ['capacity_GB', 'Capacity (GB)'],
                ['frequency_MHz', 'Frequency (MHz)'], ['features.ecc_support', 'ECC Support'],
                ['voltage_V', 'Voltage (V)'],
            ],
            storage: [
                ['_brand', 'Brand'], ['_series', 'Series'], ['storage_type', 'Storage Type'],
                ['form_factor', 'Form Factor'], ['interface', 'Interface'],
                ['capacity_GB', 'Capacity (GB)'], ['specifications.rpm', 'RPM'],
                ['specifications.cache_MB', 'Cache (MB)'],
            ],
            motherboard: [
                ['_brand', 'Brand'], ['_series', 'Series'], ['model', 'Model'],
                ['chipset', 'Chipset'], ['socket.type', 'Socket Type'], ['socket.count', 'Socket Count'],
                ['memory.type', 'Memory Type'], ['memory.slots', 'Memory Slots'],
            ],
            nic: [
                ['_brand', 'Brand'], ['_series', 'Series'], ['model', 'Model'],
                ['ports', 'Ports'], ['port_type', 'Port Type'],
                ['speeds', 'Speeds'], ['interface', 'Interface'],
            ],
            caddy: [
                ['model', 'Model'], ['type', 'Type'],
                ['compatibility.size', 'Size'], ['compatibility.interface', 'Interface'],
                ['material', 'Material'],
            ],
            chassis: [
                ['_brand', 'Manufacturer'], ['_series', 'Series'], ['model', 'Model'],
                ['u_size', 'U Size'], ['form_factor', 'Form Factor'], ['chassis_type', 'Type'],
                ['drive_bays.total_bays', 'Total Bays'],
            ],
            pciecard: [
                ['_brand', 'Brand'], ['_series', 'Series'], ['_component_subtype', 'Subtype'],
                ['model', 'Model'], ['interface', 'Interface'], ['form_factor', 'Form Factor'],
            ],
            risercard: [
                ['_brand', 'Brand'], ['_series', 'Series'], ['model', 'Model'],
                ['interface', 'Interface'], ['pcie_slots', 'PCIe Slots'], ['slot_type', 'Slot Type'],
                ['form_factor', 'Form Factor'],
            ],
            hbacard: [
                ['_brand', 'Brand'], ['_series', 'Series'], ['model', 'Model'],
                ['protocol', 'Protocol'], ['data_rate', 'Data Rate'],
                ['internal_ports', 'Internal Ports'], ['external_ports', 'External Ports'],
            ],
            sfp: [
                ['brand', 'Brand'], ['model', 'Model'], ['type', 'Type'],
                ['speed', 'Speed'], ['wavelength', 'Wavelength'],
                ['reach', 'Reach'], ['fiber_type', 'Fiber Type'],
            ],
            // A stocked unit is a platform VERSION, so what matters here is which
            // product it is and what is inside the box.
            serverplatform: [
                ['_brand', 'Brand'], ['_family', 'Platform'], ['version_name', 'Version'],
                ['part_number', 'Part Number'], ['bay_summary', 'Drive Bays'],
                ['system_board.model', 'System Board'], ['system_board.socket.type', 'Socket'],
                ['chassis.model', 'Chassis'], ['chassis.form_factor', 'Form Factor'],
            ],
            // A router, switch or MUX: what it is, how tall, and what it connects.
            networkdevice: [
                ['_brand', 'Brand'], ['_series', 'Series'], ['model', 'Model'],
                ['device_type', 'Type'], ['u_size', 'U Size'], ['port_summary', 'Ports'],
                ['power.psu_count', 'PSUs'], ['power.max_watts', 'Max Power (W)'],
                ['channels', 'Channels'], ['grid', 'Grid'],
            ],
        };

        const typeLower = componentType.toLowerCase();
        const schemaFields = fieldSchemas[typeLower] || [];

        // Helper to resolve nested field paths like "socket.type" or "drive_bays.total_bays"
        const resolveField = (obj, path) => {
            if (!obj) return undefined;
            const parts = path.split('.');
            let val = obj;
            for (const part of parts) {
                if (val == null || typeof val !== 'object') return undefined;
                val = val[part];
            }
            return val;
        };

        let specRows = '';
        if (specData) {
            specRows = schemaFields.map(([key, label]) => {
                let value = resolveField(specData, key);
                // Handle array values (e.g., NIC speeds)
                if (Array.isArray(value)) value = value.join(', ');
                // Handle boolean values
                if (typeof value === 'boolean') value = value ? 'Yes' : 'No';
                const display = (value !== null && value !== undefined && value !== '')
                    ? utils.escapeHtml(String(value))
                    : '<span class="text-text-muted">—</span>';
                return `<div class="flex flex-col gap-1">
                    <span class="text-xs font-medium text-text-muted uppercase tracking-wide">${label}</span>
                    <span class="text-sm text-text-primary font-medium">${display}</span>
                </div>`;
            }).join('');
        }

        const serialNumber = utils.escapeHtml(component.SerialNumber || '—');
        const uuid = utils.escapeHtml(component.UUID || '—');
        const status = utils.createStatusBadge(component.Status);
        const location = utils.escapeHtml(component.address_text || component.Location || '—');
        const purchaseDate = utils.formatDate(component.PurchaseDate);
        const serverUUID = component.ServerUUID
            ? `<code class="text-xs">${utils.escapeHtml(component.ServerUUID)}</code>`
            : '<span class="text-text-muted">—</span>';

        const notesText = component.Notes
            ? utils.escapeHtml(component.Notes)
            : '';

        return `<div style="max-width: 640px;">
            <div class="mb-6">
                <h4 class="text-xs font-semibold uppercase tracking-widest text-text-muted mb-3 pb-1 border-b border-border">Inventory</h4>
                <div class="grid grid-cols-2 gap-4">
                    <div class="flex flex-col gap-1">
                        <span class="text-xs font-medium text-text-muted uppercase tracking-wide">Serial Number</span>
                        <span class="text-sm text-text-primary font-medium font-mono">${serialNumber}</span>
                    </div>
                    <div class="flex flex-col gap-1">
                        <span class="text-xs font-medium text-text-muted uppercase tracking-wide">UUID</span>
                        <span class="text-sm text-text-primary font-medium font-mono break-all">${uuid}</span>
                    </div>
                    <div class="flex flex-col gap-1">
                        <span class="text-xs font-medium text-text-muted uppercase tracking-wide">Status</span>
                        <span>${status}</span>
                    </div>
                    <div class="flex flex-col gap-1">
                        <span class="text-xs font-medium text-text-muted uppercase tracking-wide">Location</span>
                        <span class="text-sm text-text-primary font-medium">${location}</span>
                    </div>
                    <div class="flex flex-col gap-1">
                        <span class="text-xs font-medium text-text-muted uppercase tracking-wide">Purchase Date</span>
                        <span class="text-sm text-text-primary font-medium">${purchaseDate}</span>
                    </div>
                    <div class="flex flex-col gap-1">
                        <span class="text-xs font-medium text-text-muted uppercase tracking-wide">Server UUID</span>
                        <span class="text-sm">${serverUUID}</span>
                    </div>
                </div>
            </div>
            ${specRows ? `<div class="mb-6">
                <h4 class="text-xs font-semibold uppercase tracking-widest text-text-muted mb-3 pb-1 border-b border-border">Specifications</h4>
                <div class="grid grid-cols-2 gap-4">${specRows}</div>
            </div>` : '<div class="mb-6"><p class="text-sm text-text-muted italic">No specification data found for this component UUID in the catalog.</p></div>'}
            ${notesText ? `<div class="mb-6">
                <h4 class="text-xs font-semibold uppercase tracking-widest text-text-muted mb-3 pb-1 border-b border-border">Notes</h4>
                <p class="text-sm text-text-primary whitespace-pre-wrap">${notesText}</p>
            </div>` : ''}
            <div class="flex justify-end mt-6">
                <button class="btn btn-secondary" onclick="dashboard.closeModal()">Close</button>
            </div>
        </div>`;
    }

    async handleDeleteComponent(componentType, componentId) {
        const confirmed = await utils.confirm('Are you sure you want to delete this component? This action cannot be undone.', 'Delete Component');
        if (confirmed) {
            try {
                utils.showLoading(true, 'Deleting component...');
                const result = await api.components.delete(componentType, componentId);
                if (result.success) {
                    utils.showAlert('Component deleted successfully', 'success');
                    await this.loadComponentList(componentType, true);
                    await this.loadDashboard();
                }
            } catch (error) {
                console.error('Error deleting component:', error);
                utils.showAlert(error.message || 'Failed to delete component', 'error');
            } finally {
                utils.showLoading(false);
            }
        }
    }

    /** @param focusField the select to focus first: bulkStatus, bulkLocation or bulkFlag */
    async showBulkUpdateModal(focusField = 'bulkStatus') {
        if (this.selectedItems.size === 0) {
            utils.showAlert('Please select items to update', 'warning');
            return;
        }
        const modalContent = `
            <div style="max-width: 400px;">
                <div class="form-group"><label class="form-label" for="bulkStatus">Update Status</label><select id="bulkStatus" class="form-select"><option value="">Keep Current</option><option value="1">Available</option><option value="2">In Use</option><option value="0">Failed</option></select></div>
                <div class="form-group"><label class="form-label" for="bulkLocation">Update Location</label><select id="bulkLocation" class="form-select"><option value="">Loading locations…</option></select></div>
                <div class="form-group"><label class="form-label" for="bulkFlag">Update Flag</label><select id="bulkFlag" class="form-select"><option value="">Keep Current</option><option value="Backup">Backup</option><option value="Critical">Critical</option><option value="Maintenance">Maintenance</option><option value="Testing">Testing</option><option value="Production">Production</option></select></div>
                <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;"><button class="btn btn-secondary" onclick="dashboard.closeModal()">Cancel</button><button class="btn btn-primary" onclick="dashboard.executeBulkUpdate()">Update ${this.selectedItems.size} Items</button></div>
            </div>
        `;
        this.showModal('Bulk Update Components', modalContent);

        // "Keep Current" rather than "-- Select Location --": on a bulk edit an
        // empty choice means "do not touch this field", not "clear it".
        api.locations.populateSelect(document.getElementById('bulkLocation'), {
            placeholder: 'Keep Current'
        });
        // After showModal()'s own 100ms focus on the first input, or it wins.
        setTimeout(() => document.getElementById(focusField)?.focus(), 150);
    }

    async executeBulkUpdate() {
        const status = document.getElementById('bulkStatus')?.value;
        const locationSelect = document.getElementById('bulkLocation');
        const location = locationSelect?.value;
        const flag = document.getElementById('bulkFlag')?.value;
        const updates = {};
        if (status) updates.Status = status;
        if (location) {
            updates.Location = location;
            // The display text alone would leave these rows unfilterable by site
            // and invisible to the location join. Write the key too.
            const locationUuid = api.locations.selectedUuid(locationSelect);
            if (locationUuid) updates.location_uuid = locationUuid;
        }
        if (flag) updates.Flag = flag;
        if (Object.keys(updates).length === 0) {
            utils.showAlert('Please select at least one field to update', 'warning');
            return;
        }
        try {
            utils.showLoading(true, 'Updating components...');
            const result = await api.components.bulkUpdate(this.currentComponent, Array.from(this.selectedItems), updates);
            if (result.success) {
                utils.showAlert(`Successfully updated ${result.data.updated} components`, 'success');
                this.selectedItems.clear();
                this.closeModal();
                await this.loadComponentList(this.currentComponent, true);
                await this.loadDashboard();
            }
        } catch (error) {
            console.error('Error bulk updating components:', error);
            utils.showAlert(error.message || 'Failed to update components', 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    async handleBulkDelete() {
        if (this.selectedItems.size === 0) {
            utils.showAlert('Please select items to delete', 'warning');
            return;
        }
        const confirmed = await utils.confirm(`Are you sure you want to delete ${this.selectedItems.size} selected components? This cannot be undone.`, 'Delete Components');
        if (confirmed) {
            try {
                utils.showLoading(true, 'Deleting components...');
                // PERF-N1: one bulk-delete request (batched at 100, the server's own
                // cap) instead of one request per selected row.
                const { succeeded, failed } = await api.components.bulkDelete(
                    this.currentComponent, Array.from(this.selectedItems)
                );
                if (succeeded > 0) {
                    utils.showAlert(`Successfully deleted ${succeeded} components${failed > 0 ? `, ${failed} failed` : ''}`, failed === 0 ? 'success' : 'warning');
                } else {
                    utils.showAlert('Failed to delete any components', 'error');
                }
                this.selectedItems.clear();
                await this.loadComponentList(this.currentComponent, true);
                await this.loadDashboard();
            } catch (error) {
                console.error('Error bulk deleting components:', error);
                utils.showAlert(error.message || 'Failed to delete components', 'error');
            } finally {
                utils.showLoading(false);
            }
        }
    }

    /**
     * Open the change-history modal for a single server. Reads from the
     * server-get-logs endpoint (same inventory_log data as the dashboard
     * activity log, scoped to this configuration).
     */
    async showServerLogs(configUuid, serverName) {
        this.serverLogContext = { configUuid, serverName, offset: 0, limit: 50, total: 0 };
        this.showModal(`History — ${serverName}`, '<div id="serverLogPanel"></div>');
        await this._loadServerLogs();
    }

    async _loadServerLogs() {
        const ctx = this.serverLogContext;
        const panel = document.getElementById('serverLogPanel');
        if (!ctx || !panel) return;

        panel.innerHTML = `
            <div class="py-16 text-center text-text-muted">
                <i class="fas fa-spinner fa-spin text-2xl mb-3"></i>
                <p class="text-sm">Loading change history…</p>
            </div>`;

        try {
            const result = await serverAPI.getServerLogs(ctx.configUuid, ctx.limit, ctx.offset);
            if (!result || !result.success) {
                throw new Error(result?.message || 'Failed to load change history');
            }
            ctx.total = result.data?.pagination?.total || 0;
            panel.innerHTML = await this._renderMovementHistory(ctx.configUuid)
                + this._renderServerLogs(result.data?.logs || []);
        } catch (err) {
            panel.innerHTML = `
                <div class="py-16 text-center">
                    <i class="fas fa-exclamation-circle text-2xl text-danger mb-3"></i>
                    <p class="text-sm text-text-secondary">${utils.escapeHtml(err.message || 'Failed to load change history')}</p>
                </div>`;
        }
    }

    changeServerLogPage(delta) {
        const ctx = this.serverLogContext;
        if (!ctx) return;
        const next = ctx.offset + delta * ctx.limit;
        if (next < 0 || next >= ctx.total) return;
        ctx.offset = next;
        this._loadServerLogs();
    }

    /**
     * WHERE THIS SERVER HAS BEEN — the physical half of its history.
     *
     * The change log below it records what was done to the build (parts added,
     * status changed). This records where the box itself went, which the change
     * log has never covered: before server_movements existed, a server that
     * crossed the country left nothing behind but a single activity-log line.
     *
     * Returns '' — no heading, no empty state — when there is nothing to show,
     * so a server that has never moved does not gain a section saying so. Also
     * returns '' when the seeder has not been run: the API answers with an empty
     * list, which is indistinguishable from "never moved", and that is fine.
     */
    async _renderMovementHistory(configUuid) {
        let movements = [];
        try {
            const result = await api.servers.getMovements(configUuid, 20);
            movements = (result?.success && result.data?.movements) || [];
        } catch (error) {
            // The change history below is the main event; a failure here must not
            // take the whole modal down.
            console.warn('Could not load movement history:', error);
            return '';
        }

        if (!movements.length) return '';

        const addr = (side) => {
            const parts = [
                side.location_name,
                side.floor ? `Floor ${side.floor}` : '',
                side.rack_name,
                side.u_text
            ].filter(Boolean).map(p => utils.escapeHtml(String(p)));
            return parts.length ? parts.join(' · ') : 'Not placed';
        };

        const rows = movements.map(m => `
            <div class="py-3 flex flex-col gap-1">
                <div class="flex flex-wrap items-center gap-2 text-sm">
                    <span class="text-text-muted">${addr(m.from)}</span>
                    <i class="fas fa-arrow-right text-xs text-primary"></i>
                    <span class="text-text-primary font-medium">${addr(m.to)}</span>
                </div>
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                    <span class="tabular-nums">${utils.formatDate(m.moved_at)}</span>
                    ${m.moved_by_username ? `<span><i class="fas fa-user text-[10px] mr-1"></i>${utils.escapeHtml(m.moved_by_username)}</span>` : ''}
                    ${m.components_moved > 0 ? `<span><i class="fas fa-boxes text-[10px] mr-1"></i>${m.components_moved} component${m.components_moved === 1 ? '' : 's'}</span>` : ''}
                    ${m.ticket_id ? `<span><i class="fas fa-inbox text-[10px] mr-1"></i>Request #${m.ticket_id}</span>` : ''}
                </div>
                ${m.reason ? `<p class="text-xs text-text-secondary italic">${utils.escapeHtml(m.reason)}</p>` : ''}
            </div>`).join('');

        return `
            <div class="mb-6">
                <h4 class="text-xs font-semibold uppercase tracking-wider text-text-muted pb-2.5 mb-2 border-b border-border-light">
                    <i class="fas fa-truck-moving mr-1.5"></i>Movement history
                </h4>
                <div class="divide-y divide-border-light">${rows}</div>
            </div>`;
    }

    _serverLogBadge(action) {
        if (!action) return '<span class="text-text-muted">—</span>';
        const lower = action.toLowerCase();
        let cls = 'bg-surface-hover text-text-secondary';
        if (lower.includes('created') || lower.includes('finalized')) cls = 'bg-green-100 text-green-700';
        else if (lower.includes('added')) cls = 'bg-blue-100 text-blue-700';
        else if (lower.includes('removed') || lower.includes('deleted')) cls = 'bg-red-100 text-red-600';
        return `<span class="inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}">${utils.escapeHtml(action)}</span>`;
    }

    _renderServerLogs(logs) {
        if (!logs.length) {
            return `
                <div class="py-16 text-center">
                    <div class="w-14 h-14 mx-auto rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                        <i class="fas fa-history text-primary text-xl"></i>
                    </div>
                    <h3 class="text-base font-semibold text-text-primary mb-1">No history yet</h3>
                    <p class="text-sm text-text-secondary">No changes have been recorded for this server.</p>
                </div>`;
        }

        const rows = logs.map(log => `
            <tr class="hover:bg-surface-hover transition-colors">
                <td class="px-4 py-3 text-text-secondary whitespace-nowrap align-top" data-label="Time">${utils.formatDate(log.created_at, 'long')}</td>
                <td class="px-4 py-3 text-text-primary font-medium align-top" data-label="User">${utils.escapeHtml(log.username || ('#' + log.user_id))}</td>
                <td class="px-4 py-3 align-top" data-label="Action">${this._serverLogBadge(log.action)}</td>
                <td class="px-4 py-3 text-text-secondary align-top" data-label="Details">${utils.escapeHtml(log.notes || '—')}</td>
            </tr>
        `).join('');

        const ctx = this.serverLogContext;
        const start = ctx.total === 0 ? 0 : ctx.offset + 1;
        const end = Math.min(ctx.offset + ctx.limit, ctx.total);
        const pager = ctx.total > ctx.limit ? `
            <div class="flex items-center justify-between gap-3 mt-4">
                <span class="text-xs text-text-muted">Showing ${start}–${end} of ${ctx.total}</span>
                <div class="flex gap-2">
                    <button onclick="dashboard.changeServerLogPage(-1)" ${ctx.offset === 0 ? 'disabled' : ''}
                        class="px-3 py-1.5 text-xs bg-surface-hover text-text-secondary rounded-lg hover:bg-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        <i class="fas fa-chevron-left mr-1"></i> Previous
                    </button>
                    <button onclick="dashboard.changeServerLogPage(1)" ${end >= ctx.total ? 'disabled' : ''}
                        class="px-3 py-1.5 text-xs bg-surface-hover text-text-secondary rounded-lg hover:bg-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        Next <i class="fas fa-chevron-right ml-1"></i>
                    </button>
                </div>
            </div>` : '';

        return `
            <div class="overflow-x-auto rounded-lg border border-border">
                <table class="w-full text-sm">
                    <thead class="bg-surface-hover border-b border-border">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Time</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">User</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Action</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Details</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-border">${rows}</tbody>
                </table>
            </div>
            ${pager}`;
    }

    /**
     * Not every dashboard page ships the #modalContainer markup (acl,
     * activity-log, racks). Without it showModal() used to log to the console
     * and do nothing, so shared dialogs like Change Password looked dead.
     * Create the container on demand instead.
     */
    ensureModalContainer() {
        if (document.getElementById('modalContainer')) return;

        const container = document.createElement('div');
        container.id = 'modalContainer';
        container.className = 'modal-overlay fixed inset-0 bg-black/50 flex items-center justify-center z-modal hidden';
        container.innerHTML = `
            <div class="modal bg-surface-card rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden">
                <div class="modal-header flex items-center justify-between px-6 py-4 border-b border-border">
                    <h3 id="modalTitle" class="text-xl font-semibold text-text-primary">Modal Title</h3>
                    <button class="modal-close text-text-muted hover:text-text-primary transition-colors" id="modalClose">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                <div class="modal-body overflow-y-auto px-6 py-4 max-h-[calc(90vh-120px)]" id="modalBody"></div>
            </div>
        `;
        document.body.appendChild(container);
    }

    showModal(title, content) {
        this.ensureModalContainer();

        const modal = document.getElementById('modalContainer');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');

        if (modal && modalTitle && modalBody) {
            modalTitle.textContent = title;
            modalBody.innerHTML = content;

            // Show modal by setting display and adding active class
            modal.style.display = 'flex';
            modal.classList.add('active');
            modal.classList.remove('hidden');
            modal.removeAttribute('hidden');

            // Set up close button event listener
            const closeButton = document.getElementById('modalClose');
            if (closeButton) {
                // Remove any existing listener by cloning and replacing
                const newCloseButton = closeButton.cloneNode(true);
                closeButton.parentNode.replaceChild(newCloseButton, closeButton);
                newCloseButton.addEventListener('click', () => this.closeModal());
                // Six pages ship this shell with an icon-only close; name it here
                // once rather than in each page's markup.
                if (!newCloseButton.hasAttribute('aria-label')) newCloseButton.setAttribute('aria-label', 'Close dialog');
                newCloseButton.querySelector('i')?.setAttribute('aria-hidden', 'true');
            }

            // Dialog role and name, focus moved in and kept in, Escape, and
            // focus back to the opener on close. Guarded: a cached utils.js can
            // predate utils.dialog, and then the old first-field focus applies.
            const panel = modal.querySelector('.modal');
            if (panel && typeof utils.dialog === 'function') {
                this._modalRelease = utils.dialog(panel, { labelledBy: 'modalTitle', onEscape: () => this.closeModal() });
            } else {
                const firstInput = modalBody.querySelector('input, select, textarea, button');
                if (firstInput) {
                    setTimeout(() => firstInput.focus(), 100);
                }
            }

            // Set up click outside to close
            const handleOutsideClick = (e) => {
                if (e.target === modal) {
                    this.closeModal();
                }
            };

            // Store the handler so we can remove it later
            modal._outsideClickHandler = handleOutsideClick;
            modal.addEventListener('click', handleOutsideClick);

        } else {
            console.error('Modal elements not found!');
        }

        window.closeModal = () => this.closeModal();
        window.loadComponentList = (type) => this.loadComponentList(type);
        window.loadDashboard = () => this.loadDashboard();
    }

    closeModal() {
        // The add and edit forms close themselves through closeModal(); when
        // they live in the drawer, that is what they mean.
        if (this._drawerRoot) {
            this.closeDrawer();
            return;
        }
        this._closeCenteredModal();
    }

    _closeCenteredModal() {
        const modal = document.getElementById('modalContainer');
        if (this._modalRelease) {
            const release = this._modalRelease;
            this._modalRelease = null;
            release();
        }
        if (modal) {
            // Remove the outside click event listener
            if (modal._outsideClickHandler) {
                modal.removeEventListener('click', modal._outsideClickHandler);
                delete modal._outsideClickHandler;
            }

            // Properly hide modal
            modal.classList.remove('active');  // Remove active class to hide modal
            modal.classList.add('hidden');     // Add hidden class back
            modal.style.display = '';          // Clear inline style to let CSS take over
        }
        delete window.closeModal;
        delete window.loadComponentList;
        delete window.loadDashboard;
    }

    async handleDeleteServer(configUuid) {
        const confirmed = await utils.confirm('Are you sure you want to delete this server configuration? This action cannot be undone.', 'Delete Server');
        if (!confirmed) return;
        await this.deleteServerConfig(configUuid, false);
    }

    /**
     * Delete a server configuration, releasing its components.
     *
     * The backend refuses (409) to delete a server that still holds components,
     * because that delete is also a bulk inventory release. Rather than making
     * the user empty the server by hand, we turn the refusal into a second
     * confirmation that names exactly what will be freed, then re-issue the
     * delete with force — so one extra click both releases the components and
     * removes the server.
     */
    async deleteServerConfig(configUuid, force) {
        try {
            utils.showLoading(true, 'Deleting server...');
            const result = await api.servers.deleteConfig(configUuid, force);
            if (result.success) {
                const released = result.data?.components_released ?? 0;
                utils.showAlert(
                    released > 0
                        ? `Server deleted. ${released} component${released === 1 ? '' : 's'} released back to available.`
                        : 'Server deleted successfully',
                    'success'
                );
                await this.loadServerList(true);
                await this.loadDashboard();
            }
        } catch (error) {
            console.error('Error deleting server:', error);
            // 409 = components still installed. Not a failure — ask whether to
            // release them, and retry the delete with force if the user agrees.
            if (error.code === 409 && !force) {
                utils.showLoading(false);
                const total = error.data?.installed_total ?? 0;
                const releaseConfirmed = await utils.confirm(
                    `This server still has ${total} component${total === 1 ? '' : 's'} installed`
                    + `${this.formatInstalledComponents(error.data?.installed_components)}. `
                    + 'Deleting it will release them back to available inventory. Continue?',
                    'Release Components & Delete'
                );
                if (releaseConfirmed) {
                    await this.deleteServerConfig(configUuid, true);
                }
                return;
            }
            utils.showAlert(error.message || 'Failed to delete server', 'error');
        } finally {
            utils.showLoading(false);
        }
    }

    /** " (1 RAM, 1 motherboard, 1 network card)" — empty string when unknown. */
    formatInstalledComponents(byType) {
        const labels = {
            cpu: 'CPU', ram: 'RAM', storage: 'storage', motherboard: 'motherboard',
            nic: 'network card', caddy: 'caddy', chassis: 'chassis',
            pciecard: 'PCIe card', risercard: 'riser card', hbacard: 'HBA card', sfp: 'SFP module'
        };
        const parts = Object.entries(byType || {})
            .filter(([, count]) => count > 0)
            .map(([type, count]) => `${count} ${labels[type] || type}`);
        return parts.length ? ` (${parts.join(', ')})` : '';
    }

    async handleLogout() {
        const confirmed = await utils.confirm('Are you sure you want to logout?', 'Logout');
        if (confirmed) {
            try {
                utils.showLoading(true, 'Logging out...');
                await api.auth.logout();
                window.location.href = api.loginURL;
            } catch (error) {
                console.error('Logout error:', error);
                api.clearAuth();
                window.location.href = api.loginURL;
            }
        }
    }

    async refresh() {
        if (this.currentComponent === 'dashboard') await this.loadDashboard();
        else if (this.currentComponent === 'servers') await this.loadServerList();
        else if (this.currentComponent === 'racks') { if (window.rackView) await window.rackView.loadRacks(); }
        else await this.loadComponentList(this.currentComponent);
    }

    /**
     * Load server builder with PC part picker interface
     */
    async loadServerBuilder() {
        try {
            const urlParams = utils.getURLParams();
            const configUuid = urlParams.config || (this.currentServerConfig && this.currentServerConfig.uuid);

            if (!configUuid) {
                console.error('No server configuration UUID provided');
                this.showServerBuilderError('No server configuration selected');
                return;
            }

            // Placeholder heading only — ServerBuilder replaces it with the server's
            // name and serial once the configuration is loaded (applyBuilderTitle).
            document.getElementById('serverBuilderTitle').innerHTML = '<i class="fas fa-wrench"></i> Server Builder';
            // document.getElementById('serverBuilderSubtitle').textContent = 'PC Part Picker Style Interface';

            // Use PC part picker builder if available
            if (window.serverBuilder) {
                // Check if it's already loading or has this config to avoid flicker
                if (window.serverBuilder.loading) {
                    return;
                }

                if (window.serverBuilder.currentConfig && window.serverBuilder.currentConfig.config_uuid === configUuid) {
                    // Already built — nothing to reload, but the heading was just
                    // reset above, so put the name and serial back.
                    window.serverBuilder.applyBuilderTitle();
                    return;
                }

                await window.serverBuilder.loadExistingConfig(configUuid);
                // The PC part picker builder will now render directly to serverBuilderContent
            } else {
                this.showServerBuilderError('PC Part Picker Builder not available');
            }
        } catch (error) {
            console.error('Error loading server builder:', error);
            this.showServerBuilderError('Failed to load server builder: ' + error.message);
        }
    }

    /**
     * Show server builder error
     */
    showServerBuilderError(message) {
        document.getElementById('serverBuilderContent').innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 60px 24px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 64px; color: var(--danger-color); margin-bottom: 16px;"></i>
                <h3>Server Builder Error</h3>
                <p>${message}</p>
                <button class="btn btn-primary" onclick="dashboard.switchView('servers')">
                    <i class="fas fa-arrow-left"></i> Back to Server List
                </button>
            </div>
        `;
    }

    /**
     * Switch view
     */
    async switchView(viewName) {
        // Hide all content sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });

        this.currentComponent = viewName;

        // Handle specific views
        if (viewName === 'dashboard') {
            const view = document.getElementById('dashboardView');
            if (view) view.classList.add('active');
            await this.loadDashboard();
        } else if (viewName === 'servers') {
            const view = document.getElementById('serverView');
            if (view) view.classList.add('active');
            await this.loadServerList();
        } else if (viewName === 'serverBuilder') {
            const view = document.getElementById('serverBuilderView');
            if (view) view.classList.add('active');
            await this.loadServerBuilder();
            // Ensure sidebar counts are up to date after returning from configuration page
            await this.loadSidebarCounts();
        } else {
            // General fallback
            const viewId = viewName.endsWith('View') ? viewName : viewName + 'View';
            const view = document.getElementById(viewId);

            if (view) {
                view.classList.add('active');
            } else {
                const dashboardView = document.getElementById('dashboardView');
                if (dashboardView) dashboardView.classList.add('active');
                await this.loadDashboard();
            }
        }

        // Update URL to reflect view (optional but good for history)
        const url = new URL(window.location);
        url.searchParams.set('view', viewName);
        window.history.pushState({}, '', url);
    }

    handleInitialView() {
        const urlParams = utils.getURLParams();
        const view = urlParams.view || 'dashboard';

        if (view !== 'dashboard') {
            // Handle special case for serverBuilder with config parameter
            if (view === 'serverBuilder' && urlParams.config) {
                // Store the config for the server builder
                this.currentServerConfig = {
                    uuid: urlParams.config,
                    name: 'Server Configuration'
                };
            }
            this.switchView(view);
        }
    }

    // ── Vendor Management ──

    async loadVendorList() {
        try {
            utils.showLoading(true, 'Loading vendors...');
            const result = await api.vendors.list();
            if (result.success) {
                this.allVendors = result.data.vendors || [];
                this.filterAndRenderVendors();
            }
        } catch (error) {
            console.error('Error loading vendors:', error);
            utils.showAlert(error.message || 'Failed to load vendors', 'error');
        } finally {
            utils.showLoading(false);
        }

        this.setupVendorEventListeners();
    }

    setupVendorEventListeners() {
        // loadVendorList() runs again after every add/edit/delete; bind once.
        if (this._vendorListenersBound) return;
        this._vendorListenersBound = true;

        const searchInput = document.getElementById('componentSearch');
        if (searchInput) {
            searchInput.addEventListener('input', utils.debounce(() => {
                this.filterAndRenderVendors();
            }, 300));
        }

        const addBtn = document.getElementById('addVendorBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.showAddVendorForm());
        }

        // One delegated listener for every card: open, edit, delete.
        const grid = document.getElementById('vendorGrid');
        if (grid) {
            grid.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-vendor-act]');
                if (!btn) return;
                const vendor = (this.allVendors || []).find(v => String(v.id) === btn.dataset.vendorId);
                const name = vendor?.name || 'Unnamed Vendor';
                const act = btn.dataset.vendorAct;
                if (act === 'add') this.showAddVendorForm();
                else if (!vendor) return;
                else if (act === 'open') this.showVendorComponents(vendor.id, name);
                else if (act === 'edit') this.showEditVendorForm(vendor.id);
                else if (act === 'delete') this.handleDeleteVendor(vendor.id, name);
            });
        }
    }

    filterAndRenderVendors() {
        const search = (document.getElementById('componentSearch')?.value || '').trim().toLowerCase();
        let filtered = this.allVendors || [];

        if (search) {
            filtered = filtered.filter(v =>
                (v.name || '').toLowerCase().includes(search) ||
                (v.email || '').toLowerCase().includes(search) ||
                (v.phone || '').toLowerCase().includes(search)
            );
        }

        this.renderVendorCards(filtered);
    }

    // Short chip labels for the vendor cards — the sidebar's names are too long
    // to sit three to a row.
    static VENDOR_TAG_LABELS = {
        cpu: 'CPU', ram: 'RAM', storage: 'Storage', motherboard: 'Motherboards', nic: 'NIC',
        caddy: 'Caddies', chassis: 'Chassis', pciecard: 'PCIe', risercard: 'Risers', hbacard: 'HBA',
        sfp: 'SFP', serverplatform: 'Platforms', networkdevice: 'Network devices'
    };

    vendorInitials(name) {
        const words = String(name || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
        if (!words.length) return '?';
        const letters = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
        return letters.toUpperCase();
    }

    // "2 Oct" this year, "Sep 2025" before that — the day stops mattering and
    // the shorter form keeps the stat on one line. PurchaseDate is a plain date,
    // so it is read as one, not shifted through a timezone.
    vendorDeliveryLabel(value) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
        if (!m) return '—';
        const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1];
        return Number(m[1]) === new Date().getFullYear() ? `${Number(m[3])} ${month}` : `${month} ${m[1]}`;
    }

    renderVendorCards(vendors) {
        const grid = document.getElementById('vendorGrid');
        if (!grid) return;

        const totalVendors = (this.allVendors || []).length;
        const infoEl = document.getElementById('vendorPaginationInfo');
        if (infoEl) {
            infoEl.textContent = totalVendors
                ? `Showing ${vendors.length} of ${totalVendors} vendor${totalVendors === 1 ? '' : 's'}`
                : '';
        }

        if (vendors.length === 0) {
            const isUnfiltered = totalVendors === 0;
            grid.innerHTML = `<div class="vdx-state">
                <h3>${isUnfiltered ? 'No vendors yet' : 'No matching vendors'}</h3>
                <div>${isUnfiltered
                    ? 'Add the suppliers you buy from, then pick them when you add stock.'
                    : 'Try a different name, email or phone number.'}</div>
                ${isUnfiltered ? `<button type="button" class="vdx-primary" data-vendor-act="add"><i class="fas fa-plus text-xs" aria-hidden="true"></i> Add vendor</button>` : ''}
            </div>`;
            return;
        }

        const labels = Dashboard.VENDOR_TAG_LABELS;
        grid.innerHTML = vendors.map(vendor => {
            const id = utils.escapeHtml(String(vendor.id));
            const name = vendor.name || 'Unnamed Vendor';
            // What they say they sell; failing that, what has actually come from them.
            const declared = (vendor.sells || '').split(',').map(s => s.trim()).filter(Boolean);
            const types = declared.length ? declared : (vendor.supplied_types || []);
            const tags = types.length
                ? types.map(t => `<span class="vdx-tag">${utils.escapeHtml(labels[t] || t)}</span>`).join('')
                : '<span class="vdx-tag is-none">Nothing listed yet</span>';

            const parts = Number(vendor.parts) || 0;
            const failed = Number(vendor.failed) || 0;
            const rate = parts ? (failed / parts) * 100 : 0;
            // 2% and up is worth a second look; one bad part in a tiny batch is not.
            const rateClass = !parts ? 'is-quiet' : (rate >= 2 && failed > 1 ? 'is-bad' : '');
            const contact = vendor.email || vendor.phone || '';

            return `<article class="vdx-card">
                <button type="button" class="vdx-open" data-vendor-act="open" data-vendor-id="${id}" aria-label="${utils.escapeHtml(`${name}: show supplied parts`)}">
                    <span class="vdx-who">
                        <span class="vdx-av" aria-hidden="true">${utils.escapeHtml(this.vendorInitials(name))}</span>
                        <span class="min-w-0">
                            <span class="vdx-name block">${utils.escapeHtml(name)}</span>
                            <span class="vdx-email vdx-mono block">${contact ? utils.escapeHtml(contact) : 'No contact on file'}</span>
                        </span>
                    </span>
                    <span class="vdx-tags">${tags}</span>
                    <span class="vdx-stats">
                        <span><span class="vdx-num vdx-mono block ${parts ? '' : 'is-quiet'}">${parts.toLocaleString('en-IN')}</span><span class="vdx-lbl">parts</span></span>
                        <span><span class="vdx-num vdx-mono block ${rateClass}">${parts ? rate.toFixed(1) + '%' : '—'}</span><span class="vdx-lbl">failure rate</span></span>
                        <span><span class="vdx-num vdx-mono block ${vendor.last_delivery ? '' : 'is-quiet'}">${this.vendorDeliveryLabel(vendor.last_delivery)}</span><span class="vdx-lbl">last delivery</span></span>
                    </span>
                </button>
                <div class="vdx-acts">
                    <button type="button" class="vdx-icon" data-vendor-act="edit" data-vendor-id="${id}" title="Edit vendor" aria-label="Edit ${utils.escapeHtml(name)}"><i class="fas fa-pen"></i></button>
                    <button type="button" class="vdx-icon is-danger" data-vendor-act="delete" data-vendor-id="${id}" title="Delete vendor" aria-label="Delete ${utils.escapeHtml(name)}"><i class="fas fa-trash"></i></button>
                </div>
            </article>`;
        }).join('');
    }

    // Component types a vendor can sell — keys match VALID_COMPONENT_TYPES in the
    // backend; labels mirror the sidebar menu.
    getVendorSellTypes() {
        return Object.entries(utils.componentLabels).map(([key, label]) => ({ key, label }));
    }

    // Builds the optional extended-profile fields shared by the Add and Edit
    // vendor forms. `prefix` namespaces the element IDs ('vendor' | 'editVendor').
    renderVendorExtraFields(prefix, vendor = {}) {
        const selected = (vendor.sells || '').split(',').map(s => s.trim()).filter(Boolean);
        const checkboxClass = `${prefix}SellsOption`;
        const sellsCheckboxes = this.getVendorSellTypes().map(({ key, label }) => `
            <label class="flex items-center gap-2 px-3 py-2 border border-border rounded-lg cursor-pointer hover:bg-surface-hover transition-colors">
                <input type="checkbox" class="${checkboxClass} accent-primary" value="${key}" ${selected.includes(key) ? 'checked' : ''}>
                <span class="text-sm text-text-primary">${label}</span>
            </label>
        `).join('');

        return `
            <div class="form-group mb-4">
                <label class="block text-sm font-medium text-text-secondary mb-2" for="${prefix}Phone2">Additional phone</label>
                <input type="tel" id="${prefix}Phone2" class="form-input w-full px-4 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary" placeholder="+91 ..." value="${utils.escapeHtml(vendor.phone2 || '')}">
            </div>
            <div class="form-group mb-4">
                <label class="block text-sm font-medium text-text-secondary mb-2" for="${prefix}Address">Address</label>
                <textarea id="${prefix}Address" class="form-textarea w-full px-4 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary resize-y" rows="2" placeholder="Street, city, state, postal code...">${utils.escapeHtml(vendor.address || '')}</textarea>
            </div>
            <div class="form-group mb-4">
                <label class="block text-sm font-medium text-text-secondary mb-2" for="${prefix}BankDetails">Bank details</label>
                <textarea id="${prefix}BankDetails" class="form-textarea w-full px-4 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary resize-y" rows="3" placeholder="Account name, account number, IFSC, bank...">${utils.escapeHtml(vendor.bank_details || '')}</textarea>
            </div>
            <div class="form-group mb-4">
                <span class="block text-sm font-medium text-text-secondary mb-2" id="${prefix}SellsLabel">What they sell</span>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2" role="group" aria-labelledby="${prefix}SellsLabel">${sellsCheckboxes}</div>
            </div>
        `;
    }

    // Reads the checked "what they sell" options for the given form prefix.
    getVendorSellsSelection(prefix) {
        return Array.from(document.querySelectorAll(`.${prefix}SellsOption:checked`)).map(cb => cb.value);
    }

    showAddVendorForm() {
        const formHtml = `
            <form id="addVendorForm" class="max-w-2xl">
                <div class="form-group mb-4">
                    <label class="block text-sm font-medium text-text-secondary mb-2 required after:content-['_*'] after:text-red-500" for="vendorName">Vendor name</label>
                    <input type="text" id="vendorName" class="form-input w-full px-4 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary" required placeholder="Enter vendor name">
                </div>
                <div class="form-group mb-4">
                    <label class="block text-sm font-medium text-text-secondary mb-2" for="vendorEmail">Email</label>
                    <input type="email" id="vendorEmail" class="form-input w-full px-4 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary" placeholder="vendor@example.com">
                </div>
                <div class="form-group mb-4">
                    <label class="block text-sm font-medium text-text-secondary mb-2" for="vendorPhone">Phone</label>
                    <input type="tel" id="vendorPhone" class="form-input w-full px-4 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary" placeholder="+91 ...">
                </div>
                ${this.renderVendorExtraFields('vendor')}
                <div class="form-group mb-4">
                    <label class="block text-sm font-medium text-text-secondary mb-2" for="vendorNotes">Notes</label>
                    <textarea id="vendorNotes" class="form-textarea w-full px-4 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary resize-y" rows="3" placeholder="Additional notes..."></textarea>
                </div>
                <div class="flex gap-3 justify-end mt-6 pt-4 border-t border-border">
                    <button type="button" class="btn btn-secondary px-5 py-2 bg-surface-secondary text-text-primary rounded-lg hover:bg-surface-hover" onclick="dashboard.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary-600">Add vendor</button>
                </div>
            </form>
        `;
        this.showModal('Add vendor', formHtml);
        document.getElementById('addVendorForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleAddVendor();
        });
    }

    async handleAddVendor() {
        const name = document.getElementById('vendorName').value.trim();
        if (!name) {
            toast.error('Vendor name is required');
            return;
        }
        try {
            utils.showLoading(true, 'Adding vendor...');
            const result = await api.vendors.add({
                name,
                email: document.getElementById('vendorEmail').value.trim(),
                phone: document.getElementById('vendorPhone').value.trim(),
                phone2: document.getElementById('vendorPhone2').value.trim(),
                address: document.getElementById('vendorAddress').value.trim(),
                bank_details: document.getElementById('vendorBankDetails').value.trim(),
                sells: this.getVendorSellsSelection('vendor'),
                notes: document.getElementById('vendorNotes').value.trim()
            });
            if (result.success) {
                toast.success('Vendor added successfully');
                this.closeModal();
                await this.loadVendorList();
            } else {
                toast.error(result.message || 'Failed to add vendor');
            }
        } catch (error) {
            toast.error(error.message || 'Failed to add vendor');
        } finally {
            utils.showLoading(false);
        }
    }

    async showEditVendorForm(vendorId) {
        try {
            utils.showLoading(true, 'Loading vendor...');
            const result = await api.vendors.get(vendorId);
            if (!result.success) {
                toast.error(result.message || 'Vendor not found');
                return;
            }
            const vendor = result.data.vendor;
            const formHtml = `
                <form id="editVendorForm" class="max-w-2xl">
                    <input type="hidden" id="editVendorId" value="${vendor.id}">
                    <div class="form-group mb-4">
                        <label class="block text-sm font-medium text-text-secondary mb-2 required after:content-['_*'] after:text-red-500" for="editVendorName">Vendor name</label>
                        <input type="text" id="editVendorName" class="form-input w-full px-4 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary" required value="${utils.escapeHtml(vendor.name || '')}">
                    </div>
                    <div class="form-group mb-4">
                        <label class="block text-sm font-medium text-text-secondary mb-2" for="editVendorEmail">Email</label>
                        <input type="email" id="editVendorEmail" class="form-input w-full px-4 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary" value="${utils.escapeHtml(vendor.email || '')}">
                    </div>
                    <div class="form-group mb-4">
                        <label class="block text-sm font-medium text-text-secondary mb-2" for="editVendorPhone">Phone</label>
                        <input type="tel" id="editVendorPhone" class="form-input w-full px-4 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary" value="${utils.escapeHtml(vendor.phone || '')}">
                    </div>
                    ${this.renderVendorExtraFields('editVendor', vendor)}
                    <div class="form-group mb-4">
                        <label class="block text-sm font-medium text-text-secondary mb-2" for="editVendorNotes">Notes</label>
                        <textarea id="editVendorNotes" class="form-textarea w-full px-4 py-2 border border-border rounded-lg bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary resize-y" rows="3">${utils.escapeHtml(vendor.notes || '')}</textarea>
                    </div>
                    <div class="flex gap-3 justify-end mt-6 pt-4 border-t border-border">
                        <button type="button" class="btn btn-secondary px-5 py-2 bg-surface-secondary text-text-primary rounded-lg hover:bg-surface-hover" onclick="dashboard.closeModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary-600">Save Changes</button>
                    </div>
                </form>
            `;
            this.showModal('Edit vendor', formHtml);
            document.getElementById('editVendorForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleUpdateVendor();
            });
        } catch (error) {
            toast.error(error.message || 'Failed to load vendor');
        } finally {
            utils.showLoading(false);
        }
    }

    async handleUpdateVendor() {
        const vendorId = document.getElementById('editVendorId').value;
        const name = document.getElementById('editVendorName').value.trim();
        if (!name) {
            toast.error('Vendor name is required');
            return;
        }
        try {
            utils.showLoading(true, 'Updating vendor...');
            const result = await api.vendors.update(vendorId, {
                name,
                email: document.getElementById('editVendorEmail').value.trim(),
                phone: document.getElementById('editVendorPhone').value.trim(),
                phone2: document.getElementById('editVendorPhone2').value.trim(),
                address: document.getElementById('editVendorAddress').value.trim(),
                bank_details: document.getElementById('editVendorBankDetails').value.trim(),
                sells: this.getVendorSellsSelection('editVendor'),
                notes: document.getElementById('editVendorNotes').value.trim()
            });
            if (result.success) {
                toast.success('Vendor updated successfully');
                this.closeModal();
                await this.loadVendorList();
            } else {
                toast.error(result.message || 'Failed to update vendor');
            }
        } catch (error) {
            toast.error(error.message || 'Failed to update vendor');
        } finally {
            utils.showLoading(false);
        }
    }

    async handleDeleteVendor(vendorId, vendorName) {
        const confirmed = await utils.confirm(
            `Delete vendor "${vendorName}"? Components linked to this vendor will have their vendor reference cleared.`,
            'Delete vendor'
        );
        if (!confirmed) return;
        try {
            utils.showLoading(true, 'Deleting vendor...');
            const result = await api.vendors.delete(vendorId);
            if (result.success) {
                toast.success('Vendor deleted successfully');
                await this.loadVendorList();
            } else {
                toast.error(result.message || 'Failed to delete vendor');
            }
        } catch (error) {
            toast.error(error.message || 'Failed to delete vendor');
        } finally {
            utils.showLoading(false);
        }
    }

    async showVendorComponents(vendorId, vendorName) {
        try {
            utils.showLoading(true, 'Loading vendor components...');
            const result = await api.vendors.getComponents(vendorId);
            if (!result.success) {
                toast.error(result.message || 'Failed to load components');
                return;
            }

            const components = result.data.components || [];
            const totalCount = Number(result.data.total_count) || components.length;
            let content;

            if (components.length === 0) {
                content = `<div class="rf-state">No parts on record from this vendor yet. Pick them as the vendor when you add stock.</div>`;
            } else {
                const labels = Dashboard.VENDOR_TAG_LABELS;
                const statusOf = (s) => ({ 0: ['failed', 'Failed'], 1: ['available', 'Available'], 2: ['inuse', 'In use'] }[Number(s)] || ['', 'Unknown']);
                const rows = components.map(item => {
                    const [cls, word] = statusOf(item.Status);
                    return `<tr>
                        <td>${utils.escapeHtml(labels[item.component_type] || item.component_type || '—')}</td>
                        <td class="rf-mono">${utils.escapeHtml(item.SerialNumber || '—')}</td>
                        <td><span style="display:inline-flex;align-items:center;gap:8px"><i class="rf-dot ${cls ? 'rf-st-' + cls : ''}"></i>${word}</span></td>
                        <td style="color:var(--color-text-secondary)">${utils.escapeHtml(item.Location || '—')}</td>
                    </tr>`;
                }).join('');

                content = `<div class="rf">
                    <div class="rf-sub" style="margin:0">${totalCount > components.length
                        ? `Showing the first ${components.length.toLocaleString('en-IN')} of ${totalCount.toLocaleString('en-IN')} parts from this vendor`
                        : `${totalCount.toLocaleString('en-IN')} part${totalCount === 1 ? '' : 's'} from this vendor`}</div>
                    <div class="rf-card rf-scroll" style="max-height:24rem;overflow:auto">
                        <table class="rf-table">
                            <thead><tr><th scope="col">Type</th><th scope="col">Serial number</th><th scope="col">Status</th><th scope="col">Location</th></tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>`;
            }

            // showModal() sets the title as text, so the name goes in unescaped.
            this.showModal(`Parts from ${vendorName}`, content);
        } catch (error) {
            toast.error(error.message || 'Failed to load vendor components');
        } finally {
            utils.showLoading(false);
        }
    }
}

let dashboard;
document.addEventListener('DOMContentLoaded', async () => {
    try {
        dashboard = new Dashboard();
        dashboard.handleInitialView();
        window.dashboard = dashboard;

        // Auto-refresh only on dashboard page, store interval for cleanup
        if (dashboard.currentComponent === 'dashboard') {
            dashboard._refreshInterval = setInterval(() => {
                if (!document.hidden) dashboard.loadDashboard();
            }, 5 * 60 * 1000);
            window.addEventListener('beforeunload', () => clearInterval(dashboard._refreshInterval));
        }
    } catch (error) {
        console.error('Failed to initialize dashboard:', error);
        utils.showAlert('Failed to initialize dashboard. Please refresh the page.', 'error');
    }
});

window.addEventListener('popstate', () => { if (dashboard) dashboard.handleInitialView(); });
