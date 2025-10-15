import { supabase } from "../../lib/supabaseClient";

export default async function handler(req, res) {
  const { url } = req.query || {};
  if (!url) return res.status(400).json({ error: "Missing url" });
  if (!supabase) return res.status(200).json({ note: "Supabase not configured" });

  try {
    const { data: site } = await supabase.from("websites").select("id").eq("url", url).maybeSingle();
    if (!site) return res.status(404).json({ error: "No records for this URL" });
    const { data: scan } = await supabase.from("scans").select("id, created_at, result_json").eq("website_id", site.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!scan) return res.status(404).json({ error: "No scans yet" });
    return res.status(200).json(scan);
  } catch (e) {
    return res.status(500).json({ error: "Failed", details: String(e.message || e) });
  }
}
