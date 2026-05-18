const { sendSuccess, sendError } = require('../utils/apiResponse');
const analyticsService = require('../services/analytics.service');

const getDashboard = async (req, res) => {
  try {
    const data = await analyticsService.getDashboardMetrics(req.query, req.orgFilter);
    return sendSuccess(res, data, 'Dashboard metrics retrieved');
  } catch (err) {
    return sendError(res, err.message, err.statusCode || 500);
  }
};

const getCampaignAnalytics = async (req, res) => {
  try {
    const data = await analyticsService.getCampaignAnalytics(req.params.id, req.orgFilter);
    return sendSuccess(res, data, 'Campaign analytics retrieved');
  } catch (err) {
    return sendError(res, err.message, err.statusCode || 500);
  }
};

const getIndustryAnalytics = async (req, res) => {
  try {
    const data = await analyticsService.getIndustryAnalytics(req.orgFilter);
    return sendSuccess(res, data, 'Industry analytics retrieved');
  } catch (err) {
    return sendError(res, err.message, err.statusCode || 500);
  }
};

const getTrends = async (req, res) => {
  try {
    const data = await analyticsService.getTrends(req.query, req.orgFilter);
    return sendSuccess(res, data, 'Trends retrieved');
  } catch (err) {
    return sendError(res, err.message, err.statusCode || 500);
  }
};

const getCampaignSummary = async (req, res) => {
  try {
    const data = await analyticsService.getCampaignSummary(req.orgFilter);
    return sendSuccess(res, data, 'Campaign summary retrieved');
  } catch (err) {
    return sendError(res, err.message, err.statusCode || 500);
  }
};

const generateReport = async (req, res) => {
  try {
    const data = await analyticsService.generateReport(req.body, req.query.format);
    return sendSuccess(res, data, 'Report generated');
  } catch (err) {
    return sendError(res, err.message, err.statusCode || 500);
  }
};

const getContactEngagement = async (req, res) => {
  try {
    const data = await analyticsService.getContactEngagement(req.params.contactId, req.orgFilter);
    return sendSuccess(res, data, 'Contact engagement retrieved');
  } catch (err) {
    return sendError(res, err.message, err.statusCode || 500);
  }
};

const getMessageStatusBreakdown = async (req, res) => {
  try {
    const data = await analyticsService.getMessageStatusBreakdown(req.orgFilter);
    return sendSuccess(res, data, 'Message status breakdown retrieved');
  } catch (err) {
    return sendError(res, err.message, err.statusCode || 500);
  }
};

module.exports = {
  getDashboard,
  getCampaignAnalytics,
  getIndustryAnalytics,
  getTrends,
  getCampaignSummary,
  generateReport,
  getContactEngagement,
  getMessageStatusBreakdown,
};
