import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  channelsTable, 
  groupsTable, 
  messagesTable, 
  channelMembersTable,
  groupMembersTable,
  messageReadsTable 
} from '../db/schema';
import { getUserConversations } from '../handlers/get_user_conversations';

describe('getUserConversations', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUser1: any;
  let testUser2: any;
  let testUser3: any;

  beforeEach(async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'user1@test.com',
          display_name: 'User One',
          provider: 'google',
          provider_id: 'google1',
          status: 'online',
        },
        {
          email: 'user2@test.com',
          display_name: 'User Two',
          provider: 'github',
          provider_id: 'github1',
          status: 'away',
        },
        {
          email: 'user3@test.com',
          display_name: 'User Three',
          provider: 'discord',
          provider_id: 'discord1',
          status: 'offline',
        },
      ])
      .returning()
      .execute();

    testUser1 = users[0];
    testUser2 = users[1];
    testUser3 = users[2];
  });

  it('should return empty array when user has no conversations', async () => {
    const conversations = await getUserConversations(testUser1.id);

    expect(conversations).toHaveLength(0);
  });

  it('should return channel conversations with participants and last message', async () => {
    // Create a test channel
    const channels = await db.insert(channelsTable)
      .values({
        name: 'Test Channel',
        description: 'A test channel',
        type: 'public',
        created_by: testUser1.id,
      })
      .returning()
      .execute();

    const channel = channels[0];

    // Add users to channel
    await db.insert(channelMembersTable)
      .values([
        { channel_id: channel.id, user_id: testUser1.id, role: 'owner' },
        { channel_id: channel.id, user_id: testUser2.id, role: 'member' },
      ])
      .execute();

    // Create a test message in channel
    await db.insert(messagesTable)
      .values({
        content: 'Hello channel!',
        type: 'text',
        author_id: testUser2.id,
        channel_id: channel.id,
      })
      .execute();

    const conversations = await getUserConversations(testUser1.id);

    expect(conversations).toHaveLength(1);
    expect(conversations[0].id).toEqual(channel.id);
    expect(conversations[0].name).toEqual('Test Channel');
    expect(conversations[0].type).toEqual('channel');
    expect(conversations[0].participants).toHaveLength(2);
    expect(conversations[0].last_message).toBeDefined();
    expect(conversations[0].last_message?.content).toEqual('Hello channel!');
    expect(conversations[0].last_message?.author_id).toEqual(testUser2.id);
    expect(conversations[0].unread_count).toEqual(1); // Message not read by testUser1
  });

  it('should return group conversations with generated names for unnamed groups', async () => {
    // Create a test group without name
    const groups = await db.insert(groupsTable)
      .values({
        name: null,
        created_by: testUser1.id,
      })
      .returning()
      .execute();

    const group = groups[0];

    // Add users to group
    await db.insert(groupMembersTable)
      .values([
        { group_id: group.id, user_id: testUser1.id },
        { group_id: group.id, user_id: testUser2.id },
        { group_id: group.id, user_id: testUser3.id },
      ])
      .execute();

    // Create a test message in group
    await db.insert(messagesTable)
      .values({
        content: 'Hello group!',
        type: 'text',
        author_id: testUser2.id,
        group_id: group.id,
      })
      .execute();

    const conversations = await getUserConversations(testUser1.id);

    expect(conversations).toHaveLength(1);
    expect(conversations[0].id).toEqual(group.id);
    expect(conversations[0].name).toEqual('User Two, User Three'); // Generated from other participants
    expect(conversations[0].type).toEqual('group');
    expect(conversations[0].participants).toHaveLength(3);
    expect(conversations[0].last_message).toBeDefined();
    expect(conversations[0].last_message?.content).toEqual('Hello group!');
    expect(conversations[0].unread_count).toEqual(1);
  });

  it('should return group conversations with custom names', async () => {
    // Create a test group with custom name
    const groups = await db.insert(groupsTable)
      .values({
        name: 'Team Discussion',
        created_by: testUser1.id,
      })
      .returning()
      .execute();

    const group = groups[0];

    // Add users to group
    await db.insert(groupMembersTable)
      .values([
        { group_id: group.id, user_id: testUser1.id },
        { group_id: group.id, user_id: testUser2.id },
      ])
      .execute();

    const conversations = await getUserConversations(testUser1.id);

    expect(conversations).toHaveLength(1);
    expect(conversations[0].name).toEqual('Team Discussion');
    expect(conversations[0].type).toEqual('group');
  });

  it('should return direct message conversations', async () => {
    // Create a direct message
    await db.insert(messagesTable)
      .values({
        content: 'Hello DM!',
        type: 'text',
        author_id: testUser2.id,
        recipient_id: testUser1.id,
      })
      .execute();

    const conversations = await getUserConversations(testUser1.id);

    expect(conversations).toHaveLength(1);
    expect(conversations[0].id).toEqual(testUser2.id); // DM conversation ID is other user's ID
    expect(conversations[0].name).toEqual('User Two');
    expect(conversations[0].type).toEqual('direct');
    expect(conversations[0].participants).toHaveLength(2);
    expect(conversations[0].last_message).toBeDefined();
    expect(conversations[0].last_message?.content).toEqual('Hello DM!');
    expect(conversations[0].last_message?.author_id).toEqual(testUser2.id);
    expect(conversations[0].unread_count).toEqual(1);
  });

  it('should calculate unread counts correctly', async () => {
    // Create a channel with multiple messages
    const channels = await db.insert(channelsTable)
      .values({
        name: 'Test Channel',
        type: 'public',
        created_by: testUser1.id,
      })
      .returning()
      .execute();

    const channel = channels[0];

    // Add user to channel
    await db.insert(channelMembersTable)
      .values({ channel_id: channel.id, user_id: testUser1.id, role: 'owner' })
      .execute();

    // Create multiple messages
    const messages = await db.insert(messagesTable)
      .values([
        {
          content: 'Message 1',
          type: 'text',
          author_id: testUser2.id,
          channel_id: channel.id,
        },
        {
          content: 'Message 2',
          type: 'text',
          author_id: testUser2.id,
          channel_id: channel.id,
        },
        {
          content: 'Message 3',
          type: 'text',
          author_id: testUser2.id,
          channel_id: channel.id,
        },
      ])
      .returning()
      .execute();

    // Mark one message as read
    await db.insert(messageReadsTable)
      .values({
        message_id: messages[0].id,
        user_id: testUser1.id,
      })
      .execute();

    const conversations = await getUserConversations(testUser1.id);

    expect(conversations).toHaveLength(1);
    expect(conversations[0].unread_count).toEqual(2); // 3 messages - 1 read = 2 unread
  });

  it('should sort conversations by last message timestamp', async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    // Create channel
    const channels = await db.insert(channelsTable)
      .values({
        name: 'Old Channel',
        type: 'public',
        created_by: testUser1.id,
      })
      .returning()
      .execute();

    const channel = channels[0];

    await db.insert(channelMembersTable)
      .values({ channel_id: channel.id, user_id: testUser1.id, role: 'owner' })
      .execute();

    // Create group
    const groups = await db.insert(groupsTable)
      .values({
        name: 'Recent Group',
        created_by: testUser1.id,
      })
      .returning()
      .execute();

    const group = groups[0];

    await db.insert(groupMembersTable)
      .values({ group_id: group.id, user_id: testUser1.id })
      .execute();

    // Create messages with specific timestamps
    await db.insert(messagesTable)
      .values([
        {
          content: 'Old message',
          type: 'text',
          author_id: testUser2.id,
          channel_id: channel.id,
          created_at: twoHoursAgo,
        },
        {
          content: 'Recent message',
          type: 'text',
          author_id: testUser2.id,
          group_id: group.id,
          created_at: oneHourAgo,
        },
      ])
      .execute();

    // Create DM with most recent message
    await db.insert(messagesTable)
      .values({
        content: 'Latest DM',
        type: 'text',
        author_id: testUser2.id,
        recipient_id: testUser1.id,
        created_at: now,
      })
      .execute();

    const conversations = await getUserConversations(testUser1.id);

    expect(conversations).toHaveLength(3);
    expect(conversations[0].type).toEqual('direct'); // Most recent
    expect(conversations[1].type).toEqual('group'); // Second most recent
    expect(conversations[2].type).toEqual('channel'); // Oldest
  });

  it('should handle conversations without messages', async () => {
    // Create channel without messages
    const channels = await db.insert(channelsTable)
      .values({
        name: 'Empty Channel',
        type: 'public',
        created_by: testUser1.id,
      })
      .returning()
      .execute();

    const channel = channels[0];

    await db.insert(channelMembersTable)
      .values({ channel_id: channel.id, user_id: testUser1.id, role: 'owner' })
      .execute();

    const conversations = await getUserConversations(testUser1.id);

    expect(conversations).toHaveLength(1);
    expect(conversations[0].last_message).toBeNull();
    expect(conversations[0].unread_count).toEqual(0);
  });

  it('should handle all conversation types together', async () => {
    // Create channel
    const channels = await db.insert(channelsTable)
      .values({
        name: 'Test Channel',
        type: 'public',
        created_by: testUser1.id,
      })
      .returning()
      .execute();

    await db.insert(channelMembersTable)
      .values({ channel_id: channels[0].id, user_id: testUser1.id, role: 'owner' })
      .execute();

    // Create group
    const groups = await db.insert(groupsTable)
      .values({
        name: 'Test Group',
        created_by: testUser1.id,
      })
      .returning()
      .execute();

    await db.insert(groupMembersTable)
      .values({ group_id: groups[0].id, user_id: testUser1.id })
      .execute();

    // Create messages
    await db.insert(messagesTable)
      .values([
        {
          content: 'Channel message',
          type: 'text',
          author_id: testUser2.id,
          channel_id: channels[0].id,
        },
        {
          content: 'Group message',
          type: 'text',
          author_id: testUser2.id,
          group_id: groups[0].id,
        },
        {
          content: 'DM message',
          type: 'text',
          author_id: testUser2.id,
          recipient_id: testUser1.id,
        },
      ])
      .execute();

    const conversations = await getUserConversations(testUser1.id);

    expect(conversations).toHaveLength(3);
    
    const channelConv = conversations.find(c => c.type === 'channel');
    const groupConv = conversations.find(c => c.type === 'group');
    const dmConv = conversations.find(c => c.type === 'direct');

    expect(channelConv).toBeDefined();
    expect(groupConv).toBeDefined();
    expect(dmConv).toBeDefined();

    expect(channelConv?.name).toEqual('Test Channel');
    expect(groupConv?.name).toEqual('Test Group');
    expect(dmConv?.name).toEqual('User Two');
  });

  it('should not include conversations user is not part of', async () => {
    // Create channel but don't add testUser1 as member
    const channels = await db.insert(channelsTable)
      .values({
        name: 'Private Channel',
        type: 'private',
        created_by: testUser2.id,
      })
      .returning()
      .execute();

    await db.insert(channelMembersTable)
      .values({ channel_id: channels[0].id, user_id: testUser2.id, role: 'owner' })
      .execute();

    // Create message in channel
    await db.insert(messagesTable)
      .values({
        content: 'Private message',
        type: 'text',
        author_id: testUser2.id,
        channel_id: channels[0].id,
      })
      .execute();

    const conversations = await getUserConversations(testUser1.id);

    expect(conversations).toHaveLength(0);
  });
});