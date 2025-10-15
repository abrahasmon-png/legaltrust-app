import { supabase } from "../../lib/supabaseClient";
import * as cheerio from "cheerio";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { url } = req.body || {};
  if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: "Invalid URL" });

  try {
    const response = await fetch(url, { headers: { "User-Agent": "LegalTrustBot/0.1 (+https://legaltrust.dev)" } });
    const html = await response.text();
    const $ = cheerio.load(html);

    const hasImpressum = $("a[href*='impressum']").length > 0;
    const hasPrivacy = $("a[href*='datenschutz'], a[href*='privacy']").length > 0;
    const hasCookieIndicator = $("script[src*='cookie'], script:contains('cookie')").length > 0 ||
      $("div,section,footer").filter((_,el)=>/cookie|consent/i.test($(el).text())).length > 0;
    const hasSSL = url.startsWith("https://");

    const heuristics = { hasImpressum, hasPrivacy, hasCookieIndicator, hasSSL };

    const prompt = `Bewerte rechtliche Pflichtangaben der Website ${url}.
Impressum: ${hasImpressum}; Datenschutz: ${hasPrivacy}; Cookie-Indikator: ${hasCookieIndicator}; SSL: ${hasSSL}.
Antworte als JSON: {"risk_level":"low|medium|high","score":0-100,"summary":"max 2 Sätze deutsch"}`;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], temperature: 0.2 })
    });
    if (!aiRes.ok) throw new Error(await aiRes.text());
    const ai = await aiRes.json();
    let text = ai.choices?.[0]?.message?.content || "{}";
    let analysis;
    try { analysis = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); analysis = m ? JSON.parse(m[0]) : { risk_level: "medium", score: 60, summary: "Standardbewertung" }; }

    let stored = null;
    if (supabase) {
      const { data: site } = await supabase.from("websites").upsert({ url }).select().single();
      const { data: scan } = await supabase.from("scans").insert({ website_id: site?.id, status: "done", result_json: { heuristics, analysis } }).select().single();
      stored = { website: site?.id, scan: scan?.id };
    }

    return res.status(200).json({ url, heuristics, analysis, stored });
  } catch (e) {
    return res.status(500).json({ error: "Scan failed", details: String(e.message || e) });
  }
}
