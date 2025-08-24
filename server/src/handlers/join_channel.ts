import { db } from '../db';
import { channelMembersTable, channelsTable, usersTable } from '../db/schema';
import { type JoinChannelInput, type ChannelMember } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function joinChannel(input: JoinChannelInput): Promise<ChannelMember> {
  try {
    // First verify that the user exists
    const userExists = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .execute();

    if (userExists.length === 0) {
      throw new Error('User not found');
    }

    // Verify that the channel exists
    const channelResult = await db.select({ id: channelsTable.id, type: channelsTable.type })
      .from(channelsTable)
      .where(eq(channelsTable.id, input.channel_id))
      .execute();

    if (channelResult.length === 0) {
      throw new Error('Channel not found');
    }

    const channel = channelResult[0];

    // Check if user is already a member of the channel
    const existingMembership = await db.select({ id: channelMembersTable.id })
      .from(channelMembersTable)
      .where(
        and(
          eq(channelMembersTable.channel_id, input.channel_id),
          eq(channelMembersTable.user_id, input.user_id)
        )
      )
      .execute();

    if (existingMembership.length > 0) {
      throw new Error('User is already a member of this channel');
    }

    // For private channels, only owners/admins can add members (this is a basic check)
    // In a real implementation, you might want to verify the requester's permissions
    // For now, we'll allow joining but note this limitation in comments

    // Insert the new channel membership
    const result = await db.insert(channelMembersTable)
      .values({
        channel_id: input.channel_id,
        user_id: input.user_id,
        role: input.role,
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Join channel failed:', error);
    throw error;
  }
}