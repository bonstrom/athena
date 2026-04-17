import reportWebVitals from './reportWebVitals';
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

jest.mock('web-vitals', () => ({
  getCLS: jest.fn(),
  getFID: jest.fn(),
  getFCP: jest.fn(),
  getLCP: jest.fn(),
  getTTFB: jest.fn(),
}));

const mockGetCLS = getCLS as jest.MockedFunction<typeof getCLS>;
const mockGetFID = getFID as jest.MockedFunction<typeof getFID>;
const mockGetFCP = getFCP as jest.MockedFunction<typeof getFCP>;
const mockGetLCP = getLCP as jest.MockedFunction<typeof getLCP>;
const mockGetTTFB = getTTFB as jest.MockedFunction<typeof getTTFB>;

describe('reportWebVitals', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts a callback without throwing', () => {
    const handler = jest.fn<void, [unknown]>();

    expect(() => reportWebVitals(handler)).not.toThrow();
  });

  it('does nothing when callback is not provided', () => {
    reportWebVitals();

    expect(mockGetCLS).not.toHaveBeenCalled();
    expect(mockGetFID).not.toHaveBeenCalled();
    expect(mockGetFCP).not.toHaveBeenCalled();
    expect(mockGetLCP).not.toHaveBeenCalled();
    expect(mockGetTTFB).not.toHaveBeenCalled();
  });
});
