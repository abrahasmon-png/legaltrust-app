// pages/api/scan.js
import * as cheerio from "cheerio";
import { supabase } from "../../lib/supabaseClient"; // supabase may be null if not configured

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1mb",
    },
  },
};

const OPENAI_TIMEOUT_MS = 15000;
const FETCH_TIMEOUT_MS = 10000;

// small helper: timeout fetch
async function fetchWithTimeout(url, opts = {}, ms = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { signal: controller.signal, ...opts });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

function safeParseJSONMaybe(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { url } = req.body || {};
  if (!url || typeof url !== "string" || !/^https?:\/\/.+/i.test(url)) {
    return res.status(400).json({ error: "Invalid or missing URL. Use full URL starting with https://." });
  }

  // Basic safety: disallow localhost/private IP scanning to avoid server-side requests to internal networks
  try {
    const host = new URL(url).hostname;
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      return res.status(400).json({ error: "Localhost or direct IP addresses are not allowed." });
    }
  } catch (e) {
    return res.status(400).json({ error: "Malformed URL." });
  }

  // 1) Fetch target HTML
  let html;
  try {
    const r = await fetchWithTimeout(url, { headers: { "User-Agent": "LegalTrustBot/0.1 (+https://legaltrust.dev)" } }, FETCH_TIMEOUT_MS);
    if (!r.ok) {
      return res.status(502).json({ error: "Fetch failed", status: r.status, statusText: r.statusText });
    }
    html = await r.text();
  } catch (err) {
    console.error("Fetch error:", String(err));
    return res.status(502).json({ error: "Fetch failed", details: String(err.message || err) });
  }

  // 2) Heuristics with cheerio
  let heuristics = {};
  try {
    const $ = cheerio.load(html);
    const normHref = (s) => (s || "").toLowerCase();

    const hasImpressum = $("a[href*='impressum']").length > 0 || $("a:contains('Impressum')").length > 0;
    const hasPrivacy = $("a[href*='datenschutz'], a[href*='privacy']").length > 0 || $("a:contains('Datenschutz')").length > 0 || $("a:contains('Privacy')").length > 0;
    const cookieIndicator =
      $("script[src*='cookie'], script:contains('cookie')").length > 0 ||
      $("div,section,footer").filter((_, el) => /cookie|consent|consent-manager|gdpr|einwillig/i.test($(el).text())).length > 0;
    const hasForms = $("form").length > 0;
    const hasSsl = url.startsWith("https://");

    heuristics = { hasImpressum: !!hasImpressum, hasPrivacy: !!hasPrivacy, cookieIndicator: !!cookieIndicator, hasForms: !!hasForms, hasSsl: !!hasSsl };
  } catch (err) {
    console.warn("Heuristics parse failed:", String(err));
    heuristics = { hasImpressum: false, hasPrivacy: false, cookieIndicator: false, hasForms: false, hasSsl: url.startsWith("https://") };
  }

  // 3) Build compact prompt for OpenAI
  const prompt = `Bewerte die Website ${url} auf Pflichtangaben (Impressum, Datenschutzerklärung, Cookie-Hinweis, SSL).
Heuristische Ergebnisse: Impressum=${heuristics.hasImpressum}, Datenschutzerklärung=${heuristics.hasPrivacy}, Cookie-Indikator=${heuristics.cookieIndicator}, Formulare=${heuristics.hasForms}, SSL=${heuristics.hasSsl}.
Antworte **nur** mit gültigem JSON, z.B.:
{"risk_level":"low"|"medium"|"high","score":0-100,"summary":"Kurz (max 2 Sätze, Deutsch)"}.
Beachte: JSON muss parsebar sein.`;

  // 4) Call OpenAI
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY missing");
    return res.status(500).json({ error: "Server misconfigured: OPENAI_API_KEY missing" });
  }

  let aiText = null;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini", // stable choice
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 300,
      }),
    });

    clearTimeout(t);
    const text = await aiResp.text(); // read text to capture exact error body if any
    if (!aiResp.ok) {
      console.error("OpenAI request failed:", text.slice(0, 1000));
      return res.status(502).json({ error: "OpenAI request failed", detail: text.slice(0, 1000) });
    }

    // parse model response
    // sometimes API returns non-JSON text; try to extract JSON
    const parsed = (() => {
      try {
        const json = JSON.parse(text);
        // chat.completions returns an object; find the message content
        const content = json.choices?.[0]?.message?.content ?? null;
        if (content) return { rawModelObject: json, content };
        return { rawModelObject: json, content: null };
      } catch {
        // fallback: text itself might already be the JSON or contain JSON
        return { rawModelObject: null, content: text };
      }
    })();

    aiText = parsed.content ?? "{}";
  } catch (err) {
    console.error("OpenAI fetch error:", String(err));
    return res.status(502).json({ error: "OpenAI request error", details: String(err.message || err) });
  }

  // 5) Interpret AI output as JSON
  let analysis = safeParseJSONMaybe(aiText);
  if (!analysis) {
    // fallback safe defaults, but include raw aiText for debugging
    analysis = { risk_level: "medium", score: 60, summary: "Automatische Standardbewertung (Parser fallback)." };
  }

  // 6) Optional: store to Supabase
  let stored = null;
  if (supabase) {
    try {
      // upsert website
      const { data: siteData, error: upErr } = await supabase.from("websites").upsert({ url }).select().single();
      if (upErr) console.warn("Supabase upsert website error:", upErr.message || upErr);
      const siteId = siteData?.id;

      const { data: scanData, error: scanErr } = await supabase
        .from("scans")
        .insert({ website_id: siteId, status: "done", result_json: { heuristics, analysis } })
        .select()
        .single();
      if (scanErr) console.warn("Supabase insert scan error:", scanErr.message || scanErr);

      stored = { website: siteId, scan: scanData?.id };
    } catch (err) {
      console.warn("Supabase store failed:", String(err));
    }
  }

  // 7) Return full response
  return res.status(200).json({
    url,
    heuristics,
    analysis,
    stored,
    note: "If 'analysis' is a fallback (medium/60), check OpenAI raw output in Vercel logs for debug.",
    ai_raw_preview: typeof aiText === "string" ? aiText.slice(0, 800) : null,
  });
}

