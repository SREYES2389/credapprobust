/**
 * @fileoverview
 * This file contains all backend functions related to retrieving and managing Alerts.
 */

/**
 * Retrieves a single alert by its ID.
 * @param {string} alertId The ID of the alert to retrieve.
 * @returns {object} An object containing success status and the alert data.
 */
function getAlert(alertId) {
    try {
        if (!alertId) { return { success: false, message: "Alert ID is required." }; }
        const sheet = getSheet(ALERTS_SHEET_NAME, ALERTS_HEADERS);
        const allAlerts = sheetDataToObjects(sheet.getDataRange().getValues());
        const alert = allAlerts.find(a => a.id === alertId);
        if (!alert) { return { success: false, message: `Alert with ID ${alertId} not found.` }; }

        if (alert.providerId) {
            const provider = sheetDataToObjects(getSheet(PROVIDERS_SHEET_NAME, PROVIDERS_HEADERS).getDataRange().getValues()).find(p => p.id === alert.providerId);
            alert.entityName = provider ? `${provider.firstName} ${provider.lastName}` : 'Unknown Provider';
        } else if (alert.facilityId) {
            const facility = sheetDataToObjects(getSheet(FACILITIES_SHEET_NAME, FACILITIES_HEADERS).getDataRange().getValues()).find(f => f.id === alert.facilityId);
            alert.entityName = facility ? facility.name : 'Unknown Facility';
        }
        return { success: true, data: alert };
    } catch (error) {
        logAuditEvent("Error", `Failed to get alert ${alertId}: ${error.message}`);
        return { success: false, message: `Failed to get alert: ${error.message}` };
    }
}

/**
 * Gets summary counts of active alerts by type.
 * @returns {object} An object containing success status and alert aggregations.
 */
function getAlertAggregations() {
    try {
        const sheet = getSheet(ALERTS_SHEET_NAME, ALERTS_HEADERS);
        const activeAlerts = sheetDataToObjects(sheet.getDataRange().getValues()).filter(a => !a.dismissalTimestamp);
        const aggregations = activeAlerts.reduce((acc, alert) => { const type = alert.type || 'Unknown'; acc[type] = (acc[type] || 0) + 1; return acc; }, {});
        return { success: true, data: aggregations };
    } catch (error) {
        logAuditEvent("Error", `Failed to get alert aggregations: ${error.message}`);
        return { success: false, message: `Failed to get alert aggregations: ${error.message}` };
    }
}

function listAlerts(query = {}) {
    try {
        const sheet = getSheet(ALERTS_SHEET_NAME, ALERTS_HEADERS);
        let allAlerts = sheetDataToObjects(sheet.getDataRange().getValues());

        if (query.providerId) {
            allAlerts = allAlerts.filter(a => a.providerId === query.providerId);
        }
        if (query.status === 'active') {
            allAlerts = allAlerts.filter(a => !a.dismissalTimestamp);
        } else if (query.status === 'dismissed') {
            allAlerts = allAlerts.filter(a => !!a.dismissalTimestamp);
        }
        // Add more filters as needed

        return { success: true, data: allAlerts };
    } catch (error) {
        logAuditEvent("Error", `Failed to list alerts: ${error.message}`);
        return { success: false, message: `Failed to list alerts: ${error.message}` };
    }
}

function dismissAlert(alertId, body) {
    try {
        const dataToUpdate = {
            dismissalTimestamp: new Date().toISOString(),
            dismissalNote: body.dismissalNote || ""
        };
        const result = patchDetailedInfo(ALERTS_SHEET_NAME, alertId, dataToUpdate);
        if (result.success) {
            logAuditEvent("Request", `Alert dismissed: ${alertId}`, { alertId: alertId });
        }
        return result;
    } catch (error) {
        logAuditEvent("Error", `Failed to dismiss alert ${alertId}: ${error.message}`);
        return { success: false, message: `Failed to dismiss alert: ${error.message}` };
    }
}

/**
 * Dismisses multiple alerts in bulk.
 * @param {Array<string>} alertIds An array of alert IDs to dismiss.
 * @param {string} dismissalNote A note to add to each dismissed alert.
 * @returns {object} A success or error message.
 */
function bulkDismissAlerts(alertIds, dismissalNote) {
    if (!alertIds || !Array.isArray(alertIds) || alertIds.length === 0) {
        return { success: false, message: "Alert IDs are required for bulk dismissal." };
    }
    try {
        const sheet = getSheet(ALERTS_SHEET_NAME, ALERTS_HEADERS);
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const idColIndex = headers.indexOf("ID");
        const dismissalTimestampColIndex = headers.indexOf("Dismissal Timestamp");
        const dismissalNoteColIndex = headers.indexOf("Dismissal Note");

        if (idColIndex === -1 || dismissalTimestampColIndex === -1 || dismissalNoteColIndex === -1) {
            throw new Error("Required columns not found in Alerts sheet.");
        }

        const rowIndexMap = getOrCreateRowIndex(sheet, idColIndex);
        let updatedCount = 0;
        const now = new Date().toISOString();
        const note = dismissalNote || "Dismissed via bulk action.";

        alertIds.forEach(id => {
            const rowNum = rowIndexMap.get(id);
            if (rowNum) {
                sheet.getRange(rowNum, dismissalTimestampColIndex + 1).setValue(now);
                sheet.getRange(rowNum, dismissalNoteColIndex + 1).setValue(note);
                updatedCount++;
            }
        });

        if (updatedCount > 0) {
            logAuditEvent("Request", `Bulk dismissed ${updatedCount} alerts.`, { alertIds: alertIds, dismissalNote: note });
            return { success: true, message: `Successfully dismissed ${updatedCount} alerts.` };
        } else {
            return { success: false, message: "No matching alerts found to dismiss." };
        }
    } catch (e) {
        logAuditEvent("Error", `Bulk alert dismissal failed: ${e.message}`);
        return { success: false, message: `Bulk dismissal failed: ${e.message}` };
    }
}