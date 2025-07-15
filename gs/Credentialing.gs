/**
 * @fileoverview
 * This file contains all backend functions related to Credentialing Requests,
 * Events, and Checklists.
 */

/**
 * Creates a new credentialing request.
 * @param {object} requestData The data for the new request.
 * @returns {object} A success or error message, with the new request data on success.
 */
function createCredentialingRequest(requestData) {
  try {
    if (!requestData.providerId && !requestData.facilityId) {
      return { success: false, message: "Provider ID or Facility ID is required." };
    }

    const sheet = getSheet(CREDENTIALING_REQUESTS_SHEET_NAME, CREDENTIALING_REQUESTS_HEADERS);
    const newId = Utilities.getUuid();
    const now = new Date().toISOString();
    const userEmail = Session.getActiveUser().getEmail();
    const status = "RequestSubmitted";

    const newRequest = {
      id: newId,
      providerId: requestData.providerId || "",
      facilityId: requestData.facilityId || "",
      type: requestData.type || "Initial",
      priority: requestData.priority || "Medium",
      status: status,
      owner: userEmail,
      createdAt: now,
      currentEvent: {}
    };

    const eventData = { note: "Initial request created.", status: status, attachments: [] };
    const eventResponse = createCredentialingRequestEvent(newId, eventData);
    if (!eventResponse.success) {
      throw new Error(`Failed to create initial event for request: ${eventResponse.message}`);
    }
    newRequest.currentEvent = eventResponse.data;

    const rowData = [
      newRequest.id, newRequest.providerId, newRequest.facilityId, newRequest.type,
      newRequest.priority, newRequest.status, newRequest.owner, newRequest.createdAt,
      JSON.stringify(newRequest.currentEvent)
    ];
    sheet.appendRow(rowData);
    invalidateRowIndexCache(sheet);

    logAuditEvent("Request", `Credentialing request created: ${newId}`, { requestId: newId, providerId: newRequest.providerId, facilityId: newRequest.facilityId });
    return { success: true, message: `Credentialing request created with ID: ${newId}`, data: newRequest };
  } catch (error) {
    logAuditEvent("Error", `Failed to create credentialing request: ${error.message}`);
    return { success: false, message: `Failed to create credentialing request: ${error.message}` };
  }
}

/**
 * Retrieves the detailed information for a credentialing request, including all events,
 * checklist items, and associated provider/facility details.
 * @param {string} requestId The ID of the credentialing request.
 * @returns {object} An object containing success status and the detailed request data.
 */
function getCredentialingRequestDetails(requestId) {
  try {
    // 1. Use the generic function to get the request and all direct children
    const requestDetails = getEntityDetails('CredentialingRequests', requestId);
    if (!requestDetails.success) {
      return requestDetails;
    }
    const request = requestDetails.data;

    // 2. Perform any special data enrichment and structuring
    if (request.allEvents) {
      request.allEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }
    // Structure the checklist to match frontend expectations
    request.checklist = { items: request.checklistItems || [] };
    delete request.checklistItems; // Clean up the temporary property

    // 3. Enrich with provider/facility name if available
    if (request.providerId) {
      const providersSheet = getSheet(PROVIDERS_SHEET_NAME, PROVIDERS_HEADERS);
      const provider = sheetDataToObjects(providersSheet.getDataRange().getValues()).find(p => p.id === request.providerId);
      request.entityName = provider ? `${provider.firstName} ${provider.lastName}` : 'Unknown Provider';
      request.entityType = 'Provider';
    } else if (request.facilityId) {
      const facilitiesSheet = getSheet(FACILITIES_SHEET_NAME, FACILITIES_HEADERS);
      const facility = sheetDataToObjects(facilitiesSheet.getDataRange().getValues()).find(f => f.id === request.facilityId);
      request.entityName = facility ? facility.name : 'Unknown Facility';
      request.entityType = 'Facility';
    }

    return { success: true, data: request };
  } catch (error) {
    logAuditEvent("Error", `Failed to get credentialing request details for ${requestId}: ${error.message}`);
    return { success: false, message: `Failed to get credentialing request details: ${error.message}` };
  }
}

/**
 * Lists credentialing requests with filtering, sorting, and pagination.
 * @param {object} options - An object with pagination, sorting, and filtering parameters.
 * @returns {object} An object with the list of requests and pagination info.
 */
function listCredentialingRequests(options = {}) {
  try {
    const {
      page = 1, pageSize = 25, searchTerm = '',
      typeFilter = '', priorityFilter = '', ownerFilter = '', statusFilter = '',
      sortBy = 'createdAt', sortOrder = 'desc'
    } = options;

    const sheet = getSheet(CREDENTIALING_REQUESTS_SHEET_NAME, CREDENTIALING_REQUESTS_HEADERS);
    let allRequests = sheetDataToObjects(sheet.getDataRange().getValues());

    // Enrich with entity names for searching and display
    const providers = getCachedSheetData(PROVIDERS_SHEET_NAME, PROVIDERS_HEADERS);
    const facilities = getCachedSheetData(FACILITIES_SHEET_NAME, FACILITIES_HEADERS);
    const providerMap = new Map(providers.map(p => [p.id, `${p.firstName} ${p.lastName}`]));
    const facilityMap = new Map(facilities.map(f => [f.id, f.name]));

    allRequests.forEach(req => {
      if (req.providerId) {
        req.entityName = providerMap.get(req.providerId) || 'Unknown Provider';
      } else if (req.facilityId) {
        req.entityName = facilityMap.get(req.facilityId) || 'Unknown Facility';
      }
    });

    // Filtering
    if (typeFilter) allRequests = allRequests.filter(r => r.type === typeFilter);
    if (priorityFilter) allRequests = allRequests.filter(r => r.priority === priorityFilter);
    if (ownerFilter) allRequests = allRequests.filter(r => r.owner === ownerFilter);
    if (statusFilter) {
      // Allow filtering by multiple, comma-separated statuses
      const statuses = statusFilter.split(',');
      allRequests = allRequests.filter(r => statuses.includes(r.status));
    }

    if (searchTerm) {
      const lowercasedTerm = searchTerm.toLowerCase();
      allRequests = allRequests.filter(r =>
        (r.id && r.id.toLowerCase().includes(lowercasedTerm)) ||
        (r.entityName && r.entityName.toLowerCase().includes(lowercasedTerm)) ||
        (r.owner && r.owner.toLowerCase().includes(lowercasedTerm))
      );
    }

    // Sorting
    allRequests.sort((a, b) => {
      const valA = a[sortBy] || '';
      const valB = b[sortBy] || '';
      let comparison = 0;
      if (sortBy === 'createdAt') {
        comparison = new Date(valA) > new Date(valB) ? 1 : -1;
      } else {
        if (String(valA).toLowerCase() > String(valB).toLowerCase()) comparison = 1;
        else if (String(valA).toLowerCase() < String(valB).toLowerCase()) comparison = -1;
      }
      return sortOrder === 'desc' ? comparison * -1 : comparison;
    });

    const totalRecords = allRequests.length;
    const startIndex = (page - 1) * pageSize;
    const paginatedData = allRequests.slice(startIndex, startIndex + pageSize);

    return { success: true, data: paginatedData, totalRecords: totalRecords };
  } catch (error) {
    logAuditEvent("Error", `Failed to list credentialing requests: ${error.message}`);
    return { success: false, message: `Failed to list credentialing requests: ${error.message}` };
  }
}

/**
 * Patches an existing credentialing request with new data.
 * @param {string} requestId The ID of the credentialing request to update.
 * @param {object} requestData The data to patch (e.g., priority, ownerId, status).
 * @returns {object} A success or error message.
 */
function patchCredentialingRequest(requestId, requestData) {
  try {
    const sheet = getSheet(CREDENTIALING_REQUESTS_SHEET_NAME, CREDENTIALING_REQUESTS_HEADERS);
    const idColIndex = CREDENTIALING_REQUESTS_HEADERS.indexOf("ID");
    const rowIndexMap = getOrCreateRowIndex(sheet, idColIndex);
    const rowNum = rowIndexMap.get(requestId);

    if (!rowNum) {
      return { success: false, message: `Credentialing request with ID ${requestId} not found.` };
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const rowValues = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    let updated = false;

    // Map requestData keys to sheet headers and update values
    const headerMap = {
      priority: "Priority",
      ownerId: "Owner", // Assuming ownerId maps to "Owner" column
      status: "Status" // If you want to allow patching status directly
    };

    for (const key in requestData) {
      if (requestData.hasOwnProperty(key) && headerMap[key]) {
        const colIndex = headers.indexOf(headerMap[key]);
        if (colIndex !== -1 && rowValues[colIndex] !== requestData[key]) {
          rowValues[colIndex] = requestData[key];
          updated = true;
        }
      }
    }

    if (updated) {
      sheet.getRange(rowNum, 1, 1, headers.length).setValues([rowValues]);
      invalidateRowIndexCache(sheet);
      logAuditEvent("Request", `Credentialing request ${requestId} patched.`, { requestId: requestId, newData: requestData });
      return { success: true, message: `Credentialing request ${requestId} updated successfully.` };
    } else {
      return { success: true, message: "No changes detected for credentialing request." };
    }

  } catch (error) {
    logAuditEvent("Error", `Failed to patch credentialing request ${requestId}: ${error.message}`);
    return { success: false, message: `Failed to patch credentialing request: ${error.message}` };
  }
}

/**
 * Lists open credentialing requests assigned to the current user ("My Tasks").
 * Sorts by oldest first to prioritize older tasks.
 * @param {object} [options={}] Optional query parameters, though filters are preset.
 * @returns {object} An object with the list of requests and pagination info.
 */
function listMyCredentialingTasks(options = {}) {
  try {
    const userEmail = Session.getActiveUser().getEmail();
    if (!userEmail) {
      // Return empty if no user is logged in, or for anonymous access.
      return { success: true, data: [], totalRecords: 0 };
    }

    // Define the statuses that are considered "open tasks"
    const openTaskStatuses = "RequestSubmitted,RequestInProgress,AdditionalInformationRequested";

    const requestOptions = {
      ...options, // Allow frontend to pass pagination, etc.
      ownerFilter: userEmail,
      statusFilter: openTaskStatuses,
      sortBy: 'createdAt',
      sortOrder: 'asc' // Show oldest tasks first
    };

    // Reuse the main listing function with our specific filters
    return listCredentialingRequests(requestOptions);

  } catch (error) {
    logAuditEvent("Error", `Failed to list tasks for current user: ${error.message}`, { user: Session.getActiveUser().getEmail() });
    return { success: false, message: `Failed to list my tasks: ${error.message}` };
  }
}

/**
 * Aggregates and returns a list of unique users who own credentialing requests.
 * @returns {object} An object containing success status and a list of user objects.
 */
function aggregateCredentialingRequestOwners() {
  try {
    const requestsSheet = getSheet(CREDENTIALING_REQUESTS_SHEET_NAME, CREDENTIALING_REQUESTS_HEADERS);
    const allRequests = sheetDataToObjects(requestsSheet.getDataRange().getValues());

    const ownerEmails = [...new Set(allRequests.map(req => req.owner).filter(Boolean))];

    const allUsersResponse = listUsers();
    if (!allUsersResponse.success) {
      // Fallback to just returning emails if users can't be listed
      return { success: true, data: ownerEmails.map(email => ({ email: email })) };
    }

    const allUsers = allUsersResponse.data;
    const ownerUsers = allUsers.filter(user => ownerEmails.includes(user.email));

    return { success: true, data: ownerUsers };
  } catch (error) {
    logAuditEvent("Error", `Failed to aggregate credentialing request owners: ${error.message}`);
    return { success: false, message: `Failed to aggregate credentialing request owners: ${error.message}` };
  }
}

/**
 * Gets aggregations for credentialing requests, typically by status.
 * @param {object} options - Optional filters (e.g., entityType, entityDeactivated).
 * @returns {object} An object with total count and aggregations by status.
 */
function getCredentialingRequestAggregations(options = {}) {
  try {
    const requestsSheet = getSheet(CREDENTIALING_REQUESTS_SHEET_NAME, CREDENTIALING_REQUESTS_HEADERS);
    let allRequests = sheetDataToObjects(requestsSheet.getDataRange().getValues());

    const aggregations = allRequests.reduce((acc, req) => {
      const status = req.status || 'Unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    const total = allRequests.length;

    return { success: true, data: { total: total, aggregations: aggregations } };
  } catch (error) {
    logAuditEvent("Error", `Failed to get credentialing request aggregations: ${error.message}`);
    return { success: false, message: `Failed to get credentialing request aggregations: ${error.message}` };
  }
}

/**
 * Creates a new event for a credentialing request.
 * @param {string} requestId The ID of the credentialing request.
 * @param {object} eventData The data for the new event.
 * @returns {object} A success or error message, with the new event data on success.
 */
function createCredentialingRequestEvent(requestId, eventData) {
  try {
    const sheet = getSheet(CREDENTIALING_REQUEST_EVENTS_SHEET_NAME, CREDENTIALING_REQUEST_EVENTS_HEADERS);
    const newId = Utilities.getUuid();
    const now = new Date().toISOString();
    const userEmail = Session.getActiveUser().getEmail();

    const newEvent = {
      id: newId,
      requestId: requestId,
      timestamp: now,
      status: eventData.status,
      note: eventData.note || "",
      user: userEmail,
      attachments: eventData.attachments || []
    };

    const rowData = [newEvent.id, newEvent.requestId, newEvent.timestamp, newEvent.status, newEvent.note, newEvent.user, JSON.stringify(newEvent.attachments)];
    sheet.appendRow(rowData);
    invalidateRowIndexCache(sheet);

    const requestsSheet = getSheet(CREDENTIALING_REQUESTS_SHEET_NAME, CREDENTIALING_REQUESTS_HEADERS);
    const idColIndex = CREDENTIALING_REQUESTS_HEADERS.indexOf("ID");
    const rowIndexMap = getOrCreateRowIndex(requestsSheet, idColIndex);
    const rowNum = rowIndexMap.get(requestId);
    if (rowNum) {
      requestsSheet.getRange(rowNum, CREDENTIALING_REQUESTS_HEADERS.indexOf("Status") + 1).setValue(newEvent.status);
      requestsSheet.getRange(rowNum, CREDENTIALING_REQUESTS_HEADERS.indexOf("Current Event (JSON)") + 1).setValue(JSON.stringify(newEvent));
    }

    logAuditEvent("Request", `Credentialing event created for request ${requestId}`, { requestId: requestId, eventId: newId, status: newEvent.status });
    return { success: true, message: "Event created successfully.", data: newEvent };
  } catch (error) {
    logAuditEvent("Error", `Failed to create credentialing event for request ${requestId}: ${error.message}`);
    return { success: false, message: `Failed to create credentialing event: ${error.message}` };
  }
}

/**
 * Retrieves a specific credentialing request event by its ID.
 * @param {string} requestId The ID of the parent credentialing request.
 * @param {string} eventId The ID of the event to retrieve.
 * @returns {object} An object containing success status and the event data.
 */
function getCredentialingRequestEvent(requestId, eventId) {
  try {
    if (!requestId || !eventId) {
      return { success: false, message: "Request ID and Event ID are required." };
    }
    const sheet = getSheet(CREDENTIALING_REQUEST_EVENTS_SHEET_NAME, CREDENTIALING_REQUEST_EVENTS_HEADERS);
    const allEvents = sheetDataToObjects(sheet.getDataRange().getValues());

    const event = allEvents.find(e => e.requestId === requestId && e.id === eventId);

    if (!event) {
      return { success: false, message: `Event with ID ${eventId} not found for request ${requestId}.` };
    }
    return { success: true, data: event };
  } catch (error) {
    logAuditEvent("Error", `Failed to get credentialing request event ${eventId}: ${error.message}`);
    return { success: false, message: `Failed to get credentialing request event: ${error.message}` };
  }
}

/**
 * Creates or replaces the entire checklist for a credentialing request.
 * @param {string} requestId The ID of the credentialing request.
 * @param {object} checklistData An object containing an array of checklist items.
 * @returns {object} A success or error message.
 */
function createCredentialingRequestChecklist(requestId, checklistData) {
  try {
    if (!requestId || !checklistData || !Array.isArray(checklistData.items)) {
      return { success: false, message: "Request ID and a valid checklist items array are required." };
    }

    const sheet = getSheet(CREDENTIALING_CHECKLIST_ITEMS_SHEET_NAME, CREDENTIALING_CHECKLIST_ITEMS_HEADERS);
    const requestIdColIndex = CREDENTIALING_CHECKLIST_ITEMS_HEADERS.indexOf("Request ID");

    deleteRowsByColumnValue(sheet, requestIdColIndex, requestId);

    const newRows = checklistData.items.map(item => [
      Utilities.getUuid(), requestId, item.name || "", item.status || "Pending", item.confirmedAt || "", item.confirmedBy || "", item.verifiedAt || "", item.source || "", JSON.stringify(item.references || {})
    ]);

    if (newRows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
    }

    invalidateRowIndexCache(sheet);
    logAuditEvent("Request", `Checklist created/replaced for request ${requestId}`, { requestId: requestId, itemCount: newRows.length });
    return { success: true, message: `Checklist for request ${requestId} has been successfully updated.` };
  } catch (error) {
    logAuditEvent("Error", `Failed to create/replace checklist for request ${requestId}: ${error.message}`);
    return { success: false, message: `Failed to create/replace checklist: ${error.message}` };
  }
}

/**
 * Creates a single new checklist item for a credentialing request.
 * @param {string} requestId The ID of the credentialing request.
 * @param {object} itemData The data for the new checklist item (e.g., name).
 * @returns {object} A success or error message.
 */
function createCredentialingRequestChecklistItem(requestId, itemData) {
  if (!requestId || !itemData || !itemData.name) {
    return { success: false, message: "Request ID and item name are required." };
  }
  const rowData = [itemData.name, itemData.status || "Pending", "", "", "", "", "{}"];
  return createSubEntity(
    CREDENTIALING_CHECKLIST_ITEMS_SHEET_NAME,
    CREDENTIALING_CHECKLIST_ITEMS_HEADERS,
    requestId,
    rowData,
    `Checklist item "${itemData.name}"`,
    "Request ID" // Specify the parent ID column name
  );
}