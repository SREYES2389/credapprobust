/**
 * @fileoverview
 * Handles all security and authorization concerns for the application.
 */

// In a production app, store this list in Script Properties (Project Settings > Script Properties)
// to avoid hardcoding emails in the source code.
const ADMIN_USERS = ['admin1@yourdomain.com', 'admin2@yourdomain.com'];

/**
 * Checks if the current user is an authorized administrator.
 * @returns {boolean} True if the user is an admin.
 */
function isUserAdmin() {
  const email = Session.getActiveUser().getEmail();
  return ADMIN_USERS.includes(email);
}

/**
 * Verifies that the user accessing the web app is logged in and authorized.
 * This is a critical check for all data modification endpoints.
 * @throws {Error} If the user is not authorized.
 */
function authorizeUser() {
  const email = Session.getActiveUser().getEmail();

  // If your web app is deployed to be run by "Anyone" (even anonymous), `email` will be blank.
  // This check ensures that only authenticated users from your domain can proceed.
  if (!email) {
    throw new Error('Authorization Failed: Access is denied for anonymous users.');
  }
  // You could add more granular role-based checks here if needed.
}