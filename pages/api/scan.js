export const config = { runtime: "nodejs", api: { bodyParser: { sizeLimit: "1mb" } } };

import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const bail = (status, msg, extra = {}) => res.status(status).json({ ok: false, error: msg, ...extra });

  try {
    if (!process.env.OPENAI_API_KEY) {
      return bail(500, "OPENAI_API_KEY missing", { hint: "Setze Project Key in Vercel (Production + Preview)" });
    }

    const { url = "", heuristics = {} } = req.body || {};
    if (!url) return bail(400, "Missing 'url' in body");

    const input = `Kurzbewertung für ${url} mit Heuristiken: ${JSON.stringify(heuristics)}.
Gib JSON mit {risk_level, score, summary}.`;

    const ai = await client.responses.create({
      model: "gpt-4.1-mini",
      input,
      response_format: { type: "json_object" },
    });

    let parsed = {};
    try { parsed = JSON.parse(ai.output_text || "{}"); } catch {}

    return res.status(200).json({
      ok: true,
      url,
      heuristics,
      analysis: parsed,
      meta: { model: "gpt-4.1-mini" }
    });
  } catch (err) {
    // Fehler strukturiert zurückgeben (Auth/Quota/Model etc.)
    const status = err?.status || 500;
    const details = (err?.response && (await err.response.text?.())) || err?.message || String(err);
    return res.status(status).json({
      ok: false,
      error: "OpenAI request failed",
      status,
      details: String(details).slice(0, 2000),
      tips: [
        "Ist OPENAI_API_KEY in Vercel gesetzt (richtiger Project Key, sk-proj-…)?",
        "Hat das Projekt noch Quota/kein Rate-Limit? (429 = Limit).",
        "Ist das Modell korrekt (gpt-4.1-mini ist verfügbar)?"
      ],
    });
    } catch (err) {
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
    status,
    message: err?.message || String(err),
    body
  });
}

  }
}
