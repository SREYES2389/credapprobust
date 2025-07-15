/**
 * @fileoverview
 * This file contains all backend functions related to Facility entities.
 * It uses the master ENTITY_SCHEMAS object for data-driven operations.
 */

/**
 * Creates a new facility record.
 * @param {object} facilityData The data for the new facility.
 * @returns {object} A success or error message.
 */
function createFacility(facilityData) {
    try {
        const sheet = getSheet(FACILITIES_SHEET_NAME, FACILITIES_HEADERS);
        const newId = Utilities.getUuid();
        const rowData = [
            newId,
            facilityData.name,
            facilityData.dba || "",
            facilityData.addressLine1 || "",
            facilityData.addressLine2 || "",
            facilityData.city || "",
            facilityData.state || "",
            facilityData.zipCode || "",
            facilityData.phoneNumber || "",
            facilityData.faxNumber || "",
            facilityData.groupTaxId || "",
            facilityData.facilityTaxId || "",
            facilityData.contactName || "",
            facilityData.contactEmail || "",
            facilityData.medicarePartANumber || "",
            facilityData.medicarePartBNumber || "",
            facilityData.medicaidNumber || "",
            facilityData.deactivated || false
        ];
        sheet.appendRow(rowData);
        invalidateRowIndexCache(sheet);
        logAuditEvent("Request", `Facility created: ${facilityData.name}`, { facilityId: newId });
        return { success: true, message: `Facility "${facilityData.name}" added with ID: ${newId}` };
    } catch (error) {
        return { success: false, message: `Failed to add facility: ${error.message}` };
    }
}

/**
 * Retrieves a list of facilities with pagination and search.
 * @param {object} [options={}] Query parameters for pagination, sorting, and searching.
 * @returns {object} An object with the list of facilities and pagination info.
 */
function getFacilities(options = {}) {
    try {
        const { page = 1, pageSize = 15, searchTerm = '', sortBy = 'name', sortOrder = 'asc' } = options;
        const sheet = getSheet(FACILITIES_SHEET_NAME, FACILITIES_HEADERS);
        let allFacilities = sheetDataToObjects(sheet.getDataRange().getValues());

        if (searchTerm) {
            const lowercasedTerm = searchTerm.toLowerCase();
            allFacilities = allFacilities.filter(f =>
                (f.name && f.name.toLowerCase().includes(lowercasedTerm)) ||
                (f.city && f.city.toLowerCase().includes(lowercasedTerm)) ||
                (f.state && f.state.toLowerCase().includes(lowercasedTerm)) ||
                (f.id && f.id.toLowerCase().includes(lowercasedTerm))
            );
        }

        allFacilities.sort((a, b) => {
            const valA = a[sortBy] || '';
            const valB = b[sortBy] || '';
            let comparison = 0;
            if (valA > valB) {
                comparison = 1;
            } else if (valA < valB) {
                comparison = -1;
            }
            return sortOrder === 'desc' ? comparison * -1 : comparison;
        });

        const totalRecords = allFacilities.length;
        const startIndex = (page - 1) * pageSize;
        const paginatedData = allFacilities.slice(startIndex, startIndex + pageSize);

        return { success: true, data: paginatedData, totalRecords: totalRecords };
    } catch (error) {
        return { success: false, message: `Failed to retrieve facilities: ${error.message}` };
    }
}

/**
 * Updates an existing facility record.
 * @param {object} facilityData The data to patch, must include an 'id'.
 * @returns {object} A success or error message.
 */
function updateFacility(facilityData) {
    const result = patchDetailedInfo(FACILITIES_SHEET_NAME, facilityData.id, facilityData);
    if (result.success) {
        logAuditEvent("Request", `Facility updated: ${facilityData.id}`, { facilityId: facilityData.id });
    } else {
        logAuditEvent("Error", `Failed to update facility ${facilityData.id}: ${result.message}`);
    }
    return result;
}

/**
 * Deletes a facility and all of its associated child data by reading the facility schema.
 * @param {string} facilityId The ID of the facility to delete.
 * @returns {object} A success or error object.
 */
function deleteFacility(facilityId) {
    try {
        const facilitySchema = ENTITY_SCHEMAS["Facilities"];
        const sheet = getSheet(facilitySchema.sheetName, facilitySchema.headers);
        const idColumnIndex = facilitySchema.headers.indexOf("ID");
        const rowIndexMap = getOrCreateRowIndex(sheet, idColumnIndex);
        const rowNum = rowIndexMap.get(facilityId);

        if (rowNum) {
            // Delete the main facility row
            sheet.deleteRow(rowNum);

            // Delete associated data from all child sheets defined in the schema
            facilitySchema.children.forEach(childSchema => {
                try {
                    const currentSheet = getSheet(childSchema.sheetName, childSchema.headers);
                    const parentIdColIndex = childSchema.headers.indexOf(childSchema.parentIdColumn);
                    if (parentIdColIndex !== -1) {
                        deleteRowsByColumnValue(currentSheet, parentIdColIndex, facilityId);
                    }
                } catch (e) {
                    console.warn(`Could not delete associated data in ${childSchema.sheetName} for facility ${facilityId}: ${e.message}`);
                }
            });

            invalidateRowIndexCache(sheet);
            logAuditEvent("Request", `Facility deleted: ${facilityId}`, { facilityId: facilityId });
            return { success: true, message: `Facility with ID ${facilityId} and associated data deleted successfully.` };
        } else {
            return { success: false, message: `Facility with ID ${facilityId} not found.` };
        }
    } catch (error) {
        logAuditEvent("Error", `Failed to delete facility ${facilityId}: ${error.message}`);
        return { success: false, message: `Failed to delete facility: ${error.message}` };
    }
}

function getFacilityDetails(facilityId) {
  try {
    // 1. Use the generic function to get the facility and all direct children
    const facilityDetails = getEntityDetails('Facilities', facilityId);
    if (!facilityDetails.success) {
      return facilityDetails;
    }
    const facility = facilityDetails.data;

    // 2. Perform any special data enrichment
    if (facility.specialties && facility.specialties.length > 0) {
      try {
        const taxonomiesSheet = getSheet(FACILITY_TAXONOMIES_SHEET_NAME, FACILITY_TAXONOMIES_HEADERS);
        const allTaxonomies = sheetDataToObjects(taxonomiesSheet.getDataRange().getValues());
        const taxonomyMap = new Map(allTaxonomies.map(t => [t.id, t.name]));
        facility.specialties.forEach(spec => {
          spec.taxonomyName = taxonomyMap.get(spec.taxonomyId) || 'Unknown Taxonomy';
        });
      } catch (e) {
        console.warn(`Could not enrich facility specialties for ${facilityId}: ${e.message}`);
      }
    }

    return { success: true, data: facility };
  } catch (error) {
    logAuditEvent("Error", `Failed to get facility details for ${facilityId}: ${error.message}`);
    return { success: false, message: `Failed to get facility details: ${error.message}` };
  }
}
/**
 * Retrieves a specific facility specialty record.
 * @param {string} facilityId The ID of the facility.
 * @param {string} specialtyId The ID of the specialty record.
 * @returns {object} An object containing success status and specialty data.
 */
function getFacilitySpecialty(facilityId, specialtyId) {
    try {
        if (!facilityId || !specialtyId) {
            return { success: false, message: "Facility ID and Specialty ID are required." };
        }
        const sheet = getSheet(FACILITY_SPECIALTIES_SHEET_NAME, FACILITY_SPECIALTIES_HEADERS);
        const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
        // BUG FIX: Was filtering by providerId instead of facilityId
        const specialty = allRecords.find(record => record.facilityId === facilityId && record.id === specialtyId);
        if (!specialty) {
            return { success: false, message: `Specialty with ID ${specialtyId} not found for facility ${facilityId}.` };
        }
        return { success: true, data: specialty };
    } catch (error) {
        return { success: false, message: `Failed to retrieve facility specialty: ${error.message}` };
    }
}

/**
 * Gathers all relevant credentialing data for a specific facility.
 * @param {string} facilityId The ID of the facility.
 * @returns {object} An object containing success status and the aggregated credentialing data.
 */
function getFacilityCredentialingData(facilityId) {
    try {
        const facilityDetails = getFacilityDetails(facilityId);
        if (!facilityDetails.success) {
            return facilityDetails;
        }
        const facility = facilityDetails.data;

        const credentialingData = {
            facility: { id: facility.id, name: facility.name, dba: facility.dba, deactivated: facility.deactivated },
            facilitySpecialties: facility.specialties,
            facilityInfo: { npis: facility.npis, deas: facility.deas, licenses: facility.licenses, accreditations: facility.accreditations, cmsCertifications: facility.cmsCertifications, medicareEnrollments: facility.medicareEnrollments, liabilityInsurances: facility.liabilityInsurances },
      childFacilities: [], // Placeholder for future functionality
      datasetScans: facility.scans || [], // Use data fetched by getFacilityDetails
      alerts: facility.alerts || [], // Use data fetched by getFacilityDetails
            files: facility.files
        };

        return { success: true, data: credentialingData };
    } catch (error) {
        logAuditEvent("Error", `Failed to get facility credentialing data for ${facilityId}: ${error.message}`);
        return { success: false, message: `Failed to get facility credentialing data: ${error.message}` };
    }
}

function uploadFileAndLinkToFacility(fileObject, facilityId) {
  /**
   * Uploads a file and links it to a specific facility.
   * @param {object} fileObject The file data from the frontend.
   * @param {string} facilityId The ID of the facility to link the file to.
   */
  return uploadFileAndLinkToEntity(fileObject, facilityId, 'facility');
}

// --- Facility DEA Functions ---

/**
 * Creates a new facility DEA record.
 * @param {string} facilityId The ID of the facility the DEA belongs to.
 * @param {object} deaData The data for the new DEA record (deaNumber, drugSchedules, state, expirationDate, businessActivityCode, paymentIndicator, isActive).
 * @returns {object} A success or error message.
 */
function createFacilityDeaInfo(facilityId, deaData) {
    if (!facilityId || !deaData || !deaData.deaNumber) {
        return { success: false, message: "Facility ID and DEA number are required." };
    }
    const rowData = [
        deaData.deaNumber,
        deaData.drugSchedules || "",
        deaData.state || "",
        deaData.expirationDate || "",
        deaData.businessActivityCode || "",
        deaData.paymentIndicator || "",
        deaData.isActive || false
    ];
    return createSubEntity(
        FACILITY_DEAS_SHEET_NAME,
        FACILITY_DEAS_HEADERS,
        facilityId,
        rowData,
        `Facility DEA "${deaData.deaNumber}"`
    );
}

/**
 * Retrieves a list of DEA records for a given facility.
 * @param {string} facilityId The ID of the facility to retrieve DEA records for.
 * @returns {object} An object containing success status and DEA data.
 */
function listFacilityDeaInfo(facilityId) {
    try {
        if (!facilityId) {
            return { success: false, message: "Facility ID is required to list DEAs." };
        }
        const sheet = getSheet(FACILITY_DEAS_SHEET_NAME, FACILITY_DEAS_HEADERS);
        const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
        const facilityDeas = allRecords.filter(record => record.facilityId === facilityId);
        return { success: true, data: facilityDeas };
    } catch (error) {
        return { success: false, message: `Failed to list facility DEAs: ${error.message}` };
    }
}

/**
 * Retrieves a specific facility DEA record by its ID and facility ID.
 * @param {string} facilityId The ID of the facility the DEA belongs to.
 * @param {string} deaId The ID of the DEA record to retrieve.
 * @returns {object} An object containing success status and DEA data.
 */
function getFacilityDeaInfo(facilityId, deaId) {
    try {
        if (!facilityId || !deaId) {
            return { success: false, message: "Facility ID and DEA ID are required to get DEA details." };
        }
        const sheet = getSheet(FACILITY_DEAS_SHEET_NAME, FACILITY_DEAS_HEADERS);
        const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
        const dea = allRecords.find(record => record.facilityId === facilityId && record.id === deaId);
        if (!dea) {
            return { success: false, message: `DEA with ID ${deaId} not found for facility ${facilityId}.` };
        }
        return { success: true, data: dea };
    } catch (error) {
        return { success: false, message: `Failed to retrieve facility DEA details: ${error.message}` };
    }
}

/**
 * Updates an existing facility DEA record.
 * @param {string} deaId The ID of the DEA record to update.
 * @param {object} deaData The data to patch.
 * @returns {object} A success or error message.
 */
function patchFacilityDeaInfo(deaId, deaData) {
    // Using patchDetailedInfo for a generic update.
    const result = patchDetailedInfo(FACILITY_DEAS_SHEET_NAME, deaId, deaData);
    if (result.success) {
        logAuditEvent("Request", `Facility DEA updated: ${deaId}`, { deaId: deaId, newData: deaData });
    } else {
        logAuditEvent("Error", `Failed to update facility DEA ${deaId}: ${result.message}`);
    }
    return result;
}

/**
 * Deletes a facility DEA record.
 * @param {string} deaId The ID of the DEA record to delete.
 * @returns {object} A success or error message.
 */
function deleteFacilityDeaInfo(deaId) {
    const result = deleteDetailedProviderInfo(FACILITY_DEAS_SHEET_NAME, FACILITY_DEAS_HEADERS, deaId);
    if (result.success) {
        logAuditEvent("Request", `Facility DEA deleted: ${deaId}`, { deaId: deaId });
    }
    return result;
}

// --- Facility Liability Insurance Functions ---

/**
 * Creates a new facility liability insurance record.
 * @param {string} facilityId The ID of the facility the liability insurance belongs to.
 * @param {object} liabilityInsuranceData The data for the new liability insurance record.
 * @returns {object} A success or error message.
 */
function createFacilityLiabilityInsuranceInfo(facilityId, liabilityInsuranceData) {
    if (!facilityId || !liabilityInsuranceData || !liabilityInsuranceData.name) {
        return { success: false, message: "Facility ID and insurer name are required." };
    }
    const rowData = [
        liabilityInsuranceData.name,
        liabilityInsuranceData.isSelfInsured || false,
        liabilityInsuranceData.originalEffectiveDate || "",
        liabilityInsuranceData.currentEffectiveDate || "",
        liabilityInsuranceData.currentExpirationDate || "",
        liabilityInsuranceData.coverageType || "",
        liabilityInsuranceData.isUnlimitedCoverage || false,
        liabilityInsuranceData.includesTailCoverage || false,
        liabilityInsuranceData.occurrenceCoverageAmount || "",
        liabilityInsuranceData.aggregateCoverageAmount || "",
        liabilityInsuranceData.policyNumber || ""
    ];
    return createSubEntity(
        FACILITY_LIABILITY_INSURANCE_SHEET_NAME,
        FACILITY_LIABILITY_INSURANCE_HEADERS,
        facilityId,
        rowData,
        `Facility Liability Insurance "${liabilityInsuranceData.name}"`
    );
}

/**
 * Retrieves a list of liability insurance records for a given facility.
 * @param {string} facilityId The ID of the facility to retrieve liability insurance records for.
 * @returns {object} An object containing success status and liability insurance data.
 */
function listFacilityLiabilityInsuranceInfo(facilityId) {
    try {
        if (!facilityId) {
            return { success: false, message: "Facility ID is required to list liability insurance records." };
        }
        const sheet = getSheet(FACILITY_LIABILITY_INSURANCE_SHEET_NAME, FACILITY_LIABILITY_INSURANCE_HEADERS);
        const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
        const facilityLiabilityInsurances = allRecords.filter(record => record.facilityId === facilityId);
        return { success: true, data: facilityLiabilityInsurances };
    } catch (error) {
        return { success: false, message: `Failed to list facility liability insurance records: ${error.message}` };
    }
}

/**
 * Retrieves a specific facility liability insurance record by its ID and facility ID.
 * @param {string} facilityId The ID of the facility the liability insurance belongs to.
 * @param {string} liabilityInsuranceId The ID of the liability insurance record to retrieve.
 * @returns {object} An object containing success status and liability insurance data.
 */
function getFacilityLiabilityInsuranceInfo(facilityId, liabilityInsuranceId) {
    try {
        if (!facilityId || !liabilityInsuranceId) {
            return { success: false, message: "Facility ID and Liability Insurance ID are required to get liability insurance details." };
        }
        const sheet = getSheet(FACILITY_LIABILITY_INSURANCE_SHEET_NAME, FACILITY_LIABILITY_INSURANCE_HEADERS);
        const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
        const liabilityInsurance = allRecords.find(record => record.facilityId === facilityId && record.id === liabilityInsuranceId);
        if (!liabilityInsurance) {
            return { success: false, message: `Liability Insurance with ID ${liabilityInsuranceId} not found for facility ${facilityId}.` };
        }
        return { success: true, data: liabilityInsurance };
    } catch (error) {
        return { success: false, message: `Failed to retrieve facility liability insurance details: ${error.message}` };
    }
}

/**
 * Updates an existing facility liability insurance record.
 * @param {string} liabilityInsuranceId The ID of the liability insurance record to update.
 * @param {object} liabilityInsuranceData The data to patch.
 * @returns {object} A success or error message.
 */
function patchFacilityLiabilityInsuranceInfo(liabilityInsuranceId, liabilityInsuranceData) {
    // Using patchDetailedInfo for a generic update.
    const result = patchDetailedInfo(FACILITY_LIABILITY_INSURANCE_SHEET_NAME, liabilityInsuranceId, liabilityInsuranceData);
    if (result.success) {
        logAuditEvent("Request", `Facility liability insurance updated: ${liabilityInsuranceId}`, { liabilityInsuranceId: liabilityInsuranceId, newData: liabilityInsuranceData });
    } else {
        logAuditEvent("Error", `Failed to update facility liability insurance ${liabilityInsuranceId}: ${result.message}`);
    }
    return result;
}

/**
 * Deletes a facility liability insurance record.
 * @param {string} liabilityInsuranceId The ID of the liability insurance record to delete.
 * @returns {object} A success or error message.
 */
function deleteFacilityLiabilityInsuranceInfo(liabilityInsuranceId) {
    const result = deleteDetailedProviderInfo(FACILITY_LIABILITY_INSURANCE_SHEET_NAME, FACILITY_LIABILITY_INSURANCE_HEADERS, liabilityInsuranceId);
    if (result.success) {
        logAuditEvent("Request", `Facility liability insurance deleted: ${liabilityInsuranceId}`, { liabilityInsuranceId: liabilityInsuranceId });
    }
    return result;
}

// --- Facility Licenses Functions ---

/**
 * Creates a new facility license record.
 * @param {string} facilityId The ID of the facility the license belongs to.
 * @param {object} licenseData The data for the new license record (licenseTypeID, state, licenseNumber, isPrimary, issueDate, expirationDate, licenseStatus).
 * @returns {object} A success or error message.
 */
function createFacilityLicenseInfo(facilityId, licenseData) {
    if (!facilityId || !licenseData || !licenseData.licenseTypeID || !licenseData.state || !licenseData.licenseNumber) {
        return { success: false, message: "Facility ID, license type ID, state, and license number are required." };
    }
    const rowData = [
        licenseData.licenseTypeID,
        licenseData.state,
        licenseData.licenseNumber,
        licenseData.isPrimary || false,
        licenseData.issueDate || "",
        licenseData.expirationDate || "",
        licenseData.licenseStatus || ""
    ];
    return createSubEntity(
        FACILITY_LICENSES_SHEET_NAME,
        FACILITY_LICENSES_HEADERS,
        facilityId,
        rowData,
        `Facility License "${licenseData.licenseNumber}"`,
        "Facility ID"
    );
}

/**
 * Retrieves a list of license records for a given facility.
 * @param {string} facilityId The ID of the facility to retrieve license records for.
 * @returns {object} An object containing success status and license data.
 */
function listFacilityLicenseInfo(facilityId) {
    try {
        if (!facilityId) {
            return { success: false, message: "Facility ID is required to list licenses." };
        }
        const sheet = getSheet(FACILITY_LICENSES_SHEET_NAME, FACILITY_LICENSES_HEADERS);
        const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
        const facilityLicenses = allRecords.filter(record => record.facilityId === facilityId);
        return { success: true, data: facilityLicenses };
    } catch (error) {
        return { success: false, message: `Failed to list facility licenses: ${error.message}` };
    }
}

/**
 * Retrieves a specific facility license record by its ID and facility ID.
 * @param {string} facilityId The ID of the facility the license belongs to.
 * @param {string} licenseId The ID of the license record to retrieve.
 * @returns {object} An object containing success status and license data.
 */
function getFacilityLicenseInfo(facilityId, licenseId) {
    try {
        if (!facilityId || !licenseId) {
            return { success: false, message: "Facility ID and License ID are required to get license details." };
        }
        const sheet = getSheet(FACILITY_LICENSES_SHEET_NAME, FACILITY_LICENSES_HEADERS);
        const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
        const license = allRecords.find(record => record.facilityId === facilityId && record.id === licenseId);
        if (!license) {
            return { success: false, message: `License with ID ${licenseId} not found for facility ${facilityId}.` };
        }
        return { success: true, data: license };
    } catch (error) {
        return { success: false, message: `Failed to retrieve facility license details: ${error.message}` };
    }
}

/**
 * Updates an existing facility license record.
 * @param {string} licenseId The ID of the license record to update.
 * @param {object} licenseData The data to patch.
 * @returns {object} A success or error message.
 */
function patchFacilityLicenseInfo(licenseId, licenseData) {
    // Using patchDetailedInfo for a generic update.
    const result = patchDetailedInfo(FACILITY_LICENSES_SHEET_NAME, licenseId, licenseData);
    if (result.success) {
        logAuditEvent("Request", `Facility license updated: ${licenseId}`, { licenseId: licenseId, newData: licenseData });
    } else {
        logAuditEvent("Error", `Failed to update facility license ${licenseId}: ${result.message}`);
    }
    return result;
}

/**
 * Deletes a facility license record.
 * @param {string} licenseId The ID of the license record to delete.
 * @returns {object} A success or error message.
 */
function deleteFacilityLicenseInfo(licenseId) {
    const result = deleteDetailedProviderInfo(FACILITY_LICENSES_SHEET_NAME, FACILITY_LICENSES_HEADERS, licenseId);
    if (result.success) {
        logAuditEvent("Request", `Facility license deleted: ${licenseId}`, { licenseId: licenseId });
    }
    return result;
}

// --- Facility Accreditations Functions ---

/**
 * Creates a new facility accreditation record.
 * @param {string} facilityId The ID of the facility the accreditation belongs to.
 * @param {object} accreditationData The data for the new accreditation record (agency, program, decision, effectiveDate, expirationDate).
 * @returns {object} A success or error message.
 */
function createFacilityAccreditationInfo(facilityId, accreditationData) {
    if (!facilityId || !accreditationData || !accreditationData.agency || !accreditationData.program) {
        return { success: false, message: "Facility ID, agency, and program are required." };
    }
    const rowData = [
        accreditationData.agency,
        accreditationData.program,
        accreditationData.decision || "",
        accreditationData.effectiveDate || "",
        accreditationData.expirationDate || ""
    ];
    return createSubEntity(
        FACILITY_ACCREDITATIONS_SHEET_NAME,
        FACILITY_ACCREDITATIONS_HEADERS,
        facilityId,
        rowData,
        `Facility Accreditation "${accreditationData.agency}"`
    );
}

/**
 * Retrieves a list of accreditation records for a given facility.
 * @param {string} facilityId The ID of the facility to retrieve accreditation records for.
 * @returns {object} An object containing success status and accreditation data.
 */
function listFacilityAccreditationInfo(facilityId) {
    try {
        if (!facilityId) {
            return { success: false, message: "Facility ID is required to list accreditations." };
        }
        const sheet = getSheet(FACILITY_ACCREDITATIONS_SHEET_NAME, FACILITY_ACCREDITATIONS_HEADERS);
        const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
        const facilityAccreditations = allRecords.filter(record => record.facilityId === facilityId);
        return { success: true, data: facilityAccreditations };
    } catch (error) {
        return { success: false, message: `Failed to list facility accreditations: ${error.message}` };
    }
}

/**
 * Retrieves a specific facility accreditation record by its ID and facility ID.
 * @param {string} facilityId The ID of the facility the accreditation belongs to.
 * @param {string} accreditationId The ID of the accreditation record to retrieve.
 * @returns {object} An object containing success status and accreditation data.
 */
function getFacilityAccreditationInfo(facilityId, accreditationId) {
    try {
        if (!facilityId || !accreditationId) {
            return { success: false, message: "Facility ID and Accreditation ID are required to get accreditation details." };
        }
        const sheet = getSheet(FACILITY_ACCREDITATIONS_SHEET_NAME, FACILITY_ACCREDITATIONS_HEADERS);
        const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
        const accreditation = allRecords.find(record => record.facilityId === facilityId && record.id === accreditationId);
        if (!accreditation) {
            return { success: false, message: `Accreditation with ID ${accreditationId} not found for facility ${facilityId}.` };
        }
        return { success: true, data: accreditation };
    } catch (error) {
        return { success: false, message: `Failed to retrieve facility accreditation details: ${error.message}` };
    }
}

/**
 * Updates an existing facility accreditation record.
 * @param {string} accreditationId The ID of the accreditation record to update.
 * @param {object} accreditationData The data to patch.
 * @returns {object} A success or error message.
 */
function patchFacilityAccreditationInfo(accreditationId, accreditationData) {
    // Using patchDetailedInfo for a generic update.
    const result = patchDetailedInfo(FACILITY_ACCREDITATIONS_SHEET_NAME, accreditationId, accreditationData);
    if (result.success) {
        logAuditEvent("Request", `Facility accreditation updated: ${accreditationId}`, { accreditationId: accreditationId, newData: accreditationData });
    } else {
        logAuditEvent("Error", `Failed to update facility accreditation ${accreditationId}: ${result.message}`);
    }
    return result;
}

/**
 * Deletes a facility accreditation record.
 * @param {string} accreditationId The ID of the accreditation record to delete.
 * @returns {object} A success or error message.
 */
function deleteFacilityAccreditationInfo(accreditationId) {
    const result = deleteDetailedProviderInfo(FACILITY_ACCREDITATIONS_SHEET_NAME, FACILITY_ACCREDITATIONS_HEADERS, accreditationId);
    if (result.success) {
        logAuditEvent("Request", `Facility accreditation deleted: ${accreditationId}`, { accreditationId: accreditationId });
    }
    return result;
}

// --- Facility CMS Certifications Functions ---

/**
 * Creates a new facility CMS certification record.
 * @param {string} facilityId The ID of the facility the CMS certification belongs to.
 * @param {object} cmsCertificationData The data for the new CMS certification record (certificationNumber, certificationDate).
 * @returns {object} A success or error message.
 */
function createFacilityCmsCertificationInfo(facilityId, cmsCertificationData) {
    if (!facilityId || !cmsCertificationData || !cmsCertificationData.certificationNumber) {
        return { success: false, message: "Facility ID and certification number are required." };
    }
    const rowData = [
        cmsCertificationData.certificationNumber,
        cmsCertificationData.certificationDate || ""
    ];
    return createSubEntity(
        FACILITY_CMS_CERTIFICATIONS_SHEET_NAME,
        FACILITY_CMS_CERTIFICATIONS_HEADERS,
        facilityId,
        rowData,
        `Facility CMS Certification "${cmsCertificationData.certificationNumber}"`
    );
}

/**
 * Retrieves a list of CMS certification records for a given facility.
 * @param {string} facilityId The ID of the facility to retrieve CMS certification records for.
 * @returns {object} An object containing success status and CMS certification data.
 */
function listFacilityCmsCertificationInfo(facilityId) {
    try {
        if (!facilityId) {
            return { success: false, message: "Facility ID is required to list CMS certifications." };
        }
        const sheet = getSheet(FACILITY_CMS_CERTIFICATIONS_SHEET_NAME, FACILITY_CMS_CERTIFICATIONS_HEADERS);
        const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
        const facilityCmsCertifications = allRecords.filter(record => record.facilityId === facilityId);
        return { success: true, data: facilityCmsCertifications };
    } catch (error) {
        return { success: false, message: `Failed to list facility CMS certifications: ${error.message}` };
    }
}

/**
 * Retrieves a specific facility CMS certification record by its ID and facility ID.
 * @param {string} facilityId The ID of the facility the CMS certification belongs to.
 * @param {string} cmsCertificationId The ID of the CMS certification record to retrieve.
 * @returns {object} An object containing success status and CMS certification data.
 */
function getFacilityCmsCertificationInfo(facilityId, cmsCertificationId) {
    try {
        if (!facilityId || !cmsCertificationId) {
            return { success: false, message: "Facility ID and CMS Certification ID are required to get CMS certification details." };
        }
        const sheet = getSheet(FACILITY_CMS_CERTIFICATIONS_SHEET_NAME, FACILITY_CMS_CERTIFICATIONS_HEADERS);
        const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
        const cmsCertification = allRecords.find(record => record.facilityId === facilityId && record.id === cmsCertificationId);
        if (!cmsCertification) {
            return { success: false, message: `CMS Certification with ID ${cmsCertificationId} not found for facility ${facilityId}.` };
        }
        return { success: true, data: cmsCertification };
    } catch (error) {
        return { success: false, message: `Failed to retrieve facility CMS certification details: ${error.message}` };
    }
}

/**
 * Updates an existing facility CMS certification record.
 * @param {string} facilityId The ID of the facility the CMS certification belongs to.
 * @param {string} cmsCertificationId The ID of the CMS certification record to update.
 * @param {object} cmsCertificationData The data to patch.
 * @returns {object} A success or error message.
 */
function patchFacilityCmsCertificationInfo(cmsCertificationId, cmsCertificationData) {
    try {
        const result = patchDetailedInfo(FACILITY_CMS_CERTIFICATIONS_SHEET_NAME, cmsCertificationId, cmsCertificationData);
        if (result.success) { logAuditEvent("Request", `Facility CMS certification updated: ${cmsCertificationId}`, { cmsCertificationId: cmsCertificationId, newData: cmsCertificationData }); }
        return result;
    } catch (error) {
        logAuditEvent("Error", `Failed to update facility CMS certification ${cmsCertificationId}: ${error.message}`);
        return { success: false, message: `Failed to update facility CMS certification: ${error.message}` };
    }
}

/**
 * Deletes a facility CMS certification record.
 * @param {string} facilityId The ID of the facility the CMS certification belongs to.
 * @param {string} cmsCertificationId The ID of the CMS certification record to delete.
 * @returns {object} A success or error message.
 */
function deleteFacilityCmsCertificationInfo(cmsCertificationId) {
    try {
        const result = deleteDetailedProviderInfo(FACILITY_CMS_CERTIFICATIONS_SHEET_NAME, FACILITY_CMS_CERTIFICATIONS_HEADERS, cmsCertificationId);
        if (result.success) { logAuditEvent("Request", `Facility CMS certification deleted: ${cmsCertificationId}`, { cmsCertificationId: cmsCertificationId }); }
        return result;
    } catch (error) {
        logAuditEvent("Error", `Failed to delete facility CMS certification ${cmsCertificationId}: ${error.message}`);
        return { success: false, message: `Failed to delete facility CMS certification: ${error.message}` };
    }
}

// --- Facility Medicare Enrollments Functions ---

/**
 * Creates a new facility Medicare enrollment record.
 * @param {string} facilityId The ID of the facility the Medicare enrollment belongs to.
 * @param {object} medicareEnrollmentData The data for the new Medicare enrollment (medicareNumber, effectiveDate, terminationDate, enrollmentStatus).
 * @returns {object} A success or error message.
 */
function createFacilityMedicareEnrollmentInfo(facilityId, medicareEnrollmentData) {
    if (!facilityId || !medicareEnrollmentData || !medicareEnrollmentData.medicareNumber) {
        return { success: false, message: "Facility ID and Medicare number are required." };
    }
    const rowData = [
        medicareEnrollmentData.medicareNumber,
        medicareEnrollmentData.effectiveDate || "",
        medicareEnrollmentData.terminationDate || "",
        medicareEnrollmentData.enrollmentStatus || ""
    ];
    return createSubEntity(
        FACILITY_MEDICARE_ENROLLMENTS_SHEET_NAME,
        FACILITY_MEDICARE_ENROLLMENTS_HEADERS,
        facilityId,
        rowData,
        `Facility Medicare Enrollment "${medicareEnrollmentData.medicareNumber}"`
    );
}

/**
 * Retrieves a list of Medicare enrollment records for a given facility.
 * @param {string} facilityId The ID of the facility to retrieve Medicare enrollment records for.
 * @returns {object} An object containing success status and Medicare enrollment data.
 */
function listFacilityMedicareEnrollmentInfo(facilityId) {
    try {
        if (!facilityId) {
            return { success: false, message: "Facility ID is required to list Medicare enrollments." };
        }
        const sheet = getSheet(FACILITY_MEDICARE_ENROLLMENTS_SHEET_NAME, FACILITY_MEDICARE_ENROLLMENTS_HEADERS);
        const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
        const facilityMedicareEnrollments = allRecords.filter(record => record.facilityId === facilityId);
        return { success: true, data: facilityMedicareEnrollments };
    } catch (error) {
        return { success: false, message: `Failed to list facility Medicare enrollments: ${error.message}` };
    }
}

/**
 * Retrieves a specific facility Medicare enrollment record by its ID and facility ID.
 * @param {string} facilityId The ID of the facility the Medicare enrollment belongs to.
 * @param {string} medicareEnrollmentId The ID of the Medicare enrollment record to retrieve.
 * @returns {object} An object containing success status and Medicare enrollment data.
 */
function getFacilityMedicareEnrollmentInfo(facilityId, medicareEnrollmentId) {
    try {
        if (!facilityId || !medicareEnrollmentId) {
            return { success: false, message: "Facility ID and Medicare Enrollment ID are required to get Medicare enrollment details." };
        }
        const sheet = getSheet(FACILITY_MEDICARE_ENROLLMENTS_SHEET_NAME, FACILITY_MEDICARE_ENROLLMENTS_HEADERS);
        const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
        const medicareEnrollment = allRecords.find(record => record.facilityId === facilityId && record.id === medicareEnrollmentId);
        if (!medicareEnrollment) {
            return { success: false, message: `Medicare Enrollment with ID ${medicareEnrollmentId} not found for facility ${facilityId}.` };
        }
        return { success: true, data: medicareEnrollment };
    } catch (error) {
        return { success: false, message: `Failed to retrieve facility Medicare enrollment details: ${error.message}` };
    }
}

/**
 * Updates an existing facility Medicare enrollment record.
 * @param {string} facilityId The ID of the facility the Medicare enrollment belongs to.
 * @param {string} medicareEnrollmentId The ID of the Medicare enrollment record to update.
 * @param {object} medicareEnrollmentData The data to patch.
 * @returns {object} A success or error message.
 */
function patchFacilityMedicareEnrollmentInfo(medicareEnrollmentId, medicareEnrollmentData) {
    try {
        const result = patchDetailedInfo(FACILITY_MEDICARE_ENROLLMENTS_SHEET_NAME, medicareEnrollmentId, medicareEnrollmentData);
        if (result.success) { logAuditEvent("Request", `Facility Medicare enrollment updated: ${medicareEnrollmentId}`, { medicareEnrollmentId: medicareEnrollmentId, newData: medicareEnrollmentData }); }
        return result;
    } catch (error) {
        logAuditEvent("Error", `Failed to update facility Medicare enrollment ${medicareEnrollmentId}: ${error.message}`);
        return { success: false, message: `Failed to update facility Medicare enrollment: ${error.message}` };
    }
}

/**
 * Deletes a facility Medicare enrollment record.
 * @param {string} facilityId The ID of the facility the Medicare enrollment belongs to.
 * @param {string} medicareEnrollmentId The ID of the Medicare enrollment record to delete.
 * @returns {object} A success or error message.
 */
function deleteFacilityMedicareEnrollmentInfo(medicareEnrollmentId) {
    try {
        const result = deleteDetailedProviderInfo(FACILITY_MEDICARE_ENROLLMENTS_SHEET_NAME, FACILITY_MEDICARE_ENROLLMENTS_HEADERS, medicareEnrollmentId);
        if (result.success) { logAuditEvent("Request", `Facility Medicare enrollment deleted: ${medicareEnrollmentId}`, { medicareEnrollmentId: medicareEnrollmentId }); }
        return result;
    } catch (error) {
        logAuditEvent("Error", `Failed to delete facility Medicare enrollment ${medicareEnrollmentId}: ${error.message}`);
        return { success: false, message: `Failed to delete facility Medicare enrollment: ${error.message}` };
    }
}

// --- Facility Profiles Functions ---

/**
 * Lists available facility profile import sources.
 * @returns {object} An object containing success status and a list of import sources.
 */
function listFacilityProfileImportSources() {
    try {
        const sheet = getSheet(FACILITY_PROFILE_IMPORT_SOURCES_SHEET_NAME, FACILITY_PROFILE_IMPORT_SOURCES_HEADERS);
        const sources = sheetDataToObjects(sheet.getDataRange().getValues());
        return { success: true, data: sources };
    } catch (error) {
        logAuditEvent("Error", `Failed to list facility profile import sources: ${error.message}`);
        return { success: false, message: `Failed to list facility profile import sources: ${error.message}` };
    }
}

/**
 * Creates a new facility profile import job.
 * @param {object} importData The data for the new import (facilityId, source, parameters).
 * @returns {object} A success or error message, with the new import data on success.
 */
function createFacilityProfileImport(importData) {
    try {
        if (!importData.facilityId || !importData.source) {
            return { success: false, message: "Facility ID and source are required for profile import." };
        }

        const sheet = getSheet(FACILITY_PROFILE_IMPORTS_SHEET_NAME, FACILITY_PROFILE_IMPORTS_HEADERS);
        const newId = Utilities.getUuid();
        const now = new Date().toISOString();

        const status = "Completed"; // Simulate immediate completion
        const completedAt = now;

        const rowData = [
            newId,
            importData.facilityId,
            importData.source,
            status,
            now,
            completedAt,
            "", // Failure Code
            "", // Failure Reason
            JSON.stringify(importData.profileData || {}) // Mock profile data
        ];
        sheet.appendRow(rowData);
        invalidateRowIndexCache(sheet);

        logAuditEvent("Request", `Facility profile import created: ${newId} for facility ${importData.facilityId} from ${importData.source}`, { facilityId: importData.facilityId, importId: newId, source: importData.source });
        return { success: true, message: `Facility profile import created with ID: ${newId}`, data: { id: newId, status: status } };
    } catch (error) {
        logAuditEvent("Error", `Failed to create facility profile import: ${error.message}`);
        return { success: false, message: `Failed to create facility profile import: ${error.message}` };
    }
}

/**
 * Retrieves details for a specific facility profile import job.
 * @param {string} importId The ID of the import job to retrieve.
 * @returns {object} An object containing success status and the import job data.
 */
function getFacilityProfileImport(importId) {
    try {
        if (!importId) {
            return { success: false, message: "Import ID is required." };
        }
        const sheet = getSheet(FACILITY_PROFILE_IMPORTS_SHEET_NAME, FACILITY_PROFILE_IMPORTS_HEADERS);
        const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
        const importJob = allRecords.find(record => record.id === importId);
        if (!importJob) {
            return { success: false, message: `Facility profile import with ID ${importId} not found.` };
        }
        return { success: true, data: importJob };
    } catch (error) {
        logAuditEvent("Error", `Failed to get facility profile import ${importId}: ${error.message}`);
        return { success: false, message: `Failed to get facility profile import: ${error.message}` };
    }
}

/**
 * Lists facility profile import jobs with filtering and pagination.
 * @param {object} options - An object with pagination, sorting, and filtering parameters.
 * @param {number} [options.page=1] - The page number to retrieve.
 * @param {number} [options.pageSize=15] - The number of records per page.
 * @param {string} [options.facilityId] - Filter by facility ID.
 * @param {string} [options.source] - Filter by import source.
 * @param {string} [options.status] - Filter by import status.
 * @returns {object} An object with the list of import jobs and pagination info.
 */
function listFacilityProfileImports(options = {}) {
    try {
        const { page = 1, pageSize = 15, facilityId, source, status } = options;
        const sheet = getSheet(FACILITY_PROFILE_IMPORTS_SHEET_NAME, FACILITY_PROFILE_IMPORTS_HEADERS);
        let allImports = sheetDataToObjects(sheet.getDataRange().getValues());

        if (facilityId) {
            allImports = allImports.filter(job => job.facilityId === facilityId);
        }
        if (source) {
            allImports = allImports.filter(job => job.source === source);
        }
        if (status) {
            allImports = allImports.filter(job => job.status === status);
        }

        // Sort by 'Started' date, newest first
        allImports.sort((a, b) => new Date(b.started) - new Date(a.started));

        const totalRecords = allImports.length;
        const startIndex = (page - 1) * pageSize;
        const paginatedData = allImports.slice(startIndex, startIndex + pageSize);

        return { success: true, data: paginatedData, totalRecords: totalRecords };
    } catch (error) {
        logAuditEvent("Error", `Failed to list facility profile imports: ${error.message}`);
        return { success: false, message: `Failed to list facility profile imports: ${error.message}` };
    }
}

// --- Facility Specialties Functions ---

/**
 * Creates a new facility specialty record.
 * @param {string} facilityId The ID of the facility.
 * @param {object} specialtyData The data for the new specialty (taxonomyId).
 * @returns {object} A success or error message.
 */
function createFacilitySpecialty(facilityId, specialtyData) {
    if (!facilityId || !specialtyData || !specialtyData.taxonomyId) {
        return { success: false, message: "Facility ID and Taxonomy ID are required." };
    }
    const rowData = [specialtyData.taxonomyId];
    return createSubEntity(
        FACILITY_SPECIALTIES_SHEET_NAME,
        FACILITY_SPECIALTIES_HEADERS,
        facilityId,
        rowData,
        `Facility Specialty`
    );
}

/**
 * Retrieves a list of specialties for a given facility.
 * @param {string} facilityId The ID of the facility.
 * @returns {object} An object containing success status and specialty data.
 */
function listFacilitySpecialties(facilityId) {
    try {
        if (!facilityId) {
            return { success: false, message: "Facility ID is required to list specialties." };
        }
        const sheet = getSheet(FACILITY_SPECIALTIES_SHEET_NAME, FACILITY_SPECIALTIES_HEADERS);
        const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
        const facilitySpecialties = allRecords.filter(record => record.facilityId === facilityId);
        return { success: true, data: facilitySpecialties };
    } catch (error) {
        return { success: false, message: `Failed to list facility specialties: ${error.message}` };
    }
}

/**
 * Deletes a facility specialty record.
 * @param {string} specialtyId The ID of the specialty record to delete.
 * @returns {object} A success or error message.
 */
function deleteFacilitySpecialty(specialtyId) {
    const result = deleteDetailedProviderInfo(FACILITY_SPECIALTIES_SHEET_NAME, FACILITY_SPECIALTIES_HEADERS, specialtyId);
    if (result.success) {
        logAuditEvent("Request", `Facility specialty deleted: ${specialtyId}`, { specialtyId: specialtyId });
    }
    return result;
}

// --- Facility Notes (Quick Add) ---

/**
 * Creates a new note linked to a facility.
 * @param {string} facilityId The ID of the facility the note belongs to.
 * @param {object} noteData The data for the new note (note).
 * @returns {object} A success or error message.
 */
function addFacilityNote(facilityId, noteData) {
    try {
        if (!facilityId || !noteData || !noteData.note) {
            return { success: false, message: "Facility ID and note text are required." };
        }
        const sheet = getSheet(NOTES_SHEET_NAME, NOTES_HEADERS);
        const newId = Utilities.getUuid();
        const now = new Date().toISOString();
        const userEmail = Session.getActiveUser().getEmail();
        // Headers: ["ID", "Provider ID", "Facility ID", "Request ID", "Note", "Timestamp", "User Email", "Last Modified At", "Last Modified By"]
        const rowData = [newId, "", facilityId, "", noteData.note, now, userEmail, "", ""];
        sheet.appendRow(rowData);
        invalidateRowIndexCache(sheet);
        logAuditEvent("Request", `Note added to facility ${facilityId}`, { facilityId: facilityId, noteId: newId });
        return { success: true, message: "Note added successfully." };
    } catch (error) {
        logAuditEvent("Error", `Failed to add facility note: ${error.message}`);
        return { success: false, message: `Failed to add facility note: ${error.message}` };
    }
}
