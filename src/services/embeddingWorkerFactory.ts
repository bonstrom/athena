export function createEmbeddingWorker(): Worker {
  return new Worker(new URL('./embeddingWorker.ts', import.meta.url));
}
