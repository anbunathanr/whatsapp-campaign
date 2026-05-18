/**
 * Workflow Service
 * Handles n8n workflow integration, trigger management, and auto-response configuration.
 * Full implementation: Tasks 8.2 – 8.5
 */

const axios = require('axios');
const config = require('../config');
const Workflow = require('../models/Workflow');
const logger = require('../utils/logger');

const executeN8nWorkflow = async (n8nWorkflowId, payload) => {
  if (!n8nWorkflowId) {
    logger.warn('workflow.service: executeN8nWorkflow called with no n8nWorkflowId — skipping.');
    return null;
  }
  try {
    const url = `${config.n8n.baseUrl}/webhook/${n8nWorkflowId}`;
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
    });
    logger.info(`Successfully executed n8n workflow ${n8nWorkflowId}`);
    return response.data;
  } catch (error) {
    logger.error(`Error executing n8n workflow ${n8nWorkflowId}: ${error.message}`);
    throw error;
  }
};

const handleTriggerEvent = async (eventType, eventData) => {
  const workflows = await Workflow.find({ triggerType: 'event', isActive: true });
  for (const wf of workflows) {
    if (wf.triggerConfig && wf.triggerConfig.event === eventType) {
      await executeN8nWorkflow(wf.n8nWorkflowId, eventData);
      wf.executionCount += 1;
      wf.lastExecutedAt = new Date();
      await wf.save();
    }
  }
};

/**
 * Find the first active keyword workflow whose keyword matches the incoming message.
 * Org-scoped workflows are checked first, then global ones.
 *
 * @param {string} incomingMessage - The body of the incoming WhatsApp message
 * @param {string|null} organizationId - The organization ID to scope the search
 * @returns {Promise<Workflow|null>}
 */
const matchAutoResponse = async (incomingMessage, organizationId = null) => {
  // Build query: active keyword workflows, org-scoped first then global
  const query = { triggerType: 'keyword', isActive: true };
  if (organizationId) {
    // Try org-specific workflows first
    const orgWorkflows = await Workflow.find({ ...query, organization: organizationId });
    for (const wf of orgWorkflows) {
      if (wf.triggerConfig && wf.triggerConfig.keyword) {
        const keywordRegex = new RegExp(`\\b${wf.triggerConfig.keyword}\\b`, 'i');
        if (keywordRegex.test(incomingMessage)) {
          return wf;
        }
      }
    }
  }
  // Fall back to global workflows (no organization set)
  const globalWorkflows = await Workflow.find({ ...query, organization: null });
  for (const wf of globalWorkflows) {
    if (wf.triggerConfig && wf.triggerConfig.keyword) {
      const keywordRegex = new RegExp(`\\b${wf.triggerConfig.keyword}\\b`, 'i');
      if (keywordRegex.test(incomingMessage)) {
        return wf;
      }
    }
  }
  return null;
};

module.exports = {
  executeN8nWorkflow,
  handleTriggerEvent,
  matchAutoResponse,
};
