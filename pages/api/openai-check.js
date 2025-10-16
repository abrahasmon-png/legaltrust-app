// pages/api/openai-check.js
export const config = { runtime: "nodejs", api: { bodyParser: false } };

export default async function handler(req, res) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ ok:false, title:"OPENAI_API_KEY fehlt" });
    }
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const r = await client.responses.create({ model: "gpt-4.1-mini", input: "Say OK" });
    return res.status(200).json({ ok:true, output_text: r.output_text?.trim?.() || null });
  } catch (err) {
    // ← HIER: maximale Sichtbarkeit
    let status = err?.status ?? 500;
    let body = null;
    if (err?.response) {
      try { body = await err.response.json(); }
      catch { try { body = await err.response.text(); } catch {}
      }
      if (err?.response?.status) status = err.response.status;
    }
    return res.status(status).json({
      ok: false,
      title: "OpenAI request failed",
      status,
      message: err?.message || String(err),
      body, // zeigt dir error.type / code / message von OpenAI
    });
  }
}
