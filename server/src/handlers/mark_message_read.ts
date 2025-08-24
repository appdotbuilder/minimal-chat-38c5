import { db } from '../db';
import { messageReadsTable, messagesTable, usersTable } from '../db/schema';
import { type MarkMessageReadInput, type MessageRead } from '../schema';
import { eq, and } from 'drizzle-orm';

export const markMessageRead = async (input: MarkMessageReadInput): Promise<MessageRead> => {
  try {
    // Verify that the message exists
    const messageExists = await db.select()
      .from(messagesTable)
      .where(eq(messagesTable.id, input.message_id))
      .execute();

    if (messageExists.length === 0) {
      throw new Error('Message not found');
    }

    // Verify that the user exists
    const userExists = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .execute();

    if (userExists.length === 0) {
      throw new Error('User not found');
    }

    // Check if the user has already marked this message as read
    const existingRead = await db.select()
      .from(messageReadsTable)
      .where(
        and(
          eq(messageReadsTable.message_id, input.message_id),
          eq(messageReadsTable.user_id, input.user_id)
        )
      )
      .execute();

    if (existingRead.length > 0) {
      // Return existing read receipt
      return existingRead[0];
    }

    // Create new read receipt
    const result = await db.insert(messageReadsTable)
      .values({
        message_id: input.message_id,
        user_id: input.user_id,
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Mark message read failed:', error);
    throw error;
  }
};