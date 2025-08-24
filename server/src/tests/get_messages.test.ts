import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, channelsTable, groupsTable, messagesTable, messageReadsTable, channelMembersTable, groupMembersTable } from '../db/schema';
import { getMessages } from '../handlers/get_messages';
import { eq } from 'drizzle-orm';

describe('getMessages', () => {
  let testUser1: any;
  let testUser2: any;
  let testUser3: any;
  let testChannel: any;
  let testGroup: any;

  beforeEach(async () => {
    await createDB();

    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'user1@test.com',
          display_name: 'User One',
          provider: 'google',
          provider_id: 'google_1',
          status: 'online'
        },
        {
          email: 'user2@test.com',
          display_name: 'User Two',
          provider: 'github',
          provider_id: 'github_2',
          status: 'away'
        },
        {
          email: 'user3@test.com',
          display_name: 'User Three',
          provider: 'discord',
          provider_id: 'discord_3',
          status: 'offline'
        }
      ])
      .returning()
      .execute();

    testUser1 = users[0];
    testUser2 = users[1];
    testUser3 = users[2];

    // Create test channel
    const channels = await db.insert(channelsTable)
      .values({
        name: 'Test Channel',
        description: 'A test channel',
        type: 'public',
        created_by: testUser1.id
      })
      .returning()
      .execute();

    testChannel = channels[0];

    // Create test group
    const groups = await db.insert(groupsTable)
      .values({
        name: 'Test Group',
        created_by: testUser1.id
      })
      .returning()
      .execute();

    testGroup = groups[0];

    // Add users to channel and group
    await db.insert(channelMembersTable)
      .values([
        { channel_id: testChannel.id, user_id: testUser1.id, role: 'owner' },
        { channel_id: testChannel.id, user_id: testUser2.id, role: 'member' }
      ])
      .execute();

    await db.insert(groupMembersTable)
      .values([
        { group_id: testGroup.id, user_id: testUser1.id },
        { group_id: testGroup.id, user_id: testUser2.id },
        { group_id: testGroup.id, user_id: testUser3.id }
      ])
      .execute();
  });

  afterEach(resetDB);

  it('should get channel messages with author info', async () => {
    // Create test messages in channel with delay to ensure ordering
    const firstMessage = await db.insert(messagesTable)
      .values({
        content: 'First message',
        type: 'text',
        author_id: testUser1.id,
        channel_id: testChannel.id
      })
      .returning()
      .execute();

    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    const secondMessage = await db.insert(messagesTable)
      .values({
        content: 'Second message',
        type: 'text',
        author_id: testUser2.id,
        channel_id: testChannel.id
      })
      .returning()
      .execute();

    const results = await getMessages(testChannel.id);

    expect(results).toHaveLength(2);
    // Messages should be ordered by creation date (newest first)
    expect(results[0].content).toBe('Second message');
    expect(results[1].content).toBe('First message');
    
    // Check author information is included
    expect(results[0].author.display_name).toBe('User Two');
    expect(results[0].author.email).toBe('user2@test.com');
    expect(results[1].author.display_name).toBe('User One');
    expect(results[1].author.email).toBe('user1@test.com');

    // Check message fields
    expect(results[0].channel_id).toBe(testChannel.id);
    expect(results[0].group_id).toBeNull();
    expect(results[0].recipient_id).toBeNull();
    expect(results[0].read_by).toEqual([]);
    expect(results[0].reply_to).toBeNull();
  });

  it('should get group messages with author info', async () => {
    // Create test messages in group with delay to ensure ordering
    await db.insert(messagesTable)
      .values({
        content: 'Group message 1',
        type: 'text',
        author_id: testUser1.id,
        group_id: testGroup.id
      })
      .execute();

    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    await db.insert(messagesTable)
      .values({
        content: 'Group message 2',
        type: 'text',
        author_id: testUser3.id,
        group_id: testGroup.id
      })
      .execute();

    const results = await getMessages(undefined, testGroup.id);

    expect(results).toHaveLength(2);
    expect(results[0].content).toBe('Group message 2');
    expect(results[1].content).toBe('Group message 1');
    
    // Check author information
    expect(results[0].author.display_name).toBe('User Three');
    expect(results[1].author.display_name).toBe('User One');

    // Check message fields
    expect(results[0].group_id).toBe(testGroup.id);
    expect(results[0].channel_id).toBeNull();
    expect(results[0].recipient_id).toBeNull();
  });

  it('should get direct messages between two users', async () => {
    // Create DM messages between user1 and user2 with delays
    await db.insert(messagesTable)
      .values({
        content: 'DM from user1 to user2',
        type: 'text',
        author_id: testUser1.id,
        recipient_id: testUser2.id
      })
      .execute();

    await new Promise(resolve => setTimeout(resolve, 10));

    await db.insert(messagesTable)
      .values({
        content: 'DM from user2 to user1',
        type: 'text',
        author_id: testUser2.id,
        recipient_id: testUser1.id
      })
      .execute();

    await new Promise(resolve => setTimeout(resolve, 10));

    await db.insert(messagesTable)
      .values({
        content: 'Another DM from user1',
        type: 'text',
        author_id: testUser1.id,
        recipient_id: testUser2.id
      })
      .execute();

    const results = await getMessages(undefined, undefined, testUser2.id, testUser1.id);

    expect(results).toHaveLength(3);
    // Should include messages in both directions
    const contents = results.map(m => m.content);
    expect(contents).toContain('DM from user1 to user2');
    expect(contents).toContain('DM from user2 to user1');
    expect(contents).toContain('Another DM from user1');

    // All messages should be DMs (no channel or group)
    results.forEach(message => {
      expect(message.channel_id).toBeNull();
      expect(message.group_id).toBeNull();
      expect([testUser1.id, testUser2.id]).toContain(message.author_id);
      expect([testUser1.id, testUser2.id]).toContain(message.recipient_id);
    });
  });

  it('should include read receipts for messages', async () => {
    // Create a message
    const messages = await db.insert(messagesTable)
      .values({
        content: 'Test message',
        type: 'text',
        author_id: testUser1.id,
        channel_id: testChannel.id
      })
      .returning()
      .execute();

    const message = messages[0];

    // Mark message as read by user2
    await db.insert(messageReadsTable)
      .values({
        message_id: message.id,
        user_id: testUser2.id
      })
      .execute();

    const results = await getMessages(testChannel.id);

    expect(results).toHaveLength(1);
    expect(results[0].read_by).toHaveLength(1);
    expect(results[0].read_by[0].display_name).toBe('User Two');
    expect(results[0].read_by[0].email).toBe('user2@test.com');
  });

  it('should include reply-to message information', async () => {
    // Create original message
    const originalMessages = await db.insert(messagesTable)
      .values({
        content: 'Original message',
        type: 'text',
        author_id: testUser1.id,
        channel_id: testChannel.id
      })
      .returning()
      .execute();

    const originalMessage = originalMessages[0];

    // Create reply message
    await db.insert(messagesTable)
      .values({
        content: 'Reply message',
        type: 'text',
        author_id: testUser2.id,
        channel_id: testChannel.id,
        reply_to_id: originalMessage.id
      })
      .execute();

    const results = await getMessages(testChannel.id);

    expect(results).toHaveLength(2);
    // Find the reply message (should be first due to ordering)
    const replyMessage = results.find(m => m.content === 'Reply message');
    expect(replyMessage).toBeDefined();
    expect(replyMessage!.reply_to).toBeDefined();
    expect(replyMessage!.reply_to!.content).toBe('Original message');
    expect(replyMessage!.reply_to!.id).toBe(originalMessage.id);
  });

  it('should respect pagination with limit and offset', async () => {
    // Create 10 test messages
    const messageData = Array.from({ length: 10 }, (_, i) => ({
      content: `Message ${i + 1}`,
      type: 'text' as const,
      author_id: testUser1.id,
      channel_id: testChannel.id
    }));

    await db.insert(messagesTable)
      .values(messageData)
      .execute();

    // Test limit
    const limitedResults = await getMessages(testChannel.id, undefined, undefined, undefined, 5);
    expect(limitedResults).toHaveLength(5);

    // Test offset
    const offsetResults = await getMessages(testChannel.id, undefined, undefined, undefined, 5, 5);
    expect(offsetResults).toHaveLength(5);

    // Messages should be different due to offset
    expect(limitedResults[0].content).not.toBe(offsetResults[0].content);
  });

  it('should handle different message types', async () => {
    // Create messages with different types
    await db.insert(messagesTable)
      .values([
        {
          content: 'Text message',
          type: 'text',
          author_id: testUser1.id,
          channel_id: testChannel.id
        },
        {
          content: 'Image message',
          type: 'image',
          author_id: testUser2.id,
          channel_id: testChannel.id,
          image_url: 'https://example.com/image.jpg'
        },
        {
          content: 'System message',
          type: 'system',
          author_id: testUser1.id,
          channel_id: testChannel.id
        }
      ])
      .execute();

    const results = await getMessages(testChannel.id);

    expect(results).toHaveLength(3);
    
    const textMessage = results.find(m => m.type === 'text');
    const imageMessage = results.find(m => m.type === 'image');
    const systemMessage = results.find(m => m.type === 'system');

    expect(textMessage).toBeDefined();
    expect(imageMessage).toBeDefined();
    expect(systemMessage).toBeDefined();
    expect(imageMessage!.image_url).toBe('https://example.com/image.jpg');
  });

  it('should handle messages with link previews', async () => {
    const linkPreview = {
      url: 'https://example.com',
      title: 'Example Site',
      description: 'An example website',
      image: 'https://example.com/preview.jpg'
    };

    await db.insert(messagesTable)
      .values({
        content: 'Check this out: https://example.com',
        type: 'text',
        author_id: testUser1.id,
        channel_id: testChannel.id,
        link_preview: linkPreview
      })
      .execute();

    const results = await getMessages(testChannel.id);

    expect(results).toHaveLength(1);
    expect(results[0].link_preview).toEqual(linkPreview);
  });

  it('should return empty array for invalid conversation parameters', async () => {
    // Create some messages
    await db.insert(messagesTable)
      .values({
        content: 'Test message',
        type: 'text',
        author_id: testUser1.id,
        channel_id: testChannel.id
      })
      .execute();

    // Test with no parameters
    const noParamsResults = await getMessages();
    expect(noParamsResults).toEqual([]);

    // Test with DM but missing author
    const missingAuthorResults = await getMessages(undefined, undefined, testUser2.id);
    expect(missingAuthorResults).toEqual([]);

    // Test with DM but missing recipient
    const missingRecipientResults = await getMessages(undefined, undefined, undefined, testUser1.id);
    expect(missingRecipientResults).toEqual([]);
  });

  it('should return empty array when no messages exist for conversation', async () => {
    const results = await getMessages(testChannel.id);
    expect(results).toEqual([]);
  });

  it('should order messages by creation date descending', async () => {
    // Create messages with specific timing
    const message1 = await db.insert(messagesTable)
      .values({
        content: 'First message',
        type: 'text',
        author_id: testUser1.id,
        channel_id: testChannel.id
      })
      .returning()
      .execute();

    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    const message2 = await db.insert(messagesTable)
      .values({
        content: 'Second message',
        type: 'text',
        author_id: testUser2.id,
        channel_id: testChannel.id
      })
      .returning()
      .execute();

    const results = await getMessages(testChannel.id);

    expect(results).toHaveLength(2);
    // Second message should come first (newest first)
    expect(results[0].content).toBe('Second message');
    expect(results[1].content).toBe('First message');
    expect(results[0].created_at.getTime()).toBeGreaterThan(results[1].created_at.getTime());
  });
});