interface ParsedOption {
  text: string;
  isCorrect: boolean;
  orderIndex: number;
}

interface ParsedQuestion {
  text: string;
  type: 'single' | 'multi' | 'open' | 'arrange' | 'truefalse' | 'reorder' | 'matching' | 'fillblank' | 'slider' | 'droppin';
  options: ParsedOption[];
  correctAnswer?: string;
}

export function parseBulk(input: string): ParsedQuestion[] {
  const lines = input.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const result: ParsedQuestion[] = [];
  let current: ParsedQuestion | null = null;
  let orderIdx = 0;

  const push = () => { if (current) result.push(current); };

  for (const line of lines) {
    // --- Question starters ---
    if (line.startsWith('#> ')) {
      push();
      current = { text: line.slice(3).trim(), type: 'reorder', options: [] };
      orderIdx = 0;
    } else if (line.startsWith('#?f ')) {
      push();
      current = {
        text: line.slice(4).trim(), type: 'truefalse',
        options: [
          { text: "To'g'ri", isCorrect: false, orderIndex: 0 },
          { text: "Noto'g'ri", isCorrect: true, orderIndex: 1 },
        ],
      };
    } else if (line.startsWith('#? ')) {
      push();
      current = {
        text: line.slice(3).trim(), type: 'truefalse',
        options: [
          { text: "To'g'ri", isCorrect: true, orderIndex: 0 },
          { text: "Noto'g'ri", isCorrect: false, orderIndex: 1 },
        ],
      };
    } else if (line.startsWith('#= ')) {
      push();
      current = { text: line.slice(3).trim(), type: 'fillblank', options: [] };
      orderIdx = 0;
    } else if (line.startsWith('#| ')) {
      push();
      current = { text: line.slice(3).trim(), type: 'matching', options: [] };
      orderIdx = 0;
    } else if (line.startsWith('#$ ')) {
      // Slider question: #$ Savol matni
      push();
      current = { text: line.slice(3).trim(), type: 'slider', options: [] };
      orderIdx = 0;
    } else if (line.startsWith('#@ ')) {
      // Drop pin question: #@ Savol matni
      push();
      current = { text: line.slice(3).trim(), type: 'droppin', options: [] };
      orderIdx = 0;
    } else if (line.startsWith('#~ ')) {
      // Explicit open question (with + correct variants and @ AI hint)
      push();
      current = { text: line.slice(3).trim(), type: 'open', options: [] };
      orderIdx = 0;
    } else if (line.startsWith('# ')) {
      push();
      current = { text: line.slice(2).trim(), type: 'open', options: [] };
      orderIdx = 0;
    }

    // --- Option lines ---
    else if (line.startsWith('> ') && current?.type === 'arrange') {
      current.options.push({ text: line.slice(2).trim(), isCorrect: true, orderIndex: orderIdx++ });
    } else if (line.startsWith('> ') && current?.type === 'reorder') {
      current.options.push({ text: line.slice(2).trim(), isCorrect: true, orderIndex: orderIdx++ });
    } else if (line.startsWith('~ ') && current) {
      current.options.push({ text: line.slice(2).trim(), isCorrect: false, orderIndex: 0 });
    } else if (line.startsWith('= ') && current) {
      current.correctAnswer = line.slice(2).trim();
    } else if (line.startsWith('| ') && current?.type === 'matching') {
      // | left :: right
      const parts = line.slice(2).split('::');
      if (parts.length >= 2) {
        const left = parts[0].trim();
        const right = parts.slice(1).join('::').trim();
        current.options.push({ text: left, isCorrect: true, orderIndex: orderIdx });
        current.options.push({ text: right, isCorrect: false, orderIndex: orderIdx });
        orderIdx++;
      }
    } else if (line.startsWith('@ ') && current?.type === 'open') {
      // AI prompt hint (max 30 chars)
      current.correctAnswer = line.slice(2).trim().slice(0, 30);
    } else if (line.startsWith('+ ') && current) {
      current.options.push({ text: line.slice(2).trim(), isCorrect: true, orderIndex: 0 });
    } else if (line.startsWith('- ') && current) {
      current.options.push({ text: line.slice(2).trim(), isCorrect: false, orderIndex: 0 });
    }
    // arrange via >
    else if (line.startsWith('> ') && current) {
      current.type = 'arrange';
      current.options.push({ text: line.slice(2).trim(), isCorrect: true, orderIndex: orderIdx++ });
    }
  }

  push();

  return result.map((q) => {
    if (['arrange', 'reorder', 'truefalse', 'matching', 'fillblank', 'slider', 'droppin'].includes(q.type)) return q;
    const correctCount = q.options.filter((o) => o.isCorrect).length;
    if (q.options.length === 0) { q.type = 'open'; return q; }
    if (correctCount === 0) return null;
    if (correctCount >= 2) q.type = 'multi';
    else q.type = 'single';
    return q;
  }).filter((q): q is ParsedQuestion => q !== null);
}
