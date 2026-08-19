/**
 * Platform Manager
 *
 * Server compute platforms — a shipped server product (HPE ProLiant DL360 Gen10,
 * Dell PowerEdge R740) and the system boards it can be built around. The builder
 * lets the user pick the platform first, then the board, instead of scrolling a flat
 * list of every motherboard in stock.
 *
 * Applying a selection installs the whole product: the chosen system board first, then
 * the platform's `default_components` — CPUs, DIMMs, chassis, drives, caddies.
 *
 * The board is added on its own, before anything else, through the ordinary
 * `server-add-component` action — the single add path, the one that routes through the
 * backend's command/validation layers. Only then is the platform stamped, and only then
 * does the rest of the bundle go in through ComponentInstaller. That order is what makes
 * every later failure survivable: a stamp that fails costs the stored label (the backend
 * still infers the platform from the board UUID), and a bundle component that is out of
 * stock is reported and skipped. Neither can leave a wrong board installed.
 */

class PlatformManager {
    constructor() {
        this.platforms = null; // cached for the lifetime of the page
    }

    /**
     * All platforms with their system boards, each annotated with available_units
     * and spec_exists.
     * @returns {Promise<Array>}
     */
    async getPlatforms(forceReload = false) {
        if (this.platforms && !forceReload) {
            return this.platforms;
        }

        const result = await serverAPI.listServerPlatforms({ silent: true });

        if (result && result.success && result.data) {
            this.platforms = result.data.platforms || [];
            return this.platforms;
        }

        throw new Error((result && result.message) || 'Failed to load server platforms');
    }

    /** One platform from the cached catalog. */
    getPlatform(platformUuid) {
        return (this.platforms || []).find(p => p.platform_uuid === platformUuid) || null;
    }

    /** What a platform ships with besides the board, as the catalog reported it. */
    getBundle(platformUuid) {
        const platform = this.getPlatform(platformUuid);
        return (platform && platform.default_components) || [];
    }

    /**
     * Install the chosen system board, record the platform, then install everything
     * else the platform ships with.
     *
     * @param {string} configUuid   Server being built
     * @param {string} platformUuid Selected platform
     * @param {string} boardUuid    Selected system board (a motherboard spec UUID)
     * @returns {Promise<Object>} {
     *   success, boardAdded, platformRecorded, message,
     *   unitsAdded, unitsSkipped, skipped[]
     * }
     */
    async applyPlatform(configUuid, platformUuid, boardUuid) {
        const result = {
            success: false,
            boardAdded: false,
            platformRecorded: false,
            message: '',
            unitsAdded: 0,
            unitsSkipped: 0,
            skipped: []
        };

        const addResponse = await serverAPI.addComponentToServer(
            configUuid,
            'motherboard',
            boardUuid,
            1,
            '',
            false,
            { silent: true }
        );

        if (!addResponse || !addResponse.success) {
            result.message = (addResponse && addResponse.message) || 'Failed to add the system board';
            return result;
        }

        result.boardAdded = true;
        result.success = true;
        result.unitsAdded = 1;

        // The board is in. A failure here costs the stored label, nothing else —
        // the backend still infers the platform from the board for display.
        try {
            const stampResponse = await serverAPI.setServerPlatform(configUuid, platformUuid, { silent: true });
            result.platformRecorded = !!(stampResponse && stampResponse.success);
            if (!result.platformRecorded) {
                result.message = (stampResponse && stampResponse.message) || '';
            }
        } catch (error) {
            result.message = error.message || '';
        }

        // Everything else the product ships with. Anything unavailable is reported,
        // never fatal — a platform whose DIMMs are out of stock still gets its board.
        const bundle = this.getBundle(platformUuid);
        if (bundle.length && typeof componentInstaller !== 'undefined') {
            try {
                const installed = await componentInstaller.install(configUuid, bundle);
                result.unitsAdded += installed.unitsAdded;
                result.unitsSkipped = installed.unitsSkipped;
                result.skipped = installed.skipped;
            } catch (error) {
                console.error('PlatformManager: bundle install failed', error);
                result.skipped = [{
                    type: 'bundle',
                    model: 'Platform components',
                    count: bundle.reduce((sum, item) => sum + (parseInt(item.quantity, 10) || 1), 0),
                    reason: error.message || 'Bundle install failed'
                }];
                result.unitsSkipped = result.skipped[0].count;
            }
        }

        return result;
    }
}

// Initialize globally
window.platformManager = new PlatformManager();
