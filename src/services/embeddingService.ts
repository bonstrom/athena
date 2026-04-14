import { Message } from '../database/AthenaDb';

export interface ScoredMessage {
  message: Message;
  score: number;
}

type EmbeddingStatus = 'idle' | 'loading' | 'ready' | 'error';

interface PendingEmbedding {
  resolve: (vector: number[]) => void;
  reject: (err: Error) => void;
}

class EmbeddingService {
  private worker: Worker | null = null;
  private status: EmbeddingStatus = 'idle';
  private readyListeners: (() => void)[] = [];
  private pendingEmbeddings = new Map<string, PendingEmbedding>();
  private requestCounter = 0;

  get isReady(): boolean {
    return this.status === 'ready';
  }

  async loadModel(): Promise<void> {
    if (this.status === 'ready') return;
    if (this.status === 'loading') {
      return new Promise<void>((resolve) => {
        this.readyListeners.push(resolve);
      });
    }

    this.status = 'loading';
    this.worker = new Worker(new URL('./embeddingWorker.ts', import.meta.url));

    this.worker.onmessage = (event: MessageEvent<{ type: string; status?: string; id?: string; vector?: number[]; error?: string }>): void => {
      const { type, status, id, vector, error } = event.data;

      if (type === 'status') {
        if (status === 'ready') {
          this.status = 'ready';
          for (const listener of this.readyListeners) listener();
          this.readyListeners = [];
        } else if (status === 'unloaded') {
          this.status = 'idle';
        }
      } else if (type === 'embedding' && id !== undefined && vector !== undefined) {
        const pending = this.pendingEmbeddings.get(id);
        if (pending) {
          this.pendingEmbeddings.delete(id);
          pending.resolve(vector);
        }
      } else if (type === 'error') {
        if (id !== undefined) {
          const pending = this.pendingEmbeddings.get(id);
          if (pending) {
            this.pendingEmbeddings.delete(id);
            pending.reject(new Error(error ?? 'Unknown embedding error'));
          }
        } else {
          this.status = 'error';
          console.error('Embedding worker error:', error);
        }
      }
    };

    this.worker.onerror = (e): void => {
      console.error('Embedding worker crashed:', e);
      this.status = 'error';
    };

    return new Promise<void>((resolve, reject) => {
      this.readyListeners.push(resolve);
      // Reject if model fails to load within 60s
      const timeout = setTimeout(() => {
        if (this.status !== 'ready') {
          this.status = 'error';
          reject(new Error('Embedding model load timed out'));
        }
      }, 60_000);

      const originalResolve = resolve;
      this.readyListeners[this.readyListeners.length - 1] = (): void => {
        clearTimeout(timeout);
        originalResolve();
      };

      this.worker?.postMessage({ type: 'load' });
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.worker || this.status !== 'ready') {
      throw new Error('Embedding model not ready');
    }

    const id = String(++this.requestCounter);

    return new Promise<number[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingEmbeddings.delete(id)) {
          reject(new Error('Embedding generation timed out'));
        }
      }, 30_000);

      this.pendingEmbeddings.set(id, {
        resolve: (vector: number[]): void => {
          clearTimeout(timeout);
          resolve(vector);
        },
        reject: (err: Error): void => {
          clearTimeout(timeout);
          reject(err);
        },
      });
      this.worker?.postMessage({ type: 'embed', id, text: text.slice(0, 512) });
    });
  }

  cosineSimilarity(a: number[], b: number[]): number {
    // Vectors are L2-normalized unit vectors, so dot product = cosine similarity
    let dot = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }

  async searchSimilarMessages(query: string, candidates: Message[], topK: number): Promise<ScoredMessage[]> {
    if (!this.isReady || candidates.length === 0) return [];

    const queryVec = await this.generateEmbedding(query);

    return (
      candidates
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        .filter((m): m is typeof m & { embedding: number[] } => Array.isArray(m.embedding) && (m.embedding as any).length > 0)
        .map((m) => ({
          message: m,
          score: this.cosineSimilarity(queryVec, m.embedding),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
    );
  }

  unload(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'unload' });
      this.worker.terminate();
      this.worker = null;
    }
    this.status = 'idle';
    this.pendingEmbeddings.clear();
  }
}

export const embeddingService = new EmbeddingService();
