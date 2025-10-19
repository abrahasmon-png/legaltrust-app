// pages/api/scan.js
// LegalTrust.dev — robuster Scan-Endpoint
// - GET  : Selbsttest ohne Body (prüft OpenAI & JSON-Ausgabe)
// - POST : eigentlicher Scan, erwartet { url, heuristics? }
// Voraussetzungen: OPENAI_API_KEY in Vercel (Production + Preview)

export const config = {
  runtime: "nodejs",
  api: { bodyParser: { sizeLimit: "1mb" } },
};

import OpenAI from "openai";

/** OpenAI-Client holen (mit Env-Check) */
function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/** Einheitliche Fehlerantwort inkl. Body aus der API, falls vorhanden */
async function respondError(res, err, where = "scan") {
  let status = err?.status ?? 500;
  let body = null;

  if (err?.response) {
    try {
      body = await err.response.json();
    } catch {
      try {
        body = await err.response.text();
      } catch {
        body = String(err);
      }
    }
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
  // ---------- GET: Selbsttest ----------
  if (req.method === "GET") {
    try {
      const client = getClient();

      // Kleines Test-JSON anfordern (strukturierte Ausgabe)
      const r = await client.responses.create({
        model: "gpt-4.1-mini",
        input: 'Give me JSON: {"risk_level":"low","score":95,"summary":"OK"}',
        text: { format: { type: "json_object" } },
      });

      const rawText = r.output_text ?? null;
      let parsed = {};
      try {
        parsed = rawText ? JSON.parse(rawText) : {};
      } catch {
        parsed = { rawText };
      }

      return res
        .status(200)
        .json({ ok: true, where: "scan:get", analysis: parsed, meta: { model: "gpt-4.1-mini" } });
    } catch (err) {
      return respondError(res, err, "scan:get");
    }
  }

  // ---------- Nur POST zulassen ----------
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // ---------- POST: eigentlicher Scan ----------
  try {
    const client = getClient();

    const { url = "", heuristics = {} } = req.body || {};
    if (!url || typeof url !== "string") {
      return res
        .status(400)
        .json({ ok: false, where: "scan:post", error: "Missing or invalid 'url' in body" });
    }

    const prompt = `Du bist ein Audit-Bot für Website-Compliance (DSGVO / Impressum / Cookies / SSL).
Bewerte die Domain: ${url}
Verwende die Signale: ${JSON.stringify(heuristics)}
Gib ausschließlich ein JSON-Objekt zurück mit:
- "risk_level": "low" | "medium" | "high"
- "score": Zahl 0..100
- "summary": kurze Zusammenfassung (1-3 Sätze)
Antwort nur als JSON, ohne zusätzliche Erklärungen.`;

    // Strukturiere Ausgabe strikt via JSON Schema
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
              summary: { type: "string" },
            },
            required: ["risk_level", "score", "summary"],
            additionalProperties: false,
          },
        },
      },
    });

    const outText = r.output_text ?? "";
    let analysis = {};
    try {
      analysis = outText ? JSON.parse(outText) : {};
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: "Parse error",
        where: "scan:post",
        message: "Failed to parse output_text from OpenAI",
        output_text: outText,
      });
    }

    return res
      .status(200)
      .json({ ok: true, url, heuristics, analysis, meta: { model: "gpt-4.1-mini" } });
  } catch (err) {
    return respondError(res, err, "scan:post");
  }
}
