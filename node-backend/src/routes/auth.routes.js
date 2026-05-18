const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

// Placeholder controller — will be implemented in Task 2.2 / 2.3
const authController = require('../controllers/auth.controller');

// GET /api/auth/registration-status – Public (check if self-registration is open)
router.get('/registration-status', async (req, res) => {
  try {
    const User = require('../models/User');
    const count = await User.countDocuments();
    const { sendSuccess } = require('../utils/apiResponse');
    return sendSuccess(res, { open: count === 0 }, count === 0 ? 'Registration is open' : 'Registration is admin-only');
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const User = require('../models/User');
    const count = await User.countDocuments();
    if (count === 0) {
      // First-time setup — skip auth entirely, allow public registration
      return next();
    }
    // Subsequent registrations require Admin token
    return authenticate(req, res, () => authorize('Admin')(req, res, next));
  } catch (e) {
    return next(e);
  }
}, authController.register);

// POST /api/auth/login – Public (no authentication required)
router.post('/login', authLimiter, authController.login);

// POST /api/auth/logout – All authenticated users
router.post('/logout', authenticate, authController.logout);

// POST /api/auth/refresh – All authenticated users (token refresh)
router.post('/refresh', authController.refresh);

// GET /api/auth/me – All authenticated users
router.get('/me', authenticate, authController.getMe);

// PUT /api/auth/profile – All authenticated users
router.put('/profile', authenticate, authController.updateProfile);

// PUT /api/auth/password – All authenticated users
router.put('/password', authenticate, authController.changePassword);

// GET /api/auth/me/credentials – All authenticated users
router.get('/me/credentials', authenticate, authController.getCredentials);

// PUT /api/auth/me/credentials – All authenticated users
router.put('/me/credentials', authenticate, authController.updateCredentials);

module.exports = router;
