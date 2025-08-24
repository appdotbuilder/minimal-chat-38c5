import { db } from '../db';
import { groupsTable, groupMembersTable, usersTable } from '../db/schema';
import { type CreateGroupInput, type Group } from '../schema';
import { eq, inArray } from 'drizzle-orm';

export async function createGroup(input: CreateGroupInput): Promise<Group> {
  try {
    // First, verify all member IDs exist in the users table
    const allMemberIds = [...new Set([...input.member_ids, input.created_by])]; // Include creator and deduplicate
    
    const existingUsers = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(inArray(usersTable.id, allMemberIds))
      .execute();

    const existingUserIds = existingUsers.map(user => user.id);
    const missingUserIds = allMemberIds.filter(id => !existingUserIds.includes(id));

    if (missingUserIds.length > 0) {
      throw new Error(`Users not found: ${missingUserIds.join(', ')}`);
    }

    // Create the group
    const groupResult = await db.insert(groupsTable)
      .values({
        name: input.name || null,
        created_by: input.created_by,
      })
      .returning()
      .execute();

    const group = groupResult[0];

    // Add all members to the group (including creator)
    const membershipValues = allMemberIds.map(memberId => ({
      group_id: group.id,
      user_id: memberId,
    }));

    await db.insert(groupMembersTable)
      .values(membershipValues)
      .execute();

    return group;
  } catch (error) {
    console.error('Group creation failed:', error);
    throw error;
  }
}