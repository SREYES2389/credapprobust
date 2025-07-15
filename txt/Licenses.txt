/**
 * @fileoverview
 * This file contains all backend functions related to Licenses and License Verifications.
 */

/**
 * Retrieves the full details for a single license, including all related verification history.
 * @param {string} licenseId The ID of the license to retrieve.
 * @returns {object} A success or error object with the license data.
 */
function getLicenseDetails(licenseId) {
    try {
        // 1. Use the generic function to get the license and its verifications
        const licenseDetails = getEntityDetails('Licenses', licenseId);
        if (!licenseDetails.success) {
            return licenseDetails;
        }
        const license = licenseDetails.data;

        // 2. Perform any special data enrichment (sorting)
        if (license.verifications) {
            license.verifications.sort((a, b) => new Date(b.started) - new Date(a.started));
        }

        return { success: true, data: license };
    } catch (error) {
        logAuditEvent("Error", `Failed to get license details for ${licenseId}: ${error.message}`);
        return { success: false, message: `Failed to get license details: ${error.message}` };
    }
}

/**
 * Lists available license types.
 * @returns {object} An object containing success status and a list of license types.
 */
function listSimplifiedLicenseTypes() {
  try {
    const sheet = getSheet(LICENSE_TYPES_SHEET_NAME, LICENSE_TYPES_HEADERS);
    const licenseTypes = sheetDataToObjects(sheet.getDataRange().getValues());
    return { success: true, data: licenseTypes };
  } catch (error) {
    logAuditEvent("Error", `Failed to list license types: ${error.message}`);
    return { success: false, message: `Failed to list license types: ${error.message}` };
  }
}

/**
 * Triggers a new verification for a license.
 * @param {string} providerId The ID of the provider.
 * @param {string} licenseId The ID of the license to verify.
 * @returns {object} A success or error message.
 */
function triggerLicenseVerification(providerId, licenseId) {
  try {
    const verificationsSheet = getSheet(LICENSE_VERIFICATIONS_SHEET_NAME, LICENSE_VERIFICATIONS_HEADERS);
    const newVerificationId = Utilities.getUuid();
    const now = new Date().toISOString();

    // Simulate a verification result
    const mockResult = {
      name: "Mock Verified Name",
      licenseStatus: "Active",
      expires: new Date(new Date().setFullYear(new Date().getFullYear() + 2)).toISOString(),
      matchScore: { score: 1.0, recommendation: "Match" }
    };

    const rowData = [
      newVerificationId, licenseId, providerId, "Found", "Found", "Manual", now, 1500,
      JSON.stringify([mockResult]), "{}", JSON.stringify({ name: "Mock Source", url: "https://mock.source.com" }), "{}", null, "", "{}"
    ];
    verificationsSheet.appendRow(rowData);
    invalidateRowIndexCache(verificationsSheet);

    // Update the license record with the latest verification info
    const licensesSheet = getSheet(LICENSES_SHEET_NAME, LICENSES_HEADERS);
    const idColIndex = LICENSES_HEADERS.indexOf("ID");
    const rowIndexMap = getOrCreateRowIndex(licensesSheet, idColIndex);
    const rowNum = rowIndexMap.get(licenseId);
    if (rowNum) {
      licensesSheet.getRange(rowNum, LICENSES_HEADERS.indexOf("Current Verification Status") + 1).setValue("Found");
      licensesSheet.getRange(rowNum, LICENSES_HEADERS.indexOf("Current Verification ID") + 1).setValue(newVerificationId);
      // Update other relevant license fields from mockResult if needed, e.g., expiration date
      // licensesSheet.getRange(rowNum, LICENSES_HEADERS.indexOf("Non Verified Expiration Date") + 1).setValue(mockResult.expires.split('T')[0]);
      invalidateRowIndexCache(licensesSheet);
    }

    logAuditEvent("Request", `License verification triggered for license ${licenseId}`, { providerId: providerId, licenseId: licenseId, verificationId: newVerificationId });
    return { success: true, message: `Verification triggered for license ${licenseId}.` };
  } catch (error) {
    logAuditEvent("Error", `Failed to trigger license verification for ${licenseId}: ${error.message}`);
    return { success: false, message: `Failed to trigger license verification: ${error.message}` };
  }
}

/**
 * Lists all historical verifications for a single license.
 * @param {string} providerId The ID of the provider.
 * @param {string} licenseId The ID of the license.
 * @returns {object} An object containing success status and a list of verification data.
 */
function listLicenseVerifications(providerId, licenseId) {
  try {
    if (!providerId || !licenseId) {
      return { success: false, message: "Provider ID and License ID are required to list verifications." };
    }
    const sheet = getSheet(LICENSE_VERIFICATIONS_SHEET_NAME, LICENSE_VERIFICATIONS_HEADERS);
    const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
    const licenseVerifications = allRecords.filter(record => record.providerId === providerId && record.licenseId === licenseId);

    // Sort by timestamp descending (newest first)
    licenseVerifications.sort((a, b) => new Date(b.started) - new Date(a.started));

    return { success: true, data: licenseVerifications };
  } catch (error) {
    logAuditEvent("Error", `Failed to list verifications for license ${licenseId}: ${error.message}`);
    return { success: false, message: `Failed to list license verifications: ${error.message}` };
  }
}

/**
 * Retrieves a single, specific verification record.
 * @param {string} providerId The ID of the provider.
 * @param {string} licenseId The ID of the license.
 * @param {string} verificationId The ID of the verification to retrieve.
 * @returns {object} An object containing success status and the verification data.
 */
function getLicenseVerification(providerId, licenseId, verificationId) {
  try {
    if (!providerId || !licenseId || !verificationId) {
      return { success: false, message: "Provider ID, License ID, and Verification ID are required." };
    }
    const sheet = getSheet(LICENSE_VERIFICATIONS_SHEET_NAME, LICENSE_VERIFICATIONS_HEADERS);
    const allVerifications = sheetDataToObjects(sheet.getDataRange().getValues());
    const verification = allVerifications.find(v => v.providerId === providerId && v.licenseId === licenseId && v.id === verificationId);
    if (!verification) {
      return { success: false, message: `Verification with ID ${verificationId} not found.` };
    }
    return { success: true, data: verification };
  } catch (error) {
    logAuditEvent("Error", `Failed to get license verification ${verificationId}: ${error.message}`);
    return { success: false, message: `Failed to get license verification: ${error.message}` };
  }
}

/**
 * Patches a verification to resolve a "NeedsReview" status.
 * @param {string} verificationId The ID of the verification record to update.
 * @param {object} body The data to patch (e.g., status, correctResultIndex).
 * @returns {object} A success or error message.
 */
function resolveLicenseVerificationProblems(verificationId, body) {
  try {
    const dataToUpdate = {
      status: body.status, // Should be 'Found', 'NotFound', or 'Failed' after resolution
      correctResultIndex: body.correctResultIndex || null, // Index of the correct result from 'results (JSON)'
      // You might also want to add a 'resolutionNote' or 'resolvedBy'
    };

    const result = patchDetailedInfo(LICENSE_VERIFICATIONS_SHEET_NAME, verificationId, dataToUpdate);

    if (result.success) {
      // If the resolution changes the status to "Found", also update the main license status
      const verificationsSheet = getSheet(LICENSE_VERIFICATIONS_SHEET_NAME, LICENSE_VERIFICATIONS_HEADERS);
      const allVerifications = sheetDataToObjects(verificationsSheet.getDataRange().getValues());
      const updatedVerification = allVerifications.find(v => v.id === verificationId);

      if (updatedVerification && updatedVerification.status === "Found") {
        const licensesSheet = getSheet(LICENSES_SHEET_NAME, LICENSES_HEADERS);
        const licenseId = updatedVerification.licenseId;
        const licenseIdColIndex = LICENSES_HEADERS.indexOf("ID");
        const licenseRowNum = getOrCreateRowIndex(licensesSheet, licenseIdColIndex).get(licenseId);

        if (licenseRowNum) {
          licensesSheet.getRange(licenseRowNum, LICENSES_HEADERS.indexOf("Current Verification Status") + 1).setValue("Found");
          licensesSheet.getRange(licenseRowNum, LICENSES_HEADERS.indexOf("Current Verification ID") + 1).setValue(verificationId);
          invalidateRowIndexCache(licensesSheet);
        }
      }

      logAuditEvent("Request", `License verification ${verificationId} resolved to ${body.status}`, { verificationId: verificationId, newStatus: body.status });
    } else {
      logAuditEvent("Error", `Failed to resolve license verification ${verificationId}: ${result.message}`);
    }
    return result;
  } catch (error) {
    logAuditEvent("Error", `Failed to resolve license verification: ${error.message}`);
    return { success: false, message: `Failed to resolve license verification: ${error.message}` };
  }
}


/**
 * Updates an existing license record.
 * Note: This function does not check provider ownership as per the API spec.
 * @param {string} licenseId The ID of the license to update.
 * @param {object} body The data to patch.
 * @returns {object} A success or error message.
 */
function patchLicense(licenseId, body) {
  try {
    const result = patchDetailedInfo(LICENSES_SHEET_NAME, licenseId, body);
    if (result.success) {
      logAuditEvent("Request", `License patched: ${licenseId}`, { licenseId: licenseId, newData: body });
    }
    return result;
  } catch (error) {
    logAuditEvent("Error", `Failed to patch license ${licenseId}: ${error.message}`);
    return { success: false, message: `Failed to patch license: ${error.message}` };
  }
}