import { db } from '../db';
import { usersTable } from '../db/schema';
import { type UpdateUserStatusInput, type User } from '../schema';
import { eq } from 'drizzle-orm';

export const updateUserStatus = async (input: UpdateUserStatusInput): Promise<User> => {
  try {
    // Update user status and last_seen timestamp
    const result = await db.update(usersTable)
      .set({
        status: input.status,
        last_seen: new Date(), // Always update last_seen when status changes
        updated_at: new Date(), // Update the general timestamp
      })
      .where(eq(usersTable.id, input.user_id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error(`User with id ${input.user_id} not found`);
    }

    return result[0];
  } catch (error) {
    console.error('User status update failed:', error);
    throw error;
  }
};