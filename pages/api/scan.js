// pages/api/scan.js
import * as cheerio from "cheerio";

// Hilfsfunktion: saubere Fehlerantwort
function fail(res, status, msg, extra) {
  return res.status(status).json({ error: msg, details: extra || null });
}

export const config = { api: { bodyParser: { sizeLimit: "1mb" }, externalResolver: true } };

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");
  const { url } = req.body || {};
  if (!url || !/^https?:\/\//i.test(url)) return fail(res, 400, "Invalid URL", "Bitte mit https:// starten");

  // 1) HTML laden (robuste Fehler)
  let html = "";
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "LegalTrustBot/0.1 (+https://legaltrust.dev)" },
      redirect: "follow"
    });
    if (!resp.ok) {
      return fail(res, 502, "Website nicht abrufbar", `HTTP ${resp.status} ${resp.statusText}`);
    }
    // Manche Seiten liefern binär/komprimiert → .text() reicht hier
    html = await resp.text();
    if (!html || html.length < 200) {
      return fail(res, 502, "Unerwarteter Seiteninhalt", "Response war zu klein oder leer");
    }
  } catch (e) {
    return fail(res, 502, "Fetch fehlgeschlagen", String(e?.message || e));
  }

  // 2) Heuristiken
  let heuristics;
  try {
    const $ = cheerio.load(html);
    const hasImpressum = $("a[href*='impressum']").length > 0;
    const hasPrivacy   = $("a[href*='datenschutz'], a[href*='privacy']").length > 0;
    const hasCookieInd =
      $("script[src*='cookie'], script:contains('cookie')").length > 0 ||
      $("div,section,footer").filter((_,el)=>/cookie|consent/i.test($(el).text())).length > 0;
    const hasSSL = url.startsWith("https://");
    heuristics = { hasImpressum, hasPrivacy, hasCookieIndicator: hasCookieInd, hasSSL };
  } catch (e) {
    return fail(res, 500, "HTML-Analyse fehlgeschlagen", String(e?.message || e));
  }

  // 3) OpenAI optional – Fallback wenn Key fehlt
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    // Rückgabe ohne AI-Bewertung (MVP funktioniert trotzdem)
    const fallback = {
      risk_level: (!heuristics.hasImpressum || !heuristics.hasPrivacy) ? "high"
                  : (!heuristics.hasCookieIndicator ? "medium" : "medium"),
      score: (heuristics.hasSSL ? 10 : 0)
           + (heuristics.hasImpressum ? 30 : 0)
           + (heuristics.hasPrivacy ? 30 : 0)
           + (heuristics.hasCookieIndicator ? 10 : 0), // simple MVP-Score
      summary: "Ohne OpenAI-Analyse: heuristische Einschätzung basierend auf HTML-Prüfpunkten."
    };
    return res.status(200).json({ url, heuristics, analysis: fallback, stored: null });
  }

  // 4) OpenAI-Aufruf mit sauberem Fehler-Handling
  try {
    const prompt = `Bewerte rechtliche Pflichtangaben der Website ${url}.
Impressum: ${heuristics.hasImpressum}; Datenschutz: ${heuristics.hasPrivacy}; Cookie-Indikator: ${heuristics.hasCookieIndicator}; SSL: ${heuristics.hasSSL}.
Antworte als JSON: {"risk_level":"low|medium|high","score":0-100,"summary":"max 2 Sätze deutsch"}`;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2
      })
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      // Häufig: 401 (Key falsch), 429 (Rate-Limit), 500 (temporär)
      return fail(res, 502, "OpenAI-Fehler", txt);
    }

    const ai = await aiRes.json();
    let content = ai?.choices?.[0]?.message?.content || "{}";
    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      analysis = m ? JSON.parse(m[0]) : { risk_level: "medium", score: 60, summary: "Standardbewertung" };
    }

    return res.status(200).json({ url, heuristics, analysis, stored: null });
  } catch (e) {
    return fail(res, 500, "AI-Analyse fehlgeschlagen", String(e?.message || e));
  }
}
