import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";

/**
 * Vector PDF export (no rasterization).
 * Converts each VexFlow <svg> inside containerEl into a PDF page using svg2pdf.js.
 */
export async function exportNotationPdf(containerEl, opts = {}) {
  if (!containerEl) throw new Error("Notation container not found");

  const title = opts.title || "drum-notation";
  const scoreTitle = (opts.scoreTitle || "").trim();
  const composer = (opts.composer || "").trim();
  const watermarkEnabled = opts.watermark !== false;
  const includeSticking = opts.includeSticking === true;
  const svgEls = Array.from(containerEl.querySelectorAll("svg"));
  if (svgEls.length === 0) throw new Error("No notation SVGs found to export");

  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const pad = 36; // 0.5 inch
  const maxW = pageW - pad * 2;

  for (let i = 0; i < svgEls.length; i++) {
    const svg = svgEls[i];
    const showHeader = i === 0 && (scoreTitle || composer);
    const topPad = showHeader ? pad + 36 : pad;
    const maxH = pageH - topPad - pad;

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
    const vb = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null;
    let bbox = null;
    try {
      bbox = svg.getBBox ? svg.getBBox() : null;
    } catch (_) {
      bbox = null;
    }
    let svgX = vb ? vb.x : 0;
    let svgY = vb ? vb.y : 0;
    let svgW = vb ? vb.width : bbox?.width || 800;
    let svgH = vb ? vb.height : bbox?.height || 200;

    // Sticking is drawn below the staff; expand the SVG crop to include that text.
    if (
      includeSticking &&
      bbox &&
      Number.isFinite(bbox.x) &&
      Number.isFinite(bbox.y) &&
      Number.isFinite(bbox.width) &&
      Number.isFinite(bbox.height)
    ) {
      const padX = 8;
      const padY = 10;
      const left = Math.min(svgX, bbox.x - padX);
      const top = Math.min(svgY, bbox.y - padY);
      const right = Math.max(svgX + svgW, bbox.x + bbox.width + padX);
      const bottom = Math.max(svgY + svgH, bbox.y + bbox.height + padY);
      svgX = left;
      svgY = top;
      svgW = Math.max(1, right - left);
      svgH = Math.max(1, bottom - top);
      clone.setAttribute("viewBox", `${svgX} ${svgY} ${svgW} ${svgH}`);
    }

    // Fit to page preserving aspect ratio
    const scale = Math.min(maxW / svgW, maxH / svgH);
    const outW = svgW * scale;
    const outH = svgH * scale;
    const x = pad + (maxW - outW) / 2;
    const y = topPad + (maxH - outH) / 2;

    if (i > 0) pdf.addPage();
    if (showHeader) {
      if (scoreTitle) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(22);
        pdf.text(scoreTitle, pageW / 2, pad - 8 + 16, { align: "center" });
      }
      if (composer) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(11);
        pdf.text(`Composer: ${composer}`, pageW - pad, pad - 6 + 16, { align: "right" });
      }
    }
    if (watermarkEnabled) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(180, 180, 180);
      pdf.text("onlinedrumnotation.com", pageW / 2, pageH - 14, { align: "center" });
      pdf.setTextColor(0, 0, 0);
    }

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
