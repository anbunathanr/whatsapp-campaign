const cron = require('node-cron');
const Campaign = require('../models/Campaign');
const logger = require('../utils/logger');
const campaignService = require('./campaign.service');

/**
 * Initializes the node-cron scheduler to run every minute.
 * It queries campaigns that are in 'scheduled' status where scheduledAt is <= current time,
 * and calls executeCampaign on them.
 */
const initScheduler = () => {
  // Run at the 0th second of every minute
  cron.schedule('* * * * *', async () => {
    logger.debug('Scheduler running: checking for scheduled campaigns');
    try {
      const now = new Date();
      
      const campaignsToExecute = await Campaign.find({
        status: 'scheduled',
        scheduledAt: { $lte: now }
      }).lean();

      if (campaignsToExecute.length === 0) {
        return;
      }

      logger.info(`Scheduler found ${campaignsToExecute.length} campaigns to execute.`);

      for (const campaign of campaignsToExecute) {
        try {
          // Pass a system indicator as the userId or null if system execution
          await campaignService.executeCampaign(campaign._id, campaign.createdBy);
        } catch (execErr) {
          logger.error(`Scheduler failed to execute campaign ${campaign._id}: ${execErr.message}`);
          // Prevent getting stuck: mark as failed or cancel it if unrecoverable?
          // For now, we update it so it won't repeatedly execute and throw errors
          await Campaign.findByIdAndUpdate(campaign._id, { 
            status: 'cancelled', 
            errorMessage: execErr.message 
          });
        }
      }
    } catch (err) {
      logger.error('Scheduler encountered an error: ' + err.message);
    }
  });

  logger.info('Campaign scheduler initialized.');
};

module.exports = {
  initScheduler
};
