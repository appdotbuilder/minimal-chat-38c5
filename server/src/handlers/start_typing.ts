import { db } from '../db';
import { typingIndicatorsTable } from '../db/schema';
import { type StartTypingInput, type TypingIndicator } from '../schema';
import { eq, and, or, lt } from 'drizzle-orm';

export async function startTyping(input: StartTypingInput): Promise<TypingIndicator> {
  try {
    // Clean up old typing indicators (older than 10 seconds)
    const tenSecondsAgo = new Date(Date.now() - 10 * 1000);
    await db.delete(typingIndicatorsTable)
      .where(lt(typingIndicatorsTable.started_at, tenSecondsAgo))
      .execute();

    // Build conditions for finding existing typing indicator
    const conditions = [eq(typingIndicatorsTable.user_id, input.user_id)];

    // Add location-specific conditions
    if (input.channel_id) {
      conditions.push(eq(typingIndicatorsTable.channel_id, input.channel_id));
    } else if (input.group_id) {
      conditions.push(eq(typingIndicatorsTable.group_id, input.group_id));
    } else if (input.recipient_id) {
      conditions.push(eq(typingIndicatorsTable.recipient_id, input.recipient_id));
    }

    // Check if user is already typing in this location
    const existingIndicator = await db.select()
      .from(typingIndicatorsTable)
      .where(and(...conditions))
      .execute();

    if (existingIndicator.length > 0) {
      // Update existing indicator with new timestamp
      const result = await db.update(typingIndicatorsTable)
        .set({ started_at: new Date() })
        .where(eq(typingIndicatorsTable.id, existingIndicator[0].id))
        .returning()
        .execute();

      return result[0];
    } else {
      // Create new typing indicator
      const result = await db.insert(typingIndicatorsTable)
        .values({
          user_id: input.user_id,
          channel_id: input.channel_id || null,
          group_id: input.group_id || null,
          recipient_id: input.recipient_id || null,
        })
        .returning()
        .execute();

      return result[0];
    }
  } catch (error) {
    console.error('Start typing failed:', error);
    throw error;
  }
}