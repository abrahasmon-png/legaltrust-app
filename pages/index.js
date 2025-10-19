// pages/index.js
import { useEffect, useMemo, useState } from "react";

/**
 * LegalTrust.dev – Startseite (Pages Router)
 * - Dark UI mit LegalTrust-Blau
 * - Domain-Eingabe, Scan-Button, Ergebnis-Karte
 * - Score-Balken, Risiko-Badge, PDF-Download
 * - Debug-Link optional via NEXT_PUBLIC_SHOW_DEBUG=1
 */

export default function Home() {
  const [domain, setDomain] = useState("https://www.example.com");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [valid, setValid] = useState(true);

  // einfache URL-Validierung
  useEffect(() => {
    try {
      const u = new URL(domain);
      setValid(Boolean(u.protocol && u.hostname));
    } catch {
      setValid(false);
    }
  }, [domain]);

  const risk = result?.analysis?.risk_level || null;
  const score = typeof result?.analysis?.score === "number" ? result.analysis.score : null;
  const summary = result?.analysis?.summary || null;

  const riskColor = useMemo(() => {
    if (!risk) return "#8aa0b4";
    if (risk === "low") return "#28a745";
    if (risk === "medium") return "#ff9800";
    return "#ef4444"; // high
  }, [risk]);

  const progressPct = useMemo(() => {
    if (typeof score !== "number") return 0;
    return Math.max(0, Math.min(100, score));
  }, [score]);

  const runScan = async () => {
    setLoading(true);
    setErr("");
    setResult(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: domain,
          heuristics: { https: domain.startsWith("https"), timestamp: Date.now() },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || data?.message || "Scan fehlgeschlagen");
      }
      setResult(data);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = async () => {
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: domain,
          score: score ?? 0,
          analysis: { summary: summary || "Kein Summary vorhanden." },
        }),
      });
      const blob = await res.blob();
      const urlObj = URL.createObjectURL(blob);
      window.open(urlObj, "_blank", "noopener,noreferrer");
    } catch (e) {
      setErr("PDF-Generierung fehlgeschlagen: " + String(e.message || e));
    }
  };

  const onEnter = (e) => {
    if (e.key === "Enter" && valid && !loading) runScan();
  };

  const showDebug = process.env.NEXT_PUBLIC_SHOW_DEBUG === "1";

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <div className="logo">LT</div>
          <div className="titles">
            <h1>LegalTrust.dev</h1>
            <p className="subtitle">Automatisierte Website-Compliance: DSGVO · Impressum · Cookies · SSL</p>
          </div>
        </div>
        <nav className="topnav">
          {showDebug && (
            <a className="quiet" href="/api/debug-env" target="_blank" rel="noreferrer">
              /api/debug-env
            </a>
          )}
          <a className="quiet" href="https://legaltrust.dev" target="_blank" rel="noreferrer">
            Website
          </a>
        </nav>
      </header>

      <main className="content">
        <section className="hero">
          <h2>Scanne eine Domain</h2>
          <p className="hint">
            Gib eine URL ein und starte den Compliance-Check. Du erhältst einen Score, eine Risikoeinschätzung und ein kurzes
            Summary – auf Wunsch als PDF-Report.
          </p>

          <div className={"inputRow " + (!valid ? "invalid" : "")}>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onKeyDown={onEnter}
              aria-label="Domain / URL"
              placeholder="https://www.deine-domain.de"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
            />
            <button
              className="primary"
              onClick={runScan}
              disabled={!valid || loading}
              aria-busy={loading ? "true" : "false"}
            >
              {loading ? "Wird geprüft…" : "Scan starten"}
            </button>
          </div>
          {!valid && <div className="warn">Bitte eine gültige URL eingeben (inkl. https://).</div>}
        </section>

        {(result || err) && (
          <section className="panel">
            <div className="panelHead">
              <h3>Ergebnis</h3>
              {risk && (
                <span className="badge" style={{ background: riskColor }}>
                  {risk.toUpperCase()}
                </span>
              )}
            </div>

            {err && (
              <div className="error">
                <strong>Fehler:</strong> {err}
              </div>
            )}

            {result && (
              <>
                <div className="scoreWrap">
                  <div className="scoreHeader">
                    <span>Score</span>
                    <span>{progressPct}/100</span>
                  </div>
                  <div className="progress">
                    <div className="bar" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>

                <div className="summary">
                  <h4>Zusammenfassung</h4>
                  <p>{summary || "—"}</p>
                </div>

                <div className="meta">
                  <div>
                    <span className="muted">Domain</span>
                    <div className="mono">{result?.url}</div>
                  </div>
                  <div>
                    <span className="muted">Modell</span>
                    <div className="mono">{result?.meta?.model || "gpt-4.1-mini"}</div>
                  </div>
                </div>

                <div className="actions">
                  <button className="ghost" onClick={() => setResult(null)}>
                    Neues Ziel prüfen
                  </button>
                  <button className="primary" onClick={downloadPdf} disabled={loading}>
                    📄 PDF-Report herunterladen
                  </button>
                </div>

                <details className="raw">
                  <summary>Rohdaten anzeigen</summary>
                  <pre>{JSON.stringify(result, null, 2)}</pre>
                </details>
              </>
            )}
          </section>
        )}

        {!result && !err && (
          <section className="why">
            <div className="card">
              <h4>Was wird geprüft?</h4>
              <ul>
                <li>🔒 SSL-Verschlüsselung (HTTPS)</li>
                <li>ℹ️ Impressum-Hinweise</li>
                <li>🛡️ Datenschutz/Privacy-Hinweise</li>
                <li>🍪 Cookie-Hinweise (heuristisch)</li>
              </ul>
            </div>
            <div className="card">
              <h4>Für wen ist das?</h4>
              <ul>
                <li>Agenturen & Hosting-Provider</li>
                <li>Datenschutz-Dienstleister</li>
                <li>IT-Teams in Unternehmen</li>
              </ul>
            </div>
            <div className="card">
              <h4>Export</h4>
              <p>Erstelle auf Knopfdruck einen White-Label-Report als PDF für deine Kunden.</p>
            </div>
          </section>
        )}
      </main>

      <footer className="foot">
        <span>© {new Date().getFullYear()} LegalTrust.dev</span>
        <span className="muted">Build on Next.js · OpenAI Responses API</span>
      </footer>

      <style jsx>{`
        :global(html, body, #__next) { height: 100%; }
        :global(body) { margin: 0; background: #0b1220; color: #e6edf6; }
        .wrap { min-height: 100%; display: grid; grid-template-rows: auto 1fr auto; }
        .top { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid #121a2a; background: #0e1628; position: sticky; top: 0; z-index: 2; }
        .brand { display: flex; align-items: center; gap: 12px; }
        .logo { width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, #1e90ff, #69b8ff); display: grid; place-items: center; color: #081220; font-weight: 800; letter-spacing: 0.5px; }
        h1 { font-size: 18px; margin: 0; }
        .subtitle { margin: 2px 0 0; color: #8aa0b4; font-size: 12px; }
        .topnav a { color: #9fb5cc; text-decoration: none; margin-left: 16px; }
        .topnav a.quiet:hover { color: #d1e5ff; }

        .content { max-width: 1000px; margin: 0 auto; padding: 32px 20px 60px; }
        .hero h2 { margin: 0 0 8px; font-size: 22px; }
        .hint { color: #9fb5cc; margin: 0 0 18px; }
        .inputRow { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; }
        .inputRow.invalid input { outline: 1px solid #ef4444; }
        input { width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid #1a2540; background: #0d1628; color: #e6edf6; font-size: 14px; }
        input:focus { outline: 2px solid #1e90ff55; }
        button { border: 0; border-radius: 12px; padding: 12px 16px; font-weight: 600; cursor: pointer; }
        button.primary { background: #1e90ff; color: #07111f; box-shadow: 0 6px 20px rgba(30,144,255,0.25); }
        button.primary:disabled { opacity: 0.6; cursor: not-allowed; }
        button.ghost { background: transparent; color: #c6d6ea; border: 1px solid #1a2540; }
        .warn { margin-top: 8px; color: #ffb4b4; font-size: 13px; }

        .panel { margin-top: 28px; border: 1px solid #1a2540; background: #0d1628; border-radius: 16px; padding: 18px; }
        .panelHead { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .badge { padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; color: #07111f; }
        .scoreWrap { margin-top: 14px; }
        .scoreHeader { display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #9fb5cc; margin-bottom: 8px; }
        .progress { height: 12px; background: #0b1324; border: 1px solid #17213a; border-radius: 999px; overflow: hidden; }
        .bar { height: 100%; background: linear-gradient(90deg, #1e90ff, #69b8ff); }
        .summary { margin-top: 18px; }
        .summary h4 { margin: 0 0 6px; font-size: 15px; }
        .summary p { margin: 0; color: #d6e3f7; line-height: 1.55; }
        .meta { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .muted { color: #8aa0b4; font-size: 12px; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; word-break: break-all; }
        .actions { margin-top: 18px; display: flex; gap: 10px; justify-content: flex-end; }
        .raw { margin-top: 12px; border-top: 1px dashed #1a2540; padding-top: 12px; }
        .raw summary { cursor: pointer; color: #9fb5cc; }

        .why { margin-top: 34px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .card { border: 1px solid #1a2540; background: #0d1628; border-radius: 16px; padding: 16px; }
        .card h4 { margin: 0 0 10px; }
        .card p, .card li { color: #d6e3f7; }
        .card ul { margin: 8px 0 0 18px; padding: 0; }

        .foot { border-top: 1px solid #121a2a; padding: 18px 24px; display: flex; align-items: center; justify-content: space-between; color: #8aa0b4; background: #0e1628; }
        @media (max-width: 860px) {
          .why { grid-template-columns: 1fr; }
          .meta { grid-template-columns: 1fr; }
          .topnav { display: none; }
        }
      `}</style>
    </div>
  );
}
