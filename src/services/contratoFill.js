// src/services/contratoFill.js

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const asText = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const asNumber = (value) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
};

const formatMoney = (value) => {
  /*
   * Si ya viene formateado como moneda,
   * conservamos el valor.
   */
  if (typeof value === "string" && value.trim().startsWith("$")) {
    return value.trim();
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "$0";
  }

  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(number);
};

const buildEconomicText = (financiero = {}) => {
  const conceptos = asArray(financiero?.conceptos);

  const detalleTarifas = conceptos
    .map((item) => {
      const nombre = asText(item?.tipo_pago_nombre) || asText(item?.nombre) || "Concepto";

      const montoBase = formatMoney(item?.monto_base ?? 0);

      const plan = asText(item?.plan_nombre) || "Sin Beneficio";

      const montoFinal = formatMoney(item?.monto_final ?? item?.monto_total ?? item?.monto_base ?? 0);

      return `• ${nombre}: tarifa base ${montoBase} · beneficio ${plan} · total ${montoFinal}`;
    })
    .join("\n");

  const detalleBeneficios = conceptos
    .map((item) => {
      const nombre = asText(item?.tipo_pago_nombre) || asText(item?.nombre) || "Concepto";

      const plan = asText(item?.plan_nombre) || "Sin Beneficio";

      return `• ${nombre}: ${plan}`;
    })
    .join("\n");

  const detallePlan =
    asText(financiero?.detalle_plan) ||
    conceptos
      .map((item) => {
        const nombre = asText(item?.tipo_pago_nombre) || asText(item?.nombre) || "Concepto";

        const plan = asText(item?.plan_nombre) || "Sin Beneficio";

        const montoFinal = formatMoney(item?.monto_final ?? item?.monto_total ?? item?.monto_base ?? 0);

        return `• ${nombre}: ${plan} — ${montoFinal}`;
      })
      .join("\n");

  const calculatedBase = conceptos.reduce((total, item) => total + asNumber(item?.monto_base), 0);

  const calculatedFinal = conceptos.reduce(
    (total, item) => total + asNumber(item?.monto_final ?? item?.monto_total ?? item?.monto_base),
    0
  );

  const calculatedDiscount = conceptos.reduce((total, item) => {
    const explicit = Number(item?.monto_descuento);

    if (Number.isFinite(explicit)) {
      return total + explicit;
    }

    return (
      total +
      Math.max(0, asNumber(item?.monto_base) - asNumber(item?.monto_final ?? item?.monto_total ?? item?.monto_base))
    );
  }, 0);

  return {
    detalle_tarifas: detalleTarifas || "Sin conceptos tarifarios configurados.",

    detalle_beneficios: detalleBeneficios || "Sin beneficios aplicados.",

    detalle_plan: detallePlan || "Sin modalidad económica adicional.",

    total_base: formatMoney(financiero?.total_base ?? calculatedBase),

    total_descuento: formatMoney(financiero?.total_descuento ?? calculatedDiscount),

    total_final: formatMoney(financiero?.total_final ?? calculatedFinal),
  };
};

const normalizeContext = (data = {}) => {
  /*
   * =======================================================
   * COMPATIBILIDAD LEGACY
   * =======================================================
   *
   * Conservamos todas las propiedades planas que ya
   * pudiera traer data.
   */
  const normalized = {
    ...data,
  };

  /*
   * =======================================================
   * FLUJO ACTUAL
   * =======================================================
   */

  const academia = data?.academia && typeof data.academia === "object" ? data.academia : {};

  const jugador = data?.jugador && typeof data.jugador === "object" ? data.jugador : {};

  const apoderado = data?.apoderado && typeof data.apoderado === "object" ? data.apoderado : {};

  const financiero = data?.financiero && typeof data.financiero === "object" ? data.financiero : {};

  const economics = buildEconomicText(financiero);

  /*
   * Lugar y fecha del contrato.
   */
  normalized.ciudad_contrato = asText(normalized.ciudad_contrato) || asText(academia?.ciudad);

  normalized.fecha_contrato = asText(normalized.fecha_contrato) || asText(financiero?.fecha_contrato);

  /*
   * Academia.
   */
  normalized.nombre_academia = asText(normalized.nombre_academia) || asText(academia?.nombre);

  normalized.rut_academia = asText(normalized.rut_academia) || asText(academia?.rut);

  normalized.deporte = asText(normalized.deporte) || asText(academia?.deporte);

  normalized.direccion_academia = asText(normalized.direccion_academia) || asText(academia?.direccion);

  normalized.comuna_academia = asText(normalized.comuna_academia) || asText(academia?.comuna);

  normalized.ciudad_academia = asText(normalized.ciudad_academia) || asText(academia?.ciudad);

  normalized.region_academia = asText(normalized.region_academia) || asText(academia?.region);

  normalized.email_academia = asText(normalized.email_academia) || asText(academia?.email);

  /*
   * Apoderado.
   */
  normalized.nombre_apoderado = asText(normalized.nombre_apoderado) || asText(apoderado?.nombre);

  normalized.rut_apoderado = asText(normalized.rut_apoderado) || asText(apoderado?.rut);

  normalized.telefono_apoderado = asText(normalized.telefono_apoderado) || asText(apoderado?.telefono);

  /*
   * Jugador.
   */
  normalized.nombre_jugador = asText(normalized.nombre_jugador) || asText(jugador?.nombre);

  normalized.rut_jugador = asText(normalized.rut_jugador) || asText(jugador?.rut);

  normalized.fecha_nacimiento = asText(normalized.fecha_nacimiento) || asText(jugador?.fecha_nacimiento);

  normalized.edad = asText(normalized.edad) || asText(jugador?.edad);

  normalized.direccion_jugador = asText(normalized.direccion_jugador) || asText(jugador?.direccion);

  normalized.comuna_jugador = asText(normalized.comuna_jugador) || asText(jugador?.comuna);

  normalized.ciudad_jugador = asText(normalized.ciudad_jugador) || asText(jugador?.ciudad);

  normalized.region_jugador = asText(normalized.region_jugador) || asText(jugador?.region);

  normalized.telefono_jugador = asText(normalized.telefono_jugador) || asText(jugador?.telefono);

  normalized.email_jugador = asText(normalized.email_jugador) || asText(jugador?.email);

  normalized.categoria_jugador = asText(normalized.categoria_jugador) || asText(jugador?.categoria);

  /*
   * Sucursales.
   *
   * Actualmente jugador.sucursales ya viene como texto
   * con viñetas desde buildContratoContext().
   *
   * También soportamos un eventual array.
   */
  if (Array.isArray(jugador?.sucursales)) {
    normalized.detalle_sucursales =
      jugador.sucursales
        .map((item) => {
          if (typeof item === "string") {
            return `• ${item}`;
          }

          const nombre = asText(item?.nombre);

          return nombre ? `• ${nombre}` : "";
        })
        .filter(Boolean)
        .join("\n") || "Sin sucursal informada.";
  } else {
    normalized.detalle_sucursales =
      asText(normalized.detalle_sucursales) || asText(jugador?.sucursales) || "Sin sucursal informada.";
  }

  /*
   * Datos financieros.
   */
  normalized.detalle_tarifas = asText(normalized.detalle_tarifas) || economics.detalle_tarifas;

  normalized.detalle_beneficios = asText(normalized.detalle_beneficios) || economics.detalle_beneficios;

  normalized.detalle_plan = asText(normalized.detalle_plan) || economics.detalle_plan;

  normalized.total_base = asText(normalized.total_base) || economics.total_base;

  normalized.total_descuento = asText(normalized.total_descuento) || economics.total_descuento;

  normalized.total_final = asText(normalized.total_final) || economics.total_final;

  /*
   * Compatibilidad histórica:
   * direccion / dirección.
   */
  if (normalized["dirección"] && !normalized["direccion"]) {
    normalized["direccion"] = normalized["dirección"];
  }

  if (normalized["direccion"] && !normalized["dirección"]) {
    normalized["dirección"] = normalized["direccion"];
  }

  return normalized;
};

export function fillContratoTemplate(template, data = {}) {
  let out = String(template || "");

  const normalized = normalizeContext(data);

  /*
   * Reemplaza:
   *
   * <<key>>
   * << key >>
   * <<   key>>
   * <<key   >>
   */
  for (const [key, value] of Object.entries(normalized)) {
    /*
     * Los objetos de contexto originales no son
     * placeholders del contrato.
     */
    if (value && typeof value === "object") {
      continue;
    }

    const safeKey = escapeRegExp(key);

    const re = new RegExp(`<<\\s*${safeKey}\\s*>>`, "g");

    out = out.replace(re, value == null ? "" : String(value));
  }

  /*
   * =======================================================
   * VALIDACIÓN FINAL
   * =======================================================
   *
   * Si existe una variable contractual no reconocida,
   * NO la transformamos silenciosamente en <>.
   *
   * Lanzamos un error para detectar inmediatamente
   * una incompatibilidad futura entre template y contexto.
   *
   * Los marcadores [[...]] quedan intactos porque
   * contratoPdf.js los utiliza para renderizaciones
   * especiales, como la tabla económica.
   */
  const unresolved = out.match(/<<\s*[^>]+\s*>>/g);

  if (unresolved?.length) {
    const unique = [...new Set(unresolved)];

    throw new Error(`El contrato contiene variables sin resolver: ${unique.join(", ")}`);
  }

  return out;
}
