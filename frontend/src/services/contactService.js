// Contact service - API calls for contact management
import api from './api';

const contactService = {
  getContacts: async (params = {}) => {
    // _t busts the browser HTTP cache so newly-added contacts appear immediately
    const response = await api.get('/contacts', { params: { ...params, _t: Date.now() } });
    return response.data?.data ?? response.data;
  },

  getContact: async (id) => {
    const response = await api.get(`/contacts/${id}`);
    return response.data?.data ?? response.data;
  },

  createContact: async (contactData) => {
    const response = await api.post('/contacts', contactData);
    return response.data?.data ?? response.data;
  },

  updateContact: async (id, contactData) => {
    const response = await api.put(`/contacts/${id}`, contactData);
    return response.data?.data ?? response.data;
  },

  deleteContact: async (id) => {
    const response = await api.delete(`/contacts/${id}`);
    return response.data?.data ?? response.data;
  },

  bulkDeleteContacts: async (contactIds) => {
    const response = await api.post('/contacts/bulk-delete', { contactIds });
    return response.data?.data ?? response.data;
  },

  bulkTagContacts: async (contactIds, tags) => {
    const response = await api.post('/contacts/bulk-tag', { contactIds, tags });
    return response.data?.data ?? response.data;
  },

  importContacts: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/contacts/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    // For import, map the backend shape to the shape expected by ContactImport.jsx
    const data = response.data?.data ?? response.data;
    if (data.summary) {
       return {
         imported: data.summary.successCount || 0,
         skipped: data.summary.duplicateCount || 0,
         normalized: data.summary.normalizedCount || 0,
         invalid: data.summary.invalidCount || 0,
         errors: data.errorReport ? data.errorReport.map(e => `Row ${e.row}: ${e.reason}`) : []
       };
    }
    return data;
  },

  exportContacts: async (filters = {}) => {
    const response = await api.get('/contacts/export', {
      params: filters,
      responseType: 'blob',
    });
    return response.data;
  },

  getSegments: async () => {
    const response = await api.get('/contacts/segments');
    return response.data?.data ?? response.data;
  },

  getSegment: async (id) => {
    const response = await api.get(`/contacts/segments/${id}`);
    return response.data?.data ?? response.data;
  },

  createSegment: async (segmentData) => {
    const response = await api.post('/contacts/segments', segmentData);
    return response.data?.data ?? response.data;
  },

  updateSegment: async (id, segmentData) => {
    const response = await api.put(`/contacts/segments/${id}`, segmentData);
    return response.data?.data ?? response.data;
  },

  deleteSegment: async (id) => {
    const response = await api.delete(`/contacts/segments/${id}`);
    return response.data?.data ?? response.data;
  },

  previewSegment: async (filterCriteria) => {
    const response = await api.post('/contacts/segments/preview', { filterCriteria });
    return response.data?.data ?? response.data;
  },
};

export default contactService;
