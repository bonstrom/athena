export type LazySummaryHandler = (messageId: string, content: string) => Promise<void> | void;

let lazySummaryHandler: LazySummaryHandler | null = null;

/**
 * Registers the function used to generate summaries on demand. ChatStore owns
 * the model, cost accounting, and database updates, so it provides the handler
 * while TopicStore decides which messages are actually needed in a prompt.
 */
export function registerLazySummaryHandler(handler: LazySummaryHandler): void {
  lazySummaryHandler = handler;
}

/**
 * Requests a summary for a message that was just represented by a preview.
 * Generation runs in the background; the current request keeps using the
 * preview and a later request can use the stored summary.
 */
export function requestLazySummary(messageId: string, content: string): void {
  const handler = lazySummaryHandler;
  if (!handler) return;

  void Promise.resolve(handler(messageId, content)).catch((err: unknown) => {
    console.warn('[summary-scheduler] Lazy summary generation failed:', messageId.slice(0, 8), err);
  });
}
