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
        return this.interpret(await this.attempt(
            () => serverAPI.setServerPlatform(configUuid, versionUuid, confirmWipe, { silent: true })
        ));
    }

    /**
     * Remove the configuration's platform, releasing the whole build with it.
     * Same confirmation handshake as installPlatform.
     */
    async removePlatform(configUuid, confirmWipe = false) {
        return this.interpret(await this.attempt(
            () => serverAPI.removeServerPlatform(configUuid, confirmWipe, { silent: true })
        ));
    }

    /**
     * Run one platform call and hand back an envelope whatever happens.
     *
     * `window.api.request()` THROWS on any non-2xx, and the 409 these two actions
     * answer with IS the confirmation prompt, not a failure — it carries
     * error_type='confirm_wipe_required' and installed_summary in `data`. So the
     * throw has to be turned back into the envelope interpret() reads.
     *
     * This used to be handled by passing axios a `validateStatus` that let 4xx
     * through as a response body. axios is gone; makeRequest() ignored the option
     * from then on, so interpret() never saw a 409 and needsConfirmation could
     * never be true — the dialog was unreachable and the user got the refusal text
     * as a red toast with no way to agree to it.
     *
     * api.buildError() hangs the API's `code` and `data` on the Error for exactly
     * this. A 401 or a network failure carries no `data`; those still come back as
     * a plain failure with the original message, which is what the callers' catch
     * blocks already did with them.
     */
    async attempt(call) {
        try {
            return await call();
        } catch (error) {
            return {
                success: false,
                message: error.message || 'The compute platform could not be changed',
                data: error.data || {}
            };
        }
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
