export function createLlmWorker(): Worker {
  return new Worker(new URL('./llmWorker.ts', import.meta.url), {
    type: 'module',
  });
}