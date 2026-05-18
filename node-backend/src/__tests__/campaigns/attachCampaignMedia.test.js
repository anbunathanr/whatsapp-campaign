'use strict';

/**
 * Tests for POST /api/campaigns/:id/media — attach media to a campaign (Task 4.9)
 *
 * Validates that uploading a media file saves the file URL and metadata into
 * the campaign's mediaAttachment field (Requirements 4.4, 4.9).
 *
 * Tests:
 *   - Saves url, filename, size, and type in campaign.mediaAttachment for JPEG
 *   - Saves url, filename, size, and type in campaign.mediaAttachment for PNG
 *   - Saves url, filename, size, and type in campaign.mediaAttachment for PDF
 *   - url stored in mediaAttachment points to /uploads/media/ path
 *   - mediaAttachment.type is 'image' for JPEG/PNG uploads
 *   - mediaAttachment.type is 'pdf' for PDF uploads
 *   - Returns the updated campaign document in the response
 *   - Returns 404 when campaign does not exist
 *   - Returns 409 when campaign is not in draft or scheduled status
 *   - Returns 400 when no file is provided
 *   - Returns 400 for invalid campaign ID format
 *   - Replaces existing mediaAttachment when a new file is uploaded
 *   - Rejects spoofed files (wrong magic bytes)
 *   - Rejects files exceeding 5 MB
 *
 * Uses mongodb-memory-server for an isolated in-memory MongoDB instance.
 * Auth middleware is mocked so no real JWT is needed.
 */

process.env.NODE_ENV = 'test';

// ── Mock auth middleware before app is loaded ─────────────────────────────────
// The mock uses a real ObjectId so Mongoose can cast it to the lastModifiedBy
// field without a BSONError.
jest.mock('../../middleware/auth', () => {
  const { Types } = require('mongoose');
  const userId = new Types.ObjectId();
  return {
    authenticate: (_req, _res, next) => {
      _req.user = { _id: userId, role: 'Admin' };
      next();
    },
    authorize: (..._roles) => (_req, _res, next) => next(),
  };
});

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../../app');
const Campaign = require('../../models/Campaign');
const User = require('../../models/User');
const Segment = require('../../models/Segment');

// ── In-memory MongoDB lifecycle ───────────────────────────────────────────────
let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Campaign.deleteMany({});
  await User.deleteMany({});
  await Segment.deleteMany({});
});

// ── Minimal valid magic-byte buffers ─────────────────────────────────────────

/** JPEG: starts with FF D8 FF */
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

/** PNG: exact 8-byte PNG signature */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PDF: starts with %PDF-1.4 */
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

/** Spoofed: 8 null bytes — no valid magic signature */
const SPOOFED_MAGIC = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

// ── Helpers ───────────────────────────────────────────────────────────────────

const createUser = async (overrides = {}) =>
  User.create({
    email: `user-${Date.now()}-${Math.random()}@example.com`,
    passwordHash: 'irrelevant-hash',
    firstName: 'Test',
    lastName: 'User',
    role: 'Campaign_Manager',
    ...overrides,
  });

const createSegment = async (userId, overrides = {}) =>
  Segment.create({
    name: 'Test Segment',
    filterCriteria: { industries: ['Technology'] },
    contactCount: 50,
    createdBy: userId,
    ...overrides,
  });

const createCampaign = async (userId, segmentId, overrides = {}) =>
  Campaign.create({
    name: 'Test Campaign',
    type: 'promotional',
    status: 'draft',
    targetSegment: segmentId,
    messageTemplate: 'Hello {{name}}!',
    createdBy: userId,
    ...overrides,
  });

/**
 * POST /api/campaigns/:id/media with a buffer as the attached file.
 */
const attachMedia = (campaignId, buffer, filename, contentType) =>
  request(app)
    .post(`/api/campaigns/${campaignId}/media`)
    .attach('media', buffer, { filename, contentType });

// ── mediaAttachment field persistence ────────────────────────────────────────

describe('POST /api/campaigns/:id/media — saves URL in mediaAttachment', () => {
  it('saves the file URL in campaign.mediaAttachment.url for a JPEG upload', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const res = await attachMedia(campaign._id.toString(), JPEG_MAGIC, 'photo.jpg', 'image/jpeg');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.campaign.mediaAttachment.url).toMatch(/^\/uploads\/media\//);
  });

  it('saves the file URL in campaign.mediaAttachment.url for a PNG upload', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const res = await attachMedia(campaign._id.toString(), PNG_MAGIC, 'image.png', 'image/png');

    expect(res.status).toBe(200);
    expect(res.body.data.campaign.mediaAttachment.url).toMatch(/^\/uploads\/media\//);
  });

  it('saves the file URL in campaign.mediaAttachment.url for a PDF upload', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const res = await attachMedia(campaign._id.toString(), PDF_MAGIC, 'doc.pdf', 'application/pdf');

    expect(res.status).toBe(200);
    expect(res.body.data.campaign.mediaAttachment.url).toMatch(/^\/uploads\/media\//);
  });

  it('persists the mediaAttachment URL to the database', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const res = await attachMedia(campaign._id.toString(), JPEG_MAGIC, 'photo.jpg', 'image/jpeg');
    expect(res.status).toBe(200);

    const savedUrl = res.body.data.campaign.mediaAttachment.url;

    // Verify the URL was actually persisted in MongoDB
    const dbCampaign = await Campaign.findById(campaign._id).lean();
    expect(dbCampaign.mediaAttachment.url).toBe(savedUrl);
  });

  it('saves the original filename in campaign.mediaAttachment.filename', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const res = await attachMedia(campaign._id.toString(), JPEG_MAGIC, 'my-photo.jpg', 'image/jpeg');

    expect(res.status).toBe(200);
    expect(res.body.data.campaign.mediaAttachment.filename).toBe('my-photo.jpg');
  });

  it('saves the file size in campaign.mediaAttachment.size', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const res = await attachMedia(campaign._id.toString(), PNG_MAGIC, 'image.png', 'image/png');

    expect(res.status).toBe(200);
    expect(typeof res.body.data.campaign.mediaAttachment.size).toBe('number');
    expect(res.body.data.campaign.mediaAttachment.size).toBeGreaterThan(0);
  });
});

// ── mediaAttachment.type mapping ──────────────────────────────────────────────

describe('POST /api/campaigns/:id/media — mediaAttachment.type mapping', () => {
  it('sets mediaAttachment.type to "image" for a JPEG upload', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const res = await attachMedia(campaign._id.toString(), JPEG_MAGIC, 'photo.jpg', 'image/jpeg');

    expect(res.status).toBe(200);
    expect(res.body.data.campaign.mediaAttachment.type).toBe('image');
  });

  it('sets mediaAttachment.type to "image" for a PNG upload', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const res = await attachMedia(campaign._id.toString(), PNG_MAGIC, 'image.png', 'image/png');

    expect(res.status).toBe(200);
    expect(res.body.data.campaign.mediaAttachment.type).toBe('image');
  });

  it('sets mediaAttachment.type to "pdf" for a PDF upload', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const res = await attachMedia(campaign._id.toString(), PDF_MAGIC, 'doc.pdf', 'application/pdf');

    expect(res.status).toBe(200);
    expect(res.body.data.campaign.mediaAttachment.type).toBe('pdf');
  });
});

// ── Response shape ────────────────────────────────────────────────────────────

describe('POST /api/campaigns/:id/media — response shape', () => {
  it('returns the updated campaign document in response.data.campaign', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const res = await attachMedia(campaign._id.toString(), JPEG_MAGIC, 'photo.jpg', 'image/jpeg');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('campaign');
    expect(res.body.data.campaign._id).toBe(campaign._id.toString());
  });

  it('returned campaign has all expected top-level fields', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const res = await attachMedia(campaign._id.toString(), JPEG_MAGIC, 'photo.jpg', 'image/jpeg');

    expect(res.status).toBe(200);
    const c = res.body.data.campaign;
    expect(c).toHaveProperty('name');
    expect(c).toHaveProperty('type');
    expect(c).toHaveProperty('status');
    expect(c).toHaveProperty('mediaAttachment');
  });
});

// ── Replaces existing mediaAttachment ─────────────────────────────────────────

describe('POST /api/campaigns/:id/media — replaces existing attachment', () => {
  it('overwrites a previous mediaAttachment with the new file URL', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, {
      mediaAttachment: {
        type: 'image',
        url: '/uploads/media/old-file.jpg',
        filename: 'old-file.jpg',
        size: 512,
      },
    });

    const res = await attachMedia(campaign._id.toString(), PDF_MAGIC, 'new-doc.pdf', 'application/pdf');

    expect(res.status).toBe(200);
    expect(res.body.data.campaign.mediaAttachment.type).toBe('pdf');
    expect(res.body.data.campaign.mediaAttachment.filename).toBe('new-doc.pdf');
    expect(res.body.data.campaign.mediaAttachment.url).not.toBe('/uploads/media/old-file.jpg');
  });
});

// ── Error cases ───────────────────────────────────────────────────────────────

describe('POST /api/campaigns/:id/media — error cases', () => {
  it('returns 404 when campaign does not exist', async () => {
    const nonExistentId = new mongoose.Types.ObjectId().toString();

    const res = await attachMedia(nonExistentId, JPEG_MAGIC, 'photo.jpg', 'image/jpeg');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for an invalid campaign ID format', async () => {
    const res = await attachMedia('not-a-valid-id', JPEG_MAGIC, 'photo.jpg', 'image/jpeg');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 409 when campaign status is "executing"', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, { status: 'executing' });

    const res = await attachMedia(campaign._id.toString(), JPEG_MAGIC, 'photo.jpg', 'image/jpeg');

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('returns 409 when campaign status is "completed"', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, { status: 'completed' });

    const res = await attachMedia(campaign._id.toString(), JPEG_MAGIC, 'photo.jpg', 'image/jpeg');

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('returns 409 when campaign status is "archived"', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, { status: 'archived' });

    const res = await attachMedia(campaign._id.toString(), JPEG_MAGIC, 'photo.jpg', 'image/jpeg');

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when no file is attached', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const res = await request(app)
      .post(`/api/campaigns/${campaign._id}/media`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for a spoofed file (wrong magic bytes)', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const res = await attachMedia(campaign._id.toString(), SPOOFED_MAGIC, 'photo.jpg', 'image/jpeg');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for a file exceeding 5 MB', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const oversizedBuf = Buffer.alloc(6 * 1024 * 1024, 0xff);
    JPEG_MAGIC.copy(oversizedBuf, 0);

    const res = await attachMedia(campaign._id.toString(), oversizedBuf, 'large.jpg', 'image/jpeg');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/too large|size/i);
  });
});

// ── Allowed statuses ──────────────────────────────────────────────────────────

describe('POST /api/campaigns/:id/media — allowed campaign statuses', () => {
  it('allows attaching media to a draft campaign', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, { status: 'draft' });

    const res = await attachMedia(campaign._id.toString(), JPEG_MAGIC, 'photo.jpg', 'image/jpeg');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('allows attaching media to a scheduled campaign', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const futureDate = new Date(Date.now() + 3600 * 1000);
    const campaign = await createCampaign(user._id, segment._id, {
      status: 'scheduled',
      scheduledAt: futureDate,
    });

    const res = await attachMedia(campaign._id.toString(), PNG_MAGIC, 'image.png', 'image/png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
