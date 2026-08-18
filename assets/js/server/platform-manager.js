/**
 * Platform Manager
 *
 * Server compute platforms — a shipped server product (HPE ProLiant DL360 Gen10,
 * Dell PowerEdge R740) and the system boards it can be built around. The builder
 * lets the user pick the platform first, then the board, instead of scrolling a flat
 * list of every motherboard in stock.
 *
 * Applying a selection is deliberately two calls: the board is added through the
 * ordinary `server-add-component` action — the single add path, the one that routes
 * through the backend's command/validation layers — and only then is the platform
 * stamped on the configuration. If the stamp fails the board is still correctly
 * installed, and the builder falls back to the platform the backend infers from the
 * board UUID, so the worst case is a missing label rather than a wrong build.
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

    /**
     * Install the chosen system board and record the platform.
     *
     * @param {string} configUuid   Server being built
     * @param {string} platformUuid Selected platform
     * @param {string} boardUuid    Selected system board (a motherboard spec UUID)
     * @returns {Promise<Object>} { success, boardAdded, platformRecorded, message }
     */
    async applyPlatform(configUuid, platformUuid, boardUuid) {
        const result = {
            success: false,
            boardAdded: false,
            platformRecorded: false,
            message: ''
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

        return result;
    }
}

// Initialize globally
window.platformManager = new PlatformManager();
