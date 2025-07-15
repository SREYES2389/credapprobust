/**
 * @fileoverview
 * This file contains all backend functions related to creating and managing Notes.
 */

/**
 * Creates a new note linked to a credentialing request.
 * @param {string} requestId The ID of the request the note belongs to.
 * @param {object} noteData The data for the new note (note).
 * @returns {object} A success or error message with the created note object.
 */
function addCredentialingRequestNote(requestId, noteData) {
    try {
        if (!requestId || !noteData || !noteData.note) {
            return { success: false, message: "Request ID and note text are required." };
        }
        const noteObject = { "Request ID": requestId, "Note": noteData.note, "User Email": Session.getActiveUser() ? Session.getActiveUser().getEmail() : 'Unknown', "Timestamp": new Date().toISOString() };
        const result = createEntity('notes', noteObject);
        if (result.success) { logAuditEvent("Request", `Note added to request ${requestId}`, { requestId: requestId, noteId: result.data.ID }); }
        return result;
    } catch (e) {
        logAuditEvent("Error", `Failed to add request note: ${e.message}`, { requestId });
        return { success: false, message: `Failed to add request note: ${e.message}` };
    }
}