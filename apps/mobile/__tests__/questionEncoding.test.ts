import { encodeChoiceOptions } from '../src/components/questionEditor/ChoiceTypeEditor';
import { encodeTrueFalse } from '../src/components/questionEditor/TrueFalseTypeEditor';
import { encodeReorder } from '../src/components/questionEditor/ReorderTypeEditor';
import { encodeArrange } from '../src/components/questionEditor/ArrangeTypeEditor';
import { encodeMatching } from '../src/components/questionEditor/MatchingTypeEditor';
import { encodeSlider } from '../src/components/questionEditor/SliderTypeEditor';
import { encodeDropPinRadius } from '../src/components/questionEditor/DropPinTypeEditor';

describe('encodeChoiceOptions', () => {
  it('passes through text/isCorrect pairs for single/multi choice', () => {
    const result = encodeChoiceOptions([
      { text: 'A', isCorrect: true },
      { text: 'B', isCorrect: false },
    ]);
    expect(result).toEqual([
      { text: 'A', isCorrect: true },
      { text: 'B', isCorrect: false },
    ]);
  });

  it('drops options with empty text', () => {
    const result = encodeChoiceOptions([
      { text: 'A', isCorrect: true },
      { text: '  ', isCorrect: false },
    ]);
    expect(result).toEqual([{ text: 'A', isCorrect: true }]);
  });
});

describe('encodeTrueFalse', () => {
  it('encodes "true" as the To\'g\'ri option being correct', () => {
    expect(encodeTrueFalse('true')).toEqual([
      { text: "To'g'ri", isCorrect: true, orderIndex: 0 },
      { text: "Noto'g'ri", isCorrect: false, orderIndex: 1 },
    ]);
  });

  it('encodes "false" as the Noto\'g\'ri option being correct', () => {
    expect(encodeTrueFalse('false')).toEqual([
      { text: "To'g'ri", isCorrect: false, orderIndex: 0 },
      { text: "Noto'g'ri", isCorrect: true, orderIndex: 1 },
    ]);
  });
});

describe('encodeReorder', () => {
  it('encodes tokens as ordered, all-correct options', () => {
    expect(encodeReorder(['first', 'second', 'third'])).toEqual([
      { text: 'first', isCorrect: true, orderIndex: 0 },
      { text: 'second', isCorrect: true, orderIndex: 1 },
      { text: 'third', isCorrect: true, orderIndex: 2 },
    ]);
  });

  it('drops blank tokens', () => {
    expect(encodeReorder(['first', '  ', 'third'])).toEqual([
      { text: 'first', isCorrect: true, orderIndex: 0 },
      { text: 'third', isCorrect: true, orderIndex: 1 },
    ]);
  });
});

describe('encodeArrange', () => {
  it('encodes correct tokens (ordered) plus distractors (unordered, isCorrect false)', () => {
    expect(encodeArrange(['a', 'b'], ['x', 'y'])).toEqual([
      { text: 'a', isCorrect: true, orderIndex: 0 },
      { text: 'b', isCorrect: true, orderIndex: 1 },
      { text: 'x', isCorrect: false, orderIndex: 0 },
      { text: 'y', isCorrect: false, orderIndex: 0 },
    ]);
  });
});

describe('encodeMatching', () => {
  it('flattens left/right pairs into isCorrect-tagged options sharing an orderIndex per pair', () => {
    expect(encodeMatching([{ left: 'cat', right: 'mushuk' }, { left: 'dog', right: "it" }])).toEqual([
      { text: 'cat', isCorrect: true, orderIndex: 0 },
      { text: 'mushuk', isCorrect: false, orderIndex: 0 },
      { text: 'dog', isCorrect: true, orderIndex: 1 },
      { text: 'it', isCorrect: false, orderIndex: 1 },
    ]);
  });

  it('drops pairs missing either side', () => {
    expect(encodeMatching([{ left: 'cat', right: 'mushuk' }, { left: '', right: 'it' }])).toEqual([
      { text: 'cat', isCorrect: true, orderIndex: 0 },
      { text: 'mushuk', isCorrect: false, orderIndex: 0 },
    ]);
  });
});

describe('encodeSlider', () => {
  it('encodes min/max/step as three ordered options, defaulting blanks', () => {
    expect(encodeSlider('0', '100', '5')).toEqual([
      { text: '0', isCorrect: false, orderIndex: 0 },
      { text: '100', isCorrect: false, orderIndex: 1 },
      { text: '5', isCorrect: false, orderIndex: 2 },
    ]);
  });

  it('defaults to 0/100/1 when fields are blank', () => {
    expect(encodeSlider('', '', '')).toEqual([
      { text: '0', isCorrect: false, orderIndex: 0 },
      { text: '100', isCorrect: false, orderIndex: 1 },
      { text: '1', isCorrect: false, orderIndex: 2 },
    ]);
  });
});

describe('encodeDropPinRadius', () => {
  it('encodes the radius percentage as a single option', () => {
    expect(encodeDropPinRadius('8')).toEqual([{ text: '8', isCorrect: false, orderIndex: 0 }]);
  });

  it('defaults to 8 when blank', () => {
    expect(encodeDropPinRadius('')).toEqual([{ text: '8', isCorrect: false, orderIndex: 0 }]);
  });
});
