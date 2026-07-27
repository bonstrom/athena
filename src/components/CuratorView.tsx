import React, { JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Chip,
  Collapse,
  useTheme,
  CircularProgress,
  LinearProgress,
  Card,
  CardContent,
  CardActionArea,
  Tooltip,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Message, Topic, ReflectionQuestion } from '../database/AthenaDb';
import { athenaDb } from '../database/AthenaDb';
import { useCuratorStore } from '../store/CuratorStore';
import { useChatStore } from '../store/ChatStore';
import { useTopicStore } from '../store/TopicStore';
import { askLlmStream, LlmMessage } from '../services/llmService';
import { ChatModel, getDefaultModel, getQuestionGenModel } from '../components/ModelSelector';
import ModelSelector from '../components/ModelSelector';
import MessageBubble from '../components/MessageBubble';
import MarkdownWithCode from '../components/MarkdownWithCode';
import TypingIndicator from '../components/TypingIndicator';
import { LEARNING_SECTIONS, LearningCategory, buildCourseOutlinePrompt, buildPartGenerationPrompt, buildSingleQuestionPrompt } from '../constants';

interface TeacherMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface SuggestionCard {
  question: string;
  teaser: string;
  difficulty: number;
}

interface SuggestionSlot {
  status: 'loading' | 'done' | 'error';
  card: SuggestionCard | null;
}

interface OutlinePart {
  title: string;
  coreIdea: string;
  newInformation: string;
  hookArchetype: string;
  device: string;
}

interface CourseOutline {
  answerSpine: string;
  courseTitle: string;
  parts: OutlinePart[];
}

interface RawPart {
  partNumber?: number;
  dayNumber?: number;
  subTopic?: string;
  title?: string;
  description?: string;
  hook?: string;
  opener?: string;
  summary?: string;
  body?: string;
  keyTakeaway?: string;
  bridge?: string;
  hookArchetype?: string;
  estimatedReadingMinutes?: number;
  objective?: string;
  topics?: string[];
  activities?: string[];
  resources?: string[];
  links?: string[];
  furtherReading?: string[];
  earwormQuestion?: string;
  coreIdea?: string;
  reflectionQuestions?: ReflectionQuestion[];
  reflection?: { question: string; answer: string }[];
}

interface PartContent {
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
}

interface ParsedPlan {
  topicName: string;
  days: PartContent[];
}

interface CuratorViewProps {
  topic: Topic;
  messages: Message[];
}

const PRIOR_KNOWLEDGE_LEVELS = [
  { value: 'beginner' as const, label: 'Beginner', description: 'Explain everything from the ground up' },
  { value: 'intermediate' as const, label: 'Intermediate', description: 'I have some familiarity, build from there' },
  { value: 'advanced' as const, label: 'Advanced', description: 'Push deeper, skip the basics' },
];

const HOOK_ARCHETYPE_LABELS: Record<string, string> = {
  paradox: 'Paradox',
  everyday: 'Everyday',
  myth_bust: 'Myth-bust',
  question: 'Question',
  anecdote: 'Anecdote',
};

interface QuestionFlavor {
  key: string;
  label: string;
  instructions: string;
}

const QUESTION_FLAVORS: QuestionFlavor[] = [
  {
    key: 'classics',
    label: 'Classics',
    instructions:
      'This should be a famous, well-known question — the kind people actually want answered. A classic question that addresses genuine, enduring curiosity in this topic.',
  },
  {
    key: 'hidden-gems',
    label: 'Hidden gems',
    instructions:
      'Use a two-step approach: start with something familiar, then reveal unexpected depth. The question should feel niche but rewarding — something the user didn\'t know existed but will be glad they discovered.',
  },
  {
    key: 'weird-wonderful',
    label: 'Weird & wonderful',
    instructions:
      'The answer must be genuinely counterintuitive. The user should think they know the answer, but the truth is surprising or strange in a way they wouldn\'t expect.',
  },
  {
    key: 'cutting-edge',
    label: 'Cutting edge',
    instructions:
      'Touch on open problems, recent research breakthroughs, or active debates. A frontier question where the answer is still evolving.',
  },
];

const QUESTION_COUNT = 5;

const TEACHER_SYSTEM_PROMPT =
  'You are a helpful, patient teacher. The user is following a structured multi-part learning course. Answer their questions about the material they are studying. Be concise and conversational. If you need more context about what they are learning, ask — but try to be helpful with what you know.';

function tryParseJson<T>(content: string): T | null {
  let text = content.trim();
  const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function parseSuggestions(parsed: unknown): SuggestionCard[] | null {
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const items: SuggestionCard[] = [];
  for (const item of parsed) {
    if (typeof item === 'string') {
      items.push({ question: item, teaser: '', difficulty: 2 });
    } else if (
      typeof item === 'object' &&
      item !== null &&
      (typeof (item as Record<string, unknown>).question === 'string' || typeof (item as Record<string, unknown>).title === 'string')
    ) {
      const obj = item as Record<string, unknown>;
      items.push({
        question: (typeof obj.question === 'string' ? obj.question : obj.title) as string,
        teaser: typeof obj.teaser === 'string' ? obj.teaser : typeof obj.hint === 'string' ? obj.hint : '',
        difficulty: typeof obj.difficulty === 'number' ? Math.max(1, Math.min(3, Math.round(obj.difficulty))) : 2,
      });
    } else {
      return null;
    }
  }
  return items;
}

function parseOutline(parsed: unknown): CourseOutline | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  const courseTitle =
    typeof obj.courseTitle === 'string' ? obj.courseTitle
    : typeof obj.topicName === 'string' ? obj.topicName
    : typeof obj.course === 'string' ? obj.course
    : null;
  if (!courseTitle) return null;

  const answerSpine = typeof obj.answerSpine === 'string' ? obj.answerSpine : '';

  const rawParts = Array.isArray(obj.parts) ? (obj.parts as Record<string, unknown>[])
    : Array.isArray(obj.days) ? (obj.days as Record<string, unknown>[])
    : null;
  if (!rawParts || rawParts.length === 0) return null;

  const parts: OutlinePart[] = [];
  for (const p of rawParts) {
    const title = typeof p.title === 'string' ? p.title : typeof p.subTopic === 'string' ? p.subTopic : '';
    const coreIdea = typeof p.coreIdea === 'string' ? p.coreIdea : typeof p.description === 'string' ? p.description : '';
    const newInformation = typeof p.newInformation === 'string' ? p.newInformation : '';
    const hookArchetype = typeof p.hookArchetype === 'string' ? p.hookArchetype : 'question';
    const device = typeof p.device === 'string' ? p.device : 'story';
    if (!title) return null;
    parts.push({ title, coreIdea, newInformation, hookArchetype, device });
  }

  return { answerSpine, courseTitle, parts };
}

function normalizePart(d: RawPart, idx: number, outlineHookArchetype?: string): PartContent {
  const partNumber = typeof d.partNumber === 'number' ? d.partNumber : typeof d.dayNumber === 'number' ? d.dayNumber : idx + 1;

  let subTopic = typeof d.subTopic === 'string' ? d.subTopic : typeof d.title === 'string' ? d.title : `Part ${partNumber}`;
  subTopic = subTopic.replace(/^Part\s+\d+\s*[:—\-.]\s*/i, '').trim();

  let hook = typeof d.hook === 'string' && d.hook.trim() ? d.hook : '';
  if (!hook && typeof d.title === 'string') {
    const dashIdx = d.title.indexOf(' — ');
    if (dashIdx > 0) hook = d.title.slice(dashIdx + 3).trim();
    else {
      const colonIdx = d.title.indexOf(':');
      if (colonIdx > 0) hook = d.title.slice(colonIdx + 1).trim();
    }
  }
  if (!hook) hook = subTopic;

  const opener = typeof d.opener === 'string' ? d.opener : '';

  let summary = typeof d.summary === 'string' ? d.summary : typeof d.body === 'string' ? d.body : '';
  if (!summary && typeof d.description === 'string') summary = d.description;
  if (!summary && d.objective) {
    summary = typeof d.objective === 'string' ? d.objective : '';
    if (Array.isArray(d.topics)) summary += '\n\n### Key Concepts\n' + d.topics.map((t: string) => `- ${t}`).join('\n');
    if (Array.isArray(d.activities)) summary += '\n\n### Activities\n' + d.activities.map((a: string) => `- ${a}`).join('\n');
  }

  const links = ((): string[] => {
    const raw = Array.isArray(d.furtherReading) ? d.furtherReading
      : Array.isArray(d.resources) ? d.resources
      : Array.isArray(d.links) ? d.links
      : [];
    return raw.map((l: unknown) => {
      if (typeof l === 'string') return l;
      if (typeof l === 'object' && l !== null) {
        const lo = l as Record<string, unknown>;
        return typeof lo.url === 'string' ? lo.url : typeof lo.title === 'string' ? lo.title : '';
      }
      return '';
    }).filter(Boolean);
  })();

  const bridge =
    typeof d.bridge === 'string' && d.bridge.trim() ? d.bridge
    : typeof d.earwormQuestion === 'string' && d.earwormQuestion.trim() ? d.earwormQuestion
    : '';

  const keyTakeaway = typeof d.keyTakeaway === 'string' ? d.keyTakeaway : '';
  const hookArchetype = typeof d.hookArchetype === 'string' ? d.hookArchetype : (outlineHookArchetype ?? 'question');
  const estimatedReadingMinutes = typeof d.estimatedReadingMinutes === 'number' ? d.estimatedReadingMinutes : 3;

  if (summary && !summary.includes('\n\n') && summary.length > 200) {
    summary = summary.replace(/([.!?])\s+(?=[A-Z])/g, '$1\n\n');
  }

  const reflectionQuestions = ((): ReflectionQuestion[] => {
    const raw = d.reflection ?? d.reflectionQuestions;
    if (!Array.isArray(raw)) return [];
    return raw.map((rq: unknown): ReflectionQuestion => {
      if (typeof rq === 'string') return { question: rq, answer: '' };
      if (typeof rq === 'object' && rq !== null) {
        const rqo = rq as Record<string, unknown>;
        return {
          question: typeof rqo.question === 'string' ? rqo.question : '',
          answer: typeof rqo.answer === 'string' ? rqo.answer : '',
        };
      }
      return { question: '', answer: '' };
    }).filter((rq) => rq.question.length > 0);
  })();

  return { partNumber, subTopic, hook, opener, summary, links, bridge, keyTakeaway, hookArchetype, estimatedReadingMinutes, reflectionQuestions };
}

function normalizePlan(parsed: unknown): ParsedPlan | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  let obj = parsed as Record<string, unknown>;

  if (obj.course && typeof obj.course === 'object') {
    obj = obj.course as Record<string, unknown>;
  }

  const topicName =
    typeof obj.topicName === 'string' ? obj.topicName
    : typeof obj.courseTitle === 'string' ? obj.courseTitle
    : typeof obj.topic === 'string' ? obj.topic
    : typeof obj.title === 'string' ? obj.title
    : null;
  if (!topicName) return null;

  const rawParts =
    Array.isArray(obj.days) ? (obj.days as RawPart[])
    : Array.isArray(obj.parts) ? (obj.parts as RawPart[])
    : null;
  if (!rawParts || rawParts.length === 0) return null;

  return { topicName, days: rawParts.map((d, i) => normalizePart(d, i)) };
}

function isJsonOnlyMessage(content: string): boolean {
  const parsed = tryParseJson<unknown>(content);
  if (parsed === null) return false;
  return normalizePlan(parsed) !== null || parseSuggestions(parsed) !== null || parseOutline(parsed) !== null;
}

function isAutoMessage(content: string): boolean {
  return (
    content.startsWith('[CURATOR]') ||
    content.startsWith('Suggest 3') ||
    content.startsWith('I choose:')
  );
}

function renderLink(linkText: string): JSX.Element {
  const isUrl = /^https?:\/\//i.test(linkText);
  if (isUrl) {
    return (
      <Box display="flex" alignItems="center" gap={0.5}>
        <OpenInNewIcon sx={{ fontSize: '0.75rem', color: 'text.secondary' }} />
        <Typography variant="caption" component="a" href={linkText} target="_blank" rel="noopener noreferrer"
          sx={{ color: 'primary.main', wordBreak: 'break-all' }}>{linkText}</Typography>
        <Typography variant="caption" color="warning.main" sx={{ fontSize: '0.65rem', opacity: 0.7 }}>(unverified)</Typography>
      </Box>
    );
  }

  const searchQuery = encodeURIComponent(linkText);
  return (
    <Box display="flex" alignItems="center" gap={0.5}>
      <OpenInNewIcon sx={{ fontSize: '0.75rem', color: 'text.secondary' }} />
      <Typography variant="caption" component="a"
        href={`https://www.google.com/search?q=${searchQuery}`}
        target="_blank" rel="noopener noreferrer"
        sx={{ color: 'primary.main' }}>{linkText}</Typography>
    </Box>
  );
}

type GenerationPhase = 'idle' | 'outline' | 'part';

interface ModelTiming {
  count: number;
  averageMs: number;
  maxMs: number;
}

async function loadModelTimings(modelId: string): Promise<{ averageMs: number; maxMs: number }> {
  const setting = await athenaDb.userSettings.get('partGenTimings');
  const allTimings: Record<string, ModelTiming | undefined> =
    setting && typeof setting.value === 'object' ? (setting.value as Record<string, ModelTiming | undefined>) : {};
  const timing = allTimings[modelId];
  if (timing && timing.count > 0) {
    return { averageMs: timing.averageMs, maxMs: timing.maxMs };
  }
  return { averageMs: 12000, maxMs: 12000 };
}

async function recordPartTiming(modelId: string, elapsedMs: number): Promise<void> {
  const setting = await athenaDb.userSettings.get('partGenTimings');
  const allTimings: Record<string, ModelTiming | undefined> =
    setting && typeof setting.value === 'object' ? (setting.value as Record<string, ModelTiming | undefined>) : {};
  const current = allTimings[modelId] ?? { count: 0, averageMs: 0, maxMs: 0 };
  const newCount = current.count + 1;
  const newAverage = Math.round((current.averageMs * current.count + elapsedMs) / newCount);
  const newMax = Math.max(current.maxMs, elapsedMs);
  allTimings[modelId] = { count: newCount, averageMs: newAverage, maxMs: newMax };
  await athenaDb.userSettings.put({ id: 'partGenTimings', value: allTimings });
}

const CuratorView = ({ topic, messages }: CuratorViewProps): JSX.Element => {
  const theme = useTheme();
  const {
    loading,
    loadCyclesForTopic,
    getActiveCycle,
    getPartsForCycle,
    completePart,
    createCycle,
    saveCourseParts,
    updateCyclePhase,
    incrementCategoryCount,
    getCategoryCounts,
    addPickedQuestion,
    getPickedQuestions,
    getPastRatingsForContext,
  } = useCuratorStore();
  const { sending, sendMessageStream } = useChatStore();

  const [teacherMessages, setTeacherMessages] = useState<TeacherMessage[]>([]);
  const [teacherInput, setTeacherInput] = useState('');
  const [teacherSending, setTeacherSending] = useState(false);
  const [teacherStreaming, setTeacherStreaming] = useState('');
  const [teacherModel, setTeacherModel] = useState<ChatModel>(() => getDefaultModel());
  const teacherAbortRef = useRef<AbortController | null>(null);
  const teacherBottomRef = useRef<HTMLDivElement>(null);

  const [expandedReflections, setExpandedReflections] = useState<Record<string, boolean>>({});
  const [expandedParts, setExpandedParts] = useState<Record<string, boolean>>({});

  const [suggestionSlots, setSuggestionSlots] = useState<SuggestionSlot[] | null>(null);
  const [activeFlavors, setActiveFlavors] = useState<Set<string>>(
    () => new Set(QUESTION_FLAVORS.map((f) => f.key)),
  );
  const [customQuestion, setCustomQuestion] = useState('');
  const [selectedCategoryLabel, setSelectedCategoryLabel] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [priorKnowledgeLevel, setPriorKnowledgeLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate');
  const lastAssistantContent = useRef<string>('');
  const selectedQuestionRef = useRef<SuggestionCard | null>(null);
  const planSavedCycleId = useRef<string>('');
  const outlineRef = useRef<CourseOutline | null>(null);
  const creatingCycleRef = useRef<boolean>(false);
  const suggestionAbortRefs = useRef<AbortController[]>([]);
  const [genStage, setGenStage] = useState(0);
  const [genProgress, setGenProgress] = useState(0);
  const genTimerRef = useRef<number>(0);
  const genStartRef = useRef<number>(0);
  const prevGeneratingPhase = useRef<GenerationPhase>('idle');

  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [countsLoaded, setCountsLoaded] = useState(false);

  const [generatingPhase, setGeneratingPhase] = useState<GenerationPhase>('idle');
  const [generationError, setGenerationError] = useState<string>('');
  const generatingPartRef = useRef<number>(0);

  useEffect(() => {
    void loadCyclesForTopic(topic.id);
  }, [topic.id, loadCyclesForTopic]);

  useEffect(() => {
    void getCategoryCounts().then((counts) => {
      setCategoryCounts(counts);
      setCountsLoaded(true);
    });
  }, [getCategoryCounts]);

  useEffect(() => {
    teacherBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [teacherMessages.length, teacherStreaming]);

  const activeCycle = getActiveCycle(topic.id);
  const courseParts = activeCycle ? getPartsForCycle(activeCycle.id) : [];

  const completedCycle = !activeCycle && !loading
    ? useCuratorStore.getState().cycles.find(
        (c) => c.topicId === topic.id && (c.phase === 'completed' || c.phase === 'rated'),
      ) ?? null
    : null;
  const completedCourseParts = completedCycle ? getPartsForCycle(completedCycle.id) : [];

  const currentPart = courseParts.find((d) => !d.isCompleted);
  const completedCount = courseParts.filter((d) => d.isCompleted).length;
  const totalParts = courseParts.length;

  const displayParts = activeCycle ? courseParts : completedCourseParts;
  const isCompletedView = !activeCycle && completedCourseParts.length > 0;
  const displayCompletedCount = isCompletedView
    ? displayParts.filter((d) => d.isCompleted).length
    : completedCount;
  const displayTotalParts = isCompletedView ? displayParts.length : totalParts;

  // Expand current part on initial load only (track by ID to avoid re-expand on content changes)
  useEffect(() => {
    if (currentPart) {
      setExpandedParts((prev) => ({ ...prev, [currentPart.id]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPart?.id]);

  const nonDeletedMessages = useMemo(() => messages.filter((m) => !m.isDeleted), [messages]);

  const visibleChatMessages = useMemo(() => {
    if (generatingPhase !== 'idle') return [];
    return nonDeletedMessages.filter((m) => {
      if (isAutoMessage(m.content)) return false;
      if (isJsonOnlyMessage(m.content)) return false;
      return true;
    });
  }, [nonDeletedMessages, generatingPhase]);

  useEffect(() => {
    if (loading) return;
    const assistantMessages = nonDeletedMessages.filter((m) => m.type === 'assistant');
    if (assistantMessages.length > 0 && courseParts.length === 0 && activeCycle) {
      const last = assistantMessages[assistantMessages.length - 1];
      const parsed = tryParseJson<unknown>(last.content);
      if (parsed !== null) {
        const plan = normalizePlan(parsed);
        if (plan !== null && activeCycle.id !== planSavedCycleId.current) {
          planSavedCycleId.current = activeCycle.id;
          void (async (): Promise<void> => {
            await saveCourseParts(activeCycle.id, plan.days);
            await updateCyclePhase(activeCycle.id, 'active');
            void useTopicStore.getState().renameTopic(topic.id, plan.topicName);
          })();
        }
      }
    }
  }, [loading, nonDeletedMessages, courseParts.length, activeCycle, saveCourseParts, updateCyclePhase, topic.id]);

  const sortedSections = useMemo(() => {
    if (!countsLoaded) return LEARNING_SECTIONS;
    return LEARNING_SECTIONS.map((section) => ({
      ...section,
      categories: [...section.categories].sort((a, b) => {
        const countA = categoryCounts[a.id] || 0;
        const countB = categoryCounts[b.id] || 0;
        return countA - countB;
      }),
    }));
  }, [categoryCounts, countsLoaded]);

  const isGenerating = generatingPhase !== 'idle';

  const showCategoryGrid =
    !isGenerating && nonDeletedMessages.filter((m) => !isAutoMessage(m.content) && !isJsonOnlyMessage(m.content)).length === 0 &&
    ((!activeCycle && completedCourseParts.length === 0) || (activeCycle && courseParts.length === 0 && !suggestionSlots));

  const parseAssistantResponse = useCallback(
    (msg: Message): void => {
      if (msg.type !== 'assistant' || msg.content === lastAssistantContent.current) return;
      lastAssistantContent.current = msg.content;

      const parsed = tryParseJson<unknown>(msg.content);
      if (parsed === null) return;

      if (generatingPhase === 'outline') {
        const outline = parseOutline(parsed);
        if (outline !== null) {
          void (async (): Promise<void> => {
            if (!activeCycle) return;
            outlineRef.current = outline;
            const skeletonParts = outline.parts.map((p, i) => ({
              partNumber: i + 1,
              subTopic: p.title,
              hook: '',
              opener: '',
              summary: '',
              links: [],
              bridge: i < outline.parts.length - 1 ? '' : '',
              keyTakeaway: '',
              hookArchetype: p.hookArchetype,
              estimatedReadingMinutes: 0,
              reflectionQuestions: [],
              isCompleted: false,
            }));
            await saveCourseParts(activeCycle.id, skeletonParts);
            await useTopicStore.getState().renameTopic(topic.id, outline.courseTitle);
            await updateCyclePhase(activeCycle.id, 'active');
            setSuggestionSlots(null);
            setSelectedCategoryLabel('');

            // Auto-generate Part 1 after outline
            generatingPartRef.current = 1;
            setGeneratingPhase('part');
            void generatePartContent(1, outline, activeCycle.id);
          })();
          return;
        }
        // Fallback: try full plan parse
        const plan = normalizePlan(parsed);
        if (plan !== null && activeCycle && !planSavedCycleId.current) {
          planSavedCycleId.current = activeCycle.id;
          void (async (): Promise<void> => {
            await saveCourseParts(activeCycle.id, plan.days);
            await updateCyclePhase(activeCycle.id, 'active');
            void useTopicStore.getState().renameTopic(topic.id, plan.topicName);
            setSuggestionSlots(null);
            setSelectedCategoryLabel('');
            setGeneratingPhase('idle');
          })();
          return;
        }
      }

      if (generatingPhase === 'part') {
        return;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeCycle, courseParts, generatingPhase, saveCourseParts, updateCyclePhase, topic.id],
  );

  const generatePartContent = useCallback(
    async (partNum: number, outline: CourseOutline, cycleId: string, silent = false): Promise<void> => {
      const outlinePart = outline.parts[partNum - 1];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!outlinePart) {
        if (!silent) {
          setGenerationError('Part not found in outline. Please try again.');
          setGeneratingPhase('idle');
        }
        return;
      }

      try {
        const outlineSummary = outline.parts.map((p, i) => `${i + 1}. ${p.title} (${p.hookArchetype}) [${p.device}]`).join('\n');

        const coveredParts = outline.parts.slice(0, partNum - 1);
        const coveredSoFar = coveredParts.length > 0
          ? coveredParts
              .map((p, i) => `Part ${i + 1}: ${p.title}\n  Core idea: ${p.coreIdea}\n  New knowledge: ${p.newInformation}`)
              .join('\n')
          : '';

        const prompt = buildPartGenerationPrompt(
          partNum,
          outline.parts.length,
          outline.courseTitle,
          selectedQuestionRef.current?.question ?? outline.courseTitle,
          outlineSummary,
          outlinePart.hookArchetype,
          outlinePart.device,
          coveredSoFar,
        );

        const controller = new AbortController();
        let accumulated = '';
        const result = await askLlmStream(
          getDefaultModel(),
          1.0,
          [{ role: 'system', content: 'You are generating course content. Output ONLY the requested JSON.' }, { role: 'user', content: prompt }],
          (token: string): void => { accumulated += token; },
          undefined,
          undefined,
          false,
          controller.signal,
        );

        const finalContent = accumulated || result.content;
        const parsed = tryParseJson<unknown>(finalContent);
        if (parsed !== null && typeof parsed === 'object') {
          const generatedPart = normalizePart(parsed as RawPart, partNum - 1, outlinePart.hookArchetype);

          const freshParts = useCuratorStore.getState().getPartsForCycle(cycleId);
          const updatedParts = freshParts.map((d) => ({
            partNumber: d.dayNumber,
            subTopic: d.subTopic,
            hook: d.dayNumber === partNum ? generatedPart.hook : d.hook,
            opener: d.dayNumber === partNum ? generatedPart.opener : d.opener,
            summary: d.dayNumber === partNum ? generatedPart.summary : d.summary,
            links: d.dayNumber === partNum ? generatedPart.links : d.links,
            bridge: d.dayNumber === partNum ? generatedPart.bridge : d.bridge,
            keyTakeaway: d.dayNumber === partNum ? generatedPart.keyTakeaway : d.keyTakeaway,
            hookArchetype: d.dayNumber === partNum ? generatedPart.hookArchetype : d.hookArchetype,
            estimatedReadingMinutes: d.dayNumber === partNum ? generatedPart.estimatedReadingMinutes : d.estimatedReadingMinutes,
            reflectionQuestions: d.dayNumber === partNum ? generatedPart.reflectionQuestions : d.reflectionQuestions,
            isCompleted: d.isCompleted,
          }));

          await useCuratorStore.getState().saveCourseParts(cycleId, updatedParts);
          if (!silent) {
            setGeneratingPhase('idle');
          }

          if (!silent) {
            const nextNum = partNum + 1;
            if (nextNum <= outline.parts.length) {
              const nextFreshParts = useCuratorStore.getState().getPartsForCycle(cycleId);
              const nextP = nextFreshParts.find((d) => d.dayNumber === nextNum);
              if (nextP && !nextP.summary) {
                void generatePartContent(nextNum, outline, cycleId, true);
              }
            }
          }
        } else {
          throw new Error('Failed to parse generated part');
        }
      } catch (err: unknown) {
        console.error('[CuratorView] Failed to generate part', err);
        if (!silent) {
          setGenerationError('Failed to generate part content. Click Continue to retry.');
          setGeneratingPhase('idle');
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (generatingPhase !== 'outline' && generatingPhase !== 'part') return;
    const assistantMessages = nonDeletedMessages.filter((m) => m.type === 'assistant');
    if (assistantMessages.length > 0) {
      parseAssistantResponse(assistantMessages[assistantMessages.length - 1]);
    }
  }, [nonDeletedMessages, parseAssistantResponse, generatingPhase]);

  useEffect(() => {
    const prevPhase = prevGeneratingPhase.current;

    if ((prevPhase === 'outline' || prevPhase === 'part') && prevPhase !== generatingPhase && genStartRef.current) {
      const elapsed = Date.now() - genStartRef.current;
      void recordPartTiming(getDefaultModel().id, elapsed);
    }

    prevGeneratingPhase.current = generatingPhase;

    if (generatingPhase !== 'outline' && generatingPhase !== 'part') {
      setGenStage(0);
      setGenProgress(0);
      genStartRef.current = 0;
      return;
    }

    genStartRef.current = Date.now();
    setGenStage(1);
    setGenProgress(0);

    const controller = new AbortController();

    void (async (): Promise<void> => {
      const modelId = getDefaultModel().id;
      const { averageMs, maxMs } = await loadModelTimings(modelId);

      if (controller.signal.aborted) return;
      const firstDuration = Math.max(averageMs, 3000);
      const secondDuration = Math.max(maxMs - averageMs, 5000);

      let startTime = Date.now();
      genTimerRef.current = window.setInterval(() => {
        if (controller.signal.aborted) { clearInterval(genTimerRef.current); return; }
        const elapsed = Date.now() - startTime;
        const pct = Math.min((elapsed / firstDuration) * 100, 100);
        setGenProgress(pct);
        if (pct >= 100) {
          clearInterval(genTimerRef.current);
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (controller.signal.aborted) return;
          setGenStage(2);
          setGenProgress(0);
          startTime = Date.now();
          genTimerRef.current = window.setInterval(() => {
            if (controller.signal.aborted) { clearInterval(genTimerRef.current); return; }
            const elapsed2 = Date.now() - startTime;
            const pct2 = Math.min((elapsed2 / secondDuration) * 100, 100);
            setGenProgress(pct2);
            if (pct2 >= 100) {
              clearInterval(genTimerRef.current);
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
              if (!controller.signal.aborted) {
                setGenStage(3);
              }
            }
          }, 100);
        }
      }, 100);
    })();

    return () => {
      controller.abort();
      clearInterval(genTimerRef.current);
    };
  }, [generatingPhase]);

  useEffect(() => {
    if (!sending && generatingPhase === 'outline') {
      const timer = setTimeout(() => {
        setGenerationError('The LLM did not return structured data. Try again or pick a different topic.');
        setGeneratingPhase('idle');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [sending, generatingPhase]);

  useEffect(() => {
    if (generationError) {
      const timer = setTimeout(() => setGenerationError(''), 8000);
      return () => clearTimeout(timer);
    }
  }, [generationError]);

  const handleCategoryClick = async (category: LearningCategory, sectionTitle: string): Promise<void> => {
    await incrementCategoryCount(category.id);
    setCategoryCounts((prev) => ({ ...prev, [category.id]: (prev[category.id] ?? 0) + 1 }));
    setSelectedCategoryLabel(category.label);
    setSelectedCategoryId(category.id);
    setCustomQuestion('');

    const picked = await getPickedQuestions();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const alreadyPicked = picked[category.id] ?? [];
    const exclusionLines = alreadyPicked.length > 0
      ? `\n\nDo NOT suggest any of these questions that were already picked in this category:\n${alreadyPicked.map(q => `- ${q}`).join('\n')}\n\nSuggest NEW questions that have NOT been suggested before.`
      : '';

    const { ratingsContext } = await getPastRatingsForContext();

    if (!activeCycle && !creatingCycleRef.current) {
      creatingCycleRef.current = true;
      outlineRef.current = null;
      await createCycle(topic.id, topic.name || 'New Course', '');
      creatingCycleRef.current = false;
    }

    // Abort any in-flight suggestion requests
    suggestionAbortRefs.current.forEach((c) => c.abort());
    suggestionAbortRefs.current = [];

    const initialSlots: SuggestionSlot[] = Array.from({ length: QUESTION_COUNT }, () => ({
      status: 'loading' as const,
      card: null,
    }));
    setSuggestionSlots(initialSlots);
    setGeneratingPhase('idle');

    const flavorKeys = Array.from(activeFlavors);
    const controllers: AbortController[] = [];

    initialSlots.forEach((_slot, index) => {
      const controller = new AbortController();
      controllers.push(controller);

      const flavor = QUESTION_FLAVORS.find((f) => f.key === flavorKeys[index % flavorKeys.length]) ?? QUESTION_FLAVORS[0];

      const prompt = buildSingleQuestionPrompt(
        category.label, sectionTitle, flavor.key, flavor.instructions, exclusionLines, ratingsContext, priorKnowledgeLevel,
      );

      void (async (): Promise<void> => {
        try {
          let accumulated = '';
          const result = await askLlmStream(
            getQuestionGenModel(),
            1.0,
            [{ role: 'system', content: 'You generate a single learning question. Output ONLY a JSON object. No markdown, no preamble.' }, { role: 'user', content: prompt }],
            (token: string): void => { accumulated += token; },
            undefined,
            undefined,
            false,
            controller.signal,
          );
          const finalContent = accumulated || result.content;
          const parsed = tryParseJson<unknown>(finalContent);
          if (parsed !== null && typeof parsed === 'object') {
            const obj = parsed as Record<string, unknown>;
            setSuggestionSlots((prev) =>
              prev
                ? prev.map((s, i) =>
                    i === index
                      ? {
                          status: 'done' as const,
                          card: {
                            question: typeof obj.question === 'string' || typeof obj.title === 'string'
                              ? ((obj.question || obj.title) as string)
                              : '',
                            teaser: typeof obj.teaser === 'string' ? obj.teaser : '',
                            difficulty: typeof obj.difficulty === 'number' ? Math.max(1, Math.min(3, Math.round(obj.difficulty))) : 2,
                          },
                        }
                      : s,
                  )
                : null,
            );
          } else {
            setSuggestionSlots((prev) =>
              prev ? prev.map((s, i) => (i === index ? { status: 'error', card: null } : s)) : null,
            );
          }
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          console.error('[CuratorView] Failed to generate single question', err);
          setSuggestionSlots((prev) =>
            prev ? prev.map((s, i) => (i === index ? { status: 'error', card: null } : s)) : null,
          );
        }
      })();
    });

    suggestionAbortRefs.current = controllers;
  };

  const handleRegenerateCard = (index: number): void => {
    const slot = suggestionSlots?.[index];
    if (!slot) return;
    const existingQuestion = slot.card?.question;

    void getPickedQuestions().then((picked) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const alreadyPicked = picked[selectedCategoryId] ?? [];
      const allExcluded = existingQuestion ? [...alreadyPicked, existingQuestion] : alreadyPicked;
      const exclusionLines = allExcluded.length > 0
        ? `\n\nDo NOT suggest any of these questions (they were already shown or picked):\n${allExcluded.map(q => `- ${q}`).join('\n')}`
        : '';

      void getPastRatingsForContext().then(async ({ ratingsContext }) => {
        const flavorKeys = Array.from(activeFlavors);
        const flavor = QUESTION_FLAVORS.find((f) => f.key === flavorKeys[index % flavorKeys.length]) ?? QUESTION_FLAVORS[0];

        const prompt = buildSingleQuestionPrompt(
          selectedCategoryLabel || 'the topic', '', flavor.key, flavor.instructions, exclusionLines, ratingsContext, priorKnowledgeLevel,
        );

        // Set slot to loading
        setSuggestionSlots((prev) =>
          prev ? prev.map((s, i) => (i === index ? { status: 'loading', card: null } : s)) : null,
        );

        const controller = new AbortController();
        try {
          let accumulated = '';
          const result = await askLlmStream(
            getQuestionGenModel(),
            1.0,
            [{ role: 'system', content: 'You generate a single learning question. Output ONLY a JSON object. No markdown, no preamble.' }, { role: 'user', content: prompt }],
            (token: string): void => { accumulated += token; },
            undefined, undefined, false, controller.signal,
          );
          const finalContent = accumulated || result.content;
          const parsed = tryParseJson<unknown>(finalContent);
          if (parsed !== null && typeof parsed === 'object') {
            const obj = parsed as Record<string, unknown>;
            setSuggestionSlots((prev) =>
              prev
                ? prev.map((s, i) =>
                    i === index
                      ? {
                          status: 'done' as const,
                          card: {
                            question: typeof obj.question === 'string' || typeof obj.title === 'string'
                              ? ((obj.question || obj.title) as string)
                              : '',
                            teaser: typeof obj.teaser === 'string' ? obj.teaser : '',
                            difficulty: typeof obj.difficulty === 'number' ? Math.max(1, Math.min(3, Math.round(obj.difficulty))) : 2,
                          },
                        }
                      : s,
                  )
                : null,
            );
          } else {
            setSuggestionSlots((prev) =>
              prev ? prev.map((s, i) => (i === index ? { status: 'error', card: null } : s)) : null,
            );
          }
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setSuggestionSlots((prev) =>
            prev ? prev.map((s, i) => (i === index ? { status: 'error', card: null } : s)) : null,
          );
        }
      });
    });
  };

  const handleRegenerateAll = (): void => {
    suggestionAbortRefs.current.forEach((c) => c.abort());
    suggestionAbortRefs.current = [];

    void getPickedQuestions().then((picked) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const alreadyPicked = picked[selectedCategoryId] ?? [];
      const currentQuestions = (suggestionSlots ?? [])
        .map((s) => s.card?.question)
        .filter((q): q is string => !!q);
      const allExcluded = [...alreadyPicked, ...currentQuestions];
      const exclusionLines = allExcluded.length > 0
        ? `\n\nDo NOT suggest any of these questions (they were already shown or picked):\n${allExcluded.map(q => `- ${q}`).join('\n')}`
        : '';

      void getPastRatingsForContext().then(({ ratingsContext }) => {
        const loadingSlots: SuggestionSlot[] = Array.from({ length: QUESTION_COUNT }, () => ({
          status: 'loading' as const,
          card: null,
        }));
        setSuggestionSlots(loadingSlots);

        const flavorKeys = Array.from(activeFlavors);
        const controllers: AbortController[] = [];

        loadingSlots.forEach((_slot, index) => {
          const controller = new AbortController();
          controllers.push(controller);
          const flavor = QUESTION_FLAVORS.find((f) => f.key === flavorKeys[index % flavorKeys.length]) ?? QUESTION_FLAVORS[0];

          const prompt = buildSingleQuestionPrompt(
            selectedCategoryLabel || 'the topic', '', flavor.key, flavor.instructions, exclusionLines, ratingsContext, priorKnowledgeLevel,
          );

          void (async (): Promise<void> => {
            try {
              let accumulated = '';
              const result = await askLlmStream(
                getQuestionGenModel(),
                1.0,
                [{ role: 'system', content: 'You generate a single learning question. Output ONLY a JSON object. No markdown, no preamble.' }, { role: 'user', content: prompt }],
                (token: string): void => { accumulated += token; },
                undefined, undefined, false, controller.signal,
              );
              const finalContent = accumulated || result.content;
              const parsed = tryParseJson<unknown>(finalContent);
              if (parsed !== null && typeof parsed === 'object') {
                const obj = parsed as Record<string, unknown>;
                setSuggestionSlots((prev) =>
                  prev
                    ? prev.map((s, i) =>
                        i === index
                          ? {
                              status: 'done' as const,
                              card: {
                                question: typeof obj.question === 'string' || typeof obj.title === 'string'
                                  ? ((obj.question || obj.title) as string)
                                  : '',
                                teaser: typeof obj.teaser === 'string' ? obj.teaser : '',
                                difficulty: typeof obj.difficulty === 'number' ? Math.max(1, Math.min(3, Math.round(obj.difficulty))) : 2,
                              },
                            }
                          : s,
                      )
                    : null,
                );
              } else {
                setSuggestionSlots((prev) =>
                  prev ? prev.map((s, i) => (i === index ? { status: 'error', card: null } : s)) : null,
                );
              }
            } catch (err: unknown) {
              if (err instanceof DOMException && err.name === 'AbortError') return;
              console.error('[CuratorView] Failed to regenerate question', err);
              setSuggestionSlots((prev) =>
                prev ? prev.map((s, i) => (i === index ? { status: 'error', card: null } : s)) : null,
              );
            }
          })();
        });

        suggestionAbortRefs.current = controllers;
      });
    });
  };

  const handleTopicSelect = async (suggestion: SuggestionCard): Promise<void> => {
    suggestionAbortRefs.current.forEach((c) => c.abort());
    suggestionAbortRefs.current = [];
    setSuggestionSlots(null);
    selectedQuestionRef.current = suggestion;

    if (activeCycle) {
      await useCuratorStore.getState().updateCyclePriorKnowledge(activeCycle.id, priorKnowledgeLevel);
    } else {
      await createCycle(topic.id, topic.name || 'New Course', '', priorKnowledgeLevel);
    }

    setGeneratingPhase('outline');

    const { completedCourseNames } = await getPastRatingsForContext();

    const prompt = buildCourseOutlinePrompt(
      suggestion.question,
      priorKnowledgeLevel,
      completedCourseNames,
    );

    void addPickedQuestion(selectedCategoryId, suggestion.question);
    void sendMessageStream(`[CURATOR]\n\n${prompt}`, topic.id);
  };

  const handleCustomQuestionSubmit = (): void => {
    const q = customQuestion.trim();
    if (!q) return;
    setCustomQuestion('');
    const card: SuggestionCard = { question: q, teaser: '', difficulty: 2 };
    void handleTopicSelect(card);
  };

  const handleCompletePart = (partId: string): void => {
    const part = courseParts.find((d) => d.id === partId);
    if (!part) return;

    const cycleId = activeCycle?.id;
    if (!cycleId) {
      setGenerationError('Course not found. Please refresh and try again.');
      return;
    }

    // Reconstruct outline from stored parts if ref is null (e.g. after page refresh)
    let outline = outlineRef.current;
    if (!outline && courseParts.length > 0) {
      outline = {
        answerSpine: '',
        courseTitle: activeCycle.topicName || topic.name,
        parts: courseParts.map((p) => ({
          title: p.subTopic,
          coreIdea: '',
          newInformation: '',
          hookArchetype: p.hookArchetype,
          device: 'story',
        })),
      };
      outlineRef.current = outline;
    }
    if (!outline) {
      setGenerationError('Course outline not found. Please refresh and try again.');
      return;
    }

    // If current part is a skeleton, generate it first, then auto-complete after
    if (!part.summary) {
      const safeOutline = outline;
      setGeneratingPhase('part');
      generatingPartRef.current = part.dayNumber;
      void generatePartContent(part.dayNumber, safeOutline, cycleId).then(() => {
        void completePart(partId);
        if (part.dayNumber >= totalParts) {
          void updateCyclePhase(cycleId, 'completed');
          void useTopicStore.getState().updateTopicTimestamp(topic.id);
        }
        const freshParts = useCuratorStore.getState().getPartsForCycle(cycleId);
        const nextP = freshParts.find((d) => d.dayNumber === part.dayNumber + 1);
        if (nextP && !nextP.summary) {
          setGeneratingPhase('part');
          generatingPartRef.current = nextP.dayNumber;
          void generatePartContent(nextP.dayNumber, safeOutline, cycleId);
        }
      });
      return;
    }

    // Mark current part complete
    void completePart(partId);

    const isLastPart = part.dayNumber >= totalParts;
    if (isLastPart) {
      void updateCyclePhase(cycleId, 'completed');
      void useTopicStore.getState().updateTopicTimestamp(topic.id);
    }

    // Generate next part if it's a skeleton
    const nextPart = courseParts.find((d) => d.dayNumber === part.dayNumber + 1);
    if (nextPart && !nextPart.summary) {
      setGeneratingPhase('part');
      generatingPartRef.current = nextPart.dayNumber;
      void generatePartContent(nextPart.dayNumber, outline, cycleId);
    } else {
      // Next part is already ready — prefetch the one after if needed
      const nextNextPart = courseParts.find((d) => d.dayNumber === part.dayNumber + 2);
      if (nextNextPart && !nextNextPart.summary) {
        void generatePartContent(nextNextPart.dayNumber, outline, cycleId, true);
      }
    }
  };

  const handleTeacherSend = async (): Promise<void> => {
    const content = teacherInput.trim();
    if (!content || teacherSending) return;
    setTeacherInput('');

    const userMsg: TeacherMessage = { id: crypto.randomUUID(), role: 'user', content };
    const assistantId = crypto.randomUUID();
    setTeacherMessages((prev) => [...prev, userMsg]);
    setTeacherSending(true);
    setTeacherStreaming('');

    const controller = new AbortController();
    teacherAbortRef.current = controller;

    let accumulated = '';
    try {
      const llmMessages: LlmMessage[] = [{ role: 'system', content: TEACHER_SYSTEM_PROMPT }];

      if (activeCycle) {
        const contextLines = [
          `Current topic: "${activeCycle.topicName}"`,
          currentPart
            ? `Current part: Part ${currentPart.dayNumber} of ${totalParts} — "${currentPart.subTopic}"`
            : `Progress: ${completedCount}/${totalParts} parts completed`,
        ];
        if (currentPart?.summary) {
          contextLines.push(`Current part summary:\n${currentPart.summary}`);
        }
        if (courseParts.length > 0) {
          contextLines.push(
            'Parts covered: ' + courseParts.filter((d) => d.isCompleted).map((d) => d.subTopic).join(', '),
          );
        }
        llmMessages.push({ role: 'system', content: contextLines.join('\n') });
      }

      for (const msg of teacherMessages) llmMessages.push({ role: msg.role, content: msg.content });
      llmMessages.push({ role: 'user', content });

      const result = await askLlmStream(
        teacherModel, 1.0, llmMessages,
        (token: string): void => { accumulated += token; setTeacherStreaming(accumulated); },
        undefined, undefined, false, controller.signal,
      );

      const finalContent = accumulated || result.content;
      setTeacherMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: finalContent }]);
      setTeacherStreaming('');
      setTeacherSending(false);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setTeacherMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: accumulated !== '' ? accumulated : 'Response cancelled.' }]);
      } else {
        console.error('[CuratorView] Teacher request failed', err);
        setTeacherMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: 'Failed to get response. Please try again.' }]);
      }
      setTeacherStreaming('');
      setTeacherSending(false);
    }
  };

  const handleTeacherKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleTeacherSend(); }
  };

  const toggleReflection = (partId: string, qIndex: number): void => {
    const key = `${partId}-${qIndex}`;
    setExpandedReflections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const togglePart = (partId: string): void => {
    setExpandedParts((prev) => ({ ...prev, [partId]: !prev[partId] }));
  };

  const difficultyDots = (level: number): JSX.Element => (
    <Box display="flex" gap={0.3} alignItems="center">
      {[1, 2, 3].map((dot) => (
        <Box key={dot} sx={{ width: 6, height: 6, borderRadius: '50%',
          bgcolor: dot <= level ? 'primary.main' : theme.palette.action.disabledBackground }} />
      ))}
    </Box>
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100%">
        <CircularProgress size={32} />
      </Box>
    );
  }

  return (
    <Box display="flex" flexDirection="column" height="100%" overflow="hidden">
      <Box display="flex" flexGrow={1} minHeight={0} sx={{ flexDirection: { xs: 'column', md: 'row' } }}>
        <Box
          display="flex" flexDirection="column" flexBasis="55%" minWidth={0} height="100%" overflow="auto"
          sx={{ borderRight: `1px solid ${theme.palette.divider}` }}
        >
          {/* Generation loader */}
          {isGenerating && (
            <Box
              display="flex" flexDirection="column" alignItems="center" justifyContent="center"
              flexGrow={1} px={3} color="text.secondary" textAlign="center"
            >
              {genStage < 3 && (
                <Box width="75%" maxWidth={300} mb={2}>
                  <LinearProgress variant="determinate" value={genProgress}
                    sx={{ height: 6, borderRadius: 3 }} />
                </Box>
              )}
              <Typography variant="body2">
                {generatingPhase === 'outline' && genStage === 1 && 'Creating your course outline...'}
                {generatingPhase === 'outline' && genStage === 2 && 'Still structuring the outline...'}
                {generatingPhase === 'outline' && genStage >= 3 && 'Still working — it will be done soon.'}
                {generatingPhase === 'part' && genStage === 1 && `Generating Part ${generatingPartRef.current}...`}
                {generatingPhase === 'part' && genStage === 2 && 'Still working — connecting ideas and finding the right examples...'}
                {generatingPhase === 'part' && genStage >= 3 && 'Still working — it will be done soon.'}
              </Typography>
            </Box>
          )}

          {generationError && !isGenerating && (
            <Box px={2} pt={1} pb={0.5}>
              <Typography variant="body2" color="warning.main" fontWeight={600}>{generationError}</Typography>
            </Box>
          )}

          {!isGenerating && (
            <>
          {/* Category selection grid */}
          {showCategoryGrid && countsLoaded && (
            <Box px={2} pt={2} pb={1} flexShrink={0}>
              <Box display="flex" alignItems="center" gap={0.5} mb={2}>
                <LightbulbOutlinedIcon sx={{ fontSize: '1.1rem', color: 'warning.main' }} />
                <Typography variant="subtitle2" fontWeight="bold">What would you like to learn?</Typography>
              </Box>

              <Box display="flex" flexWrap="wrap" alignItems="center" gap={0.5} mb={2}>
                <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mr: 0.5 }}>
                  {activeFlavors.size === QUESTION_FLAVORS.length ? 'Mix' : 'Flavor'}
                </Typography>
                {QUESTION_FLAVORS.map((flavor) => (
                  <Chip
                    key={flavor.key}
                    label={flavor.label}
                    size="small"
                    variant={activeFlavors.has(flavor.key) ? 'filled' : 'outlined'}
                    color={activeFlavors.has(flavor.key) ? 'primary' : 'default'}
                    onClick={(): void => {
                      setActiveFlavors((prev) => {
                        const next = new Set(prev);
                        if (next.has(flavor.key)) {
                          if (next.size > 1) next.delete(flavor.key);
                        } else {
                          next.add(flavor.key);
                        }
                        return next;
                      });
                    }}
                    sx={{ fontWeight: 500, cursor: 'pointer' }}
                  />
                ))}
              </Box>

              <Box display="flex" flexWrap="wrap" alignItems="center" gap={0.5} mb={2}>
                <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mr: 0.5 }}>
                  Level
                </Typography>
                {PRIOR_KNOWLEDGE_LEVELS.map((level) => (
                  <Chip
                    key={level.value}
                    label={level.label}
                    size="small"
                    variant={priorKnowledgeLevel === level.value ? 'filled' : 'outlined'}
                    color={priorKnowledgeLevel === level.value ? 'primary' : 'default'}
                    onClick={(): void => { setPriorKnowledgeLevel(level.value); }}
                    sx={{ fontWeight: 500, cursor: 'pointer' }}
                  />
                ))}
              </Box>

              {sortedSections.map((section) => (
                <Box key={section.title} mb={2}>
                  <Typography variant="caption" fontWeight="bold" color="text.secondary"
                    sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.75, display: 'block' }}>
                    {section.title}
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(auto-fill, minmax(130px, 1fr))' }, gap: 0.75 }}>
                    {section.categories.map((cat) => (
                      <Chip key={cat.id} label={cat.label} variant="outlined"
                        onClick={(): void => { void handleCategoryClick(cat, section.title); }}
                        sx={{ width: '100%', borderColor: theme.palette.divider, bgcolor: 'background.paper',
                          fontWeight: 500, cursor: 'pointer', '&:hover': { borderColor: 'primary.main', bgcolor: theme.palette.action.hover } }} />
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
          )}

          {/* Interactive suggestion cards */}
          {suggestionSlots && suggestionSlots.length > 0 && (
            <Box px={2} pt={2} pb={1} sx={{ borderBottom: `1px solid ${theme.palette.divider}`, flexShrink: 0 }}>
              <Box display="flex" alignItems="center" flexWrap="wrap" gap={0.5} mb={1.5}>
                <LightbulbOutlinedIcon sx={{ fontSize: '1.1rem', color: 'warning.main' }} />
                <Typography variant="subtitle2" fontWeight="bold">
                  {selectedCategoryLabel ? `${selectedCategoryLabel}: pick a topic` : 'Pick a topic'}
                </Typography>
                {QUESTION_FLAVORS.map((flavor) => {
                  const isActive = activeFlavors.has(flavor.key);
                  return (
                    <Chip
                      key={flavor.key}
                      label={flavor.label}
                      size="small"
                      variant={isActive ? 'filled' : 'outlined'}
                      color={isActive ? 'primary' : 'default'}
                      onClick={(e: React.MouseEvent): void => {
                        e.stopPropagation();
                        setActiveFlavors((prev) => {
                          const next = new Set(prev);
                          if (next.has(flavor.key)) {
                            if (next.size > 1) next.delete(flavor.key);
                          } else {
                            next.add(flavor.key);
                          }
                          return next;
                        });
                      }}
                      sx={{ fontWeight: 500, cursor: 'pointer', ml: 0.5 }}
                    />
                  );
                })}
                <Box component="span" sx={{ width: 8, flexShrink: 0 }} />
                {PRIOR_KNOWLEDGE_LEVELS.map((level) => (
                  <Chip
                    key={level.value}
                    label={level.label}
                    size="small"
                    variant={priorKnowledgeLevel === level.value ? 'filled' : 'outlined'}
                    color={priorKnowledgeLevel === level.value ? 'primary' : 'default'}
                    onClick={(e: React.MouseEvent): void => {
                      e.stopPropagation();
                      setPriorKnowledgeLevel(level.value);
                    }}
                    sx={{ fontWeight: 500, cursor: 'pointer' }}
                  />
                ))}
                <Tooltip title="Regenerate all questions">
                  <IconButton size="small" onClick={(): void => { handleRegenerateAll(); }} sx={{ ml: 'auto' }}>
                    <RefreshIcon sx={{ fontSize: '0.9rem' }} />
                  </IconButton>
                </Tooltip>
              </Box>
              <Box display="flex" flexDirection="column" gap={1}>
                {suggestionSlots.map((slot, idx) => (
                  <Card key={idx} variant="elevation" elevation={1}
                    sx={{ borderLeft: `3px solid ${slot.card ? theme.palette.primary.main : theme.palette.divider}`, bgcolor: 'background.paper',
                      transition: 'box-shadow 0.2s, border-color 0.2s',
                      '&:hover': slot.card ? { elevation: 3, borderLeft: `3px solid ${theme.palette.primary.dark}` } : {} }}>
                    {slot.status === 'loading' && (
                      <CardContent sx={{ py: 2, px: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Box display="flex" alignItems="center" gap={1.5}>
                          <CircularProgress size={16} />
                          <Typography variant="body2" color="text.secondary">Generating...</Typography>
                        </Box>
                      </CardContent>
                    )}
                    {slot.status === 'error' && (
                      <CardContent sx={{ py: 1.5, px: 2 }}>
                        <Typography variant="body2" color="error.main" gutterBottom>Failed to generate question.</Typography>
                        <Chip icon={<RefreshIcon />} label="Regenerate" size="small" variant="outlined" color="primary"
                          onClick={(): void => { handleRegenerateCard(idx); }} sx={{ cursor: 'pointer' }} />
                      </CardContent>
                    )}
                    {slot.status === 'done' && slot.card && (
                      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                      <CardActionArea onClick={(): void => { void handleTopicSelect(slot.card!); }}>
                        <CardContent sx={{ py: 1.5, px: 2 }}>
                          <Typography variant="body1" fontWeight="bold" gutterBottom>{slot.card.question}</Typography>
                          {slot.card.teaser && (
                            <Typography variant="body2" color="text.secondary" gutterBottom>{slot.card.teaser}</Typography>
                          )}
                          <Box display="flex" alignItems="center" justifyContent="space-between">
                            <Box display="flex" alignItems="center" gap={1}>
                              {difficultyDots(slot.card.difficulty)}
                              <Typography variant="caption" color="text.secondary">
                                {['Beginner', 'Intermediate', 'Advanced'][slot.card.difficulty - 1] ?? 'Intermediate'}
                              </Typography>
                            </Box>
                            <IconButton size="small" onClick={(e): void => { e.stopPropagation(); handleRegenerateCard(idx); }}
                              title="Regenerate this question">
                              <RefreshIcon sx={{ fontSize: '0.9rem' }} />
                            </IconButton>
                          </Box>
                        </CardContent>
                      </CardActionArea>
                    )}
                  </Card>
                ))}
              </Box>
              <Box display="flex" alignItems="center" gap={0.5} mt={1.5} pt={1} sx={{ borderTop: `1px solid ${theme.palette.divider}` }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Or write your own question..."
                  value={customQuestion}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>): void => { setCustomQuestion(e.target.value); }}
                  onKeyDown={(e: React.KeyboardEvent): void => { if (e.key === 'Enter') handleCustomQuestionSubmit(); }}
                  sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.875rem' } }}
                />
                <IconButton color="primary" onClick={(): void => { handleCustomQuestionSubmit(); }}
                  disabled={!customQuestion.trim()} size="small">
                  <SendIcon />
                </IconButton>
              </Box>
            </Box>
          )}

          {/* Curriculum dashboard */}
          {displayParts.length > 0 && (
            <Box px={2} pt={1.5} pb={1} sx={{ borderBottom: `1px solid ${theme.palette.divider}`, flexShrink: 0 }}>
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
                {topic.name || activeCycle?.topicName || completedCycle?.topicName}
              </Typography>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                <Typography variant="caption" color="text.secondary">{displayCompletedCount}/{displayTotalParts} completed</Typography>
              </Box>
              <Box display="flex" gap={0.5} mb={1.5}>
                {displayParts.map((part) => (
                  <Box key={part.id} sx={{ flex: 1, height: 6, borderRadius: 3,
                    bgcolor: part.isCompleted ? 'primary.main' : theme.palette.action.disabledBackground }}
                    title={`Part ${part.dayNumber}: ${part.subTopic}${part.isCompleted ? ' (completed)' : ''}`} />
                ))}
              </Box>

              {displayParts.map((part, idx) => {
                const isCompleted = part.isCompleted;
                const isCurrent = !isCompleted && idx === displayParts.findIndex((d) => !d.isCompleted);
                const isLocked = !isCompleted && !isCurrent;
                const isExpanded = isCompletedView || isCurrent || (expandedParts[part.id] || false);
                const isSkeleton = !part.summary;
                const isLastPart = part.dayNumber >= displayTotalParts;
                const nextPartReady = !isLastPart && (displayParts.find((d) => d.dayNumber === part.dayNumber + 1)?.summary ?? '') !== '';

                return (
                  <Box key={part.id} mb={1}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" p={1}
                      sx={{ bgcolor: isLocked ? 'transparent' : theme.palette.action.hover,
                        borderRadius: isExpanded && !isLocked ? '8px 8px 0 0' : 2,
                        cursor: isLocked ? 'default' : 'pointer', opacity: isLocked ? 0.45 : 1,
                        '&:hover': isLocked ? {} : { bgcolor: theme.palette.action.selected } }}
                      onClick={isLocked ? undefined : (): void => { togglePart(part.id); }}>
                      <Box display="flex" alignItems="center" gap={0.75}>
                        {isLocked ? (
                          <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.8rem', mr: 0.25 }}>—</Typography>
                        ) : isExpanded ? (
                          <ExpandLessIcon sx={{ fontSize: '0.9rem', color: 'text.secondary' }} />
                        ) : (
                          <ExpandMoreIcon sx={{ fontSize: '0.9rem', color: 'text.secondary' }} />
                        )}
                        {isCompleted && (
                          <Typography variant="caption" color="primary.main" fontWeight="bold" sx={{ mr: 0.25 }}>✓</Typography>
                        )}
                        <Typography
                          variant="body2"
                          fontWeight={isCurrent ? 700 : 500}
                          noWrap
                          sx={{ flex: 1, minWidth: 0 }}
                        >
                          {`Part ${part.dayNumber}: ${part.subTopic}`}
                        </Typography>
                      </Box>
                    </Box>
                    <Collapse in={isExpanded && !isLocked}>
                      <Box p={1.5} sx={{ bgcolor: theme.palette.action.hover, borderRadius: '0 0 8px 8px', borderTop: `1px solid ${theme.palette.divider}` }}>
                        {isSkeleton ? (
                          <Typography variant="body2" color="text.secondary" fontStyle="italic">
                            Content will be generated when you reach this part.
                          </Typography>
                        ) : (
                          <>
                            {/* Meta: reading time + archetype */}
                            <Box display="flex" alignItems="center" gap={1} mb={1}>
                              <Box display="flex" alignItems="center" gap={0.3}>
                                <AccessTimeIcon sx={{ fontSize: '0.75rem', color: 'text.secondary' }} />
                                <Typography variant="caption" color="text.secondary">
                                  ~{part.estimatedReadingMinutes || 3} min read
                                </Typography>
                              </Box>
                              {part.hookArchetype && part.hookArchetype !== 'question' && (
                                <Chip label={HOOK_ARCHETYPE_LABELS[part.hookArchetype] || part.hookArchetype}
                                  size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
                              )}
                            </Box>

                            {part.hook && part.hook !== part.subTopic && (
                              <Typography variant="body2" fontWeight={700} color="primary.main" mb={1}>
                                {part.hook}
                              </Typography>
                            )}
                            {part.opener && (
                              <Typography variant="body2" fontWeight={500} color="text.secondary" fontStyle="italic" mb={1.5}>{part.opener}</Typography>
                            )}
                            <Typography variant="body2" fontWeight="bold" color="text.secondary" gutterBottom>{part.subTopic}</Typography>
                            <Box mb={1}><MarkdownWithCode>{part.summary}</MarkdownWithCode></Box>

                            {/* Key Takeaway */}
                            {part.keyTakeaway && (
                              <Box mb={1.5} p={1} sx={{ bgcolor: theme.palette.primary.main + '14', borderRadius: 1, borderLeft: `3px solid ${theme.palette.primary.main}` }}>
                                <Typography variant="caption" fontWeight="bold" color="primary.main" display="block" mb={0.25}>
                                  Key Takeaway
                                </Typography>
                                <Box sx={{ '& p': { my: 0, fontSize: '0.875rem' } }}><MarkdownWithCode>{part.keyTakeaway}</MarkdownWithCode></Box>
                              </Box>
                            )}

                            {/* Links / Further Reading */}
                            {part.links.length > 0 && (
                              <Box mb={1.5}>
                                <Typography variant="caption" fontWeight="bold" color="text.secondary" gutterBottom display="block">Further Reading</Typography>
                                {part.links.map((link, i) => (
                                  <Box key={i}>{renderLink(link)}</Box>
                                ))}
                              </Box>
                            )}

                            {/* Bridge */}
                            {part.bridge && (
                              <Box mb={1.5} p={1} sx={{ bgcolor: theme.palette.action.hover, borderRadius: 1 }}>
                                <Typography variant="caption" color="text.secondary" fontStyle="italic">
                                  {part.bridge}
                                </Typography>
                              </Box>
                            )}

                            {/* Reflection */}
                            {part.reflectionQuestions.length > 0 && (
                              <Box>
                                <Typography variant="caption" fontWeight="bold" color="text.secondary" gutterBottom display="block">Reflection</Typography>
                                {part.reflectionQuestions.map((rq, i) => {
                                  const key = `${part.id}-${i}`;
                                  const isRefExpanded = expandedReflections[key] || false;
                                  return (
                                    <Box key={key} mb={0.5}>
                                      <Box display="flex" alignItems="center" sx={{ cursor: 'pointer' }} onClick={(): void => { toggleReflection(part.id, i); }}>
                                        {isRefExpanded ? <ExpandLessIcon sx={{ fontSize: '0.9rem', mr: 0.5 }} /> : <ExpandMoreIcon sx={{ fontSize: '0.9rem', mr: 0.5 }} />}
                                        <Typography variant="caption">{rq.question}</Typography>
                                      </Box>
                                      <Collapse in={isRefExpanded}>
                                        <Box ml={3} mt={0.5} p={1} sx={{ bgcolor: 'assistant.main', borderRadius: 1 }}>
                                          <MarkdownWithCode>{rq.answer}</MarkdownWithCode>
                                        </Box>
                                      </Collapse>
                                    </Box>
                                  );
                                })}
                              </Box>
                            )}
                          </>
                        )}

                        {activeCycle && isCurrent && (
                          <Box display="flex" justifyContent="flex-end" pt={2}>
                            <Chip
                              label={isLastPart ? 'Finish course' : `Continue to Part ${part.dayNumber + 1}`}
                              color="primary"
                              variant={isLastPart || nextPartReady ? 'filled' : 'outlined'}
                              onClick={(): void => { handleCompletePart(part.id); }}
                              sx={{ fontWeight: 600, cursor: 'pointer' }}
                            />
                          </Box>
                        )}
                      </Box>
                    </Collapse>
                  </Box>
                );
              })}
            </Box>
          )}

          {/* Conversation messages */}
          <Box flexGrow={1} minHeight={0} overflow="auto" px={1} pb={1}>
            {!activeCycle && !isCompletedView && !suggestionSlots && !showCategoryGrid && visibleChatMessages.length === 0 && (
              <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center"
                height="100%" px={3} color="text.secondary" textAlign="center">
                <Typography variant="body2">No content loaded. Try refreshing or starting a new course.</Typography>
              </Box>
            )}
            {visibleChatMessages.map((msg) => (
              <Box key={msg.id} mb={1}><MessageBubble message={msg} /></Box>
            ))}
            {sending && activeCycle && courseParts.length > 0 && (
              <Box mb={1}><TypingIndicator /></Box>
            )}
          </Box>
            </>
          )}
        </Box>

        {/* Right panel: Teacher Chat */}
        <Box display="flex" flexDirection="column" flexBasis="45%" minWidth={0} height="100%" overflow="hidden">
          <Box px={1.5} py={1} sx={{ borderBottom: `1px solid ${theme.palette.divider}`, flexShrink: 0 }}>
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Typography variant="subtitle2" fontWeight="bold">Teacher</Typography>
              <Box sx={{ maxWidth: 180 }}><ModelSelector selectedModel={teacherModel} onChange={setTeacherModel} /></Box>
            </Box>
          </Box>
          <Box flexGrow={1} minHeight={0} overflow="auto" px={1} pt={1}>
            {teacherMessages.length === 0 && (
              <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100%" px={2} color="text.secondary" textAlign="center">
                <Typography variant="body2">Ask the teacher questions about what you&rsquo;re learning. The teacher knows your current topic and progress.</Typography>
              </Box>
            )}
            {teacherMessages.map((msg) => (
              <Box key={msg.id} mb={1} sx={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <Box sx={{ maxWidth: '90%', bgcolor: msg.role === 'user' ? 'primary.main' : 'assistant.main',
                  color: msg.role === 'user' ? 'primary.contrastText' : 'text.primary', borderRadius: 2, px: 1.5, py: 1, fontSize: '0.875rem' }}>
                  <MarkdownWithCode>{msg.content}</MarkdownWithCode>
                </Box>
              </Box>
            ))}
            {teacherSending && teacherStreaming && (
              <Box mb={1} display="flex" justifyContent="flex-start">
                <Box sx={{ maxWidth: '90%', bgcolor: 'assistant.main', borderRadius: 2, px: 1.5, py: 1, fontSize: '0.875rem' }}>
                  <MarkdownWithCode>{teacherStreaming}</MarkdownWithCode>
                </Box>
              </Box>
            )}
            {teacherSending && !teacherStreaming && <Box mb={1}><TypingIndicator /></Box>}
            <div ref={teacherBottomRef} />
          </Box>
          <Box px={1.5} py={1} sx={{ borderTop: `1px solid ${theme.palette.divider}`, flexShrink: 0 }}>
            <Box display="flex" gap={1}>
              <TextField fullWidth size="small" placeholder="Ask the teacher a question..." value={teacherInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>): void => { setTeacherInput(e.target.value); }} onKeyDown={handleTeacherKeyDown}
                disabled={teacherSending} multiline maxRows={4}
                sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.875rem' } }} />
              <IconButton color="primary" onClick={(): void => { void handleTeacherSend(); }}
                disabled={!teacherInput.trim() || teacherSending} size="small"><SendIcon /></IconButton>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default CuratorView;
