import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function OkChild(): React.ReactElement {
  return <div>Healthy child</div>;
}

function ThrowingChild(): React.ReactElement {
  throw new Error('Boom from child');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <OkChild />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Healthy child')).toBeInTheDocument();
  });

  it('renders fallback UI when a child throws', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation((): void => undefined);

    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    expect(screen.getByText('The application encountered an unexpected error and has crashed.')).toBeInTheDocument();
    expect(screen.getByText('Boom from child')).toBeInTheDocument();

    errorSpy.mockRestore();
  });
});
