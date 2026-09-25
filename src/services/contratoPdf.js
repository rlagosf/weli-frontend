// src/services/contratoPdf.js
import jsPDF from "jspdf";

/**
 * Genera el contrato WELI en PDF.
 *
 * Criterios:
 * - Papel Letter vertical.
 * - Márgenes laterales de 2 cm.
 * - Encabezado contractual limpio.
 * - Zona segura superior e inferior.
 * - Cuerpo justificado.
 * - Interlineado uniforme.
 * - Paginación línea por línea.
 * - Tabla económica dinámica.
 * - Tabla económica multipágina.
 * - Subtítulos protegidos contra cortes.
 * - Viñetas con sangría francesa.
 * - Bloque final de firmas.
 */
export async function buildContratoPdfBlob({
  titulo = "CONTRATO DE PRESTACIÓN DE SERVICIOS DE ENSEÑANZA DEPORTIVA",
  texto = "",
  economia = [],
  totalBase = null,
  totalDescuento = null,
  totalFinal = null,
  academiaNombre = "",
  apoderadoNombre = "",
  watermarkSrc = "/logo-en-negativo.png",
  bodyFont = "Aptos",
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

  /* =========================================================
     CONFIGURACIÓN GENERAL
  ========================================================= */
  const cmToPt = (cm) => (Number(cm) || 0) * 28.3464566929;

  const marginX = cmToPt(2);
  const maxWidth = pageW - marginX * 2;

  const fontSizeBody = 11.5;
  const lineHeight = 16.5;
  const paragraphGap = 6;

  const HEADER_TITLE_Y = 47;
  const HEADER_LINE_GAP = 13;
  const HEADER_SEPARATOR_GAP = 10;
  const HEADER_CONTENT_GAP = 17;

  const FOOTER_TEXT_Y = pageH - 23;
  const FOOTER_LINE_Y = pageH - 43;
  const FOOTER_CONTENT_GAP = 16;

  let contentTop = 105;
  const contentBottom = FOOTER_LINE_Y - FOOTER_CONTENT_GAP;

  /* =========================================================
     HELPERS GENERALES
  ========================================================= */
  const roundMoney = (value) => {
    const number = Number(value);

    if (!Number.isFinite(number)) return 0;

    return Math.round(number * 100) / 100;
  };

  const formatMoney = (value) => {
    if (typeof value === "string" && value.trim().startsWith("$")) {
      return value.trim();
    }

    const number = Number(value ?? 0);

    if (!Number.isFinite(number)) {
      return "$0";
    }

    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    }).format(number);
  };

  const normalizeSpaces = (value) =>
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();

  const cleanLine = (value) =>
    String(value ?? "")
      .replace(/\t/g, " ")
      .replace(/\u00A0/g, " ")
      .replace(/[ ]{2,}/g, " ")
      .trimEnd();

  /* =========================================================
     WATERMARK
  ========================================================= */
  const tryLoadImage = (src) =>
    new Promise((resolve) => {
      if (!src) {
        resolve(null);
        return;
      }

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
      const gState = doc.GState ? doc.GState({ opacity: 0.08 }) : null;

      if (gState) {
        doc.setGState(gState);
      }

      doc.addImage(logo, "PNG", (pageW - size) / 2, (pageH - size) / 2, size, size);

      if (gState && doc.GState) {
        doc.setGState(doc.GState({ opacity: 1 }));
      }
    } catch {
      // La ausencia de watermark no debe impedir generar el contrato.
    }
  };

  /* =========================================================
     FUENTES
  ========================================================= */
  const safeSetFont = (name, style) => {
    try {
      doc.setFont(name, style);
    } catch {
      doc.setFont("helvetica", style === "bold" ? "bold" : "normal");
    }
  };

  const setBodyFont = (size = fontSizeBody) => {
    safeSetFont(bodyFont, bodyFontStyle);

    doc.setFontSize(size);
    doc.setTextColor(0);
  };

  const setBoldFont = (size = fontSizeBody) => {
    safeSetFont(bodyFont, bodyFontBoldStyle);

    doc.setFontSize(size);
    doc.setTextColor(0);
  };

  const measure = (text) => doc.getTextWidth(String(text ?? ""));

  /* =========================================================
     HEADER
  ========================================================= */
  const drawHeader = () => {
    drawWatermark();

    const normalizedTitle = normalizeSpaces(titulo) || "CONTRATO DE PRESTACIÓN DE SERVICIOS DE ENSEÑANZA DEPORTIVA";

    setBoldFont(11.5);

    const titleLines = doc.splitTextToSize(normalizedTitle, maxWidth - 20);

    let titleY = HEADER_TITLE_Y;

    for (const line of titleLines) {
      doc.text(String(line), pageW / 2, titleY, {
        align: "center",
      });

      titleY += HEADER_LINE_GAP;
    }

    const separatorY = titleY + HEADER_SEPARATOR_GAP;

    doc.setDrawColor(190);
    doc.setLineWidth(0.7);

    doc.line(marginX, separatorY, pageW - marginX, separatorY);

    contentTop = separatorY + HEADER_CONTENT_GAP;

    setBodyFont();
  };

  /* =========================================================
     FOOTER
  ========================================================= */
  const drawFooter = (pageNumber) => {
    doc.setDrawColor(205);
    doc.setLineWidth(0.6);

    doc.line(marginX, FOOTER_LINE_Y, pageW - marginX, FOOTER_LINE_Y);

    safeSetFont(bodyFont, bodyFontStyle);

    doc.setFontSize(8.5);
    doc.setTextColor(100);

    doc.text(`WELI APP • Página ${pageNumber}`, pageW / 2, FOOTER_TEXT_Y, {
      align: "center",
    });

    setBodyFont();
  };

  /* =========================================================
     PAGINACIÓN
  ========================================================= */
  let y = 0;

  const newPage = () => {
    drawFooter(doc.internal.getCurrentPageInfo().pageNumber);

    doc.addPage();
    drawHeader();

    y = contentTop;
  };

  const ensureSpace = (needed = lineHeight) => {
    if (y + needed > contentBottom) {
      newPage();
    }
  };

  /* =========================================================
     JUSTIFICADO
  ========================================================= */
  const justifyLine = (line, x, currentY, targetWidth) => {
    const words = normalizeSpaces(line).split(" ").filter(Boolean);

    if (words.length <= 1) {
      doc.text(words[0] ?? "", x, currentY);

      return;
    }

    const spaceWidth = measure(" ");

    const wordsWidth = words.reduce((total, word) => total + measure(word), 0);

    const gaps = words.length - 1;

    const naturalWidth = wordsWidth + spaceWidth * gaps;

    const extra = targetWidth - naturalWidth;

    if (extra <= 0 || extra / gaps > spaceWidth * 2.5) {
      doc.text(words.join(" "), x, currentY);

      return;
    }

    const extraPerGap = extra / gaps;

    let cursor = x;

    for (let index = 0; index < words.length; index++) {
      const word = words[index];

      doc.text(word, cursor, currentY);

      cursor += measure(word);

      if (index < gaps) {
        cursor += spaceWidth + extraPerGap;
      }
    }
  };

  /* =========================================================
     PÁRRAFOS
  ========================================================= */
  const renderParagraph = (text) => {
    setBodyFont();

    const normalized = normalizeSpaces(String(text ?? "").replace(/\t/g, " "));

    if (!normalized) return;

    const wrapped = doc.splitTextToSize(normalized, maxWidth);

    /*
     * Evita dejar sólo una línea
     * del párrafo al final de página.
     */
    if (wrapped.length > 1 && y + lineHeight * 2 > contentBottom) {
      newPage();
    }

    for (let index = 0; index < wrapped.length; index++) {
      ensureSpace(lineHeight);

      const line = String(wrapped[index] ?? "");

      const isLast = index === wrapped.length - 1;

      if (isLast) {
        doc.text(line.trim(), marginX, y);
      } else {
        justifyLine(line, marginX, y, maxWidth);
      }

      y += lineHeight;
    }

    /*
     * ÚNICA separación entre párrafos.
     */
    y += paragraphGap;
  };

  /* =========================================================
     DETECCIÓN DE ELEMENTOS
  ========================================================= */
  const isSubtitleLine = (value) => {
    const text = normalizeSpaces(value);

    if (!text) return false;
    if (text.length > 85) {
      return false;
    }

    if (/^[A-Za-zÁÉÍÓÚÑÜ0-9\s.-]{3,60}:\s*$/.test(text)) {
      return true;
    }

    const isCaps = text === text.toUpperCase();

    const wordCount = text.split(/\s+/).filter(Boolean).length;

    return isCaps && wordCount <= 10;
  };

  const isBulletLine = (value) => /^\s*[•●▪]\s+/.test(String(value ?? ""));

  const isFinancialSummaryLine = (value) =>
    /^(Total base|Descuentos y\/o beneficios aplicados|Total aplicable al momento de la inscripción)\s*:/i.test(
      normalizeSpaces(value)
    );

  const isLeadLine = (value) => {
    const text = normalizeSpaces(value);

    if (!text.endsWith(":")) {
      return false;
    }

    if (text.length > 90) {
      return false;
    }

    return !isBulletLine(text);
  };

  /* =========================================================
     SUBTÍTULOS
  ========================================================= */
  const renderSubtitle = (text) => {
    ensureSpace(lineHeight * 3.2);

    setBoldFont(11.5);

    const wrapped = doc.splitTextToSize(normalizeSpaces(text), maxWidth);

    for (const line of wrapped) {
      ensureSpace(lineHeight);

      doc.text(String(line), marginX, y);

      y += lineHeight;
    }

    doc.setDrawColor(215);
    doc.setLineWidth(0.45);

    doc.line(marginX, y - 7, pageW - marginX, y - 7);

    y += paragraphGap;

    setBodyFont();
  };

  /* =========================================================
     LÍNEAS INTRODUCTORIAS
  ========================================================= */
  const renderLeadLine = (text) => {
    ensureSpace(lineHeight * 2);

    setBoldFont();

    const wrapped = doc.splitTextToSize(normalizeSpaces(text), maxWidth);

    for (const line of wrapped) {
      ensureSpace(lineHeight);

      doc.text(String(line), marginX, y);

      y += lineHeight;
    }

    y += paragraphGap;

    setBodyFont();
  };

  /* =========================================================
     VIÑETAS
  ========================================================= */
  const renderBullet = (value) => {
    const text = normalizeSpaces(String(value ?? "").replace(/^\s*[•●▪]\s*/, ""));

    if (!text) return;

    const bulletX = marginX + 1;

    const textX = marginX + 14;

    const availableWidth = maxWidth - 14;

    const wrapped = doc.splitTextToSize(text, availableWidth);

    if (wrapped.length > 1 && y + lineHeight * 2 > contentBottom) {
      newPage();
    }

    for (let index = 0; index < wrapped.length; index++) {
      ensureSpace(lineHeight);

      if (index === 0) {
        setBoldFont(10.5);

        doc.text("•", bulletX, y);

        const firstLine = String(wrapped[index] ?? "");

        const colonIndex = firstLine.indexOf(":");

        if (colonIndex > 0 && colonIndex < 35) {
          const label = firstLine.slice(0, colonIndex + 1).trim();

          const rest = firstLine.slice(colonIndex + 1).trim();

          setBoldFont();

          doc.text(label, textX, y);

          const labelWidth = measure(label);

          setBodyFont();

          if (rest) {
            doc.text(rest, textX + labelWidth + measure(" "), y);
          }
        } else {
          setBodyFont();

          doc.text(firstLine, textX, y);
        }
      } else {
        setBodyFont();

        doc.text(String(wrapped[index] ?? ""), textX, y);
      }

      y += lineHeight;
    }

    y += paragraphGap;
  };

  /* =========================================================
     RESUMEN ECONÓMICO ANTIGUO
     Se conserva como fallback temporal.
  ========================================================= */
  const renderFinancialSummary = (value) => {
    const text = normalizeSpaces(value);

    const colonIndex = text.indexOf(":");

    if (colonIndex === -1) {
      renderParagraph(text);
      return;
    }

    const label = text.slice(0, colonIndex).trim();

    const amount = text.slice(colonIndex + 1).trim();

    ensureSpace(lineHeight + 2);

    setBoldFont();

    doc.text(`${label}:`, marginX + 10, y);

    setBodyFont();

    doc.text(amount, pageW - marginX - 10, y, {
      align: "right",
    });

    y += lineHeight + paragraphGap;
  };

  /* =========================================================
     TABLA ECONÓMICA DINÁMICA
  ========================================================= */
  const renderEconomicTable = () => {
    if (!Array.isArray(economia) || economia.length === 0) {
      renderParagraph("No existen conceptos económicos configurados para esta inscripción.");

      return;
    }

    const tableX = marginX;
    const tableWidth = maxWidth;

    /*
     * Distribución:
     * Concepto   23 %
     * Base       17 %
     * Beneficio  25 %
     * Descuento  17 %
     * Total      18 %
     */
    const widths = [tableWidth * 0.23, tableWidth * 0.17, tableWidth * 0.25, tableWidth * 0.17, tableWidth * 0.18];

    const headers = ["Concepto", "Tarifa base", "Beneficio", "Descuento", "Total"];

    const cellPadding = 5;
    const tableFontSize = 9;
    const tableLineHeight = 12;
    const tableBottomGap = 18;

    const calculateLines = (text, width) =>
      doc.splitTextToSize(String(text ?? ""), Math.max(20, width - cellPadding * 2));

    const getRowHeight = (values) => {
      let maxLines = 1;

      values.forEach((value, index) => {
        const lines = calculateLines(value, widths[index]);

        maxLines = Math.max(maxLines, lines.length);
      });

      return maxLines * tableLineHeight + cellPadding * 2;
    };

    const drawRowBorders = (rowY, rowHeight) => {
      doc.setDrawColor(185);
      doc.setLineWidth(0.45);

      doc.line(tableX, rowY, tableX + tableWidth, rowY);

      doc.line(tableX, rowY + rowHeight, tableX + tableWidth, rowY + rowHeight);

      let currentX = tableX;

      doc.line(currentX, rowY, currentX, rowY + rowHeight);

      for (const width of widths) {
        currentX += width;

        doc.line(currentX, rowY, currentX, rowY + rowHeight);
      }
    };

    const drawCellText = ({ text, x, rowY, width, align = "left", bold = false }) => {
      if (bold) {
        setBoldFont(tableFontSize);
      } else {
        setBodyFont(tableFontSize);
      }

      const lines = calculateLines(text, width);

      let textY = rowY + cellPadding + tableLineHeight - 2;

      for (const line of lines) {
        if (align === "right") {
          doc.text(String(line), x + width - cellPadding, textY, {
            align: "right",
          });
        } else if (align === "center") {
          doc.text(String(line), x + width / 2, textY, {
            align: "center",
          });
        } else {
          doc.text(String(line), x + cellPadding, textY);
        }

        textY += tableLineHeight;
      }
    };

    const drawHeaderRow = () => {
      const rowHeight = 28;

      if (y + rowHeight > contentBottom) {
        newPage();
      }

      doc.setFillColor(240, 240, 240);

      doc.rect(tableX, y, tableWidth, rowHeight, "F");

      drawRowBorders(y, rowHeight);

      let currentX = tableX;

      headers.forEach((headerText, index) => {
        drawCellText({
          text: headerText,
          x: currentX,
          rowY: y,
          width: widths[index],
          align: index === 0 || index === 2 ? "left" : "center",
          bold: true,
        });

        currentX += widths[index];
      });

      y += rowHeight;
    };

    const drawDataRow = (values) => {
      const rowHeight = getRowHeight(values);

      /*
       * La fila no se corta.
       * Si no cabe completa,
       * pasa a la página siguiente.
       */
      if (y + rowHeight > contentBottom) {
        newPage();
        drawHeaderRow();
      }

      drawRowBorders(y, rowHeight);

      let currentX = tableX;

      values.forEach((value, index) => {
        drawCellText({
          text: value,
          x: currentX,
          rowY: y,
          width: widths[index],
          align: index === 0 || index === 2 ? "left" : "right",
        });

        currentX += widths[index];
      });

      y += rowHeight;
    };

    drawHeaderRow();

    for (const item of economia) {
      const values = [
        item?.tipo_pago_nombre ?? item?.nombre ?? "Concepto",

        formatMoney(item?.monto_base ?? 0),

        item?.plan_nombre || "Sin Beneficio",

        formatMoney(
          item?.monto_descuento ?? Math.max(0, Number(item?.monto_base ?? 0) - Number(item?.monto_final ?? 0))
        ),

        formatMoney(item?.monto_final ?? 0),
      ];

      drawDataRow(values);
    }

    /*
     * Calculamos totales internamente
     * como fallback.
     */
    const calculatedBase = economia.reduce((sum, item) => sum + Number(item?.monto_base ?? 0), 0);

    const calculatedDiscount = economia.reduce(
      (sum, item) =>
        sum +
        Number(item?.monto_descuento ?? Math.max(0, Number(item?.monto_base ?? 0) - Number(item?.monto_final ?? 0))),
      0
    );

    const calculatedFinal = economia.reduce((sum, item) => sum + Number(item?.monto_final ?? 0), 0);

    const totalValues = [
      "TOTAL",
      formatMoney(totalBase ?? roundMoney(calculatedBase)),
      "",
      formatMoney(totalDescuento ?? roundMoney(calculatedDiscount)),
      formatMoney(totalFinal ?? roundMoney(calculatedFinal)),
    ];

    const totalHeight = getRowHeight(totalValues);

    if (y + totalHeight > contentBottom) {
      newPage();
      drawHeaderRow();
    }

    doc.setFillColor(247, 247, 247);

    doc.rect(tableX, y, tableWidth, totalHeight, "F");

    drawRowBorders(y, totalHeight);

    let currentX = tableX;

    totalValues.forEach((value, index) => {
      drawCellText({
        text: value,
        x: currentX,
        rowY: y,
        width: widths[index],
        align: index === 0 || index === 2 ? "left" : "right",
        bold: true,
      });

      currentX += widths[index];
    });

    y += totalHeight + tableBottomGap;

    setBodyFont();
  };

  /* =========================================================
     FIRMAS
  ========================================================= */
  const renderSignatures = () => {
    /*
     * Toda la sección debe caber junta.
     */
    const signatureBlockHeight = 102;

    if (y + signatureBlockHeight > contentBottom) {
      newPage();
    }

    y += 32;

    const horizontalPadding = 8;
    const centerGap = 35;

    const signatureWidth = (maxWidth - centerGap - horizontalPadding * 2) / 2;

    const leftX = marginX + horizontalPadding;

    const rightX = leftX + signatureWidth + centerGap;

    doc.setDrawColor(70);
    doc.setLineWidth(0.7);

    /*
     * Línea de firma academia.
     */
    doc.line(leftX, y, leftX + signatureWidth, y);

    /*
     * Línea de firma apoderado.
     */
    doc.line(rightX, y, rightX + signatureWidth, y);

    y += 15;

    setBoldFont(9.5);

    doc.text("POR LA ACADEMIA", leftX + signatureWidth / 2, y, {
      align: "center",
    });

    doc.text("APODERADO/A", rightX + signatureWidth / 2, y, {
      align: "center",
    });

    y += 14;

    setBodyFont(9);

    const academiaText = normalizeSpaces(academiaNombre) || "Academia";

    const apoderadoText = normalizeSpaces(apoderadoNombre) || "Apoderado/a";

    const academiaLines = doc.splitTextToSize(academiaText, signatureWidth - 8);

    const apoderadoLines = doc.splitTextToSize(apoderadoText, signatureWidth - 8);

    doc.text(academiaLines, leftX + signatureWidth / 2, y, {
      align: "center",
    });

    doc.text(apoderadoLines, rightX + signatureWidth / 2, y, {
      align: "center",
    });

    const nameLines = Math.max(academiaLines.length, apoderadoLines.length);

    y += nameLines * 11 + 11;

    doc.setFontSize(8.5);
    doc.setTextColor(90);

    doc.text("Firma representante", leftX + signatureWidth / 2, y, {
      align: "center",
    });

    doc.text("Firma de aceptación", rightX + signatureWidth / 2, y, {
      align: "center",
    });

    setBodyFont();
  };

  /* =========================================================
     ELIMINAR TÍTULO DUPLICADO DEL TEMPLATE
  ========================================================= */
  let content = String(texto ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const contentLines = content.split("\n");

  const firstNonEmptyIndex = contentLines.findIndex((line) => normalizeSpaces(line).length > 0);

  if (firstNonEmptyIndex !== -1) {
    const firstLine = normalizeSpaces(contentLines[firstNonEmptyIndex]);

    const normalizedTitle = normalizeSpaces(titulo);

    const isSameTitle = normalizedTitle && firstLine.toUpperCase() === normalizedTitle.toUpperCase();

    const isLegacyContractTitle =
      /^CONTRATO DE PRESTACIÓN DE SERVICIOS DE ENSEÑANZA DEPORTIVA(?:\s+ESPECIALIZADA EN .+)?$/i.test(firstLine);

    if (isSameTitle || isLegacyContractTitle) {
      contentLines.splice(firstNonEmptyIndex, 1);
    }
  }

  content = contentLines.join("\n").replace(/^\s*\n+/, "");

  const lines = content.split("\n");

  /* =========================================================
     RENDER
  ========================================================= */
  drawHeader();

  y = contentTop;

  for (const raw of lines) {
    const line = cleanLine(raw);

    const trimmed = line.trim();

    /*
     * Las líneas vacías del template ya NO
     * agregan espacio.
     *
     * De esta forma renderParagraph(),
     * renderBullet() y renderSubtitle()
     * controlan todo el espaciado vertical.
     */
    if (!trimmed) {
      continue;
    }

    /*
     * Marcador especial para la tabla.
     */
    if (trimmed === "[[TABLA_CONDICIONES_ECONOMICAS]]") {
      renderEconomicTable();
      continue;
    }

    /*
     * Subtítulo contractual.
     */
    if (isSubtitleLine(trimmed)) {
      /*
       * La última sección contractual debe permanecer
       * visualmente vinculada al bloque de firmas.
       *
       * Reservamos espacio suficiente para:
       * - título INTEGRIDAD CONTRACTUAL
       * - contenido final
       * - firmas
       *
       * Si no cabe, toda la sección comienza en una
       * página nueva, evitando una hoja exclusiva de firmas.
       */
      if (trimmed.toUpperCase() === "INTEGRIDAD CONTRACTUAL") {
        const finalSectionReserve = 250;

        if (y + finalSectionReserve > contentBottom) {
          newPage();
        }
      }

      renderSubtitle(trimmed);
      continue;
    }

    /*
     * Línea introductoria terminada en ":".
     */
    if (isLeadLine(trimmed)) {
      renderLeadLine(trimmed);
      continue;
    }

    /*
     * Viñetas.
     */
    if (isBulletLine(trimmed)) {
      renderBullet(trimmed);
      continue;
    }

    /*
     * Compatibilidad con formato económico antiguo.
     */
    if (isFinancialSummaryLine(trimmed)) {
      renderFinancialSummary(trimmed);

      continue;
    }

    /*
     * Cuerpo contractual.
     */
    renderParagraph(trimmed);
  }

  /*
   * Firmas al terminar todas las cláusulas.
   */
  renderSignatures();

  drawFooter(doc.internal.getCurrentPageInfo().pageNumber);

  return doc.output("blob");
}
