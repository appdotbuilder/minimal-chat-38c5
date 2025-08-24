import { db } from '../db';
import { channelsTable, channelMembersTable } from '../db/schema';
import { type Channel } from '../schema';
import { eq } from 'drizzle-orm';

export async function getUserChannels(userId: string): Promise<Channel[]> {
  try {
    // Join channels with channel_members to get channels the user is a member of
    const results = await db.select({
      id: channelsTable.id,
      name: channelsTable.name,
      description: channelsTable.description,
      type: channelsTable.type,
      created_by: channelsTable.created_by,
      created_at: channelsTable.created_at,
      updated_at: channelsTable.updated_at,
    })
      .from(channelsTable)
      .innerJoin(channelMembersTable, eq(channelsTable.id, channelMembersTable.channel_id))
      .where(eq(channelMembersTable.user_id, userId))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to get user channels:', error);
    throw error;
  }
}