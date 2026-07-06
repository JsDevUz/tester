import { GradableQuestion, GradeInput, OpenAnswerChecker } from './grading.types';

export function evaluateObjectiveAnswer(
  questionType: string,
  correctOptionIds: string[],
  selectedOptionIds: string[],
): boolean {
  if (correctOptionIds.length === 0) return false;
  if (questionType === 'arrange') {
    return correctOptionIds.length === selectedOptionIds.length &&
      correctOptionIds.every((id, i) => id === selectedOptionIds[i]);
  }
  const correctIds = new Set(correctOptionIds);
  const selectedIds = new Set(selectedOptionIds);
  return correctIds.size === selectedIds.size &&
    [...correctIds].every((id) => selectedIds.has(id));
}

export async function gradeAnswer(
  question: GradableQuestion,
  input: GradeInput,
  checkOpenAnswer: OpenAnswerChecker,
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
    const lefts = options.filter((o) => o.isCorrect).sort((a, b) => a.orderIndex - b.orderIndex);
    const rights = options.filter((o) => !o.isCorrect).sort((a, b) => a.orderIndex - b.orderIndex);
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
      return correctAnswer.trim().toLowerCase() === textAnswer.trim().toLowerCase();
    }
    return null;
  }

  if (type === 'open') {
    if (!textAnswer?.trim()) return null;
    const manualOptions = options.filter((o) => o.isCorrect);
    if (manualOptions.length > 0) {
      const exact = manualOptions.some((o) => o.text.trim().toLowerCase() === textAnswer.trim().toLowerCase());
      if (exact) return true;
      if (correctAnswer) return checkOpenAnswer(text, correctAnswer, textAnswer);
      return false;
    }
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
