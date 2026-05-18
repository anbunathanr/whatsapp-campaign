import api from './api';

const workflowService = {
  getWorkflows: async () => {
    const response = await api.get('/workflows');
    return response.data?.data ?? response.data;
  },
  getWorkflow: async (id) => {
    const response = await api.get(`/workflows/${id}`);
    return response.data?.data ?? response.data;
  },
  createWorkflow: async (data) => {
    const response = await api.post('/workflows', data);
    return response.data?.data ?? response.data;
  },
  updateWorkflow: async (id, data) => {
    const response = await api.put(`/workflows/${id}`, data);
    return response.data?.data ?? response.data;
  },
  deleteWorkflow: async (id) => {
    const response = await api.delete(`/workflows/${id}`);
    return response.data?.data ?? response.data;
  },
  executeWorkflow: async (id, payload) => {
    const response = await api.post(`/workflows/${id}/execute`, payload);
    return response.data?.data ?? response.data;
  }
};

export default workflowService;
