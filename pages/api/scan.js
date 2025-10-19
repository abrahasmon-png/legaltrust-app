// pages/api/scan.js
export const config = { runtime: "nodejs", api: { bodyParser: { sizeLimit: "1mb" } } };

import OpenAI from "openai";

function getClient() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function respondError(res, err, where) {
  let status = err?.status ?? 500;
  let body = null;
  if (err?.response) {
    try { body = await err.response.json(); }
    catch { try { body = await err.response.text(); } catch { body = String(err); } }
    if (err.response?.status) status = err.response.status;
  }
  return res.status(status).json({
    ok: false,
    error: "OpenAI request failed",
    where,
    status,
    message: err?.message || String(err),
    body,
  });
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const client = getClient();
      const r = await client.responses.create({
        model: "gpt-4.1-mini",
        input: 'Give me JSON: {"risk_level":"low","score":95,"summary":"OK"}',
        text: { format: { type: "json_object" } },
      });
      const t = r.output_text ?? "";
      let analysis = {};
      try { analysis = t ? JSON.parse(t) : {}; }
      catch { analysis = { rawText: t }; }
      return res.status(200).json({ ok: true, where: "scan:get", analysis, meta: { model: "gpt-4.1-mini" } });
    } catch (err) {
      return respondError(res, err, "scan:get");
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const client = getClient();
    const { url = "", heuristics = {} } = req.body || {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ ok: false, where: "scan:post", error: "Missing or invalid 'url' in body" });
    }

    const prompt =
      `Du bist ein Audit-Bot für Website-Compliance (DSGVO / Impressum / Cookies / SSL).
Bewerte die Domain: ${url}
Verwende die Signale: ${JSON.stringify(heuristics)}
Gib NUR ein JSON-Objekt zurück mit "risk_level":"low|medium|high","score":0..100,"summary":"kurz".`;

    const r = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "legaltrust_scan",
          strict: true,
          schema: {
            type: "object",
            properties: {
              risk_level: { type: "string", enum: ["low", "medium", "high"] },
              score: { type: "number", minimum: 0, maximum: 100 },
              summary: { type: "string" }
            },
            required: ["risk_level", "score", "summary"],
            additionalProperties: false
          }
        }
      }
    });

    const out = r.output_text ?? "";
    let analysis = {};
    try { analysis = out ? JSON.parse(out) : {}; }
    catch {
      return res.status(500).json({
        ok: false, error: "Parse error", where: "scan:post", output_text: out
      });
    }

    return res.status(200).json({ ok: true, url, heuristics, analysis, meta: { model: "gpt-4.1-mini" } });
  } catch (err) {
    return respondError(res, err, "scan:post");
  }
}
