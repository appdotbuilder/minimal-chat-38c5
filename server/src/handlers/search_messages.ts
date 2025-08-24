import { db } from '../db';
import { messagesTable, usersTable, channelMembersTable, groupMembersTable } from '../db/schema';
import { type MessageWithAuthor } from '../schema';
import { eq, and, or, ilike, desc, inArray, isNull, SQL } from 'drizzle-orm';

export async function searchMessages(
  searchQuery: string,
  userId: string,
  channelId?: string,
  groupId?: string,
  limit = 20
): Promise<MessageWithAuthor[]> {
  try {
    // Build base query with joins for message author
    let baseQuery = db.select({
      message: messagesTable,
      author: usersTable
    })
    .from(messagesTable)
    .innerJoin(usersTable, eq(messagesTable.author_id, usersTable.id));

    // Build conditions array for filtering
    const conditions: SQL<unknown>[] = [];

    // Add text search condition (case-insensitive search in content)
    conditions.push(ilike(messagesTable.content, `%${searchQuery}%`));

    // Build access control conditions - user can only see messages they have access to
    const accessConditions: SQL<unknown>[] = [];

    // 1. Direct messages where user is sender or recipient
    const dmRecipientCondition = and(
      eq(messagesTable.recipient_id, userId),
      isNull(messagesTable.channel_id),
      isNull(messagesTable.group_id)
    );
    if (dmRecipientCondition) {
      accessConditions.push(dmRecipientCondition);
    }
    
    const dmAuthorCondition = and(
      eq(messagesTable.author_id, userId),
      isNull(messagesTable.channel_id),
      isNull(messagesTable.group_id)
    );
    if (dmAuthorCondition) {
      accessConditions.push(dmAuthorCondition);
    }

    // 2. Channel messages where user is a member
    if (channelId) {
      // If specific channel is requested, check user membership
      const channelAccess = db.select()
        .from(channelMembersTable)
        .where(
          and(
            eq(channelMembersTable.channel_id, channelId),
            eq(channelMembersTable.user_id, userId)
          )
        )
        .limit(1);
      
      const membershipExists = await channelAccess.execute();
      if (membershipExists.length === 0) {
        // User is not a member of this channel, return empty results
        return [];
      }
      
      accessConditions.push(eq(messagesTable.channel_id, channelId));
    } else {
      // Include all channel messages where user is a member
      const userChannels = db.select({
        channel_id: channelMembersTable.channel_id
      })
      .from(channelMembersTable)
      .where(eq(channelMembersTable.user_id, userId));
      
      const userChannelIds = await userChannels.execute();
      
      if (userChannelIds.length > 0) {
        const channelIds = userChannelIds.map(ch => ch.channel_id);
        accessConditions.push(
          inArray(messagesTable.channel_id, channelIds)
        );
      }
    }

    // 3. Group messages where user is a member
    if (groupId) {
      // If specific group is requested, check user membership
      const groupAccess = db.select()
        .from(groupMembersTable)
        .where(
          and(
            eq(groupMembersTable.group_id, groupId),
            eq(groupMembersTable.user_id, userId)
          )
        )
        .limit(1);
      
      const membershipExists = await groupAccess.execute();
      if (membershipExists.length === 0) {
        // User is not a member of this group, return empty results
        return [];
      }
      
      accessConditions.push(eq(messagesTable.group_id, groupId));
    } else {
      // Include all group messages where user is a member
      const userGroups = db.select({
        group_id: groupMembersTable.group_id
      })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.user_id, userId));
      
      const userGroupIds = await userGroups.execute();
      
      if (userGroupIds.length > 0) {
        const groupIds = userGroupIds.map(g => g.group_id);
        accessConditions.push(
          inArray(messagesTable.group_id, groupIds)
        );
      }
    }

    // Combine access conditions with OR (user can access if ANY condition is met)
    if (accessConditions.length > 0) {
      const accessCondition = accessConditions.length === 1 
        ? accessConditions[0] 
        : or(...accessConditions);
      if (accessCondition) {
        conditions.push(accessCondition);
      }
    } else {
      // User has no access to any conversations, return empty results
      return [];
    }

    // Apply all conditions - build the complete query in one chain
    const finalQuery = conditions.length === 0
      ? baseQuery
          .orderBy(desc(messagesTable.created_at))
          .limit(limit)
      : baseQuery
          .where(conditions.length === 1 ? conditions[0] : and(...conditions))
          .orderBy(desc(messagesTable.created_at))
          .limit(limit);

    const results = await finalQuery.execute();

    // Transform results to match MessageWithAuthor schema
    return results.map(result => ({
      id: result.message.id,
      content: result.message.content,
      type: result.message.type,
      author_id: result.message.author_id,
      channel_id: result.message.channel_id,
      group_id: result.message.group_id,
      recipient_id: result.message.recipient_id,
      image_url: result.message.image_url,
      link_preview: result.message.link_preview as { url: string; title: string | null; description: string | null; image: string | null; } | null,
      reply_to_id: result.message.reply_to_id,
      edited_at: result.message.edited_at,
      created_at: result.message.created_at,
      author: {
        id: result.author.id,
        email: result.author.email,
        display_name: result.author.display_name,
        avatar_url: result.author.avatar_url,
        provider: result.author.provider,
        provider_id: result.author.provider_id,
        status: result.author.status,
        last_seen: result.author.last_seen,
        created_at: result.author.created_at,
        updated_at: result.author.updated_at
      },
      read_by: [], // Not included in this search - would require additional queries
      reply_to: null // Not included in this search - would require additional queries
    }));

  } catch (error) {
    console.error('Message search failed:', error);
    throw error;
  }
}