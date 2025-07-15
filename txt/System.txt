/**
 * @fileoverview
 * This file contains system-level functions for administration, user management,
 * definitions, webhooks, and dashboard metrics.
 */

// --- Users Functions ---
/**
 * Retrieves a list of all users.
 * @returns {object} An object containing success status and users data.
 */
function listUsers() {
    try {
        const sheet = getSheet(USERS_SHEET_NAME, USERS_HEADERS);
        const users = sheetDataToObjects(sheet.getDataRange().getValues());
        const formattedUsers = users.map(u => ({
            id: u.id,
            email: u.email,
            firstName: u.firstName,
            lastName: u.lastName,
            name: `${u.firstName} ${u.lastName}`
        }));
        return { success: true, data: formattedUsers };
    } catch (e) {
        logAuditEvent("Error", `Failed to list users: ${e.message}`);
        return { success: false, message: `Failed to list users: ${e.message}` };
    }
}

/**
 * Gets information about the currently logged-in user.
 * @returns {object|null} An object with user's email and name, or null if not logged in.
 */
function getCurrentUser() {
    try {
        const user = Session.getActiveUser();
        if (user && user.getEmail()) {
            // In a real app, you might look up their name from the Users sheet
            const usersSheet = getSheet(USERS_SHEET_NAME, USERS_HEADERS);
            const allUsers = sheetDataToObjects(usersSheet.getDataRange().getValues());
            const userInfo = allUsers.find(u => u.email === user.getEmail());

            return {
                email: user.getEmail(),
                name: userInfo ? `${userInfo.firstName} ${userInfo.lastName}` : user.getEmail()
            };
        }
        return null;
    } catch (e) {
        return null; // Fail silently
    }
}

/**
 * Checks if the current user has the required role to perform an action.
 * @param {string} requiredRole The name of the role required (e.g., 'Admin', 'Credentialer').
 * @returns {boolean} True if the user is authorized.
 */
function isAuthorized(requiredRole) {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser) return false; // Not logged in

    // This is a simplified example. In a real scenario, you'd have a UserRoles mapping sheet.
    // For now, we can hardcode some logic.
    if (requiredRole === 'Admin' && currentUser.email === 'admin@example.com') { // Replace with your admin
      return true;
    }
    if (requiredRole === 'Credentialer' && currentUser.email.endsWith('@example.com')) {
      return true;
    }
    // ... add more role checks
    return false;
  } catch(e) {
    return false;
  }
}

// Example usage in another function:
function deleteProvider(providerId) {
  if (!isAuthorized('Admin')) {
    return { success: false, message: "Unauthorized: You do not have permission to delete providers." };
  }
  // ... rest of the delete logic
}

// --- Event Log / Audit Trail ---

function listEventLogEntries(options = {}) {
    try {
        const { page = 1, pageSize = 25, searchTerm = '', typeFilter = '', sortBy = 'timestamp', sortOrder = 'desc' } = options;

        const sheet = getSheet(AUDIT_EVENTS_SHEET_NAME, AUDIT_EVENTS_HEADERS);
        let allEvents = sheetDataToObjects(sheet.getDataRange().getValues());

        // Filtering
        if (typeFilter) {
            allEvents = allEvents.filter(event => event.type && event.type.toLowerCase() === typeFilter.toLowerCase());
        }

        if (searchTerm) {
            const lowercasedTerm = searchTerm.toLowerCase();
            allEvents = allEvents.filter(event => {
                const messageMatch = event.message && event.message.toLowerCase().includes(lowercasedTerm);
                const correlationIdMatch = event.correlationId && event.correlationId.toLowerCase().includes(lowercasedTerm);
                // Search within the stringified context
                const contextString = typeof event.context === 'object' ? JSON.stringify(event.context).toLowerCase() : (event.context || '').toLowerCase();
                const contextMatch = contextString.includes(lowercasedTerm);

                return messageMatch || correlationIdMatch || contextMatch;
            });
        }

        // Sorting
        allEvents.sort((a, b) => {
            const valA = a[sortBy] || '';
            const valB = b[sortBy] || '';

            let comparison = 0;
            if (sortBy === 'timestamp') {
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

        const totalRecords = allEvents.length;
        const startIndex = (page - 1) * pageSize;
        const paginatedData = allEvents.slice(startIndex, startIndex + pageSize);

        return { success: true, data: paginatedData, totalRecords: totalRecords };
    } catch (error) {
        logAuditEvent("Error", `Failed to list event log entries: ${error.message}`);
        return { success: false, message: `Failed to list event log entries: ${error.message}` };
    }
}

// --- Dashboard Functions ---

/**
 * Retrieves key metrics for the credentialing dashboard.
 * @returns {Object} An object containing dashboard metrics and task lists.
 */
function getDashboardMetrics() {
    try {
        // Metric 1: Providers Due for Re-credentialing
        const providersSheet = getSheet(PROVIDERS_SHEET_NAME, PROVIDERS_HEADERS);
        const allProviders = sheetDataToObjects(providersSheet.getDataRange().getValues());
        const ninetyDaysFromNow = new Date();
        ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

        const providersDue = allProviders.filter(p => {
            if (!p.nextCredentialingDate || p.deactivated) return false;
            const dueDate = new Date(p.nextCredentialingDate);
            return dueDate <= ninetyDaysFromNow;
        }).sort((a, b) => new Date(a.nextCredentialingDate) - new Date(b.nextCredentialingDate));

        const dueForRecredCount = providersDue.length;
        const top5ProvidersDue = providersDue.slice(0, 5);

        // Metric 2: Open Credentialing Requests
        const requestsSheet = getSheet(CREDENTIALING_REQUESTS_SHEET_NAME, CREDENTIALING_REQUESTS_HEADERS);
        const allRequests = sheetDataToObjects(requestsSheet.getDataRange().getValues());
        const openStatuses = ["RequestSubmitted", "RequestInProgress", "AdditionalInformationRequested", "AdditionalInformationSubmitted", "SecondAttemptMissingInfo", "ThirdAttemptMissingInfo"];
        const openRequests = allRequests.filter(r => openStatuses.includes(r.status));
        const openRequestsCount = openRequests.length;

        const requestsNeedingReview = allRequests
            .filter(r => r.status === "AdditionalInformationRequested" || r.status === "NeedsReview")
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 5);

        // New: Recent Activity Log
        const auditSheet = getSheet(AUDIT_EVENTS_SHEET_NAME, AUDIT_EVENTS_HEADERS);
        const allAuditEvents = sheetDataToObjects(auditSheet.getDataRange().getValues());
        const recentActivity = allAuditEvents
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 10); // Get the last 10 events

        // Metric 3: Active Alerts
        const alertsSheet = getSheet(ALERTS_SHEET_NAME, ALERTS_HEADERS);
        const allAlerts = sheetDataToObjects(alertsSheet.getDataRange().getValues());
        const activeAlertsCount = allAlerts.filter(a => !a.dismissalTimestamp).length;

        // Metric 4: Unmonitored Licenses
        const licensesSheet = getSheet(LICENSES_SHEET_NAME, LICENSES_HEADERS);
        const allLicenses = sheetDataToObjects(licensesSheet.getDataRange().getValues());
        const monitorsSheet = getSheet(MONITORS_SHEET_NAME, MONITORS_HEADERS);
        const allMonitors = sheetDataToObjects(monitorsSheet.getDataRange().getValues());

        const monitoredLicenseIds = new Set(allMonitors.filter(m => m.type === 'License' && m.licenseId).map(m => m.licenseId));
        const unmonitoredLicensesCount = allLicenses.filter(l => !monitoredLicenseIds.has(l.id)).length;

        const dashboardData = {
            metrics: { dueForRecred: dueForRecredCount, openRequests: openRequestsCount, activeAlerts: activeAlertsCount, unmonitoredLicenses: unmonitoredLicensesCount },
            lists: {
                providersDue: top5ProvidersDue,
                requestsNeedingReview: requestsNeedingReview,
                recentActivity: recentActivity
            }
        };

        return { success: true, data: dashboardData };

    } catch (error) {
        logAuditEvent("Error", `Failed to get dashboard metrics: ${error.message}`);
        return { success: false, message: `Failed to get dashboard metrics: ${error.message}` };
    }
}

// --- Webhooks Functions ---

/**
 * Creates a new webhook.
 * @param {object} webhookData The data for the new webhook.
 * @returns {object} A success or error message.
 */
function createWebhook(webhookData) {
    try {
        if (!webhookData || !webhookData.url || !webhookData.type) {
            return { success: false, message: "Webhook URL and Type are required." };
        }
        const sheet = getSheet(WEBHOOKS_SHEET_NAME, WEBHOOKS_HEADERS);
        const newId = Utilities.getUuid();
        // Headers: ["ID", "Type", "URL", "Secret", "Allow Insecure URL", "Include Sensitive Info"]
        const rowData = [
            newId,
            webhookData.type,
            webhookData.url,
            webhookData.secret || "",
            webhookData.allowInsecureUrl || false,
            webhookData.includeSensitiveInfo || false
        ];
        sheet.appendRow(rowData);
        invalidateRowIndexCache(sheet);
        logAuditEvent("Request", `Webhook created: ${webhookData.type} for ${webhookData.url}`, { webhookId: newId });
        return { success: true, message: `Webhook created with ID: ${newId}`, data: { id: newId } };
    } catch (error) {
        logAuditEvent("Error", `Failed to create webhook: ${error.message}`);
        return { success: false, message: `Failed to create webhook: ${error.message}` };
    }
}

/**
 * Retrieves a list of all webhooks.
 * @returns {object} An object containing success status and webhooks data.
 */
function listWebhooks() {
    try {
        const sheet = getSheet(WEBHOOKS_SHEET_NAME, WEBHOOKS_HEADERS);
        const allWebhooks = sheetDataToObjects(sheet.getDataRange().getValues());
        return { success: true, data: allWebhooks };
    } catch (error) {
        logAuditEvent("Error", `Failed to list webhooks: ${error.message}`);
        return { success: false, message: `Failed to list webhooks: ${error.message}` };
    }
}

/**
 * Retrieves a specific webhook by its ID.
 * @param {string} webhookId The ID of the webhook to retrieve.
 * @returns {object} An object containing success status and webhook data.
 */
function getWebhook(webhookId) {
    try {
        if (!webhookId) {
            return { success: false, message: "Webhook ID is required." };
        }
        const sheet = getSheet(WEBHOOKS_SHEET_NAME, WEBHOOKS_HEADERS);
        const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
        const webhook = allRecords.find(record => record.id === webhookId);
        if (!webhook) {
            return { success: false, message: `Webhook with ID ${webhookId} not found.` };
        }
        return { success: true, data: webhook };
    } catch (error) {
        logAuditEvent("Error", `Failed to retrieve webhook ${webhookId}: ${error.message}`);
        return { success: false, message: `Failed to retrieve webhook: ${error.message}` };
    }
}

/**
 * Updates an existing webhook.
 * @param {string} webhookId The ID of the webhook to update.
 * @param {object} webhookData The data to patch.
 * @returns {object} A success or error message.
 */
function patchWebhook(webhookId, webhookData) {
    // Add the ID to the data object for the generic patch function
    const dataToUpdate = { ...webhookData, id: webhookId };
    const result = patchDetailedInfo(WEBHOOKS_SHEET_NAME, webhookId, dataToUpdate);
    if (result.success) {
        logAuditEvent("Request", `Webhook updated: ${webhookId}`, { webhookId: webhookId, newData: webhookData });
    } else {
        logAuditEvent("Error", `Failed to update webhook ${webhookId}: ${result.message}`);
    }
    return result;
}

/**
 * Deletes a webhook record.
 * @param {string} webhookId The ID of the webhook to delete.
 * @returns {object} A success or error message.
 */
function deleteWebhook(webhookId) {
    const result = deleteDetailedProviderInfo(WEBHOOKS_SHEET_NAME, WEBHOOKS_HEADERS, webhookId);
    if (result.success) {
        // Also delete associated logs
        try {
            const logsSheet = getSheet(WEBHOOK_LOGS_SHEET_NAME, WEBHOOK_LOGS_HEADERS);
            const logIdColIndex = WEBHOOK_LOGS_HEADERS.indexOf("Webhook ID");
            deleteRowsByColumnValue(logsSheet, logIdColIndex, webhookId);
        } catch (e) {
            console.warn(`Could not delete associated logs for webhook ${webhookId}: ${e.message}`);
        }
        logAuditEvent("Request", `Webhook deleted: ${webhookId}`, { webhookId: webhookId });
    }
    return result;
}

/**
 * Retrieves a list of logs for a given webhook.
 * @param {string} webhookId The ID of the webhook to retrieve logs for.
 * @returns {object} An object containing success status and log data.
 */
function listWebhooksLog(webhookId) {
    try {
        if (!webhookId) {
            return { success: false, message: "Webhook ID is required to list logs." };
        }
        const sheet = getSheet(WEBHOOK_LOGS_SHEET_NAME, WEBHOOK_LOGS_HEADERS);
        const allRecords = sheetDataToObjects(sheet.getDataRange().getValues());
        const webhookLogs = allRecords.filter(record => record.webhookId === webhookId);
        return { success: true, data: webhookLogs };
    } catch (error) {
        logAuditEvent("Error", `Failed to list logs for webhook ${webhookId}: ${error.message}`);
        return { success: false, message: `Failed to list webhook logs: ${error.message}` };
    }
}

// --- Definitions Functions ---

/**
 * Lists all countries.
 * @returns {object} An object containing success status and a list of countries.
 */
function listCountries() {
    try {
        const sheet = getSheet(COUNTRIES_SHEET_NAME, COUNTRIES_HEADERS);
        const countries = sheetDataToObjects(sheet.getDataRange().getValues());
        return { success: true, data: countries };
    } catch (error) {
        logAuditEvent("Error", `Failed to list countries: ${error.message}`);
        return { success: false, message: `Failed to list countries: ${error.message}` };
    }
}

/**
 * Lists all provider types.
 * @returns {object} An object containing success status and a list of provider types.
 */
function listProviderTypes() {
    try {
        const sheet = getSheet(PROVIDER_TYPES_SHEET_NAME, PROVIDER_TYPES_HEADERS);
        const providerTypes = sheetDataToObjects(sheet.getDataRange().getValues());
        return { success: true, data: providerTypes };
    } catch (error) {
        logAuditEvent("Error", `Failed to list provider types: ${error.message}`);
        return { success: false, message: `Failed to list provider types: ${error.message}` };
    }
}

/**
 * Lists all facility license types.
 * @returns {object} An object containing success status and a list of facility license types.
 */
function listFacilityLicenseTypes() {
    try {
        const sheet = getSheet(FACILITY_LICENSE_TYPES_SHEET_NAME, FACILITY_LICENSE_TYPES_HEADERS);
        const facilityLicenseTypes = sheetDataToObjects(sheet.getDataRange().getValues());
        return { success: true, data: facilityLicenseTypes };
    } catch (error) {
        logAuditEvent("Error", `Failed to list facility license types: ${error.message}`);
        return { success: false, message: `Failed to list facility license types: ${error.message}` };
    }
}

/**
 * Lists all facility taxonomies.
 * @returns {object} An object containing success status and a list of facility taxonomies.
 */
function listFacilityTaxonomies() {
    try {
        const sheet = getSheet(FACILITY_TAXONOMIES_SHEET_NAME, FACILITY_TAXONOMIES_HEADERS);
        const taxonomies = sheetDataToObjects(sheet.getDataRange().getValues());
        return { success: true, data: taxonomies };
    } catch (error) {
        logAuditEvent("Error", `Failed to list facility taxonomies: ${error.message}`);
        return { success: false, message: `Failed to list facility taxonomies: ${error.message}` };
    }
}