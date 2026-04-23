import { groupTopicsByDate } from '../groupTopicsByDate';
import { Topic } from '../../database/AthenaDb';

// Pin "now" to 2024-06-15T12:00:00Z so all boundary dates are deterministic
const NOW = new Date('2024-06-15T12:00:00Z');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

function makeTopic(overrides: Partial<Topic> & { updatedOn?: string; createdOn?: string }): Topic {
  return {
    id: 't1',
    name: 'Test Topic',
    createdOn: overrides.createdOn ?? NOW.toISOString(),
    updatedOn: overrides.updatedOn ?? NOW.toISOString(),
    isDeleted: false,
    ...overrides,
  };
}

/** Returns an ISO string N days before NOW at noon UTC */
function daysAgo(n: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

describe('groupTopicsByDate', () => {
  it('returns an empty array when given no topics', () => {
    expect(groupTopicsByDate([])).toEqual([]);
  });

  it("groups a topic updated today into 'Today'", () => {
    const topics = [makeTopic({ updatedOn: NOW.toISOString() })];
    const result = groupTopicsByDate(topics);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Today');
    expect(result[0].topics).toHaveLength(1);
  });

  it("groups a topic updated yesterday into 'Yesterday'", () => {
    const topics = [makeTopic({ updatedOn: daysAgo(1) })];
    const result = groupTopicsByDate(topics);
    expect(result[0].label).toBe('Yesterday');
  });

  it("groups a topic updated 3 days ago into 'Previous 7 Days'", () => {
    const topics = [makeTopic({ updatedOn: daysAgo(3) })];
    const result = groupTopicsByDate(topics);
    expect(result[0].label).toBe('Previous 7 Days');
  });

  it("groups a topic updated 15 days ago into 'Previous 30 Days'", () => {
    const topics = [makeTopic({ updatedOn: daysAgo(15) })];
    const result = groupTopicsByDate(topics);
    expect(result[0].label).toBe('Previous 30 Days');
  });

  it("groups a topic updated 60 days ago into 'Older'", () => {
    const topics = [makeTopic({ updatedOn: daysAgo(60) })];
    const result = groupTopicsByDate(topics);
    expect(result[0].label).toBe('Older');
  });

  it('omits empty groups from the result', () => {
    // Only one topic, so only one group label should appear
    const topics = [makeTopic({ updatedOn: daysAgo(60) })];
    const result = groupTopicsByDate(topics);
    const labels = result.map((g) => g.label);
    expect(labels).not.toContain('Today');
    expect(labels).not.toContain('Yesterday');
    expect(labels).not.toContain('Previous 7 Days');
    expect(labels).not.toContain('Previous 30 Days');
    expect(labels).toContain('Older');
  });

  it('sorts topics within a group newest-first', () => {
    const older = makeTopic({ id: 'older', updatedOn: daysAgo(3) });
    const newer = makeTopic({ id: 'newer', updatedOn: daysAgo(2) });
    // Pass in reverse order to confirm sorting
    const result = groupTopicsByDate([older, newer]);
    const group = result.find((g) => g.label === 'Previous 7 Days');
    if (!group) {
      throw new Error('Expected Previous 7 Days group to exist');
    }
    expect(group.topics[0].id).toBe('newer');
    expect(group.topics[1].id).toBe('older');
  });

  it('handles multiple topics spread across different groups', () => {
    const topics = [
      makeTopic({ id: 'a', updatedOn: NOW.toISOString() }),
      makeTopic({ id: 'b', updatedOn: daysAgo(1) }),
      makeTopic({ id: 'c', updatedOn: daysAgo(60) }),
    ];
    const result = groupTopicsByDate(topics);
    const labels = result.map((g) => g.label);
    expect(labels).toContain('Today');
    expect(labels).toContain('Yesterday');
    expect(labels).toContain('Older');
    expect(result).toHaveLength(3);
  });

  it('handles invalid or missing timestamps without NaN sort behavior', () => {
    const validOlder = makeTopic({ id: 'valid-older', updatedOn: daysAgo(10) });
    const validRecent = makeTopic({ id: 'valid-recent', updatedOn: daysAgo(2) });
    const invalidDate = makeTopic({ id: 'invalid-date', updatedOn: 'not-a-date' });
    const missingBoth = {
      id: 'missing-both',
      name: 'Missing Both',
      // @ts-expect-error intentional legacy/corrupt data shape
      createdOn: undefined,
      // @ts-expect-error intentional legacy/corrupt data shape
      updatedOn: undefined,
      isDeleted: false,
    } as Topic;

    const result = groupTopicsByDate([validOlder, validRecent, invalidDate, missingBoth]);
    const previous7 = result.find((g) => g.label === 'Previous 7 Days');
    const previous30 = result.find((g) => g.label === 'Previous 30 Days');
    const older = result.find((g) => g.label === 'Older');

    expect(previous7?.topics[0].id).toBe('valid-recent');
    expect(previous30?.topics[0].id).toBe('valid-older');
    expect(older?.topics.map((t) => t.id)).toEqual(expect.arrayContaining(['invalid-date', 'missing-both']));
  });
});
