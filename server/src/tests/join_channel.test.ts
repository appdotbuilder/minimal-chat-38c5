import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, channelsTable, channelMembersTable } from '../db/schema';
import { type JoinChannelInput, type CreateUserInput, type CreateChannelInput } from '../schema';
import { joinChannel } from '../handlers/join_channel';
import { eq, and } from 'drizzle-orm';

// Test helper functions
const createTestUser = async (userData: Partial<CreateUserInput> = {}): Promise<string> => {
  const defaultUser: CreateUserInput = {
    email: `test${Date.now()}@example.com`,
    display_name: 'Test User',
    provider: 'google',
    provider_id: 'test-provider-id',
    ...userData,
  };

  const result = await db.insert(usersTable)
    .values(defaultUser)
    .returning({ id: usersTable.id })
    .execute();

  return result[0].id;
};

const createTestChannel = async (channelData: Partial<CreateChannelInput> = {}): Promise<string> => {
  const creatorId = await createTestUser({ email: 'creator@example.com' });
  
  const defaultChannel: CreateChannelInput = {
    name: 'Test Channel',
    type: 'public',
    created_by: creatorId,
    ...channelData,
  };

  const result = await db.insert(channelsTable)
    .values(defaultChannel)
    .returning({ id: channelsTable.id })
    .execute();

  return result[0].id;
};

const testInput: JoinChannelInput = {
  channel_id: '', // Will be set in tests
  user_id: '',    // Will be set in tests
  role: 'member',
};

describe('joinChannel', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should successfully add a user to a public channel', async () => {
    const userId = await createTestUser();
    const channelId = await createTestChannel({ type: 'public' });

    const input: JoinChannelInput = {
      ...testInput,
      channel_id: channelId,
      user_id: userId,
      role: 'member',
    };

    const result = await joinChannel(input);

    // Verify the returned membership object
    expect(result.channel_id).toEqual(channelId);
    expect(result.user_id).toEqual(userId);
    expect(result.role).toEqual('member');
    expect(result.id).toBeDefined();
    expect(result.joined_at).toBeInstanceOf(Date);
  });

  it('should successfully add a user to a private channel', async () => {
    const userId = await createTestUser();
    const channelId = await createTestChannel({ type: 'private' });

    const input: JoinChannelInput = {
      ...testInput,
      channel_id: channelId,
      user_id: userId,
      role: 'member',
    };

    const result = await joinChannel(input);

    expect(result.channel_id).toEqual(channelId);
    expect(result.user_id).toEqual(userId);
    expect(result.role).toEqual('member');
  });

  it('should add user with admin role when specified', async () => {
    const userId = await createTestUser();
    const channelId = await createTestChannel();

    const input: JoinChannelInput = {
      ...testInput,
      channel_id: channelId,
      user_id: userId,
      role: 'admin',
    };

    const result = await joinChannel(input);

    expect(result.role).toEqual('admin');
  });

  it('should add user with owner role when specified', async () => {
    const userId = await createTestUser();
    const channelId = await createTestChannel();

    const input: JoinChannelInput = {
      ...testInput,
      channel_id: channelId,
      user_id: userId,
      role: 'owner',
    };

    const result = await joinChannel(input);

    expect(result.role).toEqual('owner');
  });

  it('should save membership to database correctly', async () => {
    const userId = await createTestUser();
    const channelId = await createTestChannel();

    const input: JoinChannelInput = {
      ...testInput,
      channel_id: channelId,
      user_id: userId,
      role: 'member',
    };

    const result = await joinChannel(input);

    // Verify it was actually saved to the database
    const memberships = await db.select()
      .from(channelMembersTable)
      .where(eq(channelMembersTable.id, result.id))
      .execute();

    expect(memberships).toHaveLength(1);
    expect(memberships[0].channel_id).toEqual(channelId);
    expect(memberships[0].user_id).toEqual(userId);
    expect(memberships[0].role).toEqual('member');
    expect(memberships[0].joined_at).toBeInstanceOf(Date);
  });

  it('should throw error when user does not exist', async () => {
    const channelId = await createTestChannel();
    const nonExistentUserId = '550e8400-e29b-41d4-a716-446655440000';

    const input: JoinChannelInput = {
      ...testInput,
      channel_id: channelId,
      user_id: nonExistentUserId,
      role: 'member',
    };

    await expect(joinChannel(input)).rejects.toThrow(/user not found/i);
  });

  it('should throw error when channel does not exist', async () => {
    const userId = await createTestUser();
    const nonExistentChannelId = '550e8400-e29b-41d4-a716-446655440000';

    const input: JoinChannelInput = {
      ...testInput,
      channel_id: nonExistentChannelId,
      user_id: userId,
      role: 'member',
    };

    await expect(joinChannel(input)).rejects.toThrow(/channel not found/i);
  });

  it('should throw error when user is already a member', async () => {
    const userId = await createTestUser();
    const channelId = await createTestChannel();

    // First, add the user to the channel
    await db.insert(channelMembersTable)
      .values({
        channel_id: channelId,
        user_id: userId,
        role: 'member',
      })
      .execute();

    const input: JoinChannelInput = {
      ...testInput,
      channel_id: channelId,
      user_id: userId,
      role: 'member',
    };

    await expect(joinChannel(input)).rejects.toThrow(/already a member/i);
  });

  it('should verify correct database state after multiple joins', async () => {
    const channelId = await createTestChannel();
    const user1Id = await createTestUser({ email: 'user1@example.com' });
    const user2Id = await createTestUser({ email: 'user2@example.com' });

    // Join user1 as member
    await joinChannel({
      channel_id: channelId,
      user_id: user1Id,
      role: 'member',
    });

    // Join user2 as admin
    await joinChannel({
      channel_id: channelId,
      user_id: user2Id,
      role: 'admin',
    });

    // Verify both memberships exist with correct roles
    const memberships = await db.select()
      .from(channelMembersTable)
      .where(eq(channelMembersTable.channel_id, channelId))
      .execute();

    expect(memberships).toHaveLength(2);

    const user1Membership = memberships.find(m => m.user_id === user1Id);
    const user2Membership = memberships.find(m => m.user_id === user2Id);

    expect(user1Membership?.role).toEqual('member');
    expect(user2Membership?.role).toEqual('admin');
  });

  it('should handle concurrent join attempts for different users', async () => {
    const channelId = await createTestChannel();
    const user1Id = await createTestUser({ email: 'user1@example.com' });
    const user2Id = await createTestUser({ email: 'user2@example.com' });
    const user3Id = await createTestUser({ email: 'user3@example.com' });

    // Attempt to join multiple users concurrently
    const joinPromises = [
      joinChannel({ channel_id: channelId, user_id: user1Id, role: 'member' }),
      joinChannel({ channel_id: channelId, user_id: user2Id, role: 'admin' }),
      joinChannel({ channel_id: channelId, user_id: user3Id, role: 'member' }),
    ];

    const results = await Promise.all(joinPromises);

    expect(results).toHaveLength(3);
    results.forEach(result => {
      expect(result.channel_id).toEqual(channelId);
      expect(result.id).toBeDefined();
      expect(result.joined_at).toBeInstanceOf(Date);
    });

    // Verify all memberships were created
    const memberships = await db.select()
      .from(channelMembersTable)
      .where(eq(channelMembersTable.channel_id, channelId))
      .execute();

    expect(memberships).toHaveLength(3);
  });
});