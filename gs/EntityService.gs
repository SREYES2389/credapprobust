/**
 * @fileoverview
 * This file contains high-level functions for business logic related to data entities.
 * It uses the DataAccess module to interact with the spreadsheet.
 */

/**
 * Helper function to find a schema definition (primary or child) by its key.
 * @param {string} entityType The key of the entity (e.g., "Providers", "aliases").
 * @returns {object|null} The schema definition object or null if not found.
 * @private
 */
function _findSchemaDefinition(entityType) {
    // Check top-level entities first
    if (ENTITY_SCHEMAS[entityType]) {
        return ENTITY_SCHEMAS[entityType];
    }
    // Check child entities
    for (const schemaName in ENTITY_SCHEMAS) {
        const primarySchema = ENTITY_SCHEMAS[schemaName];
        if (primarySchema.children) {
            const childSchema = primarySchema.children.find(child => child.key === entityType);
            if (childSchema) return childSchema;
        }
    }
    return null;
}

/**
 * A generic, schema-driven function to retrieve the full details for any primary entity.
 * It fetches the main entity record and all its direct children as defined in ENTITY_SCHEMAS.
 * @param {string} entityType The key for the entity in ENTITY_SCHEMAS (e.g., "Providers", "Facilities").
 * @param {string} entityId The ID of the entity record to retrieve.
 * @returns {object} A success or error object with the complete entity data.
 */
function getEntityDetails(entityType, entityId) {
    try {
        const schema = ENTITY_SCHEMAS[entityType];
        if (!schema) {
            return { success: false, message: `Schema not found for entity type: ${entityType}` };
        }

        // 1. Get the main entity record
        const sheet = getSheet(schema.sheetName, schema.headers);
        const entity = sheetDataToObjects(sheet.getDataRange().getValues()).find(e => e.id === entityId);

        if (!entity) {
            return { success: false, message: `${entityType} with ID ${entityId} not found.` };
        }

        // 2. Get all related data by iterating through the schema's children
        schema.children.forEach(childSchema => {
            try {
                const allRecords = getCachedSheetData(childSchema.sheetName, childSchema.headers);
                const objectKey = childSchema.key;
                // Convert parentIdColumn from "Header Case" to "camelCase" for filtering
                const parentIdField = childSchema.parentIdColumn.replace(/(?:^|\s)\S/g, a => a.toUpperCase()).replace(/\s/g, '');
                const finalParentIdField = parentIdField.charAt(0).toLowerCase() + parentIdField.slice(1);

                entity[objectKey] = allRecords.filter(record => record[finalParentIdField] === entityId);
            } catch (e) {
                console.warn(`Could not fetch related data from ${childSchema.sheetName} for ${entityType} ${entityId}: ${e.message}`);
                entity[childSchema.key] = []; // Ensure the key exists even if fetching fails
            }
        });

        return { success: true, data: entity };
    } catch (error) {
        logAuditEvent("Error", `Failed to get details for ${entityType} ${entityId}: ${error.message}`);
        return { success: false, message: `Failed to get ${entityType} details: ${error.message}` };
    }
}

/**
 * Creates a new entity record in the appropriate sheet based on the schema.
 * This function is fully schema-driven.
 * @param {string} entityType - The key of the entity to create (e.g., "Providers", "aliases").
 * @param {object} dataObject - An object containing the data for the new entity.
 *   Keys should match the header names in the schema. The ID will be auto-generated if not provided.
 * @returns {object} A success or error object.
 */
function createEntity(entityType, dataObject) {
    try {
        const schema = _findSchemaDefinition(entityType);
        if (!schema) {
            throw new Error(`Schema not found for entity type: ${entityType}`);
        }

        const objectToInsert = { ...dataObject };
        // Assign a new ID if the schema has an ID column and one isn't provided.
        if (schema.headers.includes(ID_COLUMN) && !objectToInsert[ID_COLUMN]) {
            objectToInsert[ID_COLUMN] = Utilities.getUuid();
        }

        const row = mapObjectsToRows([objectToInsert], schema.headers)[0];
        const sheet = getSheet(schema.sheetName, schema.headers);
        sheet.appendRow(row);
        invalidateRowIndexCache(sheet);

        const newRecordId = objectToInsert[ID_COLUMN] || '(no id)';
        logAuditEvent("Create", `Entity '${entityType}' created successfully.`, { entityType, newRecordId });
        return { success: true, data: objectToInsert };

    } catch (error) {
        logAuditEvent("Error", `Failed to create entity '${entityType}': ${error.message}`, { entityType, dataObject });
        return { success: false, message: `Failed to create entity: ${error.message}` };
    }
}