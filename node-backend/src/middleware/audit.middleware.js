const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

/**
 * Middleware to capture and create audit logs for specific actions.
 * @param {string} action - The audit action name (e.g. 'campaign_created')
 * @param {string} resourceType - The type of resource ('Campaign', 'User', etc.)
 */
const auditLog = (action, resourceType) => {
  return async (req, res, next) => {
    // Intercept json() to capture the response body for resourceId extraction
    const originalJson = res.json.bind(res);
    let responseBody = null;
    res.json = (body) => {
      responseBody = body;
      return originalJson(body);
    };

    res.on('finish', async () => {
      // Only log successful actions (status 200, 201)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          // Try to extract resourceId: from URL param, or from created resource in response body
          const resourceId =
            req.params.id ||
            responseBody?.data?._id ||
            responseBody?.data?.data?._id ||
            null;

          const logData = {
            action,
            resourceType,
            resourceId,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
          };

          if (req.user) {
            logData.user = req.user._id;
            if (req.user.organization) {
              // Handle populated vs unpopulated organization
              logData.organization = req.user.organization._id || req.user.organization;
            }
          }

          const logEntry = new AuditLog(logData);
          await logEntry.save();
        } catch (err) {
          // Non-fatal — never block the response
          logger.error('Failed to write audit log: ' + err.message);
        }
      }
    });
    next();
  };
};

module.exports = { auditLog };
