import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  channelsTable, 
  groupsTable, 
  typingIndicatorsTable 
} from '../db/schema';
import { type StartTypingInput } from '../schema';
import { stopTyping } from '../handlers/stop_typing';
import { eq, and, isNull } from 'drizzle-orm';

// Test data
const testUser = {
  email: 'user@example.com',
  display_name: 'Test User',
  provider: 'google' as const,
  provider_id: 'google123'
};

const testChannel = {
  name: 'general',
  description: 'General chat',
  type: 'public' as const,
  created_by: '' // Will be set after user creation
};

const testGroup = {
  name: 'Test Group',
  created_by: '' // Will be set after user creation
};

describe('stopTyping', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let userId: string;
  let channelId: string;
  let groupId: string;
  let recipientId: string;

  beforeEach(async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    userId = userResult[0].id;

    // Create recipient user
    const recipientResult = await db.insert(usersTable)
      .values({
        email: 'recipient@example.com',
        display_name: 'Recipient User',
        provider: 'google' as const,
        provider_id: 'google456'
      })
      .returning()
      .execute();
    recipientId = recipientResult[0].id;

    // Create test channel
    const channelResult = await db.insert(channelsTable)
      .values({
        ...testChannel,
        created_by: userId
      })
      .returning()
      .execute();
    channelId = channelResult[0].id;

    // Create test group
    const groupResult = await db.insert(groupsTable)
      .values({
        ...testGroup,
        created_by: userId
      })
      .returning()
      .execute();
    groupId = groupResult[0].id;
  });

  it('should remove typing indicator for channel', async () => {
    // Create typing indicator for channel
    await db.insert(typingIndicatorsTable)
      .values({
        user_id: userId,
        channel_id: channelId
      })
      .execute();

    // Verify indicator exists
    const beforeIndicators = await db.select()
      .from(typingIndicatorsTable)
      .where(eq(typingIndicatorsTable.user_id, userId))
      .execute();
    expect(beforeIndicators).toHaveLength(1);

    const input: StartTypingInput = {
      user_id: userId,
      channel_id: channelId
    };

    await stopTyping(input);

    // Verify indicator is removed
    const afterIndicators = await db.select()
      .from(typingIndicatorsTable)
      .where(eq(typingIndicatorsTable.user_id, userId))
      .execute();
    expect(afterIndicators).toHaveLength(0);
  });

  it('should remove typing indicator for group', async () => {
    // Create typing indicator for group
    await db.insert(typingIndicatorsTable)
      .values({
        user_id: userId,
        group_id: groupId
      })
      .execute();

    // Verify indicator exists
    const beforeIndicators = await db.select()
      .from(typingIndicatorsTable)
      .where(eq(typingIndicatorsTable.user_id, userId))
      .execute();
    expect(beforeIndicators).toHaveLength(1);

    const input: StartTypingInput = {
      user_id: userId,
      group_id: groupId
    };

    await stopTyping(input);

    // Verify indicator is removed
    const afterIndicators = await db.select()
      .from(typingIndicatorsTable)
      .where(eq(typingIndicatorsTable.user_id, userId))
      .execute();
    expect(afterIndicators).toHaveLength(0);
  });

  it('should remove typing indicator for direct message', async () => {
    // Create typing indicator for DM
    await db.insert(typingIndicatorsTable)
      .values({
        user_id: userId,
        recipient_id: recipientId
      })
      .execute();

    // Verify indicator exists
    const beforeIndicators = await db.select()
      .from(typingIndicatorsTable)
      .where(eq(typingIndicatorsTable.user_id, userId))
      .execute();
    expect(beforeIndicators).toHaveLength(1);

    const input: StartTypingInput = {
      user_id: userId,
      recipient_id: recipientId
    };

    await stopTyping(input);

    // Verify indicator is removed
    const afterIndicators = await db.select()
      .from(typingIndicatorsTable)
      .where(eq(typingIndicatorsTable.user_id, userId))
      .execute();
    expect(afterIndicators).toHaveLength(0);
  });

  it('should only remove typing indicator for specific context', async () => {
    // Create typing indicators for different contexts
    await db.insert(typingIndicatorsTable)
      .values([
        {
          user_id: userId,
          channel_id: channelId
        },
        {
          user_id: userId,
          group_id: groupId
        },
        {
          user_id: userId,
          recipient_id: recipientId
        }
      ])
      .execute();

    // Verify all indicators exist
    const beforeIndicators = await db.select()
      .from(typingIndicatorsTable)
      .where(eq(typingIndicatorsTable.user_id, userId))
      .execute();
    expect(beforeIndicators).toHaveLength(3);

    // Stop typing in channel only
    const input: StartTypingInput = {
      user_id: userId,
      channel_id: channelId
    };

    await stopTyping(input);

    // Verify only channel indicator is removed
    const afterIndicators = await db.select()
      .from(typingIndicatorsTable)
      .where(eq(typingIndicatorsTable.user_id, userId))
      .execute();
    expect(afterIndicators).toHaveLength(2);

    // Verify the remaining indicators are for group and DM
    const remainingContexts = afterIndicators.map(indicator => ({
      hasGroup: !!indicator.group_id,
      hasRecipient: !!indicator.recipient_id
    }));

    expect(remainingContexts.some(ctx => ctx.hasGroup)).toBe(true);
    expect(remainingContexts.some(ctx => ctx.hasRecipient)).toBe(true);
  });

  it('should not affect other users typing indicators', async () => {
    // Create typing indicators for both users in same channel
    await db.insert(typingIndicatorsTable)
      .values([
        {
          user_id: userId,
          channel_id: channelId
        },
        {
          user_id: recipientId,
          channel_id: channelId
        }
      ])
      .execute();

    // Verify both indicators exist
    const beforeIndicators = await db.select()
      .from(typingIndicatorsTable)
      .execute();
    expect(beforeIndicators).toHaveLength(2);

    const input: StartTypingInput = {
      user_id: userId,
      channel_id: channelId
    };

    await stopTyping(input);

    // Verify only the specific user's indicator is removed
    const afterIndicators = await db.select()
      .from(typingIndicatorsTable)
      .execute();
    expect(afterIndicators).toHaveLength(1);
    expect(afterIndicators[0].user_id).toBe(recipientId);
  });

  it('should handle non-existent typing indicator gracefully', async () => {
    // Try to stop typing when no indicator exists
    const input: StartTypingInput = {
      user_id: userId,
      channel_id: channelId
    };

    // Should not throw an error
    await expect(stopTyping(input)).resolves.toBeUndefined();

    // Verify no indicators exist
    const indicators = await db.select()
      .from(typingIndicatorsTable)
      .where(eq(typingIndicatorsTable.user_id, userId))
      .execute();
    expect(indicators).toHaveLength(0);
  });

  it('should handle clearing all typing indicators when no context provided', async () => {
    // Create typing indicators for multiple contexts
    await db.insert(typingIndicatorsTable)
      .values([
        {
          user_id: userId,
          channel_id: channelId
        },
        {
          user_id: userId,
          group_id: groupId
        }
      ])
      .execute();

    // Verify indicators exist
    const beforeIndicators = await db.select()
      .from(typingIndicatorsTable)
      .where(eq(typingIndicatorsTable.user_id, userId))
      .execute();
    expect(beforeIndicators).toHaveLength(2);

    // Stop typing without specific context
    const input: StartTypingInput = {
      user_id: userId
    };

    await stopTyping(input);

    // Verify all user's typing indicators are removed
    const afterIndicators = await db.select()
      .from(typingIndicatorsTable)
      .where(eq(typingIndicatorsTable.user_id, userId))
      .execute();
    expect(afterIndicators).toHaveLength(0);
  });

  it('should handle invalid user_id gracefully', async () => {
    const input: StartTypingInput = {
      user_id: '550e8400-e29b-41d4-a716-446655440000' // Valid UUID format but non-existent
    };

    // Should not throw an error even with non-existent user_id
    await expect(stopTyping(input)).resolves.toBeUndefined();
  });

  it('should verify specific context matching with proper null checks', async () => {
    // Create typing indicators with different null patterns
    await db.insert(typingIndicatorsTable)
      .values([
        {
          user_id: userId,
          channel_id: channelId
          // group_id and recipient_id will be null
        },
        {
          user_id: userId,
          group_id: groupId
          // channel_id and recipient_id will be null
        }
      ])
      .execute();

    // Stop typing in channel - should only remove channel indicator
    const input: StartTypingInput = {
      user_id: userId,
      channel_id: channelId
    };

    await stopTyping(input);

    // Verify only the channel indicator was removed
    const remainingIndicators = await db.select()
      .from(typingIndicatorsTable)
      .where(
        and(
          eq(typingIndicatorsTable.user_id, userId),
          eq(typingIndicatorsTable.group_id, groupId),
          isNull(typingIndicatorsTable.channel_id),
          isNull(typingIndicatorsTable.recipient_id)
        )
      )
      .execute();

    expect(remainingIndicators).toHaveLength(1);
    expect(remainingIndicators[0].group_id).toBe(groupId);
  });
});