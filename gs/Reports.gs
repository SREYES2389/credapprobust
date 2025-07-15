/**
 * @fileoverview
 * This file contains all backend functions related to generating, listing,
 * This file contains all backend functions related to generating, listing,
 * and deleting reports.
 */

/**
 * Main function to trigger the generation of a new report. This acts as a controller.
 * @param {string} reportType The type of report to generate (e.g., 'Roster').
 * @param {object} [parameters={}] An object containing user-defined parameters for the report.
 * @returns {object} A success or error message.
 */
function generateReport(reportType, parameters = {}) {
    const reportsSheet = getSheet(REPORTS_SHEET_NAME, REPORTS_HEADERS);
    const reportId = Utilities.getUuid();
    const startTime = new Date().toISOString();

    // Log the initial "Working" status to give immediate feedback to the UI
    reportsSheet.appendRow([reportId, "", "", reportType, "Working", startTime, "", ""]);
    invalidateRowIndexCache(reportsSheet);

    let reportResult;
    try {
        switch (reportType) {
            case 'Roster':
                reportResult = _createRosterReport(parameters);
                break;
            // Add cases for other report types here in the future
            // case 'Enrollments':
            //   reportResult = _createEnrollmentsReport(parameters);
            //   break;
            default:
                throw new Error(`Report type '${reportType}' is not supported.`);
        }

        // Update the report record with the final status and path
        const idColIndex = REPORTS_HEADERS.indexOf("ID");
        const rowIndexMap = getOrCreateRowIndex(reportsSheet, idColIndex);
        const rowNum = rowIndexMap.get(reportId);
        if (rowNum) {
            reportsSheet.getRange(rowNum, REPORTS_HEADERS.indexOf("Status") + 1).setValue("Completed");
            reportsSheet.getRange(rowNum, REPORTS_HEADERS.indexOf("CompletedAt") + 1).setValue(new Date().toISOString());
            reportsSheet.getRange(rowNum, REPORTS_HEADERS.indexOf("Path") + 1).setValue(reportResult.path);
        }

        logAuditEvent("Request", `Report generated: ${reportType}`, { reportId: reportId, path: reportResult.path });
        return { success: true, message: `${reportType} report generated successfully.` };

    } catch (error) {
        // Update the report record to "Failed"
        const idColIndex = REPORTS_HEADERS.indexOf("ID");
        const rowIndexMap = getOrCreateRowIndex(reportsSheet, idColIndex);
        const rowNum = rowIndexMap.get(reportId);
        if (rowNum) {
            reportsSheet.getRange(rowNum, REPORTS_HEADERS.indexOf("Status") + 1).setValue("Failed");
            reportsSheet.getRange(rowNum, REPORTS_HEADERS.indexOf("CompletedAt") + 1).setValue(new Date().toISOString());
        }
        logAuditEvent("Error", `Failed to generate report '${reportType}': ${error.message}`);
        return { success: false, message: `Failed to generate report: ${error.message}` };
    }
}

/**
 * Creates a Roster report CSV file in Google Drive. This is a private helper function.
 * @param {object} parameters - The parameters for filtering the report.
 * @param {string} [parameters.status] - An optional credentialing status to filter by.
 * @returns {{path: string}} An object containing the URL of the generated file.
 * @private
 */
function _createRosterReport(parameters) {
    let providers = sheetDataToObjects(getSheet(PROVIDERS_SHEET_NAME, PROVIDERS_HEADERS).getDataRange().getValues());

    // Apply parameters
    if (parameters && parameters.status) {
        providers = providers.filter(p => p.credentialingStatus === parameters.status);
    }

    const csvString = convertObjectsToCsvString(PROVIDERS_HEADERS, providers);
    const reportFolder = getReportFolder();
    const fileName = `Roster_Report_${new Date().toISOString().replace(/:/g, '-')}.csv`;
    const file = reportFolder.createFile(fileName, csvString, MimeType.CSV);
    
    return { path: file.getUrl() };
}

/**
 * Generic function to list generated reports, filtered by type.
 * @param {string} reportType The type of report to filter by (e.g., 'Roster', 'Enrollments').
 * @returns {object} An object containing success status and the list of reports.
 */
function listGeneratedReports(reportType) {
    try {
        const sheet = getSheet(REPORTS_SHEET_NAME, REPORTS_HEADERS);
        let allReports = sheetDataToObjects(sheet.getDataRange().getValues());

        if (reportType) {
            allReports = allReports.filter(report => report.type && report.type.toLowerCase() === reportType.toLowerCase());
        }

        allReports.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

        return { success: true, data: allReports };
    } catch (error) {
        logAuditEvent("Error", `Failed to list generated reports of type ${reportType}: ${error.message}`);
        return { success: false, message: `Failed to list generated reports: ${error.message}` };
    }
}

/**
 * Deletes a generated report file from Drive and its metadata from the sheet.
 * @param {string} reportId The ID of the report record to delete.
 * @param {string} filePath The full URL of the report file in Google Drive.
 * @returns {object} A success or error message.
 */
function deleteGeneratedReport(reportId, filePath) {
    try {
        if (!reportId) {
            return { success: false, message: "Report ID is required." };
        }

        // 1. Delete the file from Google Drive if a path exists
        if (filePath && filePath.includes('drive.google.com')) {
            try {
                // Extract file ID from the URL
                const fileId = filePath.match(/id=([^&]+)/)[1];
                if (fileId) {
                    DriveApp.getFileById(fileId).setTrashed(true);
                }
            } catch (e) {
                // Log a warning if file deletion fails, but proceed to delete metadata
                console.warn(`Could not delete report file from Drive for report ${reportId}. It might already be deleted. Error: ${e.message}`);
                logAuditEvent("Warning", `Could not delete file for report ${reportId}. Path: ${filePath}`, { error: e.message });
            }
        }

        // 2. Delete the metadata record from the Reports sheet
        const result = deleteDetailedProviderInfo(REPORTS_SHEET_NAME, REPORTS_HEADERS, reportId);

        if (result.success) {
            logAuditEvent("Request", `Report metadata deleted: ${reportId}`, { reportId: reportId });
        } else {
          // If the record was already gone, that's okay.
          result.success = true;
          result.message = "Report metadata and file deleted successfully.";
        }
        return result;

    } catch (e) {
        logAuditEvent("Error", `Failed to delete report ${reportId}: ${e.message}`);
        return { success: false, message: `Failed to delete report: ${e.message}` };
    }
}

/**
 * Converts an array of JavaScript objects into a CSV string.
 * This is a helper for all CSV export/generation functions.
 * @param {Array<string>} headers - An array of header names in the desired order.
 * @param {Array<object>} data - An array of objects to convert.
 * @returns {string} The CSV formatted string.
 */
function convertObjectsToCsvString(headers, data) {
    if (!data || data.length === 0) {
        return headers.join(',') + '\n'; // Return headers even if no data
    }

    // Map camelCase object keys back to original header names for correct value extraction
    const headerKeyMap = new Map();
    headers.forEach(header => {
        const key = header.replace(/(?:^|\s)\S/g, a => a.toUpperCase()).replace(/\s/g, '').replace(/\(JSON\)/g, '');
        const finalKey = key.charAt(0).toLowerCase() + key.slice(1);
        headerKeyMap.set(header, finalKey);
    });

    const csvRows = [];
    csvRows.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',')); // Header row, always quoted

    data.forEach(rowObject => {
        const values = headers.map(header => {
            const key = headerKeyMap.get(header);
            let value = rowObject[key];

            if (value === null || value === undefined) {
                value = '';
            } else if (typeof value === 'object') {
                value = JSON.stringify(value); // Stringify JSON objects/arrays
            } else {
                value = String(value); // Ensure all values are strings
            }

            // Escape double quotes and enclose in double quotes
            value = '"' + value.replace(/"/g, '""') + '"';
            return value;
        });
        csvRows.push(values.join(','));
    });

    return csvRows.join('\n');
}

/**
 * Exports providers to a CSV string, respecting search and sort options.
 * @param {object} options Options for filtering and sorting, same as getProviders.
 * @returns {object} A success object with the CSV string data and filename.
 */
function exportProvidersToCsv(options = {}) {
    try {
        // Re-use the getProviders logic but without pagination to get all matching records
        const getProvidersResult = getProviders({ ...options, page: 1, pageSize: 5000 }); // High page size to get all
        if (!getProvidersResult.success) {
            return getProvidersResult; // Propagate error
        }

        const csvString = convertObjectsToCsvString(PROVIDERS_HEADERS, getProvidersResult.data);
        return { success: true, data: csvString, filename: `providers_export_${new Date().toISOString().split('T')[0]}.csv` };
    } catch (error) {
        logAuditEvent("Error", `Failed to export providers to CSV: ${error.message}`);
        return { success: false, message: `Failed to export providers: ${error.message}` };
    }
}

/**
 * Exports facilities to a CSV string, respecting search and sort options.
 * @param {object} options Options for filtering and sorting, same as getFacilities.
 * @returns {object} A success object with the CSV string data and filename.
 */
function exportFacilitiesToCsv(options = {}) {
    try {
        const getFacilitiesResult = getFacilities({ ...options, page: 1, pageSize: 5000 }); // High page size to get all
        if (!getFacilitiesResult.success) {
            return getFacilitiesResult;
        }
        const csvString = convertObjectsToCsvString(FACILITIES_HEADERS, getFacilitiesResult.data);
        return { success: true, data: csvString, filename: `facilities_export_${new Date().toISOString().split('T')[0]}.csv` };
    } catch (error) {
        logAuditEvent("Error", `Failed to export facilities to CSV: ${error.message}`);
        return { success: false, message: `Failed to export facilities: ${error.message}` };
    }
}