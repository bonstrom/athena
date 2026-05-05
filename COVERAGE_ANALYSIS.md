# Athena Project - Test Coverage Analysis Report

**Generated:** April 19, 2026

---

## Executive Summary

The Athena project has a **7 files with critical low coverage** (<50%) that require immediate attention. Additionally, **25 source files lack test files entirely**, representing untested business logic critical to application functionality.

### Key Metrics

- **Total source files analyzed:** 57
- **Files with test files:** 32 (56%)
- **Files without test files:** 25 (44%)
- **Files with <50% coverage:** 7
- **Files with 50-80% coverage:** 6
- **Files with >80% coverage:** 44

---

## Part 1: Files with Low Coverage (<50%)

### 🔴 CRITICAL - 0% Coverage (No Tests)

#### 1. **`src/components/Composer.tsx`** (0% coverage - 0/1376 statements)

**Priority:** 🔴🔴🔴 CRITICAL  
**Risk Level:** HIGH - Core message composition component

**What it does:**

- Main input component for composing LLM queries
- Handles message input with various formatting options
- Manages UI state for scratchpad, suggestions, settings
- Controls image/music/web search toggles and attachments

**Missing test scenarios:**

- Message text input and submission
- Button visibility states (send, stop, toggle buttons)
- Menu interactions (model selector, tools menu)
- Dialog interactions (scratchpad, topic context, import)
- Disabled states when sending
- Error handling for failed submissions
- Tool availability based on feature toggles
- Model parameter changes (temperature, etc.)

**Suggested test approach:**

```typescript
- Test message input and text entry
- Test send button behavior with/without content
- Test stop button appears during sending
- Test menu interactions for each tool
- Test dialog opening/closing
- Test feature flag toggles (web search, image gen, etc.)
```

---

#### 2. **`src/services/embeddingWorkerFactory.ts`** (0% coverage - 0/3 statements)

**Priority:** 🔴🔴 HIGH  
**Risk Level:** MEDIUM

**What it does:**

- Factory function to create embedding workers

**Missing test scenarios:**

- Worker creation
- Worker initialization
- Error handling for worker failures

---

#### 3. **`src/services/llmWorkerFactory.ts`** (0% coverage - 0/5 statements)

**Priority:** 🔴🔴 HIGH  
**Risk Level:** MEDIUM

**What it does:**

- Factory function to create LLM workers for parallel processing

**Missing test scenarios:**

- Worker creation and initialization
- Error handling

---

### 🟠 LOW - Under 50% Coverage

#### 4. **`src/components/MarkdownWithCode.tsx`** (38.6% coverage - 78/202 statements)

**Priority:** 🟠🟠 HIGH  
**Risk Level:** MEDIUM

**What it does:**

- Renders markdown with syntax-highlighted code blocks
- Registers syntax highlighters for 18+ languages
- Provides copy-to-clipboard functionality for code blocks

**Missing test scenarios:**

- Markdown rendering with different content
- Code block rendering with various languages (js, py, bash, etc.)
- Copy button functionality and success/error states
- Language detection from code fences
- Long code truncation/scrolling
- Inline vs block code handling

**ESLint issues:**

- Line 36: `no-explicit-any` - uses `as any` cast for SyntaxHighlighter style

---

#### 5. **`src/store/ChatStore.ts`** (41.8% coverage - 582/1394 statements)

**Priority:** 🔴🔴 CRITICAL  
**Risk Level:** VERY HIGH - Core state management

**What it does:**

- Central state management for chat messages
- Message CRUD operations (add, update, delete)
- LLM streaming and non-streaming message sending
- Context management (pin/unpin messages)
- Cost calculation and tracking
- Topic context retrieval and management

**Critical functions NOT tested:**

- `sendMessage()` / `sendMessageStream()` - Core LLM interaction
- `sendMessageWithoutStream()` - Non-streaming variant
- `updateMessageContext()` - Context management
- `deleteMessage()` - Message deletion
- `fetchMessages()` - Message retrieval
- Error handling and retry logic for failed messages
- Message deduplication in `addMessages()`
- Sort order preservation

**Suggested test approach:**

```typescript
- Mock LLM service for askLlm/askLlmStream
- Test message addition with proper state updates
- Test message updates and patches
- Test deletion cascade
- Test streaming message content updates
- Test error recovery and retry mechanism
- Test cost calculations
- Test context pinning/unpinning
- Test message sorting
```

**ESLint issues:**

- Lines 95, 117: `no-unnecessary-condition` - Nullable type checking

---

#### 6. **`src/reportWebVitals.ts`** (46.7% coverage - 7/15 statements)

**Priority:** 🟡 MEDIUM  
**Risk Level:** LOW

**What it does:**

- Reports web performance metrics
- Optional callback for sending metrics to analytics

**Missing test scenarios:**

- Metric collection and callback invocation
- Metric handler callback execution
- Different metric types (LCP, FID, CLS, etc.)

---

#### 7. **`src/components/ProviderCard.tsx`** (48.3% coverage - 373/773 statements)

**Priority:** 🟠 HIGH  
**Risk Level:** MEDIUM-HIGH

**What it does:**

- Displays API provider configuration card
- Allows adding/editing provider credentials
- Handles provider-specific settings
- Validates API keys

**Missing test scenarios:**

- Provider card rendering with different providers
- API key input and validation
- Add/edit/delete provider flows
- Error handling for invalid credentials
- Provider settings changes
- Form submission and error states

---

## Part 2: Files with Medium Coverage (50-80%)

| File                               | Coverage | Status  | Priority    |
| ---------------------------------- | -------- | ------- | ----------- |
| `src/components/MessageBubble.tsx` | 59.2%    | Partial | 🟠 HIGH     |
| `src/services/backupService.ts`    | 60.3%    | Partial | 🟠 HIGH     |
| `src/pages/Settings.tsx`           | 71.8%    | Partial | 🟡 MEDIUM   |
| `src/services/llmService.ts`       | 71.8%    | Partial | 🔴 CRITICAL |
| `src/index.tsx`                    | 72.5%    | Partial | 🟡 MEDIUM   |
| `src/components/ChatLayout.tsx`    | 79.2%    | Partial | 🟡 MEDIUM   |

### Key Medium-Coverage Files

#### **`src/services/backupService.ts`** (60.3% coverage)

**Priority:** 🟠 HIGH  
**Critical functions:**

- `downloadBackup()` - Backup file generation/download
- `restoreBackup()` - Restore from backup file
- `validateBackupFile()` - Backup file validation
- `createPreImportBackup()` - Safety backup before import
- Auto-backup with file handle management

**Missing test scenarios:**

- Backup file creation and download
- Backup validation with invalid/corrupted files
- Restore process and error recovery
- Pre-import safety backup creation
- File handle permissions and cleanup
- Auto-backup timing and conflict prevention

---

#### **`src/services/llmService.ts`** (71.8% coverage)

**Priority:** 🔴 CRITICAL  
**Critical functions:**

- `orchestrateLlmLoop()` - Main LLM orchestration
- `askLlm()` / `askLlmStream()` - LLM communication
- Tool call handling (scratchpad, read messages, etc.)
- Token estimation and cost calculation
- Provider-specific request formatting

**Missing test scenarios:**

- LLM provider API interaction (OpenAI, DeepSeek)
- Tool call execution and response handling
- Token counting accuracy
- Stream response processing
- Error handling for API failures
- Model switching
- Cache management

---

## Part 3: Files Without Test Files (25 total)

### 🔴 CRITICAL BUSINESS LOGIC WITHOUT TESTS

1. **`database/AthenaDb.ts`** - IndexedDB schema and migrations

   - Database versioning and upgrades
   - Migration logic (fork management, parent message IDs)
   - Schema validation

2. **`store/ChatStore.ts`** - ⚠️ Already listed above (41.8% coverage)

3. **`services/llmService.ts`** - ⚠️ Already listed above (71.8% coverage)

4. **`services/backupService.ts`** - ⚠️ Already listed above (60.3% coverage)

### 🟠 HIGH PRIORITY - Store/State Management

5. **`store/AuthStore.ts`** (100% coverage but NO TESTS)

   - Authentication state management
   - API key storage/retrieval
   - User information management

6. **`store/BackupStore.ts`** (100% coverage but NO TESTS)

   - Backup state and scheduling
   - Last backup timestamp tracking

7. **`store/NotificationStore.ts`** (100% coverage but NO TESTS)

   - Notification display and management
   - Error/success message handling

8. **`store/ProviderStore.ts`** (92.7% coverage)

   - Provider configuration management
   - Multiple provider support

9. **`store/TopicStore.ts`** (97.6% coverage)

   - Topic (conversation) management
   - Fork management for branching conversations
   - Context retrieval

10. **`store/UiStore.ts`** (100% coverage but NO TESTS)
    - Mobile responsive state
    - Drawer open/close
    - UI preferences

### 🟠 HIGH PRIORITY - Services

11. **`services/llmSuggestionService.ts`** (87.6% coverage)

    - LLM-based suggestions and auto-completion
    - Suggestion caching

12. **`services/embeddingService.ts`** (91.3% coverage)

    - Vector embeddings for semantic search
    - Worker management and message scoring

13. **`services/estimateTokens.ts`** (100% coverage but NO TESTS)

    - Token counting for cost estimation
    - Model-specific token calculation

14. **`services/mediaService.ts`** (100% coverage but NO TESTS)
    - Image and music generation via LLM
    - Media API integration

### 🟡 MEDIUM PRIORITY - Utilities & Types

15. **`utils/security.ts`** (93.3% coverage)

    - Security utilities and validation
    - Credential sanitization

16. **`utils/groupTopicsByDate.ts`** (100% coverage but NO TESTS)

    - Topic list grouping by date

17. **`types/provider.ts`** (98.4% coverage)

    - Provider type definitions and helpers

18. **`hooks/useAutoBackup.ts`** (94.9% coverage)

    - Auto-backup scheduling and management

19. **`hooks/useEmbeddingBackfill.ts`** (97.7% coverage)
    - Embedding vector backfill
    - Periodic backfill jobs

### 🔵 LOW PRIORITY - Config/Constants

20. **`theme.tsx`** (100% coverage but NO TESTS)

    - Material-UI theme definitions

21. **`constants.ts`** (100% coverage but NO TESTS)
    - Application constants and configurations

---

## Part 4: Prioritized Recommendations

### 🔴 Tier 1: CRITICAL (Do First - High Impact, High Risk)

| #   | File                            | Current | Target | Impact                          | Est. Tests |
| --- | ------------------------------- | ------- | ------ | ------------------------------- | ---------- |
| 1   | `src/store/ChatStore.ts`        | 41.8%   | 85%+   | Message handling, cost tracking | 40-50      |
| 2   | `src/components/Composer.tsx`   | 0%      | 75%+   | User input, message submission  | 30-40      |
| 3   | `src/services/llmService.ts`    | 71.8%   | 90%+   | LLM integration, tool calls     | 35-45      |
| 4   | `src/services/backupService.ts` | 60.3%   | 85%+   | Data persistence, recovery      | 25-35      |
| 5   | `src/database/AthenaDb.ts`      | Missing | 80%+   | DB schema, migrations           | 20-30      |

**Estimated effort:** 150-185 tests

### 🟠 Tier 2: HIGH PRIORITY (Do Second - Core Functionality)

| #   | File                                  | Current | Target | Impact                  | Est. Tests |
| --- | ------------------------------------- | ------- | ------ | ----------------------- | ---------- |
| 6   | `src/components/MarkdownWithCode.tsx` | 38.6%   | 85%+   | Content rendering       | 20-25      |
| 7   | `src/store/ProviderStore.ts`          | 92.7%   | 95%+   | Provider management     | 10-15      |
| 8   | `src/components/MessageBubble.tsx`    | 59.2%   | 85%+   | Message display         | 20-25      |
| 9   | `src/store/TopicStore.ts`             | 97.6%   | 98%+   | Topic/conversation mgmt | 15-20      |
| 10  | `src/services/embeddingService.ts`    | 91.3%   | 95%+   | Semantic search         | 15-20      |

**Estimated effort:** 80-105 tests

### 🟡 Tier 3: MEDIUM PRIORITY (Do Third - Important Helpers)

| #   | File                                   | Current         | Target  | Impact         | Est. Tests |
| --- | -------------------------------------- | --------------- | ------- | -------------- | ---------- |
| 11  | `src/hooks/useAutoBackup.ts`           | 94.9%           | 97%+    | Auto-backup    | 10-15      |
| 12  | `src/services/llmSuggestionService.ts` | 87.6%           | 92%+    | Suggestions    | 12-18      |
| 13  | `src/utils/security.ts`                | 93.3%           | 96%+    | Security       | 8-12       |
| 14  | `src/store/AuthStore.ts`               | 100% (untested) | + tests | Auth state     | 15-20      |
| 15  | `src/services/estimateTokens.ts`       | 100% (untested) | + tests | Token counting | 10-15      |

**Estimated effort:** 55-80 tests

---

## Part 5: Test Writing Guidelines

### For Tier 1 Priority Files

#### **ChatStore.ts** - Key test patterns

```typescript
describe('ChatStore - sendMessageStream', () => {
  beforeEach(() => {
    mockAskLlmStream.mockImplementation((context, callback) => {
      callback('Hello ');
      callback('world');
      return Promise.resolve({
        content: 'Hello world',
        promptTokens: 10,
        completionTokens: 12,
        searchCount: 0,
      });
    });
  });

  it('should stream message content with partial updates', async () => {
    // Test streaming message state updates
  });

  it('should calculate costs correctly for tokens', async () => {
    // Verify cost calculation from token counts
  });

  it('should handle LLM failures gracefully', async () => {
    // Test error recovery, retry mechanism
  });
});
```

#### **Composer.tsx** - Key test patterns

```typescript
describe('Composer', () => {
  it('should disable send button when message is empty', () => {
    // Test empty state button disable
  });

  it('should toggle feature availability based on auth state', () => {
    // Test web search, image gen toggles based on API keys
  });

  it('should open dialogs for tools (scratchpad, context)', () => {
    // Test dialog open/close interactions
  });
});
```

#### **LlmService.ts** - Key test patterns

```typescript
describe('llmService', () => {
  it('should handle tool calls in orchestration loop', async () => {
    // Mock tool responses, verify orchestration
  });

  it('should retry failed API requests', async () => {
    // Test retry logic
  });

  it('should support streaming responses', async () => {
    // Test stream chunk handling
  });
});
```

#### **BackupService.ts** - Key test patterns

```typescript
describe('BackupService', () => {
  it('should validate backup file structure', async () => {
    // Test validation with corrupt/invalid files
  });

  it('should create pre-import safety backup', async () => {
    // Test backup creation before import
  });

  it('should handle concurrent backup attempts', async () => {
    // Test autoBackupInProgress flag
  });
});
```

---

## Part 6: Coverage Roadmap

### Month 1: Critical Path (Tier 1)

- **Week 1-2:** ChatStore.ts (add tests for message sending, context, cost tracking)
- **Week 2-3:** Composer.tsx (add tests for UI interactions, feature toggles)
- **Week 3-4:** LlmService.ts (add provider API tests, tool handling)

### Month 2: Core Functionality (Tier 2)

- **Week 1-2:** BackupService.ts & AthenaDb.ts (persistence layer)
- **Week 2-3:** MarkdownWithCode.tsx & MessageBubble.tsx (rendering)
- **Week 3-4:** Store files (ProviderStore, TopicStore)

### Month 3: Polish & Helpers (Tier 3)

- **Week 1-2:** Service utilities (embeddings, suggestions, tokens)
- **Week 2-3:** Hooks (useAutoBackup, useEmbeddingBackfill)
- **Week 3-4:** Utilities & security

### Target:

- **Current overall coverage:** ~75%
- **End of Month 1:** ~80%
- **End of Month 2:** ~88%
- **End of Month 3:** ~92%+

---

## Part 7: ESLint Issues to Fix (During Test Writing)

Current ESLint errors that should be addressed:

| File                   | Line | Issue                                     | Severity |
| ---------------------- | ---- | ----------------------------------------- | -------- |
| MarkdownWithCode.tsx   | 36   | `@typescript-eslint/no-explicit-any`      | Error    |
| TopicContextDialog.tsx | 34   | `@typescript-eslint/unbound-method`       | Error    |
| TopicContextDialog.tsx | 61   | `@typescript-eslint/no-floating-promises` | Error    |

When writing tests, ensure no new `any` types are introduced - follow the copilot-instructions.md guidelines.

---

## Summary

**Total test coverage improvement potential:** 200-270 unit tests  
**Estimated time to implement:** 8-12 weeks (assuming 20-25 tests/week)  
**Expected final coverage:** 92-96%

Focus on **Tier 1** first to address critical gaps in state management and core LLM functionality.
