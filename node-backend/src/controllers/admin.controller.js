const { sendSuccess, sendError } = require('../utils/apiResponse');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const mongoose = require('mongoose');

// ─── User Management ──────────────────────────────────────────────────────────

const listUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';

    const query = search
      ? {
          $or: [
            { firstName: { $regex: search, $options: 'i' } },
            { lastName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
          ],
        }
      : {};

    if (req.user.role !== 'Super_Admin') {
      query.organization = req.user.organization._id;
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    return sendSuccess(res, { users, total, page, limit, pages: Math.ceil(total / limit) }, 'Users retrieved');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

const createUser = async (req, res) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;
    if (!email || !password || !firstName || !lastName) {
      return sendError(res, 'email, password, firstName, and lastName are required', 400);
    }

    const existing = await User.findOne({ email: email.trim().toLowerCase() });
    if (existing) return sendError(res, 'Email already registered', 409);

    let targetRole = role || 'Campaign_Manager';
    let targetOrg = req.user.role === 'Super_Admin' ? null : req.user.organization._id;

    if (req.user.role !== 'Super_Admin') {
      // Org_Admin can only create Campaign_Manager or Support_Staff in their own org
      if (['Super_Admin', 'Org_Admin'].includes(targetRole)) {
        return sendError(res, 'You do not have permission to create users with this role.', 403);
      }
    } else {
      // Super_Admin creating a user
      if (req.body.organization) {
        targetOrg = req.body.organization;
      } else if (targetRole === 'Org_Admin') {
        // Auto-create an approved organization for the new Org_Admin
        const Organization = require('../models/Organization');
        const baseSlug = `${firstName}-${lastName}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const org = new Organization({
          name: `${firstName} ${lastName}'s Organization`,
          slug: `${baseSlug}-${Date.now()}`,
          contactEmail: email.trim().toLowerCase(),
          status: 'approved',
          approvedBy: req.user._id,
          approvedAt: new Date(),
        });
        await org.save();
        targetOrg = org._id;
      }
    }

    const user = new User({
      email: email.trim().toLowerCase(),
      passwordHash: password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role: targetRole,
      organization: targetOrg,
    });
    await user.save();

    const { passwordHash: _, ...safeUser } = user.toObject();
    return sendSuccess(res, safeUser, 'User created', 201);
  } catch (err) {
    return sendError(res, err.message, 400);
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return sendError(res, 'Invalid user ID', 400);

    // Prevent admin from accidentally demoting themselves
    if (id === String(req.user._id) && req.body.role && req.body.role !== 'Admin') {
      return sendError(res, 'You cannot change your own role.', 403);
    }

    const allowedFields = ['firstName', 'lastName', 'role', 'isActive'];
    const updates = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const query = { _id: id };
    if (req.user.role !== 'Super_Admin') {
      query.organization = req.user.organization._id;
    }

    const user = await User.findOneAndUpdate(query, updates, { new: true, runValidators: true })
      .select('-passwordHash')
      .lean();

    if (!user) return sendError(res, 'User not found', 404);
    return sendSuccess(res, user, 'User updated');
  } catch (err) {
    return sendError(res, err.message, 400);
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return sendError(res, 'Invalid user ID', 400);
    if (id === String(req.user._id)) return sendError(res, 'You cannot deactivate your own account.', 403);

    const query = { _id: id };
    if (req.user.role !== 'Super_Admin') {
      query.organization = req.user.organization._id;
    }

    const user = await User.findOneAndUpdate(query, { isActive: false }, { new: true }).select('-passwordHash').lean();
    if (!user) return sendError(res, 'User not found', 404);
    return sendSuccess(res, user, 'User deactivated');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Audit Logs ───────────────────────────────────────────────────────────────

const getAuditLogs = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const page = parseInt(req.query.page, 10) || 1;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.action) query.action = req.query.action;
    if (req.query.userId) query.user = req.query.userId;
    if (req.query.resourceType) query.resourceType = req.query.resourceType;

    if (req.user.role !== 'Super_Admin' && req.user.role !== 'Admin') {
      query.organization = req.user.organization?._id || req.user.organization;
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', 'firstName lastName email role')
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    return sendSuccess(res, { logs, total, page, limit, pages: Math.ceil(total / limit) }, 'Audit logs retrieved');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── System Health ────────────────────────────────────────────────────────────

const getSystemHealth = async (req, res) => {
  try {
    const { getConnectionStatus } = require('../config/database');
    const dbStatus = getConnectionStatus();

    const Campaign = require('../models/Campaign');
    const Contact = require('../models/Contact');
    
    const query = (req.user.role === 'Super_Admin' || req.user.role === 'Admin') ? {} : { organization: req.user.organization?._id || req.user.organization };

    const [totalUsers, totalCampaigns, totalContacts, activeCampaigns] = await Promise.all([
      User.countDocuments(query),
      Campaign.countDocuments(query),
      Contact.countDocuments(query),
      Campaign.countDocuments({ ...query, status: { $in: ['scheduled', 'executing'] } }),
    ]);

    const mem = process.memoryUsage();
    const health = {
      status: dbStatus.isConnected ? 'healthy' : 'degraded',
      database: dbStatus.isConnected ? 'connected' : 'disconnected',
      uptime: Math.floor(process.uptime()),
      memoryUsageMB: Math.round(mem.heapUsed / 1024 / 1024),
      memoryTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      stats: { totalUsers, totalCampaigns, totalContacts, activeCampaigns },
      timestamp: new Date(),
    };

    return sendSuccess(res, health, 'System health retrieved');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

module.exports = {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  getAuditLogs,
  getSystemHealth,
};
