import { db } from '../db';
import { messagesTable, usersTable, messageReadsTable } from '../db/schema';
import { type MessageWithAuthor } from '../schema';
import { eq, and, desc, SQL, or, isNull } from 'drizzle-orm';

export async function getMessages(
  channelId?: string,
  groupId?: string,
  recipientId?: string,
  authorId?: string,
  limit = 50,
  offset = 0
): Promise<MessageWithAuthor[]> {
  try {
    // Handle DMs separately due to OR logic requirements
    if (recipientId && authorId) {
      return await getDMMessages(recipientId, authorId, limit, offset);
    }

    // Build conditions array for filtering
    const conditions: SQL<unknown>[] = [];

    // Filter by conversation type
    if (channelId) {
      conditions.push(eq(messagesTable.channel_id, channelId));
      conditions.push(isNull(messagesTable.group_id));
      conditions.push(isNull(messagesTable.recipient_id));
    } else if (groupId) {
      conditions.push(eq(messagesTable.group_id, groupId));
      conditions.push(isNull(messagesTable.channel_id));
      conditions.push(isNull(messagesTable.recipient_id));
    } else {
      // Invalid combination - return empty results
      return [];
    }

    // Build and execute query with proper method chaining
    const results = await db.select({
      // Message fields
      id: messagesTable.id,
      content: messagesTable.content,
      type: messagesTable.type,
      author_id: messagesTable.author_id,
      channel_id: messagesTable.channel_id,
      group_id: messagesTable.group_id,
      recipient_id: messagesTable.recipient_id,
      image_url: messagesTable.image_url,
      link_preview: messagesTable.link_preview,
      reply_to_id: messagesTable.reply_to_id,
      edited_at: messagesTable.edited_at,
      created_at: messagesTable.created_at,
      // Author fields
      author: {
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
      }
    })
    .from(messagesTable)
    .innerJoin(usersTable, eq(messagesTable.author_id, usersTable.id))
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .orderBy(desc(messagesTable.created_at))
    .limit(limit)
    .offset(offset)
    .execute();

    // Process results to include read receipts and reply-to messages
    return await processMessages(results);
  } catch (error) {
    console.error('Failed to get messages:', error);
    throw error;
  }
}

// Separate function to handle DM queries
async function getDMMessages(
  recipientId: string,
  authorId: string,
  limit: number,
  offset: number
): Promise<MessageWithAuthor[]> {
  // Get messages in both directions for DMs
  const results = await db.select({
    // Message fields
    id: messagesTable.id,
    content: messagesTable.content,
    type: messagesTable.type,
    author_id: messagesTable.author_id,
    channel_id: messagesTable.channel_id,
    group_id: messagesTable.group_id,
    recipient_id: messagesTable.recipient_id,
    image_url: messagesTable.image_url,
    link_preview: messagesTable.link_preview,
    reply_to_id: messagesTable.reply_to_id,
    edited_at: messagesTable.edited_at,
    created_at: messagesTable.created_at,
    // Author fields
    author: {
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
    }
  })
  .from(messagesTable)
  .innerJoin(usersTable, eq(messagesTable.author_id, usersTable.id))
  .where(
    and(
      isNull(messagesTable.channel_id),
      isNull(messagesTable.group_id),
      or(
        // Messages from authorId to recipientId
        and(
          eq(messagesTable.author_id, authorId),
          eq(messagesTable.recipient_id, recipientId)
        ),
        // Messages from recipientId to authorId
        and(
          eq(messagesTable.author_id, recipientId),
          eq(messagesTable.recipient_id, authorId)
        )
      )
    )
  )
  .orderBy(desc(messagesTable.created_at))
  .limit(limit)
  .offset(offset)
  .execute();

  return await processMessages(results);
}

// Helper function to convert link_preview to proper type
function convertLinkPreview(rawPreview: unknown): { url: string; title: string | null; description: string | null; image: string | null; } | null {
  if (!rawPreview || typeof rawPreview !== 'object') {
    return null;
  }

  const preview = rawPreview as any;
  return {
    url: preview.url || '',
    title: preview.title || null,
    description: preview.description || null,
    image: preview.image || null,
  };
}

// Helper function to process messages and add read receipts and reply-to data
async function processMessages(results: any[]): Promise<MessageWithAuthor[]> {
  return await Promise.all(
    results.map(async (result) => {
      // Get users who have read this message
      const readUsers = await db.select({
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
      .from(messageReadsTable)
      .innerJoin(usersTable, eq(messageReadsTable.user_id, usersTable.id))
      .where(eq(messageReadsTable.message_id, result.id))
      .execute();

      // Get reply-to message if it exists
      let replyToMessage = null;
      if (result.reply_to_id) {
        const replyResults = await db.select({
          id: messagesTable.id,
          content: messagesTable.content,
          type: messagesTable.type,
          author_id: messagesTable.author_id,
          channel_id: messagesTable.channel_id,
          group_id: messagesTable.group_id,
          recipient_id: messagesTable.recipient_id,
          image_url: messagesTable.image_url,
          link_preview: messagesTable.link_preview,
          reply_to_id: messagesTable.reply_to_id,
          edited_at: messagesTable.edited_at,
          created_at: messagesTable.created_at,
        })
        .from(messagesTable)
        .where(eq(messagesTable.id, result.reply_to_id))
        .execute();

        if (replyResults.length > 0) {
          const rawReply = replyResults[0];
          replyToMessage = {
            id: rawReply.id,
            content: rawReply.content,
            type: rawReply.type,
            author_id: rawReply.author_id,
            channel_id: rawReply.channel_id,
            group_id: rawReply.group_id,
            recipient_id: rawReply.recipient_id,
            image_url: rawReply.image_url,
            link_preview: convertLinkPreview(rawReply.link_preview),
            reply_to_id: rawReply.reply_to_id,
            edited_at: rawReply.edited_at,
            created_at: rawReply.created_at,
          };
        }
      }

      return {
        id: result.id,
        content: result.content,
        type: result.type,
        author_id: result.author_id,
        channel_id: result.channel_id,
        group_id: result.group_id,
        recipient_id: result.recipient_id,
        image_url: result.image_url,
        link_preview: convertLinkPreview(result.link_preview),
        reply_to_id: result.reply_to_id,
        edited_at: result.edited_at,
        created_at: result.created_at,
        author: result.author,
        read_by: readUsers,
        reply_to: replyToMessage,
      };
    })
  );
}