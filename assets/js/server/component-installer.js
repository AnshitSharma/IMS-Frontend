/**
 * Component Installer
 *
 * Installs a set of components into one server configuration. Two callers need this:
 * importing a template (copy another build's parts list) and selecting a compute
 * platform (install what the product ships with). Both mean the same thing — "put these
 * parts in this build, tell me what didn't fit" — so both go through here.
 *
 * Three rules this file exists to keep:
 *
 * 1. Every unit is added through `server-add-component`, one at a time. That action is
 *    the single add path: UUID validation, the compatibility engine and the command
 *    layer all hang off it. A bulk shortcut would bypass all three.
 * 2. The backend decides what can be installed, not this file. There is no local
 *    stock check before an add — `server-get-available-components` returns a capped
 *    window of inventory, so "not in the list I fetched" is not the same statement as
 *    "not in stock", and treating it as one skips parts that are actually on the shelf.
 * 3. Order matters. A CPU is refused before its board is in; RAM is refused before its
 *    CPU. INSTALL_ORDER is that dependency chain.
 */

class ComponentInstaller {

    /**
     * Dependency order: each type is installed only after the types it needs.
     * Anything not named here is installed last, in the order it was given.
     */
    static INSTALL_ORDER = [
        'motherboard',
        'chassis',
        'cpu',
        'ram',
        'storage',
        'caddy',
        // risercard BEFORE the cards that sit on it (moved 2026-09-01). Four platform
        // boards — HPE DL360 Gen9, DL380 Gen10, DL325 Gen10 Plus v2 and Dell R630 —
        // declare only expansion_slots.riser_slots and no pcie_slots at all, so on
        // those platforms every NIC, HBA and PCIe card was refused for want of a slot
        // that only an already-installed riser can provide.
        'risercard',
        'nic',
        'hbacard',
        'pciecard',
        // sfp last: it needs its parent NIC to already be in the configuration.
        'sfp'
    ];

    /**
     * Install a set of components.
     *
     * @param {string} configUuid Target configuration
     * @param {Array}  items      [{ type, uuid, quantity?, model?, optional?, slot_position? }]
     * @returns {Promise<Object>} {
     *   added:   [{ type, model, uuid }]              one row per unit that went in
     *   skipped: [{ type, model, uuid, count, reason, optional }]  one row per entry
     *   unitsAdded, unitsSkipped, durationMs
     * }
     */
    async install(configUuid, items) {
        const startedAt = Date.now();
        const result = { added: [], skipped: [], unitsAdded: 0, unitsSkipped: 0, durationMs: 0 };

        for (const item of this.sequence(items, result)) {
            let installed = 0;
            let reason = '';

            for (let unit = 0; unit < item.quantity; unit++) {
                let response;

                try {
                    response = await serverAPI.addComponentToServer(
                        configUuid,
                        item.type,
                        item.uuid,
                        1,
                        item.slot_position || '',
                        false,
                        { silent: true }
                    );
                } catch (error) {
                    reason = error.message || 'Network or server error';
                    break;
                }

                if (!response || !response.success) {
                    reason = (response && response.message) || 'The server rejected this component';
                    break;
                }

                installed++;
                result.added.push({ type: item.type, model: item.model, uuid: item.uuid });
            }

            result.unitsAdded += installed;

            // Units after the first failure are not attempted: whatever blocked one
            // unit — out of stock, no free slot, a compatibility rule — holds for the
            // rest of the entry, and capacity only shrinks as a build fills up.
            const remaining = item.quantity - installed;
            if (remaining > 0) {
                result.unitsSkipped += remaining;
                result.skipped.push({
                    type: item.type,
                    model: item.model,
                    uuid: item.uuid,
                    count: remaining,
                    optional: !!item.optional,
                    reason: reason || 'Could not be installed'
                });
            }
        }

        result.durationMs = Date.now() - startedAt;
        return result;
    }

    /**
     * Validate the requested items and put them in dependency order.
     * An entry without a UUID is reported rather than dropped — a part that vanishes
     * without explanation looks like a part the platform never had.
     */
    sequence(items, result) {
        const queue = [];

        (items || []).forEach(item => {
            if (!item || !item.type) {
                return;
            }

            const model = item.model || item.label || 'Unknown component';
            const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);

            if (!item.uuid) {
                result.skipped.push({
                    type: item.type,
                    model,
                    uuid: null,
                    count: quantity,
                    optional: !!item.optional,
                    reason: 'No component UUID in the source data'
                });
                result.unitsSkipped += quantity;
                return;
            }

            // The one thing worth deciding without asking the server: a UUID the
            // backend already told us does not resolve in ims-data. Attempting it
            // would fail on UUID validation and report a generic rejection instead of
            // the data error it actually is.
            if (item.spec_exists === false) {
                result.skipped.push({
                    type: item.type,
                    model,
                    uuid: item.uuid,
                    count: quantity,
                    optional: !!item.optional,
                    reason: 'Component specification is missing from ims-data'
                });
                result.unitsSkipped += quantity;
                return;
            }

            queue.push({
                type: item.type,
                uuid: item.uuid,
                model,
                quantity,
                optional: !!item.optional,
                slot_position: item.slot_position || ''
            });
        });

        const rank = type => {
            const index = ComponentInstaller.INSTALL_ORDER.indexOf(type);
            return index === -1 ? ComponentInstaller.INSTALL_ORDER.length : index;
        };

        // Stable: entries of the same type keep the order they were given in.
        return queue
            .map((item, index) => ({ item, index }))
            .sort((a, b) => rank(a.item.type) - rank(b.item.type) || a.index - b.index)
            .map(entry => entry.item);
    }

    /**
     * "2 × CPU · 12 × Memory · 1 × Chassis" — a bundle in one line.
     * Uses BuildState's catalog so a type is named the same here as in the builder.
     */
    static summarize(items) {
        const totals = new Map();

        (items || []).forEach(item => {
            if (!item || !item.type) return;
            const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
            totals.set(item.type, (totals.get(item.type) || 0) + quantity);
        });

        const rank = type => {
            const index = ComponentInstaller.INSTALL_ORDER.indexOf(type);
            return index === -1 ? ComponentInstaller.INSTALL_ORDER.length : index;
        };

        const nameOf = type => {
            const catalog = (typeof BuildState !== 'undefined' && BuildState.COMPONENT_CATALOG) || [];
            const entry = catalog.find(row => row.type === type);
            return entry ? entry.name : type;
        };

        return [...totals.entries()]
            .sort((a, b) => rank(a[0]) - rank(b[0]))
            .map(([type, quantity]) => `${quantity} × ${nameOf(type)}`)
            .join(' · ');
    }
}

// Initialize globally
window.componentInstaller = new ComponentInstaller();
