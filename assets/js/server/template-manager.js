/**
 * Template Manager
 * Handles logic for importing server templates (virtual servers)
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
            const result = await serverAPI.getServerConfigs(100, 0, 1, { silent: true });

            if (result.success && result.data && result.data.configurations) {
                // Filter for virtual servers (templates)
                return result.data.configurations.filter(
                    server => server.is_virtual == 1 || server.is_virtual === true
                );
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

            const templateConfig = templateResult.data.configuration || templateResult.data;
            const componentsToCheck = templateConfig.components;

            if (!componentsToCheck) {
                result.success = true; // Empty template is technically a success
                return result;
            }

            // 2. Define processing order (Dependencies First)
            // Motherboard -> Chassis -> CPU -> RAM -> Storage -> Others
            const processOrder = [
                'motherboard',
                'chassis',
                'cpu',
                'ram',
                'storage',
                'nic',
                'psu',
                'hbacard',
                'caddy',
                'pciecard'
            ];

            // 3. Process each type sequentially
            for (const type of processOrder) {
                if (componentsToCheck[type] && Array.isArray(componentsToCheck[type])) {
                    await this._processComponentType(
                        targetConfigUuid,
                        type,
                        componentsToCheck[type],
                        result
                    );
                }
            }

            result.success = true;
        } catch (error) {
            console.error('TemplateManager: Import failed', error);
            result.error = error.message;
            result.success = false;
        }

        result.durationMs = Date.now() - startTime;
        return result;
    }

    /**
     * Process a specific component type
     * Internal helper
     */
    async _processComponentType(targetUuid, type, templateItems, resultObj) {
        if (templateItems.length === 0) return;

        // Fetch available inventory for this type
        // available_only=true (default in API but good to be explicit if param exists)
        const inventoryResult = await serverAPI.getAvailableComponents(type, false, 100, { silent: true });

        // Normalize inventory list
        let availableInventory = [];
        if (inventoryResult.success && inventoryResult.data) {
            availableInventory = inventoryResult.data.components || [];
        }

        // Process each item in the template
        for (const item of templateItems) {
            const targetModel = item.product_name || item.model || item.name;

            if (!targetModel) {
                resultObj.skipped.push({
                    type,
                    model: 'Unknown',
                    reason: 'Missing model info in template'
                });
                continue;
            }

            // Find a match
            // Rules:
            // 1. Exact Model Name / Product Name match
            // 2. Must not be already "claimed" in this import session (though API would prevent double-add, we track locally for speed)

            const matchIndex = availableInventory.findIndex(invItem => {
                const invModel = invItem.product_name || invItem.model || invItem.name;
                return invModel === targetModel;
            });

            if (matchIndex !== -1) {
                // Match Found!
                const match = availableInventory[matchIndex];

                try {
                    const addResponse = await serverAPI.addComponentToServer(
                        targetUuid,
                        type,
                        match.uuid,
                        1,
                        item.slot_position || '',
                        false,
                        { silent: true }
                    );

                    if (addResponse.success) {
                        resultObj.added.push({
                            type,
                            model: targetModel,
                            uuid: match.uuid
                        });
                        // Remove from local inventory so we don't try to add it again for the next item
                        availableInventory.splice(matchIndex, 1);
                    } else {
                        resultObj.skipped.push({
                            type,
                            model: targetModel,
                            reason: 'API Error: ' + (addResponse.message || 'Unknown')
                        });
                    }
                } catch (e) {
                    resultObj.skipped.push({
                        type,
                        model: targetModel,
                        reason: 'Network/Server Error'
                    });
                }
            } else {
                // No Match
                resultObj.skipped.push({
                    type,
                    model: targetModel,
                    reason: 'Out of Stock / Not Available'
                });
            }
        }
    }
}

// Initialize globally
window.templateManager = new TemplateManager();
