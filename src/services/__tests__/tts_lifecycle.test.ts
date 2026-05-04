import { speakText, stopSpeech } from '../mediaService';
import { useUiStore } from '../../store/UiStore';
import { generateMinimaxSpeech } from '../llmService';

jest.mock('../llmService', () => ({
  generateMinimaxSpeech: jest.fn(),
}));

jest.mock('../../store/AuthStore', () => ({
  useAuthStore: {
    getState: (): Record<string, unknown> => ({
      ttsVoiceId: 'test-voice',
    }),
  },
}));

const mockGenerateMinimaxSpeech = generateMinimaxSpeech as jest.MockedFunction<typeof generateMinimaxSpeech>;

interface MockAudio {
  play: jest.Mock<Promise<void>>;
  pause: jest.Mock<void>;
  addEventListener: jest.Mock<void, [string, EventListener]>;
  removeEventListener: jest.Mock<void>;
  src: string;
  load: jest.Mock<void>;
  removeAttribute: jest.Mock<void>;
}

describe('TTS Lifecycle', () => {
  let audioInstance: MockAudio;

  beforeEach(() => {
    jest.clearAllMocks();
    useUiStore.getState().setCurrentlySpeakingMessageId(null);

    // Mock Audio
    audioInstance = {
      play: jest.fn().mockResolvedValue(undefined) as unknown as jest.Mock<Promise<void>>,
      pause: jest.fn() as unknown as jest.Mock<void>,
      addEventListener: jest.fn() as unknown as jest.Mock<void, [string, EventListener]>,
      removeEventListener: jest.fn() as unknown as jest.Mock<void>,
      src: '',
      load: jest.fn() as unknown as jest.Mock<void>,
      removeAttribute: jest.fn() as unknown as jest.Mock<void>,
    };

    global.Audio = jest.fn().mockImplementation(() => audioInstance) as unknown as typeof Audio;
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = jest.fn();
  });

  it('speakText sets currentlySpeakingMessageId in UiStore', async () => {
    mockGenerateMinimaxSpeech.mockResolvedValue({ audioHex: 'aabbcc' });

    const speakPromise = speakText('Hello', 'msg-123');
    
    // Check if it set the ID immediately or after generation? 
    // In our implementation, it sets it after generation starts/finishes.
    await speakPromise;

    expect(useUiStore.getState().currentlySpeakingMessageId).toBe('msg-123');
    expect(audioInstance.play).toHaveBeenCalled();
  });

  it('stopSpeech clears currentlySpeakingMessageId and pauses audio', async () => {
    useUiStore.getState().setCurrentlySpeakingMessageId('msg-123');
    
    // We need to trigger speakText first to initialize currentAudio
    mockGenerateMinimaxSpeech.mockResolvedValue({ audioHex: 'aabbcc' });
    await speakText('Hello', 'msg-123');

    stopSpeech();

    expect(useUiStore.getState().currentlySpeakingMessageId).toBeNull();
    expect(audioInstance.pause).toHaveBeenCalled();
  });

  it('clears ID when audio ends', async () => {
    mockGenerateMinimaxSpeech.mockResolvedValue({ audioHex: 'aabbcc' });
    await speakText('Hello', 'msg-123');

    // Find the 'ended' listener and trigger it
    const endedCall = audioInstance.addEventListener.mock.calls.find(
      (call) => call[0] === 'ended'
    );
    
    if (endedCall) {
      endedCall[1]({} as Event);
    }

    expect(useUiStore.getState().currentlySpeakingMessageId).toBeNull();
  });

  it('clears ID when audio errors', async () => {
    mockGenerateMinimaxSpeech.mockResolvedValue({ audioHex: 'aabbcc' });
    await speakText('Hello', 'msg-123');

    // Find the 'error' listener and trigger it
    const errorCall = audioInstance.addEventListener.mock.calls.find(
      (call) => call[0] === 'error'
    );
    
    if (errorCall) {
      errorCall[1]({} as Event);
    }

    expect(useUiStore.getState().currentlySpeakingMessageId).toBeNull();
  });
});
