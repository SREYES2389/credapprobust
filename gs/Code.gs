/**
 * @fileoverview
 * This file contains the main entry points for the Google Apps Script application,
 * including UI triggers (`onOpen`) and web app endpoints (`doGet`, `doPost`).
 * It delegates the core logic to other modules.
 */

/**
 * Creates a custom "Admin" menu in the spreadsheet UI.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Admin')
    .addItem('Setup All Sheets', 'setupSheets')
    .addItem('Validate Schemas', 'validateSchemas')
    .addItem('Add Mock Data', 'addMockData')
    .addToUi();
}

/**
 * Serves the HTML file for the web app.
 * Can also serve JSON data based on URL parameters.
 * @param {object} e The event parameter for a GET request.
 */
function doGet(e) {
  // API-like endpoint to get the master schema definition
  if (e && e.parameter && e.parameter.action === 'getSchemas') {
    return ContentService.createTextOutput(JSON.stringify(ENTITY_SCHEMAS))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Default to serving the web app UI
  return HtmlService
    .createHtmlOutputFromFile('index')
    .setTitle('Verifiable Data Management')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Handles POST requests to the web app, routing them to the webhook handler.
 * This is the entry point for all inbound webhooks.
 * @param {object} e The event parameter for a POST request.
 * @returns {ContentService.TextOutput} A JSON response.
 */
function doPost(e) {
  const response = routePostRequest(e);
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}