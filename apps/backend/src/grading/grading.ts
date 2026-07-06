import {
  GradableQuestion,
  GradeInput,
  OpenAnswerChecker,
  FillBlankAnswerChecker,
} from './grading.types';

const ARABIC_DIACRITICS_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const LATIN_COMBINING_RE = /[\u0300-\u036f]/g;
const UZ_CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'j',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'x',
  ц: 's',
  ч: 'ch',
  ш: 'sh',
  щ: 'sh',
  ъ: '',
  ы: 'i',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  қ: 'q',
  ғ: "g'",
  ҳ: 'h',
  ў: "o'",
};

export function normalizeAnswerText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(ARABIC_DIACRITICS_RE, '')
    .replace(LATIN_COMBINING_RE, '')
    .replace(/\u0640/g, '')
    .toLowerCase()
    .replace(/[а-яёқғҳў]/g, (char) => UZ_CYRILLIC_TO_LATIN[char] ?? char)
    .replace(/[’‘`´ʻʼʹ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function answerTextMatches(expected: string, actual: string): boolean {
  return normalizeAnswerText(expected) === normalizeAnswerText(actual);
}

export function evaluateObjectiveAnswer(
  questionType: string,
  correctOptionIds: string[],
  selectedOptionIds: string[],
): boolean {
  if (correctOptionIds.length === 0) return false;
  if (questionType === 'arrange') {
    return (
      correctOptionIds.length === selectedOptionIds.length &&
      correctOptionIds.every((id, i) => id === selectedOptionIds[i])
    );
  }
  const correctIds = new Set(correctOptionIds);
  const selectedIds = new Set(selectedOptionIds);
  return (
    correctIds.size === selectedIds.size &&
    [...correctIds].every((id) => selectedIds.has(id))
  );
}

export async function gradeAnswer(
  question: GradableQuestion,
  input: GradeInput,
  checkOpenAnswer: OpenAnswerChecker,
  checkFillBlankAnswer?: FillBlankAnswerChecker,
): Promise<boolean | null> {
  const { type, options, correctAnswer, text } = question;
  const { selectedOptionIds, textAnswer } = input;

  if (type === 'single' || type === 'multi') {
    const correctIds = options.filter((o) => o.isCorrect).map((o) => o.id);
    return evaluateObjectiveAnswer(type, correctIds, selectedOptionIds);
  }

  if (type === 'truefalse') {
    const correctIds = options.filter((o) => o.isCorrect).map((o) => o.id);
    return evaluateObjectiveAnswer('single', correctIds, selectedOptionIds);
  }

  if (type === 'arrange' || type === 'reorder') {
    const correctOrder = options
      .filter((o) => o.isCorrect)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((o) => o.id);
    return evaluateObjectiveAnswer('arrange', correctOrder, selectedOptionIds);
  }

  if (type === 'matching') {
    const lefts = options
      .filter((o) => o.isCorrect)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const rights = options
      .filter((o) => !o.isCorrect)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    if (lefts.length === 0 || lefts.length !== rights.length) return false;
    if (selectedOptionIds.length !== lefts.length * 2) return false;
    // To'g'ri juftliklar (chap -> o'ng) tartibdan qat'i nazar solishtiriladi,
    // chunki talaba chap elementlarni istalgan tartibda tanlashi mumkin.
    const correctPairs = new Map(lefts.map((l, i) => [l.id, rights[i].id]));
    const seenLeftIds = new Set<string>();
    for (let i = 0; i < selectedOptionIds.length; i += 2) {
      const leftId = selectedOptionIds[i];
      const rightId = selectedOptionIds[i + 1];
      if (seenLeftIds.has(leftId)) return false;
      seenLeftIds.add(leftId);
      if (correctPairs.get(leftId) !== rightId) return false;
    }
    return true;
  }

  if (type === 'fillblank') {
    if (correctAnswer && textAnswer?.trim()) {
      const exact = answerTextMatches(correctAnswer, textAnswer);
      if (exact) return true;
      // Xom taqqoslash mos kelmasa, AI orqali faqat yozilish (harakat/katta-kichik harf/
      // lotin-kirill) farqi ekanini tekshiramiz — ma'no farqiga yoki chin xatoga yo'l qo'ymaymiz.
      if (checkFillBlankAnswer)
        return checkFillBlankAnswer(correctAnswer, textAnswer);
      return false;
    }
    return null;
  }

  if (type === 'open') {
    if (!textAnswer?.trim()) return null;
    const manualOptions = options.filter((o) => o.isCorrect);
    if (manualOptions.length > 0) {
      const exact = manualOptions.some((o) =>
        answerTextMatches(o.text, textAnswer),
      );
      if (exact) return true;
      if (correctAnswer && answerTextMatches(correctAnswer, textAnswer))
        return true;
      if (correctAnswer)
        return checkOpenAnswer(text, correctAnswer, textAnswer);
      return false;
    }
    if (correctAnswer && answerTextMatches(correctAnswer, textAnswer))
      return true;
    if (correctAnswer) return checkOpenAnswer(text, correctAnswer, textAnswer);
    return null;
  }

  if (type === 'slider') {
    if (correctAnswer && textAnswer?.trim()) {
      const correct = parseFloat(correctAnswer);
      const student = parseFloat(textAnswer.trim());
      const tolerance = options[2] ? parseFloat(options[2].text) : 1;
      return !isNaN(student) && Math.abs(student - correct) <= tolerance;
    }
    return null;
  }

  if (type === 'droppin') {
    if (correctAnswer && textAnswer?.trim()) {
      const [cx, cy] = correctAnswer.split(',').map(Number);
      const [sx, sy] = textAnswer.trim().split(',').map(Number);
      const dist = Math.sqrt((cx - sx) ** 2 + (cy - sy) ** 2);
      const radiusPct = options[0] ? parseFloat(options[0].text) / 100 : 0.08;
      return dist <= radiusPct;
    }
    return null;
  }

  return null;
}
