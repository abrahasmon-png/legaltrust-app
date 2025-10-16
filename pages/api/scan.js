// pages/api/scan.js
export const config = { runtime: "nodejs", api: { bodyParser: { sizeLimit: "1mb" } } };

import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });

  const bail = (status, msg, extra={}) => res.status(status).json({ ok:false, error:msg, ...extra });

  try {
    if (!process.env.OPENAI_API_KEY) return bail(500, "OPENAI_API_KEY missing");
    const { url = "", heuristics = {} } = req.body || {};
    if (!url) return bail(400, "Missing 'url' in body");

    const prompt = `Du bist Auditor für DSGVO/Impressum/Cookies/SSL.
Bewerte die Domain: ${url}
Signale: ${JSON.stringify(heuristics)}
Gib JSON mit Feldern: { "risk_level":"low|medium|high", "score":0-100, "summary":"kurz" } – nur JSON, keine Erklärungen.`;

    const r = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
      response_format: { type: "json_object" } // zwingt JSON
    });

    let analysis = {};
    try { analysis = JSON.parse(r.output_text || "{}"); } catch {}

    return res.status(200).json({
      ok: true,
      url,
      heuristics,
      analysis,
      meta: { model: "gpt-4.1-mini" }
    });
  } catch (err) {
    let status = err?.status ?? 500;
    let body = null;
    if (err?.response) {
      try { body = await err.response.json(); }
      catch { try { body = await err.response.text(); } catch {} }
      if (err?.response?.status) status = err.response.status;
    }
    return res.status(status).json({
      ok:false,
      error:"OpenAI request failed",
      status,
      message: err?.message || String(err),
      body
    });
  }
}
