import { db } from '../db';
import { 
  messagesTable, 
  usersTable, 
  channelsTable, 
  groupsTable, 
  channelMembersTable,
  groupMembersTable 
} from '../db/schema';
import { type SendMessageInput, type MessageWithAuthor } from '../schema';
import { eq, and } from 'drizzle-orm';

// Simple URL regex for link preview detection
const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

async function extractLinkPreview(content: string): Promise<{
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
} | null> {
  const urls = content.match(URL_REGEX);
  if (!urls || urls.length === 0) return null;

  const firstUrl = urls[0];
  
  // Simple mock link preview - in real implementation would fetch metadata
  return {
    url: firstUrl,
    title: `Link Preview for ${firstUrl}`,
    description: 'Generated link preview',
    image: null,
  };
}

async function validateDestination(input: SendMessageInput): Promise<void> {
  const destinationCount = [input.channel_id, input.group_id, input.recipient_id]
    .filter(dest => dest != null).length;

  if (destinationCount !== 1) {
    throw new Error('Message must have exactly one destination (channel, group, or recipient)');
  }

  // Validate channel exists and user has access
  if (input.channel_id) {
    const channelMember = await db.select()
      .from(channelMembersTable)
      .where(and(
        eq(channelMembersTable.channel_id, input.channel_id),
        eq(channelMembersTable.user_id, input.author_id)
      ))
      .limit(1)
      .execute();

    if (channelMember.length === 0) {
      throw new Error('User is not a member of the specified channel');
    }
  }

  // Validate group exists and user has access
  if (input.group_id) {
    const groupMember = await db.select()
      .from(groupMembersTable)
      .where(and(
        eq(groupMembersTable.group_id, input.group_id),
        eq(groupMembersTable.user_id, input.author_id)
      ))
      .limit(1)
      .execute();

    if (groupMember.length === 0) {
      throw new Error('User is not a member of the specified group');
    }
  }

  // Validate recipient exists for DM
  if (input.recipient_id) {
    const recipient = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.recipient_id))
      .limit(1)
      .execute();

    if (recipient.length === 0) {
      throw new Error('Recipient user does not exist');
    }
  }

  // Validate reply_to message exists and is in same destination
  if (input.reply_to_id) {
    const replyMessage = await db.select()
      .from(messagesTable)
      .where(eq(messagesTable.id, input.reply_to_id))
      .limit(1)
      .execute();

    if (replyMessage.length === 0) {
      throw new Error('Reply target message does not exist');
    }

    const originalMessage = replyMessage[0];
    
    // Check if reply is to message in same destination
    const sameDest = (
      (input.channel_id && originalMessage.channel_id === input.channel_id) ||
      (input.group_id && originalMessage.group_id === input.group_id) ||
      (input.recipient_id && (
        (originalMessage.recipient_id === input.recipient_id && originalMessage.author_id === input.author_id) ||
        (originalMessage.author_id === input.recipient_id && originalMessage.recipient_id === input.author_id)
      ))
    );

    if (!sameDest) {
      throw new Error('Reply must be to message in same conversation');
    }
  }
}

export async function sendMessage(input: SendMessageInput): Promise<MessageWithAuthor> {
  try {
    // Validate author exists
    const author = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.author_id))
      .limit(1)
      .execute();

    if (author.length === 0) {
      throw new Error('Author user does not exist');
    }

    // Validate destination and permissions
    await validateDestination(input);

    // Extract link preview if content contains URLs
    const linkPreview = input.type === 'text' ? await extractLinkPreview(input.content) : null;

    // Insert message
    const messageResult = await db.insert(messagesTable)
      .values({
        content: input.content,
        type: input.type,
        author_id: input.author_id,
        channel_id: input.channel_id || null,
        group_id: input.group_id || null,
        recipient_id: input.recipient_id || null,
        image_url: input.image_url || null,
        link_preview: linkPreview,
        reply_to_id: input.reply_to_id || null,
      })
      .returning()
      .execute();

    const message = messageResult[0];

    // Get reply_to message if exists
    let replyToMessage = null;
    if (message.reply_to_id) {
      const replyResult = await db.select()
        .from(messagesTable)
        .innerJoin(usersTable, eq(messagesTable.author_id, usersTable.id))
        .where(eq(messagesTable.id, message.reply_to_id))
        .limit(1)
        .execute();

      if (replyResult.length > 0) {
        const replyData = replyResult[0];
        replyToMessage = {
          ...replyData.messages,
          link_preview: replyData.messages.link_preview as {
            url: string;
            title: string | null;
            description: string | null;
            image: string | null;
          } | null,
        };
      }
    }

    // Return message with author info and properly typed link_preview
    return {
      ...message,
      link_preview: message.link_preview as {
        url: string;
        title: string | null;
        description: string | null;
        image: string | null;
      } | null,
      author: author[0],
      read_by: [],
      reply_to: replyToMessage,
    };
  } catch (error) {
    console.error('Send message failed:', error);
    throw error;
  }
}