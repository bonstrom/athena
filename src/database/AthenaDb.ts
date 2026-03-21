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
  }
}

export type MessageType = "user" | "assistant" | "system" | "aiNote";

export interface Message {
  id: string;
  topicId: string;
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
}

export const athenaDb = new AthenaDatabase();
