import { createGeminiClient, getGeminiModelCandidates } from '../src/lib/gemini';

async function main() {
  const ai = createGeminiClient();
  const errors: string[] = [];

  for (const model of getGeminiModelCandidates()) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: 'ตอบเป็น JSON สั้น ๆ ว่า API พร้อมใช้งาน',
        config: {
          temperature: 0,
          maxOutputTokens: 100,
          responseMimeType: 'application/json',
          responseJsonSchema: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              message: { type: 'string' },
            },
            required: ['ok', 'message'],
          },
        },
      });

      console.log(`Gemini API พร้อมใช้งานด้วยโมเดล ${model}`);
      console.log(response.text);
      return;
    } catch (error) {
      errors.push(`${model}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`ไม่พบโมเดลที่เรียกใช้งานได้\n${errors.join('\n')}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
