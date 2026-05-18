/**
 * Analytics Service
 * Calculates dashboard metrics, campaign analytics, industry comparisons, and report generation.
 * Full implementation: Tasks 7.1 – 7.4
 */

const Campaign = require('../models/Campaign');
const Contact = require('../models/Contact');
const Message = require('../models/Message');

const getDashboardMetrics = async (dateRange = {}, orgFilter = {}) => {
  const { startDate, endDate } = dateRange;
  const match = { ...orgFilter };
  if (startDate) {match.createdAt = { $gte: new Date(startDate) };}
  if (endDate) {
    match.createdAt = match.createdAt || {};
    match.createdAt.$lte = new Date(endDate);
  }

  const [totalContacts, campaignsAgg, messageAgg] = await Promise.all([
    Contact.countDocuments(match),
    Campaign.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    Message.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ])
  ]);

  const campaignsByStatus = campaignsAgg.reduce((acc, curr) => {
    acc[curr._id] = curr.count;
    return acc;
  }, {});
  const totalCampaigns = campaignsAgg.reduce((sum, curr) => sum + curr.count, 0);

  const messagesByStatus = messageAgg.reduce((acc, curr) => {
    acc[curr._id] = curr.count;
    return acc;
  }, {});
  const totalMessages = messageAgg.reduce((sum, curr) => sum + curr.count, 0);

  return {
    totalContacts,
    totalCampaigns,
    campaignsByStatus,
    totalMessages,
    messagesByStatus
  };
};

const getCampaignAnalytics = async (campaignId, orgFilter = {}) => {
  const campaign = await Campaign.findOne({ _id: campaignId, ...orgFilter }).lean();
  if (!campaign) {throw Object.assign(new Error('Campaign not found'), { statusCode: 404 });}

  const messages = await Message.aggregate([
    { $match: { campaign: campaign._id, ...orgFilter } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  const stats = messages.reduce((acc, curr) => {
    acc[curr._id] = curr.count;
    return acc;
  }, {});

  return { campaign, stats };
};

const getIndustryAnalytics = async (orgFilter = {}) => {
  const industryStats = await Contact.aggregate([
    { $match: orgFilter },
    { $group: { _id: '$industry', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  return industryStats.map(stat => ({ industry: stat._id, count: stat.count }));
};

const getTrends = async (dateRange = {}, orgFilter = {}) => {
  const days = parseInt(dateRange.days, 10) || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const trend = await Message.aggregate([
    { $match: { createdAt: { $gte: since }, ...orgFilter } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        sent:      { $sum: { $cond: [{ $eq: ['$status', 'sent'] },      1, 0] } },
        delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
        read:      { $sum: { $cond: [{ $eq: ['$status', 'read'] },      1, 0] } },
        replied:   { $sum: { $cond: [{ $eq: ['$status', 'replied'] },   1, 0] } },
        failed:    { $sum: { $cond: [{
          $or: [
            { $eq: ['$status', 'failed'] },
            { $eq: ['$status', 'undelivered'] },
          ]
        }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return trend;
};

const getCampaignSummary = async (orgFilter = {}) => {
  const [statusAgg, topCampaigns] = await Promise.all([
    Campaign.aggregate([
      { $match: orgFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    Campaign.find({ status: 'completed', ...orgFilter })
      .sort({ messagesSent: -1 })
      .limit(5)
      .select('name messagesSent messagesDelivered messagesFailed actualRecipients')
      .lean(),
  ]);

  const byStatus = statusAgg.reduce((acc, curr) => {
    acc[curr._id] = curr.count;
    return acc;
  }, {});

  return { byStatus, topCampaigns };
};

const generateReport = async (_filters, _format) => {
  throw Object.assign(new Error('Report generation not fully implemented'), { statusCode: 501 });
};

const getContactEngagement = async (contactId, orgFilter = {}) => {
  const messages = await Message.find({ contact: contactId, ...orgFilter }).populate('campaign', 'name type').lean();
  return { messages };
};

/**
 * Returns a breakdown of all 6 Twilio WhatsApp message statuses with totals.
 * Statuses: queued, sent, delivered, read, replied, failed
 */
const getMessageStatusBreakdown = async (orgFilter = {}) => {
  const ALL_STATUSES = ['queued', 'sent', 'delivered', 'read', 'replied', 'failed'];

  const agg = await Message.aggregate([
    { $match: orgFilter },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  // Build result with all statuses, defaulting missing ones to 0
  const byStatus = ALL_STATUSES.reduce((acc, s) => {
    acc[s] = 0;
    return acc;
  }, {});

  agg.forEach(({ _id, count }) => {
    // map 'undelivered' -> 'failed' for Twilio compatibility
    const key = _id === 'undelivered' ? 'failed' : _id;
    if (key in byStatus) byStatus[key] += count;
  });

  const total = Object.values(byStatus).reduce((s, c) => s + c, 0);

  // Engagement rate: (delivered + read + replied) / total
  const engaged = (byStatus.delivered || 0) + (byStatus.read || 0) + (byStatus.replied || 0);
  const engagementRate = total > 0 ? Math.round((engaged / total) * 100) : 0;

  // Read rate: read / (delivered + read + replied)
  const readBase = (byStatus.delivered || 0) + (byStatus.read || 0) + (byStatus.replied || 0);
  const readRate = readBase > 0 ? Math.round(((byStatus.read || 0) / readBase) * 100) : 0;

  // Reply rate: replied / (delivered + read + replied)
  const replyRate = readBase > 0 ? Math.round(((byStatus.replied || 0) / readBase) * 100) : 0;

  return {
    byStatus,
    total,
    engagementRate,
    readRate,
    replyRate,
  };
};

module.exports = {
  getDashboardMetrics,
  getCampaignAnalytics,
  getIndustryAnalytics,
  getTrends,
  getCampaignSummary,
  generateReport,
  getContactEngagement,
  getMessageStatusBreakdown,
};

