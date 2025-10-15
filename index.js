import { useState } from "react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setResult(null);
    if (!/^https?:\/\//i.test(url)) { setError("Bitte URL mit https:// angeben."); return; }
    setLoading(true);
    try{
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan fehlgeschlagen");
      setResult(data);
    }catch(err){ setError(err.message); }
    finally{ setLoading(false); }
  }

  return (
    <main style={{ fontFamily: "system-ui", color: "#fff", background: "#0b1020", minHeight: "100vh", padding: "40px" }}>
      <h1>LegalTrust.dev – Website Compliance Scanner</h1>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={url} onChange={(e)=>setUrl(e.target.value)} placeholder="https://beispiel.de"
          style={{ width: 360, padding: 10, borderRadius: 8, border: "1px solid #323a6b", background: "#0f1a44", color: "#fff" }}/>
        <button disabled={loading} style={{ padding: "10px 14px", borderRadius: 8, background: "#4f7cff", color: "#fff", border: "1px solid #2b49ff" }}>
          {loading ? "Scanne..." : "Scan starten"}
        </button>
      </form>
      {error && <div style={{ marginTop: 10, color: "#ef4444" }}>{error}</div>}
      {result && <pre style={{ background: "#101631", marginTop: 20, padding: 12, borderRadius: 8, overflowX:"auto" }}>{JSON.stringify(result, null, 2)}</pre>}
    </main>
  );
}
