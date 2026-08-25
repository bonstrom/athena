import { athenaDb } from '../database/AthenaDb';

export interface DatabaseIssue {
  key: string;
  label: string;
  description: string;
  count: number;
}

export interface DatabaseHealthReport {
  issues: DatabaseIssue[];
  totalIssueCount: number;
  totalTopics: number;
  totalMessages: number;
  totalLearningCycles: number;
  totalLearningDays: number;
}

export interface DatabaseCleanupResult {
  removed: Record<string, number>;
  totalRemoved: number;
}

interface OrphanData {
  orphanedMessageIds: string[];
  softDeletedMessageIds: string[];
  orphanedCycleIds: string[];
  orphanedDayIds: string[];
  totalTopics: number;
  totalMessages: number;
  totalCycles: number;
  totalDays: number;
}

/**
 * Loads every record across the topic-scoped tables and identifies rows that no
 * longer have a valid owner, plus hidden soft-deleted messages. The result is
 * shared by the analysis and cleanup paths so a report always matches what a
 * subsequent clean would remove.
 */
async function collectOrphans(): Promise<OrphanData> {
  const [topics, messages, cycles, days] = await Promise.all([
    athenaDb.topics.toArray(),
    athenaDb.messages.toArray(),
    athenaDb.learningCycles.toArray(),
    athenaDb.learningDays.toArray(),
  ]);

  const topicIds = new Set(topics.map((t) => t.id));
  const cycleIds = new Set(cycles.map((c) => c.id));
  const orphanedCycleIds = new Set(cycles.filter((c) => !topicIds.has(c.topicId)).map((c) => c.id));

  const orphanedMessageIds = messages.filter((m) => !topicIds.has(m.topicId)).map((m) => m.id);
  const softDeletedMessageIds = messages.filter((m) => m.isDeleted && topicIds.has(m.topicId)).map((m) => m.id);
  const orphanedCycleIdList = Array.from(orphanedCycleIds);
  const orphanedDayIds = days.filter((d) => !cycleIds.has(d.cycleId) || orphanedCycleIds.has(d.cycleId)).map((d) => d.id);

  return {
    orphanedMessageIds,
    softDeletedMessageIds,
    orphanedCycleIds: orphanedCycleIdList,
    orphanedDayIds,
    totalTopics: topics.length,
    totalMessages: messages.length,
    totalCycles: cycles.length,
    totalDays: days.length,
  };
}

/**
 * Scans the database for orphaned and soft-deleted records without modifying
 * anything. Returns a human-readable report suitable for a settings UI.
 */
export async function analyzeDatabaseHealth(): Promise<DatabaseHealthReport> {
  const data = await collectOrphans();

  const issues: DatabaseIssue[] = [
    {
      key: 'orphanedMessages',
      label: 'Orphaned messages',
      description: 'Messages whose topic no longer exists.',
      count: data.orphanedMessageIds.length,
    },
    {
      key: 'softDeletedMessages',
      label: 'Soft-deleted messages',
      description: 'Hidden messages still stored in the database.',
      count: data.softDeletedMessageIds.length,
    },
    {
      key: 'orphanedLearningCycles',
      label: 'Orphaned learning cycles',
      description: 'Course cycles whose topic was deleted.',
      count: data.orphanedCycleIds.length,
    },
    {
      key: 'orphanedLearningDays',
      label: 'Orphaned learning days',
      description: 'Course days whose cycle is missing or orphaned.',
      count: data.orphanedDayIds.length,
    },
  ];

  return {
    issues,
    totalIssueCount: issues.reduce((sum, issue) => sum + issue.count, 0),
    totalTopics: data.totalTopics,
    totalMessages: data.totalMessages,
    totalLearningCycles: data.totalCycles,
    totalLearningDays: data.totalDays,
  };
}

/**
 * Permanently removes all orphaned and soft-deleted records identified by
 * {@link analyzeDatabaseHealth}. Returns a count of what was removed.
 */
export async function cleanDatabase(): Promise<DatabaseCleanupResult> {
  const data = await collectOrphans();

  await athenaDb.transaction('rw', [athenaDb.messages, athenaDb.learningCycles, athenaDb.learningDays], async () => {
    if (data.orphanedMessageIds.length > 0) {
      await athenaDb.messages.bulkDelete(data.orphanedMessageIds);
    }
    if (data.softDeletedMessageIds.length > 0) {
      await athenaDb.messages.bulkDelete(data.softDeletedMessageIds);
    }
    if (data.orphanedCycleIds.length > 0) {
      await athenaDb.learningCycles.bulkDelete(data.orphanedCycleIds);
    }
    if (data.orphanedDayIds.length > 0) {
      await athenaDb.learningDays.bulkDelete(data.orphanedDayIds);
    }
  });

  const removed: Record<string, number> = {
    orphanedMessages: data.orphanedMessageIds.length,
    softDeletedMessages: data.softDeletedMessageIds.length,
    orphanedLearningCycles: data.orphanedCycleIds.length,
    orphanedLearningDays: data.orphanedDayIds.length,
  };

  return {
    removed,
    totalRemoved: Object.values(removed).reduce((sum, count) => sum + count, 0),
  };
}
