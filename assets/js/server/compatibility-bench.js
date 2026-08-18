/**
 * Compatibility Bench — the "Server Compatibility" section.
 *
 * A bench build is an ordinary server configuration flagged is_sandbox=1, which the
 * backend forces to is_virtual=1. That single flag is what makes the whole feature
 * safe: ServerBuilder::addComponent() skips the inventory lock, the availability
 * check, the duplicate check and — the point of the exercise — the status flip from
 * available to in_use. Nothing tested here is ever reserved.
 *
 * Two classes live in this file:
 *   BenchResults       — the tested-parts log (localStorage). Loaded by BOTH this page
 *                        and the component picker (configuration.js), which is where
 *                        an add verdict actually happens.
 *   CompatibilityBench — the page controller. Only instantiates itself when the bench
 *                        page's markup is present, so the picker can share the file
 *                        without side effects.
 */

/**
 * Per-build log of every component the user tried, with the engine's verdict.
 *
 * Kept client-side on purpose. An incompatible part is by definition NOT in the
 * configuration — the backend refused it — so there is no server-side row to hang the
 * result on, and inventing one would mean persisting parts the engine just rejected.
 */
class BenchResults {
    static KEY_PREFIX = 'bdc_compat_tested_';
    static MAX_ENTRIES = 100;

    static _key(configUuid) {
        return `${BenchResults.KEY_PREFIX}${configUuid}`;
    }

    /** All logged attempts for a build, newest first. Never throws. */
    static get(configUuid) {
        if (!configUuid) return [];
        try {
            const raw = localStorage.getItem(BenchResults._key(configUuid));
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            // Corrupt or unavailable storage must never take the page down — the log
            // is a convenience, the verdicts themselves come from the backend.
            return [];
        }
    }

    /**
     * Record one attempt.
     * @param {string} configUuid
     * @param {{type:string, uuid:string, name:string, compatible:boolean, reason:string}} entry
     */
    static add(configUuid, entry) {
        if (!configUuid || !entry || !entry.type) return;
        try {
            const list = BenchResults.get(configUuid);
            list.unshift({
                type: entry.type,
                uuid: entry.uuid || '',
                name: entry.name || 'Unknown component',
                compatible: !!entry.compatible,
                reason: entry.reason || '',
                at: Date.now()
            });
            localStorage.setItem(
                BenchResults._key(configUuid),
                JSON.stringify(list.slice(0, BenchResults.MAX_ENTRIES))
            );
        } catch (e) {
            // Quota or private-mode failure: silently skip. Losing a log line is
            // strictly better than breaking the add flow.
        }
    }

    static clear(configUuid) {
        try {
            localStorage.removeItem(BenchResults._key(configUuid));
        } catch (e) { /* storage unavailable */ }
    }

    static removeAt(configUuid, index) {
        try {
            const list = BenchResults.get(configUuid);
            if (index < 0 || index >= list.length) return;
            list.splice(index, 1);
            localStorage.setItem(BenchResults._key(configUuid), JSON.stringify(list));
        } catch (e) { /* storage unavailable */ }
    }
}

window.BenchResults = BenchResults;


class CompatibilityBench {
    constructor() {
        this.loginURL = window.BDC_CONFIG?.FRONTEND_LOGIN_URL || 'https://ims.bdcms.bharatdatacenter.com/';
        this.builds = [];
        this.filteredBuilds = [];
        this.currentBuild = null;
        this.init();
    }

    async init() {
        if (!this.checkAuthentication()) return;

        this.setupEventListeners();

        // Returning from the component picker lands here with the build to reopen.
        const params = new URLSearchParams(window.location.search);
        const configUuid = params.get('config');
        if (params.get('view') === 'serverBuilder' && configUuid) {
            await this.loadBuilds({ silentRender: true });
            const known = this.builds.find(b => b.config_uuid === configUuid);
            await this.openBuild(configUuid, known ? known.server_name : 'Test Build');
            return;
        }

        await this.loadBuilds();
    }

    checkAuthentication() {
        const token = localStorage.getItem('bdc_token') || sessionStorage.getItem('bdc_token');
        if (!token) {
            window.location.href = this.loginURL;
            return false;
        }
        return true;
    }

    setupEventListeners() {
        document.getElementById('addBenchBtn')?.addEventListener('click', () => this.showCreateModal());
        document.getElementById('refreshBench')?.addEventListener('click', () => this.loadBuilds());

        const search = document.getElementById('benchSearch');
        if (search) {
            search.addEventListener('input', (e) => this.filterBuilds(e.target.value));
        }
    }

    // ---------------------------------------------------------------- list view

    async loadBuilds({ silentRender = false } = {}) {
        const grid = document.getElementById('benchCardsGrid');
        if (grid && !silentRender) {
            grid.innerHTML = `
                <div class="col-span-full text-center py-16">
                    <i class="fas fa-spinner fa-spin text-3xl text-primary mb-3"></i>
                    <p class="text-text-muted text-sm">Loading test builds...</p>
                </div>`;
        }

        try {
            const result = await serverAPI.listSandboxConfigs(100, 0, { silent: true });
            this.builds = (result.success && result.data && result.data.configurations)
                ? result.data.configurations
                : [];
            this.filteredBuilds = [...this.builds];
            if (!silentRender) this.renderBuilds();
        } catch (error) {
            console.error('CompatibilityBench: failed to load test builds', error);
            this.builds = [];
            this.filteredBuilds = [];
            if (!silentRender) {
                this.renderBuilds();
                this.showAlert(error.message || 'Failed to load test builds', 'error');
            }
        }
    }

    filterBuilds(term) {
        const q = (term || '').trim().toLowerCase();
        this.filteredBuilds = q
            ? this.builds.filter(b =>
                (b.server_name || '').toLowerCase().includes(q) ||
                (b.description || '').toLowerCase().includes(q))
            : [...this.builds];
        this.renderBuilds();
    }

    renderBuilds() {
        const grid = document.getElementById('benchCardsGrid');
        if (!grid) return;

        if (this.filteredBuilds.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full text-center py-16">
                    <div class="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                        <i class="fas fa-flask text-2xl text-primary"></i>
                    </div>
                    <h3 class="text-lg font-semibold text-text-primary mb-1">No test builds yet</h3>
                    <p class="text-sm text-text-muted mb-5 max-w-md mx-auto">
                        Create one to try parts against each other. Nothing you add here is
                        reserved, and no component changes status.
                    </p>
                    <button class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-600 transition-colors inline-flex items-center gap-2"
                            onclick="compatibilityBench.showCreateModal()">
                        <i class="fas fa-plus"></i> New Test Build
                    </button>
                </div>`;
            return;
        }

        grid.innerHTML = this.filteredBuilds.map(build => {
            const name = build.server_name || 'Unnamed Test Build';
            const safeName = utils.escapeHtml(name);
            const jsName = safeName.replace(/'/g, "\\'");
            const results = BenchResults.get(build.config_uuid);
            const failed = results.filter(r => !r.compatible).length;

            return `
            <div class="bg-surface-card border border-border rounded-xl overflow-hidden flex flex-col group transition-colors hover:border-primary-light">
                <div class="p-5 pb-4">
                    <div class="flex items-start gap-3">
                        <div class="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                            <i class="fas fa-flask text-primary text-sm"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <h3 class="text-base font-semibold text-text-primary truncate leading-snug group-hover:text-primary transition-colors" title="${safeName}">
                                ${safeName}
                            </h3>
                            <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5">
                                <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                                    <i class="fas fa-shield-halved text-[10px]"></i> Reserves nothing
                                </span>
                                ${failed > 0 ? `
                                <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-danger-light text-danger font-medium">
                                    <i class="fas fa-circle-xmark text-[10px]"></i> ${failed} incompatible
                                </span>` : ''}
                            </div>
                        </div>
                        <div class="flex items-center gap-1 flex-shrink-0">
                            <button class="w-8 h-8 rounded-lg text-text-muted flex items-center justify-center transition-colors hover:bg-danger-light hover:text-danger"
                                    onclick="event.stopPropagation(); compatibilityBench.deleteBuild('${build.config_uuid}', '${jsName}')"
                                    title="Delete test build" aria-label="Delete test build">
                                <i class="fas fa-trash text-xs"></i>
                            </button>
                        </div>
                    </div>
                    ${build.description ? `<p class="text-sm text-text-secondary mt-3 line-clamp-2 leading-relaxed">${utils.escapeHtml(build.description)}</p>` : ''}
                </div>

                <div class="mx-5 flex items-center justify-between px-4 py-3 bg-surface-secondary border border-border-light rounded-lg">
                    <span class="inline-flex items-center gap-2 text-xs font-medium text-text-secondary uppercase tracking-wider">
                        <i class="fas fa-microchip text-primary"></i>Components
                    </span>
                    <span class="text-xl font-bold text-text-primary tabular-nums">${build.total_component_types || 0}</span>
                </div>

                <div class="px-5 py-4 flex-1">
                    <div class="divide-y divide-border-light">
                        <div class="flex justify-between items-center gap-3 py-1.5 text-sm">
                            <span class="text-text-muted">Parts tested</span>
                            <span class="text-text-primary font-medium tabular-nums">${results.length}</span>
                        </div>
                        <div class="flex justify-between items-center gap-3 py-1.5 text-sm">
                            <span class="text-text-muted">Created</span>
                            <span class="text-text-primary font-medium tabular-nums">${utils.formatDate(build.created_at)}</span>
                        </div>
                    </div>
                </div>

                <div class="px-5 pb-5 mt-auto">
                    <button class="w-full px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors font-medium text-sm flex items-center justify-center gap-2"
                            onclick="event.stopPropagation(); compatibilityBench.openBuild('${build.config_uuid}', '${jsName}')"
                            title="Open this test build">
                        <i class="fas fa-flask text-xs"></i> Open Bench
                    </button>
                </div>
            </div>`;
        }).join('');
    }

    // ------------------------------------------------------------ create/delete

    showCreateModal() {
        const content = `
            <form id="createBenchForm" class="space-y-5">
                <div class="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <i class="fas fa-circle-info text-primary mt-0.5"></i>
                    <p class="text-sm text-text-secondary leading-relaxed">
                        A test build never reserves hardware. You can add parts that are already
                        in use in other servers, and nothing you add changes a component's status.
                    </p>
                </div>
                <div>
                    <label for="benchName" class="block text-sm font-medium text-text-primary mb-1.5">
                        Test build name <span class="text-danger">*</span>
                    </label>
                    <input type="text" id="benchName" required maxlength="150"
                        placeholder="e.g. DL360 Gen10 socket tests"
                        class="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-surface-card text-text-primary">
                </div>
                <div>
                    <label for="benchDescription" class="block text-sm font-medium text-text-primary mb-1.5">
                        Description
                    </label>
                    <textarea id="benchDescription" rows="3" maxlength="500"
                        placeholder="What are you testing?"
                        class="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-surface-card text-text-primary"></textarea>
                </div>
                <div class="flex items-center justify-end gap-3 pt-2 border-t border-border-light">
                    <button type="button" class="px-5 py-2.5 bg-surface-hover text-text-secondary rounded-lg font-medium hover:bg-border transition-colors flex items-center gap-2"
                            onclick="compatibilityBench.closeModal()">
                        <i class="fas fa-times text-sm"></i> Cancel
                    </button>
                    <button type="submit" class="px-5 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-600 transition-colors flex items-center gap-2">
                        <i class="fas fa-flask text-sm"></i> Create Test Build
                    </button>
                </div>
            </form>`;

        this.showModal('New Test Build', content);

        document.getElementById('createBenchForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('benchName').value.trim();
            const description = document.getElementById('benchDescription').value.trim();

            if (!name) {
                this.showAlert('Please enter a name for the test build', 'warning');
                return;
            }

            try {
                this.showLoading(true, 'Creating test build...');
                // isVirtual=true AND isSandbox=true. The backend forces is_virtual for a
                // sandbox anyway; passing both keeps the intent readable at the call site.
                const result = await serverAPI.createServerConfig(name, description, null, true, {}, true);

                if (result.success && result.data?.config_uuid) {
                    this.closeModal();
                    this.showAlert('Test build created', 'success');
                    await this.loadBuilds({ silentRender: true });
                    await this.openBuild(result.data.config_uuid, name);
                } else {
                    this.showAlert(result.message || 'Failed to create test build', 'error');
                }
            } catch (error) {
                console.error('CompatibilityBench: create failed', error);
                this.showAlert(error.message || 'Failed to create test build', 'error');
            } finally {
                this.showLoading(false);
            }
        });
    }

    async deleteBuild(configUuid, name) {
        if (!confirm(`Delete test build "${name}"?\n\nIt holds no hardware, so nothing is released.`)) {
            return;
        }

        try {
            this.showLoading(true, 'Deleting test build...');
            const result = await serverAPI.deleteServerConfig(configUuid, { silent: true });

            if (result.success) {
                BenchResults.clear(configUuid);
                this.showAlert('Test build deleted', 'success');
                await this.loadBuilds();
            } else {
                this.showAlert(result.message || 'Failed to delete test build', 'error');
            }
        } catch (error) {
            console.error('CompatibilityBench: delete failed', error);
            this.showAlert(error.message || 'Failed to delete test build', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // -------------------------------------------------------------- bench view

    async openBuild(configUuid, name) {
        this.currentBuild = { uuid: configUuid, name };

        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
        document.getElementById('serverBuilderView')?.classList.add('active');

        const title = document.getElementById('serverBuilderTitle');
        if (title) {
            title.innerHTML = `<i class="fas fa-flask"></i> ${utils.escapeHtml(name || 'Test Build')}`;
        }

        if (!window.serverBuilder) {
            this.showAlert('Server builder is not available — please refresh the page', 'error');
            return;
        }

        try {
            window.serverBuilder.currentConfig = null;
            await window.serverBuilder.loadExistingConfig(configUuid);
        } catch (error) {
            console.error('CompatibilityBench: failed to open bench', error);
            this.showAlert('Failed to open the test build: ' + error.message, 'error');
        }
    }

    showListView() {
        this.currentBuild = null;
        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
        document.getElementById('benchListView')?.classList.add('active');

        // The URL still carries ?view=serverBuilder when we arrived back from the
        // picker; clear it so a reload lands on the list rather than reopening.
        if (window.location.search) {
            window.history.replaceState({}, '', window.location.pathname);
        }

        this.loadBuilds();
    }

    /**
     * The tested-parts log, rendered under the builder by server-builder.js.
     * Returns '' when there is nothing to show so the builder can concatenate blindly.
     */
    static renderResultsPanel(configUuid) {
        const results = BenchResults.get(configUuid);
        if (results.length === 0) {
            return `
            <div class="bg-surface-card rounded-lg border border-border-light overflow-hidden mb-6">
                <div class="px-5 py-4 border-b border-border-light">
                    <h3 class="text-sm font-semibold text-text-primary flex items-center gap-2">
                        <i class="fas fa-clipboard-check text-primary"></i> Tested parts
                    </h3>
                </div>
                <div class="px-5 py-8 text-center">
                    <p class="text-sm text-text-muted">
                        Nothing tested yet. Add a component above — compatible parts join the build,
                        incompatible ones are listed here with the reason.
                    </p>
                </div>
            </div>`;
        }

        const failed = results.filter(r => !r.compatible).length;
        const passed = results.length - failed;

        const rows = results.map((r, i) => `
            <div class="flex items-start gap-3 px-5 py-3 border-b border-border-light last:border-b-0">
                <div class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${r.compatible ? 'bg-success-light text-success' : 'bg-danger-light text-danger'}">
                    <i class="fas ${r.compatible ? 'fa-check' : 'fa-xmark'} text-[10px]"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap items-baseline gap-x-2">
                        <span class="text-xs font-mono uppercase tracking-wider text-text-muted">${utils.escapeHtml(r.type)}</span>
                        <span class="text-sm font-medium text-text-primary break-words">${utils.escapeHtml(r.name)}</span>
                    </div>
                    ${r.reason ? `<p class="text-xs mt-1 leading-relaxed ${r.compatible ? 'text-text-muted' : 'text-danger'}">${utils.escapeHtml(r.reason)}</p>` : ''}
                </div>
                <button class="w-7 h-7 rounded-lg text-text-muted flex items-center justify-center transition-colors hover:bg-surface-hover hover:text-text-primary flex-shrink-0"
                        onclick="compatibilityBench.removeResult('${configUuid}', ${i})"
                        title="Remove from list" aria-label="Remove this result">
                    <i class="fas fa-times text-xs"></i>
                </button>
            </div>`).join('');

        return `
        <div class="bg-surface-card rounded-lg border border-border-light overflow-hidden mb-6">
            <div class="px-5 py-4 border-b border-border-light flex flex-wrap items-center justify-between gap-3">
                <h3 class="text-sm font-semibold text-text-primary flex items-center gap-2">
                    <i class="fas fa-clipboard-check text-primary"></i> Tested parts
                    <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-success-light text-success font-medium">${passed} compatible</span>
                    ${failed > 0 ? `<span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-danger-light text-danger font-medium">${failed} incompatible</span>` : ''}
                </h3>
                <button class="text-xs px-3 py-1.5 rounded-lg bg-surface-hover text-text-secondary hover:bg-border transition-colors flex items-center gap-1.5"
                        onclick="compatibilityBench.clearResults('${configUuid}')">
                    <i class="fas fa-eraser text-[10px]"></i> Clear list
                </button>
            </div>
            ${rows}
        </div>`;
    }

    clearResults(configUuid) {
        BenchResults.clear(configUuid);
        if (window.serverBuilder?.currentConfig) {
            window.serverBuilder.renderServerBuilderInterface();
        }
    }

    removeResult(configUuid, index) {
        BenchResults.removeAt(configUuid, index);
        if (window.serverBuilder?.currentConfig) {
            window.serverBuilder.renderServerBuilderInterface();
        }
    }

    // ------------------------------------------------------------------ chrome

    showModal(title, content) {
        const modal = document.getElementById('modalContainer');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        if (!modal || !modalTitle || !modalBody) return;

        modalTitle.textContent = title;
        modalBody.innerHTML = content;
        modal.style.display = 'flex';
        modal.classList.add('active');
        modal.classList.remove('hidden');

        const firstInput = modalBody.querySelector('input, select, textarea, button');
        if (firstInput) setTimeout(() => firstInput.focus(), 100);

        // Replace the close button to drop any listener a previous modal attached.
        const closeButton = document.getElementById('modalClose');
        if (closeButton) {
            const fresh = closeButton.cloneNode(true);
            closeButton.parentNode.replaceChild(fresh, closeButton);
            fresh.addEventListener('click', () => this.closeModal());
        }
    }

    closeModal() {
        const modal = document.getElementById('modalContainer');
        if (!modal) return;
        modal.classList.remove('active');
        modal.classList.add('hidden');
        modal.style.display = '';
    }

    showLoading(show, message = 'Loading...') {
        if (typeof utils !== 'undefined' && utils.showLoading) {
            utils.showLoading(show, message);
        }
    }

    showAlert(message, type = 'info') {
        if (typeof toast !== 'undefined') {
            const fn = toast[type] || toast.info;
            fn.call(toast, message);
        } else if (typeof utils !== 'undefined' && utils.showAlert) {
            utils.showAlert(message, type);
        }
    }
}

// The class itself is exposed because server-builder.js calls the STATIC
// renderResultsPanel() — it needs no instance and must work before one exists.
window.CompatibilityBench = CompatibilityBench;

// Only run the page controller on the bench page. configuration.js loads this file
// purely for BenchResults, and must not get a second page controller.
if (document.getElementById('benchListView')) {
    window.compatibilityBench = new CompatibilityBench();
}
