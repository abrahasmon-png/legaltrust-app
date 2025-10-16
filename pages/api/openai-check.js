// pages/api/openai-check.js
export const config = { runtime: "nodejs", api: { bodyParser: false } };

export default async function handler(req, res) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        ok: false,
        title: "OPENAI_API_KEY fehlt",
        detail: "Setze den Project Key in Vercel (Production + Preview)."
      });
    }
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const resp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: "Say OK",
    });

    return res.status(200).json({
      ok: true,
      model: "gpt-4.1-mini",
      output_text: resp.output_text?.trim?.() || null,
    });
  } catch (err) {
    const detail = err?.message || String(err);
    return res.status(500).json({
      ok: false,
      title: "OpenAI request failed",
      detail: detail.slice(0, 2000),
    });
  }
}
