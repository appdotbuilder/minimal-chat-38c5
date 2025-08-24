import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, channelsTable, groupsTable, messagesTable, channelMembersTable, groupMembersTable } from '../db/schema';
import { searchMessages } from '../handlers/search_messages';

describe('searchMessages', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUser1: any, testUser2: any, testUser3: any;
  let testChannel: any, testGroup: any;

  beforeEach(async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'user1@test.com',
          display_name: 'User One',
          provider: 'github',
          provider_id: 'github_1'
        },
        {
          email: 'user2@test.com',
          display_name: 'User Two',
          provider: 'github',
          provider_id: 'github_2'
        },
        {
          email: 'user3@test.com',
          display_name: 'User Three',
          provider: 'github',
          provider_id: 'github_3'
        }
      ])
      .returning()
      .execute();

    [testUser1, testUser2, testUser3] = users;

    // Create test channel
    const channels = await db.insert(channelsTable)
      .values({
        name: 'test-channel',
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

    // Add members to channel and group
    await db.insert(channelMembersTable)
      .values([
        { channel_id: testChannel.id, user_id: testUser1.id, role: 'owner' },
        { channel_id: testChannel.id, user_id: testUser2.id, role: 'member' }
      ])
      .execute();

    await db.insert(groupMembersTable)
      .values([
        { group_id: testGroup.id, user_id: testUser1.id },
        { group_id: testGroup.id, user_id: testUser2.id }
      ])
      .execute();
  });

  it('should find messages in channels user is member of', async () => {
    // Create test message in channel
    await db.insert(messagesTable)
      .values({
        content: 'Hello world from channel',
        author_id: testUser1.id,
        channel_id: testChannel.id,
        type: 'text'
      })
      .execute();

    const results = await searchMessages('Hello', testUser2.id);

    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('Hello world from channel');
    expect(results[0].author.display_name).toBe('User One');
    expect(results[0].channel_id).toBe(testChannel.id);
  });

  it('should find messages in groups user is member of', async () => {
    // Create test message in group
    await db.insert(messagesTable)
      .values({
        content: 'Hello world from group',
        author_id: testUser1.id,
        group_id: testGroup.id,
        type: 'text'
      })
      .execute();

    const results = await searchMessages('Hello', testUser2.id);

    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('Hello world from group');
    expect(results[0].author.display_name).toBe('User One');
    expect(results[0].group_id).toBe(testGroup.id);
  });

  it('should find direct messages where user is sender or recipient', async () => {
    // Create direct messages
    await db.insert(messagesTable)
      .values([
        {
          content: 'Hello direct message sent',
          author_id: testUser1.id,
          recipient_id: testUser2.id,
          type: 'text'
        },
        {
          content: 'Hello direct message received',
          author_id: testUser2.id,
          recipient_id: testUser1.id,
          type: 'text'
        }
      ])
      .execute();

    const results = await searchMessages('Hello direct', testUser1.id);

    expect(results).toHaveLength(2);
    expect(results.every(msg => msg.content.includes('Hello direct'))).toBe(true);
    expect(results.some(msg => msg.author_id === testUser1.id)).toBe(true);
    expect(results.some(msg => msg.recipient_id === testUser1.id)).toBe(true);
  });

  it('should not return messages from channels user is not member of', async () => {
    // Create message in channel where testUser3 is not a member
    await db.insert(messagesTable)
      .values({
        content: 'Private channel message',
        author_id: testUser1.id,
        channel_id: testChannel.id,
        type: 'text'
      })
      .execute();

    const results = await searchMessages('Private', testUser3.id);

    expect(results).toHaveLength(0);
  });

  it('should not return messages from groups user is not member of', async () => {
    // Create message in group where testUser3 is not a member
    await db.insert(messagesTable)
      .values({
        content: 'Private group message',
        author_id: testUser1.id,
        group_id: testGroup.id,
        type: 'text'
      })
      .execute();

    const results = await searchMessages('Private', testUser3.id);

    expect(results).toHaveLength(0);
  });

  it('should filter by specific channel when channelId provided', async () => {
    // Create another channel with testUser1
    const otherChannel = await db.insert(channelsTable)
      .values({
        name: 'other-channel',
        type: 'public',
        created_by: testUser1.id
      })
      .returning()
      .execute();

    await db.insert(channelMembersTable)
      .values({ channel_id: otherChannel[0].id, user_id: testUser1.id, role: 'owner' })
      .execute();

    // Create messages in both channels
    await db.insert(messagesTable)
      .values([
        {
          content: 'Test message in channel 1',
          author_id: testUser1.id,
          channel_id: testChannel.id,
          type: 'text'
        },
        {
          content: 'Test message in channel 2',
          author_id: testUser1.id,
          channel_id: otherChannel[0].id,
          type: 'text'
        }
      ])
      .execute();

    const results = await searchMessages('Test message', testUser1.id, testChannel.id);

    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('Test message in channel 1');
    expect(results[0].channel_id).toBe(testChannel.id);
  });

  it('should filter by specific group when groupId provided', async () => {
    // Create another group with testUser1
    const otherGroup = await db.insert(groupsTable)
      .values({
        name: 'Other Group',
        created_by: testUser1.id
      })
      .returning()
      .execute();

    await db.insert(groupMembersTable)
      .values({ group_id: otherGroup[0].id, user_id: testUser1.id })
      .execute();

    // Create messages in both groups
    await db.insert(messagesTable)
      .values([
        {
          content: 'Test message in group 1',
          author_id: testUser1.id,
          group_id: testGroup.id,
          type: 'text'
        },
        {
          content: 'Test message in group 2',
          author_id: testUser1.id,
          group_id: otherGroup[0].id,
          type: 'text'
        }
      ])
      .execute();

    const results = await searchMessages('Test message', testUser1.id, undefined, testGroup.id);

    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('Test message in group 1');
    expect(results[0].group_id).toBe(testGroup.id);
  });

  it('should return empty results if user not member of specified channel', async () => {
    await db.insert(messagesTable)
      .values({
        content: 'Channel message',
        author_id: testUser1.id,
        channel_id: testChannel.id,
        type: 'text'
      })
      .execute();

    // testUser3 is not a member of testChannel
    const results = await searchMessages('Channel', testUser3.id, testChannel.id);

    expect(results).toHaveLength(0);
  });

  it('should return empty results if user not member of specified group', async () => {
    await db.insert(messagesTable)
      .values({
        content: 'Group message',
        author_id: testUser1.id,
        group_id: testGroup.id,
        type: 'text'
      })
      .execute();

    // testUser3 is not a member of testGroup
    const results = await searchMessages('Group', testUser3.id, undefined, testGroup.id);

    expect(results).toHaveLength(0);
  });

  it('should perform case-insensitive search', async () => {
    await db.insert(messagesTable)
      .values({
        content: 'Hello World Message',
        author_id: testUser1.id,
        channel_id: testChannel.id,
        type: 'text'
      })
      .execute();

    const results = await searchMessages('hello world', testUser1.id);

    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('Hello World Message');
  });

  it('should respect limit parameter', async () => {
    // Create multiple messages
    const messages = Array.from({ length: 5 }, (_, i) => ({
      content: `Search message ${i + 1}`,
      author_id: testUser1.id,
      channel_id: testChannel.id,
      type: 'text' as const
    }));

    await db.insert(messagesTable)
      .values(messages)
      .execute();

    const results = await searchMessages('Search message', testUser1.id, undefined, undefined, 3);

    expect(results).toHaveLength(3);
  });

  it('should return results ordered by created_at descending', async () => {
    // Create messages with slight delay to ensure different timestamps
    await db.insert(messagesTable)
      .values({
        content: 'First search message',
        author_id: testUser1.id,
        channel_id: testChannel.id,
        type: 'text'
      })
      .execute();

    await new Promise(resolve => setTimeout(resolve, 10));

    await db.insert(messagesTable)
      .values({
        content: 'Second search message',
        author_id: testUser1.id,
        channel_id: testChannel.id,
        type: 'text'
      })
      .execute();

    const results = await searchMessages('search message', testUser1.id);

    expect(results).toHaveLength(2);
    // Most recent should be first
    expect(results[0].content).toBe('Second search message');
    expect(results[1].content).toBe('First search message');
    expect(results[0].created_at.getTime()).toBeGreaterThan(results[1].created_at.getTime());
  });

  it('should return empty array when no matches found', async () => {
    await db.insert(messagesTable)
      .values({
        content: 'No matches here',
        author_id: testUser1.id,
        channel_id: testChannel.id,
        type: 'text'
      })
      .execute();

    const results = await searchMessages('nonexistent', testUser1.id);

    expect(results).toHaveLength(0);
  });

  it('should return empty array when user has no accessible conversations', async () => {
    // testUser3 has no channel/group memberships and no direct messages
    const results = await searchMessages('anything', testUser3.id);

    expect(results).toHaveLength(0);
  });

  it('should include author information in results', async () => {
    await db.insert(messagesTable)
      .values({
        content: 'Message with author',
        author_id: testUser1.id,
        channel_id: testChannel.id,
        type: 'text'
      })
      .execute();

    const results = await searchMessages('author', testUser1.id);

    expect(results).toHaveLength(1);
    expect(results[0].author).toBeDefined();
    expect(results[0].author.id).toBe(testUser1.id);
    expect(results[0].author.display_name).toBe('User One');
    expect(results[0].author.email).toBe('user1@test.com');
    expect(typeof results[0].author.created_at).toBe('object');
    expect(results[0].author.created_at).toBeInstanceOf(Date);
  });
});