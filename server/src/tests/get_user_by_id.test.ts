import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { getUserById } from '../handlers/get_user_by_id';

describe('getUserById', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return a user when found', async () => {
    // Create a test user with all fields
    const insertResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        display_name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
        provider: 'google',
        provider_id: 'google123',
        status: 'online',
      })
      .returning()
      .execute();

    const createdUser = insertResult[0];
    
    // Fetch the user by ID
    const result = await getUserById(createdUser.id);

    // Verify the result
    expect(result).not.toBeNull();
    expect(result!.id).toBe(createdUser.id);
    expect(result!.email).toBe('test@example.com');
    expect(result!.display_name).toBe('Test User');
    expect(result!.avatar_url).toBe('https://example.com/avatar.jpg');
    expect(result!.provider).toBe('google');
    expect(result!.provider_id).toBe('google123');
    expect(result!.status).toBe('online');
    expect(result!.last_seen).toBeNull();
    expect(result!.created_at).toBeInstanceOf(Date);
    expect(result!.updated_at).toBeInstanceOf(Date);
  });

  it('should return a user with minimal data (null avatar_url)', async () => {
    // Create a test user without avatar_url (explicitly null)
    const insertResult = await db.insert(usersTable)
      .values({
        email: 'minimal@example.com',
        display_name: 'Minimal User',
        avatar_url: null,
        provider: 'github',
        provider_id: 'github456',
        status: 'offline',
        last_seen: new Date('2023-12-01T12:00:00Z'),
      })
      .returning()
      .execute();

    const createdUser = insertResult[0];
    
    // Fetch the user by ID
    const result = await getUserById(createdUser.id);

    // Verify the result
    expect(result).not.toBeNull();
    expect(result!.id).toBe(createdUser.id);
    expect(result!.email).toBe('minimal@example.com');
    expect(result!.display_name).toBe('Minimal User');
    expect(result!.avatar_url).toBeNull();
    expect(result!.provider).toBe('github');
    expect(result!.provider_id).toBe('github456');
    expect(result!.status).toBe('offline');
    expect(result!.last_seen).toBeInstanceOf(Date);
    expect(result!.last_seen?.getTime()).toBe(new Date('2023-12-01T12:00:00Z').getTime());
    expect(result!.created_at).toBeInstanceOf(Date);
    expect(result!.updated_at).toBeInstanceOf(Date);
  });

  it('should return null when user is not found', async () => {
    // Try to fetch a non-existent user
    const result = await getUserById('00000000-0000-0000-0000-000000000000');

    expect(result).toBeNull();
  });

  it('should handle invalid UUID gracefully', async () => {
    // Try to fetch with invalid UUID format
    await expect(getUserById('invalid-uuid')).rejects.toThrow();
  });

  it('should return user with all status values', async () => {
    const statusValues: Array<'online' | 'away' | 'busy' | 'offline'> = ['online', 'away', 'busy', 'offline'];
    
    for (const status of statusValues) {
      // Create a test user with specific status
      const insertResult = await db.insert(usersTable)
        .values({
          email: `${status}@example.com`,
          display_name: `${status} User`,
          avatar_url: null,
          provider: 'discord',
          provider_id: `discord-${status}`,
          status: status,
        })
        .returning()
        .execute();

      const createdUser = insertResult[0];
      
      // Fetch the user by ID
      const result = await getUserById(createdUser.id);

      // Verify the status
      expect(result).not.toBeNull();
      expect(result!.status).toBe(status);
      expect(result!.email).toBe(`${status}@example.com`);
      expect(result!.display_name).toBe(`${status} User`);
    }
  });

  it('should handle different provider types', async () => {
    const providers: Array<'google' | 'github' | 'discord'> = ['google', 'github', 'discord'];
    
    for (const provider of providers) {
      // Create a test user with specific provider
      const insertResult = await db.insert(usersTable)
        .values({
          email: `${provider}@example.com`,
          display_name: `${provider} User`,
          avatar_url: `https://${provider}.com/avatar.jpg`,
          provider: provider,
          provider_id: `${provider}-123`,
          status: 'online',
        })
        .returning()
        .execute();

      const createdUser = insertResult[0];
      
      // Fetch the user by ID
      const result = await getUserById(createdUser.id);

      // Verify the provider details
      expect(result).not.toBeNull();
      expect(result!.provider).toBe(provider);
      expect(result!.provider_id).toBe(`${provider}-123`);
      expect(result!.email).toBe(`${provider}@example.com`);
    }
  });
});