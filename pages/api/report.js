export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};

export default async function handler(req, res) {
  const PDFDocument = (await import("pdfkit")).default; // nur serverseitig laden

  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  const { url, score = 0, analysis = {} } = req.body || {};
  const summary = analysis.summary || "Keine Analyse verfügbar.";

  const doc = new PDFDocument({ size: "A4", margin: 50 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="LegalTrust_Report_${new Date().toISOString().split("T")[0]}.pdf"`
  );

  doc.pipe(res);

  const blue = "#1E90FF";
  const lightGray = "#EEEEEE";
  const darkGray = "#333333";

  doc.fontSize(22).fillColor(blue).text("LegalTrust – Website Compliance Report");
  doc.moveDown(1);

  doc.fontSize(12).fillColor(darkGray).text(`Website: ${url}`);
  doc.text(`Datum: ${new Date().toLocaleString("de-DE")}`);
  doc.moveDown(1);

  const barWidth = 400;
  const filledWidth = Math.min(barWidth * (score / 100), barWidth);
  const startX = 100;
  const startY = doc.y;

  doc.fillColor(lightGray).rect(startX, startY, barWidth, 20).fill();
  doc.fillColor(score >= 80 ? "green" : score >= 60 ? "orange" : "red");
  doc.rect(startX, startY, filledWidth, 20).fill();

  doc.moveDown(2);
  doc.fontSize(16).fillColor(darkGray).text(`Score: ${score}/100`);
  doc.moveDown(1);

  doc.fontSize(14).fillColor(blue).text("Analyse:", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(12).fillColor(darkGray).text(summary, { lineGap: 4, align: "justify" });

  doc.moveDown(3);
  doc.fontSize(10).fillColor("#666").text("© 2025 LegalTrust.dev | Automatisierter Datenschutz-Report", { align: "center" });

  doc.end();
}
