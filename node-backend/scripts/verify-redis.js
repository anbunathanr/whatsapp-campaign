#!/usr/bin/env node

/**
 * Redis Verification Script
 * Tests Redis connection and basic operations
 */

require('dotenv').config();
const { getRedisClient, disconnectRedis } = require('../src/config/redis');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const log = {
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
};

async function verifyRedis() {
  console.log('\n========================================');
  console.log('Redis Connection Verification');
  console.log('========================================\n');

  let redisClient;
  let allTestsPassed = true;

  try {
    // Test 1: Get Redis client
    log.info('Test 1: Initializing Redis client...');
    redisClient = getRedisClient();
    log.success('Redis client initialized');

    // Test 2: Check connection status
    log.info('Test 2: Checking connection status...');
    const status = redisClient.status;
    if (status === 'ready' || status === 'connecting' || status === 'connect') {
      log.success(`Redis status: ${status}`);
    } else {
      log.error(`Unexpected Redis status: ${status}`);
      allTestsPassed = false;
    }

    // Test 3: PING command
    log.info('Test 3: Testing PING command...');
    const pingResult = await redisClient.ping();
    if (pingResult === 'PONG') {
      log.success('PING successful (PONG received)');
    } else {
      log.error(`PING failed: ${pingResult}`);
      allTestsPassed = false;
    }

    // Test 4: SET/GET operations
    log.info('Test 4: Testing SET/GET operations...');
    const testKey = 'test:verification';
    const testValue = 'Hello Redis!';
    await redisClient.set(testKey, testValue);
    const getValue = await redisClient.get(testKey);
    if (getValue === testValue) {
      log.success('SET/GET operations working correctly');
    } else {
      log.error(`SET/GET failed: expected "${testValue}", got "${getValue}"`);
      allTestsPassed = false;
    }
    await redisClient.del(testKey);

    // Test 5: JSON data handling
    log.info('Test 5: Testing JSON data handling...');
    const jsonKey = 'test:json';
    const jsonData = { name: 'Test', timestamp: Date.now() };
    await redisClient.set(jsonKey, JSON.stringify(jsonData));
    const jsonResult = await redisClient.get(jsonKey);
    const parsedData = JSON.parse(jsonResult);
    if (parsedData.name === jsonData.name) {
      log.success('JSON data handling working correctly');
    } else {
      log.error('JSON data handling failed');
      allTestsPassed = false;
    }
    await redisClient.del(jsonKey);

    // Test 6: Expiration
    log.info('Test 6: Testing key expiration...');
    const expKey = 'test:expiring';
    await redisClient.set(expKey, 'expires', 'EX', 1);
    const ttl = await redisClient.ttl(expKey);
    if (ttl > 0 && ttl <= 1) {
      log.success(`Key expiration set correctly (TTL: ${ttl}s)`);
    } else {
      log.warn(`Unexpected TTL: ${ttl}`);
    }
    await redisClient.del(expKey);

    // Test 7: List operations
    log.info('Test 7: Testing list operations...');
    const listKey = 'test:list';
    await redisClient.rpush(listKey, 'item1', 'item2', 'item3');
    const listLength = await redisClient.llen(listKey);
    if (listLength === 3) {
      log.success('List operations working correctly');
    } else {
      log.error(`List operations failed: expected length 3, got ${listLength}`);
      allTestsPassed = false;
    }
    await redisClient.del(listKey);

    // Test 8: Hash operations
    log.info('Test 8: Testing hash operations...');
    const hashKey = 'test:hash';
    await redisClient.hset(hashKey, 'field1', 'value1');
    await redisClient.hset(hashKey, 'field2', 'value2');
    const hashData = await redisClient.hgetall(hashKey);
    if (hashData.field1 === 'value1' && hashData.field2 === 'value2') {
      log.success('Hash operations working correctly');
    } else {
      log.error('Hash operations failed');
      allTestsPassed = false;
    }
    await redisClient.del(hashKey);

    // Test 9: Bull queue key check
    log.info('Test 9: Checking for Bull queue keys...');
    const queueKeys = await redisClient.keys('bull:whatsapp-messages:*');
    log.info(`Found ${queueKeys.length} Bull queue keys`);
    if (queueKeys.length >= 0) {
      log.success('Bull queue namespace accessible');
    }

    // Display Redis info
    console.log('\n========================================');
    console.log('Redis Server Information');
    console.log('========================================\n');

    const info = await redisClient.info('server');
    const lines = info.split('\r\n');
    const versionLine = lines.find((line) => line.startsWith('redis_version:'));
    if (versionLine) {
      log.info(versionLine);
    }

    const memInfo = await redisClient.info('memory');
    const memLines = memInfo.split('\r\n');
    const usedMemLine = memLines.find((line) => line.startsWith('used_memory_human:'));
    if (usedMemLine) {
      log.info(usedMemLine);
    }

    // Display connection details
    console.log('\n========================================');
    console.log('Connection Details');
    console.log('========================================\n');

    log.info(`REDIS_URL: ${process.env.REDIS_URL || 'not set'}`);
    log.info(`REDIS_HOST: ${process.env.REDIS_HOST || 'not set'}`);
    log.info(`REDIS_PORT: ${process.env.REDIS_PORT || 'not set'}`);

    // Final summary
    console.log('\n========================================');
    console.log('Verification Summary');
    console.log('========================================\n');

    if (allTestsPassed) {
      log.success('All tests passed! Redis is configured correctly.');
      console.log('\nYou can now:');
      console.log('  1. Start the backend server: npm run dev');
      console.log('  2. Run the test suite: npm test');
      console.log('  3. Begin implementing message queue features\n');
    } else {
      log.error('Some tests failed. Please check the errors above.');
      console.log('\nTroubleshooting:');
      console.log('  1. Ensure Redis is running: docker ps | grep redis');
      console.log('  2. Check Redis logs: docker logs whatsapp-campaign-redis');
      console.log('  3. Verify .env configuration');
      console.log('  4. See REDIS_SETUP.md for detailed instructions\n');
    }
  } catch (error) {
    log.error(`Verification failed: ${error.message}`);
    console.log('\nError Details:');
    console.log(error);
    console.log('\nTroubleshooting:');
    console.log('  1. Is Redis running? Run: docker ps | grep redis');
    console.log('  2. Start Redis: docker-compose up -d redis');
    console.log('  3. Or use setup script: ./scripts/setup-redis.ps1');
    console.log('  4. Check .env file for correct REDIS_URL\n');
    allTestsPassed = false;
  } finally {
    // Cleanup
    if (redisClient) {
      await disconnectRedis();
      log.info('Redis connection closed');
    }
  }

  process.exit(allTestsPassed ? 0 : 1);
}

// Run verification
verifyRedis();
