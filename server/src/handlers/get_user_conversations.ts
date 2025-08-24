import { db } from '../db';
import { 
  channelsTable, 
  channelMembersTable, 
  groupsTable, 
  groupMembersTable, 
  messagesTable, 
  usersTable,
  messageReadsTable 
} from '../db/schema';
import { type Conversation } from '../schema';
import { eq, and, or, desc, isNull, sql, SQL } from 'drizzle-orm';

export async function getUserConversations(userId: string): Promise<Conversation[]> {
  try {
    const conversations: Conversation[] = [];

    // 1. Get channel conversations
    const channelConversations = await getChannelConversations(userId);
    conversations.push(...channelConversations);

    // 2. Get group conversations
    const groupConversations = await getGroupConversations(userId);
    conversations.push(...groupConversations);

    // 3. Get direct message conversations
    const dmConversations = await getDirectMessageConversations(userId);
    conversations.push(...dmConversations);

    // Sort conversations by last message timestamp (most recent first)
    conversations.sort((a, b) => {
      // If both have no messages, maintain original order
      if (!a.last_message && !b.last_message) return 0;
      
      // If only a has no message, put it last
      if (!a.last_message && b.last_message) return 1;
      
      // If only b has no message, put it last  
      if (a.last_message && !b.last_message) return -1;
      
      // Both have messages, compare timestamps
      const aTime = a.last_message!.created_at.getTime();
      const bTime = b.last_message!.created_at.getTime();
      return bTime - aTime;
    });

    return conversations;
  } catch (error) {
    console.error('Failed to get user conversations:', error);
    throw error;
  }
}

async function getChannelConversations(userId: string): Promise<Conversation[]> {
  // Get channels user is a member of
  const channelResults = await db.select({
    channel_id: channelsTable.id,
    channel_name: channelsTable.name,
  })
  .from(channelsTable)
  .innerJoin(channelMembersTable, eq(channelMembersTable.channel_id, channelsTable.id))
  .where(eq(channelMembersTable.user_id, userId))
  .execute();

  const conversations: Conversation[] = [];

  for (const result of channelResults) {
    // Get all participants for this channel
    const participants = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      display_name: usersTable.display_name,
      avatar_url: usersTable.avatar_url,
      provider: usersTable.provider,
      provider_id: usersTable.provider_id,
      status: usersTable.status,
      last_seen: usersTable.last_seen,
      created_at: usersTable.created_at,
      updated_at: usersTable.updated_at,
    })
    .from(usersTable)
    .innerJoin(channelMembersTable, eq(channelMembersTable.user_id, usersTable.id))
    .where(eq(channelMembersTable.channel_id, result.channel_id))
    .execute();

    // Get last message for this channel
    const lastMessages = await db.select({
      id: messagesTable.id,
      content: messagesTable.content,
      type: messagesTable.type,
      author_id: messagesTable.author_id,
      created_at: messagesTable.created_at,
    })
    .from(messagesTable)
    .where(eq(messagesTable.channel_id, result.channel_id))
    .orderBy(desc(messagesTable.created_at))
    .limit(1)
    .execute();

    // Get unread count for this channel
    const unreadCount = await getUnreadCount(userId, result.channel_id, 'channel');

    // Build last message if exists
    const lastMessage = lastMessages.length > 0 ? {
      id: lastMessages[0].id,
      content: lastMessages[0].content,
      type: lastMessages[0].type,
      author_id: lastMessages[0].author_id,
      channel_id: result.channel_id,
      group_id: null,
      recipient_id: null,
      image_url: null,
      link_preview: null,
      reply_to_id: null,
      edited_at: null,
      created_at: lastMessages[0].created_at,
    } : null;

    conversations.push({
      id: result.channel_id,
      name: result.channel_name,
      type: 'channel',
      participants,
      last_message: lastMessage,
      unread_count: unreadCount,
    });
  }

  return conversations;
}

async function getGroupConversations(userId: string): Promise<Conversation[]> {
  // Get groups user is a member of
  const groupResults = await db.select({
    group_id: groupsTable.id,
    group_name: groupsTable.name,
  })
  .from(groupsTable)
  .innerJoin(groupMembersTable, eq(groupMembersTable.group_id, groupsTable.id))
  .where(eq(groupMembersTable.user_id, userId))
  .execute();

  const conversations: Conversation[] = [];

  for (const result of groupResults) {
    // Get all participants for this group
    const participants = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      display_name: usersTable.display_name,
      avatar_url: usersTable.avatar_url,
      provider: usersTable.provider,
      provider_id: usersTable.provider_id,
      status: usersTable.status,
      last_seen: usersTable.last_seen,
      created_at: usersTable.created_at,
      updated_at: usersTable.updated_at,
    })
    .from(usersTable)
    .innerJoin(groupMembersTable, eq(groupMembersTable.user_id, usersTable.id))
    .where(eq(groupMembersTable.group_id, result.group_id))
    .execute();

    // Get last message for this group
    const lastMessages = await db.select({
      id: messagesTable.id,
      content: messagesTable.content,
      type: messagesTable.type,
      author_id: messagesTable.author_id,
      created_at: messagesTable.created_at,
    })
    .from(messagesTable)
    .where(eq(messagesTable.group_id, result.group_id))
    .orderBy(desc(messagesTable.created_at))
    .limit(1)
    .execute();

    // Get unread count for this group
    const unreadCount = await getUnreadCount(userId, result.group_id, 'group');

    // Generate group name if null (use participant names)
    const groupName = result.group_name || participants
      .filter(p => p.id !== userId)
      .map(p => p.display_name)
      .join(', ') || 'Unnamed Group';

    // Build last message if exists
    const lastMessage = lastMessages.length > 0 ? {
      id: lastMessages[0].id,
      content: lastMessages[0].content,
      type: lastMessages[0].type,
      author_id: lastMessages[0].author_id,
      channel_id: null,
      group_id: result.group_id,
      recipient_id: null,
      image_url: null,
      link_preview: null,
      reply_to_id: null,
      edited_at: null,
      created_at: lastMessages[0].created_at,
    } : null;

    conversations.push({
      id: result.group_id,
      name: groupName,
      type: 'group',
      participants,
      last_message: lastMessage,
      unread_count: unreadCount,
    });
  }

  return conversations;
}

async function getDirectMessageConversations(userId: string): Promise<Conversation[]> {
  // First, get all DM messages involving this user
  const dmMessages = await db.select({
    author_id: messagesTable.author_id,
    recipient_id: messagesTable.recipient_id,
  })
  .from(messagesTable)
  .where(
    and(
      or(
        eq(messagesTable.author_id, userId),
        eq(messagesTable.recipient_id, userId)
      ),
      isNull(messagesTable.channel_id),
      isNull(messagesTable.group_id)
    )
  )
  .execute();

  // Extract unique user IDs that have DM conversations with current user
  const otherUserIds = new Set<string>();
  for (const message of dmMessages) {
    if (message.author_id === userId && message.recipient_id) {
      otherUserIds.add(message.recipient_id);
    } else if (message.recipient_id === userId && message.author_id) {
      otherUserIds.add(message.author_id);
    }
  }

  const conversations: Conversation[] = [];

  for (const otherUserId of otherUserIds) {
    // Get the other user's info
    const otherUsers = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      display_name: usersTable.display_name,
      avatar_url: usersTable.avatar_url,
      provider: usersTable.provider,
      provider_id: usersTable.provider_id,
      status: usersTable.status,
      last_seen: usersTable.last_seen,
      created_at: usersTable.created_at,
      updated_at: usersTable.updated_at,
    })
    .from(usersTable)
    .where(eq(usersTable.id, otherUserId))
    .execute();

    if (otherUsers.length === 0) continue;

    const otherUser = otherUsers[0];

    // Get current user info
    const currentUsers = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      display_name: usersTable.display_name,
      avatar_url: usersTable.avatar_url,
      provider: usersTable.provider,
      provider_id: usersTable.provider_id,
      status: usersTable.status,
      last_seen: usersTable.last_seen,
      created_at: usersTable.created_at,
      updated_at: usersTable.updated_at,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .execute();

    if (currentUsers.length === 0) continue;

    // Get last message in this DM conversation
    const lastMessages = await db.select({
      id: messagesTable.id,
      content: messagesTable.content,
      type: messagesTable.type,
      author_id: messagesTable.author_id,
      created_at: messagesTable.created_at,
    })
    .from(messagesTable)
    .where(
      and(
        or(
          and(eq(messagesTable.author_id, userId), eq(messagesTable.recipient_id, otherUserId)),
          and(eq(messagesTable.author_id, otherUserId), eq(messagesTable.recipient_id, userId))
        ),
        isNull(messagesTable.channel_id),
        isNull(messagesTable.group_id)
      )
    )
    .orderBy(desc(messagesTable.created_at))
    .limit(1)
    .execute();

    // Get unread count for this DM
    const unreadCount = await getUnreadCount(userId, otherUserId, 'direct');

    const lastMessage = lastMessages.length > 0 ? {
      id: lastMessages[0].id,
      content: lastMessages[0].content,
      type: lastMessages[0].type,
      author_id: lastMessages[0].author_id,
      channel_id: null,
      group_id: null,
      recipient_id: otherUser.id,
      image_url: null,
      link_preview: null,
      reply_to_id: null,
      edited_at: null,
      created_at: lastMessages[0].created_at,
    } : null;

    conversations.push({
      id: otherUser.id, // Use other user's ID as conversation ID for DMs
      name: otherUser.display_name,
      type: 'direct',
      participants: [currentUsers[0], otherUser],
      last_message: lastMessage,
      unread_count: unreadCount,
    });
  }

  return conversations;
}

async function getUnreadCount(userId: string, conversationId: string, type: 'channel' | 'group' | 'direct'): Promise<number> {
  const conditions: SQL<unknown>[] = [];

  if (type === 'channel') {
    conditions.push(eq(messagesTable.channel_id, conversationId));
  } else if (type === 'group') {
    conditions.push(eq(messagesTable.group_id, conversationId));
  } else if (type === 'direct') {
    // For direct messages, conversationId is the other user's ID
    conditions.push(
      eq(messagesTable.author_id, conversationId),
      eq(messagesTable.recipient_id, userId),
      isNull(messagesTable.channel_id),
      isNull(messagesTable.group_id)
    );
  }

  const result = await db.select({
    unread_count: sql<number>`COUNT(*)`,
  })
  .from(messagesTable)
  .leftJoin(
    messageReadsTable,
    and(
      eq(messageReadsTable.message_id, messagesTable.id),
      eq(messageReadsTable.user_id, userId)
    )
  )
  .where(
    and(
      ...conditions,
      isNull(messageReadsTable.id) // Message not read by user
    )
  )
  .execute();

  // Convert string to number since SQL COUNT returns string
  return parseInt(String(result[0]?.unread_count || 0), 10);
}