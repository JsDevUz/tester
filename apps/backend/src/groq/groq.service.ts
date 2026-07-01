import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class GroqService {
  private readonly logger = new Logger(GroqService.name);

  async checkOpenAnswer(question: string, correctAnswer: string, studentAnswer: string): Promise<boolean> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      this.logger.warn('GROQ_API_KEY not set, skipping open answer check');
      return false;
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
- REJECT if the student answer describes or explains the correct answer instead of stating it (e.g. correct="O'zbekiston", student="O'zbekiston poytaxti" → false)
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
        return false;
      }

      const data = await res.json() as any;
      const answer = data.choices?.[0]?.message?.content?.trim().toLowerCase();
      return answer === 'true';
    } catch (e) {
      this.logger.error('Groq request failed', e);
      return false;
    }
  }
}
