import Dexie, { Table } from 'dexie';

class AthenaDatabase extends Dexie {
  topics!: Table<Topic, string>;
  messages!: Table<Message, string>;
  predefinedPrompts!: Table<PredefinedPrompt, string>;
  userSettings!: Table<UserSetting, string>;

  constructor() {
    super('AthenaDatabase');

    this.version(1).stores({
      topics: 'id, userId, name, createdOn, updatedOn, isDeleted',
      messages: 'id, topicId, type, created, isDeleted, includeInContext',
      usages: 'id, messageId',
    });

    this.version(2)
      .stores({
        topics: 'id, userId, name, createdOn, updatedOn, isDeleted, activeForkId',
        messages: 'id, topicId, forkId, type, created, isDeleted, includeInContext',
      })
      .upgrade(async (trans) => {
        try {
        const DEFAULT_FORK_ID = 'main';

        // Migrate topics
        await trans
          .table('topics')
          .toCollection()
          .modify((topic: Topic) => {
            if (!topic.forks) {
              topic.forks = [
                {
                  id: DEFAULT_FORK_ID,
                  name: 'Main',
                  createdOn: topic.createdOn,
                },
              ];
              topic.activeForkId = DEFAULT_FORK_ID;
            }
          });

        // Migrate messages
        await trans
          .table('messages')
          .toCollection()
          .modify((message: Message) => {
            if (!message.forkId) {
              message.forkId = DEFAULT_FORK_ID;
            }
          });
        } catch (err) {
          console.error('AthenaDb v2 migration failed', err);
        }
      });

    // Version 3 was never shipped; this stub ensures a clean upgrade path
    // for any database that somehow landed on schema version 3.
    this.version(3).stores({
      topics: 'id, userId, name, createdOn, updatedOn, isDeleted, activeForkId',
      messages: 'id, topicId, forkId, type, created, isDeleted, includeInContext',
    });

    this.version(4).stores({
      topics: 'id, userId, name, createdOn, updatedOn, isDeleted, activeForkId, maxContextMessages',
      messages: 'id, topicId, forkId, type, created, isDeleted, includeInContext, parentMessageId',
    });

    this.version(5)
      .stores({
        messages: 'id, topicId, forkId, type, created, isDeleted, includeInContext, parentMessageId',
      })
      .upgrade(async (trans) => {
        try {
        const allMessages = (await trans.table('messages').toArray()) as Message[];

        // Sort by topic and created time
        const sorted = allMessages.sort((a, b) => {
          if (a.topicId !== b.topicId) return a.topicId.localeCompare(b.topicId);
          return new Date(a.created).getTime() - new Date(b.created).getTime();
        });

        const updates: { id: string; parentMessageId: string }[] = [];
        const lastUserMessageByTopic = new Map<string, string>();

        for (const m of sorted) {
          if (m.type === 'user') {
            lastUserMessageByTopic.set(m.topicId, m.id);
          } else if (m.type === 'assistant' && !m.parentMessageId) {
            const parentId = lastUserMessageByTopic.get(m.topicId);
            if (parentId) {
              updates.push({ id: m.id, parentMessageId: parentId });
            }
          }
        }

        for (const update of updates) {
          await trans.table('messages').update(update.id, { parentMessageId: update.parentMessageId });
        }
        } catch (err) {
          console.error('AthenaDb v5 migration failed', err);
        }
      });

    this.version(6).stores({
      topics: 'id, userId, name, createdOn, updatedOn, isDeleted, activeForkId, maxContextMessages',
      messages: 'id, topicId, forkId, type, created, isDeleted, includeInContext, parentMessageId',
      predefinedPrompts: 'id, name',
      userSettings: 'id',
    });

    // Version 7: add embedding field to messages (no new index needed)
    this.version(7).stores({
      topics: 'id, userId, name, createdOn, updatedOn, isDeleted, activeForkId, maxContextMessages',
      messages: 'id, topicId, forkId, type, created, isDeleted, includeInContext, parentMessageId',
      predefinedPrompts: 'id, name',
      userSettings: 'id',
    });

    // Version 8: add mode index to topics for debate mode
    this.version(8).stores({
      topics: 'id, userId, name, createdOn, updatedOn, isDeleted, activeForkId, maxContextMessages, mode',
      messages: 'id, topicId, forkId, type, created, isDeleted, includeInContext, parentMessageId',
      predefinedPrompts: 'id, name',
      userSettings: 'id',
    });

    // Version 9: add modelId index to topics for per-chat model memory,
    // and backfill existing topics from the last assistant message with a model.
    this.version(9)
      .stores({
        topics: 'id, userId, name, createdOn, updatedOn, isDeleted, activeForkId, maxContextMessages, mode, modelId',
        messages: 'id, topicId, forkId, type, created, isDeleted, includeInContext, parentMessageId',
        predefinedPrompts: 'id, name',
        userSettings: 'id',
      })
      .upgrade(async (trans) => {
        try {
        const allMessages = (await trans.table('messages').toArray()) as Message[];

        // Find the last (most recent) assistant message per topic that has a model
        const lastModelByTopic = new Map<string, string>();
        const lastCreatedByTopic = new Map<string, string>();

        for (const m of allMessages) {
          if (m.type === 'assistant' && m.model) {
            const prevCreated = lastCreatedByTopic.get(m.topicId);
            if (!prevCreated || m.created > prevCreated) {
              lastCreatedByTopic.set(m.topicId, m.created);
              lastModelByTopic.set(m.topicId, m.model);
            }
          }
        }

        // Update only topics that don't already have a modelId
        const allTopics = (await trans.table('topics').toArray()) as Topic[];
        for (const topic of allTopics) {
          const modelId = lastModelByTopic.get(topic.id);
          if (modelId && !topic.modelId) {
            await trans.table('topics').update(topic.id, { modelId });
          }
        }
        } catch (err) {
          console.error('AthenaDb v9 migration failed', err);
        }
      });

    // Version 10: add summaryTokens and summaryCost fields to messages (no new index needed)
    this.version(10).stores({
      topics: 'id, userId, name, createdOn, updatedOn, isDeleted, activeForkId, maxContextMessages, mode, modelId',
      messages: 'id, topicId, forkId, type, created, isDeleted, includeInContext, parentMessageId',
      predefinedPrompts: 'id, name',
      userSettings: 'id',
    });

    // Version 11: add summaryReadCount field to messages (no new index needed)
    this.version(11)
      .stores({
        topics: 'id, userId, name, createdOn, updatedOn, isDeleted, activeForkId, maxContextMessages, mode, modelId',
        messages: 'id, topicId, forkId, type, created, isDeleted, includeInContext, parentMessageId',
        predefinedPrompts: 'id, name',
        userSettings: 'id',
      })
      .upgrade(async (trans) => {
        try {
          await trans
            .table('messages')
            .toCollection()
            .modify((msg: Message) => {
              if (msg.summary && msg.summaryReadCount === undefined) {
                msg.summaryReadCount = 0;
              }
            });
        } catch (err) {
          console.error('AthenaDb v11 migration failed', err);
        }
      });
  }
}

export type MessageType = 'user' | 'assistant' | 'system' | 'aiNote';

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string; // base64
  previewUrl?: string; // for images
}

export interface Fork {
  id: string;
  name: string;
  createdOn: string;
}

export interface PredefinedPrompt {
  id: string;
  name: string;
  content: string;
}

export interface UserSetting {
  id: string;
  value: unknown;
}

export type DebateSide = 'left' | 'right';
export type DebatePhase = 'answer' | 'review' | 'final' | 'consensus';

export interface Message {
  id: string;
  topicId: string;
  forkId?: string;
  type: MessageType;
  content: string;
  model?: string;
  isDeleted: boolean;
  includeInContext: boolean;
  created: string;
  failed: boolean;
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;
  cacheCreationTokens?: number;
  totalCost: number;
  searchCount?: number;
  latencyMs?: number;
  reasoning?: string;
  toolLogs?: string;
  parentMessageId?: string;
  activeResponseId?: string;
  attachments?: Attachment[];
  embedding?: number[] | null;
  summary?: string;
  summaryTokens?: number;
  summaryCost?: number;
  summaryReadCount?: number;
  rawResponse?: string;
  // Debate fields
  debateSide?: DebateSide;
  debatePhase?: DebatePhase;
}

export type TopicMode = 'topic' | 'debate';

export interface Topic {
  id: string;
  name: string;
  createdOn: string;
  updatedOn: string;
  isDeleted: boolean;
  scratchpad?: string;
  forks?: Fork[];
  activeForkId?: string;
  maxContextMessages?: number;
  selectedPromptIds?: string[];
  modelId?: string;
  // Debate fields
  mode?: TopicMode;
  debateModelAId?: string;
  debateModelBId?: string;
}

export const athenaDb = new AthenaDatabase();
