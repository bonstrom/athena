import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    __esModule: true,
    HashRouter: ({ children }: { children: React.ReactNode }) => <div data-testid="router">{children}</div>,
    Routes: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Route: ({ element }: { element: React.ReactElement }) => element,
  };
});

jest.mock('./components/ChatLayout', () => () => <div data-testid="chat-layout" />);
jest.mock('./components/GlobalErrorSnackbar', () => ({
  GlobalErrorSnackbar: () => <div data-testid="global-error-snackbar" />,
}));

jest.mock('./hooks/useAutoBackup', () => ({ useAutoBackup: jest.fn() }));
jest.mock('./hooks/useEmbeddingBackfill', () => ({ useEmbeddingBackfill: jest.fn() }));
jest.mock('./store/AuthStore', () => ({ useAuthStore: jest.fn() }));

jest.mock('./pages/Home', () => () => <div data-testid="home-page" />);
jest.mock('./pages/Settings', () => () => <div data-testid="settings-page" />);
jest.mock('./pages/ChatView', () => () => <div data-testid="chat-page" />);

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
