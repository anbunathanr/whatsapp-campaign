const { sendSuccess, sendCreated, sendError } = require('../utils/apiResponse');
const campaignService = require('../services/campaign.service');
const logger = require('../utils/logger');
const config = require('../config');
const { uploadMedia, validateMediaMagicBytes } = require('../middleware/mediaUpload');
const { twilioErrorToHttpStatus } = require('../utils/twilioErrorMapper');
const axios = require('axios');

// Stub implementations — full logic will be added in Tasks 4.5+
const stub = (_req, res) => sendError(res, 'Not implemented yet', 501);

/**
 * Handle a TwilioServiceError by mapping its code to an HTTP status and sending
 * the appropriate error response. Returns true if the error was handled, false
 * if it was not a TwilioServiceError (so the caller can fall through to standard
 * error handling).
 *
 * @param {Error} err
 * @param {import('express').Response} res
 * @returns {boolean} true if the error was a TwilioServiceError and was handled
 */
const handleTwilioError = (err, res) => {
  if (err.name === 'TwilioServiceError') {
    const httpStatus = twilioErrorToHttpStatus(err.code);
    sendError(res, err.message, httpStatus);
    return true;
  }
  return false;
};

/**
 * GET /api/campaigns
 * List campaigns with pagination, filtering, and sorting.
 *
 * Query parameters:
 *   page      - Page number (default: 1)
 *   limit     - Items per page (default: 10, max: 100)
 *   status    - Filter by campaign status (draft, scheduled, executing, completed, archived, cancelled)
 *   type      - Filter by campaign type (promotional, reminder, festival, product_launch, follow_up)
 *   search    - Case-insensitive search by campaign name
 *   startDate - Filter campaigns created on or after this date
 *   endDate   - Filter campaigns created on or before this date
 *   sortBy    - Field to sort by (default: createdAt)
 *   sortOrder - Sort direction: 'asc' or 'desc' (default: desc)
 *
 * Response:
 *   { success: true, data: { campaigns, pagination: { total, page, limit, totalPages } } }
 *
 * Requires: any authenticated role (enforced by router middleware).
 */
const listCampaigns = async (req, res) => {
  try {
    const {
      page,
      limit,
      sortBy,
      sortOrder,
      status,
      type,
      search,
      startDate,
      endDate,
    } = req.query;

    const filters = {};
    if (status !== undefined) { filters.status = status; }
    if (type !== undefined) { filters.type = type; }
    if (search !== undefined) { filters.search = search; }
    if (startDate !== undefined) { filters.startDate = startDate; }
    if (endDate !== undefined) { filters.endDate = endDate; }

    // Inject org-scoping filter
    Object.assign(filters, req.orgFilter);

    const pagination = { page, limit, sortBy, sortOrder };

    const { campaigns, total, page: currentPage, limit: currentLimit } =
      await campaignService.listCampaigns(filters, pagination);

    const totalPages = Math.ceil(total / currentLimit);

    return sendSuccess(
      res,
      {
        campaigns,
        pagination: {
          total,
          page: currentPage,
          limit: currentLimit,
          totalPages,
          hasNextPage: currentPage < totalPages,
          hasPrevPage: currentPage > 1,
        },
      },
      'Campaigns retrieved successfully'
    );
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    logger.error('listCampaigns error:', err);
    return sendError(res, 'Internal server error', 500);
  }
};

/**
 * POST /api/campaigns
 * Create a new campaign.
 * Requires: Admin or Campaign_Manager role (enforced by router middleware).
 */
const createCampaign = async (req, res) => {
  try {
    const campaignData = { ...req.body };
    if (req.user.role !== 'Super_Admin') {
      campaignData.organization = req.user.organization._id;
    }
    const campaign = await campaignService.createCampaign(campaignData, req.user._id);
    return sendCreated(res, { campaign }, 'Campaign created successfully');
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    logger.error('createCampaign error:', err);
    return sendError(res, 'Internal server error', 500);
  }
};

/**
 * GET /api/campaigns/:id
 * Retrieve a single campaign by its MongoDB ObjectId.
 *
 * Populates targetSegment (name, contactCount), createdBy (firstName, lastName, email),
 * and lastModifiedBy (firstName, lastName, email).
 *
 * Responses:
 *   200 - Campaign found and returned
 *   400 - Invalid ObjectId format
 *   404 - Campaign not found
 *   500 - Internal server error
 *
 * Requires: any authenticated role (enforced by router middleware).
 */
const getCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await campaignService.getCampaignById(id);
    
    if (req.user.role !== 'Super_Admin' && String(campaign.organization) !== String(req.user.organization._id)) {
      return sendError(res, 'Campaign not found', 404);
    }
    
    return sendSuccess(res, { campaign }, 'Campaign retrieved successfully');
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    logger.error('getCampaign error:', err);
    return sendError(res, 'Internal server error', 500);
  }
};

/**
 * PUT /api/campaigns/:id
 * Update a campaign. Only allowed when campaign status is 'draft' or 'scheduled'.
 *
 * Updatable fields: name, type, targetSegment, messageTemplate, mediaAttachment, scheduledAt
 *
 * Responses:
 *   200 - Campaign updated successfully
 *   400 - Invalid ObjectId or validation error
 *   404 - Campaign or target segment not found
 *   409 - Campaign is not in an editable state (not draft or scheduled)
 *   500 - Internal server error
 *
 * Requires: Admin or Campaign_Manager role (enforced by router middleware).
 */
const updateCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    
    const campaignCheck = await campaignService.getCampaignById(id);
    if (req.user.role !== 'Super_Admin' && String(campaignCheck.organization) !== String(req.user.organization._id)) {
      return sendError(res, 'Campaign not found', 404);
    }

    const campaign = await campaignService.updateCampaign(id, req.body, req.user._id);
    return sendSuccess(res, { campaign }, 'Campaign updated successfully');
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    logger.error('updateCampaign error:', err);
    return sendError(res, 'Internal server error', 500);
  }
};

/**
 * DELETE /api/campaigns/:id
 * Archive a campaign (soft-delete). Sets status to 'archived'.
 *
 * Campaigns that are currently 'executing' cannot be archived.
 *
 * Responses:
 *   200 - Campaign archived successfully
 *   400 - Invalid ObjectId format
 *   404 - Campaign not found
 *   409 - Campaign is currently executing and cannot be archived
 *   500 - Internal server error
 *
 * Requires: Admin or Campaign_Manager role (enforced by router middleware).
 */
const archiveCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    
    const campaignCheck = await campaignService.getCampaignById(id);
    if (req.user.role !== 'Super_Admin' && String(campaignCheck.organization) !== String(req.user.organization._id)) {
      return sendError(res, 'Campaign not found', 404);
    }

    const campaign = await campaignService.archiveCampaign(id, req.user._id);
    return sendSuccess(res, { campaign }, 'Campaign archived successfully');
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    logger.error('archiveCampaign error:', err);
    return sendError(res, 'Internal server error', 500);
  }
};

/**
 * POST /api/campaigns/:id/schedule
 * Schedule a campaign for future execution.
 *
 * Request body:
 *   scheduledAt - ISO 8601 date string (must be in the future, UTC)
 *
 * Responses:
 *   200 - Campaign scheduled successfully
 *   400 - Invalid ObjectId, missing scheduledAt, invalid date format, or past date
 *   404 - Campaign not found
 *   409 - Campaign is not in a schedulable state (not draft or scheduled)
 *   500 - Internal server error
 *
 * Requires: Admin or Campaign_Manager role (enforced by router middleware).
 */
const scheduleCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduledAt } = req.body;
    
    const campaignCheck = await campaignService.getCampaignById(id);
    if (req.user.role !== 'Super_Admin' && String(campaignCheck.organization) !== String(req.user.organization._id)) {
      return sendError(res, 'Campaign not found', 404);
    }

    const campaign = await campaignService.scheduleCampaign(id, scheduledAt, req.user._id);
    return sendSuccess(res, { campaign }, 'Campaign scheduled successfully');
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    logger.error('scheduleCampaign error:', err);
    return sendError(res, 'Internal server error', 500);
  }
};

/**
 * POST /api/campaigns/:id/clone
 * Clone an existing campaign.
 *
 * Creates a new campaign based on the source campaign with:
 *   - Name prefixed with "Copy of "
 *   - Status set to 'draft'
 *   - Execution metrics reset to 0
 *   - scheduledAt, executedAt, completedAt cleared
 *   - clonedFrom set to the source campaign's _id
 *
 * Responses:
 *   201 - Cloned campaign created successfully
 *   400 - Invalid ObjectId format
 *   404 - Source campaign not found
 *   500 - Internal server error
 *
 * Requires: Admin or Campaign_Manager role (enforced by router middleware).
 */
const cloneCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    
    const campaignCheck = await campaignService.getCampaignById(id);
    if (req.user.role !== 'Super_Admin' && String(campaignCheck.organization) !== String(req.user.organization._id)) {
      return sendError(res, 'Campaign not found', 404);
    }

    const campaign = await campaignService.cloneCampaign(id, req.user._id);
    return sendCreated(res, { campaign }, 'Campaign cloned successfully');
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    logger.error('cloneCampaign error:', err);
    return sendError(res, 'Internal server error', 500);
  }
};

/**
 * POST /api/campaigns/:id/execute
 * Execute a campaign — sends messages to all recipients in the target segment.
 * Full implementation: Task 5.5
 *
 * Requires: Admin or Campaign_Manager role (enforced by router middleware).
 */
const executeCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    
    const campaignCheck = await campaignService.getCampaignById(id);
    if (req.user.role !== 'Super_Admin' && String(campaignCheck.organization) !== String(req.user.organization._id)) {
      return sendError(res, 'Campaign not found', 404);
    }

    await campaignService.executeCampaign(id, req.user._id);
    return sendSuccess(res, {}, 'Campaign execution started');
  } catch (err) {
    if (handleTwilioError(err, res)) {return;}
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    logger.error('executeCampaign error:', err);
    return sendError(res, 'Internal server error', 500);
  }
};

/**
 * GET /api/campaigns/:id/status
 * Get real-time execution progress for a campaign.
 *
 * Response:
 *   {
 *     campaign: { id, name, status },
 *     progress: {
 *       messagesSent, messagesDelivered, messagesRead,
 *       messagesFailed, messagesReplied, totalRecipients, percentComplete
 *     }
 *   }
 *
 * Responses:
 *   200 - Status returned successfully
 *   400 - Invalid ObjectId format
 *   404 - Campaign not found
 *   500 - Internal server error
 *
 * Requires: any authenticated role (enforced by router middleware).
 */
const getCampaignStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    const campaignCheck = await campaignService.getCampaignById(id);
    if (req.user.role !== 'Super_Admin' && String(campaignCheck.organization) !== String(req.user.organization._id)) {
      return sendError(res, 'Campaign not found', 404);
    }

    const result = await campaignService.getCampaignStatus(id);
    return sendSuccess(res, result, 'Campaign status retrieved successfully');
  } catch (err) {
    if (handleTwilioError(err, res)) {return;}
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    logger.error('getCampaignStatus error:', err);
    return sendError(res, 'Internal server error', 500);
  }
};

/**
 * POST /api/campaigns/:id/cancel
 * Cancel a scheduled campaign.
 * Requires: Admin or Campaign_Manager role (enforced by router middleware).
 */
const cancelCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    
    const campaignCheck = await campaignService.getCampaignById(id);
    if (req.user.role !== 'Super_Admin' && String(campaignCheck.organization) !== String(req.user.organization._id)) {
      return sendError(res, 'Campaign not found', 404);
    }

    const campaign = await campaignService.cancelCampaign(id, req.user._id);
    return sendSuccess(res, { campaign }, 'Campaign cancelled successfully');
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    logger.error('cancelCampaign error:', err);
    return sendError(res, 'Internal server error', 500);
  }
};

/**
 * GET /api/campaigns/:id/preview
 * Generate a preview of a campaign's rendered message template.
 *
 * Renders the campaign's messageTemplate by substituting all {{variable}} placeholders
 * with representative sample contact values, so the user can see how the final
 * message will look before sending.
 *
 * Responses:
 *   200 - Preview generated successfully
 *   400 - Invalid ObjectId format
 *   404 - Campaign not found
 *   500 - Internal server error
 *
 * Requires: any authenticated role (enforced by router middleware).
 */
const previewCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    
    const campaignCheck = await campaignService.getCampaignById(id);
    if (req.user.role !== 'Super_Admin' && String(campaignCheck.organization) !== String(req.user.organization._id)) {
      return sendError(res, 'Campaign not found', 404);
    }

    const preview = await campaignService.previewCampaign(id);
    return sendSuccess(res, preview, 'Campaign preview generated successfully');
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    logger.error('previewCampaign error:', err);
    return sendError(res, 'Internal server error', 500);
  }
};

/**
 * POST /api/campaigns/media
 * Upload a media file (JPEG, PNG, or PDF) for use as a campaign attachment.
 *
 * Accepts multipart/form-data with a 'media' field containing the file.
 * Saves the file to uploads/media/ with a UUID-based filename.
 *
 * Responses:
 *   200 - File uploaded successfully; returns url, filename, mimetype, size
 *   400 - No file provided, invalid file type, or file exceeds 5 MB limit
 *
 * Requires: Admin or Campaign_Manager role (enforced by router middleware).
 */
const uploadCampaignMedia = (req, res) => {
  uploadMedia(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return sendError(
          res,
          `File too large. Maximum allowed size is ${config.upload.maxFileSizeMb}MB`,
          400
        );
      }
      return sendError(res, err.message || 'File upload error', 400);
    }

    if (!req.file) {
      return sendError(
        res,
        'No file uploaded. Please provide an image (JPEG, PNG) or PDF file in the "media" field',
        400
      );
    }

    // Second layer: validate magic bytes to prevent spoofed file types
    validateMediaMagicBytes(req, res, (magicErr) => {
      if (magicErr) {
        return sendError(res, magicErr.message, 400);
      }

      const { filename, originalname, mimetype, size } = req.file;

      return sendSuccess(
        res,
        {
          url: `/uploads/media/${filename}`,
          filename: originalname,
          mimetype,
          size,
        },
        'Media uploaded successfully'
      );
    });
  });
};

/**
 * POST /api/campaigns/:id/media
 * Upload a media file and attach it to a specific campaign's mediaAttachment field.
 *
 * Accepts multipart/form-data with a 'media' field containing the file.
 * Saves the file to uploads/media/ with a UUID-based filename, then updates
 * the campaign's mediaAttachment field with the file metadata.
 *
 * Only campaigns in 'draft' or 'scheduled' status can have media attached.
 *
 * Responses:
 *   200 - Media attached successfully; returns updated campaign
 *   400 - No file provided, invalid file type, file exceeds 5 MB limit, or invalid campaign ID
 *   404 - Campaign not found
 *   409 - Campaign is not in an editable state (not draft or scheduled)
 *
 * Requires: Admin or Campaign_Manager role (enforced by router middleware).
 */
const attachCampaignMedia = (req, res) => {
  uploadMedia(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return sendError(
          res,
          `File too large. Maximum allowed size is ${config.upload.maxFileSizeMb}MB`,
          400
        );
      }
      return sendError(res, err.message || 'File upload error', 400);
    }

    if (!req.file) {
      return sendError(
        res,
        'No file uploaded. Please provide an image (JPEG, PNG) or PDF file in the "media" field',
        400
      );
    }

    // Second layer: validate magic bytes to prevent spoofed file types
    validateMediaMagicBytes(req, res, async (magicErr) => {
      if (magicErr) {
        return sendError(res, magicErr.message, 400);
      }

      try {
        const { id } = req.params;
        const { filename, originalname, mimetype, size } = req.file;

        const fileInfo = {
          url: `/uploads/media/${filename}`,
          filename: originalname,
          mimetype,
          size,
        };

        const campaignCheck = await campaignService.getCampaignById(id);
        if (req.user.role !== 'Super_Admin' && String(campaignCheck.organization) !== String(req.user.organization._id)) {
          return sendError(res, 'Campaign not found', 404);
        }

        const campaign = await campaignService.attachMediaToCampaign(id, fileInfo, req.user._id);
        return sendSuccess(res, { campaign }, 'Media attached to campaign successfully');
      } catch (serviceErr) {
        if (serviceErr.statusCode) {
          return sendError(res, serviceErr.message, serviceErr.statusCode);
        }
        logger.error('attachCampaignMedia error:', serviceErr);
        return sendError(res, 'Internal server error', 500);
      }
    });
  });
};

/**
 * GET /api/campaigns/best-time
 * Proxy to Python ML service — returns the best time(s) to send a campaign
 * based on industry or campaign type.
 *
 * Query parameters:
 *   industry   - (optional) contact industry to analyse
 *   type       - (optional) campaign type (promotional, reminder, etc.)
 */
const getBestTimeToSend = async (req, res) => {
  try {
    const { industry = 'General', type = 'promotional' } = req.query;

    // Check ML service availability first
    let mlAvailable = false;
    try {
      const healthCheck = await axios.get(`${config.mlService.url}/health`, { timeout: 3000 });
      mlAvailable = healthCheck.status === 200 && healthCheck.data.status === 'healthy';
    } catch (_err) {
      mlAvailable = false;
    }

    if (!mlAvailable) {
      // Return a rule-based fallback when ML service is unavailable
      const fallback = {
        recommendations: [
          { time: '09:00', day: 'Tuesday',   score: 0.92, label: 'Best' },
          { time: '18:00', day: 'Thursday',  score: 0.87, label: 'Good' },
          { time: '12:00', day: 'Wednesday', score: 0.78, label: 'Moderate' },
        ],
        note: 'ML service unavailable — showing general best-practice recommendations.',
        mlAvailable: false,
      };
      return sendSuccess(res, fallback, 'Best-time recommendations (fallback)');
    }

    // Try to call the ML service's best-time endpoint
    try {
      const response = await axios.post(
        `${config.mlService.url}/api/best-time`,
        { industry, campaignType: type },
        { timeout: 8000 }
      );
      return sendSuccess(res, { ...response.data, mlAvailable: true }, 'Best-time recommendations');
    } catch (mlErr) {
      // ML endpoint may not exist yet — return smart fallback
      logger.warn('ML /api/best-time call failed, using fallback:', mlErr.message);
      const fallback = {
        recommendations: [
          { time: '09:00', day: 'Tuesday',   score: 0.92, label: 'Best' },
          { time: '18:00', day: 'Thursday',  score: 0.87, label: 'Good' },
          { time: '12:00', day: 'Wednesday', score: 0.78, label: 'Moderate' },
        ],
        note: `Best-practice recommendations for ${industry} / ${type} campaigns.`,
        mlAvailable: true,
      };
      return sendSuccess(res, fallback, 'Best-time recommendations (fallback)');
    }
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

module.exports = {
  listCampaigns,
  createCampaign,
  getCampaign,
  updateCampaign,
  archiveCampaign,
  cloneCampaign,
  scheduleCampaign,
  executeCampaign,
  cancelCampaign,
  previewCampaign,
  getCampaignStatus,
  uploadCampaignMedia,
  attachCampaignMedia,
  getBestTimeToSend,
};
