import { useState } from "react";

export default function Home() {
  const [domain, setDomain] = useState("https://www.example.com");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const runScan = async () => {
    setLoading(true); setErr(null); setResult(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: domain, heuristics: { https: domain.startsWith("https") } }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Scan fehlgeschlagen");
      setResult(data);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

 const downloadPdf = async () => {
  // Fallbacks falls noch kein Scan gemacht wurde
  const score = result?.analysis?.score ?? 72;
  const summary = result?.analysis?.summary ?? "Demo-Report";
  const res = await fetch("/api/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: domain, score, analysis: { summary } })
  });
  const blob = await res.blob();
  const urlObj = URL.createObjectURL(blob);
  window.open(urlObj);
};

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>LegalTrust.dev</h1>
      <p>Domain eingeben → Scan starten → PDF-Report herunterladen.</p>

      <input
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        style={{ width: 420, padding: 8 }}
        placeholder="https://example.com"
      />
      <button onClick={runScan} disabled={loading} style={{ marginLeft: 8, padding: "8px 12px" }}>
        {loading ? "Scanning…" : "Scan starten"}
      </button>
      <button onClick={downloadPdf} style={{ marginLeft: 8, padding: "8px 12px" }}>
        📄 PDF-Report herunterladen
      </button>

      <hr style={{ margin: "24px 0" }} />

      <div>
        <code><a href="/api/debug-env" target="_blank" rel="noreferrer">/api/debug-env</a></code>
      </div>

      {err && <pre style={{ background: "#fee", padding: 12 }}>❌ {err}</pre>}
      {result && (
        <pre style={{ background: "#eef", padding: 12, whiteSpace: "pre-wrap" }}>
{JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}
