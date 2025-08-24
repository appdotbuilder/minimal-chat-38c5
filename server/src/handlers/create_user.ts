import { type CreateUserInput, type User } from '../schema';

export async function createUser(input: CreateUserInput): Promise<User> {
  // This is a placeholder declaration! Real code should be implemented here.
  // The goal of this handler is creating a new user from social login data,
  // checking if user already exists by provider_id and email, and persisting to database.
  return Promise.resolve({
    id: '00000000-0000-0000-0000-000000000000',
    email: input.email,
    display_name: input.display_name,
    avatar_url: input.avatar_url || null,
    provider: input.provider,
    provider_id: input.provider_id,
    status: 'offline',
    last_seen: null,
    created_at: new Date(),
    updated_at: new Date(),
  } as User);
}