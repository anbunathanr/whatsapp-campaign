/**
 * ML Classifier Service
 * Calls the Python ML service to classify contacts into industry categories.
 * Full implementation: Task 3.4
 */
const axios = require('axios');
const config = require('../config');

/**
 * Classify a contact's industry based on job title and company name.
 * Calls POST /api/classify-contact on the Python ML service.
 *
 * @param {string} jobTitle
 * @param {string} company
 * @returns {Promise<string>} Industry classification label
 */
const classifyIndustry = async (jobTitle, company) => {
  try {
    const response = await axios.post(`${config.mlService.url}/api/classify-contact`, {
      jobTitle: jobTitle || '',
      companyName: company || '',
    });
    return response.data.predictedIndustry || 'Other';
  } catch (_err) {
    // Fallback to 'Other' if ML service is unavailable
    return 'Other';
  }
};

/**
 * Classify a batch of contacts by calling /api/classify-contact for each one
 * in parallel using Promise.allSettled (no batch endpoint exists in the Python service).
 *
 * Concurrency is capped at 10 simultaneous requests to avoid overwhelming the service.
 *
 * @param {Array<{jobTitle: string, company: string}>} contacts
 * @returns {Promise<string[]>} Array of industry labels in the same order
 */
const classifyBatch = async (contacts) => {
  if (!contacts || contacts.length === 0) {
    return [];
  }

  const CONCURRENCY_LIMIT = 10;
  const results = new Array(contacts.length).fill('Other');

  // Process in chunks to limit concurrency
  for (let i = 0; i < contacts.length; i += CONCURRENCY_LIMIT) {
    const chunk = contacts.slice(i, i + CONCURRENCY_LIMIT);
    const chunkResults = await Promise.allSettled(
      chunk.map((contact) =>
        axios
          .post(`${config.mlService.url}/api/classify-contact`, {
            jobTitle: contact.jobTitle || '',
            companyName: contact.company || '',
          })
          .then((response) => response.data.predictedIndustry || 'Other')
          .catch(() => 'Other')
      )
    );

    for (let j = 0; j < chunkResults.length; j++) {
      const settled = chunkResults[j];
      results[i + j] = settled.status === 'fulfilled' ? settled.value : 'Other';
    }
  }

  return results;
};

/**
 * Check whether the Python ML service is available.
 * Calls GET /health on the ML service.
 *
 * @returns {Promise<boolean>} true if the service is healthy, false otherwise
 */
const isAvailable = async () => {
  try {
    const response = await axios.get(`${config.mlService.url}/health`, { timeout: 3000 });
    return response.status === 200 && response.data.status === 'healthy';
  } catch (_err) {
    return false;
  }
};

module.exports = { classifyIndustry, classifyBatch, isAvailable };
