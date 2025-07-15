/**
 * @fileoverview
 * Provides a centralized logging utility that writes to a dedicated sheet.
 */

const LOG_SHEET_NAME = 'AppLogs';

/**
 * Logs a message to the AppLogs sheet. Creates the sheet if it doesn't exist.
 * @param {string} level The log level (e.g., 'INFO', 'ERROR', 'WARN').
 * @param {string} message The message to log.
 * @param {object} [details={}] Optional object with additional details to log as a JSON string.
 */
function logMessage(level, message, details = {}) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let logSheet = ss.getSheetByName(LOG_SHEET_NAME);

    if (!logSheet) {
      logSheet = ss.insertSheet(LOG_SHEET_NAME);
      logSheet.appendRow(['Timestamp', 'Level', 'Message', 'User', 'Details']);
      logSheet.setFrozenRows(1);
    }
    
    const timestamp = new Date();
    const user = Session.getActiveUser().getEmail() || 'Anonymous';
    logSheet.appendRow([timestamp, level, message, user, JSON.stringify(details)]);
  } catch (e) {
    // Fallback to the built-in logger if we can't write to the sheet
    console.error(`Failed to write to log sheet. Original message: [${level}] ${message}. Error: ${e.message}`);
  }
}