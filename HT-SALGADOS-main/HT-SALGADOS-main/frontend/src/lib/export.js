import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export function downloadFile(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const esc = (v) => {
  const s = String(v ?? "");
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportCSV(name, sections) {
  const lines = [];
  sections.forEach((s) => {
    lines.push(esc(s.title));
    lines.push(s.head.map(esc).join(";"));
    s.rows.forEach((r) => lines.push(r.map(esc).join(";")));
    lines.push("");
  });
  downloadFile(name, "\uFEFF" + lines.join("\n"), "text/csv;charset=utf-8");
}

const latin = (v) => String(v ?? "").replace(/[\u2013\u2014]/g, "-").replace(/[^\x00-\xFF]/g, "");

export function exportPDF(name, title, subtitle, sections) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(latin(title), 14, 16);
  doc.setFontSize(10);
  doc.text(latin(subtitle), 14, 23);
  let y = 32;
  sections.forEach((s) => {
    if (y > 260) {
      doc.addPage();
      y = 18;
    }
    doc.setFontSize(12);
    doc.text(latin(s.title), 14, y);
    autoTable(doc, {
      startY: y + 3,
      head: [s.head.map(latin)],
      body: s.rows.map((r) => r.map(latin)),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [234, 88, 12] },
    });
    y = doc.lastAutoTable.finalY + 12;
  });
  doc.save(name);
}
