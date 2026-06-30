interface ParsedOption {
  text: string;
  isCorrect: boolean;
}

interface ParsedQuestion {
  text: string;
  type: 'single' | 'multi' | 'open';
  options: ParsedOption[];
}

export function parseBulk(input: string): ParsedQuestion[] {
  const lines = input.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const result: ParsedQuestion[] = [];
  let current: ParsedQuestion | null = null;

  for (const line of lines) {
    if (line.startsWith('# ')) {
      if (current) result.push(finalize(current));
      current = { text: line.slice(2).trim(), type: 'open', options: [] };
    } else if (line.startsWith('+ ') && current) {
      current.options.push({ text: line.slice(2).trim(), isCorrect: true });
    } else if (line.startsWith('- ') && current) {
      current.options.push({ text: line.slice(2).trim(), isCorrect: false });
    }
  }

  if (current) result.push(finalize(current));
  return result;
}

function finalize(q: ParsedQuestion): ParsedQuestion {
  const correctCount = q.options.filter((o) => o.isCorrect).length;
  if (q.options.length === 0) q.type = 'open';
  else if (correctCount >= 2) q.type = 'multi';
  else q.type = 'single';
  return q;
}
