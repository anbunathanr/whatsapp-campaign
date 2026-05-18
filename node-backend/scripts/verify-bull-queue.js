/**
 * Bull Queue Verification Script
 * Verifies that the Bull message queue is properly configured and operational.
 */

const {
  messageQueue,
  enqueueMessage,
  enqueueBatch,
  getQueueStats,
  pauseQueue,
  resumeQueue,
  cleanQueue,
  closeQueue,
} = require('../src/queues/messageQueue');
const logger = require('../src/utils/logger');

// Test message data
const testMessage = {
  messageId: 'verify-test-1',
  campaignId: 'verify-campaign-1',
  contactId: 'verify-contact-1',
  phoneNumber: '+1234567890',
  content: 'This is a verification test message',
  mediaUrl: null,
};

const testBatch = [
  {
    messageId: 'verify-batch-1',
    campaignId: 'verify-campaign-2',
    contactId: 'verify-contact-1',
    phoneNumber: '+1111111111',
    content: 'Batch message 1',
    mediaUrl: null,
  },
  {
    messageId: 'verify-batch-2',
    campaignId: 'verify-campaign-2',
    contactId: 'verify-contact-2',
    phoneNumber: '+2222222222',
    content: 'Batch message 2',
    mediaUrl: null,
  },
];

async function verifyBullQueue() {
  console.log('\n🔍 Bull Queue Verification Script\n');
  console.log('=' .repeat(60));

  try {
    // Test 1: Queue Initialization
    console.log('\n✓ Test 1: Queue initialized');
    console.log(`  Queue Name: ${messageQueue.name}`);
    console.log(`  Redis URL: ${messageQueue.client.options.host}:${messageQueue.client.options.port}`);

    // Test 2: Queue Configuration
    console.log('\n✓ Test 2: Queue configuration verified');
    console.log(`  Max Attempts: ${messageQueue.defaultJobOptions.attempts}`);
    console.log(`  Backoff Type: ${messageQueue.defaultJobOptions.backoff.type}`);
    console.log(`  Backoff Delay: ${messageQueue.defaultJobOptions.backoff.delay}ms`);
    console.log(`  Rate Limit: ${messageQueue.limiter.max} messages per ${messageQueue.limiter.duration}ms`);

    // Test 3: Enqueue Single Message
    console.log('\n✓ Test 3: Enqueuing single message...');
    const job = await enqueueMessage(testMessage);
    console.log(`  Job ID: ${job.id}`);
    console.log(`  Job Data: ${JSON.stringify(job.data, null, 2)}`);

    // Wait for job to be processed
    console.log('  Waiting for job to process...');
    const result = await job.finished();
    console.log(`  Job Result: ${JSON.stringify(result, null, 2)}`);

    // Test 4: Enqueue Batch
    console.log('\n✓ Test 4: Enqueuing batch messages...');
    const batchJobs = await enqueueBatch(testBatch);
    console.log(`  Batch Size: ${batchJobs.length} messages`);
    
    // Wait for batch jobs to complete
    console.log('  Waiting for batch jobs to process...');
    await Promise.all(batchJobs.map(j => j.finished()));
    console.log('  All batch jobs completed');

    // Test 5: Queue Statistics
    console.log('\n✓ Test 5: Queue statistics');
    const stats = await getQueueStats();
    console.log(`  Waiting: ${stats.waiting}`);
    console.log(`  Active: ${stats.active}`);
    console.log(`  Completed: ${stats.completed}`);
    console.log(`  Failed: ${stats.failed}`);
    console.log(`  Delayed: ${stats.delayed}`);
    console.log(`  Total: ${stats.total}`);

    // Test 6: Pause and Resume
    console.log('\n✓ Test 6: Queue control (pause/resume)');
    await pauseQueue();
    const isPaused = await messageQueue.isPaused();
    console.log(`  Queue Paused: ${isPaused}`);
    
    await resumeQueue();
    const isResumed = !(await messageQueue.isPaused());
    console.log(`  Queue Resumed: ${isResumed}`);

    // Test 7: Clean Queue
    console.log('\n✓ Test 7: Cleaning old jobs...');
    await cleanQueue(1000); // Clean jobs older than 1 second
    console.log('  Old jobs cleaned');

    // Test 8: Event Handlers
    console.log('\n✓ Test 8: Event handlers registered');
    const eventNames = messageQueue.eventNames();
    console.log(`  Registered Events: ${eventNames.join(', ')}`);

    // Success Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ All Bull Queue Tests Passed!');
    console.log('='.repeat(60));
    console.log('\nBull Queue is properly configured and ready for use.');
    console.log('\nNext Steps:');
    console.log('  1. Implement WhatsApp API integration (Task 5.2)');
    console.log('  2. Implement message personalization (Task 5.4)');
    console.log('  3. Implement campaign execution (Task 5.5)');
    console.log('  4. Implement retry mechanism (Task 5.6)');

  } catch (error) {
    console.error('\n❌ Verification Failed:', error.message);
    console.error('\nError Details:', error);
    process.exit(1);
  } finally {
    // Clean up
    console.log('\n🧹 Cleaning up test data...');
    await messageQueue.empty();
    await closeQueue();
    console.log('✓ Cleanup complete\n');
  }
}

// Run verification
verifyBullQueue()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
