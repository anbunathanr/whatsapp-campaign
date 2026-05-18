// Authentication service - handles all auth-related API calls
import api from './api';

const authService = {
  /**
   * Log in with email and password.
   * Returns { token, user } on success.
   */
  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  /**
   * Register a new user account.
   * Returns { token, user } on success.
   */
  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  /**
   * Fetch the currently authenticated user's profile.
   * Requires a valid JWT token in localStorage.
   */
  getMe: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },

  /**
   * Fetch the current user's Twilio API credentials.
   */
  getCredentials: async () => {
    const response = await api.get('/auth/me/credentials');
    return response.data;
  },

  /**
   * Update the current user's Twilio API credentials.
   */
  updateCredentials: async (credentials) => {
    const response = await api.put('/auth/me/credentials', credentials);
    return response.data;
  },
};

export default authService;
