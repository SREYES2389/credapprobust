/**
 * @fileoverview
 * This file contains functions for data access and manipulation in Google Sheets.
 * It includes functions for getting sheets, transforming data, caching, and CRUD operations.
 */

/**
 * Gets the active spreadsheet and the specified sheet.
 * Initializes headers and mock data if the sheet is new.
 */
function getSheet(sheetName, sheetHeaders) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
        throw new Error("No active spreadsheet found. Please run this script from a Google Sheet.");
    }
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        sheet.appendRow(sheetHeaders); // Corrected: use sheetHeaders here
        // Populate mock data for specific sheets if newly created
        if (sheetName === FACILITY_TAXONOMIES_SHEET_NAME) {
            populateMockFacilityTaxonomies(sheet);
        } else if (sheetName === LICENSE_SOURCE_STATUS_SHEET_NAME) {
            populateMockLicenseSourceStatus(sheet);
        } else if (sheetName === DATASETS_METADATA_SHEET_NAME) {
            populateMockDatasetsMetadata(sheet);
        } else if (sheetName === PAYERS_SHEET_NAME) {
            populateMockPayers(sheet);
        } else if (sheetName === COUNTRIES_SHEET_NAME) { // This block can be expanded or removed if addMockData is the primary method
            populateMockCountries(sheet);
        } else if (sheetName === FACILITY_LICENSE_TYPES_SHEET_NAME) {
            // Fallback mock data population can be added here if needed.
        }
    }
    return sheet;
}

/**
 * Converts a 2D array of sheet data (with headers) into an array of objects.
 * @param {Array<Array<any>>} values The 2D array from sheet.getDataRange().getValues().
 * @returns {Array<object>} An array of objects representing the sheet rows.
 */
function sheetDataToObjects(values) {
    if (values.length <= 1) return [];
    const headers = values[0];
    const data = [];
    for (let i = 1; i < values.length; i++) {
        const row = values[i];
        const obj = {};
        for (let j = 0; j < headers.length; j++) {
            const originalHeader = headers[j];
            const key = originalHeader.replace(/(?:^|\s)\S/g, a => a.toUpperCase()).replace(/\s/g, '').replace(/\(JSON\)/g, '');
            const finalKey = key.charAt(0).toLowerCase() + key.slice(1);
            let value = row[j];
            // Check for boolean-like columns based on naming conventions and constants
            if (originalHeader.startsWith("Is ") ||
                originalHeader.startsWith("Includes ") ||
                originalHeader === DEACTIVATED_COLUMN ||
                originalHeader === USER_ACTION_NEEDED_COLUMN ||
                originalHeader === HAS_PASS_THROUGH_FEE_COLUMN) {
                value = (value === true || String(value).toLowerCase() === "true");
            } else if (originalHeader.includes(JSON_SUFFIX) && typeof value === 'string' && value) {
                try { value = JSON.parse(value); } catch (e) { console.error(`Failed to parse JSON in '${originalHeader}':`, value, e); value = {}; }
            }
            obj[finalKey] = value;
        }
        data.push(obj);
    }
    return data;
}

/**
 * Creates and caches a Map of record IDs to their row numbers for fast lookups.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The sheet to index.
 * @param {number} idColumnIndex The 0-based index of the 'ID' column.
 * @returns {Map<string, number>} A map where keys are IDs and values are row numbers.
 */
function getOrCreateRowIndex(sheet, idColumnIndex) {
    const cache = CacheService.getScriptCache();
    const cacheKey = `${sheet.getParent().getId()}_${sheet.getName()}_rowIndex`;
    const cachedIndex = cache.get(cacheKey);
    if (cachedIndex) return new Map(JSON.parse(cachedIndex));
    const data = sheet.getDataRange().getValues();
    const index = new Map();
    for (let i = 1; i < data.length; i++) {
        index.set(data[i][idColumnIndex], i + 1);
    }
    cache.put(cacheKey, JSON.stringify(Array.from(index.entries())), 3600);
    return index;
}

/**
 * Removes the row index for a given sheet from the cache.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The sheet whose cache should be invalidated.
 */
function invalidateRowIndexCache(sheet) {
    const cache = CacheService.getScriptCache();
    const cacheKey = `${sheet.getParent().getId()}_${sheet.getName()}_rowIndex`;
    cache.remove(cacheKey);
}

/**
 * A helper to get all data from a sheet and cache it for a short time to improve performance.
 * @param {string} sheetName The name of the sheet.
 * @param {Array<string>} headers The headers for the sheet.
 * @returns {Array<object>} The array of objects from the sheet.
 */
function getCachedSheetData(sheetName, headers) {
    const cache = CacheService.getScriptCache();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cacheKey = `${ss.getId()}_${sheetName}_data`;
    const cached = cache.get(cacheKey);
    if (cached) {
        return JSON.parse(cached);
    }
    const sheet = getSheet(sheetName, headers);
    const data = sheetDataToObjects(sheet.getDataRange().getValues());
    cache.put(cacheKey, JSON.stringify(data), 300); // Cache for 5 minutes
    return data;
}

/**
 * Updates a specific record in a sheet by its ID.
 * @param {string} sheetName The name of the sheet.
 * @param {string} id The ID of the record to update.
 * @param {object} dataToUpdate An object with key-value pairs to update.
 * @returns {object} A success or error object.
 */
function patchDetailedInfo(sheetName, id, dataToUpdate) {
    try {
        const sheet = getSheet(sheetName, []); // Headers don't matter as much here, but we need the sheet object.
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const idColumnIndex = headers.indexOf(ID_COLUMN);
        if (idColumnIndex === -1) {
            throw new Error(`"${ID_COLUMN}" column not found in sheet: ${sheetName}`);
        }

        const rowIndexMap = getOrCreateRowIndex(sheet, idColumnIndex);
        const rowNum = rowIndexMap.get(id);

        if (!rowNum) {
            return { success: false, message: `Record with ID ${id} not found in ${sheetName}.` };
        }

        const dataRow = sheet.getRange(rowNum, 1, 1, headers.length);
        const values = dataRow.getValues()[0];

        let updated = false;
        const camelCaseHeaders = headers.map(header => {
            const key = header.replace(/(?:^|\s)\S/g, a => a.toUpperCase()).replace(/\s/g, '').replace(/\(JSON\)/g, '');
            return key.charAt(0).toLowerCase() + key.slice(1);
        });

        for (let i = 0; i < headers.length; i++) {
            const headerKey = camelCaseHeaders[i];
            if (dataToUpdate.hasOwnProperty(headerKey) && headerKey !== ID_COLUMN.toLowerCase()) {
                let newValue = dataToUpdate[headerKey];
                if (headers[i].includes(JSON_SUFFIX) && typeof newValue === 'object' && newValue !== null) {
                    newValue = JSON.stringify(newValue);
                }
                if (values[i] !== newValue) {
                    values[i] = newValue;
                    updated = true;
                }
            }
        }

        if (updated) {
            dataRow.setValues([values]);
            // If a provider's status was part of the update, trigger a webhook.
            // This special case is added here to centralize the trigger logic,
            // as this function is called by all higher-level update services.
            if (sheetName === PROVIDERS_SHEET_NAME && dataToUpdate.hasOwnProperty('credentialingStatus')) {
                const updatedProvider = sheetDataToObjects([headers, values])[0];
                triggerWebhook('ProviderStatusUpdated', updatedProvider);
            }
            invalidateRowIndexCache(sheet);
            return { success: true, message: `Record ${id} in ${sheetName} updated successfully.` };
        } else {
            return { success: true, message: "No changes detected to update." };
        }

    } catch (e) {
        return { success: false, message: `Failed to update record in ${sheetName}: ${e.message}` };
    }
}

/**
 * Deletes a record from a sheet by its ID.
 * @param {string} sheetName The name of the sheet.
 * @param {Array<string>} headers The headers of the sheet.
 * @param {string} recordId The ID of the record to delete.
 * @returns {object} A success or error object.
 */
function deleteDetailedProviderInfo(sheetName, headers, recordId) {
    try {
        const sheet = getSheet(sheetName, headers);
        const idColumnIndex = headers.indexOf(ID_COLUMN);
        if (idColumnIndex === -1) {
            throw new Error(`"${ID_COLUMN}" column not found in sheet: ${sheetName}`);
        }
        const rowIndexMap = getOrCreateRowIndex(sheet, idColumnIndex);
        const rowNum = rowIndexMap.get(recordId);
        if (rowNum) {
            sheet.deleteRow(rowNum);
            invalidateRowIndexCache(sheet);
            return { success: true, message: `Record with ID ${recordId} deleted successfully from ${sheetName}.` };
        } else {
            return { success: false, message: `Record with ID ${recordId} not found in ${sheetName}.` };
        }
    } catch (error) {
        return { success: false, message: `Failed to delete record from ${sheetName}: ${error.message}` };
    }
}

function deleteRowsByColumnValue(sheet, columnIndex, valueToDelete) {
    const data = sheet.getDataRange().getValues();
    let rowsDeleted = 0;
    for (let i = data.length - 1; i >= 1; i--) {
        if (data[i][columnIndex] === valueToDelete) {
            sheet.deleteRow(i + 1);
            rowsDeleted++;
        }
    }
    if (rowsDeleted > 0) invalidateRowIndexCache(sheet);
    return rowsDeleted;
}