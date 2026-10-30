import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithTheme, createTopic, createUserChatModel } from '../testUtils';
import type { LearningCycle, LearningDay } from '../database/AthenaDb';
import { askLlmStream } from '../services/llmService';
import CuratorView from './CuratorView';

const mockModel = createUserChatModel();
const mockChatState = { sending: false, sendMessageStream: jest.fn() };
const mockTopicState = { renameTopic: jest.fn(), updateTopicTimestamp: jest.fn() };
const mockCycle: LearningCycle = {
  id: 'course-1', topicId: 'topic-1', topicName: 'A course', hook: '', weekStart: '2026-01-01',
  phase: 'active', priorKnowledgeLevel: 'advanced',
};
const mockParts: LearningDay[] = [1, 2].map((dayNumber) => ({
  id: `part-${dayNumber}`, cycleId: mockCycle.id, dayNumber, subTopic: `Part ${dayNumber}`,
  hook: '', opener: '', summary: dayNumber === 1 ? 'Existing course material.' : '', links: [],
  bridge: '', keyTakeaway: '', hookArchetype: 'everyday', estimatedReadingMinutes: 1,
  reflectionQuestions: [], isCompleted: false,
}));
const mockSaveCourseParts = jest.fn().mockResolvedValue(undefined);
const mockCuratorState = {
  loading: false,
  cycles: [mockCycle],
  loadCyclesForTopic: jest.fn().mockResolvedValue(undefined),
  getActiveCycle: (): LearningCycle => mockCycle,
  getPartsForCycle: (): LearningDay[] => mockParts,
  completePart: jest.fn().mockResolvedValue(undefined),
  createCycle: jest.fn(),
  saveCourseParts: mockSaveCourseParts,
  updateCyclePhase: jest.fn().mockResolvedValue(undefined),
  incrementCategoryCount: jest.fn(),
  getCategoryCounts: jest.fn().mockResolvedValue({}),
  addPickedQuestion: jest.fn(),
  getPickedQuestions: jest.fn().mockResolvedValue({}),
  getPastRatingsForContext: jest.fn().mockResolvedValue({ ratingsContext: '', completedCourseNames: '' }),
};

jest.mock('../store/CuratorStore', () => ({
  useCuratorStore: Object.assign(() => mockCuratorState, { getState: () => mockCuratorState }),
}));
jest.mock('../store/ChatStore', () => ({
  useChatStore: (): typeof mockChatState => mockChatState,
}));
jest.mock('../store/TopicStore', () => ({
  useTopicStore: { getState: (): typeof mockTopicState => mockTopicState },
}));
jest.mock('../database/AthenaDb', () => ({
  athenaDb: {
    userSettings: {
      get: (): Promise<undefined> => Promise.resolve(undefined),
      put: (): Promise<string> => Promise.resolve('partGenTimings'),
    },
  },
}));
jest.mock('../services/llmService', () => ({ askLlmStream: jest.fn() }));
jest.mock('./ModelSelector', () => ({
  __esModule: true, default: (): null => null,
  getDefaultModel: (): typeof mockModel => mockModel,
  getQuestionGenModel: (): typeof mockModel => mockModel,
}));
jest.mock('./MessageBubble', () => (): null => null);
jest.mock('./MarkdownWithCode', () => (): null => null);
jest.mock('./TypingIndicator', () => (): null => null);

describe('Curator part generation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCuratorState.getCategoryCounts.mockResolvedValue({});
    mockCuratorState.loadCyclesForTopic.mockResolvedValue(undefined);
    mockCuratorState.completePart.mockResolvedValue(undefined);
    mockCuratorState.updateCyclePhase.mockResolvedValue(undefined);
    mockSaveCourseParts.mockResolvedValue(undefined);
    jest.mocked(askLlmStream).mockResolvedValue({
      content: JSON.stringify({ title: 'Part 2', body: 'New course material.', keyTakeaway: '**The answer.**' }),
      rawContent: '', promptTokens: 1, completionTokens: 1, searchCount: 0,
    });
  });

  it.each(['beginner', 'advanced', undefined] as const)(
    'passes the saved knowledge level (%s) when generating the next part',
    async (level) => {
      mockCycle.priorKnowledgeLevel = level;
      renderWithTheme(<CuratorView topic={createTopic({ id: 'topic-1', mode: 'curator' })} messages={[]} />);

      fireEvent.click(screen.getByText('Continue to Part 2'));

      await waitFor(() => expect(mockSaveCourseParts).toHaveBeenCalled());
      const messages = jest.mocked(askLlmStream).mock.calls[0][2];
      const userMessage = messages.find((message) => message.role === 'user');
      expect(userMessage?.content).toEqual(expect.stringContaining(`Learner's prior knowledge: ${level ?? 'intermediate'}`));
    },
  );
});
