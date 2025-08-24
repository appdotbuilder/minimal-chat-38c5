import { z } from 'zod';

// User schema
export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  display_name: z.string(),
  avatar_url: z.string().nullable(),
  provider: z.enum(['google', 'github', 'discord']),
  provider_id: z.string(),
  status: z.enum(['online', 'away', 'busy', 'offline']).default('offline'),
  last_seen: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type User = z.infer<typeof userSchema>;

// Channel schema
export const channelSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  type: z.enum(['public', 'private']),
  created_by: z.string(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Channel = z.infer<typeof channelSchema>;

// Group schema (for group DMs)
export const groupSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  created_by: z.string(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Group = z.infer<typeof groupSchema>;

// Message schema
export const messageSchema = z.object({
  id: z.string(),
  content: z.string(),
  type: z.enum(['text', 'image', 'system']),
  author_id: z.string(),
  channel_id: z.string().nullable(),
  group_id: z.string().nullable(),
  recipient_id: z.string().nullable(), // For DMs
  image_url: z.string().nullable(),
  link_preview: z.object({
    url: z.string(),
    title: z.string().nullable(),
    description: z.string().nullable(),
    image: z.string().nullable(),
  }).nullable(),
  reply_to_id: z.string().nullable(),
  edited_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
});

export type Message = z.infer<typeof messageSchema>;

// Channel membership schema
export const channelMemberSchema = z.object({
  id: z.string(),
  channel_id: z.string(),
  user_id: z.string(),
  role: z.enum(['owner', 'admin', 'member']),
  joined_at: z.coerce.date(),
});

export type ChannelMember = z.infer<typeof channelMemberSchema>;

// Group membership schema
export const groupMemberSchema = z.object({
  id: z.string(),
  group_id: z.string(),
  user_id: z.string(),
  joined_at: z.coerce.date(),
});

export type GroupMember = z.infer<typeof groupMemberSchema>;

// Message read receipt schema
export const messageReadSchema = z.object({
  id: z.string(),
  message_id: z.string(),
  user_id: z.string(),
  read_at: z.coerce.date(),
});

export type MessageRead = z.infer<typeof messageReadSchema>;

// Typing indicator schema
export const typingIndicatorSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  channel_id: z.string().nullable(),
  group_id: z.string().nullable(),
  recipient_id: z.string().nullable(), // For DMs
  started_at: z.coerce.date(),
});

export type TypingIndicator = z.infer<typeof typingIndicatorSchema>;

// Input schemas for creating entities
export const createUserInputSchema = z.object({
  email: z.string().email(),
  display_name: z.string(),
  avatar_url: z.string().nullable().optional(),
  provider: z.enum(['google', 'github', 'discord']),
  provider_id: z.string(),
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const createChannelInputSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().nullable().optional(),
  type: z.enum(['public', 'private']),
  created_by: z.string(),
});

export type CreateChannelInput = z.infer<typeof createChannelInputSchema>;

export const createGroupInputSchema = z.object({
  name: z.string().nullable().optional(),
  created_by: z.string(),
  member_ids: z.array(z.string()).min(1), // Initial members
});

export type CreateGroupInput = z.infer<typeof createGroupInputSchema>;

export const sendMessageInputSchema = z.object({
  content: z.string().min(1),
  type: z.enum(['text', 'image', 'system']).default('text'),
  author_id: z.string(),
  channel_id: z.string().nullable().optional(),
  group_id: z.string().nullable().optional(),
  recipient_id: z.string().nullable().optional(), // For DMs
  image_url: z.string().nullable().optional(),
  reply_to_id: z.string().nullable().optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;

export const updateUserStatusInputSchema = z.object({
  user_id: z.string(),
  status: z.enum(['online', 'away', 'busy', 'offline']),
});

export type UpdateUserStatusInput = z.infer<typeof updateUserStatusInputSchema>;

export const joinChannelInputSchema = z.object({
  channel_id: z.string(),
  user_id: z.string(),
  role: z.enum(['owner', 'admin', 'member']).default('member'),
});

export type JoinChannelInput = z.infer<typeof joinChannelInputSchema>;

export const markMessageReadInputSchema = z.object({
  message_id: z.string(),
  user_id: z.string(),
});

export type MarkMessageReadInput = z.infer<typeof markMessageReadInputSchema>;

export const startTypingInputSchema = z.object({
  user_id: z.string(),
  channel_id: z.string().nullable().optional(),
  group_id: z.string().nullable().optional(),
  recipient_id: z.string().nullable().optional(), // For DMs
});

export type StartTypingInput = z.infer<typeof startTypingInputSchema>;

export const uploadImageInputSchema = z.object({
  file_data: z.string(), // base64 encoded file
  file_name: z.string(),
  content_type: z.string(),
  author_id: z.string(),
});

export type UploadImageInput = z.infer<typeof uploadImageInputSchema>;

// Response schemas
export const conversationSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['channel', 'group', 'direct']),
  participants: z.array(userSchema),
  last_message: messageSchema.nullable(),
  unread_count: z.number().int(),
});

export type Conversation = z.infer<typeof conversationSchema>;

export const messageWithAuthorSchema = messageSchema.extend({
  author: userSchema,
  read_by: z.array(userSchema),
  reply_to: messageSchema.nullable(),
});

export type MessageWithAuthor = z.infer<typeof messageWithAuthorSchema>;