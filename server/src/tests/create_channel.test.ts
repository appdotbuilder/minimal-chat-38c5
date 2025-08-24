import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { channelsTable, channelMembersTable, usersTable } from '../db/schema';
import { type CreateChannelInput } from '../schema';
import { createChannel } from '../handlers/create_channel';
import { eq, and } from 'drizzle-orm';

describe('createChannel', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create a test user
  const createTestUser = async () => {
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        display_name: 'Test User',
        provider: 'google',
        provider_id: 'test-provider-id'
      })
      .returning()
      .execute();
    
    return userResult[0];
  };

  it('should create a public channel', async () => {
    const user = await createTestUser();
    
    const testInput: CreateChannelInput = {
      name: 'General',
      description: 'General discussion channel',
      type: 'public',
      created_by: user.id
    };

    const result = await createChannel(testInput);

    // Verify channel fields
    expect(result.name).toEqual('General');
    expect(result.description).toEqual('General discussion channel');
    expect(result.type).toEqual('public');
    expect(result.created_by).toEqual(user.id);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create a private channel', async () => {
    const user = await createTestUser();
    
    const testInput: CreateChannelInput = {
      name: 'Secret Project',
      description: 'Private channel for secret discussions',
      type: 'private',
      created_by: user.id
    };

    const result = await createChannel(testInput);

    // Verify channel fields
    expect(result.name).toEqual('Secret Project');
    expect(result.description).toEqual('Private channel for secret discussions');
    expect(result.type).toEqual('private');
    expect(result.created_by).toEqual(user.id);
    expect(result.id).toBeDefined();
  });

  it('should create a channel without description', async () => {
    const user = await createTestUser();
    
    const testInput: CreateChannelInput = {
      name: 'No Description Channel',
      type: 'public',
      created_by: user.id
    };

    const result = await createChannel(testInput);

    // Verify channel fields
    expect(result.name).toEqual('No Description Channel');
    expect(result.description).toBeNull();
    expect(result.type).toEqual('public');
    expect(result.created_by).toEqual(user.id);
  });

  it('should save channel to database', async () => {
    const user = await createTestUser();
    
    const testInput: CreateChannelInput = {
      name: 'Database Test',
      description: 'Testing database persistence',
      type: 'public',
      created_by: user.id
    };

    const result = await createChannel(testInput);

    // Query the database to verify persistence
    const channels = await db.select()
      .from(channelsTable)
      .where(eq(channelsTable.id, result.id))
      .execute();

    expect(channels).toHaveLength(1);
    expect(channels[0].name).toEqual('Database Test');
    expect(channels[0].description).toEqual('Testing database persistence');
    expect(channels[0].type).toEqual('public');
    expect(channels[0].created_by).toEqual(user.id);
  });

  it('should automatically add creator as owner member', async () => {
    const user = await createTestUser();
    
    const testInput: CreateChannelInput = {
      name: 'Owner Test Channel',
      type: 'private',
      created_by: user.id
    };

    const result = await createChannel(testInput);

    // Verify the creator was added as an owner member
    const membership = await db.select()
      .from(channelMembersTable)
      .where(
        and(
          eq(channelMembersTable.channel_id, result.id),
          eq(channelMembersTable.user_id, user.id)
        )
      )
      .execute();

    expect(membership).toHaveLength(1);
    expect(membership[0].role).toEqual('owner');
    expect(membership[0].channel_id).toEqual(result.id);
    expect(membership[0].user_id).toEqual(user.id);
    expect(membership[0].joined_at).toBeInstanceOf(Date);
  });

  it('should handle channel name with special characters', async () => {
    const user = await createTestUser();
    
    const testInput: CreateChannelInput = {
      name: 'Channel-with_special.chars!',
      description: 'Testing special characters in channel name',
      type: 'public',
      created_by: user.id
    };

    const result = await createChannel(testInput);

    expect(result.name).toEqual('Channel-with_special.chars!');
    expect(result.description).toEqual('Testing special characters in channel name');
  });

  it('should throw error when creator user does not exist', async () => {
    const testInput: CreateChannelInput = {
      name: 'Invalid Creator Channel',
      type: 'public',
      created_by: '00000000-0000-0000-0000-000000000000' // Non-existent user ID
    };

    await expect(createChannel(testInput)).rejects.toThrow(/User with id .* not found/i);
  });

  it('should create multiple channels for the same user', async () => {
    const user = await createTestUser();
    
    const channel1Input: CreateChannelInput = {
      name: 'First Channel',
      type: 'public',
      created_by: user.id
    };

    const channel2Input: CreateChannelInput = {
      name: 'Second Channel',
      type: 'private',
      created_by: user.id
    };

    const result1 = await createChannel(channel1Input);
    const result2 = await createChannel(channel2Input);

    // Verify both channels were created
    expect(result1.name).toEqual('First Channel');
    expect(result2.name).toEqual('Second Channel');
    expect(result1.id).not.toEqual(result2.id);

    // Verify both memberships were created
    const memberships = await db.select()
      .from(channelMembersTable)
      .where(eq(channelMembersTable.user_id, user.id))
      .execute();

    expect(memberships).toHaveLength(2);
    expect(memberships.every(m => m.role === 'owner')).toBe(true);
  });

  it('should create channels with long descriptions', async () => {
    const user = await createTestUser();
    const longDescription = 'A'.repeat(500); // 500 character description
    
    const testInput: CreateChannelInput = {
      name: 'Long Description Channel',
      description: longDescription,
      type: 'public',
      created_by: user.id
    };

    const result = await createChannel(testInput);

    expect(result.description).toEqual(longDescription);
    expect(result.description?.length).toEqual(500);
  });
});