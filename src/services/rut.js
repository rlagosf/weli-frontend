// src/services/rut.js

/**
 * Calcula el dígito verificador de un RUT chileno
 * a partir del CUERPO numérico completo (sin DV).
 * Ej: 20394587 -> "6"
 */
export function calcularDV(rutNumber) {
  if (rutNumber === null || rutNumber === undefined) return '';

  // Dejar solo dígitos
  const clean = String(rutNumber).replace(/\D/g, '');
  if (!clean) return '';

  let rut = parseInt(clean, 10);
  if (!Number.isFinite(rut) || rut <= 0) return '';

  let suma = 0;
  let multiplicador = 2;

  while (rut > 0) {
    const digito = rut % 10;
    suma += digito * multiplicador;
    rut = Math.floor(rut / 10);
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }

  const resto = suma % 11;
  const dvCalc = 11 - resto;

  if (dvCalc === 11) return '0';
  if (dvCalc === 10) return 'K';
  return String(dvCalc);
}

/**
 * Formatea el RUT como CUERPO-DV sin puntos.
 * Ej: 20394587 -> "20394587-6"
 *
 * Solo es de presentación (frontend). El backend
 * sigue trabajando con el número limpio.
 */
export function formatRutWithDV(rutNumber) {
  if (rutNumber === null || rutNumber === undefined) return '';

  // Solo dígitos del cuerpo
  const cuerpo = String(rutNumber).replace(/\D/g, '');
  if (!cuerpo) return '';

  const dv = calcularDV(cuerpo);
  if (!dv) return cuerpo;   // fallback: devuelve solo el número

  return `${cuerpo}-${dv}`;
}
