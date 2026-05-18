const { sendSuccess, sendError } = require('../utils/apiResponse');
const Workflow = require('../models/Workflow');
const workflowService = require('../services/workflow.service');

const listWorkflows = async (req, res) => {
  try {
    const workflows = await Workflow.find({}).sort({ createdAt: -1 }).lean();
    return sendSuccess(res, workflows, 'Workflows retrieved');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

const createWorkflow = async (req, res) => {
  try {
    const workflow = new Workflow({
      ...req.body,
      createdBy: req.user._id,
      organization: req.user.organization || null,
    });
    await workflow.save();
    return sendSuccess(res, workflow, 'Workflow created', 201);
  } catch (err) {
    return sendError(res, err.message, 400);
  }
};

const getWorkflow = async (req, res) => {
  try {
    const workflow = await Workflow.findById(req.params.id).lean();
    if (!workflow) {return sendError(res, 'Workflow not found', 404);}
    return sendSuccess(res, workflow, 'Workflow retrieved');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

const updateWorkflow = async (req, res) => {
  try {
    const workflow = await Workflow.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!workflow) {return sendError(res, 'Workflow not found', 404);}
    return sendSuccess(res, workflow, 'Workflow updated');
  } catch (err) {
    return sendError(res, err.message, 400);
  }
};

const deleteWorkflow = async (req, res) => {
  try {
    const workflow = await Workflow.findByIdAndDelete(req.params.id);
    if (!workflow) {return sendError(res, 'Workflow not found', 404);}
    return sendSuccess(res, null, 'Workflow deleted');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

const executeWorkflow = async (req, res) => {
  try {
    const workflow = await Workflow.findById(req.params.id);
    if (!workflow) {return sendError(res, 'Workflow not found', 404);}
    
    const result = await workflowService.executeN8nWorkflow(workflow.n8nWorkflowId, req.body);
    
    workflow.executionCount += 1;
    workflow.lastExecutedAt = new Date();
    await workflow.save();
    
    return sendSuccess(res, result, 'Workflow executed');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

const getWorkflowLogs = async (req, res) => {
  return sendError(res, 'Logs not implemented yet', 501);
};

module.exports = {
  listWorkflows,
  createWorkflow,
  getWorkflow,
  updateWorkflow,
  deleteWorkflow,
  executeWorkflow,
  getWorkflowLogs,
};
