/**
 * @fileoverview
 * This file contains all backend functions for handling third-party integrations
 * and inbound webhooks.
 */

/**
 * Handles a webhook from Fountain. Creates a provider and a credentialing request.
 * @param {string} organizationId The ID of the organization (not used in this implementation).
 * @param {object} body The webhook payload from Fountain.
 * @returns {object} A response object with the created credentialing request ID.
 */
function fountainWebhook(organizationId, body) {
    try {
        const applicant = body.applicant;
        if (!applicant || !applicant.email || !applicant.first_name || !applicant.last_name) {
            return { success: false, message: "Invalid Fountain webhook payload. Applicant data is missing." };
        }

        const providersSheet = getSheet(PROVIDERS_SHEET_NAME, PROVIDERS_HEADERS);
        const allProviders = sheetDataToObjects(providersSheet.getDataRange().getValues());
        let provider = allProviders.find(p => p.emails && p.emails.some(e => e.email === applicant.email));
        let providerId;

        if (provider) {
            providerId = provider.id;
            logAuditEvent("System", `Fountain webhook: Found existing provider by email ${applicant.email}`, { providerId: providerId, fountainApplicantId: applicant.id });
        } else {
            const providerData = { firstName: applicant.first_name, lastName: applicant.last_name, credentialingStatus: "Data Collection", deactivated: false };
            const createProviderResponse = createProvider(providerData);
            if (!createProviderResponse.success) {
                throw new Error(`Failed to create provider from Fountain webhook: ${createProviderResponse.message}`);
            }
            const newProviders = sheetDataToObjects(providersSheet.getDataRange().getValues());
            const newProvider = newProviders.find(p => p.firstName === applicant.first_name && p.lastName === applicant.last_name && !allProviders.some(ap => ap.id === p.id));
            if (!newProvider) throw new Error("Could not find the newly created provider.");
            providerId = newProvider.id;

            createProviderEmailInfo(providerId, { email: applicant.email, type: 'Personal' });
            logAuditEvent("System", `Fountain webhook: Created new provider ${providerId} for ${applicant.email}`, { providerId: providerId, fountainApplicantId: applicant.id });
        }

        const requestData = { providerId: providerId, type: 'Initial', priority: 'Medium' };
        const createRequestResponse = createCredentialingRequest(requestData);
        if (!createRequestResponse.success) {
            throw new Error(`Failed to create credentialing request for provider ${providerId}: ${createRequestResponse.message}`);
        }

        const requestId = createRequestResponse.data.id;
        logAuditEvent("System", `Fountain webhook: Created credentialing request ${requestId} for provider ${providerId}`, { providerId: providerId, requestId: requestId });

        return { success: true, requestId: requestId };

    } catch (error) {
        logAuditEvent("Error", `Fountain webhook processing failed: ${error.message}`, { payload: body });
        return { success: false, message: `Fountain webhook processing failed: ${error.message}` };
    }
}

/**
 * Handles a document request from Salesforce. Uploads a file and links it to entities.
 * @param {object} body The request payload from Salesforce.
 * @returns {object} A success or error message.
 */
function salesforceDocumentRequest(body) {
    try {
        if (!body || !body.document || !body.relatedIds || body.relatedIds.length === 0) {
            return { success: false, message: "Invalid Salesforce document request. Document and relatedIds are required." };
        }

        const fileName = body.pathOnClient || `salesforce-upload-${new Date().getTime()}.dat`;
        const mimeType = MimeType.lookup(fileName) || 'application/octet-stream';
        const dataUrl = `data:${mimeType};base64,${body.document}`;
        const fileObject = { fileName: fileName, mimeType: mimeType, data: dataUrl };

        let linkedCount = 0;
        const errors = [];

        const providersSheet = getSheet(PROVIDERS_SHEET_NAME, PROVIDERS_HEADERS);
        const facilitiesSheet = getSheet(FACILITIES_SHEET_NAME, FACILITIES_HEADERS);
        const providerIds = new Set(providersSheet.getRange(2, 1, providersSheet.getLastRow() - 1, 1).getValues().flat());
        const facilityIds = new Set(facilitiesSheet.getRange(2, 1, facilitiesSheet.getLastRow() - 1, 1).getValues().flat());

        body.relatedIds.forEach(id => {
            let result;
            if (providerIds.has(id)) {
                result = uploadFileAndLinkToProvider(fileObject, id);
            } else if (facilityIds.has(id)) {
                result = uploadFileAndLinkToFacility(fileObject, id);
            } else {
                result = { success: false, message: `Entity with ID ${id} not found.` };
            }

            if (result.success) {
                linkedCount++;
            } else {
                errors.push(`ID ${id}: ${result.message}`);
            }
        });

        if (linkedCount > 0) {
            logAuditEvent("System", `Salesforce document request processed. Linked to ${linkedCount} entities.`, { relatedIds: body.relatedIds, fileName: fileName });
            return { success: true, message: `Document linked to ${linkedCount} entities. Errors: ${errors.join(', ')}` };
        } else {
            throw new Error(`Failed to link document to any entities. Errors: ${errors.join(', ')}`);
        }
    } catch (error) {
        logAuditEvent("Error", `Salesforce document request failed: ${error.message}`, { payload: body });
        return { success: false, message: `Salesforce document request failed: ${error.message}` };
    }
}

const MimeType = {
    lookup: (filename) => {
        const extension = filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2).toLowerCase();
        const types = {
            'pdf': 'application/pdf', 'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel', 'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'ppt': 'application/vnd.ms-powerpoint', 'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif',
            'txt': 'text/plain', 'csv': 'text/csv', 'html': 'text/html', 'xml': 'application/xml'
        };
        return types[extension] || null;
    }
};