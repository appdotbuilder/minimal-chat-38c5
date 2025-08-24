import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, channelsTable, channelMembersTable } from '../db/schema';
import { getUserChannels } from '../handlers/get_user_channels';

describe('getUserChannels', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when user has no channels', async () => {
    // Create a user without any channel memberships
    const [user] = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        display_name: 'Test User',
        provider: 'google',
        provider_id: 'google123',
      })
      .returning()
      .execute();

    const result = await getUserChannels(user.id);

    expect(result).toEqual([]);
  });

  it('should return channels the user is a member of', async () => {
    // Create users
    const [owner, member] = await db.insert(usersTable)
      .values([
        {
          email: 'owner@example.com',
          display_name: 'Channel Owner',
          provider: 'google',
          provider_id: 'google123',
        },
        {
          email: 'member@example.com',
          display_name: 'Channel Member',
          provider: 'github',
          provider_id: 'github456',
        }
      ])
      .returning()
      .execute();

    // Create channels
    const [publicChannel, privateChannel] = await db.insert(channelsTable)
      .values([
        {
          name: 'General',
          description: 'General discussion',
          type: 'public',
          created_by: owner.id,
        },
        {
          name: 'Private Team',
          description: 'Private team channel',
          type: 'private',
          created_by: owner.id,
        }
      ])
      .returning()
      .execute();

    // Add member to both channels
    await db.insert(channelMembersTable)
      .values([
        {
          channel_id: publicChannel.id,
          user_id: member.id,
          role: 'member',
        },
        {
          channel_id: privateChannel.id,
          user_id: member.id,
          role: 'member',
        }
      ])
      .execute();

    const result = await getUserChannels(member.id);

    expect(result).toHaveLength(2);
    
    const channelNames = result.map(c => c.name).sort();
    expect(channelNames).toEqual(['General', 'Private Team']);

    // Verify all fields are present and correct
    const generalChannel = result.find(c => c.name === 'General');
    expect(generalChannel).toBeDefined();
    expect(generalChannel!.description).toBe('General discussion');
    expect(generalChannel!.type).toBe('public');
    expect(generalChannel!.created_by).toBe(owner.id);
    expect(generalChannel!.id).toBe(publicChannel.id);
    expect(generalChannel!.created_at).toBeInstanceOf(Date);
    expect(generalChannel!.updated_at).toBeInstanceOf(Date);
  });

  it('should only return channels where user is a member', async () => {
    // Create users
    const [owner, member1, member2] = await db.insert(usersTable)
      .values([
        {
          email: 'owner@example.com',
          display_name: 'Owner',
          provider: 'google',
          provider_id: 'google123',
        },
        {
          email: 'member1@example.com',
          display_name: 'Member 1',
          provider: 'github',
          provider_id: 'github456',
        },
        {
          email: 'member2@example.com',
          display_name: 'Member 2',
          provider: 'discord',
          provider_id: 'discord789',
        }
      ])
      .returning()
      .execute();

    // Create channels
    const [channel1, channel2, channel3] = await db.insert(channelsTable)
      .values([
        {
          name: 'Channel 1',
          type: 'public',
          created_by: owner.id,
        },
        {
          name: 'Channel 2',
          type: 'private',
          created_by: owner.id,
        },
        {
          name: 'Channel 3',
          type: 'public',
          created_by: owner.id,
        }
      ])
      .returning()
      .execute();

    // Add member1 to channels 1 and 2, member2 to channel 3 only
    await db.insert(channelMembersTable)
      .values([
        {
          channel_id: channel1.id,
          user_id: member1.id,
          role: 'member',
        },
        {
          channel_id: channel2.id,
          user_id: member1.id,
          role: 'admin',
        },
        {
          channel_id: channel3.id,
          user_id: member2.id,
          role: 'member',
        }
      ])
      .execute();

    // Member1 should only see channels 1 and 2
    const member1Channels = await getUserChannels(member1.id);
    expect(member1Channels).toHaveLength(2);
    
    const member1ChannelNames = member1Channels.map(c => c.name).sort();
    expect(member1ChannelNames).toEqual(['Channel 1', 'Channel 2']);

    // Member2 should only see channel 3
    const member2Channels = await getUserChannels(member2.id);
    expect(member2Channels).toHaveLength(1);
    expect(member2Channels[0].name).toBe('Channel 3');
  });

  it('should handle user with different membership roles', async () => {
    // Create users
    const [owner, member] = await db.insert(usersTable)
      .values([
        {
          email: 'owner@example.com',
          display_name: 'Owner',
          provider: 'google',
          provider_id: 'google123',
        },
        {
          email: 'member@example.com',
          display_name: 'Member',
          provider: 'github',
          provider_id: 'github456',
        }
      ])
      .returning()
      .execute();

    // Create channels
    const [ownerChannel, adminChannel, memberChannel] = await db.insert(channelsTable)
      .values([
        {
          name: 'Owner Channel',
          type: 'private',
          created_by: owner.id,
        },
        {
          name: 'Admin Channel',
          type: 'public',
          created_by: owner.id,
        },
        {
          name: 'Member Channel',
          type: 'public',
          created_by: owner.id,
        }
      ])
      .returning()
      .execute();

    // Add member with different roles
    await db.insert(channelMembersTable)
      .values([
        {
          channel_id: ownerChannel.id,
          user_id: member.id,
          role: 'owner',
        },
        {
          channel_id: adminChannel.id,
          user_id: member.id,
          role: 'admin',
        },
        {
          channel_id: memberChannel.id,
          user_id: member.id,
          role: 'member',
        }
      ])
      .execute();

    const result = await getUserChannels(member.id);

    expect(result).toHaveLength(3);
    
    // Should return all channels regardless of role
    const channelNames = result.map(c => c.name).sort();
    expect(channelNames).toEqual(['Admin Channel', 'Member Channel', 'Owner Channel']);
  });

  it('should handle non-existent user gracefully', async () => {
    // Use a valid UUID format that doesn't exist in the database
    const result = await getUserChannels('550e8400-e29b-41d4-a716-446655440000');

    expect(result).toEqual([]);
  });
});