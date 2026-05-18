'use strict';

/**
 * Script to verify that all required database indexes are created.
 * This script connects to MongoDB and checks each model's indexes.
 */

const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../src/config/database');
const logger = require('../src/utils/logger');

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

/**
 * Verify indexes for a given model
 * @param {mongoose.Model} Model - Mongoose model to check
 * @param {string[]} expectedIndexes - Array of expected index names
 * @returns {Promise<{model: string, success: boolean, missing: string[], extra: string[]}>}
 */
async function verifyModelIndexes(Model, expectedIndexes) {
  const modelName = Model.modelName;
  
  try {
    // Get actual indexes from MongoDB
    const actualIndexes = await Model.collection.getIndexes();
    const actualIndexNames = Object.keys(actualIndexes).filter(name => name !== '_id_');
    
    // Check for missing indexes
    const missing = expectedIndexes.filter(name => !actualIndexNames.includes(name));
    
    // Check for extra indexes (not expected but present)
    const extra = actualIndexNames.filter(name => !expectedIndexes.includes(name));
    
    const success = missing.length === 0;
    
    return {
      model: modelName,
      success,
      missing,
      extra,
      actualIndexes: actualIndexNames,
    };
  } catch (error) {
    logger.error(`Error verifying indexes for ${modelName}:`, error);
    return {
      model: modelName,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Main verification function
 */
async function verifyAllIndexes() {
  console.log(`${colors.blue}========================================${colors.reset}`);
  console.log(`${colors.blue}Database Index Verification${colors.reset}`);
  console.log(`${colors.blue}========================================${colors.reset}\n`);

  try {
    // Connect to database
    console.log('Connecting to MongoDB...');
    await connectDB();
    console.log(`${colors.green}✓ Connected to MongoDB${colors.reset}\n`);

    // Define expected indexes for each model
    const modelsToVerify = [
      {
        model: require('../src/models/User'),
        expectedIndexes: ['email_1', 'role_1'],
      },
      {
        model: require('../src/models/Contact'),
        expectedIndexes: ['phone_1', 'industry_1', 'tags_1', 'location.country_1', 'createdAt_-1'],
      },
      {
        model: require('../src/models/Segment'),
        expectedIndexes: ['createdBy_1', 'name_1'],
      },
      {
        model: require('../src/models/Campaign'),
        expectedIndexes: ['status_1', 'scheduledAt_1', 'createdBy_1', 'type_1', 'createdAt_-1'],
      },
      {
        model: require('../src/models/Message'),
        expectedIndexes: ['campaign_1', 'contact_1', 'status_1', 'externalMessageId_1', 'createdAt_-1'],
      },
      {
        model: require('../src/models/WebhookEvent'),
        expectedIndexes: ['externalMessageId_1', 'processed_1', 'receivedAt_-1'],
      },
      {
        model: require('../src/models/Workflow'),
        expectedIndexes: ['isActive_1', 'triggerType_1', 'createdBy_1'],
      },
      {
        model: require('../src/models/AuditLog'),
        expectedIndexes: ['user_1', 'action_1', 'resourceType_1_resourceId_1', 'timestamp_-1'],
      },
    ];

    // Verify each model
    const results = [];
    for (const { model, expectedIndexes } of modelsToVerify) {
      const result = await verifyModelIndexes(model, expectedIndexes);
      results.push(result);
    }

    // Display results
    console.log(`${colors.blue}Verification Results:${colors.reset}\n`);
    
    let allSuccess = true;
    for (const result of results) {
      if (result.error) {
        console.log(`${colors.red}✗ ${result.model}: ERROR${colors.reset}`);
        console.log(`  Error: ${result.error}\n`);
        allSuccess = false;
        continue;
      }

      if (result.success) {
        console.log(`${colors.green}✓ ${result.model}: All indexes present${colors.reset}`);
        console.log(`  Indexes: ${result.actualIndexes.join(', ')}\n`);
      } else {
        console.log(`${colors.red}✗ ${result.model}: Missing indexes${colors.reset}`);
        console.log(`  Missing: ${result.missing.join(', ')}`);
        console.log(`  Present: ${result.actualIndexes.join(', ')}\n`);
        allSuccess = false;
      }

      if (result.extra && result.extra.length > 0) {
        console.log(`${colors.yellow}  Note: Extra indexes found: ${result.extra.join(', ')}${colors.reset}\n`);
      }
    }

    // Summary
    console.log(`${colors.blue}========================================${colors.reset}`);
    if (allSuccess) {
      console.log(`${colors.green}✓ All required indexes are present!${colors.reset}`);
    } else {
      console.log(`${colors.red}✗ Some indexes are missing or errors occurred${colors.reset}`);
    }
    console.log(`${colors.blue}========================================${colors.reset}\n`);

    // Disconnect
    await disconnectDB();
    
    process.exit(allSuccess ? 0 : 1);
  } catch (error) {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error);
    process.exit(1);
  }
}

// Run verification
verifyAllIndexes();
