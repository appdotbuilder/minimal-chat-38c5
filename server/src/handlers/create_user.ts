import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput, type User } from '../schema';
import { eq, or } from 'drizzle-orm';

export const createUser = async (input: CreateUserInput): Promise<User> => {
  try {
    // Check if user already exists by provider_id or email
    const existingUsers = await db.select()
      .from(usersTable)
      .where(
        or(
          eq(usersTable.provider_id, input.provider_id),
          eq(usersTable.email, input.email)
        )
      )
      .execute();

    if (existingUsers.length > 0) {
      // Return existing user if found
      return existingUsers[0];
    }

    // Create new user
    const result = await db.insert(usersTable)
      .values({
        email: input.email,
        display_name: input.display_name,
        avatar_url: input.avatar_url || null,
        provider: input.provider,
        provider_id: input.provider_id,
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('User creation failed:', error);
    throw error;
  }
};