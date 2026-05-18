import api from './api';

const adminService = {
  // ── Audit Logs ─────────────────────────────────────────────────────────────
  getAuditLogs: async (params = {}) => {
    const response = await api.get('/admin/audit-logs', { params });
    return response.data?.data ?? response.data;
  },

  // ── System Health ──────────────────────────────────────────────────────────
  getSystemHealth: async () => {
    const response = await api.get('/admin/system-health');
    return response.data?.data ?? response.data;
  },

  // ── User Management ────────────────────────────────────────────────────────
  listUsers: async (params = {}) => {
    const response = await api.get('/admin/users', { params });
    return response.data?.data ?? response.data;
  },

  createUser: async (userData) => {
    const response = await api.post('/admin/users', userData);
    return response.data?.data ?? response.data;
  },

  updateUser: async (id, updates) => {
    const response = await api.put(`/admin/users/${id}`, updates);
    return response.data?.data ?? response.data;
  },

  deleteUser: async (id) => {
    const response = await api.delete(`/admin/users/${id}`);
    return response.data?.data ?? response.data;
  },

  reactivateUser: async (id) => {
    const response = await api.patch(`/admin/users/${id}/reactivate`);
    return response.data?.data ?? response.data;
  },
};

export default adminService;
