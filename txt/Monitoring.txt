/**
 * @fileoverview
 * This file contains all backend functions related to creating and managing
 * monitoring jobs for providers and licenses.
 */

function createMonitor(body) {
    try {
        if (!body.type || !body.providerId || (!body.datasetType && !body.licenseId)) {
            return { success: false, message: "Type, providerId, and either datasetType or licenseId are required." };
        }
        const sheet = getSheet(MONITORS_SHEET_NAME, MONITORS_HEADERS);
        const newId = Utilities.getUuid();
        const now = new Date();
        const nextMonitoringDate = new Date(now.setDate(now.getDate() + 30)).toISOString(); // Default to 30 days

        const rowData = [
            newId, body.type, body.providerId, body.datasetType || "", body.licenseId || "",
            body.monitoringInterval || "Monthly", nextMonitoringDate, "", "", JSON.stringify(body.options || {})
        ];
        sheet.appendRow(rowData);
        invalidateRowIndexCache(sheet);

        logAuditEvent("Request", `Monitor created for provider ${body.providerId}`, { monitorId: newId, type: body.type });
        return { success: true, message: `Monitor created with ID: ${newId}` };
    } catch (error) {
        logAuditEvent("Error", `Failed to create monitor: ${error.message}`);
        return { success: false, message: `Failed to create monitor: ${error.message}` };
    }
}

function listMonitors(options = {}) {
    try {
        const { page = 1, pageSize = 15, searchTerm = '', sortBy = 'nextMonitoringDate', sortOrder = 'asc' } = options;

        const sheet = getSheet(MONITORS_SHEET_NAME, MONITORS_HEADERS);
        let allMonitors = sheetDataToObjects(sheet.getDataRange().getValues());

        // Enrich with Provider Names for searching and display
        const providersSheet = getSheet(PROVIDERS_SHEET_NAME, PROVIDERS_HEADERS);
        const allProviders = sheetDataToObjects(providersSheet.getDataRange().getValues());
        const providerMap = new Map(allProviders.map(p => [p.id, `${p.firstName} ${p.lastName}`]));

        allMonitors.forEach(monitor => {
            monitor.providerName = providerMap.get(monitor.providerId) || 'Unknown Provider';
        });

        // Filtering
        if (searchTerm) {
            const lowercasedTerm = searchTerm.toLowerCase();
            allMonitors = allMonitors.filter(m =>
                (m.id && m.id.toLowerCase().includes(lowercasedTerm)) ||
                (m.type && m.type.toLowerCase().includes(lowercasedTerm)) ||
                (m.providerId && m.providerId.toLowerCase().includes(lowercasedTerm)) ||
                (m.providerName && m.providerName.toLowerCase().includes(lowercasedTerm)) ||
                (m.datasetType && m.datasetType.toLowerCase().includes(lowercasedTerm)) ||
                (m.licenseId && m.licenseId.toLowerCase().includes(lowercasedTerm))
            );
        }

        // Sorting
        allMonitors.sort((a, b) => {
            const valA = a[sortBy] || '';
            const valB = b[sortBy] || '';

            let comparison = 0;
            if (sortBy.includes('Date')) {
                comparison = new Date(valA) > new Date(valB) ? 1 : -1;
            } else {
                if (String(valA).toLowerCase() > String(valB).toLowerCase()) {
                    comparison = 1;
                } else if (String(valA).toLowerCase() < String(valB).toLowerCase()) {
                    comparison = -1;
                }
            }
            return sortOrder === 'desc' ? comparison * -1 : comparison;
        });

        const totalRecords = allMonitors.length;
        const startIndex = (page - 1) * pageSize;
        const paginatedData = allMonitors.slice(startIndex, startIndex + pageSize);

        return { success: true, data: paginatedData, totalRecords: totalRecords };
    } catch (error) {
        logAuditEvent("Error", `Failed to list monitors: ${error.message}`);
        return { success: false, message: `Failed to list monitors: ${error.message}` };
    }
}

function deleteMonitor(monitorId) {
    const result = deleteDetailedProviderInfo(MONITORS_SHEET_NAME, MONITORS_HEADERS, monitorId);
    if (result.success) {
        logAuditEvent("Request", `Monitor deleted: ${monitorId}`, { monitorId: monitorId });
    }
    return result;
}

/**
 * Updates an existing monitor record.
 * @param {string} monitorId The ID of the monitor to update.
 * @param {object} body The data to patch.
 * @returns {object} A success or error message.
 */
function patchMonitor(monitorId, body) {
    try {
        const result = patchDetailedInfo(MONITORS_SHEET_NAME, monitorId, body);
        if (result.success) {
            logAuditEvent("Request", `Monitor patched: ${monitorId}`, { monitorId: monitorId, newData: body });
        }
        return result;
    } catch (error) {
        logAuditEvent("Error", `Failed to patch monitor ${monitorId}: ${error.message}`);
        return { success: false, message: `Failed to patch monitor: ${error.message}` };
    }
}

/**
 * Creates the standard set of sanctions and exclusions monitors for a list of providers.
 * @param {Array<string>} providerIds An array of provider IDs to create monitors for.
 * @returns {object} A success or error message with a summary of actions.
 */
function bulkCreateSanctionsAndExclusionsMonitors(providerIds) {
    try {
        if (!providerIds || !Array.isArray(providerIds) || providerIds.length === 0) {
            return { success: false, message: "An array of provider IDs is required." };
        }
        const SANCTIONS_DATASETS = ['OigExclusions', 'Sam', 'StateSanctionsAndExclusions'];
        const monitorsSheet = getSheet(MONITORS_SHEET_NAME, MONITORS_HEADERS);
        const allMonitors = sheetDataToObjects(monitorsSheet.getDataRange().getValues());

        let createdCount = 0;
        providerIds.forEach(providerId => {
            SANCTIONS_DATASETS.forEach(datasetType => {
                const alreadyExists = allMonitors.some(m => m.providerId === providerId && m.datasetType === datasetType);
                if (!alreadyExists) {
                    const monitorData = { type: 'Dataset', providerId: providerId, datasetType: datasetType, monitoringInterval: 'Continuous' };
                    const result = createMonitor(monitorData);
                    if (result.success) createdCount++;
                }
            });
        });
        return { success: true, message: `Bulk operation complete. Created ${createdCount} new sanctions and exclusions monitors.` };
    } catch (error) {
        logAuditEvent("Error", `Failed to bulk create monitors: ${error.message}`);
        return { success: false, message: `Failed to bulk create monitors: ${error.message}` };
    }
}