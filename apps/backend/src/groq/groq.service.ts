import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class GroqService {
  private readonly logger = new Logger(GroqService.name);

  async checkOpenAnswer(question: string, correctAnswer: string, studentAnswer: string): Promise<boolean | null> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      this.logger.warn('GROQ_API_KEY not set, skipping open answer check');
      return null;
    }

    const aLower = studentAnswer.toLowerCase().trim();
    const hintLower = correctAnswer.toLowerCase().trim();
    // Reject exact hint match (handled by exact-match before AI call, but safety net)
    if (aLower === hintLower) return true;

    const prompt = `You are a strict answer checker. Respond ONLY with "true" or "false".

Question: "${question}"
Correct answer: "${correctAnswer}"
Student answer: "${studentAnswer}"

Rules:
- The student answer must mean the SAME THING as the correct answer
- Spelling mistakes and language differences are OK if the meaning matches
- Synonyms that mean exactly the same thing are OK
- ACCEPT grammatical suffixes and a short sentence that directly states the answer (e.g. correct="hamza", student="hamzaga aylanadi" → true)
- ACCEPT a concise explanation when it unambiguously gives the same answer
- REJECT if the student answer is a related concept but not the same (e.g. correct="O'zbekiston", student="Toshkent" → false)
- REJECT if the student answer includes words from the question without adding the correct answer
- REJECT if the answer is vague, partial, or just restates the question topic

Reply with exactly one word: true or false`;

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 5,
          temperature: 0,
        }),
      });

      if (!res.ok) {
        this.logger.error(`Groq API error: ${res.status}`);
        return null;
      }

      const data = await res.json() as any;
      const answer = data.choices?.[0]?.message?.content?.trim().toLowerCase();
      return answer === 'true';
    } catch (e) {
      this.logger.error('Groq request failed', e);
      return null;
    }
  }

  // "fillblank" uchun: sinonimlarga emas, faqat yozilish farqlariga (arab harakatlari,
  // katta-kichik harf, lotin/kirill transliteratsiyasi) ruxsat beruvchi qat'iy tekshiruv.
  // Ma'nosi boshqacha yoki umuman boshqa so'z bo'lsa rad etiladi — "aldab o'tish"ga yo'l yo'q.
  async checkFillBlankAnswer(correctAnswer: string, studentAnswer: string): Promise<boolean | null> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      this.logger.warn('GROQ_API_KEY not set, skipping fillblank AI check');
      return null;
    }

    const prompt = `You are a strict spelling-variant checker for a fill-in-the-blank exercise. Respond ONLY with "true" or "false".

Correct answer: "${correctAnswer}"
Student answer: "${studentAnswer}"

Rules:
- Accept ONLY if the student answer is the SAME WORD/PHRASE as the correct answer, differing ONLY by:
  - presence/absence of Arabic diacritics (harakat) — e.g. "مَنْ" vs "من" → true
  - letter case (uppercase/lowercase) — e.g. "Salom" vs "salom" → true
  - Latin vs Cyrillic script transliteration of the same word — e.g. "salom" vs "салом" → true
  - minor punctuation/whitespace differences
- REJECT if it is a different word, a synonym, a related word, or has a different meaning, even if close
- REJECT if it is misspelled in a way that isn't just diacritics/case/script (a genuine spelling mistake is wrong)
- REJECT if the student answer is empty, vague, or unrelated

Reply with exactly one word: true or false`;

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 5,
          temperature: 0,
        }),
      });

      if (!res.ok) {
        this.logger.error(`Groq API error: ${res.status}`);
        return null;
      }

      const data = await res.json() as any;
      const answer = data.choices?.[0]?.message?.content?.trim().toLowerCase();
      return answer === 'true';
    } catch (e) {
      this.logger.error('Groq request failed', e);
      return null;
    }
  }
}
