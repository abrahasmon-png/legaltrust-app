import OpenAI from "openai";

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const { url = "", heuristics = {} } = req.body || {};
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "OPENAI_API_KEY missing",
        hint: "Setze den Project Key in Vercel (Production + Preview).",
      });
    }
    if (!url) return res.status(400).json({ ok: false, error: "Missing 'url' in body" });

    const input = `
Du bist Auditor für DSGVO/Impressum/Cookies/SSL.
Bewerte die Domain: ${url}
Signale: ${JSON.stringify(heuristics)}
Gib:
- risk_level (low/medium/high)
- score (0-100)
- summary (2-3 Sätze)
Kurz & klar.`;

    const ai = await client.responses.create({ model: "gpt-4.1-mini", input });
    const outputText = ai.output_text?.trim?.() || "";

    return res.status(200).json({
      ok: true,
      url,
      heuristics,
      analysis: { raw: outputText },
      meta: { model: "gpt-4.1-mini" }
    });
  } catch (err) {
    const message = (err && (err.message || String(err))) || "Unknown error";
    return res.status(500).json({
      ok: false,
      error: "OpenAI request failed",
      message: message.slice(0, 500),
    });
  }
}
