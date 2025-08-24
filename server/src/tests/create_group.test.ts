import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, groupsTable, groupMembersTable } from '../db/schema';
import { type CreateGroupInput } from '../schema';
import { createGroup } from '../handlers/create_group';
import { eq } from 'drizzle-orm';

// Test users data
const testUsers = [
  {
    email: 'creator@test.com',
    display_name: 'Creator User',
    provider: 'google' as const,
    provider_id: 'creator123',
  },
  {
    email: 'member1@test.com',
    display_name: 'Member One',
    provider: 'github' as const,
    provider_id: 'member1123',
  },
  {
    email: 'member2@test.com',
    display_name: 'Member Two',
    provider: 'discord' as const,
    provider_id: 'member2123',
  },
];

describe('createGroup', () => {
  let userIds: string[] = [];

  beforeEach(async () => {
    await createDB();
    
    // Create test users
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();
    
    userIds = users.map(user => user.id);
  });

  afterEach(resetDB);

  it('should create a group with name and add all members', async () => {
    const input: CreateGroupInput = {
      name: 'Test Group Chat',
      created_by: userIds[0],
      member_ids: [userIds[1], userIds[2]],
    };

    const result = await createGroup(input);

    // Basic field validation
    expect(result.name).toEqual('Test Group Chat');
    expect(result.created_by).toEqual(userIds[0]);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create a group without name (unnamed group chat)', async () => {
    const input: CreateGroupInput = {
      name: null,
      created_by: userIds[0],
      member_ids: [userIds[1]],
    };

    const result = await createGroup(input);

    expect(result.name).toBeNull();
    expect(result.created_by).toEqual(userIds[0]);
    expect(result.id).toBeDefined();
  });

  it('should save group to database', async () => {
    const input: CreateGroupInput = {
      name: 'Persistent Group',
      created_by: userIds[0],
      member_ids: [userIds[1], userIds[2]],
    };

    const result = await createGroup(input);

    // Verify group was saved
    const groups = await db.select()
      .from(groupsTable)
      .where(eq(groupsTable.id, result.id))
      .execute();

    expect(groups).toHaveLength(1);
    expect(groups[0].name).toEqual('Persistent Group');
    expect(groups[0].created_by).toEqual(userIds[0]);
  });

  it('should add all members including creator to group membership', async () => {
    const input: CreateGroupInput = {
      name: 'Full Membership Test',
      created_by: userIds[0],
      member_ids: [userIds[1], userIds[2]],
    };

    const result = await createGroup(input);

    // Check all memberships were created
    const memberships = await db.select()
      .from(groupMembersTable)
      .where(eq(groupMembersTable.group_id, result.id))
      .execute();

    expect(memberships).toHaveLength(3); // Creator + 2 members
    
    const memberUserIds = memberships.map(m => m.user_id).sort();
    const expectedUserIds = [userIds[0], userIds[1], userIds[2]].sort();
    expect(memberUserIds).toEqual(expectedUserIds);

    // Verify all memberships have correct group_id and joined_at
    memberships.forEach(membership => {
      expect(membership.group_id).toEqual(result.id);
      expect(membership.joined_at).toBeInstanceOf(Date);
    });
  });

  it('should handle duplicate member IDs (creator in member list)', async () => {
    const input: CreateGroupInput = {
      name: 'Duplicate Test',
      created_by: userIds[0],
      member_ids: [userIds[0], userIds[1]], // Creator included in member list
    };

    const result = await createGroup(input);

    // Should still only create one membership for the creator
    const memberships = await db.select()
      .from(groupMembersTable)
      .where(eq(groupMembersTable.group_id, result.id))
      .execute();

    expect(memberships).toHaveLength(2); // Creator (once) + member1
    
    const memberUserIds = memberships.map(m => m.user_id).sort();
    const expectedUserIds = [userIds[0], userIds[1]].sort();
    expect(memberUserIds).toEqual(expectedUserIds);
  });

  it('should handle single member group (creator + one member)', async () => {
    const input: CreateGroupInput = {
      name: 'Two Person Chat',
      created_by: userIds[0],
      member_ids: [userIds[1]],
    };

    const result = await createGroup(input);

    const memberships = await db.select()
      .from(groupMembersTable)
      .where(eq(groupMembersTable.group_id, result.id))
      .execute();

    expect(memberships).toHaveLength(2); // Creator + 1 member
  });

  it('should throw error when creator user does not exist', async () => {
    const input: CreateGroupInput = {
      name: 'Invalid Creator',
      created_by: '00000000-0000-0000-0000-000000000000', // Non-existent user
      member_ids: [userIds[1]],
    };

    await expect(createGroup(input)).rejects.toThrow(/Users not found/);
  });

  it('should throw error when member user does not exist', async () => {
    const input: CreateGroupInput = {
      name: 'Invalid Member',
      created_by: userIds[0],
      member_ids: [userIds[1], '00000000-0000-0000-0000-000000000000'], // One valid, one invalid
    };

    await expect(createGroup(input)).rejects.toThrow(/Users not found/);
  });

  it('should throw error when multiple users do not exist', async () => {
    const input: CreateGroupInput = {
      name: 'Multiple Invalid',
      created_by: '11111111-1111-1111-1111-111111111111',
      member_ids: ['22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333'],
    };

    await expect(createGroup(input)).rejects.toThrow(/Users not found/);
  });
});