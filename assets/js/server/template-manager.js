/**
 * Template Manager
 * Handles logic for importing server templates (virtual servers)
 *
 * Reads a template configuration and hands its parts list to ComponentInstaller,
 * which owns the actual installing — the same path the compute-platform picker uses.
 */

class TemplateManager {
    constructor() {
        this.loading = false;
    }

    /**
     * Get list of available templates
     * Filters for is_virtual = true
     */
    async getTemplates() {
        try {
            // Fetch active server configs (status=1)
            // We fetch a larger batch to find templates
            const result = await serverAPI.listTemplates(100, 0, { silent: true });

            if (result.success && result.data && result.data.configurations) {
                return result.data.configurations;
            }
            return [];
        } catch (error) {
            console.error('TemplateManager: Error fetching templates', error);
            throw error;
        }
    }

    /**
     * Import a template into a target configuration
     * @param {string} targetConfigUuid - The UUID of the server being built
     * @param {string} templateUuid - The UUID of the template to import
     * @returns {Promise<Object>} Result object with added/skipped counts
     */
    async importTemplate(targetConfigUuid, templateUuid) {
        const startTime = Date.now();
        const result = {
            success: false,
            added: [],
            skipped: [],
            durationMs: 0
        };

        try {
            // 1. Fetch Template Details
            const templateResult = await serverAPI.getServerConfig(templateUuid, { silent: true });
            if (!templateResult.success || !templateResult.data) {
                throw new Error('Failed to load template details');
            }

            // New format: components are in templateResult.data.components
            // Handle both new and potentially legacy structures
            const responseData = templateResult.data;
            const componentsToCheck = responseData.components ||
                (responseData.configuration && responseData.configuration.components) ||
                responseData.components;

            if (!componentsToCheck) {
                result.success = true; // Empty template is technically a success
                return result;
            }

            // 2. Flatten the template into one parts list. Each entry in the template
            //    is one physical unit, so each becomes a quantity of 1; the installer
            //    puts them in dependency order.
            const items = [];
            Object.keys(componentsToCheck).forEach(type => {
                const entries = componentsToCheck[type];
                if (!Array.isArray(entries)) {
                    return;
                }

                entries.forEach(entry => {
                    items.push({
                        type,
                        uuid: entry.uuid,
                        model: entry.component_name || entry.product_name || entry.model || entry.name || 'Unknown',
                        quantity: 1,
                        slot_position: entry.slot_position || ''
                    });
                });
            });

            const installed = await componentInstaller.install(targetConfigUuid, items);
            result.added = installed.added;
            result.skipped = installed.skipped;
            result.success = true;
        } catch (error) {
            result.error = error.message;
            result.success = false;
        }

        result.durationMs = Date.now() - startTime;
        return result;
    }
}

// Initialize globally
window.templateManager = new TemplateManager();
