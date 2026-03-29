function sanitizeColor(color) {
  return color === "white" ? "#FFFFFF" : "#000000";
}

function getSvgSize(svgEl) {
  const viewBox = svgEl.viewBox && svgEl.viewBox.baseVal ? svgEl.viewBox.baseVal : null;
  if (viewBox && Number.isFinite(viewBox.width) && Number.isFinite(viewBox.height)) {
    return { width: Math.max(1, viewBox.width), height: Math.max(1, viewBox.height) };
  }
  const rect = svgEl.getBoundingClientRect();
  return {
    width: Math.max(1, rect.width || Number(svgEl.getAttribute("width")) || 1),
    height: Math.max(1, rect.height || Number(svgEl.getAttribute("height")) || 1),
  };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load notation image"));
    img.src = url;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to render PNG"));
    }, "image/png");
  });
}

export async function exportNotationPng(containerEl, opts = {}) {
  if (!containerEl) throw new Error("Notation container not found");
  const color = sanitizeColor(opts.color);
  const filename = String(opts.filename || "Drum Notation").trim() || "Drum Notation";
  const exportScale = Math.max(2, Math.min(12, Number(opts.scale) || 12));
  const svgEls = Array.from(containerEl.querySelectorAll("svg"));
  if (svgEls.length === 0) throw new Error("No notation SVGs found to export");

  const containerRect = containerEl.getBoundingClientRect();
  const renderedSvgs = svgEls
    .map((svgEl) => {
      const rect = svgEl.getBoundingClientRect();
      const size = getSvgSize(svgEl);
      return {
        svgEl,
        left: Math.max(0, rect.left - containerRect.left),
        top: Math.max(0, rect.top - containerRect.top),
        width: size.width,
        height: size.height,
      };
    })
    .filter((entry) => entry.width > 0 && entry.height > 0);

  if (!renderedSvgs.length) throw new Error("No visible notation SVGs found to export");

  const canvasWidth = Math.max(
    1,
    Math.ceil(Math.max(...renderedSvgs.map((entry) => entry.left + entry.width)))
  );
  const canvasHeight = Math.max(
    1,
    Math.ceil(Math.max(...renderedSvgs.map((entry) => entry.top + entry.height)))
  );
  const scale = exportScale;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(canvasWidth * scale);
  canvas.height = Math.ceil(canvasHeight * scale);
  canvas.style.width = `${canvasWidth}px`;
  canvas.style.height = `${canvasHeight}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);

  for (const entry of renderedSvgs) {
    const clone = entry.svgEl.cloneNode(true);
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = `
      * { stroke: ${color} !important; }
      text { fill: ${color} !important; }
      path, rect, circle, ellipse, polygon { fill: ${color} !important; }
    `;
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.appendChild(style);
    clone.insertBefore(defs, clone.firstChild);
    clone.setAttribute("width", String(entry.width));
    clone.setAttribute("height", String(entry.height));
    if (!clone.getAttribute("viewBox")) {
      clone.setAttribute("viewBox", `0 0 ${entry.width} ${entry.height}`);
    }
    const markup = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImage(url);
      ctx.drawImage(img, entry.left, entry.top, entry.width, entry.height);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const blob = await canvasToBlob(canvas);
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${filename}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
