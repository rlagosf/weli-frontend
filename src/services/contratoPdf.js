// src/services/contratoPdf.js
import jsPDF from "jspdf";

/**
 * Export nombrado: buildContratoPdfBlob
 * Objetivo estético:
 * - Márgenes EXACTOS 2cm izq/der
 * - Título principal centrado
 * - Subtítulos a la izquierda
 * - Cuerpo JUSTIFICADO real (margen derecho parejo)
 */
export async function buildContratoPdfBlob({
  texto = "",
  watermarkSrc = "/logo-en-negativo.png",
  bodyFont = "Aptos", // si no existe, cae a helvetica
  bodyFontStyle = "normal",
  bodyFontBoldStyle = "bold",
} = {}) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
    compress: true,
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  /* =========================
     Helpers: unidades / layout
  ========================= */
  const cmToPt = (cm) => (Number(cm) || 0) * 28.3464566929; // 1 cm en puntos

  // ✅ 2cm exactos
  const marginX = cmToPt(2);
  const topY = cmToPt(3.2);          // inicio cuerpo (bajo el header)
  const bottomMargin = cmToPt(3);   // pie + aire
  const maxWidth = pageW - marginX * 2;

  const fontSizeBody = 12;
  const lineHeight = 18;     // ~1.5
  const paraGap = 6;

  /* =========================
     Helpers: watermark
  ========================= */
  const tryLoadImage = (src) =>
    new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = src;
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
    });

  const logo = await tryLoadImage(watermarkSrc);

  const drawWatermark = () => {
    if (!logo) return;
    const size = 320;
    try {
      const gState = doc.GState ? doc.GState({ opacity: 0.10 }) : null;
      if (gState) doc.setGState(gState);
      doc.addImage(logo, "PNG", (pageW - size) / 2, (pageH - size) / 2, size, size);
      if (gState && doc.GState) doc.setGState(doc.GState({ opacity: 1 }));
    } catch {
      // noop
    }
  };

  /* =========================
     Fonts safe
  ========================= */
  const safeSetFont = (name, style) => {
    try {
      doc.setFont(name, style);
    } catch {
      doc.setFont("helvetica", style === "bold" ? "bold" : "normal");
    }
  };

  /* =========================
     Título principal centrado
  ========================= */
  const MAIN_TITLE =
    "CONTRATO DE PRESTACIÓN DE SERVICIOS DE ENSEÑANZA DEPORTIVA ESPECIALIZADA EN FÚTBOL";

  const header = () => {
    drawWatermark();

    // Título centrado
    safeSetFont(bodyFont, bodyFontBoldStyle);
    doc.setFontSize(12);

    const titleLines = doc.splitTextToSize(MAIN_TITLE, maxWidth);
    let yTitle = 55;
    for (const t of titleLines) {
      doc.text(String(t), pageW / 2, yTitle, { align: "center" });
      yTitle += 14;
    }

    // línea separadora
    doc.setDrawColor(200);
    doc.setLineWidth(0.8);
    doc.line(marginX, 84, pageW - marginX, 84);

    // ✅ MUY IMPORTANTE: volver a cuerpo NORMAL (evita “primer párrafo en negrita”)
    safeSetFont(bodyFont, bodyFontStyle);
    doc.setFontSize(fontSizeBody);
    doc.setTextColor(0);
  };

  /* =========================
     Normalización
  ========================= */
  const cleanLine = (s) =>
    String(s || "")
      .replace(/\t/g, " ")
      .replace(/\u00A0/g, " ")
      .replace(/[ ]{2,}/g, " ")
      .trimEnd();

  const normalizeSpaces = (s) => String(s || "").replace(/\s+/g, " ").trim();

  /* =========================
     Detectar subtítulos (izquierda)
     OJO: NO tratamos "1.- ..." como título, porque eso te arruinó el contrato.
     Subtítulo = línea corta y "de encabezado" (caps) o "ALGO:"
  ========================= */
  const isSubtitleLine = (s) => {
    const t = String(s || "").trim();
    if (!t) return false;
    if (t.length > 70) return false;

    // Línea tipo "PRIMERA:" "SEGUNDA:" "CLAUSULA X:"
    if (/^[A-Za-zÁÉÍÓÚÑÜ\s]{3,40}:\s*$/.test(t)) return true;

    // MAYÚSCULAS cortas (tipo "MODELO...", "COMPARECENCIA", etc.)
    const caps = t === t.toUpperCase();
    const wc = t.split(/\s+/).filter(Boolean).length;

    // Evitar que un párrafo completo en caps sea “subtítulo”
    if (caps && wc <= 8) return true;

    return false;
  };

  const underlineText = (text, x, y) => {
    const w = doc.getTextWidth(text);
    doc.setDrawColor(0);
    doc.setLineWidth(0.7);
    doc.line(x, y + 2, x + w, y + 2);
  };

  /* =========================
     JUSTIFICADO REAL (manual)
     - Justifica todas las líneas excepto la última del párrafo
     - Respeta maxWidth => margen derecho parejo
  ========================= */
  const measure = (txt) => doc.getTextWidth(txt);

  const justifyLine = (line, x, y, targetWidth) => {
    const words = normalizeSpaces(line).split(" ").filter(Boolean);
    if (words.length <= 1) {
      doc.text(words[0] ?? "", x, y);
      return;
    }

    const spaceW = measure(" ");
    const wordsW = words.reduce((acc, w) => acc + measure(w), 0);
    const gaps = words.length - 1;

    // ancho con 1 espacio base entre palabras
    const baseW = wordsW + spaceW * gaps;

    // extra para llegar justo al margen derecho
    const extra = targetWidth - baseW;

    // si no hay extra (o se pasa), no justificamos
    if (extra <= 0) {
      doc.text(words.join(" "), x, y);
      return;
    }

    const extraPerGap = extra / gaps;

    let cursor = x;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      doc.text(w, cursor, y);
      cursor += measure(w);

      if (i < gaps) cursor += spaceW + extraPerGap;
    }
  };

  const renderParagraph = (textLine, x, y) => {
    // splitTextToSize ya respeta maxWidth, pero le quitamos doble-espacios primero
    const normalized = normalizeSpaces(String(textLine || "").replace(/\t/g, " "));
    const wrapped = doc.splitTextToSize(normalized, maxWidth);

    for (let i = 0; i < wrapped.length; i++) {
      const ln = String(wrapped[i] || "");
      const isLast = i === wrapped.length - 1;

      if (!isLast) justifyLine(ln, x, y, maxWidth);
      else doc.text(ln.trim(), x, y);

      y += lineHeight;
    }

    return y;
  };

  /* =========================
     Texto: evitar título duplicado
  ========================= */
  let content = String(texto || "").replace(/\r\n/g, "\n");
  const first = cleanLine(content.split("\n")[0] || "").trim();

  if (first && first.toUpperCase() === MAIN_TITLE.toUpperCase()) {
    content = content.split("\n").slice(1).join("\n").replace(/^\s*\n+/, "");
  }

  const lines = content.split("\n");

  /* =========================
     Paginación / footer
  ========================= */
  const addFooter = (pageNumber) => {
    safeSetFont(bodyFont, bodyFontStyle);
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(`WELI APP • Página ${pageNumber}`, pageW / 2, pageH - 26, { align: "center" });

    doc.setTextColor(0);
    doc.setFontSize(fontSizeBody);
    safeSetFont(bodyFont, bodyFontStyle);
  };

  const newPage = () => {
    addFooter(doc.internal.getCurrentPageInfo().pageNumber);
    doc.addPage();
    header();
    y = topY;
  };

  const ensureSpace = (needed = lineHeight) => {
    const limit = pageH - bottomMargin;
    if (y + needed >= limit) newPage();
  };

  /* =========================
     Render
  ========================= */
  safeSetFont(bodyFont, bodyFontStyle);
  doc.setFontSize(fontSizeBody);
  doc.setTextColor(0);

  header();
  let y = topY;

  for (const raw of lines) {
    const line = cleanLine(raw);

    // línea vacía => espacio pequeño
    if (!line.trim()) {
      y += Math.round(lineHeight * 0.55);
      ensureSpace(0);
      continue;
    }

    // ✅ subtítulo alineado a la izquierda (NO justify)
    if (isSubtitleLine(line)) {
      ensureSpace(Math.round(lineHeight * 1.2));

      safeSetFont(bodyFont, bodyFontBoldStyle);
      doc.setFontSize(12);

      doc.text(line.trim(), marginX, y); // izquierda
      underlineText(line.trim(), marginX, y);

      safeSetFont(bodyFont, bodyFontStyle);
      doc.setFontSize(fontSizeBody);

      y += Math.round(lineHeight * 1.15);
      continue;
    }

    // ✅ cuerpo justificado real
    ensureSpace(lineHeight);
    y = renderParagraph(line, marginX, y);

    y += paraGap;
    ensureSpace(0);
  }

  addFooter(doc.internal.getCurrentPageInfo().pageNumber);
  return doc.output("blob");
}
