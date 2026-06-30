interface ParsedOption {
  text: string;
  isCorrect: boolean;
  orderIndex: number;
}

interface ParsedQuestion {
  text: string;
  type: 'single' | 'multi' | 'open' | 'arrange';
  options: ParsedOption[];
}

export function parseBulk(input: string): ParsedQuestion[] {
  const lines = input.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const result: ParsedQuestion[] = [];
  let current: ParsedQuestion | null = null;
  let arrangeCorrectIdx = 0;

  for (const line of lines) {
    if (line.startsWith('# ')) {
      if (current) result.push(current);
      current = { text: line.slice(2).trim(), type: 'open', options: [] };
      arrangeCorrectIdx = 0;
    } else if (line.startsWith('> ') && current) {
      // arrange: correct token in order
      current.type = 'arrange';
      current.options.push({ text: line.slice(2).trim(), isCorrect: true, orderIndex: arrangeCorrectIdx++ });
    } else if (line.startsWith('~ ') && current) {
      // arrange: distractor token
      current.type = 'arrange';
      current.options.push({ text: line.slice(2).trim(), isCorrect: false, orderIndex: 0 });
    } else if (line.startsWith('+ ') && current) {
      current.options.push({ text: line.slice(2).trim(), isCorrect: true, orderIndex: 0 });
    } else if (line.startsWith('- ') && current) {
      current.options.push({ text: line.slice(2).trim(), isCorrect: false, orderIndex: 0 });
    }
  }

  if (current) result.push(current);

  return result.map((q) => {
    if (q.type === 'arrange') return q;
    const correctCount = q.options.filter((o) => o.isCorrect).length;
    if (q.options.length === 0) q.type = 'open';
    else if (correctCount >= 2) q.type = 'multi';
    else q.type = 'single';
    return q;
  });
}
