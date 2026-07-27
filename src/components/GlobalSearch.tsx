import { useState, useEffect, useRef, JSX } from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  Chip,
  CircularProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  Paper,
  ClickAwayListener,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import TopicIcon from '@mui/icons-material/Topic';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import FilterListIcon from '@mui/icons-material/FilterList';
import { useNavigate } from 'react-router-dom';
import Fuse from 'fuse.js';
import { athenaDb, Topic, Message, LearningCycle, LearningDay } from '../database/AthenaDb';
import { useUiStore, SidebarFilterMode } from '../store/UiStore';
import { useChatStore } from '../store/ChatStore';

const MIN_SEARCH_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;
const MAX_SEARCH_RESULTS = 20;
const SEARCH_SNIPPET_LENGTH = 60;

type SearchResultType = 'topic' | 'message' | 'course' | 'debate';

interface SearchResult {
  id: string;
  topicId: string;
  messageId?: string;
  cycleId?: string;
  type: SearchResultType;
  title: string;
  snippet?: string;
  date: string;
}

interface CourseSearchEntry {
  id: string;
  topicId: string;
  cycleId: string;
  title: string;
  content: string;
  date: string;
  type: 'cycle' | 'day';
}

const MODE_ORDER: SidebarFilterMode[] = ['all', 'topics', 'messages', 'courses', 'debates'];

const MODE_ICONS: Record<SidebarFilterMode, JSX.Element> = {
  all: <FilterListIcon />,
  topics: <TopicIcon />,
  messages: <ChatBubbleOutlineIcon />,
  courses: <MenuBookOutlinedIcon />,
  debates: <CompareArrowsIcon />,
};

const MODE_LABELS: Record<SidebarFilterMode, string> = {
  all: 'All',
  topics: 'Topics',
  messages: 'Messages',
  courses: 'Courses',
  debates: 'Debates',
};

function buildSnippet(content: string, matchIndices: [number, number] | undefined, snippetLen: number): string {
  if (matchIndices) {
    const start = Math.max(0, matchIndices[0] - 30);
    const end = Math.min(content.length, matchIndices[1] + 1 + 30);
    return (start > 0 ? '...' : '') + content.substring(start, end).replace(/\n/g, ' ') + (end < content.length ? '...' : '');
  }
  return content.substring(0, snippetLen).replace(/\n/g, ' ') + (content.length > snippetLen ? '...' : '');
}

export const GlobalSearch = (): JSX.Element => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { isMobile, closeDrawer, sidebarFilter, setSidebarFilter } = useUiStore();
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const topicFuseRef = useRef<Fuse<Topic> | null>(null);
  const messageFuseRef = useRef<Fuse<Message> | null>(null);
  const courseFuseRef = useRef<Fuse<CourseSearchEntry> | null>(null);
  const debateTopicFuseRef = useRef<Fuse<Topic> | null>(null);
  const debateMessageFuseRef = useRef<Fuse<Message> | null>(null);
  const topicLookupRef = useRef<Map<string, Topic>>(new Map());

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    if (query.trim().length < MIN_SEARCH_LENGTH) {
      setResults([]);
      setIsSearching(false);
      setIsOpen(false);
      return;
    }

    setIsSearching(true);
    setIsOpen(true);
    setSearchError(null);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(() => {
      void performSearch(query.trim());
    }, SEARCH_DEBOUNCE_MS);

    return (): void => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sidebarFilter]);

  useEffect(() => {
    topicFuseRef.current = null;
    messageFuseRef.current = null;
    courseFuseRef.current = null;
    debateTopicFuseRef.current = null;
    debateMessageFuseRef.current = null;
    topicLookupRef.current = new Map();
  }, [sidebarFilter]);

  const searchTopics = async (searchQuery: string, filterMode?: SidebarFilterMode): Promise<SearchResult[]> => {
    if (!topicFuseRef.current) {
      const allTopics = await athenaDb.topics
        .toCollection()
        .filter((t) => !t.isDeleted)
        .toArray();

      let filtered = allTopics;
      if (filterMode === 'courses') {
        filtered = allTopics.filter((t) => t.mode === 'curator');
      } else if (filterMode === 'debates') {
        filtered = allTopics.filter((t) => t.mode === 'debate');
      } else if (filterMode === 'topics') {
        filtered = allTopics.filter((t) => !t.mode || t.mode === 'topic');
      }

      topicFuseRef.current = new Fuse(filtered, {
        keys: ['name'],
        threshold: 0.4,
        includeScore: true,
        minMatchCharLength: 2,
      });
    }

    const fuseResults = topicFuseRef.current.search(searchQuery);
    return fuseResults.slice(0, MAX_SEARCH_RESULTS).map((r) => ({
      id: `topic-${r.item.id}`,
      topicId: r.item.id,
      type: 'topic' as SearchResultType,
      title: r.item.name,
      date: r.item.updatedOn,
    }));
  };

  const searchMessages = async (searchQuery: string, filterByMode?: SidebarFilterMode): Promise<SearchResult[]> => {
    if (!messageFuseRef.current) {
      const allMessages: Message[] = await athenaDb.messages
        .toCollection()
        .filter((m) => !m.isDeleted)
        .toArray();

      const topicIdsFromMessages = Array.from(new Set<string>(allMessages.map((m) => m.topicId)));
      const topicsForMessages = await athenaDb.topics.bulkGet(topicIdsFromMessages);

      const lookup = new Map<string, Topic>();
      let filteredMessages = allMessages;
      if (filterByMode) {
        const modeTopicIds = new Set<string>();
        topicsForMessages.forEach((t) => {
          if (!t || t.isDeleted) return;
          lookup.set(t.id, t);
          if (filterByMode === 'courses' && t.mode === 'curator') modeTopicIds.add(t.id);
          else if (filterByMode === 'debates' && t.mode === 'debate') modeTopicIds.add(t.id);
        });
        if (filterByMode === 'courses' || filterByMode === 'debates') {
          filteredMessages = allMessages.filter((m) => modeTopicIds.has(m.topicId));
        }
      } else {
        topicsForMessages.forEach((t) => {
          if (t && !t.isDeleted) lookup.set(t.id, t);
        });
      }
      topicLookupRef.current = lookup;

      messageFuseRef.current = new Fuse(filteredMessages, {
        keys: ['content'],
        threshold: 0.4,
        includeScore: true,
        includeMatches: true,
        minMatchCharLength: 2,
        ignoreLocation: true,
      });
    }

    const fuseResults = messageFuseRef.current.search(searchQuery);
    const messageResults: SearchResult[] = [];

    fuseResults.slice(0, MAX_SEARCH_RESULTS).forEach((r) => {
      const parentTopic = topicLookupRef.current.get(r.item.topicId);
      if (!parentTopic) return;

      const matchIndices = r.matches?.[0]?.indices[0];
      const snippet = buildSnippet(r.item.content, matchIndices, SEARCH_SNIPPET_LENGTH);

      messageResults.push({
        id: `msg-${r.item.id}`,
        topicId: r.item.topicId,
        messageId: r.item.id,
        type: 'message',
        title: parentTopic.name,
        snippet,
        date: r.item.created,
      });
    });

    return messageResults;
  };

  const searchCourses = async (searchQuery: string): Promise<SearchResult[]> => {
    if (!courseFuseRef.current) {
      const allCycles: LearningCycle[] = await athenaDb.learningCycles.toArray();
      const allDays: LearningDay[] = await athenaDb.learningDays.toArray();

      const entries: CourseSearchEntry[] = [];

      for (const cycle of allCycles) {
        entries.push({
          id: `cycle-${cycle.id}`,
          topicId: cycle.topicId,
          cycleId: cycle.id,
          title: cycle.topicName,
          content: cycle.topicName,
          date: cycle.weekStart,
          type: 'cycle',
        });
      }

      for (const day of allDays) {
        entries.push({
          id: `day-${day.id}`,
          topicId: '',
          cycleId: day.cycleId,
          title: day.subTopic,
          content: [day.subTopic, day.summary, day.keyTakeaway, day.hook].filter(Boolean).join(' '),
          date: '',
          type: 'day',
        });
      }

      courseFuseRef.current = new Fuse(entries, {
        keys: ['title', 'content'],
        threshold: 0.4,
        includeScore: true,
        includeMatches: true,
        minMatchCharLength: 2,
        ignoreLocation: true,
      });
    }

    const fuseResults = courseFuseRef.current.search(searchQuery);
    const seenCycleIds = new Set<string>();
    const courseResults: SearchResult[] = [];

    for (const r of fuseResults) {
      if (courseResults.length >= MAX_SEARCH_RESULTS) break;

      const entry = r.item;
      const cycleId = entry.cycleId;
      const matchIndices = r.matches?.[0]?.indices[0];

      if (entry.type === 'cycle') {
        if (seenCycleIds.has(cycleId)) continue;
        seenCycleIds.add(cycleId);
        courseResults.push({
          id: entry.id,
          topicId: entry.topicId,
          cycleId,
          type: 'course',
          title: entry.title,
          snippet: undefined,
          date: entry.date,
        });
      } else {
        const cycle = await athenaDb.learningCycles.get(cycleId);
        if (!cycle) continue;
        if (seenCycleIds.has(cycleId)) continue;
        seenCycleIds.add(cycleId);

        const snippet = buildSnippet(entry.content, matchIndices, SEARCH_SNIPPET_LENGTH);
        courseResults.push({
          id: entry.id,
          topicId: cycle.topicId,
          cycleId,
          type: 'course',
          title: cycle.topicName,
          snippet,
          date: cycle.weekStart,
        });
      }
    }

    return courseResults;
  };

  const searchDebates = async (searchQuery: string): Promise<SearchResult[]> => {
    const debateResults: SearchResult[] = [];

    if (!debateTopicFuseRef.current) {
      const allTopics = await athenaDb.topics
        .toCollection()
        .filter((t) => !t.isDeleted && t.mode === 'debate')
        .toArray();

      debateTopicFuseRef.current = new Fuse(allTopics, {
        keys: ['name'],
        threshold: 0.4,
        includeScore: true,
        minMatchCharLength: 2,
      });
    }

    const topicFuseResults = debateTopicFuseRef.current.search(searchQuery);
    debateResults.push(
      ...topicFuseResults.slice(0, MAX_SEARCH_RESULTS).map((r) => ({
        id: `debate-topic-${r.item.id}`,
        topicId: r.item.id,
        type: 'debate' as SearchResultType,
        title: r.item.name,
        date: r.item.updatedOn,
      })),
    );

    const remaining = MAX_SEARCH_RESULTS - debateResults.length;
    if (remaining > 0) {
      const debateMsgResults = await searchMessages(searchQuery, 'debates');
      const marked = debateMsgResults.slice(0, remaining).map((r) => ({
        ...r,
        type: 'debate' as SearchResultType,
      }));
      debateResults.push(...marked);
    }

    return debateResults;
  };

  const performSearch = async (searchQuery: string): Promise<void> => {
    try {
      let allResults: SearchResult[] = [];

      switch (sidebarFilter) {
        case 'all': {
          const [topicRes, messageRes, courseRes, debateRes] = await Promise.all([
            searchTopics(searchQuery),
            searchMessages(searchQuery),
            searchCourses(searchQuery),
            searchDebates(searchQuery),
          ]);

          const merged = [...topicRes, ...messageRes, ...courseRes, ...debateRes];
          merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          const seen = new Set<string>();
          const deduped: SearchResult[] = [];
          for (const r of merged) {
            const key = `${r.type}-${r.topicId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(r);
            if (deduped.length >= MAX_SEARCH_RESULTS) break;
          }
          allResults = deduped;
          break;
        }
        case 'topics':
          allResults = await searchTopics(searchQuery);
          break;
        case 'messages':
          allResults = await searchMessages(searchQuery);
          break;
        case 'courses':
          allResults = await searchCourses(searchQuery);
          break;
        case 'debates':
          allResults = await searchDebates(searchQuery);
          break;
      }

      setResults(allResults);
      setIsSearching(false);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchError('Search failed. Please try again.');
      setIsSearching(false);
    }
  };

  const cycleMode = (): void => {
    const currentIdx = MODE_ORDER.indexOf(sidebarFilter);
    const nextIdx = (currentIdx + 1) % MODE_ORDER.length;
    setSidebarFilter(MODE_ORDER[nextIdx]);
  };

  const handleResultClick = (result: SearchResult): void => {
    setIsOpen(false);
    setQuery('');
    if (result.messageId) {
      useChatStore.getState().setHighlightedMessageId(result.messageId);
    }
    void navigate(`/chat/${result.topicId}`);
    if (isMobile) {
      closeDrawer();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Tab') {
      e.preventDefault();
      cycleMode();
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>): void => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setSidebarFilter('all');
  };

  const getResultIcon = (type: SearchResultType): JSX.Element => {
    switch (type) {
      case 'course':
        return <MenuBookOutlinedIcon sx={{ mr: 2, color: 'primary.main', fontSize: 20 }} />;
      case 'debate':
        return <CompareArrowsIcon sx={{ mr: 2, color: 'secondary.main', fontSize: 20 }} />;
      case 'message':
        return <ChatBubbleOutlineIcon sx={{ mr: 2, color: 'text.secondary', fontSize: 20 }} />;
      case 'topic':
      default:
        return <TopicIcon sx={{ mr: 2, color: 'text.secondary', fontSize: 20 }} />;
    }
  };

  return (
    <ClickAwayListener onClickAway={(): void => setIsOpen(false)}>
      <Box onBlur={handleBlur} sx={{ position: 'relative', width: '100%', px: 2, pb: 1, zIndex: 1200 }}>
        <TextField
          fullWidth
          size="small"
          inputProps={{ 'aria-label': 'Search' }}
          placeholder="Search..."
          value={query}
          onChange={(e): void => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={(): void => {
            if (query.trim().length >= MIN_SEARCH_LENGTH) setIsOpen(true);
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: (
              <>
                {isSearching && (
                  <InputAdornment position="end">
                    <CircularProgress size={16} />
                  </InputAdornment>
                )}
                <InputAdornment position="end">
                  <Chip
                    icon={MODE_ICONS[sidebarFilter]}
                    label={MODE_LABELS[sidebarFilter]}
                    size="small"
                    variant="outlined"
                    clickable
                    onClick={(e): void => {
                      e.stopPropagation();
                      cycleMode();
                    }}
                    sx={{
                      height: 24,
                      cursor: 'pointer',
                      '& .MuiChip-label': { fontSize: '0.7rem', px: 0.5 },
                      '& .MuiChip-icon': { fontSize: 16, ml: 0.5 },
                    }}
                  />
                </InputAdornment>
              </>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
              bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0,0,0,0.03)'),
            },
          }}
        />

        {isOpen && query.trim() && !isSearching && (
          <Paper
            elevation={4}
            sx={{
              position: 'absolute',
              top: '100%',
              left: 8,
              right: 8,
              mt: 0.5,
              maxHeight: 400,
              overflowY: 'auto',
              borderRadius: 2,
              border: (theme) => `1px solid ${theme.palette.divider}`,
              bgcolor: 'background.paper',
            }}
          >
            {searchError ? (
              <Box p={3} textAlign="center">
                <Typography variant="body2" color="error">
                  {searchError}
                </Typography>
              </Box>
            ) : results.length === 0 ? (
              <Box p={3} textAlign="center">
                <Typography variant="body2" color="text.secondary">
                  No results found for &quot;{query}&quot;
                </Typography>
              </Box>
            ) : (
              <List disablePadding>
                {results.map((result) => (
                  <ListItem key={result.id} disablePadding divider>
                    <ListItemButton
                      onMouseDown={(e: React.MouseEvent): void => {
                        e.preventDefault();
                      }}
                      onClick={(): void => handleResultClick(result)}
                    >
                      {getResultIcon(result.type)}

                      <ListItemText
                        primary={
                          <Typography variant="body2" fontWeight={result.type === 'topic' || result.type === 'course' ? 'bold' : 'inherit'}>
                            {result.title}
                          </Typography>
                        }
                        secondary={
                          result.snippet ? (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                mt: 0.5,
                              }}
                            >
                              {result.snippet}
                            </Typography>
                          ) : undefined
                        }
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        )}
      </Box>
    </ClickAwayListener>
  );
};
