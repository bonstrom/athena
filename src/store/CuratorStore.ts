import { create } from 'zustand';
import { athenaDb, LearningCycle, LearningDay, CuratorPhase, ReflectionQuestion } from '../database/AthenaDb';

interface CuratorState {
  cycles: LearningCycle[];
  days: LearningDay[];
  loading: boolean;

  loadCyclesForTopic: (topicId: string) => Promise<void>;
  createCycle: (topicId: string, topicName: string, hook: string, priorKnowledgeLevel?: 'beginner' | 'intermediate' | 'advanced') => Promise<LearningCycle>;
  updateCyclePhase: (cycleId: string, phase: CuratorPhase) => Promise<void>;
  updateCyclePriorKnowledge: (cycleId: string, level: 'beginner' | 'intermediate' | 'advanced') => Promise<void>;
  saveCourseParts: (
    cycleId: string,
    planParts: {
      partNumber: number;
      subTopic: string;
      hook: string;
      opener: string;
      summary: string;
      links: string[];
      bridge: string;
      keyTakeaway: string;
      hookArchetype: string;
      estimatedReadingMinutes: number;
      reflectionQuestions: ReflectionQuestion[];
      isCompleted?: boolean;
    }[],
  ) => Promise<void>;
  completePart: (dayId: string) => Promise<void>;
  rateCycle: (cycleId: string, topicRating: number, contentRating: number, reflections: string) => Promise<void>;
  getActiveCycle: (topicId: string) => LearningCycle | undefined;
  getPartsForCycle: (cycleId: string) => LearningDay[];
  incrementCategoryCount: (categoryId: string) => Promise<void>;
  getCategoryCounts: () => Promise<Record<string, number>>;
  addPickedQuestion: (categoryId: string, question: string) => Promise<void>;
  getPickedQuestions: () => Promise<Record<string, string[]>>;
  getPastRatingsForContext: () => Promise<{ ratingsContext: string; completedCourseNames: string }>;
  getUnfinishedTopicIds: () => Promise<Set<string>>;
}

export const useCuratorStore = create<CuratorState>((set, get) => ({
  cycles: [],
  days: [],
  loading: false,

  loadCyclesForTopic: async (topicId: string): Promise<void> => {
    set({ loading: true });
    try {
      const cycles = await athenaDb.learningCycles.where('topicId').equals(topicId).toArray();
      const allParts = await athenaDb.learningDays.where('cycleId').anyOf(cycles.map((c) => c.id)).toArray();

      const toDelete: string[] = [];
      const seen = new Map<string, Set<number>>();
      const deduped: LearningDay[] = [];

      for (const d of allParts) {
        const key = d.cycleId;
        if (!seen.has(key)) seen.set(key, new Set());
        const nums = seen.get(key);
        if (!nums) throw new Error(`Unexpected: set not found for key ${key}`);
        if (nums.has(d.dayNumber)) {
          toDelete.push(d.id);
        } else {
          nums.add(d.dayNumber);
          deduped.push(d);
        }
      }

      if (toDelete.length > 0) {
        console.warn(`[CuratorStore] Deduplicating ${toDelete.length} duplicate part entries`);
        void athenaDb.learningDays.bulkDelete(toDelete);
      }

      set({ cycles, days: deduped, loading: false });
    } catch (err) {
      console.error('[CuratorStore] Failed to load cycles', err);
      set({ loading: false });
    }
  },

  createCycle: async (topicId: string, topicName: string, hook: string, priorKnowledgeLevel?: 'beginner' | 'intermediate' | 'advanced'): Promise<LearningCycle> => {
    const cycle: LearningCycle = {
      id: crypto.randomUUID(),
      topicId,
      topicName,
      hook,
      weekStart: new Date().toISOString(),
      phase: 'suggesting',
      priorKnowledgeLevel,
    };
    await athenaDb.learningCycles.add(cycle);
    set((state) => ({ cycles: [cycle, ...state.cycles] }));
    return cycle;
  },

  updateCyclePhase: async (cycleId: string, phase: CuratorPhase): Promise<void> => {
    await athenaDb.learningCycles.update(cycleId, { phase });
    set((state) => ({
      cycles: state.cycles.map((c) => (c.id === cycleId ? { ...c, phase } : c)),
    }));
  },

  updateCyclePriorKnowledge: async (cycleId: string, level: 'beginner' | 'intermediate' | 'advanced'): Promise<void> => {
    await athenaDb.learningCycles.update(cycleId, { priorKnowledgeLevel: level });
    set((state) => ({
      cycles: state.cycles.map((c) => (c.id === cycleId ? { ...c, priorKnowledgeLevel: level } : c)),
    }));
  },

  saveCourseParts: async (
    cycleId: string,
    planParts: {
      partNumber: number;
      subTopic: string;
      hook: string;
      opener: string;
      summary: string;
      links: string[];
      bridge: string;
      keyTakeaway: string;
      hookArchetype: string;
      estimatedReadingMinutes: number;
      reflectionQuestions: ReflectionQuestion[];
      isCompleted?: boolean;
    }[],
  ): Promise<void> => {
    const newParts: LearningDay[] = planParts.map((d) => ({
      id: crypto.randomUUID(),
      cycleId,
      dayNumber: d.partNumber,
      subTopic: d.subTopic,
      hook: d.hook,
      opener: d.opener,
      summary: d.summary,
      links: d.links,
      bridge: d.bridge,
      keyTakeaway: d.keyTakeaway,
      hookArchetype: d.hookArchetype,
      estimatedReadingMinutes: d.estimatedReadingMinutes,
      reflectionQuestions: d.reflectionQuestions,
      isCompleted: d.isCompleted ?? false,
    }));

    await athenaDb.transaction('rw', athenaDb.learningDays, async () => {
      await athenaDb.learningDays.where('cycleId').equals(cycleId).delete();
      await athenaDb.learningDays.bulkAdd(newParts);
    });
    set((state) => ({ days: [...state.days.filter((d) => d.cycleId !== cycleId), ...newParts] }));
  },

  completePart: async (dayId: string): Promise<void> => {
    await athenaDb.learningDays.update(dayId, { isCompleted: true });
    set((state) => ({
      days: state.days.map((d) => (d.id === dayId ? { ...d, isCompleted: true } : d)),
    }));
  },

  rateCycle: async (cycleId: string, topicRating: number, contentRating: number, reflections: string): Promise<void> => {
    const clampedTopic = Math.max(1, Math.min(10, Math.round(topicRating || 0)));
    const clampedContent = Math.max(1, Math.min(10, Math.round(contentRating || 0)));
    await athenaDb.learningCycles.update(cycleId, { topicRating: clampedTopic, contentRating: clampedContent, reflections, phase: 'rated' });
    set((state) => ({
      cycles: state.cycles.map((c) =>
        c.id === cycleId ? { ...c, topicRating: clampedTopic, contentRating: clampedContent, reflections, phase: 'rated' } : c,
      ),
    }));
  },

  getActiveCycle: (topicId: string): LearningCycle | undefined => {
    return get().cycles.find((c) => c.topicId === topicId && (c.phase === 'suggesting' || c.phase === 'active'));
  },

  getPartsForCycle: (cycleId: string): LearningDay[] => {
    return get()
      .days.filter((d) => d.cycleId === cycleId)
      .sort((a, b) => a.dayNumber - b.dayNumber);
  },

  incrementCategoryCount: async (categoryId: string): Promise<void> => {
    await athenaDb.transaction('rw', athenaDb.userSettings, async () => {
      const setting = await athenaDb.userSettings.get('learningCategoryCounts');
      const counts: Record<string, number> = (setting && typeof setting.value === 'object' && setting.value !== null)
        ? (setting.value as Record<string, number>)
        : {};
      counts[categoryId] = (counts[categoryId] || 0) + 1;
      await athenaDb.userSettings.put({ id: 'learningCategoryCounts', value: counts });
    });
  },

  getCategoryCounts: async (): Promise<Record<string, number>> => {
    const setting = await athenaDb.userSettings.get('learningCategoryCounts');
    if (setting && typeof setting.value === 'object' && setting.value !== null) {
      return setting.value as Record<string, number>;
    }
    return {};
  },

  addPickedQuestion: async (categoryId: string, question: string): Promise<void> => {
    const questions = await get().getPickedQuestions();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const list = questions[categoryId] ?? [];
    if (!list.includes(question)) {
      list.push(question);
      questions[categoryId] = list;
      await athenaDb.userSettings.put({ id: 'learningPickedQuestions', value: questions });
    }
  },

  getPickedQuestions: async (): Promise<Record<string, string[]>> => {
    const setting = await athenaDb.userSettings.get('learningPickedQuestions');
    if (setting && typeof setting.value === 'object' && setting.value !== null) {
      return setting.value as Record<string, string[]>;
    }
    return {};
  },

  getPastRatingsForContext: async (): Promise<{ ratingsContext: string; completedCourseNames: string }> => {
    const allParts = await athenaDb.learningDays.toArray();
    const allCycles = await athenaDb.learningCycles.toArray();
    const rated = allCycles.filter((c) => c.topicRating !== undefined || c.contentRating !== undefined);

    const completedCourses: string[] = [];
    for (const cycle of allCycles) {
      const cycleDays = allParts.filter((d) => d.cycleId === cycle.id);
      if (cycleDays.length > 0 && cycleDays.every((d) => d.isCompleted)) {
        completedCourses.push(cycle.topicName);
      }
    }

    if (rated.length === 0) {
      return {
        ratingsContext: 'No past ratings yet. Go broad and varied with your topic suggestions.',
        completedCourseNames: completedCourses.length > 0
          ? `Courses the user has completed: ${completedCourses.join(', ')}`
          : '',
      };
    }

    const lines: string[] = [];
    lines.push('## Past Learning Topics & Ratings\n');

    const sorted = rated.sort((a, b) => new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime());
    for (const cycle of sorted) {
      const cycleDays = allParts.filter((d) => d.cycleId === cycle.id);
      const completedParts = cycleDays.filter((d) => d.isCompleted).length;
      const daySubtopics = cycleDays
        .sort((a, b) => a.dayNumber - b.dayNumber)
        .map((d) => (d.isCompleted ? `✓ ${d.subTopic}` : `○ ${d.subTopic}`))
        .join(', ');

      lines.push(
        `- **${cycle.topicName}** (${cycle.weekStart.slice(0, 10)}) — Topic: ${cycle.topicRating ?? '-'}/10, Content: ${cycle.contentRating ?? '-'}/10 — ${completedParts}/${cycleDays.length} parts completed`,
      );
      if (cycleDays.length > 0) {
        lines.push(`  Parts: ${daySubtopics}`);
      }
      if (cycle.reflections) {
        lines.push(`  Feedback: ${cycle.reflections}`);
      }
    }

    lines.push(
      '\nUse these ratings to steer future suggestions: prefer topics and styles similar to highly-rated ones, avoid what scored low.',
    );
    const completedCourseNames = completedCourses.length > 0
      ? `Courses the user has completed (you can make callbacks to these): ${completedCourses.join(', ')}`
      : '';
    return { ratingsContext: lines.join('\n'), completedCourseNames };
  },

  getUnfinishedTopicIds: async (): Promise<Set<string>> => {
    const allCycles = await athenaDb.learningCycles
      .where('phase')
      .anyOf(['active', 'suggesting'])
      .toArray();

    if (allCycles.length === 0) return new Set();

    const allParts = await athenaDb.learningDays.toArray();
    const unfinishedIds = new Set<string>();

    for (const cycle of allCycles) {
      const cycleDays = allParts.filter((d) => d.cycleId === cycle.id);
      if (cycleDays.some((d) => !d.isCompleted)) {
        unfinishedIds.add(cycle.topicId);
      }
    }

    return unfinishedIds;
  },
}));

export type { CuratorState };
