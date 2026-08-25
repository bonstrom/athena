/* eslint-disable @typescript-eslint/explicit-function-return-type, unused-imports/no-unused-vars */
import type { Topic, Message, LearningCycle, LearningDay } from '../../database/AthenaDb';
import { createTopic, createMessage } from '../../testUtils';

const mockTopicsToArray = jest.fn<Promise<Topic[]>, []>();
const mockMessagesToArray = jest.fn<Promise<Message[]>, []>();
const mockCyclesToArray = jest.fn<Promise<LearningCycle[]>, []>();
const mockDaysToArray = jest.fn<Promise<LearningDay[]>, []>();
const mockMessagesBulkDelete = jest.fn<Promise<void>, [string[]]>();
const mockCyclesBulkDelete = jest.fn<Promise<void>, [string[]]>();
const mockDaysBulkDelete = jest.fn<Promise<void>, [string[]]>();
const mockTransaction = jest.fn<Promise<unknown>, [string, unknown[], () => Promise<unknown>]>();

jest.mock('../../database/AthenaDb', () => ({
  athenaDb: {
    topics: {
      toArray: (): Promise<Topic[]> => mockTopicsToArray(),
    },
    messages: {
      toArray: (): Promise<Message[]> => mockMessagesToArray(),
      bulkDelete: (ids: string[]): Promise<void> => mockMessagesBulkDelete(ids),
    },
    learningCycles: {
      toArray: (): Promise<LearningCycle[]> => mockCyclesToArray(),
      bulkDelete: (ids: string[]): Promise<void> => mockCyclesBulkDelete(ids),
    },
    learningDays: {
      toArray: (): Promise<LearningDay[]> => mockDaysToArray(),
      bulkDelete: (ids: string[]): Promise<void> => mockDaysBulkDelete(ids),
    },
    transaction: (mode: string, tables: unknown[], scope: () => Promise<unknown>): Promise<unknown> =>
      mockTransaction(mode, tables, scope),
  },
}));

import { analyzeDatabaseHealth, cleanDatabase } from '../databaseHealthService';

function createCycle(overrides?: Partial<LearningCycle>): LearningCycle {
  return {
    id: 'cycle-1',
    topicId: 'topic-1',
    topicName: 'Course',
    hook: 'hook',
    weekStart: '2026-01-01T00:00:00.000Z',
    phase: 'active',
    ...overrides,
  };
}

function createDay(overrides?: Partial<LearningDay>): LearningDay {
  return {
    id: 'day-1',
    cycleId: 'cycle-1',
    dayNumber: 1,
    subTopic: 'sub',
    hook: 'hook',
    opener: 'opener',
    summary: 'summary',
    links: [],
    bridge: 'bridge',
    keyTakeaway: 'takeaway',
    hookArchetype: 'archetype',
    estimatedReadingMinutes: 5,
    reflectionQuestions: [],
    isCompleted: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTopicsToArray.mockResolvedValue([]);
  mockMessagesToArray.mockResolvedValue([]);
  mockCyclesToArray.mockResolvedValue([]);
  mockDaysToArray.mockResolvedValue([]);
  mockMessagesBulkDelete.mockResolvedValue(undefined);
  mockCyclesBulkDelete.mockResolvedValue(undefined);
  mockDaysBulkDelete.mockResolvedValue(undefined);
  mockTransaction.mockImplementation((_mode: string, _tables: unknown[], scope: () => Promise<unknown>): Promise<unknown> => scope());
});

describe('analyzeDatabaseHealth', () => {
  it('reports zero issues for a consistent database', async () => {
    mockTopicsToArray.mockResolvedValue([createTopic({ id: 't1' })]);
    mockMessagesToArray.mockResolvedValue([createMessage({ id: 'm1', topicId: 't1', isDeleted: false })]);
    mockCyclesToArray.mockResolvedValue([createCycle({ id: 'c1', topicId: 't1' })]);
    mockDaysToArray.mockResolvedValue([createDay({ id: 'd1', cycleId: 'c1' })]);

    const report = await analyzeDatabaseHealth();

    expect(report.totalIssueCount).toBe(0);
    expect(report.issues.every((issue) => issue.count === 0)).toBe(true);
    expect(report.totalTopics).toBe(1);
    expect(report.totalMessages).toBe(1);
    expect(report.totalLearningCycles).toBe(1);
    expect(report.totalLearningDays).toBe(1);
  });

  it('detects orphaned messages whose topic no longer exists', async () => {
    mockTopicsToArray.mockResolvedValue([createTopic({ id: 't1' })]);
    mockMessagesToArray.mockResolvedValue([
      createMessage({ id: 'm1', topicId: 't1' }),
      createMessage({ id: 'm2', topicId: 'missing-topic' }),
    ]);

    const report = await analyzeDatabaseHealth();

    expect(report.totalIssueCount).toBe(1);
    expect(report.issues.find((i) => i.key === 'orphanedMessages')?.count).toBe(1);
  });

  it('detects soft-deleted messages but does not double-count orphaned ones', async () => {
    mockTopicsToArray.mockResolvedValue([createTopic({ id: 't1' })]);
    mockMessagesToArray.mockResolvedValue([
      createMessage({ id: 'm1', topicId: 't1', isDeleted: true }),
      createMessage({ id: 'm2', topicId: 'missing-topic', isDeleted: true }),
    ]);

    const report = await analyzeDatabaseHealth();

    expect(report.issues.find((i) => i.key === 'softDeletedMessages')?.count).toBe(1);
    expect(report.issues.find((i) => i.key === 'orphanedMessages')?.count).toBe(1);
    expect(report.totalIssueCount).toBe(2);
  });

  it('detects orphaned learning cycles', async () => {
    mockTopicsToArray.mockResolvedValue([createTopic({ id: 't1' })]);
    mockCyclesToArray.mockResolvedValue([
      createCycle({ id: 'c1', topicId: 't1' }),
      createCycle({ id: 'c2', topicId: 'missing-topic' }),
    ]);

    const report = await analyzeDatabaseHealth();

    expect(report.issues.find((i) => i.key === 'orphanedLearningCycles')?.count).toBe(1);
  });

  it('detects orphaned learning days including days of orphaned cycles', async () => {
    mockTopicsToArray.mockResolvedValue([createTopic({ id: 't1' })]);
    mockCyclesToArray.mockResolvedValue([
      createCycle({ id: 'c1', topicId: 't1' }),
      createCycle({ id: 'c2', topicId: 'missing-topic' }),
    ]);
    mockDaysToArray.mockResolvedValue([
      createDay({ id: 'd1', cycleId: 'c1' }),
      createDay({ id: 'd2', cycleId: 'c2' }),
      createDay({ id: 'd3', cycleId: 'missing-cycle' }),
    ]);

    const report = await analyzeDatabaseHealth();

    expect(report.issues.find((i) => i.key === 'orphanedLearningDays')?.count).toBe(2);
  });
});

describe('cleanDatabase', () => {
  it('removes orphaned and soft-deleted records and reports the counts', async () => {
    mockTopicsToArray.mockResolvedValue([createTopic({ id: 't1' })]);
    mockMessagesToArray.mockResolvedValue([
      createMessage({ id: 'm-orphan', topicId: 'missing-topic' }),
      createMessage({ id: 'm-soft', topicId: 't1', isDeleted: true }),
      createMessage({ id: 'm-keep', topicId: 't1' }),
    ]);
    mockCyclesToArray.mockResolvedValue([createCycle({ id: 'c-orphan', topicId: 'missing-topic' })]);
    mockDaysToArray.mockResolvedValue([createDay({ id: 'd-orphan', cycleId: 'c-orphan' })]);

    const result = await cleanDatabase();

    expect(mockMessagesBulkDelete).toHaveBeenCalledWith(['m-orphan']);
    expect(mockMessagesBulkDelete).toHaveBeenCalledWith(['m-soft']);
    expect(mockCyclesBulkDelete).toHaveBeenCalledWith(['c-orphan']);
    expect(mockDaysBulkDelete).toHaveBeenCalledWith(['d-orphan']);
    expect(result.totalRemoved).toBe(4);
    expect(result.removed.orphanedMessages).toBe(1);
    expect(result.removed.softDeletedMessages).toBe(1);
    expect(result.removed.orphanedLearningCycles).toBe(1);
    expect(result.removed.orphanedLearningDays).toBe(1);
  });

  it('performs deletions inside a single transaction', async () => {
    mockTopicsToArray.mockResolvedValue([createTopic({ id: 't1' })]);
    mockMessagesToArray.mockResolvedValue([createMessage({ id: 'm-orphan', topicId: 'missing-topic' })]);
    mockCyclesToArray.mockResolvedValue([]);
    mockDaysToArray.mockResolvedValue([]);

    await cleanDatabase();

    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('skips bulkDelete calls when there is nothing to remove', async () => {
    mockTopicsToArray.mockResolvedValue([createTopic({ id: 't1' })]);
    mockMessagesToArray.mockResolvedValue([createMessage({ id: 'm1', topicId: 't1' })]);
    mockCyclesToArray.mockResolvedValue([]);
    mockDaysToArray.mockResolvedValue([]);

    const result = await cleanDatabase();

    expect(mockMessagesBulkDelete).not.toHaveBeenCalled();
    expect(mockCyclesBulkDelete).not.toHaveBeenCalled();
    expect(mockDaysBulkDelete).not.toHaveBeenCalled();
    expect(result.totalRemoved).toBe(0);
  });
});
