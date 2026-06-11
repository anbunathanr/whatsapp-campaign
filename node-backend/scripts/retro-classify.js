require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Contact = require('../src/models/Contact');
const { INDUSTRY_VALUES } = require('../src/models/Contact');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp_campaign_platform';
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8001';

async function run() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(MONGODB_URI);
    console.log('Database connected successfully.');

    console.log('Checking ML service status...');
    try {
      const health = await axios.get(`${ML_SERVICE_URL}/health`);
      console.log(`ML Classifier status: ${health.data.status} (Model loaded: ${health.data.model_loaded})`);
    } catch (err) {
      console.error(`Error connecting to ML service at ${ML_SERVICE_URL}: ${err.message}`);
      console.log('Please ensure the docker containers are running.');
      process.exit(1);
    }

    // Find contacts with 'Other' industry and having job title or company
    const query = {
      industry: 'Other',
      $or: [
        { jobTitle: { $ne: null, $gt: '' } },
        { company: { $ne: null, $gt: '' } }
      ]
    };

    const contacts = await Contact.find(query);
    console.log(`Found ${contacts.length} contacts needing industry classification.`);

    if (contacts.length === 0) {
      console.log('No contacts to classify.');
      mongoose.disconnect();
      return;
    }

    let updatedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const jobTitle = contact.jobTitle || '';
      const company = contact.company || '';

      process.stdout.write(`Processing [${i + 1}/${contacts.length}] - "${contact.name}" (${jobTitle})... `);

      try {
        const response = await axios.post(`${ML_SERVICE_URL}/api/classify-contact`, {
          jobTitle: jobTitle,
          companyName: company
        });

        const predicted = response.data.predictedIndustry;

        if (predicted && predicted !== 'Other' && INDUSTRY_VALUES.includes(predicted)) {
          contact.industry = predicted;
          await contact.save();
          console.log(`classified as "${predicted}" ✅`);
          updatedCount++;
        } else {
          console.log(`kept as "Other" (predicted: ${predicted}) ℹ️`);
        }
      } catch (err) {
        console.log(`failed (Error: ${err.message}) ❌`);
        failedCount++;
      }
    }

    console.log('\n======================================');
    console.log(`Classification completed!`);
    console.log(`Successfully Updated: ${updatedCount}`);
    console.log(`Skipped / Failed:     ${failedCount}`);
    console.log('======================================');

  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Database disconnected.');
  }
}

run();
