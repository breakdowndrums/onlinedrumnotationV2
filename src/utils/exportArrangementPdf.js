import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import QRCode from "qrcode";

function cloneSvgForPrint(svg) {
  const clone = svg.cloneNode(true);
  clone.querySelectorAll(".dg-active-bar, .dg-selected-bar, .dg-click-bar").forEach((el) => el.remove());
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `
    * { stroke: #000 !important; }
    text { fill: #000 !important; stroke: none !important; }
    path, rect, circle, ellipse, polygon { fill: #000 !important; }
  `;
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.appendChild(style);
  clone.insertBefore(defs, clone.firstChild);
  return clone;
}

function parseNumericLength(value) {
  const n = Number.parseFloat(String(value || ""));
  return Number.isFinite(n) ? n : 0;
}

function getSvgSize(svg) {
  const attrWidth = parseNumericLength(svg.getAttribute("width"));
  const attrHeight = parseNumericLength(svg.getAttribute("height"));
  if (attrWidth > 0 && attrHeight > 0) return { width: attrWidth, height: attrHeight };
  const viewBox = (svg.getAttribute("viewBox") || "").trim().split(/\s+/).map(Number);
  if (viewBox.length === 4 && Number.isFinite(viewBox[2]) && Number.isFinite(viewBox[3])) {
    return { width: viewBox[2], height: viewBox[3] };
  }
  const rect = svg.getBoundingClientRect();
  return { width: rect.width || 0, height: rect.height || 0 };
}

function getPageSize(pageEl) {
  const width = parseNumericLength(pageEl.style.width) || parseNumericLength(pageEl.getAttribute("data-page-width")) || 794;
  const height = parseNumericLength(pageEl.style.height) || parseNumericLength(pageEl.getAttribute("data-page-height")) || 1123;
  return { width, height };
}

function getRelativeRect(el, ancestorRect) {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left - ancestorRect.left,
    y: rect.top - ancestorRect.top,
    width: rect.width,
    height: rect.height,
  };
}

function buildPageSvg(pageEl, pageRect) {
  const pageDomRect = pageEl.getBoundingClientRect();
  const pageSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  pageSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  pageSvg.setAttribute("width", String(pageRect.width));
  pageSvg.setAttribute("height", String(pageRect.height));
  pageSvg.setAttribute("viewBox", `0 0 ${pageRect.width} ${pageRect.height}`);

  const svgEls = Array.from(pageEl.querySelectorAll("svg"));
  for (const svg of svgEls) {
    const rel = getRelativeRect(svg, pageDomRect);
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("transform", `translate(${rel.x}, ${rel.y})`);
    const clone = cloneSvgForPrint(svg);
    clone.removeAttribute("class");
    clone.setAttribute("x", "0");
    clone.setAttribute("y", "0");
    group.appendChild(clone);
    pageSvg.appendChild(group);
  }
  return pageSvg;
}

export async function exportArrangementPdf(containerEl, opts = {}) {
  if (!containerEl) throw new Error("Arrangement export container not found");

  const pageEls = Array.from(containerEl.querySelectorAll('[data-arr-export-page="1"]'));
  if (pageEls.length < 1) throw new Error("No arrangement pages found to export");

  const title = opts.title || "arrangement-sheet";
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const pad = 36;
  const usableW = pageW - pad * 2;
  const qrText = String(opts.qrText || "").trim();
  const watermarkEnabled = opts.watermark !== false;
  const qrDataUrl = qrText ? await QRCode.toDataURL(qrText, {
    margin: 0,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
    width: 256,
  }) : "";
  const qrSize = 62;
  for (let pageIndex = 0; pageIndex < pageEls.length; pageIndex++) {
    if (pageIndex > 0) pdf.addPage();
    const pageEl = pageEls[pageIndex];
    const pageRect = getPageSize(pageEl);
    if (!pageRect.width || !pageRect.height) continue;

    const topPad = pad;
    const usableH = pageH - topPad - pad;
    const scale = Math.min(usableW / pageRect.width, usableH / pageRect.height);
    const offsetX = pad + (usableW - pageRect.width * scale) / 2;
    const offsetY = topPad + (usableH - pageRect.height * scale) / 2;
    const composedPageSvg = buildPageSvg(pageEl, pageRect);
    await svg2pdf(composedPageSvg, pdf, {
      x: offsetX,
      y: offsetY,
      width: pageRect.width * scale,
      height: pageRect.height * scale,
    });

    if (qrDataUrl) {
      pdf.addImage(qrDataUrl, "PNG", pad, pageH - pad - qrSize, qrSize, qrSize);
    }
    if (watermarkEnabled) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(176, 176, 176);
      pdf.text("onlinedrumnotation.com", pageW / 2, pageH - 14, { align: "center", baseline: "bottom" });
      pdf.setTextColor(0, 0, 0);
    }
  }

  pdf.save(`${title}.pdf`);
}
