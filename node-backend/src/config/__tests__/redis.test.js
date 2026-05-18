/**
 * Redis Configuration Tests
 * Validates Redis connection and configuration
 */

const { getRedisClient, disconnectRedis } = require('../redis');

describe('Redis Configuration', () => {
  let redisClient;

  beforeAll(() => {
    redisClient = getRedisClient();
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  describe('Connection', () => {
    test('should connect to Redis successfully', async () => {
      const status = redisClient.status;
      expect(['ready', 'connecting', 'connect']).toContain(status);
    });

    test('should respond to PING command', async () => {
      const result = await redisClient.ping();
      expect(result).toBe('PONG');
    });
  });

  describe('Basic Operations', () => {
    test('should set and get a value', async () => {
      const key = 'test:key';
      const value = 'test-value';

      await redisClient.set(key, value);
      const result = await redisClient.get(key);

      expect(result).toBe(value);

      // Cleanup
      await redisClient.del(key);
    });

    test('should handle JSON data', async () => {
      const key = 'test:json';
      const data = { name: 'Test User', email: 'test@example.com' };

      await redisClient.set(key, JSON.stringify(data));
      const result = await redisClient.get(key);
      const parsed = JSON.parse(result);

      expect(parsed).toEqual(data);

      // Cleanup
      await redisClient.del(key);
    });

    test('should set expiration on keys', async () => {
      const key = 'test:expiring';
      const value = 'expires-soon';

      await redisClient.set(key, value, 'EX', 1); // 1 second expiration
      const ttl = await redisClient.ttl(key);

      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(1);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const result = await redisClient.get(key);

      expect(result).toBeNull();
    });

    test('should delete keys', async () => {
      const key = 'test:delete';
      const value = 'to-be-deleted';

      await redisClient.set(key, value);
      const deleted = await redisClient.del(key);

      expect(deleted).toBe(1);

      const result = await redisClient.get(key);
      expect(result).toBeNull();
    });
  });

  describe('List Operations', () => {
    const listKey = 'test:list';

    afterEach(async () => {
      await redisClient.del(listKey);
    });

    test('should push and pop from list', async () => {
      await redisClient.rpush(listKey, 'item1', 'item2', 'item3');
      const length = await redisClient.llen(listKey);

      expect(length).toBe(3);

      const item = await redisClient.lpop(listKey);
      expect(item).toBe('item1');
    });

    test('should get list range', async () => {
      await redisClient.rpush(listKey, 'a', 'b', 'c', 'd');
      const items = await redisClient.lrange(listKey, 0, -1);

      expect(items).toEqual(['a', 'b', 'c', 'd']);
    });
  });

  describe('Hash Operations', () => {
    const hashKey = 'test:hash';

    afterEach(async () => {
      await redisClient.del(hashKey);
    });

    test('should set and get hash fields', async () => {
      await redisClient.hset(hashKey, 'field1', 'value1');
      await redisClient.hset(hashKey, 'field2', 'value2');

      const value1 = await redisClient.hget(hashKey, 'field1');
      const value2 = await redisClient.hget(hashKey, 'field2');

      expect(value1).toBe('value1');
      expect(value2).toBe('value2');
    });

    test('should get all hash fields', async () => {
      await redisClient.hset(hashKey, 'name', 'John');
      await redisClient.hset(hashKey, 'age', '30');

      const hash = await redisClient.hgetall(hashKey);

      expect(hash).toEqual({ name: 'John', age: '30' });
    });
  });

  describe('Singleton Pattern', () => {
    test('should return the same client instance', () => {
      const client1 = getRedisClient();
      const client2 = getRedisClient();

      expect(client1).toBe(client2);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid commands gracefully', async () => {
      await expect(redisClient.call('INVALID_COMMAND')).rejects.toThrow();
    });
  });
});
