import { text, pgTable, timestamp, pgEnum, uuid, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userStatusEnum = pgEnum('user_status', ['online', 'away', 'busy', 'offline']);
export const providerEnum = pgEnum('provider', ['google', 'github', 'discord']);
export const channelTypeEnum = pgEnum('channel_type', ['public', 'private']);
export const messageTypeEnum = pgEnum('message_type', ['text', 'image', 'system']);
export const memberRoleEnum = pgEnum('member_role', ['owner', 'admin', 'member']);

// Users table
export const usersTable = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  display_name: text('display_name').notNull(),
  avatar_url: text('avatar_url'),
  provider: providerEnum('provider').notNull(),
  provider_id: text('provider_id').notNull(),
  status: userStatusEnum('status').notNull().default('offline'),
  last_seen: timestamp('last_seen'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Channels table
export const channelsTable = pgTable('channels', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  type: channelTypeEnum('type').notNull(),
  created_by: uuid('created_by').notNull().references(() => usersTable.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Groups table (for group DMs)
export const groupsTable = pgTable('groups', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name'), // Nullable for unnamed group chats
  created_by: uuid('created_by').notNull().references(() => usersTable.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Messages table
export const messagesTable = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  content: text('content').notNull(),
  type: messageTypeEnum('type').notNull().default('text'),
  author_id: uuid('author_id').notNull().references(() => usersTable.id),
  channel_id: uuid('channel_id').references(() => channelsTable.id),
  group_id: uuid('group_id').references(() => groupsTable.id),
  recipient_id: uuid('recipient_id').references(() => usersTable.id), // For DMs
  image_url: text('image_url'),
  link_preview: jsonb('link_preview'), // JSON object for link previews
  reply_to_id: uuid('reply_to_id'),
  edited_at: timestamp('edited_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Channel members table
export const channelMembersTable = pgTable('channel_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  channel_id: uuid('channel_id').notNull().references(() => channelsTable.id),
  user_id: uuid('user_id').notNull().references(() => usersTable.id),
  role: memberRoleEnum('role').notNull().default('member'),
  joined_at: timestamp('joined_at').defaultNow().notNull(),
});

// Group members table
export const groupMembersTable = pgTable('group_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  group_id: uuid('group_id').notNull().references(() => groupsTable.id),
  user_id: uuid('user_id').notNull().references(() => usersTable.id),
  joined_at: timestamp('joined_at').defaultNow().notNull(),
});

// Message read receipts table
export const messageReadsTable = pgTable('message_reads', {
  id: uuid('id').defaultRandom().primaryKey(),
  message_id: uuid('message_id').notNull().references(() => messagesTable.id),
  user_id: uuid('user_id').notNull().references(() => usersTable.id),
  read_at: timestamp('read_at').defaultNow().notNull(),
});

// Typing indicators table
export const typingIndicatorsTable = pgTable('typing_indicators', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: uuid('user_id').notNull().references(() => usersTable.id),
  channel_id: uuid('channel_id').references(() => channelsTable.id),
  group_id: uuid('group_id').references(() => groupsTable.id),
  recipient_id: uuid('recipient_id').references(() => usersTable.id), // For DMs
  started_at: timestamp('started_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  authoredMessages: many(messagesTable, { relationName: 'authoredMessages' }),
  receivedMessages: many(messagesTable, { relationName: 'receivedMessages' }),
  channelMemberships: many(channelMembersTable),
  groupMemberships: many(groupMembersTable),
  messageReads: many(messageReadsTable),
  typingIndicators: many(typingIndicatorsTable),
  createdChannels: many(channelsTable),
  createdGroups: many(groupsTable),
}));

export const channelsRelations = relations(channelsTable, ({ one, many }) => ({
  creator: one(usersTable, {
    fields: [channelsTable.created_by],
    references: [usersTable.id],
  }),
  members: many(channelMembersTable),
  messages: many(messagesTable),
}));

export const groupsRelations = relations(groupsTable, ({ one, many }) => ({
  creator: one(usersTable, {
    fields: [groupsTable.created_by],
    references: [usersTable.id],
  }),
  members: many(groupMembersTable),
  messages: many(messagesTable),
}));

export const messagesRelations = relations(messagesTable, ({ one, many }) => ({
  author: one(usersTable, {
    fields: [messagesTable.author_id],
    references: [usersTable.id],
    relationName: 'authoredMessages',
  }),
  recipient: one(usersTable, {
    fields: [messagesTable.recipient_id],
    references: [usersTable.id],
    relationName: 'receivedMessages',
  }),
  channel: one(channelsTable, {
    fields: [messagesTable.channel_id],
    references: [channelsTable.id],
  }),
  group: one(groupsTable, {
    fields: [messagesTable.group_id],
    references: [groupsTable.id],
  }),
  replyTo: one(messagesTable, {
    fields: [messagesTable.reply_to_id],
    references: [messagesTable.id],
    relationName: 'messageReplies',
  }),
  replies: many(messagesTable, { relationName: 'messageReplies' }),
  reads: many(messageReadsTable),
}));

export const channelMembersRelations = relations(channelMembersTable, ({ one }) => ({
  channel: one(channelsTable, {
    fields: [channelMembersTable.channel_id],
    references: [channelsTable.id],
  }),
  user: one(usersTable, {
    fields: [channelMembersTable.user_id],
    references: [usersTable.id],
  }),
}));

export const groupMembersRelations = relations(groupMembersTable, ({ one }) => ({
  group: one(groupsTable, {
    fields: [groupMembersTable.group_id],
    references: [groupsTable.id],
  }),
  user: one(usersTable, {
    fields: [groupMembersTable.user_id],
    references: [usersTable.id],
  }),
}));

export const messageReadsRelations = relations(messageReadsTable, ({ one }) => ({
  message: one(messagesTable, {
    fields: [messageReadsTable.message_id],
    references: [messagesTable.id],
  }),
  user: one(usersTable, {
    fields: [messageReadsTable.user_id],
    references: [usersTable.id],
  }),
}));

export const typingIndicatorsRelations = relations(typingIndicatorsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [typingIndicatorsTable.user_id],
    references: [usersTable.id],
  }),
  channel: one(channelsTable, {
    fields: [typingIndicatorsTable.channel_id],
    references: [channelsTable.id],
  }),
  group: one(groupsTable, {
    fields: [typingIndicatorsTable.group_id],
    references: [groupsTable.id],
  }),
  recipient: one(usersTable, {
    fields: [typingIndicatorsTable.recipient_id],
    references: [usersTable.id],
  }),
}));

// Export all tables for relation queries
export const tables = {
  users: usersTable,
  channels: channelsTable,
  groups: groupsTable,
  messages: messagesTable,
  channelMembers: channelMembersTable,
  groupMembers: groupMembersTable,
  messageReads: messageReadsTable,
  typingIndicators: typingIndicatorsTable,
};