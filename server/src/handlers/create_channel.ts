import { db } from '../db';
import { channelsTable, channelMembersTable, usersTable } from '../db/schema';
import { type CreateChannelInput, type Channel } from '../schema';
import { eq } from 'drizzle-orm';

export const createChannel = async (input: CreateChannelInput): Promise<Channel> => {
  try {
    // Verify that the creator user exists
    const creator = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.created_by))
      .execute();
    
    if (creator.length === 0) {
      throw new Error(`User with id ${input.created_by} not found`);
    }

    // Create the channel
    const channelResult = await db.insert(channelsTable)
      .values({
        name: input.name,
        description: input.description || null,
        type: input.type,
        created_by: input.created_by
      })
      .returning()
      .execute();

    const channel = channelResult[0];

    // Automatically add the creator as an owner member
    await db.insert(channelMembersTable)
      .values({
        channel_id: channel.id,
        user_id: input.created_by,
        role: 'owner'
      })
      .execute();

    return channel;
  } catch (error) {
    console.error('Channel creation failed:', error);
    throw error;
  }
};