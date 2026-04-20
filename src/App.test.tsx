import type { JSX, ReactElement, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('react-router-dom', () => {
  function MockHashRouter({ children }: { children: ReactNode }): JSX.Element {
    return <div data-testid="router">{children}</div>;
  }

  function MockRoutes({ children }: { children: ReactNode }): JSX.Element {
    return <>{children}</>;
  }

  function MockRoute({ element }: { element: ReactElement }): ReactElement {
    return element;
  }

  MockHashRouter.displayName = 'MockHashRouter';
  MockRoutes.displayName = 'MockRoutes';
  MockRoute.displayName = 'MockRoute';

  return {
    __esModule: true,
    HashRouter: MockHashRouter,
    Routes: MockRoutes,
    Route: MockRoute,
  };
});

jest.mock('./components/ChatLayout', () => {
  function MockChatLayout(): JSX.Element {
    return <div data-testid="chat-layout" />;
  }

  MockChatLayout.displayName = 'MockChatLayout';
  return MockChatLayout;
});
jest.mock('./components/GlobalErrorSnackbar', () => ({
  GlobalErrorSnackbar: function MockGlobalErrorSnackbar(): JSX.Element {
    return <div data-testid="global-error-snackbar" />;
  },
}));

jest.mock('./hooks/useAutoBackup', () => ({ useAutoBackup: jest.fn() }));
jest.mock('./hooks/useEmbeddingBackfill', () => ({ useEmbeddingBackfill: jest.fn() }));
jest.mock('./store/AuthStore', () => ({ useAuthStore: jest.fn() }));

jest.mock('./pages/Home', () => {
  function MockHomePage(): JSX.Element {
    return <div data-testid="home-page" />;
  }

  MockHomePage.displayName = 'MockHomePage';
  return MockHomePage;
});
jest.mock('./pages/Settings', () => {
  function MockSettingsPage(): JSX.Element {
    return <div data-testid="settings-page" />;
  }

  MockSettingsPage.displayName = 'MockSettingsPage';
  return MockSettingsPage;
});
jest.mock('./pages/ChatView', () => {
  function MockChatPage(): JSX.Element {
    return <div data-testid="chat-page" />;
  }

  MockChatPage.displayName = 'MockChatPage';
  return MockChatPage;
});

import App from './App';
import { useAutoBackup } from './hooks/useAutoBackup';
import { useEmbeddingBackfill } from './hooks/useEmbeddingBackfill';
import { useAuthStore } from './store/AuthStore';

const mockUseAuthStore = jest.mocked(useAuthStore);
const mockUseAutoBackup = jest.mocked(useAutoBackup);
const mockUseEmbeddingBackfill = jest.mocked(useEmbeddingBackfill);

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuthStore.mockReturnValue({ backupInterval: 5 });
});

test('renders app shell and triggers startup hooks', () => {
  render(<App />);

  expect(screen.getByTestId('router')).toBeInTheDocument();
  expect(screen.getByTestId('chat-layout')).toBeInTheDocument();
  expect(screen.getByTestId('global-error-snackbar')).toBeInTheDocument();
  expect(mockUseAutoBackup).toHaveBeenCalledWith(5);
  expect(mockUseEmbeddingBackfill).toHaveBeenCalled();
});
