// Shared community list on a static host (free Firebase Firestore, no server needed). These values are public by design.
// Set both to "" to disable and fall back to local-only storage.
export const FIREBASE = { projectId: "mythfall-builds", apiKey: "AIzaSyAnNKcG-qjZNNCsa14QvFeqx52ce1lAIGk" };

// Admin sign-in for deleting community builds (needs the Firebase admin user from README). The password is whatever you type (only its hash is in main.js), so it is not stored in this file.
export const ADMIN_EMAIL = "admin@mythskillbuilder.app";
