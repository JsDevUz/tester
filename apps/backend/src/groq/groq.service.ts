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

    const qLower = question.toLowerCase().replace(/[?'"]/g, '').trim();
    const aLower = studentAnswer.toLowerCase().trim();
    const hintLower = correctAnswer.toLowerCase().trim();
    // Reject if student just echoed the question or hint verbatim
    if (aLower === qLower || aLower === hintLower || qLower.includes(aLower) && aLower.split(' ').length <= 2) {
      return false;
    }

    const prompt = `You are a strict answer checker. Respond ONLY with "true" or "false".

Question: "${question}"
Expected answer hint: "${correctAnswer}"
Student answer: "${studentAnswer}"

Rules:
- Return "true" ONLY if the student answer conveys the same meaning as the hint
- Language and spelling do not matter — same meaning = true
- Synonyms are acceptable
- If the student copied the question text or the hint word-for-word → "false"
- If the student answer is just the subject/topic name from the question (e.g. question asks "what is X?" and student writes "X") → "false"
- If the answer is off-topic or nonsensical → "false"

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
