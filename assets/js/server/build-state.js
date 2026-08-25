/**
 * BuildState — one server-get-config payload, as an object.
 *
 * The builder used to render all 11 component types from a hardcoded array in
 * its constructor, so it offered SFP modules on a copper-only build and PCIe
 * cards on a board with no PCIe slots. The backend now says which types this
 * build can actually accept (`component_options`); this class is what the
 * builder asks instead of asking a literal.
 *
 * TWO INDEPENDENT FACTS PER TYPE:
 *   available  this build has capacity of that kind AT ALL   -> render the row
 *   can_add    that capacity has a FREE unit right now       -> render the add button
 *
 * A board whose PCIe slots are all occupied keeps its row, with every installed
 * card still listed and removable, and loses only the add button. A board with
 * no PCIe slots renders no row at all — until a riser card provides some.
 */
class BuildState {

    /**
     * The 11 component types. Single source of truth for how a type is named,
     * described and iconed — previously duplicated inside ServerBuilder.
     * Order here is the order rows render in.
     */
    static COMPONENT_CATALOG = [
        { type: 'cpu', name: 'CPU', description: 'Processor', icon: 'fas fa-microchip', multiple: true, required: true },
        { type: 'motherboard', name: 'Motherboard', description: 'System Board', icon: 'fas fa-th-large', multiple: false, required: true },
        { type: 'ram', name: 'Memory', description: 'RAM Modules', icon: 'fas fa-memory', multiple: true, required: true },
        { type: 'storage', name: 'Storage', description: 'Hard Drives, SSDs', icon: 'fas fa-hdd', multiple: true, required: false },
        { type: 'chassis', name: 'Chassis', description: 'Server Case', icon: 'fas fa-server', multiple: false, required: true },
        { type: 'caddy', name: 'Caddy', description: 'Drive Mounting', icon: 'fas fa-box', multiple: true, required: false },
        { type: 'risercard', name: 'Riser Cards', description: 'PCIe Riser Bridges', icon: 'fas fa-layer-group', multiple: true, required: false },
        { type: 'pciecard', name: 'PCI Cards', description: 'Expansion Cards', icon: 'fas fa-credit-card', multiple: true, required: false },
        { type: 'nic', name: 'Network Cards', description: 'Network Interface', icon: 'fas fa-network-wired', multiple: true, required: false },
        { type: 'hbacard', name: 'HBA Cards', description: 'Host Bus Adapter', icon: 'fas fa-hdd', multiple: true, required: false },
        { type: 'sfp', name: 'SFP Modules', description: 'Fiber Transceivers', icon: 'fas fa-plug', multiple: true, required: false }
    ];

    /**
     * @param {object} data The `data` object of a server-get-config response.
     */
    constructor(data = {}) {
        this.raw = data || {};
        this.configuration = this.raw.configuration || this.raw;
        this.hardware = this.raw.hardware || {};
        this.slots = this.hardware.slots || null;
        this.network = this.hardware.network || null;
        this.storageConnectivity = this.hardware.storage_connectivity || null;

        // The installed board's spec, resolved by the backend. Null for a build with
        // no board — and on a backend that predates this field, which is why every
        // reader still has to tolerate null.
        this.motherboardSpec = this.hardware.motherboard_spec || null;

        // Absent when the backend predates this feature, or during the ~20s
        // window where one stack is deployed and the other isn't. Null means
        // "no opinion", and every accessor below then falls back to today's
        // behaviour: everything visible, everything addable. The page can never
        // end up in a worse state than it was before this feature existed.
        this.options = this.raw.component_options || null;
    }

    /** @returns {object|null} The backend's verdict for one type, if any. */
    optionFor(type) {
        return this.options ? (this.options[type] || null) : null;
    }

    /** Catalog entries this build can accept, in catalog order. */
    visibleTypes() {
        if (!this.options) return BuildState.COMPONENT_CATALOG;
        return BuildState.COMPONENT_CATALOG.filter(entry => {
            // Installed hardware is never hidden, whatever the capacity verdict
            // says. A motherboard's onboard NIC occupies no PCIe slot, so the
            // slot gate reports no capacity for `nic` — but the NIC is right
            // there in the build and has to stay visible and inspectable. Same
            // rule that keeps chips on a full row: gating governs what you can
            // ADD, never what you can SEE.
            if (this.componentsOf(entry.type).length > 0) return true;

            const option = this.options[entry.type];
            // A type the backend didn't rule on stays visible — silence is not a denial.
            return option ? option.available !== false : true;
        });
    }

    /** Is there free capacity for this type right now? */
    canAdd(type) {
        const option = this.optionFor(type);
        return option ? option.can_add !== false : true;
    }

    /** Badge text for a visible-but-full type, e.g. "3/3 PCIe slots in use". */
    capacityLabel(type) {
        const option = this.optionFor(type);
        if (!option || option.can_add !== false) return '';
        if (option.reason) return option.reason;

        const capacity = option.capacity;
        return capacity && capacity.total
            ? `${capacity.used}/${capacity.total} in use`
            : 'No free slot';
    }

    capacity(type) {
        const option = this.optionFor(type);
        return option ? option.capacity : null;
    }

    /** Installed components of a type, as returned by the API. */
    componentsOf(type) {
        const components = this.raw.components || {};
        return Array.isArray(components[type]) ? components[type] : [];
    }

    hasMotherboard() {
        return this.componentsOf('motherboard').length > 0;
    }
}

window.BuildState = BuildState;
