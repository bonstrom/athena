import { useEffect, useState } from 'react';
import { athenaDb } from '../database/AthenaDb';
import { embeddingService } from '../services/embeddingService';
import { useAuthStore } from '../store/AuthStore';

export interface BackfillProgress {
  done: number;
  total: number;
}

const BATCH_SIZE = 20;

export function useEmbeddingBackfill(): { backfillProgress: BackfillProgress | null } {
  const [backfillProgress, setBackfillProgress] = useState<BackfillProgress | null>(null);
  const { ragEnabled } = useAuthStore();

  useEffect(() => {
    if (!ragEnabled) return;

    // Use an object so the async closure can observe the updated value
    const cancellation = { cancelled: false };

    async function run(): Promise<void> {
      try {
        await embeddingService.loadModel();
      } catch (err) {
        console.warn('Embedding model failed to load; skipping backfill:', err);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (cancellation.cancelled) return;

      // Collect messages that need embedding
      const allMessages = await athenaDb.messages.filter((m) => !m.isDeleted && (m.embedding === undefined || m.embedding === null)).toArray();

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (cancellation.cancelled || allMessages.length === 0) return;

      let done = 0;
      const total = allMessages.length;
      setBackfillProgress({ done, total });

      for (let i = 0; i < allMessages.length; i += BATCH_SIZE) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (cancellation.cancelled) break;

        const batch = allMessages.slice(i, i + BATCH_SIZE);

        for (const message of batch) {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (cancellation.cancelled) break;
          if (!message.content.trim()) {
            done++;
            continue;
          }

          try {
            const vector = await embeddingService.generateEmbedding(message.content);
            await athenaDb.messages.update(message.id, { embedding: vector });
          } catch (err) {
            console.warn(`Failed to embed message ${message.id}:`, err);
          }

          done++;
        }

        setBackfillProgress({ done, total });

        // Yield to keep UI responsive between batches
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!cancellation.cancelled) {
        setBackfillProgress(null);
      }
    }

    void run();

    return () => {
      cancellation.cancelled = true;
    };
  }, [ragEnabled]);

  return { backfillProgress };
}
