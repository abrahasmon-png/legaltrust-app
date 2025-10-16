// pages/api/scan.js
export const config = { runtime: "nodejs", api: { bodyParser: { sizeLimit: "1mb" } } };

import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  // ➜ GET = Selbsttest im Browser (keine Body/Frontend-Probleme)
  if (req.method === "GET") {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ ok:false, where:"scan:get", error:"OPENAI_API_KEY missing" });
      }
     const r = await client.responses.create({
  model: "gpt-4.1-mini",
  input: "Give me JSON: {\"risk_level\":\"low\",\"score\":95,\"summary\":\"OK\"}",
  text: {                    // ⬅️ NEU: statt response_format
    format: { type: "json_object" }
  }
});


      
      return res.status(200).json({ ok:true, where:"scan:get", analysis: JSON.parse(r.output_text || "{}") });
    } catch (err) {
      return respondError(res, err, "scan:get");
    }
  }

  // ➜ POST = normaler Scan
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ ok:false, where:"scan:post", error:"OPENAI_API_KEY missing" });
    }

    const { url = "", heuristics = {} } = req.body || {};
    if (!url) return res.status(400).json({ ok:false, where:"scan:post", error:"Missing 'url' in body" });

    const prompt = `Du bist Auditor für DSGVO/Impressum/Cookies/SSL.
Bewerte die Domain: ${url}
Signale: ${JSON.stringify(heuristics)}
Gib NUR JSON mit { "risk_level":"low|medium|high", "score":0-100, "summary":"kurz" }.`;

    const r = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
      response_format: { type: "json_object" }
    });

    let analysis = {};
    try { analysis = JSON.parse(r.output_text || "{}"); } catch {}

    return res.status(200).json({ ok:true, url, heuristics, analysis, meta:{ model:"gpt-4.1-mini" } });
  } catch (err) {
    return respondError(res, err, "scan:post");
  }
}

async function respondError(res, err, where) {
  let status = err?.status ?? 500;
  let body = null;
  if (err?.response) {
    try { body = await err.response.json(); }
    catch { try { body = await err.response.text(); } catch {}
    }
    if (err?.response?.status) status = err.response.status;
  }
  return res.status(status).json({
    ok:false,
    error:"OpenAI request failed",
    where,
    status,
    message: err?.message || String(err),
    body
  });
}
