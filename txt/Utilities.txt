/**
 * @fileoverview
 * This file contains general utility functions used throughout the application,
 * such as logging, Drive folder management, and data transformation.
 */

/**
 * Converts an array of objects to a 2D array of values, based on a given header order.
 * This makes data creation independent of column order in the schema.
 * @param {Array<object>} dataObjects The array of data objects.
 * @param {Array<string>} headers The array of headers defining the column order.
 * @returns {Array<Array<any>>} A 2D array of values ready for insertion into a sheet.
 */
function mapObjectsToRows(dataObjects, headers) {
    return dataObjects.map(obj => headers.map(header => {
        const value = obj[header];
        // Handle objects that need to be stringified for JSON columns
        if (header.includes(JSON_SUFFIX) && typeof value === 'object' && value !== null) {
            return JSON.stringify(value);
        }
        return value !== undefined ? value : "";
    }));
}

/**
 * Logs an audit event to the 'AuditEvents' sheet.
 * @param {string} type The type of event (e.g., "Request", "Error").
 * @param {string} message A description of the event.
 * @param {object} [context={}] Additional context to log as a JSON string.
 */
function logAuditEvent(type, message, context = {}) {
    try {
        const newId = Utilities.getUuid();
        const auditEventObject = {
            [ID_COLUMN]: newId,
            "Timestamp": new Date().toISOString(),
            "Type": type,
            "Message": message,
            "Correlation ID": context.correlationId || "",
            "Context (JSON)": context
        };

        const row = mapObjectsToRows([auditEventObject], AUDIT_EVENTS_HEADERS)[0];
        const sheet = getSheet(AUDIT_EVENTS_SHEET_NAME, AUDIT_EVENTS_HEADERS);
        sheet.appendRow(row);
    } catch (e) {
        console.error(`Failed to log audit event: ${e.message}`);
    }
}

/**
 * Gets or creates a dedicated folder in Google Drive for file uploads.
 * Caches the folder ID in PropertiesService for efficiency.
 * @returns {GoogleAppsScript.Drive.Folder} The folder object.
 */
function getUploadFolder() {
    const properties = PropertiesService.getScriptProperties();
    const folderId = properties.getProperty('uploadFolderId');

    if (folderId) {
        try {
            return DriveApp.getFolderById(folderId);
        } catch (e) {
            // Folder might have been deleted, fall through to create a new one
        }
    }

    const folderName = "WebAppUploads";
    const folders = DriveApp.getFoldersByName(folderName);

    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    properties.setProperty('uploadFolderId', folder.getId());
    return folder;
}

/**
 * Gets or creates a dedicated folder in Google Drive for generated reports.
 * Caches the folder ID in PropertiesService for efficiency.
 * @returns {GoogleAppsScript.Drive.Folder} The folder object.
 */
function getReportFolder() {
    const properties = PropertiesService.getScriptProperties();
    const folderId = properties.getProperty('reportFolderId');

    if (folderId) {
        try {
            return DriveApp.getFolderById(folderId);
        } catch (e) { /* Folder might have been deleted, fall through */ }
    }

    const folderName = "GeneratedReports";
    const folders = DriveApp.getFoldersByName(folderName);
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    properties.setProperty('reportFolderId', folder.getId());
    return folder;
}

/**
 * Gets or creates a dedicated folder in Google Drive for generated reports.
 * Caches the folder ID in PropertiesService for efficiency.
 * @returns {GoogleAppsScript.Drive.Folder} The folder object.
 */
function getReportFolder() {
    const properties = PropertiesService.getScriptProperties();
    const folderId = properties.getProperty('reportFolderId');

    if (folderId) {
        try {
            return DriveApp.getFolderById(folderId);
        } catch (e) { /* Folder might have been deleted, fall through */ }
    }

    const folderName = "GeneratedReports";
    const folders = DriveApp.getFoldersByName(folderName);
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    properties.setProperty('reportFolderId', folder.getId());
    return folder;
}