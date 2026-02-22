import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";

/**
 * Vector PDF export (no rasterization).
 * Converts each VexFlow <svg> inside containerEl into a PDF page using svg2pdf.js.
 */
export async function exportNotationPdf(containerEl, opts = {}) {
  if (!containerEl) throw new Error("Notation container not found");

  const title = opts.title || "drum-notation";
  const svgEls = Array.from(containerEl.querySelectorAll("svg"));
  if (svgEls.length === 0) throw new Error("No notation SVGs found to export");

  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const pad = 36; // 0.5 inch
  const maxW = pageW - pad * 2;
  const maxH = pageH - pad * 2;

  for (let i = 0; i < svgEls.length; i++) {
    const svg = svgEls[i];

    // Clone so we can safely adjust styling for print without touching UI
    const clone = svg.cloneNode(true);

    // Force print-friendly black strokes/fills while preserving stroke widths
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = `
      /* Ensure black notation on white paper */
      * { stroke: #000 !important; }
      text { fill: #000 !important; }
      /* Noteheads and filled glyphs */
      path, rect, circle, ellipse, polygon { fill: #000 !important; }
    `;
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.appendChild(style);
    // Put defs first so it applies everywhere
    clone.insertBefore(defs, clone.firstChild);

    // Determine SVG intrinsic size from viewBox (preferred) or bbox
    const vb = clone.viewBox && clone.viewBox.baseVal ? clone.viewBox.baseVal : null;
    const svgW = vb ? vb.width : (clone.getBBox ? clone.getBBox().width : 800);
    const svgH = vb ? vb.height : (clone.getBBox ? clone.getBBox().height : 200);

    // Fit to page preserving aspect ratio
    const scale = Math.min(maxW / svgW, maxH / svgH);
    const outW = svgW * scale;
    const outH = svgH * scale;
    const x = pad + (maxW - outW) / 2;
    const y = pad + (maxH - outH) / 2;

    if (i > 0) pdf.addPage();

    // svg2pdf renders into current page; specify x/y and scale
    await svg2pdf(clone, pdf, {
      x,
      y,
      width: outW,
      height: outH,
    });
  }

  pdf.save(`${title}.pdf`);
}
