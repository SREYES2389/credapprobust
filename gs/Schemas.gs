/**
 * @fileoverview
 * This file contains the master schema for all data entities in the application.
 * It defines the sheet names, headers, and relationships between different data types.
 * This acts as the single source of truth for the application's data model.
 */

// --- Global Column Constants ---
const ID_COLUMN = "ID";
const DEACTIVATED_COLUMN = "Deactivated";
const USER_ACTION_NEEDED_COLUMN = "User Action Needed";
const HAS_PASS_THROUGH_FEE_COLUMN = "Has Pass Through Fee";
const JSON_SUFFIX = "(JSON)";

// --- Sheet Names and Headers ---
// Users
const USERS_SHEET_NAME = "Users";
const USERS_HEADERS = [ID_COLUMN, "Email", "First Name", "Last Name"];
const ROLES_SHEET_NAME = "Roles";
const ROLES_HEADERS = [ID_COLUMN, "Name"];
const PROVIDER_TYPES_SHEET_NAME = "ProviderTypes";
const PROVIDER_TYPES_HEADERS = [ID_COLUMN, "Name"];
const FACILITY_LICENSE_TYPES_SHEET_NAME = "FacilityLicenseTypes";
const FACILITY_LICENSE_TYPES_HEADERS = [ID_COLUMN, "Name"];
// Core
const PROVIDERS_SHEET_NAME = "Providers";
const PROVIDERS_HEADERS = [ID_COLUMN, "First Name", "Last Name", "NPI", "Next Credentialing Date", "Credentialing Status", DEACTIVATED_COLUMN];
const FACILITIES_SHEET_NAME = "Facilities";
const FACILITIES_HEADERS = [ID_COLUMN, "Name", "DBA", "Address Line 1", "Address Line 2", "City", "State", "Zip Code", "Phone Number", "Fax Number", "Group Tax ID", "Facility Tax ID", "Contact Name", "Contact Email", "Medicare Part A Number", "Medicare Part B Number", "Medicaid Number", DEACTIVATED_COLUMN];
const NOTES_SHEET_NAME = "Notes";
const NOTES_HEADERS = [ID_COLUMN, "Provider ID", "Facility ID", "Request ID", "Note", "Timestamp", "User Email", "Last Modified At", "Last Modified By"];
const FILES_SHEET_NAME = "Files";
const FILES_HEADERS = [ID_COLUMN, "Path", "Provider ID", "Facility ID", "Created At", "Created By User ID", "Created By User Email", "Size"];

// Provider Info
const ALIASES_SHEET_NAME = "Provider Aliases";
const ALIASES_HEADERS = [ID_COLUMN, "Provider ID", "First Name", "Last Name"];
const ADDRESSES_SHEET_NAME = "Provider Addresses";
const ADDRESSES_HEADERS = [ID_COLUMN, "Provider ID", "Address Line 1", "Address Line 2", "City", "State", "Zip Code", "Type"];
const EMAILS_SHEET_NAME = "Provider Emails";
const EMAILS_HEADERS = [ID_COLUMN, "Provider ID", "Email", "Type"];

// Facility Info
const FACILITY_SPECIALTIES_SHEET_NAME = "Facility Specialties";
const FACILITY_SPECIALTIES_HEADERS = [ID_COLUMN, "Facility ID", "Taxonomy ID"];
const FACILITY_TAXONOMIES_SHEET_NAME = "Facility Taxonomies";
const FACILITY_TAXONOMIES_HEADERS = [ID_COLUMN, "Code", "Name"];
const FACILITY_NPIS_SHEET_NAME = "Facility NPIs";
const FACILITY_NPIS_HEADERS = [ID_COLUMN, "Facility ID", "NPI", "Is Active"];
const FACILITY_LICENSES_SHEET_NAME = "Facility Licenses";
const FACILITY_LICENSES_HEADERS = [ID_COLUMN, "Facility ID", "License Type ID", "State", "License Number", "Is Primary", "Issue Date", "Expiration Date", "License Status"];

// Provider Profile Imports
const PROVIDER_PROFILE_IMPORTS_SHEET_NAME = "Provider Profile Imports";
const PROVIDER_PROFILE_IMPORTS_HEADERS = [ID_COLUMN, "Provider ID", "Source", "Status", "Started", "Completed", "Failure Code", "Failure Reason", "Profile Data (JSON)"];

// License Definitions
const LICENSE_TYPES_SHEET_NAME = "LicenseTypes";
const LICENSE_TYPES_HEADERS = [ID_COLUMN, "Taxonomy", "Name", "Aliases (JSON)", "Abbreviations (JSON)", "Sources (JSON)"];
// Licenses & Verifications
const LICENSES_SHEET_NAME = "Licenses";
const LICENSES_HEADERS = [ID_COLUMN, "Provider ID", "License Number", "First Name", "Last Name", "State", "Job Status", "Non Verified Issue Date", "Non Verified Expiration Date", "Non Verified Status", "Current Verification Status", "Current Verification ID", "Restriction Status", "Approved Status", "Is Primary", "Is Currently Practicing", "Prescriptive Authority", "Collaborating Provider ID", "License Type ID"];
const LICENSE_VERIFICATIONS_SHEET_NAME = "License Verifications";
const LICENSE_VERIFICATIONS_HEADERS = [ID_COLUMN, "License ID", "Provider ID", "Original Status", "Status", "Trigger", "Started", "Processing Time", "Results (JSON)", "Additional Parameters (JSON)", "Verification Source (JSON)", "Failure Reason (JSON)", "Correct Result Index", "Export Path", "Monitoring Metadata (JSON)"];
const LICENSE_SOURCE_STATUS_SHEET_NAME = "License Source Status";
const LICENSE_SOURCE_STATUS_HEADERS = ["License Type ID", "State", "Issue", "Average Processing Time", "Average Failure Rate"];

// Datasets
const DATASET_SCANS_SHEET_NAME = "Dataset Scans";
const DATASET_SCANS_HEADERS = [ID_COLUMN, "Type", "Provider ID", "Facility ID", "Status", "Started", "Completed", "Trigger", "Options (JSON)", "Failure Reason (JSON)", "Status Description (JSON)", "Parameters (JSON)", "Matches (JSON)", "Monitoring Metadata (JSON)", "Verified At", "Dataset Metadata (JSON)"];
const DATASET_MATCHES_SHEET_NAME = "Dataset Matches";
const DATASET_MATCHES_HEADERS = [ID_COLUMN, "Dataset Timestamp", "Record Timestamp", "Data (JSON)", "Scan ID", USER_ACTION_NEEDED_COLUMN, "Is Ignored", "Match Score (JSON)", "User Action Resolution", "User Action Resolution Note", "Match Relevance", "Created Timestamp", "Obsolete Timestamp"];
const DATASETS_METADATA_SHEET_NAME = "Datasets Metadata";
const DATASETS_METADATA_HEADERS = ["Name", "Type", "Tags (JSON)", "Parameter Sets (JSON)", "Supported Entity Types (JSON)", "Status (JSON)", "Monitoring Intervals (JSON)", "Last Updated", "Schema (JSON)", "Properties (JSON)", "Capabilities (JSON)", "Maintenance Windows (JSON)", HAS_PASS_THROUGH_FEE_COLUMN];

// Groups, Payers, Enrollments
const GROUPS_SHEET_NAME = "Groups";
const GROUPS_HEADERS = [ID_COLUMN, "Name", "NPI", "Tax ID", "Remit Address (JSON)"];
const GROUP_PROVIDERS_SHEET_NAME = "GroupProviders";
const GROUP_PROVIDERS_HEADERS = ["Group ID", "Provider ID"];
const PAYERS_SHEET_NAME = "Payers";
const PAYERS_HEADERS = [ID_COLUMN, "Name"];
const GROUP_PAYERS_SHEET_NAME = "GroupPayers";
const GROUP_PAYERS_HEADERS = ["Group ID", "Payer ID"];
const PAYER_PLANS_SHEET_NAME = "PayerPlans";
const PAYER_PLANS_HEADERS = [ID_COLUMN, "Payer ID", "Name", "State"];
const PROVIDER_ENROLLMENTS_SHEET_NAME = "ProviderEnrollments";
const PROVIDER_ENROLLMENTS_HEADERS = [ID_COLUMN, "Group ID", "Payer Plan ID", "Provider ID", "Effective Date", "Enrollment Status", "Network Status", "Specialist Type", "Submission Date", "Closed Date", "External Provider Plan ID", "Comments"];

// Credentialing
const CREDENTIALING_REQUESTS_SHEET_NAME = "CredentialingRequests";
const CREDENTIALING_REQUESTS_HEADERS = [ID_COLUMN, "Provider ID", "Facility ID", "Type", "Priority", "Status", "Owner", "CreatedAt", "Current Event (JSON)"];
const CREDENTIALING_REQUEST_EVENTS_SHEET_NAME = "CredentialingRequestEvents";
const CREDENTIALING_REQUEST_EVENTS_HEADERS = [ID_COLUMN, "Request ID", "Timestamp", "Status", "Note", "User", "Attachments (JSON)"];
const CREDENTIALING_CHECKLIST_ITEMS_SHEET_NAME = "CredentialingChecklistItems";
const CREDENTIALING_CHECKLIST_ITEMS_HEADERS = [ID_COLUMN, "Request ID", "Name", "Status", "Confirmed At", "Confirmed By", "Verified At", "Source", "References (JSON)"];

// Monitoring & Alerts
const MONITORS_SHEET_NAME = "Monitors";
const MONITORS_HEADERS = [ID_COLUMN, "Type", "Provider ID", "Dataset Type", "License ID", "Monitoring Interval", "Next Monitoring Date", "Last Monitoring Date", "Last Verification ID", "Options (JSON)"];
const ALERTS_SHEET_NAME = "Alerts";
const ALERTS_HEADERS = [ID_COLUMN, "Provider ID", "Facility ID", "Type", "Entity Type", "Entity ID", "Timestamp", "Dismissal Timestamp", "Dismissal Note", "Data (JSON)"];

// System & Integrations
const WEBHOOKS_SHEET_NAME = "Webhooks";
const WEBHOOKS_HEADERS = [ID_COLUMN, "Type", "URL", "Secret", "Allow Insecure URL", "Include Sensitive Info"];
const WEBHOOK_LOGS_SHEET_NAME = "WebhookLogs";
const WEBHOOK_LOGS_HEADERS = [ID_COLUMN, "Webhook ID", "Timestamp", "Status", "Payload (JSON)", "Response Status"];
const AUDIT_EVENTS_SHEET_NAME = "AuditEvents";
const AUDIT_EVENTS_HEADERS = [ID_COLUMN, "Timestamp", "Type", "Message", "Correlation ID", "Context (JSON)"]
const REPORTS_SHEET_NAME = "Reports";
const REPORTS_HEADERS = [ID_COLUMN, "Provider ID", "Facility ID", "Type", "Status", "StartedAt", "CompletedAt", "Path"];

// Definitions Models
const COUNTRIES_SHEET_NAME = "Countries";
const COUNTRIES_HEADERS = [ID_COLUMN, "Name", "ISO Code", "CreatedAt"];
const NOTE_HISTORY_SHEET_NAME = "NoteHistory";
const NOTE_HISTORY_HEADERS = ["History ID", "Note ID", "Old Note Text", "Timestamp", "User Email"];

// Detailed Provider Info
const PROVIDER_EDUCATION_SHEET_NAME = "ProviderEducation";
const PROVIDER_EDUCATION_HEADERS = [ID_COLUMN, "Provider ID", "School Name", "Degree", "Graduate Type", "Start Date", "End Date"];
const PROVIDER_TRAINING_SHEET_NAME = "ProviderTraining";
const PROVIDER_TRAINING_HEADERS = [ID_COLUMN, "Provider ID", "Institution Name", "Speciality", "Training Type", "Start Date", "End Date"];
const PROVIDER_WORK_HISTORY_SHEET_NAME = "ProviderWorkHistory";
const PROVIDER_WORK_HISTORY_HEADERS = [ID_COLUMN, "Provider ID", "Name", "Job Title", "Start Date", "End Date", "Is Current Employer"];
const PROVIDER_BOARD_CERTIFICATIONS_SHEET_NAME = "ProviderBoardCertifications";
const PROVIDER_BOARD_CERTIFICATIONS_HEADERS = [ID_COLUMN, "Provider ID", "Type", "Specialty", "Initial Certification Date", "Expiration Date"];
const PROVIDER_DEA_REGISTRATIONS_SHEET_NAME = "ProviderDeaRegistrations";
const PROVIDER_DEA_REGISTRATIONS_HEADERS = [ID_COLUMN, "Provider ID", "Registration Number", "Last Updated At"];
const PROVIDER_CERTIFICATES_SHEET_NAME = "ProviderCertificates";
const PROVIDER_CERTIFICATES_HEADERS = [ID_COLUMN, "Provider ID", "Type", "Certificate Number", "First Name", "Last Name", "Issue Date", "Expiration Date", "Certifying Organization"];
const PROVIDER_CAQH_INFO_SHEET_NAME = "ProviderCaqhInfo";
const PROVIDER_CAQH_INFO_HEADERS = [ID_COLUMN, "Provider ID", "CAQH ID", "Last Updated At"];
const PROVIDER_LIABILITY_INSURANCE_SHEET_NAME = "ProviderLiabilityInsurance";
const PROVIDER_LIABILITY_INSURANCE_HEADERS = [ID_COLUMN, "Provider ID", "Name", "Is Self Insured", "Original Effective Date", "Current Effective Date", "Current Expiration Date", "Coverage Type", "Is Unlimited Coverage", "Includes Tail Coverage", "Occurrence Coverage Amount", "Aggregate Coverage Amount", "Policy Number"];
const PROVIDER_PROFILE_IMPORT_SOURCES_SHEET_NAME = "ProviderProfileImportSources";
const PROVIDER_PROFILE_IMPORT_SOURCES_HEADERS = ["Source", "Name", "Required Parameters (JSON)", HAS_PASS_THROUGH_FEE_COLUMN, "Supports Re-import"];

// Detailed Facility Info
const FACILITY_ACCREDITATIONS_SHEET_NAME = "FacilityAccreditations";
const FACILITY_ACCREDITATIONS_HEADERS = [ID_COLUMN, "Facility ID", "Agency", "Program", "Decision", "Effective Date", "Expiration Date"];
const FACILITY_CMS_CERTIFICATIONS_SHEET_NAME = "FacilityCmsCertifications";
const FACILITY_CMS_CERTIFICATIONS_HEADERS = [ID_COLUMN, "Facility ID", "Certification Number", "Certification Date"];
const FACILITY_DEAS_SHEET_NAME = "FacilityDeas";
const FACILITY_DEAS_HEADERS = [ID_COLUMN, "Facility ID", "DEA Number", "Drug Schedules", "State", "Expiration Date", "Business Activity Code", "Payment Indicator", "Is Active"];
const FACILITY_LIABILITY_INSURANCE_SHEET_NAME = "FacilityLiabilityInsurance";
const FACILITY_LIABILITY_INSURANCE_HEADERS = [ID_COLUMN, "Facility ID", "Name", "Is Self Insured", "Original Effective Date", "Current Effective Date", "Current Expiration Date", "Coverage Type", "Is Unlimited Coverage", "Includes Tail Coverage", "Occurrence Coverage Amount", "Aggregate Coverage Amount", "Policy Number"];
const FACILITY_PROFILE_IMPORT_SOURCES_SHEET_NAME = "FacilityProfileImportSources";
const FACILITY_PROFILE_IMPORT_SOURCES_HEADERS = ["Source", "Name", "Required Parameters (JSON)", HAS_PASS_THROUGH_FEE_COLUMN, "Supports Re-import"];
const FACILITY_MEDICARE_ENROLLMENTS_SHEET_NAME = "FacilityMedicareEnrollments";
const FACILITY_MEDICARE_ENROLLMENTS_HEADERS = [ID_COLUMN, "Facility ID", "Medicare Number", "Effective Date", "Termination Date", "Enrollment Status"];


/**
 * The master schema defining entities and their relationships.
 * Each top-level key represents a primary entity (e.g., "Providers").
 * 'children' is an array of sheets that are related to the primary entity.
 * 'parentIdColumn' is the name of the column in the child sheet that links back to the parent's ID.
 */
const ENTITY_SCHEMAS = {
    "Providers": {
        sheetName: PROVIDERS_SHEET_NAME,
        headers: PROVIDERS_HEADERS,
        children: [
            { key: 'aliases', sheetName: ALIASES_SHEET_NAME, headers: ALIASES_HEADERS, parentIdColumn: "Provider ID" },
            { key: 'addresses', sheetName: ADDRESSES_SHEET_NAME, headers: ADDRESSES_HEADERS, parentIdColumn: "Provider ID" },
            { key: 'emails', sheetName: EMAILS_SHEET_NAME, headers: EMAILS_HEADERS, parentIdColumn: "Provider ID" },
            { key: 'licenses', sheetName: LICENSES_SHEET_NAME, headers: LICENSES_HEADERS, parentIdColumn: "Provider ID" },
            { key: 'education', sheetName: PROVIDER_EDUCATION_SHEET_NAME, headers: PROVIDER_EDUCATION_HEADERS, parentIdColumn: "Provider ID" },
            { key: 'training', sheetName: PROVIDER_TRAINING_SHEET_NAME, headers: PROVIDER_TRAINING_HEADERS, parentIdColumn: "Provider ID" },
            { key: 'workHistory', sheetName: PROVIDER_WORK_HISTORY_SHEET_NAME, headers: PROVIDER_WORK_HISTORY_HEADERS, parentIdColumn: "Provider ID" },
            { key: 'boardCertifications', sheetName: PROVIDER_BOARD_CERTIFICATIONS_SHEET_NAME, headers: PROVIDER_BOARD_CERTIFICATIONS_HEADERS, parentIdColumn: "Provider ID" },
            { key: 'deaRegistrations', sheetName: PROVIDER_DEA_REGISTRATIONS_SHEET_NAME, headers: PROVIDER_DEA_REGISTRATIONS_HEADERS, parentIdColumn: "Provider ID" },
            { key: 'certificates', sheetName: PROVIDER_CERTIFICATES_SHEET_NAME, headers: PROVIDER_CERTIFICATES_HEADERS, parentIdColumn: "Provider ID" },
            { key: 'caqhInfo', sheetName: PROVIDER_CAQH_INFO_SHEET_NAME, headers: PROVIDER_CAQH_INFO_HEADERS, parentIdColumn: "Provider ID" },
            { key: 'liabilityInsurances', sheetName: PROVIDER_LIABILITY_INSURANCE_SHEET_NAME, headers: PROVIDER_LIABILITY_INSURANCE_HEADERS, parentIdColumn: "Provider ID" },
            { key: 'enrollments', sheetName: PROVIDER_ENROLLMENTS_SHEET_NAME, headers: PROVIDER_ENROLLMENTS_HEADERS, parentIdColumn: "Provider ID" },
            { key: 'alerts', sheetName: ALERTS_SHEET_NAME, headers: ALERTS_HEADERS, parentIdColumn: "Provider ID" },
            { key: 'files', sheetName: FILES_SHEET_NAME, headers: FILES_HEADERS, parentIdColumn: "Provider ID" },
            { key: 'notes', sheetName: NOTES_SHEET_NAME, headers: NOTES_HEADERS, parentIdColumn: "Provider ID" },
            { key: 'imports', sheetName: PROVIDER_PROFILE_IMPORTS_SHEET_NAME, headers: PROVIDER_PROFILE_IMPORTS_HEADERS, parentIdColumn: "Provider ID" },
            { key: 'scans', sheetName: DATASET_SCANS_SHEET_NAME, headers: DATASET_SCANS_HEADERS, parentIdColumn: "Provider ID" },
            { key: 'requests', sheetName: CREDENTIALING_REQUESTS_SHEET_NAME, headers: CREDENTIALING_REQUESTS_HEADERS, parentIdColumn: "Provider ID" },
            { key: 'monitors', sheetName: MONITORS_SHEET_NAME, headers: MONITORS_HEADERS, parentIdColumn: "Provider ID" },
            { key: 'verifications', sheetName: LICENSE_VERIFICATIONS_SHEET_NAME, headers: LICENSE_VERIFICATIONS_HEADERS, parentIdColumn: "Provider ID" },
            { key: 'groupLinks', sheetName: GROUP_PROVIDERS_SHEET_NAME, headers: GROUP_PROVIDERS_HEADERS, parentIdColumn: "Provider ID" },
        ]
    },
    "Facilities": {
        sheetName: FACILITIES_SHEET_NAME,
        headers: FACILITIES_HEADERS,
        children: [
            { key: 'licenses', sheetName: FACILITY_LICENSES_SHEET_NAME, headers: FACILITY_LICENSES_HEADERS, parentIdColumn: 'Facility ID' },
            { key: 'npis', sheetName: FACILITY_NPIS_SHEET_NAME, headers: FACILITY_NPIS_HEADERS, parentIdColumn: 'Facility ID' },
            { key: 'deas', sheetName: FACILITY_DEAS_SHEET_NAME, headers: FACILITY_DEAS_HEADERS, parentIdColumn: 'Facility ID' },
            { key: 'liabilityInsurances', sheetName: FACILITY_LIABILITY_INSURANCE_SHEET_NAME, headers: FACILITY_LIABILITY_INSURANCE_HEADERS, parentIdColumn: 'Facility ID' },
            { key: 'accreditations', sheetName: FACILITY_ACCREDITATIONS_SHEET_NAME, headers: FACILITY_ACCREDITATIONS_HEADERS, parentIdColumn: 'Facility ID' },
            { key: 'cmsCertifications', sheetName: FACILITY_CMS_CERTIFICATIONS_SHEET_NAME, headers: FACILITY_CMS_CERTIFICATIONS_HEADERS, parentIdColumn: 'Facility ID' },
            { key: 'medicareEnrollments', sheetName: FACILITY_MEDICARE_ENROLLMENTS_SHEET_NAME, headers: FACILITY_MEDICARE_ENROLLMENTS_HEADERS, parentIdColumn: 'Facility ID' },
            { key: 'files', sheetName: FILES_SHEET_NAME, headers: FILES_HEADERS, parentIdColumn: 'Facility ID' },
            { key: 'notes', sheetName: NOTES_SHEET_NAME, headers: NOTES_HEADERS, parentIdColumn: 'Facility ID' },
            { key: 'specialties', sheetName: FACILITY_SPECIALTIES_SHEET_NAME, headers: FACILITY_SPECIALTIES_HEADERS, parentIdColumn: 'Facility ID' },
            { key: 'scans', sheetName: DATASET_SCANS_SHEET_NAME, headers: DATASET_SCANS_HEADERS, parentIdColumn: 'Facility ID' }
        ]
    },
    "CredentialingRequests": {
        sheetName: CREDENTIALING_REQUESTS_SHEET_NAME,
        headers: CREDENTIALING_REQUESTS_HEADERS,
        children: [
            { key: 'allEvents', sheetName: CREDENTIALING_REQUEST_EVENTS_SHEET_NAME, headers: CREDENTIALING_REQUEST_EVENTS_HEADERS, parentIdColumn: 'Request ID' },
            { key: 'checklistItems', sheetName: CREDENTIALING_CHECKLIST_ITEMS_SHEET_NAME, headers: CREDENTIALING_CHECKLIST_ITEMS_HEADERS, parentIdColumn: 'Request ID' },
            { key: 'notes', sheetName: NOTES_SHEET_NAME, headers: NOTES_HEADERS, parentIdColumn: 'Request ID' }
            // Note: Attachments are part of events, not a direct child of the request itself.
        ]
    },
    "Reports": {
        sheetName: REPORTS_SHEET_NAME,
        headers: REPORTS_HEADERS,
        children: [] // Reports are records of generation, not parents of other entities.
    },
    "Datasets": { // This represents the metadata of available datasets
        sheetName: DATASETS_METADATA_SHEET_NAME,
        headers: DATASETS_METADATA_HEADERS,
        children: [] // No children for dataset metadata itself
    },
    "DatasetScans": {
        sheetName: DATASET_SCANS_SHEET_NAME,
        headers: DATASET_SCANS_HEADERS,
        children: [
            { key: 'matches', sheetName: DATASET_MATCHES_SHEET_NAME, headers: DATASET_MATCHES_HEADERS, parentIdColumn: 'Scan ID' }
        ]
    },
    "Monitors": {
        sheetName: MONITORS_SHEET_NAME,
        headers: MONITORS_HEADERS,
        children: [] // Monitors are records, not parents of other entities.
    },
    "Alerts": {
        sheetName: ALERTS_SHEET_NAME,
        headers: ALERTS_HEADERS,
        children: [] // Alerts are records, not parents of other entities.
    },
    "Licenses": {
        sheetName: LICENSES_SHEET_NAME,
        headers: LICENSES_HEADERS,
        children: [
            { key: 'verifications', sheetName: LICENSE_VERIFICATIONS_SHEET_NAME, headers: LICENSE_VERIFICATIONS_HEADERS, parentIdColumn: 'License ID' }
        ]
    },
    "LicenseTypes": {
        sheetName: LICENSE_TYPES_SHEET_NAME,
        headers: LICENSE_TYPES_HEADERS,
        children: []
    },
    "Users": {
        sheetName: USERS_SHEET_NAME,
        headers: USERS_HEADERS,
        children: []
    },
    "Roles": {
        sheetName: ROLES_SHEET_NAME,
        headers: ROLES_HEADERS,
        children: []
    },
    "ProviderTypes": {
        sheetName: PROVIDER_TYPES_SHEET_NAME,
        headers: PROVIDER_TYPES_HEADERS,
        children: []
    },
    "FacilityLicenseTypes": {
        sheetName: FACILITY_LICENSE_TYPES_SHEET_NAME,
        headers: FACILITY_LICENSE_TYPES_HEADERS,
        children: []
    },
    "FacilityTaxonomies": {
        sheetName: FACILITY_TAXONOMIES_SHEET_NAME,
        headers: FACILITY_TAXONOMIES_HEADERS,
        children: []
    },
    "Countries": {
        sheetName: COUNTRIES_SHEET_NAME,
        headers: COUNTRIES_HEADERS,
        children: []
    },
    "Webhooks": {
        sheetName: WEBHOOKS_SHEET_NAME,
        headers: WEBHOOKS_HEADERS,
        children: [
            { key: 'logs', sheetName: WEBHOOK_LOGS_SHEET_NAME, headers: WEBHOOK_LOGS_HEADERS, parentIdColumn: 'Webhook ID' }
        ]
    },
    "AuditEvents": {
        sheetName: AUDIT_EVENTS_SHEET_NAME,
        headers: AUDIT_EVENTS_HEADERS,
        children: []
    },
    "ProviderProfileImportSources": {
        sheetName: PROVIDER_PROFILE_IMPORT_SOURCES_SHEET_NAME,
        headers: PROVIDER_PROFILE_IMPORT_SOURCES_HEADERS,
        children: []
    },
    "FacilityProfileImportSources": {
        sheetName: FACILITY_PROFILE_IMPORT_SOURCES_SHEET_NAME,
        headers: FACILITY_PROFILE_IMPORT_SOURCES_HEADERS,
        children: []
    },
    "Files": {
        sheetName: FILES_SHEET_NAME,
        headers: FILES_HEADERS,
        children: []
    },
    "Groups": {
        sheetName: GROUPS_SHEET_NAME,
        headers: GROUPS_HEADERS,
        children: [
            { key: 'providers', sheetName: GROUP_PROVIDERS_SHEET_NAME, headers: GROUP_PROVIDERS_HEADERS, parentIdColumn: 'Group ID' },
            { key: 'payers', sheetName: GROUP_PAYERS_SHEET_NAME, headers: GROUP_PAYERS_HEADERS, parentIdColumn: 'Group ID' }
        ]
    },
    "Payers": {
        sheetName: PAYERS_SHEET_NAME,
        headers: PAYERS_HEADERS,
        children: [
            { key: 'plans', sheetName: PAYER_PLANS_SHEET_NAME, headers: PAYER_PLANS_HEADERS, parentIdColumn: 'Payer ID' }
        ]
    }
};


/**
 * Dynamically generates the list of all sheet definitions from the ENTITY_SCHEMAS
 * and a list of standalone sheets. This ensures a single source of truth and
 * prevents definitions from getting out of sync.
 * @returns {Array<object>} A comprehensive list of all sheet definitions.
 */
function getAllSheetDefinitions() {
    const allSheets = new Map();

    // Add all primary and child sheets from ENTITY_SCHEMAS
    for (const key in ENTITY_SCHEMAS) {
        const schema = ENTITY_SCHEMAS[key];
        if (schema.sheetName && !allSheets.has(schema.sheetName)) {
            allSheets.set(schema.sheetName, { name: schema.sheetName, headers: schema.headers });
        }
        if (schema.children) {
            schema.children.forEach(child => {
                if (child.sheetName && !allSheets.has(child.sheetName)) {
                    allSheets.set(child.sheetName, { name: child.sheetName, headers: child.headers });
                }
            });
        }
    }

    // Manually add any sheets that are not part of the ENTITY_SCHEMAS relationships.
    // This list should be small.
    const standaloneSheets = [
        { name: LICENSE_SOURCE_STATUS_SHEET_NAME, headers: LICENSE_SOURCE_STATUS_HEADERS },
        { name: NOTE_HISTORY_SHEET_NAME, headers: NOTE_HISTORY_HEADERS },
    ];

    standaloneSheets.forEach(def => {
        if (!allSheets.has(def.name)) {
            allSheets.set(def.name, def);
        }
    });

    return Array.from(allSheets.values());
}

const ALL_SHEET_DEFINITIONS = getAllSheetDefinitions();