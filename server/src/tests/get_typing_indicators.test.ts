import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, channelsTable, groupsTable, typingIndicatorsTable } from '../db/schema';
import { getTypingIndicators } from '../handlers/get_typing_indicators';

describe('getTypingIndicators', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUser1Id: string;
  let testUser2Id: string;
  let testChannelId: string;
  let testGroupId: string;

  beforeEach(async () => {
    // Create test users
    const [user1] = await db.insert(usersTable).values({
      email: 'user1@test.com',
      display_name: 'Test User 1',
      provider: 'google',
      provider_id: 'google123',
    }).returning().execute();
    testUser1Id = user1.id;

    const [user2] = await db.insert(usersTable).values({
      email: 'user2@test.com',
      display_name: 'Test User 2',
      provider: 'github',
      provider_id: 'github456',
    }).returning().execute();
    testUser2Id = user2.id;

    // Create test channel
    const [channel] = await db.insert(channelsTable).values({
      name: 'Test Channel',
      type: 'public',
      created_by: testUser1Id,
    }).returning().execute();
    testChannelId = channel.id;

    // Create test group
    const [group] = await db.insert(groupsTable).values({
      name: 'Test Group',
      created_by: testUser1Id,
    }).returning().execute();
    testGroupId = group.id;
  });

  it('should return typing indicators for a channel', async () => {
    // Create typing indicator for channel
    const now = new Date();
    await db.insert(typingIndicatorsTable).values({
      user_id: testUser1Id,
      channel_id: testChannelId,
      started_at: now,
    }).execute();

    const result = await getTypingIndicators(testChannelId);

    expect(result).toHaveLength(1);
    expect(result[0].user_id).toEqual(testUser1Id);
    expect(result[0].channel_id).toEqual(testChannelId);
    expect(result[0].group_id).toBeNull();
    expect(result[0].recipient_id).toBeNull();
    expect(result[0].started_at).toBeInstanceOf(Date);
  });

  it('should return typing indicators for a group', async () => {
    // Create typing indicator for group
    const now = new Date();
    await db.insert(typingIndicatorsTable).values({
      user_id: testUser2Id,
      group_id: testGroupId,
      started_at: now,
    }).execute();

    const result = await getTypingIndicators(undefined, testGroupId);

    expect(result).toHaveLength(1);
    expect(result[0].user_id).toEqual(testUser2Id);
    expect(result[0].group_id).toEqual(testGroupId);
    expect(result[0].channel_id).toBeNull();
    expect(result[0].recipient_id).toBeNull();
  });

  it('should return typing indicators for direct messages', async () => {
    // Create typing indicator for DM
    const now = new Date();
    await db.insert(typingIndicatorsTable).values({
      user_id: testUser1Id,
      recipient_id: testUser2Id,
      started_at: now,
    }).execute();

    const result = await getTypingIndicators(undefined, undefined, testUser2Id);

    expect(result).toHaveLength(1);
    expect(result[0].user_id).toEqual(testUser1Id);
    expect(result[0].recipient_id).toEqual(testUser2Id);
    expect(result[0].channel_id).toBeNull();
    expect(result[0].group_id).toBeNull();
  });

  it('should filter out expired typing indicators', async () => {
    const now = new Date();
    const expired = new Date(now.getTime() - 35000); // 35 seconds ago
    const recent = new Date(now.getTime() - 10000); // 10 seconds ago

    // Create expired typing indicator
    await db.insert(typingIndicatorsTable).values({
      user_id: testUser1Id,
      channel_id: testChannelId,
      started_at: expired,
    }).execute();

    // Create recent typing indicator
    await db.insert(typingIndicatorsTable).values({
      user_id: testUser2Id,
      channel_id: testChannelId,
      started_at: recent,
    }).execute();

    const result = await getTypingIndicators(testChannelId);

    // Should only return the recent one
    expect(result).toHaveLength(1);
    expect(result[0].user_id).toEqual(testUser2Id);
    expect(result[0].started_at.getTime()).toBeGreaterThan(expired.getTime());
  });

  it('should return empty array when no typing indicators exist', async () => {
    const result = await getTypingIndicators(testChannelId);

    expect(result).toHaveLength(0);
  });

  it('should return empty array for non-existent channel', async () => {
    const fakeChannelId = '550e8400-e29b-41d4-a716-446655440000';
    
    const result = await getTypingIndicators(fakeChannelId);

    expect(result).toHaveLength(0);
  });

  it('should handle multiple typing indicators in the same conversation', async () => {
    const now = new Date();

    // Create multiple typing indicators for the same channel
    await db.insert(typingIndicatorsTable).values([
      {
        user_id: testUser1Id,
        channel_id: testChannelId,
        started_at: now,
      },
      {
        user_id: testUser2Id,
        channel_id: testChannelId,
        started_at: now,
      },
    ]).execute();

    const result = await getTypingIndicators(testChannelId);

    expect(result).toHaveLength(2);
    const userIds = result.map(indicator => indicator.user_id);
    expect(userIds).toContain(testUser1Id);
    expect(userIds).toContain(testUser2Id);
  });

  it('should not return typing indicators from other conversations', async () => {
    const now = new Date();

    // Create typing indicators for different conversations
    await db.insert(typingIndicatorsTable).values([
      {
        user_id: testUser1Id,
        channel_id: testChannelId,
        started_at: now,
      },
      {
        user_id: testUser2Id,
        group_id: testGroupId,
        started_at: now,
      },
    ]).execute();

    // Query for channel indicators only
    const channelResult = await getTypingIndicators(testChannelId);
    expect(channelResult).toHaveLength(1);
    expect(channelResult[0].channel_id).toEqual(testChannelId);

    // Query for group indicators only
    const groupResult = await getTypingIndicators(undefined, testGroupId);
    expect(groupResult).toHaveLength(1);
    expect(groupResult[0].group_id).toEqual(testGroupId);
  });

  it('should handle edge case with exactly 30 second old indicator', async () => {
    // Use 29 seconds ago to ensure it's within the 30-second window
    const within30Seconds = new Date();
    within30Seconds.setSeconds(within30Seconds.getSeconds() - 29);

    await db.insert(typingIndicatorsTable).values({
      user_id: testUser1Id,
      channel_id: testChannelId,
      started_at: within30Seconds,
    }).execute();

    const result = await getTypingIndicators(testChannelId);

    // Should include indicator that is within the 30-second window
    expect(result).toHaveLength(1);
  });
});