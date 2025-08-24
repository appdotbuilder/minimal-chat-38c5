import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, channelsTable, groupsTable, typingIndicatorsTable } from '../db/schema';
import { type StartTypingInput } from '../schema';
import { startTyping } from '../handlers/start_typing';
import { eq, and, lt } from 'drizzle-orm';

describe('startTyping', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUser: any;
  let testChannel: any;
  let testGroup: any;
  let testRecipient: any;

  beforeEach(async () => {
    // Create test user
    const users = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        display_name: 'Test User',
        provider: 'google',
        provider_id: 'test-provider-id',
      })
      .returning()
      .execute();
    testUser = users[0];

    // Create test recipient for DMs
    const recipients = await db.insert(usersTable)
      .values({
        email: 'recipient@example.com',
        display_name: 'Test Recipient',
        provider: 'google',
        provider_id: 'recipient-provider-id',
      })
      .returning()
      .execute();
    testRecipient = recipients[0];

    // Create test channel
    const channels = await db.insert(channelsTable)
      .values({
        name: 'test-channel',
        type: 'public',
        created_by: testUser.id,
      })
      .returning()
      .execute();
    testChannel = channels[0];

    // Create test group
    const groups = await db.insert(groupsTable)
      .values({
        name: 'test-group',
        created_by: testUser.id,
      })
      .returning()
      .execute();
    testGroup = groups[0];
  });

  it('should create typing indicator for channel', async () => {
    const input: StartTypingInput = {
      user_id: testUser.id,
      channel_id: testChannel.id,
    };

    const result = await startTyping(input);

    expect(result.user_id).toEqual(testUser.id);
    expect(result.channel_id).toEqual(testChannel.id);
    expect(result.group_id).toBeNull();
    expect(result.recipient_id).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.started_at).toBeInstanceOf(Date);
  });

  it('should create typing indicator for group', async () => {
    const input: StartTypingInput = {
      user_id: testUser.id,
      group_id: testGroup.id,
    };

    const result = await startTyping(input);

    expect(result.user_id).toEqual(testUser.id);
    expect(result.channel_id).toBeNull();
    expect(result.group_id).toEqual(testGroup.id);
    expect(result.recipient_id).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.started_at).toBeInstanceOf(Date);
  });

  it('should create typing indicator for direct message', async () => {
    const input: StartTypingInput = {
      user_id: testUser.id,
      recipient_id: testRecipient.id,
    };

    const result = await startTyping(input);

    expect(result.user_id).toEqual(testUser.id);
    expect(result.channel_id).toBeNull();
    expect(result.group_id).toBeNull();
    expect(result.recipient_id).toEqual(testRecipient.id);
    expect(result.id).toBeDefined();
    expect(result.started_at).toBeInstanceOf(Date);
  });

  it('should save typing indicator to database', async () => {
    const input: StartTypingInput = {
      user_id: testUser.id,
      channel_id: testChannel.id,
    };

    const result = await startTyping(input);

    const indicators = await db.select()
      .from(typingIndicatorsTable)
      .where(eq(typingIndicatorsTable.id, result.id))
      .execute();

    expect(indicators).toHaveLength(1);
    expect(indicators[0].user_id).toEqual(testUser.id);
    expect(indicators[0].channel_id).toEqual(testChannel.id);
    expect(indicators[0].started_at).toBeInstanceOf(Date);
  });

  it('should update existing typing indicator instead of creating duplicate', async () => {
    const input: StartTypingInput = {
      user_id: testUser.id,
      channel_id: testChannel.id,
    };

    // Start typing first time
    const first = await startTyping(input);
    const firstTimestamp = first.started_at;

    // Wait a small amount to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));

    // Start typing again
    const second = await startTyping(input);

    // Should be the same indicator but with updated timestamp
    expect(second.id).toEqual(first.id);
    expect(second.started_at.getTime()).toBeGreaterThan(firstTimestamp.getTime());

    // Verify only one indicator exists in database
    const indicators = await db.select()
      .from(typingIndicatorsTable)
      .where(and(
        eq(typingIndicatorsTable.user_id, testUser.id),
        eq(typingIndicatorsTable.channel_id, testChannel.id)
      ))
      .execute();

    expect(indicators).toHaveLength(1);
  });

  it('should handle multiple locations separately', async () => {
    // Start typing in channel
    const channelInput: StartTypingInput = {
      user_id: testUser.id,
      channel_id: testChannel.id,
    };
    const channelResult = await startTyping(channelInput);

    // Start typing in group
    const groupInput: StartTypingInput = {
      user_id: testUser.id,
      group_id: testGroup.id,
    };
    const groupResult = await startTyping(groupInput);

    // Should create separate indicators
    expect(channelResult.id).not.toEqual(groupResult.id);
    expect(channelResult.channel_id).toEqual(testChannel.id);
    expect(channelResult.group_id).toBeNull();
    expect(groupResult.channel_id).toBeNull();
    expect(groupResult.group_id).toEqual(testGroup.id);

    // Verify both exist in database
    const indicators = await db.select()
      .from(typingIndicatorsTable)
      .where(eq(typingIndicatorsTable.user_id, testUser.id))
      .execute();

    expect(indicators).toHaveLength(2);
  });

  it('should clean up old typing indicators', async () => {
    // Create an old typing indicator (15 seconds ago)
    const oldTimestamp = new Date(Date.now() - 15 * 1000);
    await db.insert(typingIndicatorsTable)
      .values({
        user_id: testUser.id,
        channel_id: testChannel.id,
        started_at: oldTimestamp,
      })
      .execute();

    // Verify old indicator exists
    let indicators = await db.select()
      .from(typingIndicatorsTable)
      .where(eq(typingIndicatorsTable.user_id, testUser.id))
      .execute();
    expect(indicators).toHaveLength(1);

    // Start typing (should trigger cleanup)
    const input: StartTypingInput = {
      user_id: testUser.id,
      group_id: testGroup.id, // Different location
    };
    await startTyping(input);

    // Old indicator should be cleaned up
    indicators = await db.select()
      .from(typingIndicatorsTable)
      .where(eq(typingIndicatorsTable.user_id, testUser.id))
      .execute();

    expect(indicators).toHaveLength(1);
    expect(indicators[0].group_id).toEqual(testGroup.id);
    expect(indicators[0].channel_id).toBeNull();
  });

  it('should preserve recent typing indicators during cleanup', async () => {
    // Create a recent typing indicator (5 seconds ago)
    const recentTimestamp = new Date(Date.now() - 5 * 1000);
    await db.insert(typingIndicatorsTable)
      .values({
        user_id: testRecipient.id,
        channel_id: testChannel.id,
        started_at: recentTimestamp,
      })
      .execute();

    // Start typing as different user
    const input: StartTypingInput = {
      user_id: testUser.id,
      channel_id: testChannel.id,
    };
    await startTyping(input);

    // Both indicators should exist (recent one preserved)
    const indicators = await db.select()
      .from(typingIndicatorsTable)
      .where(eq(typingIndicatorsTable.channel_id, testChannel.id))
      .execute();

    expect(indicators).toHaveLength(2);
    
    const userIds = indicators.map(i => i.user_id).sort();
    expect(userIds).toEqual([testUser.id, testRecipient.id].sort());
  });

  it('should handle no location specified gracefully', async () => {
    const input: StartTypingInput = {
      user_id: testUser.id,
    };

    const result = await startTyping(input);

    expect(result.user_id).toEqual(testUser.id);
    expect(result.channel_id).toBeNull();
    expect(result.group_id).toBeNull();
    expect(result.recipient_id).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.started_at).toBeInstanceOf(Date);
  });
});