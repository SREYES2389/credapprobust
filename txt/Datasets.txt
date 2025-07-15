/**
 * @fileoverview
 * This file contains all backend functions related to Datasets, Scans, and Matches.
 */

/**
 * Simulates starting a dataset scan, finding a match, and creating an alert.
 * @param {object} body The request body containing scan details.
 * @param {string} body.type The type of dataset to scan (e.g., 'OigExclusions').
 * @param {string} [body.providerId] The ID of the provider to scan.
 * @param {string} [body.facilityId] The ID of the facility to scan.
 * @returns {object} An object containing success status and the created scan data.
 */
function startDatasetScan(body) {
    try {
        if (!body.type || (!body.providerId && !body.facilityId)) {
            return { success: false, message: "Dataset type and either providerId or facilityId are required." };
        }

        const scansSheet = getSheet(DATASET_SCANS_SHEET_NAME, DATASET_SCANS_HEADERS);
        const matchesSheet = getSheet(DATASET_MATCHES_SHEET_NAME, DATASET_MATCHES_HEADERS);
        const alertsSheet = getSheet(ALERTS_SHEET_NAME, ALERTS_HEADERS);

        const scanId = Utilities.getUuid();
        const now = new Date();
        const startTime = now.toISOString();

        // Log initial "Working" status
        let scanRowData = [
            scanId, body.type, body.providerId || "", body.facilityId || "", "Working", startTime, "", "Manual",
            JSON.stringify(body.options || {}), "", "", "{}", "[]", "", "", "{}"
        ];
        scansSheet.appendRow(scanRowData);
        invalidateRowIndexCache(scansSheet);

        // --- Simulate finding a match ---
        const matchId = Utilities.getUuid();
        const matchData = {
            id: matchId,
            datasetTimestamp: startTime,
            recordTimestamp: startTime,
            data: { Name: "JOHN DOE", Address: "123 FAKE ST", Reason: "Fraud" },
            scanId: scanId,
            userActionNeeded: true,
            isIgnored: false,
            matchScore: { score: 0.95, recommendation: "Match" },
            matchRelevance: "High",
            createdTimestamp: startTime
        };

        const matchRowData = [
            matchData.id, matchData.datasetTimestamp, matchData.recordTimestamp, JSON.stringify(matchData.data),
            matchData.scanId, matchData.userActionNeeded, matchData.isIgnored, JSON.stringify(matchData.matchScore),
            "", "", matchData.matchRelevance, matchData.createdTimestamp, ""
        ];
        matchesSheet.appendRow(matchRowData);
        invalidateRowIndexCache(matchesSheet);

        // --- Simulate creating an alert for the match ---
        const alertId = Utilities.getUuid();
        const alertData = {
            id: alertId,
            providerId: body.providerId || "",
            facilityId: body.facilityId || "",
            type: "DatasetMatchFound",
            entityType: "DatasetRecord",
            entityId: matchId,
            timestamp: startTime,
            data: { messageTemplate: `High relevance match found in ${body.type} scan.` }
        };
        const alertRowData = [
            alertData.id, alertData.providerId, "", alertData.facilityId, alertData.type, alertData.entityType, alertData.entityId,
            alertData.timestamp, "", "", JSON.stringify(alertData.data)
        ];
        alertsSheet.appendRow(alertRowData);
        invalidateRowIndexCache(alertsSheet);

        // --- Update the scan to "Completed" ---
        const completedTime = new Date().toISOString();
        const scanResult = {
            id: scanId,
            status: "Completed",
            completed: completedTime,
            matches: [matchData] // Embed the match info
        };

        const idColIndex = DATASET_SCANS_HEADERS.indexOf("ID");
        const rowIndexMap = getOrCreateRowIndex(scansSheet, idColIndex);
        const rowNum = rowIndexMap.get(scanId);
        if (rowNum) {
            scansSheet.getRange(rowNum, DATASET_SCANS_HEADERS.indexOf("Status") + 1).setValue(scanResult.status);
            scansSheet.getRange(rowNum, DATASET_SCANS_HEADERS.indexOf("Completed") + 1).setValue(scanResult.completed);
            scansSheet.getRange(rowNum, DATASET_SCANS_HEADERS.indexOf("Matches (JSON)") + 1).setValue(JSON.stringify(scanResult.matches));
        }

        logAuditEvent("Request", `Dataset scan completed for ${body.providerId || body.facilityId}`, { scanId: scanId, type: body.type });
        return { success: true, data: scanResult };

    } catch (error) {
        logAuditEvent("Error", `Failed to start dataset scan: ${error.message}`);
        return { success: false, message: `Failed to start dataset scan: ${error.message}` };
    }
}

/**
 * Retrieves a single, specific scan record by its ID, including its child matches.
 * @param {string} scanId The ID of the scan to retrieve.
 * @returns {object} An object containing success status and the scan data.
 */
function getDatasetScanDetails(scanId) {
  // This function is a simple wrapper around the generic getEntityDetails.
  // No special enrichment is needed for a scan record.
  return getEntityDetails('DatasetScans', scanId);
}

function listDatasetScans(options = {}) {
    try {
        const { page = 1, pageSize = 15, searchTerm = '', sortBy = 'started', sortOrder = 'desc' } = options;

        const sheet = getSheet(DATASET_SCANS_SHEET_NAME, DATASET_SCANS_HEADERS);
        let allScans = sheetDataToObjects(sheet.getDataRange().getValues());

        // Enrich with entity names
        const providers = sheetDataToObjects(getSheet(PROVIDERS_SHEET_NAME, PROVIDERS_HEADERS).getDataRange().getValues());
        const facilities = sheetDataToObjects(getSheet(FACILITIES_SHEET_NAME, FACILITIES_HEADERS).getDataRange().getValues());
        const providerMap = new Map(providers.map(p => [p.id, `${p.firstName} ${p.lastName}`]));
        const facilityMap = new Map(facilities.map(f => [f.id, f.name]));

        allScans.forEach(scan => {
            if (scan.providerId) {
                scan.entityName = providerMap.get(scan.providerId) || 'Unknown Provider';
            } else if (scan.facilityId) {
                scan.entityName = facilityMap.get(scan.facilityId) || 'Unknown Facility';
            }
        });

        // Filtering
        if (searchTerm) {
            const lowercasedTerm = searchTerm.toLowerCase();
            allScans = allScans.filter(s =>
                (s.id && s.id.toLowerCase().includes(lowercasedTerm)) ||
                (s.type && s.type.toLowerCase().includes(lowercasedTerm)) ||
                (s.status && s.status.toLowerCase().includes(lowercasedTerm)) ||
                (s.entityName && s.entityName.toLowerCase().includes(lowercasedTerm))
            );
        }

        // Sorting
        allScans.sort((a, b) => {
            const valA = a[sortBy] || '';
            const valB = b[sortBy] || '';

            let comparison = 0;
            if (sortBy.includes('started') || sortBy.includes('completed')) {
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

        const totalRecords = allScans.length;
        const startIndex = (page - 1) * pageSize;
        const paginatedData = allScans.slice(startIndex, startIndex + pageSize);

        return { success: true, data: paginatedData, totalRecords: totalRecords };
    } catch (error) {
        logAuditEvent("Error", `Failed to list dataset scans: ${error.message}`);
        return { success: false, message: `Failed to list dataset scans: ${error.message}` };
    }
}

function listDatasetMatches(query = {}) {
    try {
        const sheet = getSheet(DATASET_MATCHES_SHEET_NAME, DATASET_MATCHES_HEADERS);
        let allMatches = sheetDataToObjects(sheet.getDataRange().getValues());

        if (query.scanId) {
            allMatches = allMatches.filter(m => m.scanId === query.scanId);
        }
        if (query.userActionNeeded) {
            allMatches = allMatches.filter(m => m.userActionNeeded === true);
        }
        // Add more filters as needed

        // Sort by created timestamp descending
        allMatches.sort((a, b) => new Date(b.createdTimestamp) - new Date(a.createdTimestamp));

        return { success: true, data: allMatches };
    } catch (error) {
        logAuditEvent("Error", `Failed to list dataset matches: ${error.message}`);
        return { success: false, message: `Failed to list dataset matches: ${error.message}` };
    }
}

function patchDatasetMatch(matchId, body) {
    try {
        const result = patchDetailedInfo(DATASET_MATCHES_SHEET_NAME, matchId, body);
        if (result.success) {
            logAuditEvent("Request", `Dataset match patched: ${matchId}`, { matchId: matchId, newData: body });
        }
        return result;
    } catch (error) {
        logAuditEvent("Error", `Failed to patch dataset match ${matchId}: ${error.message}`);
        return { success: false, message: `Failed to patch dataset match: ${error.message}` };
    }
}

/**
 * Retrieves metadata for all available dataset sources.
 * @returns {object} An object containing success status and a list of dataset metadata.
 */
function listDatasets() {
    try {
        const sheet = getSheet(DATASETS_METADATA_SHEET_NAME, DATASETS_METADATA_HEADERS);
        const datasets = sheetDataToObjects(sheet.getDataRange().getValues());
        return { success: true, data: datasets };
    } catch (error) {
        logAuditEvent("Error", `Failed to list datasets: ${error.message}`);
        return { success: false, message: `Failed to list datasets: ${error.message}` };
    }
}

/**
 * Retrieves metadata for a single dataset source by its name.
 * @param {string} datasetName The name of the dataset (e.g., 'OigExclusions').
 * @returns {object} An object containing success status and the dataset metadata.
 */
function getDataset(datasetName) {
    try {
        if (!datasetName) { return { success: false, message: "Dataset name is required." }; }
        const sheet = getSheet(DATASETS_METADATA_SHEET_NAME, DATASETS_METADATA_HEADERS);
        const allDatasets = sheetDataToObjects(sheet.getDataRange().getValues());
        const dataset = allDatasets.find(d => d.name === datasetName);
        if (!dataset) { return { success: false, message: `Dataset with name ${datasetName} not found.` }; }
        return { success: true, data: dataset };
    } catch (error) {
        logAuditEvent("Error", `Failed to get dataset ${datasetName}: ${error.message}`);
        return { success: false, message: `Failed to get dataset: ${error.message}` };
    }
}