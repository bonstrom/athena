import { render, screen, waitFor } from '@testing-library/react';
import { BuildVersion } from './BuildVersion';

describe('BuildVersion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders fetched build version when response is valid text', async () => {
    const mockFetch = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
    Object.defineProperty(globalThis, 'fetch', {
      value: mockFetch,
      writable: true,
    });

    const response = {
      ok: true,
      headers: {
        get: (name: string): string | null => (name === 'content-type' ? 'text/plain' : null),
      },
      text: (): Promise<string> => Promise.resolve('2026.04.17\n'),
    } as unknown as Response;

    mockFetch.mockResolvedValue(response);

    render(<BuildVersion />);

    await waitFor(() => {
      expect(screen.getByText('2026.04.17')).toBeInTheDocument();
    });
  });

  it('falls back to unknown when fetch returns HTML', async () => {
    const mockFetch = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
    Object.defineProperty(globalThis, 'fetch', {
      value: mockFetch,
      writable: true,
    });

    const response = {
      ok: true,
      headers: {
        get: (name: string): string | null => (name === 'content-type' ? 'text/html' : null),
      },
      text: (): Promise<string> => Promise.resolve('<html></html>'),
    } as unknown as Response;

    mockFetch.mockResolvedValue(response);

    render(<BuildVersion />);

    await waitFor(() => {
      expect(screen.getByText('unknown')).toBeInTheDocument();
    });
  });

  it('falls back to unknown when response is not ok', async () => {
    const mockFetch = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
    Object.defineProperty(globalThis, 'fetch', {
      value: mockFetch,
      writable: true,
    });

    const response = {
      ok: false,
      headers: {
        get: (): string | null => null,
      },
      text: (): Promise<string> => Promise.resolve('ignored'),
    } as unknown as Response;

    mockFetch.mockResolvedValue(response);

    render(<BuildVersion />);

    await waitFor(() => {
      expect(screen.getByText('unknown')).toBeInTheDocument();
    });
  });
});
