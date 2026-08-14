import { buildPartGenerationPrompt, buildSingleQuestionPrompt, CURATOR_VOICE_RULES } from './constants';

describe('buildPartGenerationPrompt', () => {
  it('sends the answer spine and current part instead of the full outline', () => {
    const prompt = buildPartGenerationPrompt(
      2,
      3,
      'Course Title',
      'Question?',
      'The answer spine.',
      'Part 2 Title',
      'The core idea.',
      'paradox',
      'story',
      '1. Part 1 Title',
      'Part 3 Title',
    );

    expect(prompt).toContain('The answer spine.');
    expect(prompt).toContain('This part\'s single core idea: The core idea.');
    expect(prompt).not.toContain('Course outline');
  });

  it('removes clickbait phrasing and includes the voice rules', () => {
    const prompt = buildPartGenerationPrompt(1, 3, 'Course', 'Q?', 'Spine', 'Title', 'Idea', 'question', 'story', '', 'Next');

    expect(prompt).not.toContain('irresistible');
    expect(prompt).not.toContain('NEED to keep reading');
    expect(prompt).toContain('curiosity gap without exaggeration');
    expect(prompt).toContain('Drama comes from facts');
  });
});

describe('buildSingleQuestionPrompt', () => {
  it('does not force zero prerequisites for advanced learners', () => {
    const prompt = buildSingleQuestionPrompt('subtopic', 'category', 'classics', 'flavor instructions', '', '', 'advanced');

    expect(prompt).not.toContain('Assume no prerequisites');
    expect(prompt).toContain('may assume familiarity');
  });

  it('requires zero prerequisites for beginners', () => {
    const prompt = buildSingleQuestionPrompt('subtopic', 'category', 'classics', 'flavor instructions', '', '', 'beginner');

    expect(prompt).toContain('assume zero prerequisites');
  });
});

describe('CURATOR_VOICE_RULES', () => {
  it('contains anti-hype and specificity rules', () => {
    expect(CURATOR_VOICE_RULES).toContain('Ban hype words');
    expect(CURATOR_VOICE_RULES).toContain('Specific beats dramatic');
  });
});
