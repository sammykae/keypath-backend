import dotenv from 'dotenv';
dotenv.config();

if (process.env.NODE_ENV !== 'development' && process.env.ALLOW_GEMINI_TEST !== '1') {
  console.error('Gemini test script runs only in NODE_ENV=development or when ALLOW_GEMINI_TEST=1');
  process.exit(1);
}

async function main() {
  const { callGemini } = require('../src/modules/ask-ai/services/geminiProvider.service');
  const systemPrompt = 'You are a helpful assistant. Reply in one short sentence.';
  const userPrompt = 'What is 2 + 2? Reply with the number only.';

  try {
    const result = await callGemini(systemPrompt, userPrompt);
    if (!result?.text?.trim()) {
      console.error('Gemini returned empty response');
      process.exit(1);
    }
    console.log('Gemini test OK. Response length:', result.text.length);
    process.exit(0);
  } catch (err) {
    console.error('Gemini test failed:', (err as Error).message);
    process.exit(1);
  }
}

main();
