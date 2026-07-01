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

    const prompt = `Savol: "${question}"
To'g'ri javob ko'rsatmasi: "${correctAnswer}"
O'quvchi javobi: "${studentAnswer}"

Qoidalar:
- O'quvchi javobi savol va ko'rsatmaga MAZMUNIY mos kelishi shart
- Til farqi muhim emas (lotin, kirill, rus, ingliz — bir xil ma'no bo'lsa to'g'ri)
- Imlo xatolari muhim emas, ma'no to'g'ri bo'lsa yetarli
- Sinonimlar to'g'ri hisoblanadi
- Agar o'quvchi savol matnini yoki ko'rsatmani aynan yozib qo'ysa — bu NOTO'G'RI, "false" qaytaring
- Agar javob mavzudan butunlay tashqarida bo'lsa — "false" qaytaring

Faqat "true" yoki "false" deb javob bering, boshqa hech narsa yozmang.`;

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
