import Dexie, { Table } from "dexie";

class AthenaDatabase extends Dexie {
  topics!: Table<Topic, string>;
  messages!: Table<Message, string>;

  constructor() {
    super("AthenaDatabase");

    this.version(1).stores({
      topics: "id, userId, name, createdOn, updatedOn, isDeleted",
      messages: "id, topicId, type, created, isDeleted, includeInContext",
      usages: "id, messageId",
    });

    this.version(2)
      .stores({
        topics: "id, userId, name, createdOn, updatedOn, isDeleted, activeForkId",
        messages: "id, topicId, forkId, type, created, isDeleted, includeInContext",
      })
      .upgrade(async (trans) => {
        const DEFAULT_FORK_ID = "main";

        // Migrate topics
        await trans
          .table("topics")
          .toCollection()
          .modify((topic: Topic) => {
            if (!topic.forks) {
              topic.forks = [
                {
                  id: DEFAULT_FORK_ID,
                  name: "Main",
                  createdOn: topic.createdOn,
                },
              ];
              topic.activeForkId = DEFAULT_FORK_ID;
            }
          });

        // Migrate messages
        await trans
          .table("messages")
          .toCollection()
          .modify((message: Message) => {
            if (!message.forkId) {
              message.forkId = DEFAULT_FORK_ID;
            }
          });
      });
  }
}

export type MessageType = "user" | "assistant" | "system" | "aiNote";

export interface Fork {
  id: string;
  name: string;
  createdOn: string;
}

export interface Message {
  id: string;
  topicId: string;
  forkId?: string; // Optional for backward compatibility during migration
  type: MessageType;
  content: string;
  model?: string;
  isDeleted: boolean;
  includeInContext: boolean;
  created: string;
  failed: boolean;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
}

export interface Topic {
  id: string;
  name: string;
  createdOn: string;
  updatedOn: string;
  isDeleted: boolean;
  scratchpad?: string;
  forks?: Fork[]; // Optional for backward compatibility
  activeForkId?: string; // Optional for backward compatibility
}

export const athenaDb = new AthenaDatabase();
