import { registerLazySummaryHandler, requestLazySummary } from '../summaryScheduler';

type SchedulerModule = typeof import('../summaryScheduler');

describe('summaryScheduler', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does nothing when no handler has been registered', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const scheduler = require('../summaryScheduler') as SchedulerModule;
      expect(() => scheduler.requestLazySummary('msg-none', 'content')).not.toThrow();
    });
  });

  it('forwards requests to the registered handler', async () => {
    const handler = jest.fn<Promise<void>, [string, string]>().mockResolvedValue(undefined);
    registerLazySummaryHandler(handler);

    requestLazySummary('msg-lazy', 'Long content');
    await Promise.resolve();

    expect(handler).toHaveBeenCalledWith('msg-lazy', 'Long content');
  });

  it('logs and swallows handler failures', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation((): void => undefined);
    registerLazySummaryHandler((): Promise<void> => Promise.reject(new Error('boom')));

    requestLazySummary('msg-fail', 'content');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(warnSpy).toHaveBeenCalledWith(
      '[summary-scheduler] Lazy summary generation failed:',
      'msg-fail',
      expect.any(Error),
    );
  });
});
