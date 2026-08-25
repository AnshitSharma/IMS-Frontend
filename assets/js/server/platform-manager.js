/**
 * Platform Manager
 *
 * Server compute platforms — a shipped server product (HPE ProLiant DL360 Gen9, Dell
 * PowerEdge R740). A platform is a physical box we stock, and it ships in VERSIONS: the
 * same product built around a different chassis, and therefore a different drive-bay
 * layout (8 × 2.5" SFF vs 4 × 3.5" LFF). The version is the stocked SKU, so it is a
 * version the user picks and a version we count units of.
 *
 * The system board and the chassis are INSIDE the box. Installing a version consumes one
 * unit and autofills them into the build; they are then locked, because they came out of
 * this product and cannot be swapped for loose spares.
 *
 * Install and remove are each ONE backend call. Both use the same handshake: the backend
 * answers 409 `confirm_wipe_required`, naming what is currently installed, and the call
 * is retried with confirmWipe once the user agrees. That refusal IS the confirmation
 * prompt — the frontend never decides on its own what is safe to release.
 */

class PlatformManager {
    constructor() {
        this.platforms = null; // cached for the lifetime of the page
    }

    /**
     * All platforms with their versions, each annotated with available_units,
     * selectable and unavailable_reason.
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

    /** One version, with the platform it belongs to, from the cached catalog. */
    getVersion(versionUuid) {
        for (const platform of this.platforms || []) {
            const version = (platform.versions || []).find(v => v.version_uuid === versionUuid);
            if (version) {
                return { platform, version };
            }
        }
        return null;
    }

    /**
     * Install a platform version into a configuration.
     *
     * Stock changes as soon as this succeeds, so the cached catalog is dropped — the
     * next open of the picker re-reads availability rather than showing a count that is
     * one unit stale.
     *
     * @param {string}  configUuid
     * @param {string}  versionUuid
     * @param {boolean} confirmWipe  true once the user has agreed to release the build
     * @returns {Promise<Object>} {
     *   success, needsConfirmation, installedSummary, installedTotal, message, data
     * }
     */
    async installPlatform(configUuid, versionUuid, confirmWipe = false) {
        const response = await serverAPI.setServerPlatform(configUuid, versionUuid, confirmWipe, { silent: true });
        return this.interpret(response);
    }

    /**
     * Remove the configuration's platform, releasing the whole build with it.
     * Same confirmation handshake as installPlatform.
     */
    async removePlatform(configUuid, confirmWipe = false) {
        const response = await serverAPI.removeServerPlatform(configUuid, confirmWipe, { silent: true });
        return this.interpret(response);
    }

    /**
     * Split a platform response into the three outcomes the UI acts on: done, needs the
     * user's confirmation, or failed.
     */
    interpret(response) {
        const data = (response && response.data) || {};

        if (response && response.success) {
            this.platforms = null; // stock moved
            return {
                success: true,
                needsConfirmation: false,
                message: response.message || '',
                data
            };
        }

        return {
            success: false,
            needsConfirmation: data.error_type === 'confirm_wipe_required',
            installedSummary: data.installed_summary || '',
            installedTotal: data.installed_total || 0,
            installedComponents: data.installed_components || {},
            message: (response && response.message) || 'The compute platform could not be changed',
            data
        };
    }
}

// Initialize globally
window.platformManager = new PlatformManager();
