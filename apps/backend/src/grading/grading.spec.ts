import { gradeAnswer, evaluateObjectiveAnswer, type GradableQuestion } from './grading';

const noopChecker = async () => false;

function q(overrides: Partial<GradableQuestion & { text: string }>): GradableQuestion & { text: string } {
  return { type: 'single', correctAnswer: null, options: [], text: 'Q?', ...overrides };
}

describe('evaluateObjectiveAnswer', () => {
  it('single: exact match is correct', () => {
    expect(evaluateObjectiveAnswer('single', ['a'], ['a'])).toBe(true);
  });
  it('multi: set equality regardless of order', () => {
    expect(evaluateObjectiveAnswer('multi', ['a', 'b'], ['b', 'a'])).toBe(true);
  });
  it('arrange: exact order required', () => {
    expect(evaluateObjectiveAnswer('arrange', ['a', 'b'], ['b', 'a'])).toBe(false);
    expect(evaluateObjectiveAnswer('arrange', ['a', 'b'], ['a', 'b'])).toBe(true);
  });
  it('empty correct set is never correct', () => {
    expect(evaluateObjectiveAnswer('single', [], [])).toBe(false);
  });
});

describe('gradeAnswer', () => {
  it('single: correct option selected', async () => {
    const question = q({ type: 'single', options: [
      { id: 'o1', text: 'A', isCorrect: false, orderIndex: 0 },
      { id: 'o2', text: 'B', isCorrect: true, orderIndex: 1 },
    ] });
    const result = await gradeAnswer(question, { selectedOptionIds: ['o2'], textAnswer: null }, noopChecker);
    expect(result).toBe(true);
  });

  it('truefalse: treated as single-select', async () => {
    const question = q({ type: 'truefalse', options: [
      { id: 'o1', text: "To'g'ri", isCorrect: true, orderIndex: 0 },
      { id: 'o2', text: "Noto'g'ri", isCorrect: false, orderIndex: 1 },
    ] });
    const result = await gradeAnswer(question, { selectedOptionIds: ['o1'], textAnswer: null }, noopChecker);
    expect(result).toBe(true);
  });

  it('arrange: correct order by orderIndex among isCorrect options', async () => {
    const question = q({ type: 'arrange', options: [
      { id: 'o1', text: 'First', isCorrect: true, orderIndex: 0 },
      { id: 'o2', text: 'Second', isCorrect: true, orderIndex: 1 },
    ] });
    const correct = await gradeAnswer(question, { selectedOptionIds: ['o1', 'o2'], textAnswer: null }, noopChecker);
    expect(correct).toBe(true);
    const wrong = await gradeAnswer(question, { selectedOptionIds: ['o2', 'o1'], textAnswer: null }, noopChecker);
    expect(wrong).toBe(false);
  });

  it('matching: pairs must line up left/right by orderIndex', async () => {
    const question = q({ type: 'matching', options: [
      { id: 'l1', text: 'Left1', isCorrect: true, orderIndex: 0 },
      { id: 'l2', text: 'Left2', isCorrect: true, orderIndex: 1 },
      { id: 'r1', text: 'Right1', isCorrect: false, orderIndex: 0 },
      { id: 'r2', text: 'Right2', isCorrect: false, orderIndex: 1 },
    ] });
    const correct = await gradeAnswer(question, { selectedOptionIds: ['l1', 'r1', 'l2', 'r2'], textAnswer: null }, noopChecker);
    expect(correct).toBe(true);
    const wrong = await gradeAnswer(question, { selectedOptionIds: ['l1', 'r2', 'l2', 'r1'], textAnswer: null }, noopChecker);
    expect(wrong).toBe(false);
  });

  it('fillblank: case-insensitive exact text match', async () => {
    const question = q({ type: 'fillblank', correctAnswer: 'Toshkent' });
    const correct = await gradeAnswer(question, { selectedOptionIds: [], textAnswer: 'toshkent' }, noopChecker);
    expect(correct).toBe(true);
    const wrong = await gradeAnswer(question, { selectedOptionIds: [], textAnswer: 'Samarqand' }, noopChecker);
    expect(wrong).toBe(false);
  });

  it('fillblank: no answer given returns null (ungraded), not false', async () => {
    const question = q({ type: 'fillblank', correctAnswer: 'Toshkent' });
    const result = await gradeAnswer(question, { selectedOptionIds: [], textAnswer: '' }, noopChecker);
    expect(result).toBe(null);
  });

  it('open: exact match against a manual correct option short-circuits the AI checker', async () => {
    const question = q({ type: 'open', options: [
      { id: 'o1', text: 'Parij', isCorrect: true, orderIndex: 0 },
    ] });
    let checkerCalled = false;
    const checker = async () => { checkerCalled = true; return false; };
    const result = await gradeAnswer(question, { selectedOptionIds: [], textAnswer: 'parij' }, checker);
    expect(result).toBe(true);
    expect(checkerCalled).toBe(false);
  });

  it('open: falls back to AI checker when no manual option matches but a correctAnswer hint exists', async () => {
    const question = q({ type: 'open', correctAnswer: 'Parij shahri', options: [] });
    const checker = async () => true;
    const result = await gradeAnswer(question, { selectedOptionIds: [], textAnswer: 'Fransiya poytaxti' }, checker);
    expect(result).toBe(true);
  });

  it('slider: within tolerance (options[2].text) counts as correct', async () => {
    const question = q({ type: 'slider', correctAnswer: '50', options: [
      { id: 'o1', text: '0', isCorrect: false, orderIndex: 0 },
      { id: 'o2', text: '100', isCorrect: false, orderIndex: 1 },
      { id: 'o3', text: '5', isCorrect: false, orderIndex: 2 },
    ] });
    const correct = await gradeAnswer(question, { selectedOptionIds: [], textAnswer: '52' }, noopChecker);
    expect(correct).toBe(true);
    const wrong = await gradeAnswer(question, { selectedOptionIds: [], textAnswer: '80' }, noopChecker);
    expect(wrong).toBe(false);
  });

  it('droppin: within radius (options[0].text percent) counts as correct', async () => {
    const question = q({ type: 'droppin', correctAnswer: '0.5,0.5', options: [
      { id: 'o1', text: '10', isCorrect: false, orderIndex: 0 },
    ] });
    const correct = await gradeAnswer(question, { selectedOptionIds: [], textAnswer: '0.52,0.51' }, noopChecker);
    expect(correct).toBe(true);
    const wrong = await gradeAnswer(question, { selectedOptionIds: [], textAnswer: '0.9,0.9' }, noopChecker);
    expect(wrong).toBe(false);
  });
});
