import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, messagesTable, messageReadsTable, channelsTable, channelMembersTable } from '../db/schema';
import { type MarkMessageReadInput } from '../schema';
import { markMessageRead } from '../handlers/mark_message_read';
import { eq, and } from 'drizzle-orm';

describe('markMessageRead', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUserId: string;
  let testAuthorId: string;
  let testChannelId: string;
  let testMessageId: string;

  beforeEach(async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'reader@example.com',
          display_name: 'Reader User',
          provider: 'google',
          provider_id: 'google_reader_123',
        },
        {
          email: 'author@example.com',
          display_name: 'Author User',
          provider: 'google',
          provider_id: 'google_author_123',
        }
      ])
      .returning()
      .execute();

    testUserId = users[0].id;
    testAuthorId = users[1].id;

    // Create test channel
    const channels = await db.insert(channelsTable)
      .values({
        name: 'Test Channel',
        type: 'public',
        created_by: testAuthorId,
      })
      .returning()
      .execute();

    testChannelId = channels[0].id;

    // Add users to channel
    await db.insert(channelMembersTable)
      .values([
        {
          channel_id: testChannelId,
          user_id: testUserId,
          role: 'member',
        },
        {
          channel_id: testChannelId,
          user_id: testAuthorId,
          role: 'owner',
        }
      ])
      .execute();

    // Create test message
    const messages = await db.insert(messagesTable)
      .values({
        content: 'Test message content',
        type: 'text',
        author_id: testAuthorId,
        channel_id: testChannelId,
      })
      .returning()
      .execute();

    testMessageId = messages[0].id;
  });

  const testInput: MarkMessageReadInput = {
    message_id: '',
    user_id: '',
  };

  it('should mark a message as read', async () => {
    const input = {
      ...testInput,
      message_id: testMessageId,
      user_id: testUserId,
    };

    const result = await markMessageRead(input);

    // Verify return value
    expect(result.id).toBeDefined();
    expect(result.message_id).toEqual(testMessageId);
    expect(result.user_id).toEqual(testUserId);
    expect(result.read_at).toBeInstanceOf(Date);
  });

  it('should save read receipt to database', async () => {
    const input = {
      ...testInput,
      message_id: testMessageId,
      user_id: testUserId,
    };

    const result = await markMessageRead(input);

    // Query database to verify read receipt was created
    const readReceipts = await db.select()
      .from(messageReadsTable)
      .where(eq(messageReadsTable.id, result.id))
      .execute();

    expect(readReceipts).toHaveLength(1);
    expect(readReceipts[0].message_id).toEqual(testMessageId);
    expect(readReceipts[0].user_id).toEqual(testUserId);
    expect(readReceipts[0].read_at).toBeInstanceOf(Date);
  });

  it('should return existing read receipt if already marked as read', async () => {
    const input = {
      ...testInput,
      message_id: testMessageId,
      user_id: testUserId,
    };

    // Mark message as read first time
    const firstResult = await markMessageRead(input);

    // Mark same message as read again
    const secondResult = await markMessageRead(input);

    // Should return the same read receipt
    expect(secondResult.id).toEqual(firstResult.id);
    expect(secondResult.message_id).toEqual(firstResult.message_id);
    expect(secondResult.user_id).toEqual(firstResult.user_id);
    expect(secondResult.read_at).toEqual(firstResult.read_at);

    // Verify only one read receipt exists in database
    const readReceipts = await db.select()
      .from(messageReadsTable)
      .where(
        and(
          eq(messageReadsTable.message_id, testMessageId),
          eq(messageReadsTable.user_id, testUserId)
        )
      )
      .execute();

    expect(readReceipts).toHaveLength(1);
  });

  it('should throw error for non-existent message', async () => {
    const input = {
      ...testInput,
      message_id: '00000000-0000-0000-0000-000000000001',
      user_id: testUserId,
    };

    await expect(markMessageRead(input)).rejects.toThrow(/message not found/i);
  });

  it('should throw error for non-existent user', async () => {
    const input = {
      ...testInput,
      message_id: testMessageId,
      user_id: '00000000-0000-0000-0000-000000000001',
    };

    await expect(markMessageRead(input)).rejects.toThrow(/user not found/i);
  });

  it('should handle direct messages correctly', async () => {
    // Create a direct message
    const directMessage = await db.insert(messagesTable)
      .values({
        content: 'Direct message content',
        type: 'text',
        author_id: testAuthorId,
        recipient_id: testUserId,
      })
      .returning()
      .execute();

    const input = {
      ...testInput,
      message_id: directMessage[0].id,
      user_id: testUserId,
    };

    const result = await markMessageRead(input);

    expect(result.message_id).toEqual(directMessage[0].id);
    expect(result.user_id).toEqual(testUserId);
    expect(result.read_at).toBeInstanceOf(Date);

    // Verify in database
    const readReceipts = await db.select()
      .from(messageReadsTable)
      .where(eq(messageReadsTable.id, result.id))
      .execute();

    expect(readReceipts).toHaveLength(1);
  });

  it('should handle multiple users marking same message as read', async () => {
    // Create another user
    const otherUsers = await db.insert(usersTable)
      .values({
        email: 'other@example.com',
        display_name: 'Other User',
        provider: 'github',
        provider_id: 'github_other_123',
      })
      .returning()
      .execute();

    const otherUserId = otherUsers[0].id;

    // Add other user to channel
    await db.insert(channelMembersTable)
      .values({
        channel_id: testChannelId,
        user_id: otherUserId,
        role: 'member',
      })
      .execute();

    // Mark message as read by first user
    const firstInput = {
      ...testInput,
      message_id: testMessageId,
      user_id: testUserId,
    };

    const firstResult = await markMessageRead(firstInput);

    // Mark same message as read by second user
    const secondInput = {
      ...testInput,
      message_id: testMessageId,
      user_id: otherUserId,
    };

    const secondResult = await markMessageRead(secondInput);

    // Should be different read receipts
    expect(firstResult.id).not.toEqual(secondResult.id);
    expect(firstResult.user_id).toEqual(testUserId);
    expect(secondResult.user_id).toEqual(otherUserId);

    // Verify both read receipts exist in database
    const readReceipts = await db.select()
      .from(messageReadsTable)
      .where(eq(messageReadsTable.message_id, testMessageId))
      .execute();

    expect(readReceipts).toHaveLength(2);
  });
});