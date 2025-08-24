import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import {
  createUserInputSchema,
  createChannelInputSchema,
  createGroupInputSchema,
  sendMessageInputSchema,
  updateUserStatusInputSchema,
  joinChannelInputSchema,
  markMessageReadInputSchema,
  startTypingInputSchema,
  uploadImageInputSchema,
} from './schema';

// Import handlers
import { createUser } from './handlers/create_user';
import { getUserById } from './handlers/get_user_by_id';
import { updateUserStatus } from './handlers/update_user_status';
import { createChannel } from './handlers/create_channel';
import { getUserChannels } from './handlers/get_user_channels';
import { joinChannel } from './handlers/join_channel';
import { createGroup } from './handlers/create_group';
import { getUserConversations } from './handlers/get_user_conversations';
import { sendMessage } from './handlers/send_message';
import { getMessages } from './handlers/get_messages';
import { markMessageRead } from './handlers/mark_message_read';
import { startTyping } from './handlers/start_typing';
import { stopTyping } from './handlers/stop_typing';
import { getTypingIndicators } from './handlers/get_typing_indicators';
import { uploadImage } from './handlers/upload_image';
import { generateLinkPreview } from './handlers/generate_link_preview';
import { searchMessages } from './handlers/search_messages';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // User management
  createUser: publicProcedure
    .input(createUserInputSchema)
    .mutation(({ input }) => createUser(input)),

  getUserById: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(({ input }) => getUserById(input.userId)),

  updateUserStatus: publicProcedure
    .input(updateUserStatusInputSchema)
    .mutation(({ input }) => updateUserStatus(input)),

  // Channel management
  createChannel: publicProcedure
    .input(createChannelInputSchema)
    .mutation(({ input }) => createChannel(input)),

  getUserChannels: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(({ input }) => getUserChannels(input.userId)),

  joinChannel: publicProcedure
    .input(joinChannelInputSchema)
    .mutation(({ input }) => joinChannel(input)),

  // Group management
  createGroup: publicProcedure
    .input(createGroupInputSchema)
    .mutation(({ input }) => createGroup(input)),

  // Conversations
  getUserConversations: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(({ input }) => getUserConversations(input.userId)),

  // Message management
  sendMessage: publicProcedure
    .input(sendMessageInputSchema)
    .mutation(({ input }) => sendMessage(input)),

  getMessages: publicProcedure
    .input(z.object({
      channelId: z.string().optional(),
      groupId: z.string().optional(),
      recipientId: z.string().optional(),
      authorId: z.string().optional(),
      limit: z.number().int().positive().max(100).default(50),
      offset: z.number().int().nonnegative().default(0),
    }))
    .query(({ input }) => getMessages(
      input.channelId,
      input.groupId,
      input.recipientId,
      input.authorId,
      input.limit,
      input.offset
    )),

  searchMessages: publicProcedure
    .input(z.object({
      query: z.string().min(1),
      userId: z.string(),
      channelId: z.string().optional(),
      groupId: z.string().optional(),
      limit: z.number().int().positive().max(50).default(20),
    }))
    .query(({ input }) => searchMessages(
      input.query,
      input.userId,
      input.channelId,
      input.groupId,
      input.limit
    )),

  // Read receipts
  markMessageRead: publicProcedure
    .input(markMessageReadInputSchema)
    .mutation(({ input }) => markMessageRead(input)),

  // Typing indicators
  startTyping: publicProcedure
    .input(startTypingInputSchema)
    .mutation(({ input }) => startTyping(input)),

  stopTyping: publicProcedure
    .input(startTypingInputSchema)
    .mutation(({ input }) => stopTyping(input)),

  getTypingIndicators: publicProcedure
    .input(z.object({
      channelId: z.string().optional(),
      groupId: z.string().optional(),
      recipientId: z.string().optional(),
    }))
    .query(({ input }) => getTypingIndicators(
      input.channelId,
      input.groupId,
      input.recipientId
    )),

  // File upload
  uploadImage: publicProcedure
    .input(uploadImageInputSchema)
    .mutation(({ input }) => uploadImage(input)),

  // Link previews
  generateLinkPreview: publicProcedure
    .input(z.object({ url: z.string().url() }))
    .query(({ input }) => generateLinkPreview(input.url)),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC Chat server listening at port: ${port}`);
}

start();