import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { ModelCapabilities } from '../../shared-contracts/schemas/model.schema';
import { ModelSource } from './model-source';

export const models = sqliteTable('models', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  family: text('family').notNull(),
  displayName: text('display_name').notNull(),
  capabilities: text('capabilities', { mode: 'json' }).$type<ModelCapabilities>().notNull(),
  pricing: text('pricing', { mode: 'json' }).$type<{ prompt: number; completion: number }>(),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
  source: text('source', { enum: ModelSource.options }).notNull().default(ModelSource.enum.builtin),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  systemPrompt: text('system_prompt'),
  memory: text('memory'),
  memorySummary: text('memory_summary'),
  defaultModelId: text('default_model_id'),
  icon: text('icon'),
  palette: text('palette'),
  iconColor: text('icon_color'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  modelId: text('model_id'),
  composer: text('composer', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  lastMessageAt: integer('last_message_at', { mode: 'timestamp_ms' }).notNull(),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  chatId: text('chat_id')
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  modelId: text('model_id'),
  parts: text('parts', { mode: 'json' }).notNull(),
  usage: text('usage', { mode: 'json' }),
  stopReason: text('stop_reason'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  chatId: text('chat_id')
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['image', 'file'] }).notNull(),
  mediaType: text('media_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  sha256: text('sha256').notNull(),
  relPath: text('rel_path').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
});

export const memorySlices = sqliteTable('memory_slices', {
  id: text('id').primaryKey(),
  scope: text('scope', { enum: ['global', 'project'] }).notNull(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  source: text('source', { enum: ['user', 'model'] })
    .notNull()
    .default('user'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const projectFiles = sqliteTable('project_files', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  mediaType: text('media_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  sha256: text('sha256').notNull(),
  relPath: text('rel_path').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const compactionSnapshots = sqliteTable('compaction_snapshots', {
  id: text('id').primaryKey(),
  chatId: text('chat_id')
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  coveredThroughAt: integer('covered_through_at', { mode: 'timestamp_ms' }).notNull(),
  coveredThroughMessageId: text('covered_through_message_id').notNull(),
  // Display-only: the divider renders after this message (the chat tail at
  // compaction time) so it sits at the bottom, while covered_through_*
  // drives what the model actually summarizes. Nullable for pre-existing rows.
  displayThroughAt: integer('display_through_at', { mode: 'timestamp_ms' }),
  summaryText: text('summary_text').notNull(),
  tokensSaved: integer('tokens_saved'),
});
