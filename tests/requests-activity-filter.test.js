/**
 * requests-activity-filter.test.js
 *
 * Covers the Activity filter on the request detail panel in
 * assets/js/requests/requests.js: historyMatches() and renderHistoryBlock().
 *
 * Loads the REAL class out of the file — same reason as
 * requests-failure-banner.test.js: requests.js has no build step, so a method
 * that disappears or changes shape has to fail somewhere.
 *
 * Not uploaded to production (tests/ is excluded from the FTP sync).
 *
 * Run:  node IMS-Frontend/tests/requests-activity-filter.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'assets', 'js', 'requests', 'requests.js');

const sandbox = {
    window: {},
    document: {
        addEventListener() {},
        // renderHistoryList() looks for #plHistoryList; without a DOM it must
        // bail out rather than throw. Returning null exercises that path.
        getElementById() { return null; },
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

// Shaped as TicketHistoryService::getTicketHistorySimplified() returns it.
const HISTORY = [
    { action: 'pipeline_completed', changed_by: 'admin', notes: 'All stages completed', created_at: '2026-08-26 09:00:00' },
    { action: 'stage_completed', changed_by: 'tech1', notes: "Completed stage 'Install'", created_at: '2026-08-25 17:30:00' },
    { action: 'stage_claimed', changed_by: 'tech1', notes: "Claimed stage 'Install'", created_at: '2026-08-25 11:05:00' },
    { action: 'stage_activated', new_value: 'Install', created_at: '2026-08-24 08:00:00' },
    { action: 'pipeline_created', changed_by: 'admin', notes: "Pipeline started from type 'RAM upgrade'", created_at: '2026-08-24 07:59:00' }
];

const setFilter = (f) => { mgr.historyFilter = Object.assign({ q: '', action: '', user: '', from: '', to: '' }, f); };
const matched = () => HISTORY.filter((h) => mgr.historyMatches(h));

console.log('historyMatches()');

setFilter({});
check('empty filter -> everything', matched().length === HISTORY.length);

setFilter({ action: 'stage_claimed' });
check('event type', matched().length === 1 && matched()[0].action === 'stage_claimed');

setFilter({ user: 'tech1' });
check('user', matched().length === 2);

// changed_by is absent on rows the engine wrote; the bar offers those as
// 'system' and the filter has to agree.
setFilter({ user: 'system' });
check('system rows (no changed_by)', matched().length === 1 && matched()[0].action === 'stage_activated');

setFilter({ q: 'install' });
// 'Install' is in two notes and in one row's new_value — the search covers both.
check('search hits notes and values, case-insensitively', matched().length === 3);

setFilter({ q: 'stage claimed' });
check('search matches an action with spaces for underscores', matched().length === 1);

setFilter({ q: 'nothing here' });
check('search with no hits -> empty', matched().length === 0);

setFilter({ from: '2026-08-25' });
check('from date is inclusive', matched().length === 3);

setFilter({ to: '2026-08-24' });
check('to date is inclusive of the whole day', matched().length === 2);

setFilter({ from: '2026-08-25', to: '2026-08-25' });
check('single-day range', matched().length === 2);

setFilter({ user: 'tech1', action: 'stage_completed' });
check('filters combine (AND)', matched().length === 1);

setFilter({ from: '2026-08-25' });
check('missing created_at does not throw', mgr.historyMatches({ action: 'x' }) === false);

console.log('\nrenderHistoryBlock()');

setFilter({});
check('no history -> nothing rendered', mgr.renderHistoryBlock({ history: [] }) === '');

const block = mgr.renderHistoryBlock({ history: HISTORY });
check('renders the list container', block.includes('id="plHistoryList"'));
check('renders the filter bar', block.includes('id="plHistorySearch"') && block.includes('id="plHistoryAction"'));
check('one option per distinct event', (block.match(/<option/g) || []).length === 5 + 3 + 2); // actions+all, users+anyone
check('offers system as a user', block.includes('>system<'));

const single = mgr.renderHistoryBlock({ history: [HISTORY[0]] });
check('single entry -> list but no filter bar', single.includes('plHistoryList') && !single.includes('plHistorySearch'));

setFilter({ action: 'stage_claimed', q: 'install' });
const kept = mgr.renderHistoryBlock({ history: HISTORY });
check('re-render keeps the chosen event type selected', kept.includes('value="stage_claimed" selected'));
check('re-render keeps the search text', kept.includes('value="install"'));

// renderDetail() calls this after painting the panel; with no DOM it must be
// a no-op rather than a crash.
setFilter({});
mgr.currentDetail = { history: HISTORY };
let threw = false;
try { mgr.renderHistoryList(); } catch (e) { threw = true; }
check('renderHistoryList() without the container -> no throw', !threw);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
