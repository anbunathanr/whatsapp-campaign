// Campaign service - API calls for campaign management
import api from './api';

const campaignService = {
  /**
   * Fetch a paginated, filtered list of campaigns.
   * @param {Object} params - Query parameters
   * @param {number}  [params.page]
   * @param {number}  [params.limit]
   * @param {string}  [params.sortBy]
   * @param {string}  [params.sortOrder]
   * @param {string}  [params.status]
   * @param {string}  [params.type]
   * @param {string}  [params.search]
   * @param {string}  [params.startDate]
   * @param {string}  [params.endDate]
   * @returns {Promise<{ campaigns: Object[], pagination: Object }>}
   */
  getCampaigns: async (params = {}) => {
    // _t busts the browser HTTP cache so newly-added campaigns appear immediately
    const response = await api.get('/campaigns', { params: { ...params, _t: Date.now() } });
    return response.data.data ?? response.data;
  },

  /**
   * Fetch a single campaign by ID.
   * @param {string} id
   * @returns {Promise<Object>}
   */
  getCampaign: async (id) => {
    const response = await api.get(`/campaigns/${id}`);
    return response.data.data?.campaign ?? response.data;
  },

  /**
   * Create a new campaign.
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  createCampaign: async (data) => {
    const response = await api.post('/campaigns', data);
    return response.data.data?.campaign ?? response.data;
  },

  /**
   * Update an existing campaign (only draft or scheduled).
   * @param {string} id
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  updateCampaign: async (id, data) => {
    const response = await api.put(`/campaigns/${id}`, data);
    return response.data.data?.campaign ?? response.data;
  },

  /**
   * Archive (soft-delete) a campaign.
   * @param {string} id
   * @returns {Promise<Object>}
   */
  archiveCampaign: async (id) => {
    const response = await api.delete(`/campaigns/${id}`);
    return response.data.data?.campaign ?? response.data;
  },

  /**
   * Clone an existing campaign.
   * @param {string} id
   * @returns {Promise<Object>}
   */
  cloneCampaign: async (id) => {
    const response = await api.post(`/campaigns/${id}/clone`);
    return response.data.data?.campaign ?? response.data;
  },

  /**
   * Schedule a campaign for future execution.
   * @param {string} id
   * @param {string} scheduledAt - ISO 8601 UTC date string
   * @returns {Promise<Object>}
   */
  scheduleCampaign: async (id, scheduledAt) => {
    const response = await api.post(`/campaigns/${id}/schedule`, { scheduledAt });
    return response.data.data?.campaign ?? response.data;
  },

  /**
   * Get a rendered preview of the campaign message template.
   * @param {string} id
   * @returns {Promise<Object>}
   */
  previewCampaign: async (id) => {
    const response = await api.get(`/campaigns/${id}/preview`);
    return response.data.data ?? response.data;
  },

  /**
   * Upload a media file (standalone, not attached to a campaign).
   * @param {File} file
   * @returns {Promise<{ url, filename, mimetype, size }>}
   */
  uploadMedia: async (file) => {
    const formData = new FormData();
    formData.append('media', file);
    const response = await api.post('/campaigns/media', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },

  /**
   * Attach a media file to a specific campaign.
   * @param {string} campaignId
   * @param {File} file
   * @returns {Promise<Object>} Updated campaign
   */
  attachMedia: async (campaignId, file) => {
    const formData = new FormData();
    formData.append('media', file);
    const response = await api.post(`/campaigns/${campaignId}/media`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data?.campaign ?? response.data;
  },

  /**
   * Execute a campaign immediately.
   * @param {string} id
   * @returns {Promise<Object>}
   */
  executeCampaign: async (id) => {
    const response = await api.post(`/campaigns/${id}/execute`);
    return response.data.data ?? response.data;
  },

  /**
   * Cancel a scheduled campaign.
   * @param {string} id
   * @returns {Promise<Object>}
   */
  cancelCampaign: async (id) => {
    const response = await api.post(`/campaigns/${id}/cancel`);
    return response.data.data ?? response.data;
  },

  /**
   * Get the live delivery status of a campaign.
   * @param {string} id
   * @returns {Promise<Object>}
   */
  getCampaignStatus: async (id) => {
    const response = await api.get(`/campaigns/${id}/status`);
    return response.data.data ?? response.data;
  },

  /**
   * Request AI-powered "Best Time to Send" recommendations from the ML service.
   * @param {Object} params
   * @param {string} [params.industry]
   * @param {string} [params.type]
   * @returns {Promise<{ recommendations: Array, note: string, mlAvailable: boolean }>}
   */
  getBestTimeToSend: async (params = {}) => {
    const response = await api.get('/campaigns/best-time', { params });
    return response.data.data ?? response.data;
  },
};

export default campaignService;
