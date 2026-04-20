import type { JSX } from 'react';

const mockReportWebVitals = jest.fn((): void => undefined);

jest.mock('./App', () => ({
  __esModule: true,
  default: function MockApp(): JSX.Element {
    return <div data-testid="app" />;
  },
}));

jest.mock('./reportWebVitals', () => ({
  __esModule: true,
  default: (): void => mockReportWebVitals(),
}));

jest.mock('./store/AuthStore', () => ({
  useAuthStore: (): { themeMode: 'light' | 'dark'; colorTheme: string } => ({ themeMode: 'dark', colorTheme: 'default' }),
}));

jest.mock('./theme', () => ({
  getAppTheme: (): object => ({}),
}));

describe('index.tsx bootstrap', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('creates root, renders app tree, and calls reportWebVitals', () => {
    document.body.innerHTML = '<div id="root"></div>';

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./index');
    });

    expect(mockReportWebVitals).toHaveBeenCalledTimes(1);
  });

  it('throws when root element is missing', () => {
    document.body.innerHTML = '';

    expect(() => {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./index');
      });
    }).toThrow('Failed to find the root element');
  });
});
