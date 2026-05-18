const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const adminController = require('../controllers/admin.controller');

// All admin routes require Admin role
router.use(authenticate, authorize('Admin'));

// ── User Management ───────────────────────────────────────────────────────────
router.get('/users', adminController.listUsers);
router.post('/users', adminController.createUser);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);

// Re-activate a deactivated user
router.patch('/users/:id/reactivate', async (req, res) => {
  req.body = { isActive: true };
  req.params.id = req.params.id;
  return adminController.updateUser(req, res);
});

// ── Audit Logs ────────────────────────────────────────────────────────────────
router.get('/audit-logs', adminController.getAuditLogs);

// ── System Health ─────────────────────────────────────────────────────────────
router.get('/system-health', adminController.getSystemHealth);

module.exports = router;

