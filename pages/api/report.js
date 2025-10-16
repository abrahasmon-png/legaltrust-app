import PDFDocument from "pdfkit";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req, res) {
  const { url, score, analysis } = req.body || {};

  // PDF Header
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  // Output direkt an den Browser streamen
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="LegalTrust_Report_${new Date().toISOString().split("T")[0]}.pdf"`
  );
  doc.pipe(res);

  // Logo / Titel
  doc.fontSize(22).fillColor("#1E90FF").text("LegalTrust – DSGVO Website Report");
  doc.moveDown(1);

  // Meta
  doc.fontSize(12).fillColor("black").text(`Website: ${url}`);
  doc.text(`Datum: ${new Date().toLocaleString("de-DE")}`);
  doc.moveDown(1);

  // Score
  doc.fontSize(16).fillColor(score > 80 ? "green" : score > 60 ? "orange" : "red");
  doc.text(`Score: ${score}/100`);
  doc.moveDown(1);

  // Analyse
  doc.fillColor("black").fontSize(12).text("Analyse:", { underline: true });
  doc.moveDown(0.5);
  doc.text(analysis?.summary || "Keine Analyse vorhanden.", {
    lineGap: 4,
  });

  // Fußzeile
  doc.moveDown(2);
  doc.fontSize(10).fillColor("gray")
    .text("© 2025 LegalTrust.dev | Automatisierter Datenschutz-Report", {
      align: "center",
    });

  doc.end();
}
