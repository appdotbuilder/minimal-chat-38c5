import { db } from '../db';
import { usersTable } from '../db/schema';
import { type User } from '../schema';
import { eq } from 'drizzle-orm';

export async function getUserById(userId: string): Promise<User | null> {
  try {
    const result = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1)
      .execute();

    if (result.length === 0) {
      return null;
    }

    const user = result[0];
    return {
      ...user,
      // Convert nullable timestamp to Date object or null
      last_seen: user.last_seen ? user.last_seen : null,
    };
  } catch (error) {
    console.error('Failed to fetch user by ID:', error);
    throw error;
  }
}