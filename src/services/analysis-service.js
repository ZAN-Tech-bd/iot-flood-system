import { GoogleGenAI } from '@google/genai';
export async function generateFeedback({ apiKey, model, sensors, weather: env, config }) {
  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 30000 } });
    const result = await ai.models.generateContent({
      model: model,
      contents: `Advise on a house mounted on a vertical lift for flood adaptation. Give 3 concise sentences covering conditions, uncertainty, and recommended human checks. Never issue motor commands or claim structural safety. Null means unavailable. River discharge is a model estimate, not local flood depth. Use only this JSON: ${JSON.stringify({ sensors, weather: env, settings: config })}`,
    });
    if (!result.text) throw new Error('Gemini returned no feedback. Retry.');

    return {
      text: result.text,
      generatedAt: new Date().toISOString(),
      sensorAt: sensors.updatedAt,
      weatherAt: env.fetchedAt,
    };
  } catch {
    throw new Error('Gemini request failed. Check your key, model access, quota, and connection.');
  }
}
