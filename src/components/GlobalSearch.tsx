import { useState, useEffect, useRef, JSX } from 'react';
import {
  Box,
  TextField,
  InputAdornment,
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
import { athenaDb, Topic } from '../database/AthenaDb';
import { useUiStore } from '../store/UiStore';

interface SearchResult {
  id: string; // Unique ID for the result item
  topicId: string; // ID of the destination topic
  type: 'topic' | 'message';
  title: string;
  snippet?: string; // Preview of message content
  date: string;
}

export const GlobalSearch = (): JSX.Element => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { isMobile, closeDrawer } = useUiStore();
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setIsOpen(true);
    setSearchError(null);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(() => {
      void performSearch(query.trim().toLowerCase());
    }, 300); // 300ms debounce

    return (): void => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  const performSearch = async (searchQuery: string): Promise<void> => {
    try {
      // 1. Search Topics - Use index for prefix matches first
      const prefixMatchedTopics = await athenaDb.topics
        .where('name')
        .startsWithIgnoreCase(searchQuery)
        .filter((t) => !t.isDeleted)
        .toArray();

      // Also search for partial matches if needed (still a scan but more focused)
      const otherMatchedTopics = await athenaDb.topics
        .where('isDeleted')
        .equals(0)
        .filter((t) => t.name.toLowerCase().includes(searchQuery) && !t.name.toLowerCase().startsWith(searchQuery))
        .toArray();

      const matchedTopics = [...prefixMatchedTopics, ...otherMatchedTopics];

      // 2. Search Messages - Start with isDeleted index to avoid full table scan
      const matchedMessages = await athenaDb.messages
        .where('isDeleted')
        .equals(0)
        .filter((m) => m.content.toLowerCase().includes(searchQuery))
        .toArray();

      // We need to fetch the parent topics for the matched messages to display their names
      const topicIdsFromMessages = Array.from(new Set<string>(matchedMessages.map((m) => m.topicId)));

      // Fetch parents in bulk
      const topicsForMessages = await athenaDb.topics.bulkGet(topicIdsFromMessages);

      // Create a lookup map for fast title retrieval
      const topicLookup = new Map<string, Topic>();
      topicsForMessages.forEach((t) => {
        if (t && !t.isDeleted) topicLookup.set(t.id, t);
      });

      const combinedResults: SearchResult[] = [];

      // Add Topic matches
      matchedTopics.forEach((t) => {
        combinedResults.push({
          id: `topic-${t.id}`,
          topicId: t.id,
          type: 'topic',
          title: t.name,
          date: t.updatedOn,
        });
      });

      // Add Message matches
      matchedMessages.forEach((m) => {
        const parentTopic = topicLookup.get(m.topicId);
        if (parentTopic) {
          // Create a snippet around the search query for context
          const lowercaseContent = m.content.toLowerCase();
          const matchIndex = lowercaseContent.indexOf(searchQuery);
          let snippet = m.content;
          if (matchIndex !== -1) {
            const start = Math.max(0, matchIndex - 30);
            const end = Math.min(m.content.length, matchIndex + searchQuery.length + 30);
            snippet = (start > 0 ? '...' : '') + m.content.substring(start, end).replace(/\n/g, ' ') + (end < m.content.length ? '...' : '');
          } else {
            snippet = m.content.substring(0, 60).replace(/\n/g, ' ') + (m.content.length > 60 ? '...' : '');
          }

          combinedResults.push({
            id: `msg-${m.id}`,
            topicId: m.topicId,
            type: 'message',
            title: parentTopic.name, // Show the topic name it belongs to
            snippet: snippet,
            date: m.created,
          });
        }
      });

      // Sort by date descending (newest first)
      combinedResults.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Limit results to keep UI responsive
      setResults(combinedResults.slice(0, 20));
      setIsSearching(false);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchError('Search failed. Please try again.');
      setIsSearching(false);
    }
  };

  const handleResultClick = (topicId: string): void => {
    setIsOpen(false);
    setQuery(''); // Optional: clear search on navigation
    void navigate(`/chat/${topicId}`);
    if (isMobile) {
      closeDrawer();
    }
  };

  return (
    <ClickAwayListener onClickAway={(): void => setIsOpen(false)}>
      <Box sx={{ position: 'relative', width: '100%', px: 2, pb: 1, zIndex: 1200 }}>
        <TextField
          fullWidth
          size="small"
          inputProps={{ 'aria-label': 'Search topics and messages' }}
          placeholder="Search topics and messages..."
          value={query}
          onChange={(e): void => setQuery(e.target.value)}
          onFocus={(): void => {
            if (query.trim()) setIsOpen(true);
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: isSearching ? (
              <InputAdornment position="end">
                <CircularProgress size={16} />
              </InputAdornment>
            ) : null,
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
                    <ListItemButton onClick={(): void => handleResultClick(result.topicId)}>
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
