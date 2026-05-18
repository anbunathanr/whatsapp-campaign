'use strict';

/**
 * Unit tests for node-backend/src/config/database.js
 *
 * All external dependencies (mongoose, logger, process.exit) are mocked so
 * that no real MongoDB connection is required.
 */

// Spy on process.exit so tests don't actually terminate the process
const processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit called');
});

// ── isFatalConnectionError ────────────────────────────────────────────────────

describe('isFatalConnectionError()', () => {
  let isFatalConnectionError;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('../../utils/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));
    jest.mock('mongoose', () => ({
      connect: jest.fn(),
      connection: { on: jest.fn(), close: jest.fn(), readyState: 0, host: null, name: null },
    }));
    ({ isFatalConnectionError } = require('../../config/database'));
  });

  it('returns false for a null/undefined error', () => {
    expect(isFatalConnectionError(null)).toBe(false);
    expect(isFatalConnectionError(undefined)).toBe(false);
  });

  it('returns false for an error with no message', () => {
    expect(isFatalConnectionError({})).toBe(false);
  });

  it('returns true for "Authentication failed" errors', () => {
    expect(isFatalConnectionError(new Error('Authentication failed'))).toBe(true);
    expect(isFatalConnectionError(new Error('MongoServerError: Authentication failed'))).toBe(true);
  });

  it('returns true for "bad auth" errors', () => {
    expect(isFatalConnectionError(new Error('bad auth'))).toBe(true);
    expect(isFatalConnectionError(new Error('MongoError: bad auth : authSource'))).toBe(true);
  });

  it('returns true for "Invalid scheme" errors', () => {
    expect(isFatalConnectionError(new Error('Invalid scheme, expected connection string'))).toBe(
      true
    );
  });

  it('returns true for ENOTFOUND on a non-localhost host', () => {
    jest.resetModules();
    jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
    jest.mock('mongoose', () => ({
      connect: jest.fn(),
      connection: { on: jest.fn(), close: jest.fn(), readyState: 0, host: null, name: null },
    }));
    jest.mock('../../config/index', () => ({
      mongodb: { uri: 'mongodb://remote-host.example.com:27017/db', poolSize: 10 },
      logging: { level: 'info', dir: 'logs' },
    }));

    const { isFatalConnectionError: fn } = require('../../config/database');
    expect(fn(new Error('getaddrinfo ENOTFOUND remote-host.example.com'))).toBe(true);
  });

  it('returns false for ENOTFOUND on localhost (transient DNS hiccup)', () => {
    jest.resetModules();
    jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
    jest.mock('mongoose', () => ({
      connect: jest.fn(),
      connection: { on: jest.fn(), close: jest.fn(), readyState: 0, host: null, name: null },
    }));
    jest.mock('../../config/index', () => ({
      mongodb: { uri: 'mongodb://localhost:27017/db', poolSize: 10 },
      logging: { level: 'info', dir: 'logs' },
    }));

    const { isFatalConnectionError: fn } = require('../../config/database');
    expect(fn(new Error('getaddrinfo ENOTFOUND localhost'))).toBe(false);
  });

  it('returns false for generic transient errors (e.g. ECONNREFUSED)', () => {
    expect(isFatalConnectionError(new Error('connect ECONNREFUSED 127.0.0.1:27017'))).toBe(false);
  });

  it('returns false for server selection timeout errors', () => {
    expect(
      isFatalConnectionError(new Error('Server selection timed out after 5000 ms'))
    ).toBe(false);
  });
});

// ── connectDB – success path ──────────────────────────────────────────────────

describe('connectDB() – success on first attempt', () => {
  let mongoose;
  let connectDB;
  let logger;

  beforeEach(() => {
    jest.resetModules();

    jest.mock('../../utils/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    // Models must be mocked with names prefixed by 'mock' to satisfy Jest's
    // babel-jest hoisting restriction on jest.mock factory closures.
    const mockModel = { syncIndexes: jest.fn().mockResolvedValue(undefined) };
    jest.mock('../../models/User', () => ({ syncIndexes: jest.fn().mockResolvedValue(undefined) }), { virtual: true });
    jest.mock('../../models/Contact', () => ({ syncIndexes: jest.fn().mockResolvedValue(undefined) }), { virtual: true });
    jest.mock('../../models/Campaign', () => ({ syncIndexes: jest.fn().mockResolvedValue(undefined) }), { virtual: true });
    jest.mock('../../models/Message', () => ({ syncIndexes: jest.fn().mockResolvedValue(undefined) }), { virtual: true });
    jest.mock('../../models/MessageTemplate', () => ({ syncIndexes: jest.fn().mockResolvedValue(undefined) }), { virtual: true });
    jest.mock('../../models/Segment', () => ({ syncIndexes: jest.fn().mockResolvedValue(undefined) }), { virtual: true });
    jest.mock('../../models/WebhookEvent', () => ({ syncIndexes: jest.fn().mockResolvedValue(undefined) }), { virtual: true });
    jest.mock('../../models/Workflow', () => ({ syncIndexes: jest.fn().mockResolvedValue(undefined) }), { virtual: true });
    jest.mock('../../models/AuditLog', () => ({ syncIndexes: jest.fn().mockResolvedValue(undefined) }), { virtual: true });

    jest.mock('mongoose', () => ({
      connect: jest.fn().mockResolvedValue(undefined),
      connection: {
        on: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
        readyState: 1,
        host: 'localhost',
        name: 'testdb',
      },
    }));

    mongoose = require('mongoose');
    logger = require('../../utils/logger');
    ({ connectDB } = require('../../config/database'));
  });

  it('calls mongoose.connect once and logs success', async () => {
    await connectDB();

    expect(mongoose.connect).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('MongoDB connected successfully');
  });

  it('passes connectTimeoutMS and waitQueueTimeoutMS in options', async () => {
    await connectDB();

    const [, options] = mongoose.connect.mock.calls[0];
    expect(options).toMatchObject({
      connectTimeoutMS: 10000,
      waitQueueTimeoutMS: 5000,
    });
  });
});

// ── connectDB – retry on transient errors ─────────────────────────────────────

describe('connectDB() – retries on transient errors', () => {
  let mongoose;
  let connectDB;
  let logger;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();

    jest.mock('../../utils/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    jest.mock('../../models/User', () => ({ syncIndexes: jest.fn().mockResolvedValue(undefined) }), { virtual: true });
    jest.mock('../../models/Contact', () => ({ syncIndexes: jest.fn().mockResolvedValue(undefined) }), { virtual: true });
    jest.mock('../../models/Campaign', () => ({ syncIndexes: jest.fn().mockResolvedValue(undefined) }), { virtual: true });
    jest.mock('../../models/Message', () => ({ syncIndexes: jest.fn().mockResolvedValue(undefined) }), { virtual: true });
    jest.mock('../../models/MessageTemplate', () => ({ syncIndexes: jest.fn().mockResolvedValue(undefined) }), { virtual: true });
    jest.mock('../../models/Segment', () => ({ syncIndexes: jest.fn().mockResolvedValue(undefined) }), { virtual: true });
    jest.mock('../../models/WebhookEvent', () => ({ syncIndexes: jest.fn().mockResolvedValue(undefined) }), { virtual: true });
    jest.mock('../../models/Workflow', () => ({ syncIndexes: jest.fn().mockResolvedValue(undefined) }), { virtual: true });
    jest.mock('../../models/AuditLog', () => ({ syncIndexes: jest.fn().mockResolvedValue(undefined) }), { virtual: true });

    // Fail twice, then succeed
    jest.mock('mongoose', () => ({
      connect: jest
        .fn()
        .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:27017'))
        .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:27017'))
        .mockResolvedValue(undefined),
      connection: {
        on: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
        readyState: 1,
        host: 'localhost',
        name: 'testdb',
      },
    }));

    mongoose = require('mongoose');
    logger = require('../../utils/logger');
    ({ connectDB } = require('../../config/database'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries after a transient error and eventually succeeds', async () => {
    const connectPromise = connectDB();

    // Advance timers to skip the retry delays
    await jest.runAllTimersAsync();

    await connectPromise;

    expect(mongoose.connect).toHaveBeenCalledTimes(3);
    expect(logger.info).toHaveBeenCalledWith('MongoDB connected successfully');
  });

  it('logs a retry message with the calculated delay', async () => {
    const connectPromise = connectDB();
    await jest.runAllTimersAsync();
    await connectPromise;

    const retryCalls = logger.info.mock.calls.filter(([msg]) => msg.includes('Retrying in'));
    expect(retryCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// ── connectDB – exits on max retries ─────────────────────────────────────────

describe('connectDB() – exits after max retries', () => {
  let connectDB;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();

    jest.mock('../../utils/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    // Always fail with a transient error
    jest.mock('mongoose', () => ({
      connect: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:27017')),
      connection: {
        on: jest.fn(),
        close: jest.fn(),
        readyState: 0,
        host: null,
        name: null,
      },
    }));

    ({ connectDB } = require('../../config/database'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calls process.exit(1) after exhausting all retries', async () => {
    const connectPromise = connectDB().catch(() => {});
    await jest.runAllTimersAsync();

    await expect(connectPromise).resolves.toBeUndefined();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});

// ── connectDB – no retry on fatal errors ─────────────────────────────────────

describe('connectDB() – does NOT retry on fatal errors', () => {
  let mongoose;
  let connectDB;

  beforeEach(() => {
    jest.resetModules();

    jest.mock('../../utils/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    jest.mock('mongoose', () => ({
      connect: jest.fn().mockRejectedValue(new Error('Authentication failed')),
      connection: {
        on: jest.fn(),
        close: jest.fn(),
        readyState: 0,
        host: null,
        name: null,
      },
    }));

    mongoose = require('mongoose');
    ({ connectDB } = require('../../config/database'));
  });

  it('calls process.exit(1) immediately without retrying', async () => {
    await connectDB().catch(() => {});

    // Should only have been called once (no retries)
    expect(mongoose.connect).toHaveBeenCalledTimes(1);
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});

// ── getConnectionStatus ───────────────────────────────────────────────────────

describe('getConnectionStatus()', () => {
  it('returns isConnected=true when readyState is 1', () => {
    jest.resetModules();
    jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
    jest.mock('mongoose', () => ({
      connect: jest.fn(),
      connection: { on: jest.fn(), close: jest.fn(), readyState: 1, host: 'localhost', name: 'db' },
    }));

    const { getConnectionStatus } = require('../../config/database');
    const status = getConnectionStatus();

    expect(status.isConnected).toBe(true);
    expect(status.readyState).toBe(1);
    expect(status.host).toBe('localhost');
    expect(status.name).toBe('db');
  });

  it('returns isConnected=false when readyState is 0', () => {
    jest.resetModules();
    jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
    jest.mock('mongoose', () => ({
      connect: jest.fn(),
      connection: { on: jest.fn(), close: jest.fn(), readyState: 0, host: null, name: null },
    }));

    const { getConnectionStatus } = require('../../config/database');
    const status = getConnectionStatus();

    expect(status.isConnected).toBe(false);
    expect(status.readyState).toBe(0);
    expect(status.host).toBeNull();
    expect(status.name).toBeNull();
  });

  it('returns isConnected=false when readyState is 2 (connecting)', () => {
    jest.resetModules();
    jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
    jest.mock('mongoose', () => ({
      connect: jest.fn(),
      connection: { on: jest.fn(), close: jest.fn(), readyState: 2, host: null, name: null },
    }));

    const { getConnectionStatus } = require('../../config/database');
    const status = getConnectionStatus();

    expect(status.isConnected).toBe(false);
    expect(status.readyState).toBe(2);
  });
});

// ── disconnectDB ──────────────────────────────────────────────────────────────

describe('disconnectDB()', () => {
  it('calls mongoose.connection.close()', async () => {
    jest.resetModules();
    jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

    const mockClose = jest.fn().mockResolvedValue(undefined);
    jest.mock('mongoose', () => ({
      connect: jest.fn(),
      connection: { on: jest.fn(), close: mockClose, readyState: 1, host: 'localhost', name: 'db' },
    }));

    const { disconnectDB } = require('../../config/database');
    await disconnectDB();

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('logs an error if close() throws', async () => {
    jest.resetModules();
    const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    jest.mock('../../utils/logger', () => mockLogger);

    const mockClose = jest.fn().mockRejectedValue(new Error('close failed'));
    jest.mock('mongoose', () => ({
      connect: jest.fn(),
      connection: { on: jest.fn(), close: mockClose, readyState: 1, host: 'localhost', name: 'db' },
    }));

    const { disconnectDB } = require('../../config/database');
    await disconnectDB(); // should not throw

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error closing MongoDB connection:',
      'close failed'
    );
  });
});
