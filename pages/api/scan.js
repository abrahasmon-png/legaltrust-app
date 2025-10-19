// pages/api/scan.js
// Robuster Scan-Endpoint für LegalTrust.dev
// - GET: Selbsttest (kein Body) -> prüft OpenAI connectivity
// - POST: führt Audit durch, erwartet { url: string, heuristics?: object }
// Wichtig: in Vercel als Environment Variable OPENAI_API_KEY setzen
export const config = {
  runtime: "nodejs",
  api: { bodyParser: { sizeLimit: "1mb" } },
};

import OpenAI from "openai";

/**
 * Helper: erstellt OpenAI-Client (lazily)
 */
function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/**
 * Helper: standardisierte Fehlerantworten mit möglichst vielen Details
 */
async function respondError(res, err, where = "scan") {
  let status = err?.status ?? 500;
  let body = null;

  // err.response kann ein Fetch-Response sein (SDK intern)
  if (err?.response) {
    try {
      // versuche JSON first
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

  // Fallbacks
  const message = err?.message || String(err) || "Unknown error";

  return res.status(status).json({
    ok: false,
    error: "OpenAI request failed",
    where,
    status,
    message,
    body,
  });
}

/**
 * Main handler
 */
export default async function handler(req, res) {
  // GET -> Selbsttest (kein Body nötig)
  if (req.method === "GET") {
    try {
      const client = getClient();

      // Wir fordern ein kleines Test-JSON an, um die API zu prüfen.

