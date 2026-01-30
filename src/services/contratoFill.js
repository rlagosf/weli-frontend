// src/services/contratoFill.js

const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function fillContratoTemplate(template, data = {}) {
  let out = String(template || "");

  // Normaliza claves: soportar dirección con tilde
  const normalized = { ...data };
  if (normalized["dirección"] && !normalized["direccion"]) normalized["direccion"] = normalized["dirección"];
  if (normalized["direccion"] && !normalized["dirección"]) normalized["dirección"] = normalized["direccion"];

  for (const [k, v] of Object.entries(normalized)) {
    const key = escapeRegExp(k);

    // soporta:
    // <<key>>
    // << key >>
    // <<key >>
    // etc.
    const re = new RegExp(`<<\\s*${key}\\s*>>`, "g");

    out = out.replace(re, v == null ? "" : String(v));
  }

  return out;
}
