import { db } from '../db';
import { typingIndicatorsTable } from '../db/schema';
import { type StartTypingInput } from '../schema';
import { eq, and, isNull } from 'drizzle-orm';
import { SQL } from 'drizzle-orm';

export async function stopTyping(input: StartTypingInput): Promise<void> {
  try {
    // Build conditions to find the typing indicator to remove
    const conditions: SQL<unknown>[] = [
      eq(typingIndicatorsTable.user_id, input.user_id)
    ];

    // Add context-specific conditions based on conversation type
    if (input.channel_id) {
      conditions.push(eq(typingIndicatorsTable.channel_id, input.channel_id));
      conditions.push(isNull(typingIndicatorsTable.group_id));
      conditions.push(isNull(typingIndicatorsTable.recipient_id));
    } else if (input.group_id) {
      conditions.push(eq(typingIndicatorsTable.group_id, input.group_id));
      conditions.push(isNull(typingIndicatorsTable.channel_id));
      conditions.push(isNull(typingIndicatorsTable.recipient_id));
    } else if (input.recipient_id) {
      conditions.push(eq(typingIndicatorsTable.recipient_id, input.recipient_id));
      conditions.push(isNull(typingIndicatorsTable.channel_id));
      conditions.push(isNull(typingIndicatorsTable.group_id));
    } else {
      // If no context is provided, remove all typing indicators for the user
      // This handles cases where the client wants to clear all typing states
    }

    // Delete the typing indicator(s)
    await db.delete(typingIndicatorsTable)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .execute();

  } catch (error) {
    console.error('Stop typing operation failed:', error);
    throw error;
  }
}