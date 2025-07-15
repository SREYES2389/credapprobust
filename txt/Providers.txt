/**
 * @fileoverview
 * This file contains all backend functions related to Provider entities.
 * It uses the master ENTITY_SCHEMAS object for data-driven operations.
 */

/**
 * Retrieves the full details for a single provider, including all related child data,
 * by reading the provider schema.
 * @param {string} providerId The ID of the provider to retrieve.
 * @returns {object} A success or error object with the provider data.
 */
function getProviderDetails(providerId) {
    try {
        // 1. Use the generic function to get the provider and all direct children
        const providerDetails = getEntityDetails('Providers', providerId);
        if (!providerDetails.success) {
            return providerDetails;
        }
        const provider = providerDetails.data;

        // 2. Perform any special data enrichment that the generic function can't handle
        if (provider.enrollments && provider.enrollments.length > 0) {
            try {
                const groups = getCachedSheetData(GROUPS_SHEET_NAME, GROUPS_HEADERS);
                const plans = getCachedSheetData(PAYER_PLANS_SHEET_NAME, PAYER_PLANS_HEADERS);
                const payers = getCachedSheetData(PAYERS_SHEET_NAME, PAYERS_HEADERS);

                const groupMap = new Map(groups.map(g => [g.id, g.name]));
                const planMap = new Map(plans.map(p => [p.id, { name: p.name, payerId: p.payerId }]));
                const payerMap = new Map(payers.map(p => [p.id, p.name]));

                provider.enrollments.forEach(enrollment => {
                    enrollment.groupName = groupMap.get(enrollment.groupId) || 'N/A';
                    const planInfo = planMap.get(enrollment.payerPlanId);
                    if (planInfo) {
                        enrollment.payerPlanName = planInfo.name || 'N/A';
                        enrollment.payerName = payerMap.get(planInfo.payerId) || 'N/A';
                    } else {
                        enrollment.payerPlanName = 'N/A';
                        enrollment.payerName = 'N/A';
                    }
                });
            } catch (e) {
                console.warn(`Could not enrich provider enrollments for ${providerId}: ${e.message}`);
            }
        }

        return { success: true, data: provider };
    } catch (error) {
        logAuditEvent("Error", `Failed to get provider details for ${providerId}: ${error.message}`);
        return { success: false, message: `Failed to get provider details: ${error.message}` };
    }
}

/**
 * Deletes a provider and all of its associated child data by reading the provider schema.
 * @param {string} providerId The ID of the provider to delete.
 * @returns {object} A success or error object.
 */
function deleteProvider(providerId) {
    try {
        const providerSchema = ENTITY_SCHEMAS["Providers"];
        const sheet = getSheet(providerSchema.sheetName, providerSchema.headers);
        const idColumnIndex = providerSchema.headers.indexOf("ID");
        const rowIndexMap = getOrCreateRowIndex(sheet, idColumnIndex);
        const rowNum = rowIndexMap.get(providerId);

        if (rowNum) {
            // Delete the main provider row
            sheet.deleteRow(rowNum);

            // Delete associated data from all child sheets defined in the schema
            providerSchema.children.forEach(childSchema => {
                try {
                    const currentSheet = getSheet(childSchema.sheetName, childSchema.headers);
                    const parentIdColIndex = childSchema.headers.indexOf(childSchema.parentIdColumn);
                    if (parentIdColIndex !== -1) {
                        deleteRowsByColumnValue(currentSheet, parentIdColIndex, providerId);
                    }
                } catch (e) {
                    // Log a warning but continue the process
                    console.warn(`Could not delete associated data in ${childSchema.sheetName} for provider ${providerId}: ${e.message}`);
                }
            });

            invalidateRowIndexCache(sheet);
            logAuditEvent("Request", `Provider deleted: ${providerId}`, { providerId: providerId });
            return { success: true, message: `Provider with ID ${providerId} and associated data deleted successfully.` };
        } else {
            return { success: false, message: `Provider with ID ${providerId} not found.` };
        }
    } catch (error) {
        logAuditEvent("Error", `Failed to delete provider ${providerId}: ${error.message}`);
        return { success: false, message: `Failed to delete provider: ${error.message}` };
    }
}

// --- Provider Functions ---

function createProvider(providerData) {
  try {
    const sheet = getSheet(PROVIDERS_SHEET_NAME, PROVIDERS_HEADERS);
    const newId = Utilities.getUuid();
    const rowData = [newId, providerData.firstName, providerData.lastName, providerData.npi || "", providerData.nextCredentialingDate || "", providerData.credentialingStatus, providerData.deactivated || false];
    sheet.appendRow(rowData);
    invalidateRowIndexCache(sheet);
    logAuditEvent("Request", `Provider created: ${providerData.firstName} ${providerData.lastName}`, { providerId: newId });
    return { success: true, message: `Provider "${providerData.firstName} ${providerData.lastName}" added with ID: ${newId}` };
  } catch (error) {
    return { success: false, message: `Failed to add provider: ${error.message}` };
  }
}

function getProviders(options = {}) {
  try {
    const { page = 1, pageSize = 15, searchTerm = '', sortBy, sortOrder = 'asc' } = options;
    const sheet = getSheet(PROVIDERS_SHEET_NAME, PROVIDERS_HEADERS);
    let allProviders = sheetDataToObjects(sheet.getDataRange().getValues());

    if (searchTerm) {
      const lowercasedTerm = searchTerm.toLowerCase();
      allProviders = allProviders.filter(p => {
        const fullName = `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase();
        return (p.id && p.id.toLowerCase().includes(lowercasedTerm)) ||
          fullName.includes(lowercasedTerm) ||
          (p.npi && p.npi.toString().includes(lowercasedTerm));
      });
    }

    if (sortBy) {
      allProviders.sort((a, b) => {
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
    }

    const totalRecords = allProviders.length;
    const startIndex = (page - 1) * pageSize;
    const paginatedData = allProviders.slice(startIndex, startIndex + pageSize);

    return { success: true, data: paginatedData, totalRecords: totalRecords };
  } catch (error) {
    return { success: false, message: `Failed to retrieve providers: ${error.message}` };
  }
}

function updateProvider(providerData) {
  // This function now uses the generic patchDetailedInfo helper.
  // The specific logic for updating a provider row is now centralized.
  const result = patchDetailedInfo(PROVIDERS_SHEET_NAME, providerData.id, providerData);
  if (result.success) {
    logAuditEvent("Request", `Provider updated: ${providerData.id}`, { providerId: providerData.id });
  } else {
    logAuditEvent("Error", `Failed to update provider ${providerData.id}: ${result.message}`);
  }
  return result;
}

/**
 * Gathers all relevant credentialing data for a specific provider.
 * @param {string} providerId The ID of the provider.
 * @returns {object} An object containing success status and the aggregated credentialing data.
 */
function getProviderCredentialingData(providerId) {
  try {
    const providerDetails = getProviderDetails(providerId);
    if (!providerDetails.success) {
      return providerDetails;
    }
    const provider = providerDetails.data;

    const credentialingData = {
      providerInfo: {
        basicInfo: { id: provider.id, firstName: provider.firstName, lastName: provider.lastName, npi: provider.npi, credentialingStatus: provider.credentialingStatus, deactivated: provider.deactivated },
        aliases: provider.aliases, addresses: provider.addresses, emails: provider.emails, education: provider.education, training: provider.training, workHistory: provider.workHistory, boardCertifications: provider.boardCertifications, deaRegistrations: provider.deaRegistrations, certificates: provider.certificates, caqhInfo: provider.caqhInfo, liabilityInsurances: provider.liabilityInsurances
      },
      licenseVerifications: provider.licenses,
      datasetScans: sheetDataToObjects(getSheet(DATASET_SCANS_SHEET_NAME, DATASET_SCANS_HEADERS).getDataRange().getValues()).filter(s => s.providerId === providerId),
      alerts: sheetDataToObjects(getSheet(ALERTS_SHEET_NAME, ALERTS_HEADERS).getDataRange().getValues()).filter(a => a.providerId === providerId),
      files: provider.files,
      profiles: sheetDataToObjects(getSheet(PROVIDER_PROFILE_IMPORTS_SHEET_NAME, PROVIDER_PROFILE_IMPORTS_HEADERS).getDataRange().getValues()).filter(p => p.providerId === providerId)
    };

    return { success: true, data: credentialingData };
  } catch (error) {
    logAuditEvent("Error", `Failed to get provider credentialing data for ${providerId}: ${error.message}`);
    return { success: false, message: `Failed to get provider credentialing data: ${error.message}` };
  }
}

/**
 * Creates a new provider alias record.
 * @param {string} providerId The ID of the provider the alias belongs to.
 * @param {object} aliasData The data for the new alias (firstName, lastName).
 * @returns {object} A success or error message.
 */
function createProviderAliasInfo(providerId, aliasData) {
  if (!providerId || !aliasData || !aliasData.firstName || !aliasData.lastName) {
    return { success: false, message: "Provider ID, first name, and last name are required." };
  }
  const rowData = [aliasData.firstName, aliasData.lastName];
  return createSubEntity(
    ALIASES_SHEET_NAME,
    ALIASES_HEADERS,
    providerId,
    rowData,
    `Alias "${aliasData.firstName} ${aliasData.lastName}"`
  );
}
/**
 * Retrieves a list of aliases for a given provider.
 * @param {string} providerId The ID of the provider to retrieve aliases for.
 * @returns {object} An object containing success status and alias data.
 */
function listProviderAliasInfos(providerId) {
  try {
    if (!providerId) {
      return { success: false, message: "Provider ID is required to list aliases." };
    }
    const sheet = getSheet(ALIASES_SHEET_NAME, ALIASES_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const providerAliases = allRecords.filter(record => record.providerId === providerId);
    return { success: true, data: providerAliases };
  } catch (error) {
    return { success: false, message: `Failed to list provider aliases: ${error.message}` };
  }
}

/**
 * Retrieves a specific provider alias by its ID and provider ID.
 * @param {string} providerId The ID of the provider the alias belongs to.
 * @param {string} aliasId The ID of the alias to retrieve.
 * @returns {object} An object containing success status and alias data.
 */
function getProviderAliasInfo(providerId, aliasId) {
  try {
    if (!providerId || !aliasId) {
      return { success: false, message: "Provider ID and Alias ID are required to get alias details." };
    }
    const sheet = getSheet(ALIASES_SHEET_NAME, ALIASES_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const alias = allRecords.find(record => record.providerId === providerId && record.id === aliasId);
    if (!alias) {
      return { success: false, message: `Alias with ID ${aliasId} not found for provider ${providerId}.` };
    }
    return { success: true, data: alias };
  } catch (error) {
    return { success: false, message: `Failed to retrieve provider alias details: ${error.message}` };
  }
}

/**
 * Updates an existing provider alias.
 * @param {string} aliasId The ID of the alias to update.
 * @param {object} aliasData The data to patch (e.g., firstName, lastName).
 * @returns {object} A success or error message.
 */
function putProviderAliasInfo(aliasId, aliasData) {
  // Using patchDetailedInfo for a generic update, assuming aliasData includes the ID.
  // Note: For 'put' semantic, it usually means full replacement. If only partial updates are intended, 'patch' is more appropriate.
  // The provided API script uses 'put' for this, implying full replacement or creation if not exists.
  // For simplicity and alignment with existing patch helpers, we'll treat it as a patch here.
  const result = patchDetailedInfo(ALIASES_SHEET_NAME, aliasId, aliasData);
  if (result.success) {
    logAuditEvent("Request", `Provider alias updated: ${aliasId}`, { aliasId: aliasId, newData: aliasData });
  } else {
    logAuditEvent("Error", `Failed to update provider alias ${aliasId}: ${result.message}`);
  }
  return result;
}

/**
 * Deletes a provider alias record.
 * @param {string} aliasId The ID of the alias to delete.
 * @returns {object} A success or error message.
 */
function deleteProviderAliasInfo(aliasId) {
  const result = deleteDetailedProviderInfo(ALIASES_SHEET_NAME, ALIASES_HEADERS, aliasId);
  if (result.success) {
    logAuditEvent("Request", `Provider alias deleted: ${aliasId}`, { aliasId: aliasId });
  }
  return result;
}

// --- Provider Addresses Functions ---

/**
 * Creates a new provider address record.
 * @param {string} providerId The ID of the provider the address belongs to.
 * @param {object} addressData The data for the new address (addressLine1, city, state, zipCode, type).
 * @returns {object} A success or error message.
 */
function createProviderAddressInfo(providerId, addressData) {
  if (!providerId || !addressData || !addressData.addressLine1 || !addressData.city || !addressData.state || !addressData.zipCode) {
    return { success: false, message: "Provider ID, address line 1, city, state, and zip code are required." };
  }
  const rowData = [
    addressData.addressLine1,
    addressData.addressLine2 || "",
    addressData.city,
    addressData.state,
    addressData.zipCode,
    addressData.type || "Unspecified"
  ];
  return createSubEntity(
    ADDRESSES_SHEET_NAME,
    ADDRESSES_HEADERS,
    providerId,
    rowData,
    `Address "${addressData.addressLine1}"`
  );
}

/**
 * Retrieves a list of addresses for a given provider.
 * @param {string} providerId The ID of the provider to retrieve addresses for.
 * @returns {object} An object containing success status and address data.
 */
function listProviderAddressInfos(providerId) {
  try {
    if (!providerId) {
      return { success: false, message: "Provider ID is required to list addresses." };
    }
    const sheet = getSheet(ADDRESSES_SHEET_NAME, ADDRESSES_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const providerAddresses = allRecords.filter(record => record.providerId === providerId);
    return { success: true, data: providerAddresses };
  } catch (error) {
    return { success: false, message: `Failed to list provider addresses: ${error.message}` };
  }
}

/**
 * Retrieves a specific provider address by its ID and provider ID.
 * @param {string} providerId The ID of the provider the address belongs to.
 * @param {string} addressId The ID of the address to retrieve.
 * @returns {object} An object containing success status and address data.
 */
function getProviderAddressInfo(providerId, addressId) {
  try {
    if (!providerId || !addressId) {
      return { success: false, message: "Provider ID and Address ID are required to get address details." };
    }
    const sheet = getSheet(ADDRESSES_SHEET_NAME, ADDRESSES_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const address = allRecords.find(record => record.providerId === providerId && record.id === addressId);
    if (!address) {
      return { success: false, message: `Address with ID ${addressId} not found for provider ${providerId}.` };
    }
    return { success: true, data: address };
  } catch (error) {
    return { success: false, message: `Failed to retrieve provider address details: ${error.message}` };
  }
}

/**
 * Updates an existing provider address.
 * @param {string} addressId The ID of the address to update.
 * @param {object} addressData The data to patch (e.g., addressLine1, city, state, zipCode, type).
 * @returns {object} A success or error message.
 */
function putProviderAddressInfo(addressId, addressData) {
  // Using patchDetailedInfo for a generic update.
  const result = patchDetailedInfo(ADDRESSES_SHEET_NAME, addressId, addressData);
  if (result.success) {
    logAuditEvent("Request", `Provider address updated: ${addressId}`, { addressId: addressId, newData: addressData });
  } else {
    logAuditEvent("Error", `Failed to update provider address ${addressId}: ${result.message}`);
  }
  return result;
}

/**
 * Deletes a provider address record.
 * @param {string} addressId The ID of the address to delete.
 * @returns {object} A success or error message.
 */
function deleteProviderAddressInfo(addressId) {
  const result = deleteDetailedProviderInfo(ADDRESSES_SHEET_NAME, ADDRESSES_HEADERS, addressId);
  if (result.success) {
    logAuditEvent("Request", `Provider address deleted: ${addressId}`, { addressId: addressId });
  }
  return result;
}

// --- Provider Emails Functions ---

/**
 * Creates a new provider email record.
 * @param {string} providerId The ID of the provider the email belongs to.
 * @param {object} emailData The data for the new email (email, type).
 * @returns {object} A success or error message.
 */
function createProviderEmailInfo(providerId, emailData) {
  if (!providerId || !emailData || !emailData.email) {
    return { success: false, message: "Provider ID and email address are required." };
  }
  const rowData = [emailData.email, emailData.type || "Unspecified"];
  return createSubEntity(
    EMAILS_SHEET_NAME,
    EMAILS_HEADERS,
    providerId,
    rowData,
    `Email "${emailData.email}"`
  );
}

/**
 * Retrieves a list of emails for a given provider.
 * @param {string} providerId The ID of the provider to retrieve emails for.
 * @returns {object} An object containing success status and email data.
 */
function listProviderEmailInfos(providerId) {
  try {
    if (!providerId) {
      return { success: false, message: "Provider ID is required to list emails." };
    }
    const sheet = getSheet(EMAILS_SHEET_NAME, EMAILS_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const providerEmails = allRecords.filter(record => record.providerId === providerId);
    return { success: true, data: providerEmails };
  } catch (error) {
    return { success: false, message: `Failed to list provider emails: ${error.message}` };
  }
}

/**
 * Retrieves a specific provider email by its ID and provider ID.
 * @param {string} providerId The ID of the provider the email belongs to.
 * @param {string} emailId The ID of the email to retrieve.
 * @returns {object} An object containing success status and email data.
 */
function getProviderEmailInfo(providerId, emailId) {
  try {
    if (!providerId || !emailId) {
      return { success: false, message: "Provider ID and Email ID are required to get email details." };
    }
    const sheet = getSheet(EMAILS_SHEET_NAME, EMAILS_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const email = allRecords.find(record => record.providerId === providerId && record.id === emailId);
    if (!email) {
      return { success: false, message: `Email with ID ${emailId} not found for provider ${providerId}.` };
    }
    return { success: true, data: email };
  } catch (error) {
    return { success: false, message: `Failed to retrieve provider email details: ${error.message}` };
  }
}

/**
 * Updates an existing provider email.
 * @param {string} emailId The ID of the email to update.
 * @param {object} emailData The data to patch (e.g., email, type).
 * @returns {object} A success or error message.
 */
function putProviderEmailInfo(emailId, emailData) {
  // Using patchDetailedInfo for a generic update.
  const result = patchDetailedInfo(EMAILS_SHEET_NAME, emailId, emailData);
  if (result.success) {
    logAuditEvent("Request", `Provider email updated: ${emailId}`, { emailId: emailId, newData: emailData });
  } else {
    logAuditEvent("Error", `Failed to update provider email ${emailId}: ${result.message}`);
  }
  return result;
}

/**
 * Deletes a provider email record.
 * @param {string} emailId The ID of the email to delete.
 * @returns {object} A success or error message.
 */
function deleteProviderEmailInfo(emailId) {
  const result = deleteDetailedProviderInfo(EMAILS_SHEET_NAME, EMAILS_HEADERS, emailId);
  if (result.success) {
    logAuditEvent("Request", `Provider email deleted: ${emailId}`, { emailId: emailId });
  }
  return result;
}

// --- Provider Notes (Quick Add) ---

/**
 * Creates a new note linked to a provider.
 * @param {string} providerId The ID of the provider the note belongs to.
 * @param {object} noteData The data for the new note (note).
 * @returns {object} A success or error message.
 */
function addProviderNote(providerId, noteData) {
  try {
    if (!providerId || !noteData || !noteData.note) {
      return { success: false, message: "Provider ID and note text are required." };
    }
    const sheet = getSheet(NOTES_SHEET_NAME, NOTES_HEADERS);
    const newId = Utilities.getUuid();
    const now = new Date().toISOString();
    const userEmail = Session.getActiveUser().getEmail();
    // Headers: ["ID", "Provider ID", "Facility ID", "Request ID", "Note", "Timestamp", "User Email", "Last Modified At", "Last Modified By"]
    const rowData = [newId, providerId, "", "", noteData.note, now, userEmail, "", ""];
    sheet.appendRow(rowData);
    invalidateRowIndexCache(sheet);
    logAuditEvent("Request", `Note added to provider ${providerId}`, { providerId: providerId, noteId: newId });
    return { success: true, message: "Note added successfully." };
  } catch (error) {
    logAuditEvent("Error", `Failed to add provider note: ${error.message}`);
    return { success: false, message: `Failed to add provider note: ${error.message}` };
  }
}

// --- Provider Education Functions ---

/**
 * Creates a new provider education record.
 * @param {string} providerId The ID of the provider the education belongs to.
 * @param {object} educationData The data for the new education record (schoolName, degree, graduateType, startDate, endDate).
 * @returns {object} A success or error message.
 */
function createProviderEducationInfo(providerId, educationData) {
  if (!providerId || !educationData || !educationData.schoolName || !educationData.degree) {
    return { success: false, message: "Provider ID, school name, and degree are required." };
  }
  const rowData = [
    educationData.schoolName,
    educationData.degree,
    educationData.graduateType || "",
    educationData.startDate || "",
    educationData.endDate || ""
  ];
  return createSubEntity(
    PROVIDER_EDUCATION_SHEET_NAME,
    PROVIDER_EDUCATION_HEADERS,
    providerId,
    rowData,
    `Education record for "${educationData.schoolName}"`
  );
}

/**
 * Retrieves a list of education records for a given provider.
 * @param {string} providerId The ID of the provider to retrieve education records for.
 * @returns {object} An object containing success status and education data.
 */
function listProviderEducationInfos(providerId) {
  try {
    if (!providerId) {
      return { success: false, message: "Provider ID is required to list education records." };
    }
    const sheet = getSheet(PROVIDER_EDUCATION_SHEET_NAME, PROVIDER_EDUCATION_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const providerEducationRecords = allRecords.filter(record => record.providerId === providerId);
    return { success: true, data: providerEducationRecords };
  } catch (error) {
    return { success: false, message: `Failed to list provider education records: ${error.message}` };
  }
}

/**
 * Retrieves a specific provider education record by its ID and provider ID.
 * @param {string} providerId The ID of the provider the education belongs to.
 * @param {string} educationId The ID of the education record to retrieve.
 * @returns {object} An object containing success status and education data.
 */
function getProviderEducationInfo(providerId, educationId) {
  try {
    if (!providerId || !educationId) {
      return { success: false, message: "Provider ID and Education ID are required to get education details." };
    }
    const sheet = getSheet(PROVIDER_EDUCATION_SHEET_NAME, PROVIDER_EDUCATION_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const education = allRecords.find(record => record.providerId === providerId && record.id === educationId);
    if (!education) {
      return { success: false, message: `Education record with ID ${educationId} not found for provider ${providerId}.` };
    }
    return { success: true, data: education };
  } catch (error) {
    return { success: false, message: `Failed to retrieve provider education details: ${error.message}` };
  }
}

/**
 * Updates an existing provider education record.
 * @param {string} educationId The ID of the education record to update.
 * @param {object} educationData The data to patch (e.g., schoolName, degree, graduateType, startDate, endDate).
 * @returns {object} A success or error message.
 */
function patchProviderEducationInfo(educationId, educationData) {
  // Using patchDetailedInfo for a generic update.
  const result = patchDetailedInfo(PROVIDER_EDUCATION_SHEET_NAME, educationId, educationData);
  if (result.success) {
    logAuditEvent("Request", `Provider education updated: ${educationId}`, { educationId: educationId, newData: educationData });
  } else {
    logAuditEvent("Error", `Failed to update provider education ${educationId}: ${result.message}`);
  }
  return result;
}

/**
 * Deletes a provider education record.
 * @param {string} educationId The ID of the education record to delete.
 * @returns {object} A success or error message.
 */
function deleteProviderEducationInfo(educationId) {
  const result = deleteDetailedProviderInfo(PROVIDER_EDUCATION_SHEET_NAME, PROVIDER_EDUCATION_HEADERS, educationId);
  if (result.success) {
    logAuditEvent("Request", `Provider education deleted: ${educationId}`, { educationId: educationId });
  }
  return result;
}

// --- Provider Training Functions ---

/**
 * Creates a new provider training record.
 * @param {string} providerId The ID of the provider the training belongs to.
 * @param {object} trainingData The data for the new training record (institutionName, speciality, trainingType, startDate, endDate).
 * @returns {object} A success or error message.
 */
function createProviderTrainingInfo(providerId, trainingData) {
  if (!providerId || !trainingData || !trainingData.institutionName || !trainingData.speciality) {
    return { success: false, message: "Provider ID, institution name, and speciality are required." };
  }
  const rowData = [
    trainingData.institutionName,
    trainingData.speciality,
    trainingData.trainingType || "",
    trainingData.startDate || "",
    trainingData.endDate || ""
  ];
  return createSubEntity(
    PROVIDER_TRAINING_SHEET_NAME,
    PROVIDER_TRAINING_HEADERS,
    providerId,
    rowData,
    `Training record for "${trainingData.institutionName}"`
  );
}

/**
 * Retrieves a list of training records for a given provider.
 * @param {string} providerId The ID of the provider to retrieve training records for.
 * @returns {object} An object containing success status and training data.
 */
function listProviderTrainingInfos(providerId) {
  try {
    if (!providerId) {
      return { success: false, message: "Provider ID is required to list training records." };
    }
    const sheet = getSheet(PROVIDER_TRAINING_SHEET_NAME, PROVIDER_TRAINING_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const providerTrainingRecords = allRecords.filter(record => record.providerId === providerId);
    return { success: true, data: providerTrainingRecords };
  } catch (error) {
    return { success: false, message: `Failed to list provider training records: ${error.message}` };
  }
}

/**
 * Retrieves a specific provider training record by its ID and provider ID.
 * @param {string} providerId The ID of the provider the training belongs to.
 * @param {string} trainingId The ID of the training record to retrieve.
 * @returns {object} An object containing success status and training data.
 */
function getProviderTrainingInfo(providerId, trainingId) {
  try {
    if (!providerId || !trainingId) {
      return { success: false, message: "Provider ID and Training ID are required to get training details." };
    }
    const sheet = getSheet(PROVIDER_TRAINING_SHEET_NAME, PROVIDER_TRAINING_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const training = allRecords.find(record => record.providerId === providerId && record.id === trainingId);
    if (!training) {
      return { success: false, message: `Training record with ID ${trainingId} not found for provider ${providerId}.` };
    }
    return { success: true, data: training };
  } catch (error) {
    return { success: false, message: `Failed to retrieve provider training details: ${error.message}` };
  }
}

/**
 * Updates an existing provider training record.
 * @param {string} trainingId The ID of the training record to update.
 * @param {object} trainingData The data to patch (e.g., institutionName, speciality, trainingType, startDate, endDate).
 * @returns {object} A success or error message.
 */
function patchProviderTrainingInfo(trainingId, trainingData) {
  // Using patchDetailedInfo for a generic update.
  const result = patchDetailedInfo(PROVIDER_TRAINING_SHEET_NAME, trainingId, trainingData);
  if (result.success) {
    logAuditEvent("Request", `Provider training updated: ${trainingId}`, { trainingId: trainingId, newData: trainingData });
  } else {
    logAuditEvent("Error", `Failed to update provider training ${trainingId}: ${result.message}`);
  }
  return result;
}

/**
 * Deletes a provider training record.
 * @param {string} trainingId The ID of the training record to delete.
 * @returns {object} A success or error message.
 */
function deleteProviderTrainingInfo(trainingId) {
  const result = deleteDetailedProviderInfo(PROVIDER_TRAINING_SHEET_NAME, PROVIDER_TRAINING_HEADERS, trainingId);
  if (result.success) {
    logAuditEvent("Request", `Provider training deleted: ${trainingId}`, { trainingId: trainingId });
  }
  return result;
}

// --- Provider Work History Functions ---

/**
 * Creates a new provider work history record.
 * @param {string} providerId The ID of the provider the work history belongs to.
 * @param {object} workHistoryData The data for the new work history record (name, jobTitle, startDate, endDate, isCurrentEmployer).
 * @returns {object} A success or error message.
 */
function createProviderWorkHistoryInfo(providerId, workHistoryData) {
  if (!providerId || !workHistoryData || !workHistoryData.name || !workHistoryData.jobTitle) {
    return { success: false, message: "Provider ID, employer name, and job title are required." };
  }
  const rowData = [
    workHistoryData.name,
    workHistoryData.jobTitle,
    workHistoryData.startDate || "",
    workHistoryData.endDate || "",
    workHistoryData.isCurrentEmployer || false
  ];
  return createSubEntity(
    PROVIDER_WORK_HISTORY_SHEET_NAME,
    PROVIDER_WORK_HISTORY_HEADERS,
    providerId,
    rowData,
    `Work history record for "${workHistoryData.name}"`
  );
}

/**
 * Retrieves a list of work history records for a given provider.
 * @param {string} providerId The ID of the provider to retrieve work history records for.
 * @returns {object} An object containing success status and work history data.
 */
function listProviderWorkHistoryInfos(providerId) {
  try {
    if (!providerId) {
      return { success: false, message: "Provider ID is required to list work history records." };
    }
    const sheet = getSheet(PROVIDER_WORK_HISTORY_SHEET_NAME, PROVIDER_WORK_HISTORY_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const providerWorkHistoryRecords = allRecords.filter(record => record.providerId === providerId);
    return { success: true, data: providerWorkHistoryRecords };
  } catch (error) {
    return { success: false, message: `Failed to list provider work history records: ${error.message}` };
  }
}

/**
 * Retrieves a specific provider work history record by its ID and provider ID.
 * @param {string} providerId The ID of the provider the work history belongs to.
 * @param {string} workHistoryId The ID of the work history record to retrieve.
 * @returns {object} An object containing success status and work history data.
 */
function getProviderWorkHistoryInfo(providerId, workHistoryId) {
  try {
    if (!providerId || !workHistoryId) {
      return { success: false, message: "Provider ID and Work History ID are required to get work history details." };
    }
    const sheet = getSheet(PROVIDER_WORK_HISTORY_SHEET_NAME, PROVIDER_WORK_HISTORY_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const workHistory = allRecords.find(record => record.providerId === providerId && record.id === workHistoryId);
    if (!workHistory) {
      return { success: false, message: `Work history record with ID ${workHistoryId} not found for provider ${providerId}.` };
    }
    return { success: true, data: workHistory };
  } catch (error) {
    return { success: false, message: `Failed to retrieve provider work history details: ${error.message}` };
  }
}

/**
 * Updates an existing provider work history record.
 * @param {string} workHistoryId The ID of the work history record to update.
 * @param {object} workHistoryData The data to patch (e.g., name, jobTitle, startDate, endDate, isCurrentEmployer).
 * @returns {object} A success or error message.
 */
function patchProviderWorkHistoryInfo(workHistoryId, workHistoryData) {
  // Using patchDetailedInfo for a generic update.
  const result = patchDetailedInfo(PROVIDER_WORK_HISTORY_SHEET_NAME, workHistoryId, workHistoryData);
  if (result.success) {
    logAuditEvent("Request", `Provider work history updated: ${workHistoryId}`, { workHistoryId: workHistoryId, newData: workHistoryData });
  } else {
    logAuditEvent("Error", `Failed to update provider work history ${workHistoryId}: ${result.message}`);
  }
  return result;
}

/**
 * Deletes a provider work history record.
 * @param {string} workHistoryId The ID of the work history record to delete.
 * @returns {object} A success or error message.
 */
function deleteProviderWorkHistoryInfo(workHistoryId) {
  const result = deleteDetailedProviderInfo(PROVIDER_WORK_HISTORY_SHEET_NAME, PROVIDER_WORK_HISTORY_HEADERS, workHistoryId);
  if (result.success) {
    logAuditEvent("Request", `Provider work history deleted: ${workHistoryId}`, { workHistoryId: workHistoryId });
  }
  return result;
}

// --- Provider DEA Registrations Functions ---

/**
 * Creates a new provider DEA registration record.
 * @param {string} providerId The ID of the provider the DEA registration belongs to.
 * @param {object} deaRegistrationData The data for the new DEA registration (registrationNumber, lastUpdatedAt).
 * @returns {object} A success or error message.
 */
function createDeaRegistrationInfo(providerId, deaRegistrationData) {
  if (!providerId || !deaRegistrationData || !deaRegistrationData.registrationNumber) {
    return { success: false, message: "Provider ID and registration number are required." };
  }
  const rowData = [
    deaRegistrationData.registrationNumber,
    deaRegistrationData.lastUpdatedAt || new Date().toISOString()
  ];
  return createSubEntity(
    PROVIDER_DEA_REGISTRATIONS_SHEET_NAME,
    PROVIDER_DEA_REGISTRATIONS_HEADERS,
    providerId,
    rowData,
    `DEA Registration "${deaRegistrationData.registrationNumber}"`
  );
}

/**
 * Retrieves a list of DEA registration records for a given provider.
 * @param {string} providerId The ID of the provider to retrieve DEA registration records for.
 * @returns {object} An object containing success status and DEA registration data.
 */
function listDeaRegistrationInfos(providerId) {
  try {
    if (!providerId) {
      return { success: false, message: "Provider ID is required to list DEA registrations." };
    }
    const sheet = getSheet(PROVIDER_DEA_REGISTRATIONS_SHEET_NAME, PROVIDER_DEA_REGISTRATIONS_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const providerDeaRegistrations = allRecords.filter(record => record.providerId === providerId);
    return { success: true, data: providerDeaRegistrations };
  } catch (error) {
    return { success: false, message: `Failed to list provider DEA registrations: ${error.message}` };
  }
}

/**
 * Retrieves a specific provider DEA registration record by its ID and provider ID.
 * @param {string} providerId The ID of the provider the DEA registration belongs to.
 * @param {string} deaRegistrationId The ID of the DEA registration record to retrieve.
 * @returns {object} An object containing success status and DEA registration data.
 */
function getDeaRegistrationInfo(providerId, deaRegistrationId) {
  try {
    if (!providerId || !deaRegistrationId) {
      return { success: false, message: "Provider ID and DEA Registration ID are required to get DEA registration details." };
    }
    const sheet = getSheet(PROVIDER_DEA_REGISTRATIONS_SHEET_NAME, PROVIDER_DEA_REGISTRATIONS_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const deaRegistration = allRecords.find(record => record.providerId === providerId && record.id === deaRegistrationId);
    if (!deaRegistration) {
      return { success: false, message: `DEA Registration with ID ${deaRegistrationId} not found for provider ${providerId}.` };
    }
    return { success: true, data: deaRegistration };
  } catch (error) {
    return { success: false, message: `Failed to retrieve provider DEA registration details: ${error.message}` };
  }
}

/**
 * Updates an existing provider DEA registration record.
 * @param {string} deaRegistrationId The ID of the DEA registration record to update.
 * @param {object} deaRegistrationData The data to patch (e.g., registrationNumber, lastUpdatedAt).
 * @returns {object} A success or error message.
 */
function patchDeaRegistrationInfo(deaRegistrationId, deaRegistrationData) {
  // Using patchDetailedInfo for a generic update.
  const result = patchDetailedInfo(PROVIDER_DEA_REGISTRATIONS_SHEET_NAME, deaRegistrationId, deaRegistrationData);
  if (result.success) {
    logAuditEvent("Request", `Provider DEA registration updated: ${deaRegistrationId}`, { deaRegistrationId: deaRegistrationId, newData: deaRegistrationData });
  } else {
    logAuditEvent("Error", `Failed to update provider DEA registration ${deaRegistrationId}: ${result.message}`);
  }
  return result;
}

/**
 * Deletes a provider DEA registration record.
 * @param {string} deaRegistrationId The ID of the DEA registration record to delete.
 * @returns {object} A success or error message.
 */
function deleteDeaRegistrationInfo(deaRegistrationId) {
  const result = deleteDetailedProviderInfo(PROVIDER_DEA_REGISTRATIONS_SHEET_NAME, PROVIDER_DEA_REGISTRATIONS_HEADERS, deaRegistrationId);
  if (result.success) {
    logAuditEvent("Request", `Provider DEA registration deleted: ${deaRegistrationId}`, { deaRegistrationId: deaRegistrationId });
  }
  return result;
}

// --- Provider Board Certifications Functions ---

/**
 * Creates a new provider board certification record.
 * @param {string} providerId The ID of the provider the board certification belongs to.
 * @param {object} boardCertificationData The data for the new board certification (type, specialty, initialCertificationDate, expirationDate).
 * @returns {object} A success or error message.
 */
function createBoardCertificationInfo(providerId, boardCertificationData) {
  if (!providerId || !boardCertificationData || !boardCertificationData.type || !boardCertificationData.specialty) {
    return { success: false, message: "Provider ID, type, and specialty are required." };
  }
  const rowData = [
    boardCertificationData.type,
    boardCertificationData.specialty,
    boardCertificationData.initialCertificationDate || "",
    boardCertificationData.expirationDate || ""
  ];
  return createSubEntity(
    PROVIDER_BOARD_CERTIFICATIONS_SHEET_NAME,
    PROVIDER_BOARD_CERTIFICATIONS_HEADERS,
    providerId,
    rowData,
    `Board Certification "${boardCertificationData.type}"`
  );
}

/**
 * Retrieves a list of board certification records for a given provider.
 * @param {string} providerId The ID of the provider to retrieve board certification records for.
 * @returns {object} An object containing success status and board certification data.
 */
function listBoardCertificationsInfo(providerId) {
  try {
    if (!providerId) {
      return { success: false, message: "Provider ID is required to list board certifications." };
    }
    const sheet = getSheet(PROVIDER_BOARD_CERTIFICATIONS_SHEET_NAME, PROVIDER_BOARD_CERTIFICATIONS_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const providerBoardCertifications = allRecords.filter(record => record.providerId === providerId);
    return { success: true, data: providerBoardCertifications };
  } catch (error) {
    return { success: false, message: `Failed to list provider board certifications: ${error.message}` };
  }
}

/**
 * Retrieves a specific provider board certification record by its ID and provider ID.
 * @param {string} providerId The ID of the provider the board certification belongs to.
 * @param {string} boardCertificationId The ID of the board certification record to retrieve.
 * @returns {object} An object containing success status and board certification data.
 */
function getBoardCertificationInfo(providerId, boardCertificationId) {
  try {
    if (!providerId || !boardCertificationId) {
      return { success: false, message: "Provider ID and Board Certification ID are required to get board certification details." };
    }
    const sheet = getSheet(PROVIDER_BOARD_CERTIFICATIONS_SHEET_NAME, PROVIDER_BOARD_CERTIFICATIONS_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const boardCertification = allRecords.find(record => record.providerId === providerId && record.id === boardCertificationId);
    if (!boardCertification) {
      return { success: false, message: `Board Certification with ID ${boardCertificationId} not found for provider ${providerId}.` };
    }
    return { success: true, data: boardCertification };
  } catch (error) {
    return { success: false, message: `Failed to retrieve provider board certification details: ${error.message}` };
  }
}

/**
 * Updates an existing provider board certification record.
 * @param {string} boardCertificationId The ID of the board certification record to update.
 * @param {object} boardCertificationData The data to patch (e.g., type, specialty, initialCertificationDate, expirationDate).
 * @returns {object} A success or error message.
 */
function patchBoardCertificationInfo(boardCertificationId, boardCertificationData) {
  // Using patchDetailedInfo for a generic update.
  const result = patchDetailedInfo(PROVIDER_BOARD_CERTIFICATIONS_SHEET_NAME, boardCertificationId, boardCertificationData);
  if (result.success) {
    logAuditEvent("Request", `Provider board certification updated: ${boardCertificationId}`, { boardCertificationId: boardCertificationId, newData: boardCertificationData });
  } else {
    logAuditEvent("Error", `Failed to update provider board certification ${boardCertificationId}: ${result.message}`);
  }
  return result;
}

/**
 * Deletes a provider board certification record.
 * @param {string} boardCertificationId The ID of the board certification record to delete.
 * @returns {object} A success or error message.
 */
function deleteBoardCertificationInfo(boardCertificationId) {
  const result = deleteDetailedProviderInfo(PROVIDER_BOARD_CERTIFICATIONS_SHEET_NAME, PROVIDER_BOARD_CERTIFICATIONS_HEADERS, boardCertificationId);
  if (result.success) {
    logAuditEvent("Request", `Provider board certification deleted: ${boardCertificationId}`, { boardCertificationId: boardCertificationId });
  }
  return result;
}

// --- Provider Certificates Functions ---

/**
 * Creates a new provider certificate record.
 * @param {string} providerId The ID of the provider the certificate belongs to.
 * @param {object} certificateData The data for the new certificate (type, certificateNumber, firstName, lastName, issueDate, expirationDate, certifyingOrganization).
 * @returns {object} A success or error message.
 */
function createCertificateInfo(providerId, certificateData) {
  if (!providerId || !certificateData || !certificateData.type || !certificateData.certificateNumber) {
    return { success: false, message: "Provider ID, type, and certificate number are required." };
  }
  const rowData = [
    certificateData.type,
    certificateData.certificateNumber,
    certificateData.firstName || "",
    certificateData.lastName || "",
    certificateData.issueDate || "",
    certificateData.expirationDate || "",
    certificateData.certifyingOrganization || ""
  ];
  return createSubEntity(
    PROVIDER_CERTIFICATES_SHEET_NAME,
    PROVIDER_CERTIFICATES_HEADERS,
    providerId,
    rowData,
    `Certificate "${certificateData.type}"`
  );
}

/**
 * Retrieves a list of certificate records for a given provider.
 * @param {string} providerId The ID of the provider to retrieve certificate records for.
 * @returns {object} An object containing success status and certificate data.
 */
function listCertificateInfos(providerId) {
  try {
    if (!providerId) {
      return { success: false, message: "Provider ID is required to list certificates." };
    }
    const sheet = getSheet(PROVIDER_CERTIFICATES_SHEET_NAME, PROVIDER_CERTIFICATES_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const providerCertificates = allRecords.filter(record => record.providerId === providerId);
    return { success: true, data: providerCertificates };
  } catch (error) {
    return { success: false, message: `Failed to list provider certificates: ${error.message}` };
  }
}

/**
 * Retrieves a specific provider certificate record by its ID and provider ID.
 * @param {string} providerId The ID of the provider the certificate belongs to.
 * @param {string} certificateId The ID of the certificate record to retrieve.
 * @returns {object} An object containing success status and certificate data.
 */
function getCertificateInfo(providerId, certificateId) {
  try {
    if (!providerId || !certificateId) {
      return { success: false, message: "Provider ID and Certificate ID are required to get certificate details." };
    }
    const sheet = getSheet(PROVIDER_CERTIFICATES_SHEET_NAME, PROVIDER_CERTIFICATES_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const certificate = allRecords.find(record => record.providerId === providerId && record.id === certificateId);
    if (!certificate) {
      return { success: false, message: `Certificate with ID ${certificateId} not found for provider ${providerId}.` };
    }
    return { success: true, data: certificate };
  } catch (error) {
    return { success: false, message: `Failed to retrieve provider certificate details: ${error.message}` };
  }
}

/**
 * Updates an existing provider certificate record.
 * @param {string} certificateId The ID of the certificate record to update.
 * @param {object} certificateData The data to patch (e.g., type, certificateNumber, firstName, lastName, issueDate, expirationDate, certifyingOrganization).
 * @returns {object} A success or error message.
 */
function patchCertificateInfo(certificateId, certificateData) {
  // Using patchDetailedInfo for a generic update.
  const result = patchDetailedInfo(PROVIDER_CERTIFICATES_SHEET_NAME, certificateId, certificateData);
  if (result.success) {
    logAuditEvent("Request", `Provider certificate updated: ${certificateId}`, { certificateId: certificateId, newData: certificateData });
  } else {
    logAuditEvent("Error", `Failed to update provider certificate ${certificateId}: ${result.message}`);
  }
  return result;
}

/**
 * Deletes a provider certificate record.
 * @param {string} certificateId The ID of the certificate record to delete.
 * @returns {object} A success or error message.
 */
function deleteCertificateInfo(certificateId) {
  const result = deleteDetailedProviderInfo(PROVIDER_CERTIFICATES_SHEET_NAME, PROVIDER_CERTIFICATES_HEADERS, certificateId);
  if (result.success) {
    logAuditEvent("Request", `Provider certificate deleted: ${certificateId}`, { certificateId: certificateId });
  }
  return result;
}

// --- Provider CAQH Info Functions ---

/**
 * Creates or updates a provider's CAQH login information.
 * This function acts as a 'put' operation: it will create if not exists, or replace if it does.
 * For simplicity, we'll implement it as a create or update based on existence.
 * @param {string} providerId The ID of the provider the CAQH info belongs to.
 * @param {object} caqhData The CAQH data (caqhId).
 * @returns {object} A success or error message.
 */
function putProviderCaqhInfo(providerId, caqhData) {
  try {
    if (!providerId || !caqhData || !caqhData.caqhId) {
      return { success: false, message: "Provider ID and CAQH ID are required for CAQH info." };
    }
    const sheet = getSheet(PROVIDER_CAQH_INFO_SHEET_NAME, PROVIDER_CAQH_INFO_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const existingRecord = allRecords.find(record => record.providerId === providerId);

    if (existingRecord) {
      // Update existing record
      const result = patchDetailedInfo(PROVIDER_CAQH_INFO_SHEET_NAME, existingRecord.id, { caqhId: caqhData.caqhId, lastUpdatedAt: new Date().toISOString() });
      if (result.success) {
        logAuditEvent("Request", `Provider CAQH info updated for provider ${providerId}`, { providerId: providerId, caqhId: caqhData.caqhId });
        return { success: true, message: `CAQH info updated for provider ${providerId}.` };
      } else {
        return { success: false, message: `Failed to update CAQH info: ${result.message}` };
      }
    } else {
      // Create new record
      const newId = Utilities.getUuid();
      // Headers: ["ID", "Provider ID", "CAQH ID", "Last Updated At"]
      const rowData = [newId, providerId, caqhData.caqhId, new Date().toISOString()];
      sheet.appendRow(rowData);
      invalidateRowIndexCache(sheet);
      logAuditEvent("Request", `Provider CAQH info created for provider ${providerId}`, { providerId: providerId, caqhId: caqhData.caqhId });
      return { success: true, message: `CAQH info created for provider ${providerId}.` };
    }
  } catch (error) {
    return { success: false, message: `Failed to put provider CAQH info: ${error.message}` };
  }
}

/**
 * Patches an existing provider's CAQH login information.
 * This function assumes the record already exists and only updates specified fields.
 * @param {string} providerId The ID of the provider the CAQH info belongs to.
 * @param {object} caqhData The CAQH data to patch (caqhId).
 * @returns {object} A success or error message.
 */
function patchProviderCaqhInfo(providerId, caqhData) {
  try {
    if (!providerId || !caqhData || !caqhData.caqhId) {
      return { success: false, message: "Provider ID and CAQH ID are required for patching CAQH info." };
    }
    const sheet = getSheet(PROVIDER_CAQH_INFO_SHEET_NAME, PROVIDER_CAQH_INFO_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const existingRecord = allRecords.find(record => record.providerId === providerId);

    if (!existingRecord) {
      return { success: false, message: `CAQH info not found for provider ${providerId}. Use putProviderCaqhInfo to create.` };
    }

    const result = patchDetailedInfo(PROVIDER_CAQH_INFO_SHEET_NAME, existingRecord.id, { caqhId: caqhData.caqhId, lastUpdatedAt: new Date().toISOString() });
    if (result.success) {
      logAuditEvent("Request", `Provider CAQH info patched for provider ${providerId}`, { providerId: providerId, caqhId: caqhData.caqhId });
      return { success: true, message: `CAQH info patched for provider ${providerId}.` };
    } else {
      return { success: false, message: `Failed to patch CAQH info: ${result.message}` };
    }
  } catch (error) {
    return { success: false, message: `Failed to patch provider CAQH info: ${error.message}` };
  }
}

/**
 * Deletes a provider's CAQH login information.
 * @param {string} providerId The ID of the provider whose CAQH info to delete.
 * @returns {object} A success or error message.
 */
function deleteProviderCaqhInfo(providerId) {
  try {
    if (!providerId) {
      return { success: false, message: "Provider ID is required to delete CAQH info." };
    }
    const sheet = getSheet(PROVIDER_CAQH_INFO_SHEET_NAME, PROVIDER_CAQH_INFO_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const existingRecord = allRecords.find(record => record.providerId === providerId);

    if (!existingRecord) {
      return { success: false, message: `CAQH info not found for provider ${providerId}.` };
    }

    const result = deleteDetailedProviderInfo(PROVIDER_CAQH_INFO_SHEET_NAME, PROVIDER_CAQH_INFO_HEADERS, existingRecord.id);
    if (result.success) {
      logAuditEvent("Request", `Provider CAQH info deleted for provider ${providerId}`, { providerId: providerId });
      return { success: true, message: `CAQH info deleted for provider ${providerId}.` };
    } else {
      return { success: false, message: `Failed to delete CAQH info: ${result.message}` };
    }
  } catch (error) {
    return { success: false, message: `Failed to delete provider CAQH info: ${error.message}` };
  }
}

/**
 * Retrieves a specific provider's CAQH login information.
 * @param {string} providerId The ID of the provider to retrieve CAQH info for.
 * @returns {object} An object containing success status and CAQH data.
 */
function getProviderCaqhInfo(providerId) {
  try {
    if (!providerId) {
      return { success: false, message: "Provider ID is required to get CAQH info." };
    }
    const sheet = getSheet(PROVIDER_CAQH_INFO_SHEET_NAME, PROVIDER_CAQH_INFO_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const caqhInfo = allRecords.find(record => record.providerId === providerId);
    if (!caqhInfo) {
      return { success: false, message: `CAQH info not found for provider ${providerId}.` };
    }
    return { success: true, data: caqhInfo };
  } catch (error) {
    return { success: false, message: `Failed to retrieve provider CAQH info: ${error.message}` };
  }
}

// --- Provider Liability Insurance Functions ---

/**
 * Creates a new provider liability insurance record.
 * @param {string} providerId The ID of the provider the liability insurance belongs to.
 * @param {object} liabilityInsuranceData The data for the new liability insurance record.
 * @returns {object} A success or error message.
 */
function createProviderLiabilityInsurance(providerId, liabilityInsuranceData) {
  if (!providerId || !liabilityInsuranceData || !liabilityInsuranceData.name) {
    return { success: false, message: "Provider ID and insurer name are required." };
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
    PROVIDER_LIABILITY_INSURANCE_SHEET_NAME,
    PROVIDER_LIABILITY_INSURANCE_HEADERS,
    providerId,
    rowData,
    `Liability Insurance "${liabilityInsuranceData.name}"`
  );
}

/**
 * Retrieves a list of liability insurance records for a given provider.
 * @param {string} providerId The ID of the provider to retrieve liability insurance records for.
 * @returns {object} An object containing success status and liability insurance data.
 */
function listProviderLiabilityInsuranceInfos(providerId) {
  try {
    if (!providerId) {
      return { success: false, message: "Provider ID is required to list liability insurance records." };
    }
    const sheet = getSheet(PROVIDER_LIABILITY_INSURANCE_SHEET_NAME, PROVIDER_LIABILITY_INSURANCE_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const providerLiabilityInsurances = allRecords.filter(record => record.providerId === providerId);
    return { success: true, data: providerLiabilityInsurances };
  } catch (error) {
    return { success: false, message: `Failed to list provider liability insurance records: ${error.message}` };
  }
}

/**
 * Retrieves a specific provider liability insurance record by its ID and provider ID.
 * @param {string} providerId The ID of the provider the liability insurance belongs to.
 * @param {string} liabilityInsuranceId The ID of the liability insurance record to retrieve.
 * @returns {object} An object containing success status and liability insurance data.
 */
function getProviderLiabilityInsuranceInfo(providerId, liabilityInsuranceId) {
  try {
    if (!providerId || !liabilityInsuranceId) {
      return { success: false, message: "Provider ID and Liability Insurance ID are required to get liability insurance details." };
    }
    const sheet = getSheet(PROVIDER_LIABILITY_INSURANCE_SHEET_NAME, PROVIDER_LIABILITY_INSURANCE_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const liabilityInsurance = allRecords.find(record => record.providerId === providerId && record.id === liabilityInsuranceId);
    if (!liabilityInsurance) {
      return { success: false, message: `Liability Insurance with ID ${liabilityInsuranceId} not found for provider ${providerId}.` };
    }
    return { success: true, data: liabilityInsurance };
  } catch (error) {
    return { success: false, message: `Failed to retrieve provider liability insurance details: ${error.message}` };
  }
}

/**
 * Updates an existing provider liability insurance record.
 * @param {string} liabilityInsuranceId The ID of the liability insurance record to update.
 * @param {object} liabilityInsuranceData The data to patch.
 * @returns {object} A success or error message.
 */
function patchProviderLiabilityInsuranceInfo(liabilityInsuranceId, liabilityInsuranceData) {
  // Using patchDetailedInfo for a generic update.
  const result = patchDetailedInfo(PROVIDER_LIABILITY_INSURANCE_SHEET_NAME, liabilityInsuranceId, liabilityInsuranceData);
  if (result.success) {
    logAuditEvent("Request", `Provider liability insurance updated: ${liabilityInsuranceId}`, { liabilityInsuranceId: liabilityInsuranceId, newData: liabilityInsuranceData });
  } else {
    logAuditEvent("Error", `Failed to update provider liability insurance ${liabilityInsuranceId}: ${result.message}`);
  }
  return result;
}

/**
 * Deletes a provider liability insurance record.
 * @param {string} liabilityInsuranceId The ID of the liability insurance record to delete.
 * @returns {object} A success or error message.
 */
function deleteProviderLiabilityInsuranceInfo(liabilityInsuranceId) {
  const result = deleteDetailedProviderInfo(PROVIDER_LIABILITY_INSURANCE_SHEET_NAME, PROVIDER_LIABILITY_INSURANCE_HEADERS, liabilityInsuranceId);
  if (result.success) {
    logAuditEvent("Request", `Provider liability insurance deleted: ${liabilityInsuranceId}`, { liabilityInsuranceId: liabilityInsuranceId });
  }
  return result;
}

// --- Provider Profiles Functions ---

/**
 * Lists available provider profile import sources.
 * @returns {object} An object containing success status and a list of import sources.
 */
function listProviderProfileImportSources() {
  try {
    const sheet = getSheet(PROVIDER_PROFILE_IMPORT_SOURCES_SHEET_NAME, PROVIDER_PROFILE_IMPORT_SOURCES_HEADERS);
    const sources = sheetDataToObjects(sheet.getDataRange().getValues());
    return { success: true, data: sources };
  } catch (error) {
    logAuditEvent("Error", `Failed to list provider profile import sources: ${error.message}`);
    return { success: false, message: `Failed to list provider profile import sources: ${error.message}` };
  }
}

/**
 * Creates a new provider profile import job.
 * @param {object} importData The data for the new import (providerId, source, parameters).
 * @returns {object} A success or error message, with the new import data on success.
 */
function createProviderProfileImport(importData) {
  try {
    if (!importData.providerId || !importData.source) {
      return { success: false, message: "Provider ID and source are required for profile import." };
    }

    const sheet = getSheet(PROVIDER_PROFILE_IMPORTS_SHEET_NAME, PROVIDER_PROFILE_IMPORTS_HEADERS);
    const newId = Utilities.getUuid();
    const now = new Date().toISOString();

    // Simulate immediate completion for simplicity, or "Working" then a separate function to "Complete"
    const status = "Completed";
    const completedAt = now;

    const rowData = [
      newId,
      importData.providerId,
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

    logAuditEvent("Request", `Provider profile import created: ${newId} for provider ${importData.providerId} from ${importData.source}`, { providerId: importData.providerId, importId: newId, source: importData.source });
    return { success: true, message: `Profile import created with ID: ${newId}`, data: { id: newId, status: status } };
  } catch (error) {
    logAuditEvent("Error", `Failed to create provider profile import: ${error.message}`);
    return { success: false, message: `Failed to create provider profile import: ${error.message}` };
  }
}

/**
 * Retrieves details for a specific provider profile import job.
 * @param {string} importId The ID of the import job to retrieve.
 * @returns {object} An object containing success status and the import job data.
 */
function getProviderProfileImport(importId) {
  try {
    if (!importId) {
      return { success: false, message: "Import ID is required." };
    }
    const sheet = getSheet(PROVIDER_PROFILE_IMPORTS_SHEET_NAME, PROVIDER_PROFILE_IMPORTS_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const importJob = allRecords.find(record => record.id === importId);
    if (!importJob) {
      return { success: false, message: `Provider profile import with ID ${importId} not found.` };
    }
    return { success: true, data: importJob };
  } catch (error) {
    logAuditEvent("Error", `Failed to get provider profile import ${importId}: ${error.message}`);
    return { success: false, message: `Failed to get provider profile import: ${error.message}` };
  }
}

/**
 * Lists provider profile import jobs with filtering and pagination.
 * @param {object} options - An object with pagination, sorting, and filtering parameters.
 * @param {number} [options.page=1] - The page number to retrieve.
 * @param {number} [options.pageSize=15] - The number of records per page.
 * @param {string} [options.providerId] - Filter by provider ID.
 * @param {string} [options.source] - Filter by import source.
 * @param {string} [options.status] - Filter by import status.
 * @returns {object} An object with the list of import jobs and pagination info.
 */
function listProviderProfileImports(options = {}) {
  try {
    const { page = 1, pageSize = 15, providerId, source, status } = options;
    const sheet = getSheet(PROVIDER_PROFILE_IMPORTS_SHEET_NAME, PROVIDER_PROFILE_IMPORTS_HEADERS);
    let allImports = sheetDataToObjects(sheet.getDataRange().getValues());

    if (providerId) {
      allImports = allImports.filter(job => job.providerId === providerId);
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
    logAuditEvent("Error", `Failed to list provider profile imports: ${error.message}`);
    return { success: false, message: `Failed to list provider profile imports: ${error.message}` };
  }
}

/**
 * Uploads a file and links it to a specific provider.
 * @param {object} fileObject The file data from the frontend.
 * @param {string} providerId The ID of the provider to link the file to.
 */
function uploadFileAndLinkToProvider(fileObject, providerId) {
  return uploadFileAndLinkToEntity(fileObject, providerId, 'provider');
}