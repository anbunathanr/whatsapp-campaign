'use strict';

/**
 * Property-Based Tests for Contact Filtering Correctness (Property 6)
 *
 * **Validates: Requirements 3.6**
 *
 * Property 6: Contact Filtering Correctness
 * For any filter criteria (industry, tags, location) and any contact database,
 * the filtered result set SHALL contain only contacts that match ALL specified
 * criteria (AND logic), and SHALL contain ALL contacts that match the criteria
 * (no false negatives).
 *
 * Uses fast-check for property-based testing with a minimum of 100 iterations.
 */

const fc = require('fast-check');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// ── Disable rate limiters so tests don't hit 429 ──────────────────────────────
jest.mock('../../middleware/rateLimiter', () => ({
  apiLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
  uploadLimiter: (_req, _res, next) => next(),
}));

process.env.NODE_ENV = 'test';

const Contact = require('../../models/Contact');
const contactService = require('../../services/contact.service');

// ── In-memory MongoDB lifecycle ───────────────────────────────────────────────
let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

beforeEach(async () => {
  await Contact.deleteMany({});
});

// ── Generators ────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  'Technology', 'Healthcare', 'Finance', 'Education', 'Retail',
  'Manufacturing', 'Real Estate', 'Hospitality', 'Transportation',
  'Energy', 'Agriculture', 'Construction', 'Media', 'Other',
];

const COUNTRIES = ['US', 'UK', 'CA', 'AU', 'DE', 'FR', 'IN'];
const CITIES = ['New York', 'London', 'Toronto', 'Sydney', 'Berlin', 'Paris', 'Mumbai'];
const STATES = ['NY', 'CA', 'TX', 'FL', 'ON', 'BC', 'NSW'];
const TAGS = ['vip', 'prospect', 'customer', 'lead', 'partner', 'inactive'];

/** Generate a valid E.164 phone number unique enough for testing */
const phoneArb = fc.nat({ max: 9999999 }).map((n) => `+1555${String(n).padStart(7, '0')}`);

/** Generate a single contact record */
const contactArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
  phone: phoneArb,
  industry: fc.constantFrom(...INDUSTRIES),
  tags: fc.array(fc.constantFrom(...TAGS), { minLength: 0, maxLength: 3 }).map((arr) => [...new Set(arr)]),
  location: fc.record({
    city: fc.constantFrom(...CITIES),
    state: fc.constantFrom(...STATES),
    country: fc.constantFrom(...COUNTRIES),
  }),
});

/** Generate a list of contacts with unique phone numbers */
const contactListArb = fc
  .array(contactArb, { minLength: 5, maxLength: 20 })
  .map((contacts) => {
    // Deduplicate by phone
    const seen = new Set();
    return contacts.filter((c) => {
      if (seen.has(c.phone)) {return false;}
      seen.add(c.phone);
      return true;
    });
  })
  .filter((contacts) => contacts.length >= 3); // ensure at least 3 contacts

/** Generate filter criteria (at least one filter must be set) */
const filterCriteriaArb = fc
  .record({
    industry: fc.option(fc.constantFrom(...INDUSTRIES), { nil: undefined }),
    tag: fc.option(fc.constantFrom(...TAGS), { nil: undefined }),
    country: fc.option(fc.constantFrom(...COUNTRIES), { nil: undefined }),
    city: fc.option(fc.constantFrom(...CITIES), { nil: undefined }),
  })
  .filter((f) => f.industry !== undefined || f.tag !== undefined || f.country !== undefined || f.city !== undefined);

// ── Helper: check if a contact matches filter criteria ────────────────────────

/**
 * Manually check if a contact matches the given filter criteria (AND logic).
 * This is the reference implementation used to verify the service's output.
 */
const contactMatchesFilters = (contact, filters) => {
  // industry filter
  if (filters.industry !== undefined) {
    if (contact.industry !== filters.industry) {return false;}
  }

  // tag filter (contact must have the tag)
  if (filters.tag !== undefined) {
    if (!contact.tags || !contact.tags.includes(filters.tag)) {return false;}
  }

  // location.country filter (case-insensitive)
  if (filters.country !== undefined) {
    const contactCountry = (contact.location && contact.location.country) || '';
    if (contactCountry.toLowerCase() !== filters.country.toLowerCase()) {return false;}
  }

  // location.city filter (case-insensitive)
  if (filters.city !== undefined) {
    const contactCity = (contact.location && contact.location.city) || '';
    if (contactCity.toLowerCase() !== filters.city.toLowerCase()) {return false;}
  }

  return true;
};

// ── Property-Based Tests ──────────────────────────────────────────────────────

describe('Property 6: Contact Filtering Correctness', () => {
  /**
   * Property 6a: No False Positives (AND logic correctness)
   *
   * For any filter criteria and any contact database, every contact in the
   * filtered result set SHALL match ALL specified criteria.
   *
   * **Validates: Requirements 3.6**
   */
  it('Property 6a: filtered results contain ONLY contacts matching ALL criteria (no false positives)', async () => {
    await fc.assert(
      fc.asyncProperty(contactListArb, filterCriteriaArb, async (contacts, filters) => {
        // Seed contacts into the database
        await Contact.deleteMany({});
        await Contact.insertMany(contacts);

        // Build service filter params
        const serviceFilters = {};
        if (filters.industry !== undefined) {serviceFilters.industry = filters.industry;}
        if (filters.tag !== undefined) {serviceFilters.tags = filters.tag;}
        if (filters.country !== undefined) {serviceFilters['location.country'] = filters.country;}
        if (filters.city !== undefined) {serviceFilters['location.city'] = filters.city;}

        // Call the service
        const { contacts: result } = await contactService.listContacts(serviceFilters, { limit: 100 });

        // Every returned contact must match ALL filter criteria
        for (const contact of result) {
          if (filters.industry !== undefined) {
            if (contact.industry !== filters.industry) {return false;}
          }
          if (filters.tag !== undefined) {
            if (!contact.tags || !contact.tags.includes(filters.tag)) {return false;}
          }
          if (filters.country !== undefined) {
            const contactCountry = (contact.location && contact.location.country) || '';
            if (contactCountry.toLowerCase() !== filters.country.toLowerCase()) {return false;}
          }
          if (filters.city !== undefined) {
            const contactCity = (contact.location && contact.location.city) || '';
            if (contactCity.toLowerCase() !== filters.city.toLowerCase()) {return false;}
          }
        }

        return true;
      }),
      { numRuns: 100, verbose: false }
    );
  }, 120000);

  /**
   * Property 6b: No False Negatives (completeness)
   *
   * For any filter criteria and any contact database, the filtered result set
   * SHALL contain ALL contacts that match the criteria.
   *
   * **Validates: Requirements 3.6**
   */
  it('Property 6b: filtered results contain ALL contacts matching the criteria (no false negatives)', async () => {
    await fc.assert(
      fc.asyncProperty(contactListArb, filterCriteriaArb, async (contacts, filters) => {
        // Seed contacts into the database
        await Contact.deleteMany({});
        await Contact.insertMany(contacts);

        // Build service filter params
        const serviceFilters = {};
        if (filters.industry !== undefined) {serviceFilters.industry = filters.industry;}
        if (filters.tag !== undefined) {serviceFilters.tags = filters.tag;}
        if (filters.country !== undefined) {serviceFilters['location.country'] = filters.country;}
        if (filters.city !== undefined) {serviceFilters['location.city'] = filters.city;}

        // Call the service
        const { contacts: result } = await contactService.listContacts(serviceFilters, { limit: 100 });

        // Compute expected matches using the reference implementation
        const expectedPhones = new Set(
          contacts
            .filter((c) => contactMatchesFilters(c, filters))
            .map((c) => c.phone)
        );

        // Every expected contact must appear in the result
        const resultPhones = new Set(result.map((c) => c.phone));

        for (const phone of expectedPhones) {
          if (!resultPhones.has(phone)) {return false;}
        }

        return true;
      }),
      { numRuns: 100, verbose: false }
    );
  }, 120000);

  /**
   * Property 6c: Result count equals expected count
   *
   * The number of contacts returned SHALL equal the number of contacts in the
   * database that match ALL specified criteria.
   *
   * **Validates: Requirements 3.6**
   */
  it('Property 6c: result count matches the number of contacts satisfying ALL filter criteria', async () => {
    await fc.assert(
      fc.asyncProperty(contactListArb, filterCriteriaArb, async (contacts, filters) => {
        // Seed contacts into the database
        await Contact.deleteMany({});
        await Contact.insertMany(contacts);

        // Build service filter params
        const serviceFilters = {};
        if (filters.industry !== undefined) {serviceFilters.industry = filters.industry;}
        if (filters.tag !== undefined) {serviceFilters.tags = filters.tag;}
        if (filters.country !== undefined) {serviceFilters['location.country'] = filters.country;}
        if (filters.city !== undefined) {serviceFilters['location.city'] = filters.city;}

        // Call the service (fetch all with high limit)
        const { total } = await contactService.listContacts(serviceFilters, { limit: 100 });

        // Compute expected count using the reference implementation
        const expectedCount = contacts.filter((c) => contactMatchesFilters(c, filters)).length;

        return total === expectedCount;
      }),
      { numRuns: 100, verbose: false }
    );
  }, 120000);

  /**
   * Property 6d: Adding a filter can only narrow results (monotonicity)
   *
   * For any contact database, applying an additional filter criterion SHALL
   * produce a result set that is a subset of the result with fewer filters.
   * This confirms AND logic (intersection, not union).
   *
   * **Validates: Requirements 3.6**
   */
  it('Property 6d: adding a filter narrows results (AND logic produces subset, not superset)', async () => {
    await fc.assert(
      fc.asyncProperty(
        contactListArb,
        fc.constantFrom(...INDUSTRIES),
        fc.constantFrom(...TAGS),
        async (contacts, industry, tag) => {
          // Seed contacts into the database
          await Contact.deleteMany({});
          await Contact.insertMany(contacts);

          // Filter by industry only
          const { total: countByIndustry } = await contactService.listContacts(
            { industry },
            { limit: 100 }
          );

          // Filter by industry AND tag
          const { total: countByIndustryAndTag } = await contactService.listContacts(
            { industry, tags: tag },
            { limit: 100 }
          );

          // Adding a tag filter can only keep or reduce the count (AND logic)
          return countByIndustryAndTag <= countByIndustry;
        }
      ),
      { numRuns: 100, verbose: false }
    );
  }, 120000);
});
