import api from './api';

const analyticsService = {
  /**
   * Get platform-wide dashboard metrics.
   * @param {Object} [params] Optional query params (e.g. timeframe)
   */
  getDashboardMetrics: async (params = {}) => {
    const response = await api.get('/analytics/dashboard', { params });
    return response.data?.data ?? response.data;
  },

  /**
   * Get industry breakdown analytics.
   */
  getIndustryAnalytics: async () => {
    const response = await api.get('/analytics/industry');
    return response.data?.data ?? response.data;
  },

  getTrends: async (days = 30) => {
    const response = await api.get('/analytics/trends', { params: { days } });
    return response.data?.data ?? response.data;
  },

  getCampaignSummary: async () => {
    const response = await api.get('/analytics/summary');
    return response.data?.data ?? response.data;
  },

  /**
   * Get detailed analytics report for a specific campaign.
   * @param {string} campaignId
   */
  getCampaignReport: async (campaignId) => {
    const response = await api.get(`/analytics/campaign/${campaignId}`);
    return response.data?.data ?? response.data;
  },

  /**
   * Export campaign report as CSV.
   * @param {string} campaignId
   */
  exportCampaignReport: async (campaignId) => {
    const response = await api.get(`/analytics/campaign/${campaignId}/export`, {
      responseType: 'blob', // Important for file downloads
    });
    return response.data;
  },
  /**
   * Get full Twilio message status breakdown (queued, sent, delivered, read, replied, failed)
   * with engagement rate, read rate, and reply rate.
   */
  getMessageStatusBreakdown: async () => {
    const response = await api.get('/analytics/message-status');
    return response.data?.data ?? response.data;
  },
};

export default analyticsService;
