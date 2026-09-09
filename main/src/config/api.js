// Single source of truth for the backend API URL.
// Set VITE_API_URL in your .env file to point at a different backend
// (e.g. your deployed Render URL) without editing any code.
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
