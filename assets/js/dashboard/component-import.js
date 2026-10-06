/**
 * Excel import for the inventory list (component.html), 2026-10-07.
 * Plan: tasks/inventory-filters-import.md.
 *
 * ONE RULE: nothing is written until the whole file passes. Every row is
 * checked twice before the first unit is added -- here, against the model,
 * site and vendor lists, and then on the server with {type}-bulk-add
 * dry_run=1, which runs each unit through the same validation a real add
 * uses (prepareComponentInsert) plus the serial-already-registered lookup.
 * Any problem lists every problem by row and column and imports nothing.
 *
 * The import itself is the ordinary bulk add, 100 units a call under
 * idempotency keys, read through api.components.bulkAddChunk() -- the same
 * reader the Add drawer's bulk add uses. A dropped connection keeps the
 * unanswered chunk's key, so Retry finishes without adding anything twice.
 *
 * Loaded on demand by dashboard.showImportDrawer(). ExcelJS (MIT, served
 * from assets/lib because the CSP allows scripts from 'self' only) is loaded
 * on demand here, so neither costs anything on page load.
 */

const IMPORT_MAX_UNITS = 1000;
const IMPORT_MAX_QUANTITY = 500;
const IMPORT_CHUNK = 100;
const IMPORT_TEMPLATE_ROWS = 1000;
const IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const IMPORT_EXAMPLE_NOTE = 'Example row from the sample file. Delete this row before importing.';
// Same list as the Add form's ADD_FORM_SERIAL_REQUIRED_TYPES.
const IMPORT_SERIAL_REQUIRED = ['storage', 'sfp'];
const IMPORT_FLAGS = ['Backup', 'Critical', 'Maintenance', 'Testing', 'Production'];
const IMPORT_STATUSES = ['Available', 'Failed'];
const IMPORT_SHOWN_PROBLEMS = 200;

/**
 * The Import sheet's columns, in order. Files are matched by heading, not by
 * position, so a moved column still imports; `aliases` accept the headings a
 * spreadsheet someone already keeps is likely to use.
 */
const IMPORT_COLUMNS = [
    { key: 'model', header: 'Model', width: 48, aliases: ['model name', 'uuid', 'model uuid', 'spec uuid'] },
    { key: 'quantity', header: 'Quantity', width: 11, aliases: ['qty', 'units', 'count'] },
    { key: 'serial', header: 'Serial number', width: 24, aliases: ['serial', 'serial no', 'serial no.', 'serialnumber', 'sn'] },
    { key: 'status', header: 'Status', width: 13 },
    { key: 'site', header: 'Site', width: 28, aliases: ['location'] },
    { key: 'shelf', header: 'Shelf / bin', width: 18, aliases: ['shelf/bin', 'shelf', 'bin', 'store location', 'storelocation'] },
    { key: 'vendor', header: 'Vendor', width: 24 },
    { key: 'purchased', header: 'Purchased', width: 15, date: true, aliases: ['purchase date', 'purchasedate', 'purchased on'] },
    { key: 'warranty', header: 'Warranty ends', width: 15, date: true, aliases: ['warranty end', 'warranty end date', 'warrantyenddate', 'warranty'] },
    { key: 'installed', header: 'Installed on', width: 15, date: true, aliases: ['installed', 'installation date', 'installationdate'] },
    { key: 'failed', header: 'Failed on', width: 15, date: true, aliases: ['failed', 'fail date', 'faildate'] },
    { key: 'flag', header: 'Flag', width: 14 },
    { key: 'notes', header: 'Notes', width: 44 }
];

/** A cell's value as text, whatever ExcelJS hands back for it. */
function importCellText(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return isNaN(value) ? '' : value.toISOString().slice(0, 10);
    if (typeof value === 'object') {
        if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('');
        if ('result' in value) return importCellText(value.result);
        if ('text' in value) return String(value.text ?? '');
        if ('error' in value) return String(value.error);
        return '';
    }
    return String(value);
}

function importHeaderKey(text) {
    return String(text || '').toLowerCase().replace(/\*/g, '').replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * A date cell as YYYY-MM-DD. Accepts a real Excel date, an Excel serial
 * number, YYYY-MM-DD, and DD-MM-YYYY / DD/MM/YYYY (the day-first order used
 * here). Returns { iso: null } for blank, { error: true } for anything else.
 */
function importParseDate(value) {
    if (value && typeof value === 'object' && !(value instanceof Date) && 'result' in value) value = value.result;
    if (value === null || value === undefined || value === '') return { iso: null };

    const ymd = (y, m, d) => {
        const date = new Date(Date.UTC(y, m - 1, d));
        if (y < 1980 || y > 2100 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
            return { error: true };
        }
        return { iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
    };

    if (value instanceof Date) {
        if (isNaN(value)) return { error: true };
        return ymd(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || value < 1) return { error: true };
        const date = new Date(Math.round((value - 25569) * 86400000));
        return ymd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    }

    const text = importCellText(value).trim();
    if (!text) return { iso: null };
    let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return ymd(+m[1], +m[2], +m[3]);
    m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) return ymd(+m[3], +m[2], +m[1]);
    return { error: true };
}

class ComponentImport {
    constructor(dashboard, type) {
        this.dashboard = dashboard;
        this.type = type;
        this.plural = utils.componentLabels?.[type] || type;
        this.singular = utils.componentLabelsSingular?.[type] || type;
        this.serialRequired = IMPORT_SERIAL_REQUIRED.includes(type);
        this.ref = null;
        this.refError = null;
        this.state = 'idle';
        this.file = null;
        this.fileError = null;
        this.check = null;
        this.progress = null;
        this.plan = null;
        this.added = [];
        this.failed = [];
    }

    /** Load ExcelJS once per page. */
    static loadExcel() {
        if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
        if (!ComponentImport.excelPromise) {
            ComponentImport.excelPromise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = '../../assets/lib/exceljs.min.js';
                script.onload = () => (window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('The Excel reader did not load')));
                script.onerror = () => {
                    ComponentImport.excelPromise = null;
                    reject(new Error('The Excel reader could not be loaded. Check your connection and try again.'));
                };
                document.head.appendChild(script);
            });
        }
        return ComponentImport.excelPromise;
    }

    static async saveWorkbook(workbook, fileName) {
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ------------------------------------------------------------------ drawer

    async open() {
        this.dashboard.openDrawer(this.markup(), `Import ${this.plural}`);
        this.root = document.querySelector('.cd-root .cd-import');
        // Closing with a checked file, a check or an import under way asks first.
        this.dashboard._drawerGuard = () => (['reading', 'checking', 'ready', 'invalid', 'importing', 'unknown'].includes(this.state) ? 1 : 0);
        this.bind();
        this.render();

        this.refReady = this.loadReference().catch(error => {
            this.refError = error.message || 'The model list could not be loaded.';
        });
        await this.refReady;
        this.render();
        // Warm the reader while the person finds their file.
        ComponentImport.loadExcel().catch(() => {});
    }

    markup() {
        const esc = utils.escapeHtml;
        return `
            <div class="cd cd-import">
                <div class="cd-head">
                    <div class="cd-head-text">
                        <span class="cd-eyebrow">Import from Excel</span>
                        <h2>Import ${esc(this.plural)}</h2>
                    </div>
                    <button type="button" class="cd-close" data-drawer-close aria-label="Close">
                        <i class="fas fa-times" aria-hidden="true"></i>
                    </button>
                </div>
                <div class="cd-body">
                    <div class="cd-section">
                        <span class="cd-section-title">Start from the sample file</span>
                        <p class="cd-hint">It has every ${esc(this.singular)} model, your sites and vendors as pick-lists, so each value matches what the system expects. Use one row per unit, or one row with a quantity for identical units without serial numbers.</p>
                        <div><button type="button" class="cd-btn" data-imp="sample"><i class="fas fa-file-download" aria-hidden="true"></i> Download sample file</button></div>
                    </div>
                    <div class="cd-section">
                        <span class="cd-section-title">Your file</span>
                        <div data-imp-slot="file"></div>
                    </div>
                    <div data-imp-slot="status" role="status"></div>
                </div>
                <div class="cd-foot">
                    <button type="button" class="cd-btn" data-imp="cancel" data-drawer-close>Cancel</button>
                    <button type="button" class="cd-btn cd-btn-primary" data-imp="go" disabled>Import</button>
                </div>
            </div>`;
    }

    bind() {
        const root = this.root;
        root.addEventListener('click', (e) => {
            const action = e.target.closest('[data-imp]')?.dataset.imp;
            if (action === 'sample') this.downloadSample();
            else if (action === 'another') this.resetFile();
            else if (action === 'go') this.primaryAction();
            else if (action === 'recheck') this.runServerCheck();
            else if (action === 'retry') this.runImport();
            else if (action === 'results') this.downloadResults();
        });
        root.addEventListener('change', (e) => {
            if (!e.target.matches('input[type="file"]')) return;
            const file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (file) this.acceptFile(file);
        });
        // A file dropped anywhere in the drawer must not make the browser
        // navigate away to it; only the drop zone accepts it.
        root.addEventListener('dragover', (e) => {
            e.preventDefault();
            root.querySelector('.cd-drop')?.classList.toggle('is-over', !!e.target.closest('.cd-drop'));
        });
        root.addEventListener('dragleave', (e) => {
            if (!e.relatedTarget || !root.contains(e.relatedTarget)) root.querySelector('.cd-drop')?.classList.remove('is-over');
        });
        root.addEventListener('drop', (e) => {
            e.preventDefault();
            const zone = e.target.closest('.cd-drop');
            zone?.classList.remove('is-over');
            const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (zone && file) this.acceptFile(file);
        });
    }

    resetFile() {
        if (['reading', 'checking', 'importing'].includes(this.state)) return;
        this.state = 'idle';
        this.file = null;
        this.fileError = null;
        this.check = null;
        this.render();
        this.root.querySelector('.cd-drop input')?.focus();
    }

    primaryAction() {
        if (this.state === 'ready') this.runImport();
        else if (this.state === 'done') this.dashboard.closeDrawer();
    }

    unitsLabel(n) {
        return `${Number(n).toLocaleString()} ${n === 1 ? 'unit' : 'units'}`;
    }

    // --------------------------------------------------------------- reference

    async loadReference() {
        const canSeeVendors = !!api.utils?.hasPermission?.('vendor.view');
        const [models, locations, vendors] = await Promise.all([
            api.components.models(this.type),
            api.locations.list(),
            canSeeVendors ? api.vendors.list().catch(() => null) : Promise.resolve(null)
        ]);
        this.setReference({
            models: models?.data?.models || [],
            sites: (locations?.data?.locations || []).map(l => ({ uuid: l.location_uuid, name: l.name })),
            vendors: vendors?.data?.vendors ? vendors.data.vendors.map(v => ({ id: String(v.id), name: v.name })) : null
        });
    }

    /** Lookups by every spelling the file may use. Split out so a test can feed it. */
    setReference(ref) {
        this.ref = ref;
        const lower = s => String(s || '').trim().toLowerCase();

        this.modelByKey = new Map();
        const nameCount = new Map();
        ref.models.forEach(m => nameCount.set(lower(m.name), (nameCount.get(lower(m.name)) || 0) + 1));
        ref.models.forEach(m => {
            this.modelByKey.set(lower(m.label), m);
            this.modelByKey.set(lower(m.uuid), m);
        });
        // The plain list name works too, but only where it names one model.
        ref.models.forEach(m => {
            if (nameCount.get(lower(m.name)) === 1 && !this.modelByKey.has(lower(m.name))) this.modelByKey.set(lower(m.name), m);
        });

        this.siteByKey = new Map();
        ref.sites.forEach(s => {
            this.siteByKey.set(lower(s.name), s);
            this.siteByKey.set(lower(s.uuid), s);
        });

        this.vendorByKey = new Map();
        (ref.vendors || []).forEach(v => this.vendorByKey.set(lower(v.name), v));
    }

    // ------------------------------------------------------------------ sample

    async downloadSample() {
        if (!this.ref) {
            toast.warning('The model list is still loading. Try again in a moment.');
            return;
        }
        const button = this.root.querySelector('[data-imp="sample"]');
        try {
            if (button) button.disabled = true;
            const ExcelJS = await ComponentImport.loadExcel();
            const workbook = this.buildSampleWorkbook(ExcelJS);
            await ComponentImport.saveWorkbook(workbook, `${this.type}-import-template.xlsx`);
        } catch (error) {
            console.error('Sample file failed:', error);
            toast.error(error.message || 'The sample file could not be made');
        } finally {
            if (button) button.disabled = false;
        }
    }

    sampleColumns() {
        // Without vendor.view there is no list to pick from, so no column.
        return IMPORT_COLUMNS.filter(c => c.key !== 'vendor' || this.ref.vendors);
    }

    isRequired(key) {
        return key === 'model' || key === 'site' || (key === 'serial' && this.serialRequired);
    }

    buildSampleWorkbook(ExcelJS) {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'BDC Inventory';
        workbook.created = new Date();

        const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F2F1' } };
        const styleHeader = (row) => {
            row.font = { bold: true };
            row.eachCell(cell => {
                cell.fill = headerFill;
                cell.border = { bottom: { style: 'thin', color: { argb: 'FF9FC9C4' } } };
                cell.alignment = { vertical: 'middle' };
            });
            row.height = 20;
        };

        const columns = this.sampleColumns();
        const sheet = workbook.addWorksheet('Import', { views: [{ state: 'frozen', ySplit: 1 }] });
        const models = workbook.addWorksheet('Models', { views: [{ state: 'frozen', ySplit: 1 }] });
        const help = workbook.addWorksheet('How to fill');
        const lists = workbook.addWorksheet('Lists', { state: 'hidden' });

        // --- Lists (hidden): what the pick-lists read.
        const listCols = {
            model: this.ref.models.map(m => m.label),
            site: this.ref.sites.map(s => s.name),
            vendor: (this.ref.vendors || []).map(v => v.name),
            status: IMPORT_STATUSES,
            flag: IMPORT_FLAGS
        };
        const listRange = {};
        Object.keys(listCols).forEach((key, i) => {
            const letter = String.fromCharCode(65 + i);
            lists.getCell(`${letter}1`).value = key;
            listCols[key].forEach((value, r) => { lists.getCell(`${letter}${r + 2}`).value = value; });
            if (listCols[key].length) listRange[key] = `Lists!$${letter}$2:$${letter}$${listCols[key].length + 1}`;
        });

        // --- Import
        sheet.columns = columns.map(c => ({
            header: c.header + (this.isRequired(c.key) ? ' *' : ''),
            key: c.key,
            width: c.width,
            style: c.date ? { numFmt: 'dd-mmm-yyyy' } : (c.key === 'serial' ? { numFmt: '@' } : {})
        }));
        styleHeader(sheet.getRow(1));

        const firstModel = this.ref.models[0]?.label || '';
        const firstSite = this.ref.sites[0]?.name || '';
        const examples = [
            { model: firstModel, quantity: 1, serial: 'EXAMPLE-SN-0001', status: 'Available', site: firstSite, shelf: 'Shelf B3',
                purchased: new Date(Date.UTC(2026, 0, 15)), warranty: new Date(Date.UTC(2029, 0, 14)), notes: IMPORT_EXAMPLE_NOTE },
            this.serialRequired
                ? { model: firstModel, quantity: 1, serial: 'EXAMPLE-SN-0002', status: 'Available', site: firstSite, notes: IMPORT_EXAMPLE_NOTE }
                : { model: firstModel, quantity: 4, serial: '', status: 'Available', site: firstSite, notes: IMPORT_EXAMPLE_NOTE }
        ];
        examples.forEach(example => {
            const row = sheet.addRow(example);
            row.font = { italic: true, color: { argb: 'FF6B7680' } };
        });

        const lastRow = IMPORT_TEMPLATE_ROWS + 1;
        const colLetter = (key) => sheet.getColumn(key).letter;
        const addList = (key, title, message, errorStyle = 'stop') => {
            if (!listRange[key] || !columns.some(c => c.key === key)) return;
            sheet.dataValidations.add(`${colLetter(key)}2:${colLetter(key)}${lastRow}`, {
                type: 'list', allowBlank: true, formulae: [listRange[key]],
                showErrorMessage: true, errorStyle, errorTitle: title, error: message
            });
        };
        // Model warns rather than stops: pasting a UUID from the Models sheet is allowed.
        addList('model', 'Pick a model', 'Pick a model from the list. The Models sheet lists them all, with their UUIDs.', 'warning');
        addList('site', 'Pick a site', 'Pick one of your sites from the list.');
        addList('vendor', 'Pick a vendor', 'Pick a vendor from the list, or leave it blank.');
        addList('status', 'Pick a status', 'Available or Failed. Leave it blank for Available.');
        addList('flag', 'Pick a flag', 'Pick a flag from the list, or leave it blank.');
        sheet.dataValidations.add(`${colLetter('quantity')}2:${colLetter('quantity')}${lastRow}`, {
            type: 'whole', operator: 'between', allowBlank: true, formulae: [1, IMPORT_MAX_QUANTITY],
            showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Quantity',
            error: `A whole number from 1 to ${IMPORT_MAX_QUANTITY}. Leave it blank for 1.`
        });

        // --- Models
        models.columns = [
            { header: 'Model', key: 'label', width: 56 },
            { header: 'Brand', key: 'brand', width: 18 },
            { header: 'Details', key: 'details', width: 40 },
            { header: 'Part number', key: 'part_number', width: 22 },
            { header: 'UUID', key: 'uuid', width: 40 }
        ];
        styleHeader(models.getRow(1));
        this.ref.models.forEach(m => models.addRow({
            label: m.label, brand: m.brand || '', details: m.details || '', part_number: m.part_number || '', uuid: m.uuid
        }));
        models.autoFilter = { from: 'A1', to: 'E1' };

        // --- How to fill
        help.columns = [{ header: 'Column', key: 'column', width: 18 }, { header: 'How to fill it', key: 'how', width: 100 }];
        styleHeader(help.getRow(1));
        const serialHelp = this.serialRequired
            ? `Required for every ${this.singular} unit. Each serial can appear only once, in this file and in inventory.`
            : 'The manufacturer\'s serial. Leave it blank if the unit has none you can read; it is then known by its asset tag. Each serial can appear only once, in this file and in inventory.';
        const helpRows = [
            ['Model', 'Required. Pick from the list. The Models sheet lists every model with its details; you can also paste a model\'s UUID from there.'],
            ['Quantity', `How many identical units this row adds. Leave it blank for 1. It must be 1 when the row has a serial number. Up to ${IMPORT_MAX_QUANTITY}.`],
            ['Serial number', serialHelp],
            ['Status', 'Available or Failed. Leave it blank for Available. "In use" comes from installing the unit in a server, so it can\'t be imported.'],
            ['Site', 'Required. Pick one of your sites from the list.'],
            ['Shelf / bin', 'Where the unit sits, for example Shelf B3. Up to 100 characters.'],
            ...(this.ref.vendors ? [['Vendor', 'Pick a vendor from the list, or leave it blank.']] : []),
            ['Purchased', 'A date. Pick it, or type it as 2026-01-15 or 15-01-2026.'],
            ['Warranty ends', 'A date. It can\'t be before Purchased or Installed on.'],
            ['Installed on', 'A date. It can\'t be before Purchased.'],
            ['Failed on', 'Required when Status is Failed. Leave it blank otherwise.'],
            ['Flag', 'Backup, Critical, Maintenance, Testing or Production, or blank.'],
            ['Notes', 'Anything worth knowing about the unit.'],
            ['', ''],
            ['One row', 'One row per unit when you know its serial number. For identical units without serials, one row with a Quantity.'],
            ['Limits', `Up to ${IMPORT_MAX_UNITS.toLocaleString()} units per file. Columns marked * are required.`],
            ['Checks', 'Nothing is imported until every row passes. If a row has a problem, the import lists it by row and column so you can fix the file and choose it again.'],
            ['Examples', 'The two grey rows on the Import sheet are examples. Delete them before importing.']
        ];
        helpRows.forEach(([column, how]) => {
            const row = help.addRow({ column, how });
            row.getCell('how').alignment = { wrapText: true, vertical: 'top' };
            row.getCell('column').font = { bold: true };
        });

        workbook.views = [{ activeTab: 0 }];
        return workbook;
    }

    // -------------------------------------------------------------- read + check

    fail(message) {
        this.state = 'file-error';
        this.fileError = message;
        this.render();
    }

    async acceptFile(file) {
        if (['reading', 'checking', 'importing'].includes(this.state) || this.state === 'done') return;
        this.file = { name: file.name, size: file.size };
        this.check = null;
        this.fileError = null;

        if (!/\.xlsx$/i.test(file.name)) {
            this.fail(`"${file.name}" is not an .xlsx file. Save it from Excel as "Excel Workbook (.xlsx)", or start from the sample file.`);
            return;
        }
        if (file.size > IMPORT_MAX_FILE_BYTES) {
            this.fail(`This file is over 10 MB. One import holds up to ${IMPORT_MAX_UNITS.toLocaleString()} units; split the file and import the parts one after another.`);
            return;
        }

        this.state = 'reading';
        this.render();
        try {
            await this.refReady;
            if (!this.ref) throw new Error(this.refError || 'The model list could not be loaded.');

            const buffer = await file.arrayBuffer();
            const sig = new Uint8Array(buffer.slice(0, 4));
            if (!(sig[0] === 0x50 && sig[1] === 0x4B && sig[2] === 0x03 && sig[3] === 0x04)) {
                this.fail(`"${file.name}" is not an Excel workbook, even though its name ends in .xlsx. Open it in Excel and save it as "Excel Workbook (.xlsx)".`);
                return;
            }

            const ExcelJS = await ComponentImport.loadExcel();
            const workbook = new ExcelJS.Workbook();
            try {
                await workbook.xlsx.load(buffer);
            } catch (error) {
                this.fail('This file could not be opened as an Excel workbook. Open it in Excel, save it as "Excel Workbook (.xlsx)" and choose it again.');
                return;
            }

            const parsed = this.parseWorkbook(workbook);
            if (parsed.fileError) {
                this.fail(parsed.fileError);
                return;
            }
            this.check = parsed;
            if (parsed.problems.length) {
                this.state = 'invalid';
                this.render();
                return;
            }
            await this.runServerCheck();
        } catch (error) {
            console.error('Import read failed:', error);
            this.fail(error.message || 'The file could not be read.');
        }
    }

    /**
     * Every row of the Import sheet, checked against the lists. Pure: no DOM,
     * no network. Returns { fileError } for a file that can't be read as an
     * import at all, otherwise { sheetName, rows, units, problems }.
     */
    parseWorkbook(workbook) {
        const sheet = workbook.getWorksheet('Import')
            || workbook.worksheets.find(ws => ws.state !== 'hidden' && !['Models', 'How to fill', 'Lists'].includes(ws.name));
        if (!sheet) return { fileError: 'This workbook has no sheet to import. Use the Import sheet of the sample file.' };

        // Headings: exact names first, then aliases, so a file with both
        // "Model" and "UUID" columns reads Model.
        const headings = [];
        sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
            const key = importHeaderKey(importCellText(cell.value));
            if (key) headings.push({ col, key });
        });
        const colOf = {};
        IMPORT_COLUMNS.forEach(c => {
            const hit = headings.find(h => h.key === importHeaderKey(c.header) && !Object.values(colOf).includes(h.col));
            if (hit) colOf[c.key] = hit.col;
        });
        IMPORT_COLUMNS.forEach(c => {
            if (colOf[c.key] || !c.aliases) return;
            const hit = headings.find(h => c.aliases.includes(h.key) && !Object.values(colOf).includes(h.col));
            if (hit) colOf[c.key] = hit.col;
        });

        const missing = IMPORT_COLUMNS.filter(c => this.isRequired(c.key) && !colOf[c.key]).map(c => `"${c.header}"`);
        if (missing.length) {
            return {
                fileError: `The sheet "${sheet.name}" has no ${missing.join(' or ')} column. Row 1 has to hold the column headings, as in the sample file.`
            };
        }

        const lower = s => String(s || '').trim().toLowerCase();
        const columnName = key => IMPORT_COLUMNS.find(c => c.key === key).header;
        const rows = [];
        const units = [];
        const problems = [];
        const serialRows = new Map();
        let unitCount = 0;

        for (let r = 2; r <= sheet.rowCount; r++) {
            const sheetRow = sheet.getRow(r);
            const raw = {};
            Object.entries(colOf).forEach(([key, col]) => { raw[key] = sheetRow.getCell(col).value; });
            const text = key => importCellText(raw[key]).trim();
            if (Object.keys(colOf).every(key => text(key) === '')) continue;

            const issues = [];
            const problem = (key, message) => issues.push({ row: r, column: columnName(key), message });

            if (text('notes') === IMPORT_EXAMPLE_NOTE) {
                problem('notes', 'This is an example row from the sample file. Delete the row before importing.');
            }

            // Model
            const model = this.modelByKey.get(lower(text('model')));
            if (!text('model')) problem('model', 'Choose the model.');
            else if (!model) problem('model', `"${text('model')}" is not a ${this.singular} model in the catalogue. Pick one from the list, or paste its UUID from the Models sheet.`);

            // Quantity
            let quantity = 1;
            const qtyRaw = raw.quantity;
            if (text('quantity') !== '') {
                const n = typeof qtyRaw === 'number' ? qtyRaw : Number(text('quantity'));
                if (!Number.isInteger(n) || n < 1 || n > IMPORT_MAX_QUANTITY) {
                    problem('quantity', `Use a whole number from 1 to ${IMPORT_MAX_QUANTITY}, or leave it blank for 1.`);
                } else {
                    quantity = n;
                }
            }

            // Serial
            const serial = text('serial');
            if (serial) {
                if (serial.length > 50) problem('serial', 'A serial number can be up to 50 characters.');
                if (quantity > 1) problem('quantity', 'Quantity must be 1 when the row has a serial number. Put each serialised unit on its own row.');
                const seenAt = serialRows.get(serial.toLowerCase());
                if (seenAt) problem('serial', `Serial "${serial}" is also on row ${seenAt}. Each serial can appear only once.`);
                else serialRows.set(serial.toLowerCase(), r);
            } else if (this.serialRequired) {
                problem('serial', `A serial number is required for every ${this.singular} unit.`);
            }

            // Status
            let status = '1';
            const statusText = lower(text('status'));
            if (statusText === '' || statusText === 'available') status = '1';
            else if (statusText === 'failed') status = '0';
            else if (['in use', 'in_use', 'inuse', 'in-use'].includes(statusText)) {
                problem('status', 'A unit is In use only once it is installed in a server. Import it as Available, then install it.');
            } else {
                problem('status', `"${text('status')}" is not a status. Use Available or Failed.`);
            }

            // Site
            const site = this.siteByKey.get(lower(text('site')));
            if (!text('site')) problem('site', 'Choose the site this unit is at.');
            else if (!site) problem('site', `"${text('site')}" is not one of your sites. Pick one from the list.`);

            // Shelf
            const shelf = text('shelf');
            if (shelf.length > 100) problem('shelf', 'Shelf / bin can be up to 100 characters.');

            // Vendor
            let vendor = null;
            if (text('vendor')) {
                if (!this.ref.vendors) problem('vendor', 'You can\'t view vendors, so this column has to be blank.');
                else {
                    vendor = this.vendorByKey.get(lower(text('vendor')));
                    if (!vendor) problem('vendor', `"${text('vendor')}" is not a vendor in the system. Pick one from the list, or leave it blank.`);
                }
            }

            // Dates
            const dates = {};
            ['purchased', 'warranty', 'installed', 'failed'].forEach(key => {
                if (!colOf[key]) { dates[key] = null; return; }
                const parsed = importParseDate(raw[key]);
                if (parsed.error) problem(key, `"${text(key)}" is not a date. Pick one, or type it as 2026-01-15.`);
                dates[key] = parsed.iso || null;
            });
            if (dates.purchased && dates.installed && dates.installed < dates.purchased) {
                problem('installed', 'Installed on can\'t be before Purchased.');
            }
            if (dates.warranty && dates.installed && dates.warranty < dates.installed) {
                problem('warranty', 'Warranty ends can\'t be before Installed on.');
            } else if (dates.warranty && dates.purchased && dates.warranty < dates.purchased) {
                problem('warranty', 'Warranty ends can\'t be before Purchased.');
            }
            if (status === '0' && !dates.failed && statusText === 'failed') problem('failed', 'Add the date the unit failed.');
            if (status === '1' && dates.failed) problem('failed', 'Failed on is only for units whose Status is Failed.');

            // Flag
            let flag = null;
            if (text('flag')) {
                flag = IMPORT_FLAGS.find(f => f.toLowerCase() === lower(text('flag'))) || null;
                if (!flag) problem('flag', `"${text('flag')}" is not a flag. Use ${IMPORT_FLAGS.join(', ')}, or leave it blank.`);
            }

            unitCount += quantity;
            if (issues.length) {
                problems.push(...issues);
                continue;
            }

            const fields = {
                UUID: model.uuid,
                Status: status,
                VendorID: vendor ? vendor.id : null,
                Location: site.name,
                location_uuid: site.uuid,
                StoreLocation: shelf || null,
                PurchaseDate: dates.purchased,
                InstallationDate: dates.installed,
                WarrantyEndDate: dates.warranty,
                FailDate: dates.failed,
                Flag: flag,
                Notes: text('notes') || null
            };
            const entry = {
                row: r,
                model: model.label,
                serial: serial || null,
                quantity,
                site: site.name,
                shelf: shelf || '',
                status: status === '1' ? 'Available' : 'Failed'
            };
            rows.push(entry);
            for (let i = 0; i < quantity; i++) {
                const payload = { ...fields, SerialNumber: serial || null };
                // Same as every other add: request() leaves nulls out, the server
                // stores absence as NULL.
                Object.keys(payload).forEach(k => { if (payload[k] === null || payload[k] === undefined || payload[k] === '') delete payload[k]; });
                units.push({ row: r, entry, payload });
            }
        }

        if (!rows.length && !problems.length) {
            return { fileError: `The sheet "${sheet.name}" has no rows to import below its headings.` };
        }
        if (unitCount > IMPORT_MAX_UNITS) {
            return {
                fileError: `This file adds ${unitCount.toLocaleString()} units. One import holds up to ${IMPORT_MAX_UNITS.toLocaleString()}; split the file and import the parts one after another.`
            };
        }
        return { sheetName: sheet.name, rows, units, problems, unitCount };
    }

    /** The server's own check of every unit, writing nothing. */
    async runServerCheck() {
        const units = this.check.units;
        this.state = 'checking';
        this.progress = { done: 0, total: units.length };
        this.checkError = null;
        this.render();

        const problems = [];
        for (let i = 0; i < units.length; i += IMPORT_CHUNK) {
            const chunk = units.slice(i, i + IMPORT_CHUNK);
            const outcome = await api.components.bulkAddChunk(this.type, chunk.map(u => u.payload), null, { dryRun: true });
            if (outcome.refused || outcome.unknown) {
                this.state = 'check-failed';
                this.checkError = outcome.message;
                this.render();
                return;
            }
            if (!outcome.dryRun) {
                // An API that ignored dry_run would have ADDED these units. The
                // drawer only opens once {type}-models answers, which ships in the
                // same file as dry_run, so this is a tripwire, not a path.
                this.state = 'check-failed';
                this.checkError = 'The server did not confirm a check-only run. Stop and ask an administrator to look at this type\'s recent additions.';
                this.render();
                return;
            }
            outcome.results.forEach(result => {
                const unit = chunk[Number(result.index)];
                if (!unit || result.valid) return;
                problems.push({ row: unit.row, column: this.columnForMessage(result.error), message: result.error || 'The server refused this row.' });
            });
            this.progress.done = Math.min(units.length, i + chunk.length);
            this.renderProgress();
        }

        // A quantity row repeats its problem once per unit; say it once.
        const seen = new Set();
        this.check.problems = problems.filter(p => {
            const key = `${p.row}|${p.message}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        this.state = this.check.problems.length ? 'invalid' : 'ready';
        this.render();
    }

    columnForMessage(message) {
        const m = String(message || '').toLowerCase();
        if (m.includes('serial')) return 'Serial number';
        if (m.includes('location') || m.includes('site')) return 'Site';
        if (m.includes('model') || m.includes('uuid') || m.includes('catalog')) return 'Model';
        if (m.includes('status') || m.includes('in use')) return 'Status';
        return '';
    }

    // ------------------------------------------------------------------ import

    async runImport() {
        if (!['ready', 'unknown'].includes(this.state)) return;
        if (!this.plan) {
            this.plan = [];
            const units = this.check.units;
            for (let i = 0; i < units.length; i += IMPORT_CHUNK) {
                this.plan.push({ units: units.slice(i, i + IMPORT_CHUNK), key: this.newKey(), done: false });
            }
            this.added = [];
            this.failed = [];
        }
        this.state = 'importing';
        this.progress = { done: this.plan.filter(c => c.done).reduce((n, c) => n + c.units.length, 0), total: this.check.units.length };
        this.render();

        for (const chunk of this.plan) {
            if (chunk.done) continue;
            const outcome = await api.components.bulkAddChunk(this.type, chunk.units.map(u => u.payload), chunk.key);
            if (outcome.unknown) {
                // Keep the key: a retry is replayed, never added twice.
                this.state = 'unknown';
                this.unknownMessage = outcome.message;
                this.render();
                this.refreshList();
                return;
            }
            if (outcome.refused) {
                chunk.units.forEach(unit => this.failed.push({ unit, error: outcome.message }));
            } else {
                chunk.units.forEach((unit, i) => {
                    const result = outcome.results.find(x => Number(x.index) === i) || outcome.results[i];
                    if (result && result.success) this.added.push({ unit, assetTag: result.asset_tag || '' });
                    else this.failed.push({ unit, error: (result && result.error) || 'The server did not report this unit.' });
                });
            }
            chunk.done = true;
            this.progress.done += chunk.units.length;
            this.renderProgress();
        }

        this.state = 'done';
        this.render();
        this.refreshList();
        const total = this.check.units.length;
        if (!this.failed.length) toast.success(`Imported ${this.unitsLabel(this.added.length)}`);
        else if (this.added.length) toast.warning(`Imported ${this.added.length.toLocaleString()} of ${this.unitsLabel(total)}`);
        else toast.error('Nothing was imported');
    }

    newKey() {
        if (window.crypto && typeof crypto.randomUUID === 'function') return `import-${crypto.randomUUID()}`;
        return `import-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    }

    refreshList() {
        if (typeof this.dashboard.loadComponentList === 'function') this.dashboard.loadComponentList(this.type, true);
    }

    async downloadResults() {
        try {
            const ExcelJS = await ComponentImport.loadExcel();
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'BDC Inventory';
            const sheet = workbook.addWorksheet('Results', { views: [{ state: 'frozen', ySplit: 1 }] });
            sheet.columns = [
                { header: 'Row in your file', key: 'row', width: 16 },
                { header: 'Model', key: 'model', width: 48 },
                { header: 'Serial number', key: 'serial', width: 24 },
                { header: 'Site', key: 'site', width: 26 },
                { header: 'Shelf / bin', key: 'shelf', width: 18 },
                { header: 'Asset tag', key: 'tag', width: 20 },
                { header: 'Result', key: 'result', width: 60 }
            ];
            sheet.getRow(1).font = { bold: true };
            const lines = [
                ...this.added.map(a => ({ unit: a.unit, tag: a.assetTag, result: 'Added' })),
                ...this.failed.map(f => ({ unit: f.unit, tag: '', result: `Not added: ${f.error}` }))
            ].sort((a, b) => a.unit.row - b.unit.row);
            lines.forEach(line => sheet.addRow({
                row: line.unit.row, model: line.unit.entry.model, serial: line.unit.entry.serial || '',
                site: line.unit.entry.site, shelf: line.unit.entry.shelf, tag: line.tag, result: line.result
            }));
            await ComponentImport.saveWorkbook(workbook, `${this.type}-import-results-${new Date().toISOString().slice(0, 10)}.xlsx`);
        } catch (error) {
            console.error('Results file failed:', error);
            toast.error(error.message || 'The results file could not be made');
        }
    }

    // ------------------------------------------------------------------ render

    render() {
        if (!this.root || !document.contains(this.root)) return;
        const esc = utils.escapeHtml;
        const fileSlot = this.root.querySelector('[data-imp-slot="file"]');
        const statusSlot = this.root.querySelector('[data-imp-slot="status"]');
        const go = this.root.querySelector('[data-imp="go"]');
        const cancel = this.root.querySelector('[data-imp="cancel"]');
        const sample = this.root.querySelector('[data-imp="sample"]');

        const noModels = this.ref && !this.ref.models.length;
        const blocked = !!this.refError || noModels;
        if (sample) sample.disabled = !this.ref || blocked;

        // File slot: the drop zone, or the chosen file.
        const busy = ['reading', 'checking', 'importing'].includes(this.state);
        if (!this.file || this.state === 'idle') {
            fileSlot.innerHTML = blocked ? '' : `
                <label class="cd-drop">
                    <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
                    <i class="fas fa-file-excel" aria-hidden="true"></i>
                    <strong>Choose an .xlsx file</strong>
                    <span>or drop it here. Up to ${IMPORT_MAX_UNITS.toLocaleString()} units per file.</span>
                </label>`;
        } else {
            const size = this.file.size >= 1024 * 1024
                ? `${(this.file.size / 1024 / 1024).toFixed(1)} MB`
                : `${Math.max(1, Math.round(this.file.size / 1024))} KB`;
            const canSwap = !busy && this.state !== 'done' && this.state !== 'unknown';
            fileSlot.innerHTML = `
                <div class="cd-file">
                    <i class="fas fa-file-excel" aria-hidden="true"></i>
                    <span class="cd-file-name"><strong>${esc(this.file.name)}</strong><span>${esc(size)}</span></span>
                    ${canSwap ? '<button type="button" class="cd-btn" data-imp="another">Choose another file</button>' : ''}
                </div>`;
        }

        statusSlot.innerHTML = this.statusHtml();

        // Footer.
        if (go) {
            if (this.state === 'ready') {
                go.disabled = false;
                go.textContent = `Import ${this.unitsLabel(this.check.units.length)}`;
            } else if (this.state === 'done') {
                go.disabled = false;
                go.textContent = 'Done';
            } else {
                go.disabled = true;
                go.textContent = this.state === 'importing' ? 'Importing…' : 'Import';
            }
        }
        if (cancel) cancel.style.display = this.state === 'done' ? 'none' : '';
    }

    statusHtml() {
        const esc = utils.escapeHtml;
        if (this.refError) {
            return `<div class="cd-note is-expired">The model list could not be loaded, so files can't be checked: ${esc(this.refError)} Close this and try again.</div>`;
        }
        if (!this.ref) return '<p class="cd-hint">Loading the model list…</p>';
        if (!this.ref.models.length) {
            return `<div class="cd-note is-expired">There are no ${esc(this.singular)} models in the catalogue yet, so there is nothing a file could import.</div>`;
        }

        switch (this.state) {
            case 'file-error':
                return this.card('is-error', 'This file can\'t be imported', esc(this.fileError));
            case 'reading':
                return this.card('', 'Reading your file', 'Nothing is written yet.');
            case 'checking':
                return this.card('', 'Checking every row',
                    'The same checks as adding a unit by hand, including serial numbers already in inventory. Nothing is written yet.', true);
            case 'check-failed':
                return this.card('is-error', 'The check didn\'t finish',
                    `${esc(this.checkError || 'The server did not answer.')} Nothing was imported.`,
                    false, '<button type="button" class="cd-btn" data-imp="recheck">Check again</button>');
            case 'invalid':
                return this.problemsHtml();
            case 'ready': {
                const rows = this.check.rows.length;
                return this.card('is-ok', `Ready to import ${esc(this.unitsLabel(this.check.units.length))}`,
                    `${rows.toLocaleString()} ${rows === 1 ? 'row' : 'rows'} from "${esc(this.check.sheetName)}" passed every check. Nothing is written until you import.`);
            }
            case 'importing':
                return this.card('', 'Importing', 'Adding units in groups of 100. Keep this open until it finishes.', true);
            case 'unknown':
                return `<div class="cd-note is-expired">The connection dropped while importing. ${esc(this.unitsLabel(this.added.length))} added so far; the server's answer for the next group is unknown (${esc(this.unknownMessage || 'no response')}). Retry finishes the import without adding anything twice.
                    <div style="margin-top: 10px;"><button type="button" class="cd-btn" data-imp="retry">Retry</button></div></div>`;
            case 'done':
                return this.resultsHtml();
            default:
                return '';
        }
    }

    card(kind, title, sub, withProgress = false, action = '') {
        const pct = withProgress && this.progress && this.progress.total
            ? Math.round((this.progress.done / this.progress.total) * 100) : 0;
        return `
            <div class="cd-result ${kind}">
                <div class="cd-result-top">
                    <div class="cd-result-head"><strong>${utils.escapeHtml(title)}</strong>${action}</div>
                    <p class="cd-result-sub">${sub}</p>
                    ${withProgress ? `<div class="cd-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width: ${pct}%"></span></div>` : ''}
                </div>
            </div>`;
    }

    renderProgress() {
        const bar = this.root?.querySelector('.cd-progress');
        if (!bar || !this.progress?.total) return;
        const pct = Math.round((this.progress.done / this.progress.total) * 100);
        bar.setAttribute('aria-valuenow', String(pct));
        bar.querySelector('span').style.width = `${pct}%`;
    }

    problemsHtml() {
        const esc = utils.escapeHtml;
        const problems = [...this.check.problems].sort((a, b) => a.row - b.row);
        const rowCount = new Set(problems.map(p => p.row)).size;
        const shown = problems.slice(0, IMPORT_SHOWN_PROBLEMS);
        const more = problems.length - shown.length;
        const title = `${problems.length.toLocaleString()} ${problems.length === 1 ? 'problem' : 'problems'} in ${rowCount.toLocaleString()} ${rowCount === 1 ? 'row' : 'rows'}`;
        return `
            <div class="cd-result is-error">
                <div class="cd-result-top">
                    <div class="cd-result-head"><strong>${esc(title)}</strong></div>
                    <p class="cd-result-sub">Nothing has been imported. Fix these in your file, save it, and choose it again.</p>
                </div>
                <ul class="cd-result-list">
                    <li class="cd-problem is-head"><span>Row</span><span>Column</span><span>Problem</span></li>
                    ${shown.map(p => `
                        <li class="cd-problem">
                            <span class="cd-problem-row">${esc(String(p.row))}</span>
                            <span class="cd-problem-col">${esc(p.column || '—')}</span>
                            <span class="cd-problem-what">${esc(p.message)}</span>
                        </li>`).join('')}
                    ${more > 0 ? `<li class="cd-problem"><span></span><span></span><span class="cd-problem-what">and ${more.toLocaleString()} more</span></li>` : ''}
                </ul>
            </div>`;
    }

    resultsHtml() {
        const esc = utils.escapeHtml;
        const total = this.check.units.length;
        const ok = !this.failed.length;
        const title = ok
            ? `Imported ${this.unitsLabel(this.added.length)}`
            : (this.added.length ? `Imported ${this.added.length.toLocaleString()} of ${this.unitsLabel(total)}` : 'Nothing was imported');
        const sub = ok
            ? 'Write these asset tags on the units. The results file lists them against the rows of your file.'
            : 'Every row passed the check, but the server refused some when adding them, usually because the same serial was registered in the meantime. The results file marks each one.';
        const lines = [
            ...this.added.map(a => `
                <li class="cd-result-row">
                    <span class="cd-result-tag">${esc(a.assetTag)}</span>
                    <span class="cd-result-what">Row ${esc(String(a.unit.row))} · ${esc(a.unit.entry.model)}${a.unit.entry.serial ? ` · ${esc(a.unit.entry.serial)}` : ''}</span>
                </li>`),
            ...this.failed.map(f => `
                <li class="cd-result-row">
                    <span class="cd-result-tag">Not added</span>
                    <span class="cd-result-what">Row ${esc(String(f.unit.row))}: ${esc(f.error)}</span>
                </li>`)
        ];
        return `
            <div class="cd-result ${ok ? 'is-ok' : 'is-partial'}">
                <div class="cd-result-top">
                    <div class="cd-result-head"><strong>${esc(title)}</strong><button type="button" class="cd-btn" data-imp="results"><i class="fas fa-file-download" aria-hidden="true"></i> Download results</button></div>
                    <p class="cd-result-sub">${esc(sub)}</p>
                </div>
                <ul class="cd-result-list">${lines.join('')}</ul>
            </div>`;
    }
}

ComponentImport.excelPromise = null;
window.ComponentImport = ComponentImport;
