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
import { useNavigate } from 'react-router-dom';
import Fuse from 'fuse.js';
import { athenaDb, Topic, Message } from '../database/AthenaDb';
import { useUiStore } from '../store/UiStore';
import { useChatStore } from '../store/ChatStore';

const MIN_SEARCH_LENGTH = 2;

interface SearchResult {
  id: string;
  topicId: string;
  messageId?: string;
  type: 'topic' | 'message';
  title: string;
  snippet?: string;
  date: string;
}

export const GlobalSearch = (): JSX.Element => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<'topics' | 'messages'>('topics');
  const navigate = useNavigate();
  const { isMobile, closeDrawer } = useUiStore();
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const topicFuseRef = useRef<Fuse<Topic> | null>(null);
  const messageFuseRef = useRef<Fuse<Message> | null>(null);
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
      void performSearch(query.trim(), searchMode);
    }, 300); // 300ms debounce

    return (): void => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, searchMode]);

  // Invalidate cached Fuse indices when search mode changes
  useEffect(() => {
    topicFuseRef.current = null;
    messageFuseRef.current = null;
    topicLookupRef.current = new Map();
  }, [searchMode]);

  const performSearch = async (searchQuery: string, mode: 'topics' | 'messages'): Promise<void> => {
    try {
      if (mode === 'topics') {
        if (!topicFuseRef.current) {
          const allTopics = await athenaDb.topics
            .toCollection()
            .filter((t) => !t.isDeleted)
            .toArray();

          topicFuseRef.current = new Fuse(allTopics, {
            keys: ['name'],
            threshold: 0.4,
            includeScore: true,
            minMatchCharLength: 2,
          });
        }

        const fuseResults = topicFuseRef.current.search(searchQuery);

        const topicResults: SearchResult[] = fuseResults.map((r) => ({
          id: `topic-${r.item.id}`,
          topicId: r.item.id,
          type: 'topic',
          title: r.item.name,
          date: r.item.updatedOn,
        }));

        setResults(topicResults.slice(0, 20));
      } else {
        if (!messageFuseRef.current) {
          const allMessages: Message[] = await athenaDb.messages
            .toCollection()
            .filter((m) => !m.isDeleted)
            .toArray();

          const topicIdsFromMessages = Array.from(new Set<string>(allMessages.map((m) => m.topicId)));
          const topicsForMessages = await athenaDb.topics.bulkGet(topicIdsFromMessages);

          const lookup = new Map<string, Topic>();
          topicsForMessages.forEach((t) => {
            if (t && !t.isDeleted) lookup.set(t.id, t);
          });
          topicLookupRef.current = lookup;

          messageFuseRef.current = new Fuse(allMessages, {
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

        fuseResults.slice(0, 20).forEach((r) => {
          const parentTopic = topicLookupRef.current.get(r.item.topicId);
          if (!parentTopic) return;

          const matchIndices = r.matches?.[0]?.indices[0];
          let snippet: string;
          if (matchIndices) {
            const start = Math.max(0, matchIndices[0] - 30);
            const end = Math.min(r.item.content.length, matchIndices[1] + 1 + 30);
            snippet =
              (start > 0 ? '...' : '') + r.item.content.substring(start, end).replace(/\n/g, ' ') + (end < r.item.content.length ? '...' : '');
          } else {
            snippet = r.item.content.substring(0, 60).replace(/\n/g, ' ') + (r.item.content.length > 60 ? '...' : '');
          }

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

        setResults(messageResults);
      }

      setIsSearching(false);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchError('Search failed. Please try again.');
      setIsSearching(false);
    }
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
      setSearchMode((prev) => (prev === 'topics' ? 'messages' : 'topics'));
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>): void => {
    // Don't reset mode if focus moved to a child element (e.g. clicking a result or chip)
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setSearchMode('topics');
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
                    icon={searchMode === 'topics' ? <TopicIcon /> : <ChatBubbleOutlineIcon />}
                    label={searchMode === 'topics' ? 'Topics' : 'Messages'}
                    size="small"
                    variant="outlined"
                    clickable
                    onClick={(e): void => {
                      e.stopPropagation();
                      setSearchMode((prev) => (prev === 'topics' ? 'messages' : 'topics'));
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
              bgcolor: 'background.paper', // Ensure solid background over content
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
                      {result.type === 'topic' ? (
                        <TopicIcon sx={{ mr: 2, color: 'text.secondary', fontSize: 20 }} />
                      ) : (
                        <ChatBubbleOutlineIcon sx={{ mr: 2, color: 'text.secondary', fontSize: 20 }} />
                      )}

                      <ListItemText
                        primary={
                          <Typography variant="body2" fontWeight={result.type === 'topic' ? 'bold' : 'inherit'}>
                            {result.title}
                          </Typography>
                        }
                        secondary={
                          result.snippet && (
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
                          )
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
