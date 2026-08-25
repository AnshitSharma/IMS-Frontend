/**
 * requests-failure-banner.test.js
 *
 * Covers the rolled-back-approval banner in assets/js/requests/requests.js:
 * latestExecutionFailure() and executionFailureBanner().
 *
 * WHY THIS FILE EXISTS
 * requests.js is ~110 KB with no build step and no other automated check, and
 * tasks/todo.md records an edit to it that silently deleted a whole section
 * while still parsing. `node --check` cannot catch that. These tests load the
 * REAL class out of the file — they do not reimplement it — so a method that
 * disappears or changes shape fails here.
 *
 * Not uploaded to production (tests/ is excluded from the FTP sync).
 *
 * Run:  node IMS-Frontend/tests/requests-failure-banner.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'assets', 'js', 'requests', 'requests.js');

// esc() escapes by round-tripping textContent -> innerHTML. Stub just enough of
// an element for that, matching what a browser actually produces.
const sandbox = {
    window: {},
    document: {
        addEventListener() {},
        createElement() {
            return {
                _t: '',
                set textContent(v) { this._t = String(v); },
                get textContent() { return this._t; },
                get innerHTML() {
                    return this._t
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
                }
            };
        }
    },
    console
};
vm.createContext(sandbox);

// A top-level `class` does not land on the context's global object, so make the
// evaluated program's completion value be the class itself.
const RequestsManager = vm.runInContext(
    fs.readFileSync(SRC, 'utf8') + '\n;RequestsManager;',
    sandbox
);

const mgr = new RequestsManager();

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

// Shaped as PipelineManager::recordExecutionFailure() writes it, and as
// TicketHistoryService::getTicketHistorySimplified() returns it: newest first.
const FAILED = {
    action: 'execution_failed',
    new_value: JSON.stringify({
        position: 1,
        action_type: 'server.component.add',
        error_code: 'COMPAT_SOCKET_MISMATCH',
        message: 'CPU socket LGA4189 does not match motherboard socket SP3'
    }),
    notes: 'Approval rolled back — nothing was changed. Action 1 failed: ...',
    created_at: '2026-08-24 14:02:00'
};
const EXECUTED = {
    action: 'actions_executed',
    new_value: '1',
    notes: 'Performed on approval',
    created_at: '2026-08-24 14:10:00'
};
const NOISE = { action: 'stage_activated', new_value: 'Admin Approval', created_at: '2026-08-24 13:55:00' };

console.log('latestExecutionFailure()');

mgr.currentDetail = null;
check('no request loaded -> null', mgr.latestExecutionFailure() === null);

mgr.currentDetail = { history: [] };
check('empty history -> null', mgr.latestExecutionFailure() === null);

mgr.currentDetail = { history: [NOISE] };
check('no execution events -> null', mgr.latestExecutionFailure() === null);

mgr.currentDetail = { history: [FAILED, NOISE] };
const f = mgr.latestExecutionFailure();
check('failure present -> parsed detail', !!f && f.error_code === 'COMPAT_SOCKET_MISMATCH', JSON.stringify(f));
check('failure keeps structured message', !!f && f.message.includes('LGA4189'));
check('failure keeps position', !!f && f.position === 1);

// The reason this reads the LATEST event rather than "any failure": a retry
// that worked must not leave a red banner over a request that succeeded.
mgr.currentDetail = { history: [EXECUTED, FAILED, NOISE] };
check('failure then success -> null (superseded)', mgr.latestExecutionFailure() === null);

mgr.currentDetail = { history: [FAILED, EXECUTED, NOISE] };
check('success then failure -> shows', mgr.latestExecutionFailure() !== null);

mgr.currentDetail = { history: [{ action: 'execution_failed', new_value: '{not json', notes: 'fallback text' }] };
const bad = mgr.latestExecutionFailure();
check('unparseable new_value -> falls back to notes', !!bad && bad.message === 'fallback text', JSON.stringify(bad));

mgr.currentDetail = { history: [{ action: 'execution_failed' }] };
check('no new_value and no notes -> no throw', mgr.latestExecutionFailure() !== null);

console.log('\nexecutionFailureBanner()');

mgr.currentDetail = { history: [FAILED] };
const html = mgr.executionFailureBanner();
check('renders the banner', html.includes('Approval was rolled back'));
check('names the action', html.includes('server.component.add'));
check('shows the error code', html.includes('COMPAT_SOCKET_MISMATCH'));
check('shows the engine message', html.includes('LGA4189'));
check('tells the approver to retry', html.includes('approve again'));

mgr.currentDetail = { history: [EXECUTED, FAILED] };
check('superseded -> empty string', mgr.executionFailureBanner() === '');

// The engine's message reaches the DOM as HTML.
mgr.currentDetail = { history: [{ action: 'execution_failed', new_value: JSON.stringify({ message: '<img src=x onerror=alert(1)>' }) }] };
check('escapes the message', !mgr.executionFailureBanner().includes('<img src=x'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
