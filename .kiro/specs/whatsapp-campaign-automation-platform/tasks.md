# Implementation Tasks: WhatsApp Campaign Automation Platform

## Phase 1: Project Setup and Infrastructure

### Task 1.1: Initialize Backend Project Structure
- [x] Create Node.js project with Express.js
- [x] Set up package.json with dependencies (express, mongoose, jsonwebtoken, bcrypt, bull, redis, multer, axios)
- [x] Create folder structure (routes, controllers, models, middleware, services, utils, config)
- [x] Set up environment configuration (.env file with MongoDB URI, JWT secret, Redis URL, WhatsApp API credentials)
- [x] Configure ESLint and Prettier for code formatting

### Task 1.2: Initialize Frontend Project Structure
- [x] Create React project with Vite
- [x] Set up package.json with dependencies (react, react-router-dom, axios, chart.js, tailwindcss)
- [x] Create folder structure (components, services, hooks, context, utils, pages)
- [x] Configure Tailwind CSS
- [x] Set up React Router for navigation

### Task 1.3: Set Up MongoDB Database Connection
- [x] Create MongoDB connection module with Mongoose
- [x] Implement connection error handling and retry logic
- [x] Set up connection pooling
- [x] Create database indexes for performance

### Task 1.4: Set Up Redis for Queue Management
- [x] Install and configure Redis
- [x] Create Redis connection module
- [x] Set up Bull queue for message processing
- [x] Configure queue event handlers

## Phase 2: Authentication and Authorization Module

### Task 2.1: Create User Model and Schema
- [x] Define User schema with email, passwordHash, firstName, lastName, role, isActive, failedLoginAttempts, accountLockedUntil
- [x] Add timestamps and indexes
- [x] Implement password hashing pre-save hook using bcrypt (cost factor 10)

### Task 2.2: Implement User Registration API
- [x] Create POST /api/auth/register endpoint
- [x] Validate email format and password strength
- [x] Hash password before saving
- [x] Return JWT token on successful registration

### Task 2.3: Implement User Login API
- [x] Create POST /api/auth/login endpoint
- [x] Validate credentials
- [x] Implement account lockout after 5 failed attempts within 15 minutes
- [x] Generate and return JWT token on successful login
- [x] Update lastLogin timestamp

### Task 2.4: Implement JWT Authentication Middleware
- [x] Create middleware to verify JWT tokens
- [x] Extract user information from token
- [x] Handle expired tokens (401 response)
- [x] Attach user object to request

### Task 2.5: Implement Role-Based Access Control Middleware
- [x] Create RBAC middleware to check user roles
- [x] Define role permissions for each endpoint
- [x] Return 403 Forbidden for unauthorized access

### Task 2.6: Create Login and Registration Forms (Frontend)
- [x] Build LoginForm component with email and password fields
- [x] Build RegisterForm component with all required fields
- [x] Implement form validation
- [x] Handle authentication errors and display messages
- [x] Store JWT token in localStorage on successful login

### Task 2.7: Implement Protected Routes (Frontend)
- [x] Create ProtectedRoute component
- [x] Check for valid JWT token before rendering protected pages
- [x] Redirect to login if not authenticated

## Phase 3: Contact Management Module

### Task 3.1: Create Contact Model and Schema
- [x] Define Contact schema with name, phone, jobTitle, company, industry, tags, location, customFields
- [x] Add unique index on phone field
- [x] Add indexes on industry, tags, createdAt

### Task 3.2: Implement Contact CRUD APIs
- [x] Create POST /api/contacts endpoint (create contact)
- [x] Create GET /api/contacts endpoint (list with pagination and filters)
- [x] Create GET /api/contacts/:id endpoint (get single contact)
- [x] Create PUT /api/contacts/:id endpoint (update contact)
- [x] Create DELETE /api/contacts/:id endpoint (delete contact)

### Task 3.3: Implement Phone Number Validation
- [x] Create E.164 phone number validation function
- [x] Validate phone numbers in contact creation/update
- [x] Return descriptive error messages for invalid formats

### Task 3.4: Implement CSV Import Functionality
- [x] Create POST /api/contacts/import endpoint
- [x] Use Multer middleware for file upload
- [x] Parse CSV file with flexible column name detection
- [x] Perform industry classification using existing ML model
- [x] Detect and skip duplicate phone numbers
- [x] Generate import summary with success/error counts
- [x] Return downloadable error report for failed rows

### Task 3.5: Implement Excel Import Functionality
- [x] Add xlsx parser to import endpoint
- [x] Support .xlsx and .xls formats
- [x] Handle different encodings (UTF-8, UTF-16, ISO-8859-1)

### Task 3.6: Implement Contact Filtering and Segmentation
- [x] Add query parameter support for industry, tags, location filters
- [x] Implement AND logic for multiple filters
- [x] Create GET /api/contacts/segments endpoint (list segments)
- [x] Create POST /api/contacts/segments endpoint (create segment)
- [x] Create Segment model to save filter criteria

### Task 3.7: Implement Contact Export
- [x] Create GET /api/contacts/export endpoint
- [x] Generate CSV file from filtered contacts
- [x] Return file as download

### Task 3.8: Implement Bulk Operations
- [x] Create POST /api/contacts/bulk-tag endpoint (bulk tag assignment)
- [x] Create POST /api/contacts/bulk-delete endpoint (bulk delete)

### Task 3.9: Create Contact Management UI (Frontend)
- [x] Build ContactList component with table view
- [x] Build ContactForm component for create/edit
- [x] Build ContactFilter component with industry, tags, location filters
- [x] Build ContactImport component with file upload
- [x] Build SegmentBuilder component
- [x] Implement pagination for contact list

## Phase 4: Campaign Management Module

### Task 4.1: Create Campaign Model and Schema
- [x] Define Campaign schema with name, type, status, targetSegment, messageTemplate, mediaAttachment, scheduledAt, metrics
- [x] Add indexes on status, scheduledAt, createdBy
- [x] Add reference to Segment model

### Task 4.2: Create Message Template Model
- [x] Define MessageTemplate schema
- [x] Store template content and metadata

### Task 4.3: Implement Campaign CRUD APIs
- [x] Create POST /api/campaigns endpoint (create campaign)
- [x] Create GET /api/campaigns endpoint (list with filters)
- [x] Create GET /api/campaigns/:id endpoint (get single campaign)
- [x] Create PUT /api/campaigns/:id endpoint (update campaign - only if status is draft or scheduled)
- [x] Create DELETE /api/campaigns/:id endpoint (archive campaign)

### Task 4.4: Implement Campaign Scheduling
- [x] Create POST /api/campaigns/:id/schedule endpoint
- [x] Validate scheduled time is in the future (UTC)
- [x] Update campaign status to 'scheduled'

### Task 4.5: Implement Campaign Cloning
- [x] Create POST /api/campaigns/:id/clone endpoint
- [x] Copy all campaign fields except ID, timestamps, execution metrics
- [x] Set status to 'draft'

### Task 4.6: Implement Message Template Parser
- [x] Create template parser to identify {{variable_name}} placeholders
- [x] Support nested expressions like {{contact.company.name}}
- [x] Validate template syntax
- [x] Return descriptive error messages for invalid syntax

### Task 4.7: Implement Template Validation
- [x] Create POST /api/templates/validate endpoint
- [x] Verify all variable references correspond to Contact fields
- [x] Return specific errors for undefined references

### Task 4.8: Implement Campaign Preview
- [x] Create GET /api/campaigns/:id/preview endpoint
- [x] Render template with sample contact data
- [x] Return preview output

### Task 4.9: Implement Media Upload
- [x] Use Multer middleware for image/PDF upload (max 5MB)
- [x] Validate file types (JPEG, PNG, PDF)
- [x] Store files in uploads directory or cloud storage
- [x] Save file URL in campaign mediaAttachment field

### Task 4.10: Create Campaign Management UI (Frontend)
- [x] Build CampaignList component
- [x] Build CampaignForm component with all fields
- [x] Build MessageTemplateEditor component with syntax highlighting
- [x] Build TemplatePreview component
- [x] Build MediaUploader component
- [x] Build CampaignScheduler component with date/time picker
- [x] Implement campaign cloning button

## Phase 5: WhatsApp Bulk Messaging Module

### Task 5.1: Create Message Model and Schema
- [x] Define Message schema with campaign, contact, phoneNumber, messageContent, status, timestamps, retryCount
- [x] Add indexes on campaign, contact, status, externalMessageId

### Task 5.2: Integrate WhatsApp API (Twilio)
- [x] Set up Twilio WhatsApp API credentials
- [x] Create service to send WhatsApp messages via Twilio
- [ ] Handle API responses and errors

### Task 5.3: Implement Message Queue Processing
- [ ] Create Bull queue job for message sending
- [ ] Add messages to queue when campaign executes
- [ ] Process queue with rate limiting (respect WhatsApp API limits)
- [ ] Implement FIFO ordering

### Task 5.4: Implement Message Personalization
- [ ] Create function to replace {{variable}} placeholders with contact data
- [ ] Handle missing contact fields gracefully
- [ ] Validate all placeholders have data before sending

### Task 5.5: Implement Campaign Execution
- [ ] Create POST /api/campaigns/:id/execute endpoint
- [ ] Fetch all contacts in target segment
- [ ] Create Message records for each contact
- [ ] Add messages to Bull queue
- [ ] Update campaign status to 'executing'

### Task 5.6: Implement Retry Mechanism
- [ ] Detect failed message sends
- [ ] Increment retryCount
- [ ] Retry up to 3 times with exponential backoff (2^retryCount seconds)
- [ ] Update message status to 'failed' after max retries

### Task 5.7: Implement Scheduled Campaign Execution
- [ ] Create cron job or scheduler to check for scheduled campaigns every 60 seconds
- [ ] Execute campaigns when scheduledAt time is reached
- [ ] Handle execution failures with alerts

### Task 5.8: Track Campaign Execution Progress
- [ ] Create GET /api/campaigns/:id/status endpoint
- [ ] Return real-time progress (messages sent, delivered, failed)
- [ ] Calculate percentage completion

## Phase 6: Webhook Integration Module

### Task 6.1: Create Webhook Event Model
- [ ] Define WebhookEvent schema with eventType, externalMessageId, payload, processed, receivedAt
- [ ] Add indexes on externalMessageId, processed

### Task 6.2: Implement Webhook Endpoint
- [ ] Create POST /api/webhooks/whatsapp endpoint
- [ ] Validate webhook signature (HMAC-SHA256)
- [ ] Store webhook event in database
- [ ] Process event asynchronously
- [ ] Respond within 2 seconds to prevent timeout

### Task 6.3: Implement Webhook Event Processing
- [ ] Create background job to process webhook events
- [ ] Update Message status based on event type (delivered, read, failed, replied)
- [ ] Record timestamps (deliveredAt, readAt, failedAt, repliedAt)
- [ ] Store reply content for 'replied' events
- [ ] Update campaign metrics (messagesDelivered, messagesRead, messagesFailed, messagesReplied)

### Task 6.4: Implement Webhook Retry Logic
- [ ] Retry failed webhook processing up to 3 times
- [ ] Mark event as processed after successful processing

### Task 6.5: Implement Real-Time Dashboard Updates
- [ ] Use WebSocket or Server-Sent Events for real-time updates
- [ ] Push metric updates to connected clients when webhook events are processed

## Phase 7: Dashboard and Analytics Module

### Task 7.1: Implement Dashboard Metrics API
- [ ] Create GET /api/analytics/dashboard endpoint
- [ ] Calculate total contacts, active campaigns, messages sent today
- [ ] Calculate delivery rate, read rate, response rate
- [ ] Return industry-wise contact distribution
- [ ] Return last 10 campaign history entries
- [ ] Implement caching with 30-second refresh

### Task 7.2: Implement Campaign Analytics API
- [ ] Create GET /api/analytics/campaigns/:id endpoint
- [ ] Calculate delivery rate, read rate, response rate for specific campaign
- [ ] Calculate average response time
- [ ] Return time-series data for delivery status over time

### Task 7.3: Implement Industry-Wise Analytics
- [ ] Create GET /api/analytics/industry endpoint
- [ ] Group campaigns by industry
- [ ] Calculate aggregate metrics per industry
- [ ] Return comparison data

### Task 7.4: Implement Report Generation
- [ ] Create POST /api/analytics/reports endpoint
- [ ] Support CSV and PDF export formats
- [ ] Generate report based on date range filter
- [ ] Return downloadable file

### Task 7.5: Create Dashboard UI (Frontend)
- [ ] Build Dashboard component with metrics cards
- [ ] Build MetricsCard component (Total Contacts, Messages Sent, Success Rate, etc.)
- [ ] Build ContactGrowthChart component using Chart.js
- [ ] Build IndustryDistributionChart component
- [ ] Build CampaignHistoryWidget component
- [ ] Implement real-time updates using WebSocket

### Task 7.6: Create Analytics UI (Frontend)
- [ ] Build AnalyticsDashboard component
- [ ] Build CampaignPerformance component with charts
- [ ] Build IndustryComparison component
- [ ] Build EngagementMetrics component
- [ ] Build ReportExporter component with format selection

## Phase 8: Workflow Automation Module (n8n Integration)

### Task 8.1: Create Workflow Model
- [ ] Define Workflow schema with name, n8nWorkflowId, triggerType, triggerConfig, isActive
- [ ] Add indexes on isActive, triggerType

### Task 8.2: Implement n8n API Integration
- [ ] Create service to interact with n8n REST API
- [ ] Implement workflow execution via n8n API

### Task 8.3: Implement Workflow CRUD APIs
- [ ] Create POST /api/workflows endpoint (create workflow)
- [ ] Create GET /api/workflows endpoint (list workflows)
- [ ] Create GET /api/workflows/:id endpoint (get workflow)
- [ ] Create PUT /api/workflows/:id endpoint (update workflow)
- [ ] Create DELETE /api/workflows/:id endpoint (delete workflow)

### Task 8.4: Implement Trigger Event Handling
- [ ] Create trigger event listeners for configured events
- [ ] Execute associated n8n workflow when trigger fires
- [ ] Log workflow execution with timestamp and outcome

### Task 8.5: Implement Auto-Response Configuration
- [ ] Store keyword-response mappings in Workflow model
- [ ] Listen for incoming messages (from webhook 'replied' events)
- [ ] Match message content against configured keywords
- [ ] Send auto-response when keyword matches

### Task 8.6: Create Workflow Management UI (Frontend)
- [ ] Build WorkflowList component
- [ ] Build WorkflowBuilder component
- [ ] Build TriggerConfig component
- [ ] Build AutoResponseConfig component

## Phase 9: Security and Audit Module

### Task 9.1: Create Audit Log Model
- [ ] Define AuditLog schema with user, action, resourceType, resourceId, changes, ipAddress, timestamp
- [ ] Add indexes on user, action, resourceType, timestamp

### Task 9.2: Implement Audit Logging Middleware
- [ ] Create middleware to log all data modification operations
- [ ] Capture before and after values for updates
- [ ] Record user identity, IP address, user agent
- [ ] Store audit log entries in database

### Task 9.3: Implement Audit Log Viewer API
- [ ] Create GET /api/admin/audit-logs endpoint
- [ ] Support filtering by user, action type, date range
- [ ] Implement pagination

### Task 9.4: Implement Input Sanitization
- [ ] Create sanitization utility functions
- [ ] Remove/escape SQL injection patterns
- [ ] Remove/escape XSS patterns
- [ ] Apply sanitization to all user inputs

### Task 9.5: Implement Rate Limiting
- [ ] Use express-rate-limit middleware
- [ ] Configure rate limits per endpoint
- [ ] Return 429 Too Many Requests when limit exceeded

### Task 9.6: Implement CORS Configuration
- [ ] Configure CORS to allow only authorized domains
- [ ] Set appropriate CORS headers

### Task 9.7: Implement HTTPS Configuration
- [ ] Set up SSL certificates
- [ ] Configure Nginx for HTTPS
- [ ] Redirect HTTP to HTTPS

### Task 9.8: Create Audit Log Viewer UI (Frontend)
- [ ] Build AuditLogViewer component (Admin only)
- [ ] Implement filters for user, action, date range
- [ ] Display audit log entries in table format

## Phase 10: Deployment and Infrastructure

### Task 10.1: Create Dockerfile for Backend
- [ ] Write Dockerfile for Node.js backend
- [ ] Configure environment variables
- [ ] Expose port 8000

### Task 10.2: Create Dockerfile for Frontend
- [ ] Write Dockerfile for React frontend
- [ ] Build production bundle
- [ ] Serve with Nginx

### Task 10.3: Create Docker Compose Configuration
- [ ] Write docker-compose.yml with services: backend, frontend, mongodb, redis, nginx
- [ ] Configure service dependencies
- [ ] Set up volumes for data persistence
- [ ] Configure networking

### Task 10.4: Configure Nginx Reverse Proxy
- [ ] Write Nginx configuration
- [ ] Set up reverse proxy for backend API
- [ ] Serve frontend static files
- [ ] Configure SSL/TLS

### Task 10.5: Implement Health Check Endpoints
- [ ] Create GET /api/health endpoint for backend
- [ ] Return service status, database connection status, Redis connection status

### Task 10.6: Set Up MongoDB Backup
- [ ] Create backup script for MongoDB
- [ ] Schedule daily backups using cron
- [ ] Store backups in secure location

### Task 10.7: Implement Logging and Monitoring
- [ ] Set up Winston logger for backend
- [ ] Configure log levels (error, warn, info, debug)
- [ ] Implement log rotation
- [ ] Set up monitoring for critical metrics (CPU, memory, disk)

### Task 10.8: Create Deployment Documentation
- [ ] Write step-by-step deployment guide
- [ ] Document environment variables
- [ ] Document AWS EC2 setup instructions
- [ ] Document SSL certificate setup

## Phase 11: Testing and Quality Assurance

### Task 11.1: Write Unit Tests for Authentication
- [ ] Test password hashing
- [ ] Test JWT token generation and validation
- [ ] Test role-based access control

### Task 11.2: Write Unit Tests for Contact Management
- [ ] Test phone number validation
- [ ] Test CSV parsing with various formats
- [ ] Test duplicate detection
- [ ] Test contact filtering

### Task 11.3: Write Unit Tests for Campaign Management
- [ ] Test template parsing
- [ ] Test template validation
- [ ] Test message personalization
- [ ] Test campaign cloning

### Task 11.4: Write Unit Tests for Message Processing
- [ ] Test message queue operations
- [ ] Test retry mechanism
- [ ] Test rate limiting

### Task 11.5: Write Integration Tests
- [ ] Test complete campaign execution flow
- [ ] Test webhook processing flow
- [ ] Test authentication flow

### Task 11.6: Write Property-Based Tests
- [ ] Implement PBT for password hashing invariant (Property 1)
- [ ] Implement PBT for metric calculation accuracy (Property 3)
- [ ] Implement PBT for CSV parsing correctness (Property 4)
- [ ] Implement PBT for duplicate prevention (Property 5)
- [ ] Implement PBT for template parsing (Property 10)
- [ ] Implement PBT for message personalization (Property 13)
- [ ] Implement PBT for webhook signature validation (Property 15)
- [ ] Implement PBT for input sanitization (Property 18)
- [ ] Implement PBT for template round-trip (Property 19)

### Task 11.7: Perform Load Testing
- [ ] Test system with 100,000 contacts
- [ ] Test concurrent campaign execution (10 campaigns)
- [ ] Test message processing throughput (50 messages/second)
- [ ] Test webhook processing rate (100 events/second)

### Task 11.8: Perform Security Testing
- [ ] Test for SQL/NoSQL injection vulnerabilities
- [ ] Test for XSS vulnerabilities
- [ ] Test authentication bypass attempts
- [ ] Test rate limiting effectiveness

## Phase 12: Optional AI Module

### Task 12.1: Set Up Python AI Service
- [ ] Create Python Flask/FastAPI service for AI features
- [ ] Install scikit-learn, NLTK, or transformers for NLP

### Task 12.2: Implement Sentiment Analysis
- [ ] Train or load pre-trained sentiment analysis model
- [ ] Create API endpoint for sentiment scoring
- [ ] Integrate with webhook processing to analyze reply messages

### Task 12.3: Implement Best Time Prediction
- [ ] Analyze historical campaign data
- [ ] Train model to predict optimal send times
- [ ] Create API endpoint for time recommendations

### Task 12.4: Implement Customer Behavior Analysis
- [ ] Analyze contact engagement patterns
- [ ] Identify highly engaged contacts
- [ ] Identify at-risk contacts

### Task 12.5: Integrate AI Service with Main Backend
- [ ] Call AI service from Node.js backend
- [ ] Display AI insights in dashboard
- [ ] Show smart suggestions in campaign creation

---

## Summary

**Total Tasks:** 120+
**Estimated Timeline:** 12-16 weeks
**Team Size:** 3-5 developers

**Priority Order:**
1. Phase 1-2: Setup and Authentication (Week 1-2)
2. Phase 3: Contact Management (Week 3-4)
3. Phase 4-5: Campaign and Messaging (Week 5-7)
4. Phase 6-7: Webhooks and Analytics (Week 8-10)
5. Phase 8-9: Workflows and Security (Week 11-12)
6. Phase 10-11: Deployment and Testing (Week 13-15)
7. Phase 12: Optional AI Features (Week 16+)
