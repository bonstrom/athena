import {
  DEEPSEEK_TOOLS_BASE_URL,
  SEARCH_DEFAULT_COUNT,
  SEARCH_MAX_COUNT,
  SEARCH_MIN_RERANK_SCORE,
  SEARCH_RESULT_CHAR_LIMIT,
} from '../constants';
import { useProviderStore } from '../store/ProviderStore';
import { getApiKey } from '../types/provider';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawSearchResult {
  rerank_score?: number;
  title?: string;
  url?: string;
  snippet?: string;
  summary?: string;
  content?: string;
  site_name?: string | null;
  date?: string | null;
  authority?: number;
}

interface RawSearchResponse {
  results?: RawSearchResult[];
}

interface RawFetchResponse {
  title?: string;
  content?: string;
}

export interface WebSearchResponse {
  /** Model-facing text block. */
  text: string;
  /** Number of results included in the block. */
  resultCount: number;
  /** Whether this request is billable (HTTP 200 + non-empty results). */
  billable: boolean;
}

export interface WebFetchResponse {
  text: string;
  billable: boolean;
}

export interface WebSearchOptions {
  count?: number;
  signal?: AbortSignal;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Resolve the API key used for Search/Fetch. Returns '' when unconfigured. */
export function getWebSearchApiKey(): string {
  const providers = useProviderStore.getState().providers;
  // Prefer the built-in DeepSeek provider; fall back to any other provider that
  // is marked as a search provider and has a key (e.g. a custom DeepSeek entry).
  const preferred = providers.find((p) => p.id === 'builtin-deepseek');
  const preferredKey = preferred ? getApiKey(preferred) : '';
  if (preferredKey) return preferredKey;

  const fallback = providers.find((p) => p.supportsWebSearch && getApiKey(p).length > 0);
  return fallback ? getApiKey(fallback) : '';
}

export function hasWebSearchApiKey(): boolean {
  return getWebSearchApiKey().length > 0;
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  const trimmed = text.trim();
  return trimmed.length > 0 ? `${res.status}: ${trimmed.slice(0, 500)}` : `HTTP ${res.status}`;
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function clampCount(count: number | undefined): number {
  if (count === undefined || !Number.isFinite(count)) return SEARCH_DEFAULT_COUNT;
  return Math.min(SEARCH_MAX_COUNT, Math.max(1, Math.round(count)));
}

/**
 * Keep only high-quality results when enough survive, then trim the tail until
 * the serialised block fits the context budget.
 */
function selectResults(results: RawSearchResult[]): RawSearchResult[] {
  const quality = results.filter((r) => (r.rerank_score ?? SEARCH_MIN_RERANK_SCORE) >= SEARCH_MIN_RERANK_SCORE);
  // Prefer high-quality hits; fall back to the top 2 when nothing clears the bar
  // so the model still sees something rather than an empty result set.
  return quality.length > 0 ? quality : results.slice(0, 2);
}

function formatSearchBlock(query: string, results: RawSearchResult[]): string {
  if (results.length === 0) {
    return `WEB SEARCH: no results for "${query}". Try broader wording or different operators.`;
  }

  const header = `WEB SEARCH RESULTS for "${query}" (${results.length} result${results.length === 1 ? '' : 's'})`;
  let block = header;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const lines: string[] = [`[${i + 1}] ${r.title ?? '(untitled)'}`];
    if (r.url) lines.push(`URL: ${r.url}`);
    const meta: string[] = [];
    if (r.site_name) meta.push(r.site_name);
    if (r.date) meta.push(r.date);
    if (typeof r.rerank_score === 'number') meta.push(`score ${r.rerank_score.toFixed(1)}`);
    if (typeof r.authority === 'number' && r.authority >= 0) meta.push(`authority ${r.authority}`);
    if (meta.length > 0) lines.push(meta.join(' · '));
    if (r.snippet) lines.push(`Snippet: ${r.snippet}`);
    // Prefer the model-ready summary, falling back to page content when present.
    const body = r.summary && r.summary.length > 0 ? r.summary : (r.content ?? '');
    if (body) lines.push(`Summary: ${body}`);

    const entry = lines.join('\n');
    if (block.length + entry.length + 2 > SEARCH_RESULT_CHAR_LIMIT) break;
    block += `\n\n${entry}`;
  }

  return block;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run a DeepSeek Search request. Throws on transport/API errors so the tool
 * loop can surface a readable failure to the model; `billable` is only true
 * when the request succeeded and returned at least one result.
 */
export async function executeWebSearch(query: string, options: WebSearchOptions = {}): Promise<WebSearchResponse> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    throw new Error('Search query must not be empty.');
  }

  const apiKey = getWebSearchApiKey();
  if (!apiKey) {
    throw new Error('Web search requires a DeepSeek API key. Add one in Settings → Providers.');
  }

  const res = await fetch(`${DEEPSEEK_TOOLS_BASE_URL}/v1/tools/search`, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify({
      query: truncate(trimmed, 128),
      count: clampCount(options.count),
      need_content: false,
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    throw new Error(`Web search failed (${await readError(res)})`);
  }

  const data = (await res.json()) as RawSearchResponse;
  const rawResults = Array.isArray(data.results) ? data.results : [];
  const selected = selectResults(rawResults);

  return {
    text: formatSearchBlock(trimmed, selected),
    resultCount: selected.length,
    billable: rawResults.length > 0,
  };
}

/**
 * Fetch a single page as Markdown. Throws on transport/API errors; `billable`
 * is only true when the page returned usable content.
 */
export async function executeFetch(url: string, options: { signal?: AbortSignal } = {}): Promise<WebFetchResponse> {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    throw new Error('URL must not be empty.');
  }

  const apiKey = getWebSearchApiKey();
  if (!apiKey) {
    throw new Error('Fetch requires a DeepSeek API key. Add one in Settings → Providers.');
  }

  const res = await fetch(`${DEEPSEEK_TOOLS_BASE_URL}/v1/tools/fetch`, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify({ url: trimmed }),
    signal: options.signal,
  });

  if (!res.ok) {
    throw new Error(`Fetch failed (${await readError(res)})`);
  }

  const data = (await res.json()) as RawFetchResponse;
  const content = typeof data.content === 'string' ? data.content : '';
  if (content.trim().length === 0) {
    return { text: `FETCH: no extractable content for ${trimmed}`, billable: false };
  }

  const title = typeof data.title === 'string' && data.title.trim().length > 0 ? data.title.trim() : trimmed;
  const header = `FETCHED PAGE: ${title}\nURL: ${trimmed}\n\n`;
  const budget = Math.max(0, SEARCH_RESULT_CHAR_LIMIT - header.length);
  const body = truncate(content, budget);

  return {
    text: `${header}${body}${content.length > budget ? `\n\n[TRUNCATED at ${SEARCH_RESULT_CHAR_LIMIT} chars]` : ''}`,
    billable: true,
  };
}
