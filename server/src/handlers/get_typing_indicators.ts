import { db } from '../db';
import { typingIndicatorsTable } from '../db/schema';
import { type TypingIndicator } from '../schema';
import { eq, and, gte } from 'drizzle-orm';
import { SQL } from 'drizzle-orm';

export async function getTypingIndicators(
  channelId?: string,
  groupId?: string,
  recipientId?: string
): Promise<TypingIndicator[]> {
  try {
    // Calculate cutoff time (30 seconds ago)
    const cutoffTime = new Date();
    cutoffTime.setSeconds(cutoffTime.getSeconds() - 30);

    // Build conditions array
    const conditions: SQL<unknown>[] = [];
    
    // Filter out expired indicators (older than 30 seconds)
    conditions.push(gte(typingIndicatorsTable.started_at, cutoffTime));

    // Add conversation-specific filters
    if (channelId) {
      conditions.push(eq(typingIndicatorsTable.channel_id, channelId));
    }
    
    if (groupId) {
      conditions.push(eq(typingIndicatorsTable.group_id, groupId));
    }
    
    if (recipientId) {
      conditions.push(eq(typingIndicatorsTable.recipient_id, recipientId));
    }

    // Build and execute query
    const query = conditions.length > 0
      ? db.select().from(typingIndicatorsTable).where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : db.select().from(typingIndicatorsTable);

    const results = await query.execute();
    
    return results;
  } catch (error) {
    console.error('Get typing indicators failed:', error);
    throw error;
  }
}