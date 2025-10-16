// Erzwingt Node.js Runtime (nicht Edge)
export const config = { runtime: "nodejs", api: { bodyParser: false } };

export default async function handler(req, res) {
  // Saubere, detailreiche Fehlerreports
  const respondError = (status, title, err) => {
    const detail =
      (err?.response && (await err.response.text?.())) ||
      err?.message ||
      String(err);
    return res.status(status).json({
      ok: false,
      where: "openai-check",
      title,
      detail: typeof detail === "string" ? detail.slice(0, 2000) : detail,
      hints: [
        "Vercel → Settings → Environment Variables: OPENAI_API_KEY setzen (Production + Preview).",
        "Key muss als Project Key mit 'sk-proj-' beginnen.",
        "Prüfe Quota/Rate-Limits im OpenAI Dashboard.",
        "Modellname korrekt? (z. B. gpt-4.1-mini).",
      ],
    });
  };

  try {
    if (!process.env.OPENAI_API_KEY) {
      return respondError(500, "OPENAI_API_KEY fehlt", new Error("missing env"));
    }

    // Import erst zur Laufzeit → funktioniert in Vercel Lambdas stabil
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Minimal-Auth-Check: ping die API mit einem Mini-Call
    const resp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: "Say OK",
    });

    return res.status(200).json({
      ok: true,
      model: "gpt-4.1-mini",
      output_text: resp.output_text?.trim?.() || null, // offizieller Helper
    });
  } catch (err) {
    // Liefert genaue Status-/Fehlermeldungen zurück
    return respondError(500, "OpenAI request failed", err);
  }
}
