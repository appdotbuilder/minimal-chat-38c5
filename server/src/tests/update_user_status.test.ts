import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type UpdateUserStatusInput } from '../schema';
import { updateUserStatus } from '../handlers/update_user_status';
import { eq } from 'drizzle-orm';

// Valid UUID for testing
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

// Test input for updating user status
const testUpdateInput: UpdateUserStatusInput = {
  user_id: TEST_USER_ID,
  status: 'online'
};

describe('updateUserStatus', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should update user status and timestamps', async () => {
    // Create a test user first
    const testUser = await db.insert(usersTable)
      .values({
        id: TEST_USER_ID,
        email: 'test@example.com',
        display_name: 'Test User',
        avatar_url: null,
        provider: 'google',
        provider_id: 'google123',
        status: 'offline',
        last_seen: null,
      })
      .returning()
      .execute();

    expect(testUser).toHaveLength(1);
    expect(testUser[0].status).toEqual('offline');
    expect(testUser[0].last_seen).toBeNull();

    // Update user status
    const result = await updateUserStatus(testUpdateInput);

    // Verify returned data
    expect(result.id).toEqual(TEST_USER_ID);
    expect(result.email).toEqual('test@example.com');
    expect(result.display_name).toEqual('Test User');
    expect(result.status).toEqual('online');
    expect(result.last_seen).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should update different status values correctly', async () => {
    // Create a test user
    await db.insert(usersTable)
      .values({
        id: TEST_USER_ID,
        email: 'test@example.com',
        display_name: 'Test User',
        avatar_url: null,
        provider: 'github',
        provider_id: 'github456',
        status: 'offline',
      })
      .returning()
      .execute();

    // Test different status values
    const statusValues: Array<'online' | 'away' | 'busy' | 'offline'> = ['online', 'away', 'busy', 'offline'];
    
    for (const status of statusValues) {
      const updateInput: UpdateUserStatusInput = {
        user_id: TEST_USER_ID,
        status
      };

      const result = await updateUserStatus(updateInput);
      expect(result.status).toEqual(status);
      expect(result.last_seen).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    }
  });

  it('should save status changes to database', async () => {
    // Create a test user
    const originalUser = await db.insert(usersTable)
      .values({
        id: TEST_USER_ID,
        email: 'test@example.com',
        display_name: 'Test User',
        avatar_url: null,
        provider: 'discord',
        provider_id: 'discord789',
        status: 'offline',
        last_seen: null,
      })
      .returning()
      .execute();

    const originalUpdatedAt = originalUser[0].updated_at;

    // Update status
    await updateUserStatus({
      user_id: TEST_USER_ID,
      status: 'busy'
    });

    // Verify changes were persisted
    const updatedUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, TEST_USER_ID))
      .execute();

    expect(updatedUser).toHaveLength(1);
    expect(updatedUser[0].status).toEqual('busy');
    expect(updatedUser[0].last_seen).toBeInstanceOf(Date);
    expect(updatedUser[0].updated_at).toBeInstanceOf(Date);
    expect(updatedUser[0].updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
  });

  it('should throw error for non-existent user', async () => {
    const updateInput: UpdateUserStatusInput = {
      user_id: '550e8400-e29b-41d4-a716-446655440999', // Different valid UUID
      status: 'online'
    };

    await expect(updateUserStatus(updateInput)).rejects.toThrow(/not found/i);
  });

  it('should preserve other user fields when updating status', async () => {
    // Create a user with all fields populated
    await db.insert(usersTable)
      .values({
        id: TEST_USER_ID,
        email: 'preserve@example.com',
        display_name: 'Preserve User',
        avatar_url: 'https://example.com/avatar.jpg',
        provider: 'github',
        provider_id: 'github999',
        status: 'away',
      })
      .returning()
      .execute();

    // Update status
    const result = await updateUserStatus({
      user_id: TEST_USER_ID,
      status: 'online'
    });

    // Verify all original fields are preserved
    expect(result.email).toEqual('preserve@example.com');
    expect(result.display_name).toEqual('Preserve User');
    expect(result.avatar_url).toEqual('https://example.com/avatar.jpg');
    expect(result.provider).toEqual('github');
    expect(result.provider_id).toEqual('github999');
    expect(result.status).toEqual('online'); // Only status should change
    expect(result.last_seen).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should update last_seen even when setting status to offline', async () => {
    // Create a test user
    await db.insert(usersTable)
      .values({
        id: TEST_USER_ID,
        email: 'offline@example.com',
        display_name: 'Offline User',
        avatar_url: null,
        provider: 'google',
        provider_id: 'google321',
        status: 'online',
        last_seen: new Date('2023-01-01T00:00:00Z'), // Old timestamp
      })
      .returning()
      .execute();

    // Update to offline status
    const result = await updateUserStatus({
      user_id: TEST_USER_ID,
      status: 'offline'
    });

    // Verify last_seen was updated even for offline status
    expect(result.status).toEqual('offline');
    expect(result.last_seen).toBeInstanceOf(Date);
    expect(result.last_seen!.getTime()).toBeGreaterThan(new Date('2023-01-01T00:00:00Z').getTime());
  });
});