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

            // 2. Define processing order (Dependencies First)
            // Motherboard -> Chassis -> CPU -> RAM -> Storage -> Others
            const processOrder = [
                'motherboard',
                'chassis',
                'cpu',
                'ram',
                'storage',
                'nic',
                'hbacard',
                'caddy',
                'pciecard',
                'sfp'
            ];

            // 3. Identify which types are actually in the template
            const typesInTemplate = processOrder.filter(
                type => componentsToCheck[type] && Array.isArray(componentsToCheck[type]) && componentsToCheck[type].length > 0
            );

            // 4. Fetch all inventories in parallel (single batch of API calls)
            const inventoryMap = {};
            const inventoryPromises = typesInTemplate.map(async (type) => {
                const res = await serverAPI.getAvailableComponents(type, false, 100, { silent: true });
                inventoryMap[type] = (res.success && res.data) ? (res.data.components || []) : [];
            });
            await Promise.all(inventoryPromises);

            // 5. Process each type sequentially (add-component calls must be sequential for validation)
            for (const type of typesInTemplate) {
                await this._processComponentTypeWithInventory(
                    targetConfigUuid,
                    type,
                    componentsToCheck[type],
                    inventoryMap[type],
                    result
                );
            }

            result.success = true;
        } catch (error) {
            result.error = error.message;
            result.success = false;
        }

        result.durationMs = Date.now() - startTime;
        return result;
    }

    /**
     * Process a specific component type with pre-fetched inventory
     * @param {string} targetUuid - Target server config UUID
     * @param {string} type - Component type
     * @param {Array} templateItems - Components from template
     * @param {Array} availableInventory - Pre-fetched available inventory for this type
     * @param {Object} resultObj - Result accumulator
     */
    async _processComponentTypeWithInventory(targetUuid, type, templateItems, availableInventory, resultObj) {
        if (templateItems.length === 0) return;

        // Work with a copy so we can track claims without mutating the original
        availableInventory = [...availableInventory];

        // Process each item in the template
        for (const item of templateItems) {
            const templateUuid = item.uuid;
            const displayName = item.component_name || item.product_name || item.model || item.name || 'Unknown';

            if (!templateUuid) {
                resultObj.skipped.push({ type, model: displayName, reason: 'Missing UUID in template' });
                continue;
            }

            // Match by spec UUID — both template and inventory reference the same ims-data spec UUIDs
            const matchIndex = availableInventory.findIndex(invItem => {
                const invUuid = invItem.UUID || invItem.uuid;
                return invUuid === templateUuid;
            });

            if (matchIndex !== -1) {
                const match = availableInventory[matchIndex];
                const matchUuid = match.UUID || match.uuid;

                try {
                    const addResponse = await serverAPI.addComponentToServer(
                        targetUuid,
                        type,
                        matchUuid,
                        1,
                        item.slot_position || '',
                        false,
                        { silent: true }
                    );

                    if (addResponse.success) {
                        resultObj.added.push({ type, model: displayName, uuid: matchUuid });
                        availableInventory.splice(matchIndex, 1);
                    } else {
                        resultObj.skipped.push({
                            type,
                            model: displayName,
                            reason: 'API rejected: ' + (addResponse.message || 'Unknown')
                        });
                    }
                } catch (e) {
                    resultObj.skipped.push({ type, model: displayName, reason: 'Network/Server Error' });
                }
            } else {
                const reason = availableInventory.length === 0
                    ? `No ${type} inventory available`
                    : `No matching inventory (${availableInventory.length} other models in stock)`;
                resultObj.skipped.push({ type, model: displayName, reason });
            }
        }
    }
}

// Initialize globally
window.templateManager = new TemplateManager();
