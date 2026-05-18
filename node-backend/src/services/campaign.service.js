/**
 * Campaign Service
 * Handles campaign lifecycle: creation, scheduling, execution, cloning, and state management.
 * Full implementation: Tasks 4.3 – 4.9, 5.5, 5.7
 */

const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const Segment = require('../models/Segment');
const logger = require('../utils/logger');
const { validateTemplate, renderTemplate } = require('./templateParser.service');

/**
 * Sample contact data used for campaign preview (Requirement 4.12).
 * Covers all supported Dynamic_Variable placeholders.
 */
const SAMPLE_CONTACT = {
  name: 'Jane Smith',
  phone: '+14155550100',
  jobTitle: 'Marketing Director',
  company: 'Acme Corporation',
  industry: 'Technology',
  tags: ['vip', 'newsletter'],
  source: 'csv_import',
  location: {
    city: 'San Francisco',
    state: 'California',
    country: 'United States',
  },
  customFields: {},
  // Nested "contact" prefix support — mirrors the contact object itself
  contact: {
    name: 'Jane Smith',
    phone: '+14155550100',
    jobTitle: 'Marketing Director',
    company: 'Acme Corporation',
    industry: 'Technology',
    tags: ['vip', 'newsletter'],
    source: 'csv_import',
    location: {
      city: 'San Francisco',
      state: 'California',
      country: 'United States',
    },
    customFields: {},
  },
};

const ALLOWED_TYPES = ['promotional', 'reminder', 'festival', 'product_launch', 'follow_up'];
const ALLOWED_MEDIA_TYPES = ['image', 'pdf', 'none'];

/**
 * Escape special regex characters in a string so it can be used in a RegExp constructor.
 * @param {string} str
 * @returns {string}
 */
const escapeRegex = (str) => {
  // Replace each special regex character with its escaped version
  return str.replace(/[-[\]/{}()*+?.\\^$|]/g, (char) => '\\' + char);
};

/**
 * List campaigns with pagination, filtering, and sorting.
 *
 * @param {object} filters    - Filter criteria from query params
 * @param {object} pagination - Pagination/sorting params from query params
 * @returns {Promise<{ campaigns, total, page, limit }>}
 */
const listCampaigns = async (filters, pagination) => {
  const safeFilters = filters || {};
  const safePagination = pagination || {};

  // ── Pagination defaults & bounds ──────────────────────────────────────────
  const page = Math.max(1, parseInt(safePagination.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(safePagination.limit, 10) || 10));
  const skip = (page - 1) * limit;

  // ── Sorting ───────────────────────────────────────────────────────────────
  const allowedSortFields = ['createdAt', 'updatedAt', 'name', 'scheduledAt', 'status', 'type'];
  const sortBy = allowedSortFields.includes(safePagination.sortBy)
    ? safePagination.sortBy
    : 'createdAt';
  const sortOrder = safePagination.sortOrder === 'asc' ? 1 : -1;

  // ── Build MongoDB query ───────────────────────────────────────────────────
  const query = {};

  // Filter by status (single value)
  if (safeFilters.status) {
    const allowedStatuses = ['draft', 'scheduled', 'executing', 'completed', 'archived', 'cancelled'];
    if (allowedStatuses.includes(safeFilters.status)) {
      query.status = safeFilters.status;
    }
  }

  // Filter by type (single value)
  if (safeFilters.type) {
    const allowedTypes = ['promotional', 'reminder', 'festival', 'product_launch', 'follow_up'];
    if (allowedTypes.includes(safeFilters.type)) {
      query.type = safeFilters.type;
    }
  }

  // Filter by date range on createdAt
  if (safeFilters.startDate || safeFilters.endDate) {
    query.createdAt = {};
    if (safeFilters.startDate) {
      const start = new Date(safeFilters.startDate);
      if (!isNaN(start.getTime())) {
        query.createdAt.$gte = start;
      }
    }
    if (safeFilters.endDate) {
      const end = new Date(safeFilters.endDate);
      if (!isNaN(end.getTime())) {
        // Include the entire end date by setting to end of day
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }
    // Remove empty createdAt object if no valid dates were set
    if (Object.keys(query.createdAt).length === 0) {
      delete query.createdAt;
    }
  }

  // Search by campaign name (case-insensitive)
  if (safeFilters.search) {
    const searchRegex = new RegExp(escapeRegex(String(safeFilters.search).trim()), 'i');
    query.name = searchRegex;
  }

  // Inject organization filter if present
  if (safeFilters.organization) {
    query.organization = safeFilters.organization;
  }

  // ── Execute query ─────────────────────────────────────────────────────────
  const [campaigns, total] = await Promise.all([
    Campaign.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .populate('targetSegment', 'name contactCount')
      .populate('createdBy', 'firstName lastName email')
      .lean(),
    Campaign.countDocuments(query),
  ]);

  return { campaigns, total, page, limit };
};

/**
 * Create a new campaign.
 *
 * @param {object} campaignData - Fields from the request body
 * @param {string} userId       - Authenticated user's _id
 * @returns {Promise<object>}   The saved Campaign document (populated)
 * @throws {object} { statusCode: 400 } for validation errors
 * @throws {object} { statusCode: 404 } when targetSegment is not found
 */
const createCampaign = async (campaignData, userId) => {
  const { name, type, targetSegment, messageTemplate, scheduledAt, mediaAttachment, organization } =
    campaignData || {};

  // ── Required field validation ─────────────────────────────────────────────
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    const err = new Error('name is required');
    err.statusCode = 400;
    throw err;
  }

  if (!type) {
    const err = new Error('type is required');
    err.statusCode = 400;
    throw err;
  }

  if (!ALLOWED_TYPES.includes(type)) {
    const err = new Error('type must be one of: ' + ALLOWED_TYPES.join(', '));
    err.statusCode = 400;
    throw err;
  }

  if (!targetSegment) {
    const err = new Error('targetSegment is required');
    err.statusCode = 400;
    throw err;
  }

  if (!mongoose.Types.ObjectId.isValid(targetSegment)) {
    const err = new Error('targetSegment must be a valid MongoDB ObjectId');
    err.statusCode = 400;
    throw err;
  }

  if (!messageTemplate || typeof messageTemplate !== 'string' || messageTemplate.trim().length === 0) {
    const err = new Error('messageTemplate is required');
    err.statusCode = 400;
    throw err;
  }

  // ── Template syntax validation ────────────────────────────────────────────
  const templateValidation = validateTemplate(messageTemplate.trim());
  if (!templateValidation.valid) {
    const descriptions = templateValidation.errors.map((e) => e.message).join('; ');
    const err = new Error(`messageTemplate has invalid syntax: ${descriptions}`);
    err.statusCode = 400;
    throw err;
  }

  // ── Segment existence check ───────────────────────────────────────────────
  const segment = await Segment.findById(targetSegment);
  if (!segment) {
    const err = new Error('Target segment not found');
    err.statusCode = 404;
    throw err;
  }

  // ── scheduledAt validation ────────────────────────────────────────────────
  let parsedScheduledAt;
  if (scheduledAt !== undefined && scheduledAt !== null && scheduledAt !== '') {
    parsedScheduledAt = new Date(scheduledAt);
    if (isNaN(parsedScheduledAt.getTime())) {
      const err = new Error('scheduledAt must be a valid date');
      err.statusCode = 400;
      throw err;
    }
    if (parsedScheduledAt.getTime() <= Date.now()) {
      const err = new Error('scheduledAt must be a future UTC timestamp');
      err.statusCode = 400;
      throw err;
    }
  }

  // ── mediaAttachment validation ────────────────────────────────────────────
  if (mediaAttachment !== undefined && mediaAttachment !== null) {
    if (!ALLOWED_MEDIA_TYPES.includes(mediaAttachment.type)) {
      const err = new Error('mediaAttachment.type must be one of: ' + ALLOWED_MEDIA_TYPES.join(', '));
      err.statusCode = 400;
      throw err;
    }
  }

  // ── Build campaign document ───────────────────────────────────────────────
  const campaignDoc = {
    name: name.trim(),
    type,
    targetSegment,
    messageTemplate: messageTemplate.trim(),
    status: 'draft',
    estimatedRecipients: segment.contactCount || 0,
    createdBy: userId,
    organization: organization || undefined,
  };

  if (parsedScheduledAt) {
    campaignDoc.scheduledAt = parsedScheduledAt;
  }

  if (mediaAttachment !== undefined && mediaAttachment !== null) {
    campaignDoc.mediaAttachment = mediaAttachment;
  }

  // ── Persist ───────────────────────────────────────────────────────────────
  const campaign = new Campaign(campaignDoc);
  await campaign.save();

  // ── Populate and return ───────────────────────────────────────────────────
  await campaign.populate([
    { path: 'targetSegment', select: 'name contactCount' },
    { path: 'createdBy', select: 'email name' },
  ]);

  logger.info(`Campaign created: ${campaign._id} by user ${userId}`);
  return campaign;
};

/**
 * Get a single campaign by its MongoDB ObjectId.
 *
 * Populates:
 *   - targetSegment: name, contactCount
 *   - createdBy: firstName, lastName, email
 *   - lastModifiedBy: firstName, lastName, email
 *
 * @param {string} id - The campaign's MongoDB ObjectId as a string
 * @returns {Promise<object>} The campaign document (lean plain object)
 * @throws {object} { statusCode: 400 } for invalid ObjectId format
 * @throws {object} { statusCode: 404 } when no campaign matches the id
 */
const getCampaignById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid campaign ID format');
    err.statusCode = 400;
    throw err;
  }

  const campaign = await Campaign.findById(id)
    .populate('targetSegment', 'name contactCount')
    .populate('createdBy', 'firstName lastName email')
    .populate('lastModifiedBy', 'firstName lastName email')
    .lean();

  if (!campaign) {
    const err = new Error('Campaign not found');
    err.statusCode = 404;
    throw err;
  }

  return campaign;
};

/**
 * Update a campaign by its MongoDB ObjectId.
 *
 * Only campaigns with status 'draft' or 'scheduled' may be updated.
 * Attempting to update a campaign in any other state (executing, completed,
 * archived, cancelled) will throw a 409 Conflict error.
 *
 * Updatable fields: name, type, targetSegment, messageTemplate, mediaAttachment, scheduledAt
 * Read-only fields (silently ignored): status, createdBy, metrics, timestamps
 *
 * @param {string} id      - The campaign's MongoDB ObjectId as a string
 * @param {object} updates - Fields to update from the request body
 * @param {string} userId  - Authenticated user's _id (recorded as lastModifiedBy)
 * @returns {Promise<object>} The updated Campaign document (populated, lean)
 * @throws {object} { statusCode: 400 } for invalid ObjectId or validation errors
 * @throws {object} { statusCode: 404 } when no campaign matches the id
 * @throws {object} { statusCode: 409 } when campaign status is not draft or scheduled
 */
const updateCampaign = async (id, updates, userId) => {
  // ── ID validation ─────────────────────────────────────────────────────────
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid campaign ID format');
    err.statusCode = 400;
    throw err;
  }

  // ── Fetch existing campaign ───────────────────────────────────────────────
  const campaign = await Campaign.findById(id);
  if (!campaign) {
    const err = new Error('Campaign not found');
    err.statusCode = 404;
    throw err;
  }

  // ── Status guard: only draft or scheduled may be edited (Req 4.9) ─────────
  if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
    const err = new Error(
      `Campaign cannot be updated in '${campaign.status}' status. Only draft or scheduled campaigns can be edited.`
    );
    err.statusCode = 409;
    throw err;
  }

  const safeUpdates = updates || {};

  // ── name validation ───────────────────────────────────────────────────────
  if (safeUpdates.name !== undefined) {
    if (typeof safeUpdates.name !== 'string' || safeUpdates.name.trim().length === 0) {
      const err = new Error('name must be a non-empty string');
      err.statusCode = 400;
      throw err;
    }
    campaign.name = safeUpdates.name.trim();
  }

  // ── type validation ───────────────────────────────────────────────────────
  if (safeUpdates.type !== undefined) {
    if (!ALLOWED_TYPES.includes(safeUpdates.type)) {
      const err = new Error('type must be one of: ' + ALLOWED_TYPES.join(', '));
      err.statusCode = 400;
      throw err;
    }
    campaign.type = safeUpdates.type;
  }

  // ── targetSegment validation ──────────────────────────────────────────────
  if (safeUpdates.targetSegment !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(safeUpdates.targetSegment)) {
      const err = new Error('targetSegment must be a valid MongoDB ObjectId');
      err.statusCode = 400;
      throw err;
    }
    const segment = await Segment.findById(safeUpdates.targetSegment);
    if (!segment) {
      const err = new Error('Target segment not found');
      err.statusCode = 404;
      throw err;
    }
    campaign.targetSegment = safeUpdates.targetSegment;
    campaign.estimatedRecipients = segment.contactCount || 0;
  }

  // ── messageTemplate validation ────────────────────────────────────────────
  if (safeUpdates.messageTemplate !== undefined) {
    if (
      typeof safeUpdates.messageTemplate !== 'string' ||
      safeUpdates.messageTemplate.trim().length === 0
    ) {
      const err = new Error('messageTemplate must be a non-empty string');
      err.statusCode = 400;
      throw err;
    }

    // Syntax validation
    const templateValidation = validateTemplate(safeUpdates.messageTemplate.trim());
    if (!templateValidation.valid) {
      const descriptions = templateValidation.errors.map((e) => e.message).join('; ');
      const err = new Error(`messageTemplate has invalid syntax: ${descriptions}`);
      err.statusCode = 400;
      throw err;
    }

    campaign.messageTemplate = safeUpdates.messageTemplate.trim();
  }

  // ── scheduledAt validation ────────────────────────────────────────────────
  if (safeUpdates.scheduledAt !== undefined) {
    if (safeUpdates.scheduledAt === null || safeUpdates.scheduledAt === '') {
      // Allow clearing the scheduled time (reverts to unscheduled draft)
      campaign.scheduledAt = undefined;
    } else {
      const parsedScheduledAt = new Date(safeUpdates.scheduledAt);
      if (isNaN(parsedScheduledAt.getTime())) {
        const err = new Error('scheduledAt must be a valid date');
        err.statusCode = 400;
        throw err;
      }
      if (parsedScheduledAt.getTime() <= Date.now()) {
        const err = new Error('scheduledAt must be a future UTC timestamp');
        err.statusCode = 400;
        throw err;
      }
      campaign.scheduledAt = parsedScheduledAt;
    }
  }

  // ── mediaAttachment validation ────────────────────────────────────────────
  if (safeUpdates.mediaAttachment !== undefined) {
    if (safeUpdates.mediaAttachment === null) {
      campaign.mediaAttachment = { type: 'none' };
    } else {
      if (!ALLOWED_MEDIA_TYPES.includes(safeUpdates.mediaAttachment.type)) {
        const err = new Error(
          'mediaAttachment.type must be one of: ' + ALLOWED_MEDIA_TYPES.join(', ')
        );
        err.statusCode = 400;
        throw err;
      }
      campaign.mediaAttachment = safeUpdates.mediaAttachment;
    }
  }

  // ── Record modifier ───────────────────────────────────────────────────────
  campaign.lastModifiedBy = userId;

  // ── Persist ───────────────────────────────────────────────────────────────
  await campaign.save();

  // ── Populate and return ───────────────────────────────────────────────────
  await campaign.populate([
    { path: 'targetSegment', select: 'name contactCount' },
    { path: 'createdBy', select: 'firstName lastName email' },
    { path: 'lastModifiedBy', select: 'firstName lastName email' },
  ]);

  logger.info(`Campaign updated: ${campaign._id} by user ${userId}`);
  return campaign.toObject();
};

/**
 * Archive a campaign by its MongoDB ObjectId.
 *
 * Sets the campaign status to 'archived'. Campaigns that are currently
 * 'executing' cannot be archived (throws 409 Conflict).
 *
 * @param {string} id     - The campaign's MongoDB ObjectId as a string
 * @param {string} userId - Authenticated user's _id (recorded as lastModifiedBy)
 * @returns {Promise<object>} The updated Campaign document (populated, plain object)
 * @throws {object} { statusCode: 400 } for invalid ObjectId format
 * @throws {object} { statusCode: 404 } when no campaign matches the id
 * @throws {object} { statusCode: 409 } when campaign is currently 'executing'
 */
const archiveCampaign = async (id, userId) => {
  // ── ID validation ─────────────────────────────────────────────────────────
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid campaign ID format');
    err.statusCode = 400;
    throw err;
  }

  // ── Fetch existing campaign ───────────────────────────────────────────────
  const campaign = await Campaign.findById(id);
  if (!campaign) {
    const err = new Error('Campaign not found');
    err.statusCode = 404;
    throw err;
  }

  // ── Status guard: cannot archive an executing campaign (Req 4.10) ─────────
  if (campaign.status === 'executing') {
    const err = new Error(
      "Campaign cannot be archived while it is executing. Wait for the campaign to complete or cancel it first."
    );
    err.statusCode = 409;
    throw err;
  }

  // ── Already archived — idempotent, just return current state ─────────────
  if (campaign.status === 'archived') {
    await campaign.populate([
      { path: 'targetSegment', select: 'name contactCount' },
      { path: 'createdBy', select: 'firstName lastName email' },
      { path: 'lastModifiedBy', select: 'firstName lastName email' },
    ]);
    return campaign.toObject();
  }

  // ── Archive ───────────────────────────────────────────────────────────────
  campaign.status = 'archived';
  campaign.lastModifiedBy = userId;
  await campaign.save();

  // ── Populate and return ───────────────────────────────────────────────────
  await campaign.populate([
    { path: 'targetSegment', select: 'name contactCount' },
    { path: 'createdBy', select: 'firstName lastName email' },
    { path: 'lastModifiedBy', select: 'firstName lastName email' },
  ]);

  logger.info(`Campaign archived: ${campaign._id} by user ${userId}`);
  return campaign.toObject();
};

/**
 * Clone an existing campaign.
 *
 * Business rules (Requirement 4.6):
 *   - The source campaign must exist.
 *   - All campaign fields are copied EXCEPT: _id, createdAt, updatedAt, executedAt, completedAt, scheduledAt.
 *   - Execution metrics are reset to 0: messagesSent, messagesDelivered, messagesRead,
 *     messagesFailed, messagesReplied, actualRecipients.
 *   - The cloned campaign status is set to 'draft'.
 *   - clonedFrom is set to the source campaign's _id.
 *   - The cloned campaign name is prefixed with "Copy of ".
 *   - createdBy and lastModifiedBy are set to the requesting user.
 *
 * @param {string} id     - Source campaign MongoDB ObjectId string
 * @param {string} userId - ID of the user performing the clone
 * @returns {Promise<object>} The newly created cloned campaign (populated, plain object)
 *
 * @throws {object} { statusCode: 400 } for invalid ObjectId format
 * @throws {object} { statusCode: 404 } when no campaign matches the id
 */
const cloneCampaign = async (id, userId) => {
  // ── ID validation ─────────────────────────────────────────────────────────
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid campaign ID format');
    err.statusCode = 400;
    throw err;
  }

  // ── Fetch source campaign ─────────────────────────────────────────────────
  const source = await Campaign.findById(id).lean();
  if (!source) {
    const err = new Error('Campaign not found');
    err.statusCode = 404;
    throw err;
  }

  // ── Build cloned campaign document ────────────────────────────────────────
  // Copy fields, excluding: _id, createdAt, updatedAt, executedAt, completedAt, scheduledAt
  const clonedDoc = {
    name: `Copy of ${source.name}`,
    type: source.type,
    status: 'draft',
    targetSegment: source.targetSegment,
    messageTemplate: source.messageTemplate,
    estimatedRecipients: source.estimatedRecipients,
    // Reset execution metrics to 0
    actualRecipients: 0,
    messagesSent: 0,
    messagesDelivered: 0,
    messagesRead: 0,
    messagesFailed: 0,
    messagesReplied: 0,
    // Track provenance
    clonedFrom: source._id,
    createdBy: userId,
    lastModifiedBy: userId,
  };

  // Copy mediaAttachment only if it exists and is not 'none'
  if (source.mediaAttachment && source.mediaAttachment.type !== 'none') {
    clonedDoc.mediaAttachment = {
      type: source.mediaAttachment.type,
      url: source.mediaAttachment.url,
      filename: source.mediaAttachment.filename,
      size: source.mediaAttachment.size,
    };
  }

  // ── Persist ───────────────────────────────────────────────────────────────
  const cloned = new Campaign(clonedDoc);
  await cloned.save();

  // ── Populate and return ───────────────────────────────────────────────────
  await cloned.populate([
    { path: 'targetSegment', select: 'name contactCount' },
    { path: 'createdBy', select: 'firstName lastName email' },
    { path: 'lastModifiedBy', select: 'firstName lastName email' },
    { path: 'clonedFrom', select: 'name' },
  ]);

  logger.info(`Campaign cloned: ${source._id} → ${cloned._id} by user ${userId}`);
  return cloned.toObject();
};

/**
 * Schedule a campaign for future execution.
 *
 * Business rules (Requirement 4.7, 6.1):
 *   - Campaign must exist and be in 'draft' or 'scheduled' status to be scheduled.
 *   - scheduledAt must be a valid date in the future (UTC).
 *   - On success, campaign status is set to 'scheduled'.
 *
 * @param {string} id          - Campaign MongoDB ObjectId string
 * @param {string|Date} scheduledAt - ISO 8601 date string or Date object (must be in the future)
 * @param {string} userId      - ID of the user performing the action
 * @returns {Promise<object>}  - Plain campaign object with populated references
 *
 * @throws {object} { statusCode: 400 } for invalid ObjectId, missing/invalid scheduledAt, or past date
 * @throws {object} { statusCode: 404 } when no campaign matches the id
 * @throws {object} { statusCode: 409 } when campaign is not in a schedulable state
 */
const scheduleCampaign = async (id, scheduledAt, userId) => {
  // ── ID validation ─────────────────────────────────────────────────────────
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid campaign ID format');
    err.statusCode = 400;
    throw err;
  }

  // ── scheduledAt presence check ────────────────────────────────────────────
  if (scheduledAt === undefined || scheduledAt === null || scheduledAt === '') {
    const err = new Error('scheduledAt is required');
    err.statusCode = 400;
    throw err;
  }

  // ── scheduledAt date parsing ──────────────────────────────────────────────
  const scheduledDate = new Date(scheduledAt);
  if (isNaN(scheduledDate.getTime())) {
    const err = new Error('scheduledAt must be a valid ISO 8601 date string');
    err.statusCode = 400;
    throw err;
  }

  // ── scheduledAt must be in the future (UTC) ───────────────────────────────
  if (scheduledDate.getTime() <= Date.now()) {
    const err = new Error('scheduledAt must be a future date and time (UTC)');
    err.statusCode = 400;
    throw err;
  }

  // ── Fetch existing campaign ───────────────────────────────────────────────
  const campaign = await Campaign.findById(id);
  if (!campaign) {
    const err = new Error('Campaign not found');
    err.statusCode = 404;
    throw err;
  }

  // ── Status guard: only draft or scheduled campaigns can be scheduled ──────
  const schedulableStatuses = ['draft', 'scheduled'];
  if (!schedulableStatuses.includes(campaign.status)) {
    const err = new Error(
      `Campaign cannot be scheduled because its current status is '${campaign.status}'. ` +
        `Only campaigns with status 'draft' or 'scheduled' can be scheduled.`
    );
    err.statusCode = 409;
    throw err;
  }

  // ── Apply schedule ────────────────────────────────────────────────────────
  campaign.status = 'scheduled';
  campaign.scheduledAt = scheduledDate;
  campaign.lastModifiedBy = userId;
  await campaign.save();

  // ── Populate and return ───────────────────────────────────────────────────
  await campaign.populate([
    { path: 'targetSegment', select: 'name contactCount' },
    { path: 'createdBy', select: 'firstName lastName email' },
    { path: 'lastModifiedBy', select: 'firstName lastName email' },
  ]);

  logger.info(
    `Campaign scheduled: ${campaign._id} for ${scheduledDate.toISOString()} by user ${userId}`
  );
  return campaign.toObject();
};

const executeCampaign = async (id, userId) => {
  const Contact = require('../models/Contact');
  const Message = require('../models/Message');
  const { enqueueBatch } = require('../queues/messageQueue');
  const { buildSegmentContactQuery } = require('./contact.service');

  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid campaign ID format');
    err.statusCode = 400;
    throw err;
  }

  const campaign = await Campaign.findById(id).populate('targetSegment');
  if (!campaign) {
    const err = new Error('Campaign not found');
    err.statusCode = 404;
    throw err;
  }

  if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
    const err = new Error(`Cannot execute campaign in '${campaign.status}' status. Only draft or scheduled campaigns can be executed.`);
    err.statusCode = 409;
    throw err;
  }

  logger.info(`Starting execution for campaign ${id}`);

  // Fetch contacts using the segment criteria
  const query = buildSegmentContactQuery(campaign.targetSegment?.filterCriteria || {}, { organization: campaign.organization });
  const contacts = await Contact.find(query).lean();

  if (contacts.length === 0) {
    const err = new Error('No contacts found for the target segment. Execution aborted.');
    err.statusCode = 400;
    throw err;
  }

  const messagesToInsert = contacts.map((contact) => ({
    campaign: id,
    contact: contact._id,
    phoneNumber: contact.phone,
    messageContent: renderTemplate(campaign.messageTemplate, { contact }),
    mediaUrl: campaign.mediaAttachment && campaign.mediaAttachment.type !== 'none' ? campaign.mediaAttachment.url : undefined,
    status: 'queued',
    organization: campaign.organization,
  }));

  // Bulk insert messages
  const createdMessages = await Message.insertMany(messagesToInsert);

  // Prepare jobs for Bull queue
  const jobs = createdMessages.map((msg) => ({
    messageId: msg._id,
    campaignId: id,
    contactId: msg.contact,
    phoneNumber: msg.phoneNumber,
    content: msg.messageContent,
    mediaUrl: msg.mediaUrl,
    userId: userId,
  }));

  await enqueueBatch(jobs);

  // Update campaign
  campaign.status = 'executing';
  campaign.actualRecipients = createdMessages.length;
  campaign.executedAt = new Date();
  campaign.lastModifiedBy = userId;
  await campaign.save();

  logger.info(`Campaign ${id} executed successfully. Enqueued ${createdMessages.length} messages.`);
};

const cancelCampaign = async (id, userId) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid campaign ID format');
    err.statusCode = 400;
    throw err;
  }

  const campaign = await Campaign.findById(id);
  if (!campaign) {
    const err = new Error('Campaign not found');
    err.statusCode = 404;
    throw err;
  }

  if (campaign.status !== 'scheduled') {
    const err = new Error(`Only scheduled campaigns can be cancelled. Current status is ${campaign.status}.`);
    err.statusCode = 409;
    throw err;
  }

  campaign.status = 'cancelled';
  campaign.lastModifiedBy = userId;
  await campaign.save();

  logger.info(`Campaign ${id} was cancelled by user ${userId}.`);
  return campaign.toObject();
};

/**
 * Generate a preview of a campaign's rendered message template using sample contact data.
 *
 * Business rules (Requirement 4.12):
 *   - Campaign must exist.
 *   - The messageTemplate is rendered by substituting all {{variable}} placeholders
 *     with values from a representative sample contact.
 *   - Returns the rendered preview string along with the sample data used.
 *
 * @param {string} id - Campaign MongoDB ObjectId string
 * @returns {Promise<object>} Preview result:
 *   {
 *     campaignId:      string,
 *     campaignName:    string,
 *     originalTemplate: string,
 *     renderedPreview: string,
 *     sampleContact:   object,
 *   }
 *
 * @throws {object} { statusCode: 400 } for invalid ObjectId format
 * @throws {object} { statusCode: 404 } when no campaign matches the id
 */
const previewCampaign = async (id) => {
  // ── ID validation ─────────────────────────────────────────────────────────
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid campaign ID format');
    err.statusCode = 400;
    throw err;
  }

  // ── Fetch campaign ────────────────────────────────────────────────────────
  const campaign = await Campaign.findById(id)
    .populate('targetSegment', 'name contactCount')
    .lean();

  if (!campaign) {
    const err = new Error('Campaign not found');
    err.statusCode = 404;
    throw err;
  }

  // ── Render template with sample contact data ──────────────────────────────
  const renderedPreview = renderTemplate(campaign.messageTemplate, SAMPLE_CONTACT);

  logger.info(`Campaign preview generated: ${campaign._id}`);

  return {
    campaignId: campaign._id,
    campaignName: campaign.name,
    originalTemplate: campaign.messageTemplate,
    renderedPreview,
    sampleContact: {
      name: SAMPLE_CONTACT.name,
      phone: SAMPLE_CONTACT.phone,
      jobTitle: SAMPLE_CONTACT.jobTitle,
      company: SAMPLE_CONTACT.company,
      industry: SAMPLE_CONTACT.industry,
      tags: SAMPLE_CONTACT.tags,
      location: SAMPLE_CONTACT.location,
    },
  };
};

/**
 * Get the real-time execution status and progress of a campaign.
 *
 * Requirement 5.8 — Track campaign execution progress via GET /api/campaigns/:id/status.
 *
 * @param {string} id - Campaign MongoDB ObjectId string
 * @returns {Promise<object>} Campaign with computed progress metrics:
 *   {
 *     campaign: { id, name, status },
 *     progress: {
 *       messagesSent, messagesDelivered, messagesRead,
 *       messagesFailed, messagesReplied, totalRecipients, percentComplete
 *     }
 *   }
 *
 * @throws {object} { statusCode: 400 } for invalid ObjectId format
 * @throws {object} { statusCode: 404 } when no campaign matches the id
 */
const getCampaignStatus = async (id) => {
  // ── ID validation ─────────────────────────────────────────────────────────
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid campaign ID format');
    err.statusCode = 400;
    throw err;
  }

  // ── Fetch campaign ────────────────────────────────────────────────────────
  const campaign = await Campaign.findById(id).lean();

  if (!campaign) {
    const err = new Error('Campaign not found');
    err.statusCode = 404;
    throw err;
  }

  // ── Compute progress ──────────────────────────────────────────────────────
  const totalRecipients = campaign.actualRecipients || campaign.estimatedRecipients || 0;
  const messagesSent = campaign.messagesSent || 0;
  const percentComplete =
    totalRecipients > 0 ? Math.round((messagesSent / totalRecipients) * 100) : 0;

  logger.info(
    'campaign.service: getCampaignStatus — id: %s, status: %s, percentComplete: %d%%',
    id,
    campaign.status,
    percentComplete
  );

  return {
    campaign: {
      id: campaign._id,
      name: campaign.name,
      status: campaign.status,
    },
    progress: {
      messagesSent,
      messagesDelivered: campaign.messagesDelivered || 0,
      messagesRead: campaign.messagesRead || 0,
      messagesFailed: campaign.messagesFailed || 0,
      messagesReplied: campaign.messagesReplied || 0,
      totalRecipients,
      percentComplete,
    },
  };
};

/**
 * Attach a media file to a campaign's mediaAttachment field.
 *
 * Business rules (Requirements 4.4, 4.9):
 *   - Campaign must exist and be in 'draft' or 'scheduled' status.
 *   - Determines mediaAttachment.type from the file's MIME type:
 *       image/jpeg, image/png → 'image'
 *       application/pdf      → 'pdf'
 *   - Updates campaign.mediaAttachment with { type, url, filename, size }.
 *   - Records lastModifiedBy.
 *
 * @param {string} id       - Campaign MongoDB ObjectId string
 * @param {object} fileInfo - File metadata from multer: { url, filename, mimetype, size }
 * @param {string} userId   - Authenticated user's _id
 * @returns {Promise<object>} The updated Campaign document (populated, plain object)
 *
 * @throws {object} { statusCode: 400 } for invalid ObjectId format or unsupported MIME type
 * @throws {object} { statusCode: 404 } when no campaign matches the id
 * @throws {object} { statusCode: 409 } when campaign is not in draft or scheduled status
 */
const attachMediaToCampaign = async (id, fileInfo, userId) => {
  // ── ID validation ─────────────────────────────────────────────────────────
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid campaign ID format');
    err.statusCode = 400;
    throw err;
  }

  // ── Fetch existing campaign ───────────────────────────────────────────────
  const campaign = await Campaign.findById(id);
  if (!campaign) {
    const err = new Error('Campaign not found');
    err.statusCode = 404;
    throw err;
  }

  // ── Status guard: only draft or scheduled may be updated ──────────────────
  if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
    const err = new Error(
      `Campaign cannot be updated in '${campaign.status}' status. Only draft or scheduled campaigns can be edited.`
    );
    err.statusCode = 409;
    throw err;
  }

  // ── Determine mediaAttachment type from MIME type ─────────────────────────
  const { url, filename, mimetype, size } = fileInfo;
  let attachmentType;
  if (mimetype === 'image/jpeg' || mimetype === 'image/png') {
    attachmentType = 'image';
  } else if (mimetype === 'application/pdf') {
    attachmentType = 'pdf';
  } else {
    const err = new Error('Unsupported file type. Only JPEG, PNG, and PDF files are allowed.');
    err.statusCode = 400;
    throw err;
  }

  // ── Update mediaAttachment ────────────────────────────────────────────────
  campaign.mediaAttachment = {
    type: attachmentType,
    url,
    filename,
    size,
  };
  campaign.lastModifiedBy = userId;

  // ── Persist ───────────────────────────────────────────────────────────────
  await campaign.save();

  // ── Populate and return ───────────────────────────────────────────────────
  await campaign.populate([
    { path: 'targetSegment', select: 'name contactCount' },
    { path: 'createdBy', select: 'firstName lastName email' },
    { path: 'lastModifiedBy', select: 'firstName lastName email' },
  ]);

  logger.info(`Campaign media attached: ${campaign._id} by user ${userId}`);
  return campaign.toObject();
};

module.exports = {
  listCampaigns,
  createCampaign,
  getCampaignById,
  updateCampaign,
  archiveCampaign,
  cloneCampaign,
  scheduleCampaign,
  executeCampaign,
  cancelCampaign,
  previewCampaign,
  getCampaignStatus,
  attachMediaToCampaign,
};
