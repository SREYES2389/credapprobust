/**
 * @fileoverview
 * This file contains functions related to the "Admin" menu in the spreadsheet UI.
 * It includes sheet setup and mock data population.
 */

/**
 * Initializes all necessary sheets with their headers in the active spreadsheet.
 * This function is idempotent; it won't create sheets that already exist.
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ALL_SHEET_DEFINITIONS.forEach(sheetDef => {
    let sheet = ss.getSheetByName(sheetDef.name);
    if (!sheet) {
      sheet = ss.insertSheet(sheetDef.name);
      sheet.appendRow(sheetDef.headers);
    }
  });
  SpreadsheetApp.getUi().alert('All sheets have been set up successfully.');
}


/**
 * Validates that all sheets defined in the schema exist and have the correct headers.
 * Provides a UI report of any issues found.
 */
function validateSchemas() {
  const ui = SpreadsheetApp.getUi();
  const issues = [];
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  ALL_SHEET_DEFINITIONS.forEach(sheetDef => {
    const sheet = ss.getSheetByName(sheetDef.name);
    if (!sheet) {
      issues.push(`MISSING SHEET: Sheet "${sheetDef.name}" does not exist.`);
      return; // Continue to next definition
    }

    const lastColumn = sheet.getLastColumn();
    const expectedColumnCount = sheetDef.headers.length;

    if (lastColumn < expectedColumnCount) {
      issues.push(`HEADER MISMATCH in "${sheetDef.name}": Expected ${expectedColumnCount} columns, but found only ${lastColumn}.`);
      return;
    }

    const actualHeaders = sheet.getRange(1, 1, 1, expectedColumnCount).getValues()[0];

    for (let i = 0; i < expectedColumnCount; i++) {
      if (actualHeaders[i] !== sheetDef.headers[i]) {
        issues.push(`HEADER MISMATCH in "${sheetDef.name}" at column ${i + 1}:\n  - Expected: "${sheetDef.headers[i]}"\n  - Found:    "${actualHeaders[i]}"`);
        // We only report the first mismatch per sheet for clarity
        return;
      }
    }
  });

  if (issues.length === 0) {
    ui.alert('Schema Validation Passed', 'All sheets exist and have the correct headers.', ui.ButtonSet.OK);
  } else {
    const report = `Schema Validation Failed!\n\nFound ${issues.length} issue(s):\n\n` + issues.join('\n\n');
    const htmlOutput = HtmlService.createHtmlOutput(`<pre>${report}</pre>`).setWidth(700).setHeight(450);
    ui.showModalDialog(htmlOutput, 'Schema Validation Report');
  }
}

/**
 * Clears all data from all sheets (except headers) and populates them with mock data.
 */
function addMockData() {
    const ui = SpreadsheetApp.getUi();
    const response = ui.alert('Confirm', 'This will delete all existing data and replace it with mock data. Are you sure you want to continue?', ui.ButtonSet.YES_NO);
    if (response !== ui.Button.YES) {
        return;
    }

    _clearAllSheetData();

    const userEmail = Session.getActiveUser().getEmail();
    const now = new Date();

    // Generate data in dependency order
    const mockUserObjects = _mockUsers(userEmail);
    _mockRoles();
    _mockDefinitionTypes();

    const mockGroups = _mockGroups();
    const { mockPayers, mockPlanObjects } = _mockPayersAndPlans();
    const mockFacilities = _mockFacilities();
    const mockProviderObjects = _mockProviders(now);

    // Records that depend on providers/facilities
    _mockProviderSubRecords(mockProviderObjects, now);
    const mockRequestObjects = _mockCredentialing(now, userEmail, mockProviderObjects);

    // Records that depend on multiple primary entities
    _mockEnrollments(now, mockGroups, mockPlanObjects, mockProviderObjects);
    _mockNotes(userEmail, mockProviderObjects, mockFacilities, mockRequestObjects);

    // Standalone records
    _mockReports(now);
    _mockProfileImportSources();

    _invalidateAllCaches();
    ui.alert('Mock data has been added successfully.');
}

/**
 * Clears all data rows from all sheets defined in the schema.
 * @private
 */
function _clearAllSheetData() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ss.getSheets().forEach(sheet => {
        const lastRow = sheet.getLastRow();
        if (lastRow > 1) {
            sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
        }
    });
}

/**
 * Populates the Users sheet.
 * @param {string} userEmail The email of the current active user.
 * @returns {Array<object>} The array of created user objects.
 * @private
 */
function _mockUsers(userEmail) {
    const sheet = getSheet(USERS_SHEET_NAME, USERS_HEADERS);
    const mockUserObjects = [
    { "ID": Utilities.getUuid(), "Email": userEmail, "First Name": "Admin", "Last Name": "User" },
    { "ID": Utilities.getUuid(), "Email": "credentialer1@example.com", "First Name": "Chris", "Last Name": "Credentialer" },
    { "ID": Utilities.getUuid(), "Email": "manager@example.com", "First Name": "Mary", "Last Name": "Manager" }
    ];
    const rows = mapObjectsToRows(mockUserObjects, USERS_HEADERS);
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    return mockUserObjects;
}

/**
 * Populates the Roles sheet.
 * @private
 */
function _mockRoles() {
    const sheet = getSheet(ROLES_SHEET_NAME, ROLES_HEADERS);
    const mockRoleObjects = [
    { "ID": Utilities.getUuid(), "Name": "Admin" },
    { "ID": Utilities.getUuid(), "Name": "Credentialer" },
    { "ID": Utilities.getUuid(), "Name": "Manager" },
    { "ID": Utilities.getUuid(), "Name": "Viewer" }
    ];
    const rows = mapObjectsToRows(mockRoleObjects, ROLES_HEADERS);
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

/**
 * Populates various definition-type sheets (Provider Types, Facility License Types).
 * @private
 */
function _mockDefinitionTypes() {
    const providerTypesSheet = getSheet(PROVIDER_TYPES_SHEET_NAME, PROVIDER_TYPES_HEADERS);
    const mockProviderTypeObjects = [
    { "ID": Utilities.getUuid(), "Name": "Physician" },
    { "ID": Utilities.getUuid(), "Name": "Nurse Practitioner" },
    { "ID": Utilities.getUuid(), "Name": "Physician Assistant" }
    ];
    const providerTypeRows = mapObjectsToRows(mockProviderTypeObjects, PROVIDER_TYPES_HEADERS);
    if (providerTypeRows.length > 0) providerTypesSheet.getRange(2, 1, providerTypeRows.length, providerTypeRows[0].length).setValues(providerTypeRows);

    const facilityLicenseTypesSheet = getSheet(FACILITY_LICENSE_TYPES_SHEET_NAME, FACILITY_LICENSE_TYPES_HEADERS);
    const mockFacilityLicenseTypeObjects = [
    { "ID": Utilities.getUuid(), "Name": "Hospital License" },
    { "ID": Utilities.getUuid(), "Name": "Ambulatory Surgical Center License" },
    { "ID": Utilities.getUuid(), "Name": "Clinical Laboratory License" }
    ];
    const facilityLicenseTypeRows = mapObjectsToRows(mockFacilityLicenseTypeObjects, FACILITY_LICENSE_TYPES_HEADERS);
    if (facilityLicenseTypeRows.length > 0) facilityLicenseTypesSheet.getRange(2, 1, facilityLicenseTypeRows.length, facilityLicenseTypeRows[0].length).setValues(facilityLicenseTypeRows);
}

/**
 * Populates the Groups sheet.
 * @returns {Array<object>} The array of created group objects.
 * @private
 */
function _mockGroups() {
    const sheet = getSheet(GROUPS_SHEET_NAME, GROUPS_HEADERS);
    const mockGroups = [
    { "ID": Utilities.getUuid(), "Name": "General Medical Group", "NPI": "1234567890", "Tax ID": "99-1234567", "Remit Address (JSON)": {} },
    { "ID": Utilities.getUuid(), "Name": "Specialty Surgical Center", "NPI": "0987654321", "Tax ID": "99-7654321", "Remit Address (JSON)": {} },
    { "ID": Utilities.getUuid(), "Name": "Community Health Partners", "NPI": "1122334455", "Tax ID": "99-1122334", "Remit Address (JSON)": {} }
    ];
    const rows = mapObjectsToRows(mockGroups, GROUPS_HEADERS);
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    return mockGroups;
}

/**
 * Populates the Payers and PayerPlans sheets.
 * @returns {{mockPayers: Array<object>, mockPlanObjects: Array<object>}} The created payer and plan objects.
 * @private
 */
function _mockPayersAndPlans() {
    const payersSheet = getSheet(PAYERS_SHEET_NAME, PAYERS_HEADERS);
    const mockPayers = [
    { "ID": Utilities.getUuid(), "Name": "Aetna" },
    { "ID": Utilities.getUuid(), "Name": "Cigna" },
    { "ID": Utilities.getUuid(), "Name": "United Healthcare" }
    ];
    const payerRows = mapObjectsToRows(mockPayers, PAYERS_HEADERS);
    if (payerRows.length > 0) payersSheet.getRange(2, 1, payerRows.length, payerRows[0].length).setValues(payerRows);

    const plansSheet = getSheet(PAYER_PLANS_SHEET_NAME, PAYER_PLANS_HEADERS);
    const mockPlanObjects = [
    { "ID": Utilities.getUuid(), "Payer ID": mockPayers[0]["ID"], "Name": "HMO Gold", "State": "CA" },
    { "ID": Utilities.getUuid(), "Payer ID": mockPayers[0]["ID"], "Name": "PPO Silver", "State": "CA" },
    { "ID": Utilities.getUuid(), "Payer ID": mockPayers[1]["ID"], "Name": "Open Access Plus", "State": "NY" },
    { "ID": Utilities.getUuid(), "Payer ID": mockPayers[2]["ID"], "Name": "Choice Plus", "State": "TX" }
    ];
    const planRows = mapObjectsToRows(mockPlanObjects, PAYER_PLANS_HEADERS);
    if (planRows.length > 0) plansSheet.getRange(2, 1, planRows.length, planRows[0].length).setValues(planRows);
    return { mockPayers, mockPlanObjects };
}

/**
 * Populates the Providers sheet with random data.
 * @param {Date} now The current date object for calculations.
 * @returns {Array<object>} The array of created provider objects.
 * @private
 */
function _mockProviders(now) {
    const sheet = getSheet(PROVIDERS_SHEET_NAME, PROVIDERS_HEADERS);
    const firstNames = ["John", "Jane", "Peter", "Mary", "David", "Susan", "Michael", "Linda", "James", "Patricia"];
    const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez"];
    const statuses = ["Active", "Needs Review", "Data Collection", "Expired"];
    const mockProviderObjects = [];
    for (let i = 0; i < 25; i++) {
        const nextCredDate = new Date(now.getTime() + (Math.random() * 365 - 90) * 24 * 60 * 60 * 1000);
        mockProviderObjects.push({
            "ID": Utilities.getUuid(),
            "First Name": firstNames[Math.floor(Math.random() * firstNames.length)],
            "Last Name": lastNames[Math.floor(Math.random() * lastNames.length)],
            "NPI": (1000000000 + Math.floor(Math.random() * 9000000000)).toString(),
            "Next Credentialing Date": nextCredDate.toISOString().split('T')[0],
            "Credentialing Status": statuses[i % statuses.length],
            "Deactivated": i % 10 === 0
        });
    }
    const rows = mapObjectsToRows(mockProviderObjects, PROVIDERS_HEADERS);
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    return mockProviderObjects;
}

/**
 * Populates the Facilities sheet.
 * @returns {Array<object>} The array of created facility objects.
 * @private
 */
function _mockFacilities() {
    const sheet = getSheet(FACILITIES_SHEET_NAME, FACILITIES_HEADERS);
    const mockFacilityObjects = [
    { "ID": Utilities.getUuid(), "Name": "Downtown General Hospital", "Address Line 1": "123 Main St", "City": "Metropolis", "State": "NY", "Zip Code": "10001", "Phone Number": "555-1234", "Deactivated": false },
    { "ID": Utilities.getUuid(), "Name": "Uptown Surgical Center", "Address Line 1": "456 Oak Ave", "City": "Metropolis", "State": "NY", "Zip Code": "10025", "Phone Number": "555-5678", "Deactivated": false },
    { "ID": Utilities.getUuid(), "Name": "Westside Clinic", "Address Line 1": "789 Pine Ln", "City": "Gotham", "State": "NJ", "Zip Code": "07001", "Phone Number": "555-9012", "Deactivated": false },
    { "ID": Utilities.getUuid(), "Name": "Oceanview Medical", "Address Line 1": "101 Coast Blvd", "City": "Coast City", "State": "CA", "Zip Code": "90210", "Phone Number": "555-3456", "Deactivated": true },
    ].map(f => ({ ...f, "Contact Name": "Admin", "Contact Email": "admin@example.com", "Facility Tax ID": f["ID"].substring(9, 17) }));
    const rows = mapObjectsToRows(mockFacilityObjects, FACILITIES_HEADERS);
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    return mockFacilityObjects;
}

/**
 * Populates various provider sub-records like Licenses and Education.
 * @param {Array<object>} mockProviderObjects The array of previously created provider objects.
 * @param {Date} now The current date object for calculations.
 * @private
 */
function _mockProviderSubRecords(mockProviderObjects, now) {
    // Mock Licenses
    const licensesSheet = getSheet(LICENSES_SHEET_NAME, LICENSES_HEADERS);
    const mockLicenseObjects = mockProviderObjects.slice(0, 15).map(provider => {
        const issueDate = new Date(now.getTime() - (Math.random() * 365) * 24 * 60 * 60 * 1000);
        const expirationDate = new Date(issueDate.getTime() + (Math.random() * 730) * 24 * 60 * 60 * 1000);
        return {
            "ID": Utilities.getUuid(), "Provider ID": provider.ID, "License Number": "MD" + Math.floor(Math.random() * 90000000).toString(),
            "First Name": provider["First Name"], "Last Name": provider["Last Name"], "State": "CA", "Job Status": "Idle",
            "Non Verified Issue Date": issueDate.toISOString().split('T')[0], "Non Verified Expiration Date": expirationDate.toISOString().split('T')[0],
            "Non Verified Status": "Active", "Current Verification Status": "Found", "Restriction Status": "None", "Approved Status": "Yes",
            "Is Primary": true, "Is Currently Practicing": true, "License Type ID": "lic-type-1"
        };
    });
    const licenseRows = mapObjectsToRows(mockLicenseObjects, LICENSES_HEADERS);
    if (licenseRows.length > 0) licensesSheet.getRange(2, 1, licenseRows.length, licenseRows[0].length).setValues(licenseRows);

    // Mock Education
    const educationSheet = getSheet(PROVIDER_EDUCATION_SHEET_NAME, PROVIDER_EDUCATION_HEADERS);
    const mockEducationObjects = mockProviderObjects.slice(5, 20).map(provider => {
        const graduationDate = new Date(now.getTime() - (Math.random() * 365 * 5) * 24 * 60 * 60 * 1000);
        return {
            "ID": Utilities.getUuid(), "Provider ID": provider.ID, "School Name": "Example University", "Degree": "MD",
            "Graduate Type": "Professional", "Start Date": new Date(graduationDate.getTime() - (3 * 365 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
            "End Date": graduationDate.toISOString().split('T')[0]
        };
    });
    const educationRows = mapObjectsToRows(mockEducationObjects, PROVIDER_EDUCATION_HEADERS);
    if (educationRows.length > 0) educationSheet.getRange(2, 1, educationRows.length, educationRows[0].length).setValues(educationRows);
}

/**
 * Populates notes and files for various entities.
 * @param {string} userEmail The current user's email.
 * @param {Array<object>} mockProviderObjects Previously created provider objects.
 * @param {Array<object>} mockFacilityObjects Previously created facility objects.
 * @param {Array<object>} mockRequestObjects Previously created request objects.
 * @private
 */
function _mockNotes(userEmail, mockProviderObjects, mockFacilityObjects, mockRequestObjects) {
    const notesSheet = getSheet(NOTES_SHEET_NAME, NOTES_HEADERS);
    const mockNoteObjects = [
    { "ID": Utilities.getUuid(), "Provider ID": mockProviderObjects[0]["ID"], "Note": "Called provider to confirm address.", "Timestamp": new Date().toISOString(), "User Email": userEmail },
    { "ID": Utilities.getUuid(), "Provider ID": mockProviderObjects[1]["ID"], "Note": "Provider sent updated insurance info.", "Timestamp": new Date().toISOString(), "User Email": userEmail },
    { "ID": Utilities.getUuid(), "Facility ID": mockFacilityObjects[0]["ID"], "Note": "Facility accreditation is up for renewal next month.", "Timestamp": new Date().toISOString(), "User Email": userEmail },
    { "ID": Utilities.getUuid(), "Request ID": mockRequestObjects[0]["ID"], "Note": "Awaiting documents from provider.", "Timestamp": new Date().toISOString(), "User Email": userEmail },
    { "ID": Utilities.getUuid(), "Provider ID": mockProviderObjects[2]["ID"], "Note": "Follow up on license verification needed.", "Timestamp": new Date().toISOString(), "User Email": userEmail }
    ];
    const noteRows = mapObjectsToRows(mockNoteObjects, NOTES_HEADERS);
    if (noteRows.length > 0) notesSheet.getRange(2, 1, noteRows.length, noteRows[0].length).setValues(noteRows);

    const filesSheet = getSheet(FILES_SHEET_NAME, FILES_HEADERS);
    const mockFileObjects = [
    { "ID": Utilities.getUuid(), "Path": "https://example.com/file1.pdf", "Provider ID": mockProviderObjects[0]["ID"], "Created At": new Date().toISOString(), "Created By User Email": userEmail, "Size": 123456 },
    { "ID": Utilities.getUuid(), "Path": "https://example.com/file2.jpg", "Provider ID": mockProviderObjects[0]["ID"], "Created At": new Date().toISOString(), "Created By User Email": userEmail, "Size": 789012 },
    { "ID": Utilities.getUuid(), "Path": "https://example.com/file3.pdf", "Facility ID": mockFacilityObjects[0]["ID"], "Created At": new Date().toISOString(), "Created By User Email": userEmail, "Size": 345678 }
    ];
    const fileRows = mapObjectsToRows(mockFileObjects, FILES_HEADERS);
    if (fileRows.length > 0) filesSheet.getRange(2, 1, fileRows.length, fileRows[0].length).setValues(fileRows);
}

/**
 * Populates the Reports sheet and Profile Import Sources.
 * @param {Date} now The current date object for calculations.
 * @private
 */
function _mockReports(now) {
    const sheet = getSheet(REPORTS_SHEET_NAME, REPORTS_HEADERS);
    const mockReportObjects = [
    { "ID": Utilities.getUuid(), "Type": "Roster", "Status": "Completed", "StartedAt": new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), "CompletedAt": new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000 + 120000).toISOString(), "Path": "https://example.com/reports/roster_20231026.csv" },
    { "ID": Utilities.getUuid(), "Type": "Enrollments", "Status": "Completed", "StartedAt": new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(), "CompletedAt": new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000 + 180000).toISOString(), "Path": "https://example.com/reports/enrollments_20231023.csv" },
    { "ID": Utilities.getUuid(), "Type": "ExpirableCredentials", "Status": "Completed", "StartedAt": new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), "CompletedAt": new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 + 90000).toISOString(), "Path": "https://example.com/reports/expirables_20231021.pdf" },
    { "ID": Utilities.getUuid(), "Type": "SanctionsAndExclusions", "Status": "Failed", "StartedAt": new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(), "CompletedAt": new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000 + 30000).toISOString() },
    { "ID": Utilities.getUuid(), "Type": "Roster", "Status": "Working", "StartedAt": new Date().toISOString() }
    ];
    const reportRows = mapObjectsToRows(mockReportObjects, REPORTS_HEADERS);
    if (reportRows.length > 0) sheet.getRange(2, 1, reportRows.length, reportRows[0].length).setValues(reportRows);
}

/**
 * Populates the Profile Import Sources sheets.
 * @private
 */
function _mockProfileImportSources() {
    const providerSheet = getSheet(PROVIDER_PROFILE_IMPORT_SOURCES_SHEET_NAME, PROVIDER_PROFILE_IMPORT_SOURCES_HEADERS);
    const facilitySheet = getSheet(FACILITY_PROFILE_IMPORT_SOURCES_SHEET_NAME, FACILITY_PROFILE_IMPORT_SOURCES_HEADERS);

    const providerSources = [
    { "Source": "Npi", "Name": "NPI Registry", "Required Parameters (JSON)": [], "Has Pass-Through Fee": false, "Supports Re-import": true },
    { "Source": "CaqhPo", "Name": "CAQH ProView", "Required Parameters (JSON)": ["CaqhId"], "Has Pass-Through Fee": true, "Supports Re-import": true },
    { "Source": "AmericanMedicalAssociationPhysician", "Name": "AMA Physician Profile", "Required Parameters (JSON)": [], "Has Pass-Through Fee": false, "Supports Re-import": false }
    ];
    const facilitySources = [
    { "Source": "Npi", "Name": "NPI Registry (Facility)", "Required Parameters (JSON)": [], "Has Pass-Through Fee": false, "Supports Re-import": true },
    { "Source": "Medicare", "Name": "Medicare Enrollment Data", "Required Parameters (JSON)": [], "Has Pass-Through Fee": false, "Supports Re-import": false }
    ];

    const providerRows = mapObjectsToRows(providerSources, PROVIDER_PROFILE_IMPORT_SOURCES_HEADERS);
    if (providerRows.length > 0) providerSheet.getRange(2, 1, providerRows.length, providerRows[0].length).setValues(providerRows);

    const facilityRows = mapObjectsToRows(facilitySources, FACILITY_PROFILE_IMPORT_SOURCES_HEADERS);
    if (facilityRows.length > 0) facilitySheet.getRange(2, 1, facilityRows.length, facilityRows[0].length).setValues(facilityRows);
}

/**
 * Populates the Enrollments sheet.
 * @param {Date} now The current date object for date calculations.
 * @param {Array<object>} mockGroups The array of existing mock group objects.
 * @param {Array<object>} mockPlanObjects The array of existing mock plan objects.
 * @param {Array<object>} mockProviderObjects The array of existing mock provider objects.
 * @private
 */
function _mockEnrollments(now, mockGroups, mockPlanObjects, mockProviderObjects) {
    const sheet = getSheet(PROVIDER_ENROLLMENTS_SHEET_NAME, PROVIDER_ENROLLMENTS_HEADERS);
    const mockEnrollmentObjects = [];
    for (let i = 0; i < 15; i++) {
        const effectiveDate = new Date(now.getTime() - (Math.random() * 730) * 24 * 60 * 60 * 1000);
        mockEnrollmentObjects.push({
            "ID": Utilities.getUuid(), "Group ID": mockGroups[i % mockGroups.length]["ID"], "Payer Plan ID": mockPlanObjects[i % mockPlanObjects.length]["ID"],
            "Provider ID": mockProviderObjects[i]["ID"], "Effective Date": effectiveDate.toISOString().split('T')[0], "Enrollment Status": "Enrolled",
            "Network Status": "Par", "Specialist Type": "Specialist"
        });
    }
    const rows = mapObjectsToRows(mockEnrollmentObjects, PROVIDER_ENROLLMENTS_HEADERS);
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

/**
 * Populates the Credentialing Requests, Events, and Checklist Items sheets.
 * @param {Date} now The current date object for date calculations.
 * @param {string} userEmail The email of the current active user.
 * @param {Array<object>} mockProviderObjects The array of existing mock provider objects.
 * @returns {Array<object>} The array of created request objects.
 * @private
 */
function _mockCredentialing(now, userEmail, mockProviderObjects) {
    const requestsSheet = getSheet(CREDENTIALING_REQUESTS_SHEET_NAME, CREDENTIALING_REQUESTS_HEADERS);
    const eventsSheet = getSheet(CREDENTIALING_REQUEST_EVENTS_SHEET_NAME, CREDENTIALING_REQUEST_EVENTS_HEADERS);
    const checklistSheet = getSheet(CREDENTIALING_CHECKLIST_ITEMS_SHEET_NAME, CREDENTIALING_CHECKLIST_ITEMS_HEADERS);

    const requestStatuses = ["RequestSubmitted", "RequestInProgress", "AdditionalInformationRequested", "Completed", "CompletedWithConcern"];
    const mockRequestObjects = [];
    const mockEventObjects = [];
    const mockChecklistObjects = [];
    const defaultChecklistItems = ["Primary License Verified", "DEA Verified", "Board Certification Verified", "Sanctions & Exclusions Scan Clear", "Work History Confirmed"];

    for (let i = 0; i < 10; i++) {
        const reqId = Utilities.getUuid();
        const reqStatus = requestStatuses[i % requestStatuses.length];
        const reqCreatedAt = new Date(now.getTime() - (Math.random() * 180) * 24 * 60 * 60 * 1000).toISOString();
        const initialEvent = { id: Utilities.getUuid(), requestId: reqId, timestamp: reqCreatedAt, status: "RequestSubmitted", note: "Initial request created.", user: userEmail, attachments: [] };

        mockRequestObjects.push({
            "ID": reqId, "Provider ID": mockProviderObjects[i]["ID"], "Facility ID": "", "Type": "Initial", "Priority": "Medium",
            "Status": reqStatus, "Owner": userEmail, "CreatedAt": reqCreatedAt, "Current Event (JSON)": JSON.stringify(initialEvent)
        });

        mockEventObjects.push({ "ID": initialEvent.id, "Request ID": initialEvent.requestId, "Timestamp": initialEvent.timestamp, "Status": initialEvent.status, "Note": initialEvent.note, "User": initialEvent.user, "Attachments (JSON)": JSON.stringify(initialEvent.attachments) });

        if (i % 2 === 0 && reqStatus !== "RequestSubmitted") {
            const secondEvent = { id: Utilities.getUuid(), requestId: reqId, timestamp: new Date().toISOString(), status: reqStatus, note: `Status updated to ${reqStatus}.`, user: userEmail, attachments: [] };
            mockEventObjects.push({ "ID": secondEvent.id, "Request ID": secondEvent.requestId, "Timestamp": secondEvent.timestamp, "Status": secondEvent.status, "Note": secondEvent.note, "User": secondEvent.user, "Attachments (JSON)": JSON.stringify(secondEvent.attachments) });
        }

        defaultChecklistItems.forEach((itemName, j) => {
            let itemStatus = "Pending";
            if (reqStatus.startsWith("Completed") || j < 2) itemStatus = "Completed";
            if (reqStatus === "RequestInProgress" && j === 0) itemStatus = "Completed";
            mockChecklistObjects.push({
                "ID": Utilities.getUuid(), "Request ID": reqId, "Name": itemName, "Status": itemStatus,
                "Confirmed At": itemStatus === "Completed" ? new Date().toISOString() : "", "Confirmed By": itemStatus === "Completed" ? userEmail : "", "References (JSON)": {}
            });
        });
    }
    const requestRows = mapObjectsToRows(mockRequestObjects, CREDENTIALING_REQUESTS_HEADERS);
    const eventRows = mapObjectsToRows(mockEventObjects, CREDENTIALING_REQUEST_EVENTS_HEADERS);
    const checklistRows = mapObjectsToRows(mockChecklistObjects, CREDENTIALING_CHECKLIST_ITEMS_HEADERS);

    if (requestRows.length > 0) requestsSheet.getRange(2, 1, requestRows.length, requestRows[0].length).setValues(requestRows);
    if (eventRows.length > 0) eventsSheet.getRange(2, 1, eventRows.length, eventRows[0].length).setValues(eventRows);
    if (checklistRows.length > 0) checklistSheet.getRange(2, 1, checklistRows.length, checklistRows[0].length).setValues(checklistRows);

    return mockRequestObjects;
}

/**
 * Invalidates script cache for all sheets.
 * @private
 */
function _invalidateAllCaches() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cache = CacheService.getScriptCache();
    ss.getSheets().forEach(sheet => {
        const cacheKey = `${ss.getId()}_${sheet.getName()}_rowIndex`;
        cache.remove(cacheKey);
    });
}

function populateMockFacilityTaxonomies(sheet) {
  const mockTaxonomyObjects = [
    { "ID": "tax-id-1", "Code": "207Q00000X", "Name": "Allopathic & Osteopathic Physicians" },
    { "ID": "tax-id-2", "Code": "225100000X", "Name": "Ambulatory Surgical Center" },
    { "ID": "tax-id-3", "Code": "282N00000X", "Name": "Hospital" },
    { "ID": "tax-id-4", "Code": "363A00000X", "Name": "Physician Assistant" }
  ];
  const mockTaxonomies = mapObjectsToRows(mockTaxonomyObjects, FACILITY_TAXONOMIES_HEADERS);
  sheet.getRange(2, 1, mockTaxonomies.length, mockTaxonomies[0].length).setValues(mockTaxonomies);
}

function populateMockLicenseSourceStatus(sheet) {
  const mockStatusObjects = [
    { "License Type ID": "0059f76a-280a-377a-73e2-ddfe86f4113c", "State": "MO", "Issue": "", "Average Processing Time": 1.5, "Average Failure Rate": 0.05 },
    { "License Type ID": "bfb028f0-52ca-47f4-8181-6b4c8262d29c", "State": "CA", "Issue": "", "Average Processing Time": 2.1, "Average Failure Rate": 0.10 },
    { "License Type ID": "c7e1d8f2-9a3b-4c5d-8e6f-7a8b9c0d1e2f", "State": "NY", "Issue": "PossibleIssue", "Average Processing Time": 3.0, "Average Failure Rate": 0.15 }
  ];
  const mockStatus = mapObjectsToRows(mockStatusObjects, LICENSE_SOURCE_STATUS_HEADERS);
  sheet.getRange(2, 1, mockStatus.length, mockStatus[0].length).setValues(mockStatus);
}

function populateMockDatasetsMetadata(sheet) {
  const now = new Date().toISOString();
  const mockDatasetObjects = [
    { "Name": "SAM", "Type": "Sam", "Tags (JSON)": ["Sanctions", "Exclusions"], "Parameter Sets (JSON)": [{ id: "sam-param-set", entityType: "Practitioner", supportedParameterTypes: ["Name", "Npi"], requiredParameterTypes: ["Name"] }], "Status (JSON)": { expectedProcessingTime: 120 }, "Monitoring Intervals (JSON)": ["Daily", "Weekly"], "Last Updated": now, "Schema (JSON)": {}, "Properties (JSON)": {}, "Capabilities (JSON)": { SupportsContinuousMonitoring: true, SupportsOnDemandScanning: true }, "Maintenance Windows (JSON)": [], "Has Pass Through Fee": false },
    { "Name": "OIG Exclusions", "Type": "OigExclusions", "Tags (JSON)": ["Exclusions"], "Parameter Sets (JSON)": [{ id: "oig-param-set", entityType: "Practitioner", supportedParameterTypes: ["Name"], requiredParameterTypes: ["Name"] }], "Status (JSON)": { expectedProcessingTime: 60 }, "Monitoring Intervals (JSON)": ["Monthly"], "Last Updated": now, "Schema (JSON)": {}, "Properties (JSON)": {}, "Capabilities (JSON)": { SupportsOnDemandScanning: true }, "Maintenance Windows (JSON)": [], "Has Pass Through Fee": false },
    { "Name": "State Sanctions & Exclusions", "Type": "StateSanctionsAndExclusions", "Tags (JSON)": ["Sanctions", "Exclusions", "State"], "Parameter Sets (JSON)": [{ id: "state-param-set", entityType: "Practitioner", supportedParameterTypes: ["Name", "State"], requiredParameterTypes: ["Name", "State"] }], "Status (JSON)": { expectedProcessingTime: 180 }, "Monitoring Intervals (JSON)": ["Quarterly"], "Last Updated": now, "Schema (JSON)": {}, "Properties (JSON)": {}, "Capabilities (JSON)": { SupportsOnDemandScanning: true }, "Maintenance Windows (JSON)": [], "Has Pass Through Fee": true },
    { "Name": "NPDB", "Type": "Npdb", "Tags (JSON)": ["Malpractice", "DisciplinaryActions"], "Parameter Sets (JSON)": [{ id: "npdb-param-set", entityType: "Practitioner", supportedParameterTypes: ["Name", "LicenseNumber"], requiredParameterTypes: ["Name", "LicenseNumber"] }], "Status (JSON)": { expectedProcessingTime: 300 }, "Monitoring Intervals (JSON)": ["Continuous"], "Last Updated": now, "Schema (JSON)": {}, "Properties (JSON)": {}, "Capabilities (JSON)": { SupportsContinuousMonitoring: true, SupportsOnDemandScanning: true }, "Maintenance Windows (JSON)": [], "Has Pass Through Fee": true }
  ];
  const mockDatasets = mapObjectsToRows(mockDatasetObjects, DATASETS_METADATA_HEADERS);
  sheet.getRange(2, 1, mockDatasets.length, mockDatasets[0].length).setValues(mockDatasets);
}

function populateMockPayers(sheet) {
  const mockPayerObjects = [
    { "ID": Utilities.getUuid(), "Name": "Aetna" },
    { "ID": Utilities.getUuid(), "Name": "Cigna" },
    { "ID": Utilities.getUuid(), "Name": "United Healthcare" }
  ];
  const mockPayers = mapObjectsToRows(mockPayerObjects, PAYERS_HEADERS);
  sheet.getRange(2, 1, mockPayers.length, mockPayers[0].length).setValues(mockPayers);
}

function populateMockCountries(sheet) {
  const now = new Date().toISOString();
  const mockCountryObjects = [
    { "ID": Utilities.getUuid(), "Name": "United States", "ISO Code": "US", "CreatedAt": now },
    { "ID": Utilities.getUuid(), "Name": "Canada", "ISO Code": "CA", "CreatedAt": now },
    { "ID": Utilities.getUuid(), "Name": "Mexico", "ISO Code": "MX", "CreatedAt": now }
  ];
  const mockCountries = mapObjectsToRows(mockCountryObjects, COUNTRIES_HEADERS);
  sheet.getRange(2, 1, mockCountries.length, mockCountries[0].length).setValues(mockCountries);
}