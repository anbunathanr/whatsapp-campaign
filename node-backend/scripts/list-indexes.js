'use strict';

/**
 * Script to list all database indexes for verification.
 * This script connects to MongoDB and displays each model's indexes.
 */

const mongoose = require('mongoose');
const config = require('../src/config');

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

/**
 * List indexes for a given model
 * @param {mongoose.Model} Model - Mongoose model to check
 * @returns {Promise<{model: string, indexes: Object}>}
 */
async function listModelIndexes(Model) {
  const modelName = Model.modelName;
  
  try {
    // Get actual indexes from MongoDB
    const indexes = await Model.collection.getIndexes();
    
    return {
      model: modelName,
      indexes,
    };
  } catch (error) {
    return {
      model: modelName,
      error: error.message,
    };
  }
}

/**
 * Main function
 */
async function listAllIndexes() {
  console.log(`${colors.blue}========================================${colors.reset}`);
  console.log(`${colors.blue}Database Indexes Report${colors.reset}`);
  console.log(`${colors.blue}========================================${colors.reset}\n`);

  try {
    // Connect to database
    console.log('Connecting to MongoDB...');
    await mongoose.connect(config.mongodb.uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`${colors.green}✓ Connected to MongoDB${colors.reset}\n`);

    // Load all models
    const models = [
      require('../src/models/User'),
      require('../src/models/Contact'),
      require('../src/models/Segment'),
      require('../src/models/Campaign'),
      require('../src/models/Message'),
      require('../src/models/WebhookEvent'),
      require('../src/models/Workflow'),
      require('../src/models/AuditLog'),
    ];

    // List indexes for each model
    for (const model of models) {
      const result = await listModelIndexes(model);
      
      if (result.error) {
        console.log(`${colors.red}✗ ${result.model}: ERROR${colors.reset}`);
        console.log(`  Error: ${result.error}\n`);
        continue;
      }

      console.log(`${colors.cyan}${result.model}:${colors.reset}`);
      
      if (!result.indexes || typeof result.indexes !== 'object') {
        console.log(`  No indexes found\n`);
        continue;
      }
      
      const indexNames = Object.keys(result.indexes);
      for (const indexName of indexNames) {
        const indexDef = result.indexes[indexName];
        if (!indexDef || !indexDef.key) {
          console.log(`  - ${indexName}: [Invalid index definition]`);
          continue;
        }
        
        const keys = Object.keys(indexDef.key).map(k => {
          const direction = indexDef.key[k] === 1 ? 'ASC' : 'DESC';
          return `${k} (${direction})`;
        }).join(', ');
        
        const unique = indexDef.unique ? ' [UNIQUE]' : '';
        console.log(`  - ${indexName}: ${keys}${unique}`);
      }
      console.log();
    }

    // Summary
    console.log(`${colors.blue}========================================${colors.reset}`);
    console.log(`${colors.green}✓ Index listing complete${colors.reset}`);
    console.log(`${colors.blue}========================================${colors.reset}\n`);

    // Disconnect
    await mongoose.connection.close();
    
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run listing
listAllIndexes();
