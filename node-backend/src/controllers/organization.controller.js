const { sendSuccess, sendError, sendCreated } = require('../utils/apiResponse');
const Organization = require('../models/Organization');
const User = require('../models/User');

const listOrganizations = async (req, res) => {
  try {
    const orgs = await Organization.find()
      .populate('approvedBy', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 });
    
    // Get user counts for each org
    const orgData = await Promise.all(orgs.map(async (org) => {
      const userCount = await User.countDocuments({ organization: org._id });
      return { ...org.toObject(), userCount };
    }));

    return sendSuccess(res, { organizations: orgData }, 'Organizations retrieved successfully');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

const createOrganization = async (req, res) => {
  try {
    const { name, contactEmail, description, adminEmail, adminFirstName, adminLastName, adminPassword } = req.body;

    if (!name || !contactEmail || !adminEmail || !adminFirstName || !adminLastName || !adminPassword) {
      return sendError(res, 'Organization details and Admin details are required', 400);
    }

    // Check if admin email already exists
    const existingUser = await User.findOne({ email: adminEmail.trim().toLowerCase() });
    if (existingUser) {
      return sendError(res, 'Admin email is already registered', 409);
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString().slice(-4);

    const org = new Organization({
      name,
      slug,
      contactEmail,
      description,
      status: 'approved', // Super Admin created it, so pre-approved
      approvedBy: req.user._id,
      approvedAt: new Date(),
    });
    await org.save();

    const admin = new User({
      email: adminEmail.trim().toLowerCase(),
      firstName: adminFirstName.trim(),
      lastName: adminLastName.trim(),
      passwordHash: adminPassword,
      role: 'Org_Admin',
      organization: org._id,
      isActive: true,
    });
    await admin.save();

    return sendCreated(res, { organization: org, admin: { email: admin.email, id: admin._id } }, 'Organization created');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

const approveOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    const org = await Organization.findByIdAndUpdate(
      id,
      { status: 'approved', approvedBy: req.user._id, approvedAt: new Date(), suspendedAt: null, suspendedReason: null },
      { new: true }
    );
    if (!org) return sendError(res, 'Organization not found', 404);
    return sendSuccess(res, { organization: org }, 'Organization approved');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

const suspendOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const org = await Organization.findByIdAndUpdate(
      id,
      { status: 'suspended', suspendedAt: new Date(), suspendedReason: reason },
      { new: true }
    );
    if (!org) return sendError(res, 'Organization not found', 404);
    return sendSuccess(res, { organization: org }, 'Organization suspended');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ── Org Admin Endpoints ──

const getMyOrganization = async (req, res) => {
  try {
    if (req.user.role === 'Super_Admin') return sendError(res, 'Super Admin does not have an organization', 400);
    
    // user.organization is populated in auth middleware
    const org = req.user.organization; 
    return sendSuccess(res, { organization: org }, 'Organization retrieved');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

const updateMyOrganization = async (req, res) => {
  try {
    if (req.user.role === 'Super_Admin') return sendError(res, 'Super Admin does not have an organization', 400);

    const { name, contactEmail, description } = req.body;
    const org = await Organization.findByIdAndUpdate(
      req.user.organization._id,
      { name, contactEmail, description },
      { new: true }
    );

    return sendSuccess(res, { organization: org }, 'Organization updated');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

module.exports = {
  listOrganizations,
  createOrganization,
  approveOrganization,
  suspendOrganization,
  getMyOrganization,
  updateMyOrganization
};
