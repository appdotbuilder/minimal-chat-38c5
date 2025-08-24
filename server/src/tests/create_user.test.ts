import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput } from '../schema';
import { createUser } from '../handlers/create_user';
import { eq } from 'drizzle-orm';

// Test input data
const testInput: CreateUserInput = {
  email: 'test@example.com',
  display_name: 'Test User',
  avatar_url: 'https://example.com/avatar.jpg',
  provider: 'google',
  provider_id: 'google_123456',
};

const testInputWithoutAvatar: CreateUserInput = {
  email: 'noavatar@example.com',
  display_name: 'No Avatar User',
  provider: 'github',
  provider_id: 'github_789012',
};

describe('createUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a new user with all fields', async () => {
    const result = await createUser(testInput);

    // Verify returned user data
    expect(result.email).toEqual('test@example.com');
    expect(result.display_name).toEqual('Test User');
    expect(result.avatar_url).toEqual('https://example.com/avatar.jpg');
    expect(result.provider).toEqual('google');
    expect(result.provider_id).toEqual('google_123456');
    expect(result.status).toEqual('offline'); // Default status
    expect(result.last_seen).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create a user without avatar_url', async () => {
    const result = await createUser(testInputWithoutAvatar);

    expect(result.email).toEqual('noavatar@example.com');
    expect(result.display_name).toEqual('No Avatar User');
    expect(result.avatar_url).toBeNull();
    expect(result.provider).toEqual('github');
    expect(result.provider_id).toEqual('github_789012');
    expect(result.id).toBeDefined();
  });

  it('should save user to database', async () => {
    const result = await createUser(testInput);

    // Query database to verify user was saved
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.id))
      .execute();

    expect(users).toHaveLength(1);
    expect(users[0].email).toEqual('test@example.com');
    expect(users[0].display_name).toEqual('Test User');
    expect(users[0].avatar_url).toEqual('https://example.com/avatar.jpg');
    expect(users[0].provider).toEqual('google');
    expect(users[0].provider_id).toEqual('google_123456');
    expect(users[0].status).toEqual('offline');
    expect(users[0].created_at).toBeInstanceOf(Date);
    expect(users[0].updated_at).toBeInstanceOf(Date);
  });

  it('should return existing user when provider_id already exists', async () => {
    // Create initial user
    const firstResult = await createUser(testInput);

    // Try to create user with same provider_id but different email
    const duplicateInput: CreateUserInput = {
      ...testInput,
      email: 'different@example.com',
      display_name: 'Different Name',
    };

    const secondResult = await createUser(duplicateInput);

    // Should return the existing user, not create new one
    expect(secondResult.id).toEqual(firstResult.id);
    expect(secondResult.email).toEqual('test@example.com'); // Original email
    expect(secondResult.display_name).toEqual('Test User'); // Original name
    expect(secondResult.provider_id).toEqual('google_123456');

    // Verify only one user exists in database
    const allUsers = await db.select().from(usersTable).execute();
    expect(allUsers).toHaveLength(1);
  });

  it('should return existing user when email already exists', async () => {
    // Create initial user
    const firstResult = await createUser(testInput);

    // Try to create user with same email but different provider_id
    const duplicateInput: CreateUserInput = {
      ...testInput,
      provider: 'github',
      provider_id: 'github_different',
      display_name: 'Different Name',
    };

    const secondResult = await createUser(duplicateInput);

    // Should return the existing user, not create new one
    expect(secondResult.id).toEqual(firstResult.id);
    expect(secondResult.email).toEqual('test@example.com');
    expect(secondResult.provider).toEqual('google'); // Original provider
    expect(secondResult.provider_id).toEqual('google_123456'); // Original provider_id

    // Verify only one user exists in database
    const allUsers = await db.select().from(usersTable).execute();
    expect(allUsers).toHaveLength(1);
  });

  it('should create multiple users with different emails and provider_ids', async () => {
    const user1 = await createUser(testInput);
    const user2 = await createUser(testInputWithoutAvatar);

    // Both users should be created successfully
    expect(user1.id).toBeDefined();
    expect(user2.id).toBeDefined();
    expect(user1.id).not.toEqual(user2.id);

    expect(user1.email).toEqual('test@example.com');
    expect(user2.email).toEqual('noavatar@example.com');

    // Verify both users exist in database
    const allUsers = await db.select().from(usersTable).execute();
    expect(allUsers).toHaveLength(2);
  });

  it('should handle different providers correctly', async () => {
    const googleUser: CreateUserInput = {
      email: 'google@example.com',
      display_name: 'Google User',
      provider: 'google',
      provider_id: 'google_123',
    };

    const githubUser: CreateUserInput = {
      email: 'github@example.com',
      display_name: 'GitHub User',
      provider: 'github',
      provider_id: 'github_456',
    };

    const discordUser: CreateUserInput = {
      email: 'discord@example.com',
      display_name: 'Discord User',
      provider: 'discord',
      provider_id: 'discord_789',
    };

    const result1 = await createUser(googleUser);
    const result2 = await createUser(githubUser);
    const result3 = await createUser(discordUser);

    expect(result1.provider).toEqual('google');
    expect(result2.provider).toEqual('github');
    expect(result3.provider).toEqual('discord');

    // All should have different IDs
    expect(result1.id).not.toEqual(result2.id);
    expect(result2.id).not.toEqual(result3.id);
    expect(result1.id).not.toEqual(result3.id);

    // Verify all three users exist in database
    const allUsers = await db.select().from(usersTable).execute();
    expect(allUsers).toHaveLength(3);
  });
});