import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  channelsTable, 
  groupsTable, 
  messagesTable,
  channelMembersTable,
  groupMembersTable
} from '../db/schema';
import { type SendMessageInput } from '../schema';
import { sendMessage } from '../handlers/send_message';
import { eq } from 'drizzle-orm';

describe('sendMessage', () => {
  let testUser: any;
  let recipientUser: any;
  let testChannel: any;
  let testGroup: any;

  beforeEach(async () => {
    await createDB();

    // Create test users
    const userResults = await db.insert(usersTable)
      .values([
        {
          email: 'author@example.com',
          display_name: 'Author User',
          provider: 'google',
          provider_id: 'author123',
          status: 'online',
        },
        {
          email: 'recipient@example.com',
          display_name: 'Recipient User',
          provider: 'github',
          provider_id: 'recipient123',
          status: 'offline',
        }
      ])
      .returning()
      .execute();

    testUser = userResults[0];
    recipientUser = userResults[1];

    // Create test channel
    const channelResults = await db.insert(channelsTable)
      .values({
        name: 'Test Channel',
        description: 'A test channel',
        type: 'public',
        created_by: testUser.id,
      })
      .returning()
      .execute();

    testChannel = channelResults[0];

    // Add user to channel
    await db.insert(channelMembersTable)
      .values({
        channel_id: testChannel.id,
        user_id: testUser.id,
        role: 'owner',
      })
      .execute();

    // Create test group
    const groupResults = await db.insert(groupsTable)
      .values({
        name: 'Test Group',
        created_by: testUser.id,
      })
      .returning()
      .execute();

    testGroup = groupResults[0];

    // Add user to group
    await db.insert(groupMembersTable)
      .values({
        group_id: testGroup.id,
        user_id: testUser.id,
      })
      .execute();
  });

  afterEach(resetDB);

  describe('Channel messages', () => {
    it('should send message to channel', async () => {
      const input: SendMessageInput = {
        content: 'Hello channel!',
        type: 'text',
        author_id: testUser.id,
        channel_id: testChannel.id,
      };

      const result = await sendMessage(input);

      expect(result.content).toEqual('Hello channel!');
      expect(result.type).toEqual('text');
      expect(result.author_id).toEqual(testUser.id);
      expect(result.channel_id).toEqual(testChannel.id);
      expect(result.group_id).toBeNull();
      expect(result.recipient_id).toBeNull();
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.author.display_name).toEqual('Author User');
      expect(result.read_by).toEqual([]);
      expect(result.reply_to).toBeNull();
    });

    it('should save channel message to database', async () => {
      const input: SendMessageInput = {
        content: 'Persisted message',
        type: 'text',
        author_id: testUser.id,
        channel_id: testChannel.id,
      };

      const result = await sendMessage(input);

      const messages = await db.select()
        .from(messagesTable)
        .where(eq(messagesTable.id, result.id))
        .execute();

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toEqual('Persisted message');
      expect(messages[0].channel_id).toEqual(testChannel.id);
    });

    it('should reject message from non-member', async () => {
      const input: SendMessageInput = {
        content: 'Unauthorized message',
        type: 'text',
        author_id: recipientUser.id, // Not a member
        channel_id: testChannel.id,
      };

      await expect(sendMessage(input)).rejects.toThrow(/not a member of the specified channel/i);
    });
  });

  describe('Group messages', () => {
    it('should send message to group', async () => {
      const input: SendMessageInput = {
        content: 'Hello group!',
        type: 'text',
        author_id: testUser.id,
        group_id: testGroup.id,
      };

      const result = await sendMessage(input);

      expect(result.content).toEqual('Hello group!');
      expect(result.group_id).toEqual(testGroup.id);
      expect(result.channel_id).toBeNull();
      expect(result.recipient_id).toBeNull();
      expect(result.author.display_name).toEqual('Author User');
    });

    it('should reject message from non-member of group', async () => {
      const input: SendMessageInput = {
        content: 'Unauthorized group message',
        type: 'text',
        author_id: recipientUser.id, // Not a member
        group_id: testGroup.id,
      };

      await expect(sendMessage(input)).rejects.toThrow(/not a member of the specified group/i);
    });
  });

  describe('Direct messages', () => {
    it('should send direct message', async () => {
      const input: SendMessageInput = {
        content: 'Hello DM!',
        type: 'text',
        author_id: testUser.id,
        recipient_id: recipientUser.id,
      };

      const result = await sendMessage(input);

      expect(result.content).toEqual('Hello DM!');
      expect(result.recipient_id).toEqual(recipientUser.id);
      expect(result.channel_id).toBeNull();
      expect(result.group_id).toBeNull();
      expect(result.author.display_name).toEqual('Author User');
    });

    it('should reject DM to non-existent user', async () => {
      const input: SendMessageInput = {
        content: 'Message to nobody',
        type: 'text',
        author_id: testUser.id,
        recipient_id: '00000000-0000-0000-0000-000000000000',
      };

      await expect(sendMessage(input)).rejects.toThrow(/recipient user does not exist/i);
    });
  });

  describe('Message types and features', () => {
    it('should handle image messages', async () => {
      const input: SendMessageInput = {
        content: 'Check out this image',
        type: 'image',
        author_id: testUser.id,
        channel_id: testChannel.id,
        image_url: 'https://example.com/image.jpg',
      };

      const result = await sendMessage(input);

      expect(result.type).toEqual('image');
      expect(result.image_url).toEqual('https://example.com/image.jpg');
    });

    it('should handle system messages', async () => {
      const input: SendMessageInput = {
        content: 'User joined the channel',
        type: 'system',
        author_id: testUser.id,
        channel_id: testChannel.id,
      };

      const result = await sendMessage(input);

      expect(result.type).toEqual('system');
    });

    it('should extract link preview from URLs', async () => {
      const input: SendMessageInput = {
        content: 'Check out https://example.com for more info!',
        type: 'text',
        author_id: testUser.id,
        channel_id: testChannel.id,
      };

      const result = await sendMessage(input);

      expect(result.link_preview).toBeDefined();
      expect(result.link_preview?.url).toEqual('https://example.com');
      expect(result.link_preview?.title).toContain('Link Preview');
    });

    it('should not extract link preview for non-text messages', async () => {
      const input: SendMessageInput = {
        content: 'Image with URL https://example.com',
        type: 'image',
        author_id: testUser.id,
        channel_id: testChannel.id,
        image_url: 'https://example.com/image.jpg',
      };

      const result = await sendMessage(input);

      expect(result.link_preview).toBeNull();
    });
  });

  describe('Reply functionality', () => {
    it('should handle replies to messages', async () => {
      // First, create original message
      const originalInput: SendMessageInput = {
        content: 'Original message',
        type: 'text',
        author_id: testUser.id,
        channel_id: testChannel.id,
      };

      const originalMessage = await sendMessage(originalInput);

      // Now reply to it
      const replyInput: SendMessageInput = {
        content: 'This is a reply',
        type: 'text',
        author_id: testUser.id,
        channel_id: testChannel.id,
        reply_to_id: originalMessage.id,
      };

      const reply = await sendMessage(replyInput);

      expect(reply.reply_to_id).toEqual(originalMessage.id);
      expect(reply.reply_to).toBeDefined();
      expect(reply.reply_to?.content).toEqual('Original message');
      expect(reply.reply_to?.author_id).toEqual(testUser.id);
    });

    it('should reject reply to non-existent message', async () => {
      const input: SendMessageInput = {
        content: 'Reply to nothing',
        type: 'text',
        author_id: testUser.id,
        channel_id: testChannel.id,
        reply_to_id: '00000000-0000-0000-0000-000000000000',
      };

      await expect(sendMessage(input)).rejects.toThrow(/reply target message does not exist/i);
    });

    it('should reject reply to message in different channel', async () => {
      // Create another channel and message
      const otherChannelResult = await db.insert(channelsTable)
        .values({
          name: 'Other Channel',
          type: 'public',
          created_by: testUser.id,
        })
        .returning()
        .execute();

      const otherChannel = otherChannelResult[0];

      await db.insert(channelMembersTable)
        .values({
          channel_id: otherChannel.id,
          user_id: testUser.id,
          role: 'member',
        })
        .execute();

      const otherMessageResult = await db.insert(messagesTable)
        .values({
          content: 'Message in other channel',
          type: 'text',
          author_id: testUser.id,
          channel_id: otherChannel.id,
        })
        .returning()
        .execute();

      // Try to reply from different channel
      const input: SendMessageInput = {
        content: 'Cross-channel reply',
        type: 'text',
        author_id: testUser.id,
        channel_id: testChannel.id, // Different channel
        reply_to_id: otherMessageResult[0].id,
      };

      await expect(sendMessage(input)).rejects.toThrow(/reply must be to message in same conversation/i);
    });
  });

  describe('Validation', () => {
    it('should reject message without destination', async () => {
      const input: SendMessageInput = {
        content: 'Message to nowhere',
        type: 'text',
        author_id: testUser.id,
        // No destination specified
      };

      await expect(sendMessage(input)).rejects.toThrow(/exactly one destination/i);
    });

    it('should reject message with multiple destinations', async () => {
      const input: SendMessageInput = {
        content: 'Message to everywhere',
        type: 'text',
        author_id: testUser.id,
        channel_id: testChannel.id,
        recipient_id: recipientUser.id, // Multiple destinations
      };

      await expect(sendMessage(input)).rejects.toThrow(/exactly one destination/i);
    });

    it('should reject message from non-existent author', async () => {
      const input: SendMessageInput = {
        content: 'Message from nobody',
        type: 'text',
        author_id: '00000000-0000-0000-0000-000000000000',
        channel_id: testChannel.id,
      };

      await expect(sendMessage(input)).rejects.toThrow(/author user does not exist/i);
    });

    it('should reject message to non-existent channel', async () => {
      const input: SendMessageInput = {
        content: 'Message to nowhere',
        type: 'text',
        author_id: testUser.id,
        channel_id: '00000000-0000-0000-0000-000000000000',
      };

      await expect(sendMessage(input)).rejects.toThrow(/not a member of the specified channel/i);
    });
  });
});