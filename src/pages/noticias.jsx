// src/pages/noticias.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { apiPublic as api } from "../services/api";
import { X } from "lucide-react";
import { linkifyText } from "../components/linkify";

const BASE_NOTICIAS = "/noticias";

/* -------------------- Animations -------------------- */
const SECTION_VARIANTS = {
  hidden: { opacity: 0, y: 50, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.8, ease: "easeOut" },
  },
};

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 18 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: "easeOut", delay: i * 0.06 },
  }),
};

/* -------------------- Helpers -------------------- */
const isCanceled = (e) =>
  e?.name === "CanceledError" ||
  e?.code === "ERR_CANCELED" ||
  String(e?.message || "").toLowerCase().includes("canceled");

const fromAnyToHuman = (value) => {
  if (!value) return "";
  const s = String(value).trim();
  if (!s) return "";
  const isoLike = s.includes(" ") ? s.replace(" ", "T") : s;
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-CL", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function FloatingTooltipCard({ item, imgSrc, onOpen, dark = true, index = 0 }) {
  const surface = dark
    ? "bg-white/[0.06] border-white/15 hover:border-white/25"
    : "bg-white border-gray-200";

  return (
    <motion.div
      custom={index}
      variants={CARD_VARIANTS}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      className={`relative rounded-2xl overflow-hidden border ${surface} shadow-sm transition hover:-translate-y-1`}
    >
      <button type="button" onClick={onOpen} className="w-full text-left">
        {/* Imagen */}
        <div className="h-48 w-full bg-black/25 relative">
          {imgSrc ? (
            <>
              <img
                className="w-full h-full object-cover object-top"
                src={imgSrc}
                alt={item?.titulo || "noticia"}
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/10 to-transparent" />
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-white/75">
              Sin imagen
            </div>
          )}
        </div>

        {/* Texto */}
        <div className="p-5">
          <h5 className="mb-2 text-xl sm:text-2xl font-extrabold tracking-tight text-white leading-tight line-clamp-2">
            {item?.titulo || "—"}
          </h5>

          <p className="mb-4 text-sm text-gray-200 font-medium leading-relaxed line-clamp-3">
            {item?.resumen || item?.slug || ""}
          </p>

          <div className="inline-flex items-center px-3 py-2 text-sm font-extrabold text-center text-white bg-[#e82d89] rounded-lg hover:bg-pink-700 focus:outline-none shadow-[0_0_18px_#e82d8980]">
            Leer más →
          </div>

          <div className="mt-3 text-[11px] text-white/70 font-semibold tracking-wide">
            {item?.published_at ? `Publicado: ${fromAnyToHuman(item.published_at)}` : ""}
          </div>
        </div>
      </button>
    </motion.div>
  );
}

function ModalNoticia({ open, onClose, item, imgSrc, dark = true, loadingDetail = false }) {
  if (!open) return null;

  const shell = dark
    ? "bg-[#0b1220] text-white border-white/10"
    : "bg-white text-black border-black/10";

  const isPopup = Number(item?.is_popup ?? 0) === 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="relative w-full max-w-3xl"
      >
        <div className="rounded-2xl p-[1px] bg-gradient-to-r from-[#e82d89] via-fuchsia-500 to-[#e82d89] shadow-[0_0_22px_#e82d8966]">
          <div className={`relative rounded-2xl overflow-hidden border ${shell}`}>
            <div className="p-4 sm:p-5 flex items-center justify-between">
              <div className="font-extrabold text-base sm:text-lg tracking-tight">
                {item?.titulo || "Noticia"}
                {loadingDetail && (
                  <span className="ml-2 text-xs font-semibold text-white/60">· cargando…</span>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl font-semibold border border-white/10 hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-4 sm:px-6 pb-5">
              <div className="rounded-xl overflow-hidden border border-white/10 bg-white/[0.06]">
                {imgSrc ? (
                  <img
                    src={imgSrc}
                    alt="imagen noticia"
                    className={`w-full h-64 ${isPopup ? "object-contain" : "object-cover"} bg-black`}
                    loading={isPopup ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={isPopup ? "high" : "auto"}
                  />
                ) : (
                  <div className="h-64 flex items-center justify-center text-xs font-semibold text-white/75">
                    Sin imagen
                  </div>
                )}
              </div>

              <div className="mt-4 text-sm font-semibold text-white/80">
                {item?.published_at ? `Publicado: ${fromAnyToHuman(item.published_at)}` : ""}
              </div>

              {item?.resumen ? (
                <div className="mt-3 text-gray-100 font-semibold leading-relaxed">
                  {item.resumen}
                </div>
              ) : null}

              <div className="mt-4 text-gray-200 leading-relaxed">
                {item?.contenido ? linkifyText(item.contenido) : "— Sin contenido —"}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function Noticias() {
  const dark = true;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [thumbs, setThumbs] = useState({}); // id -> dataURL | null

  const thumbsRef = useRef({});
  const detailsRef = useRef({}); // id -> item completo (incluye contenido)

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const hasItems = items.length > 0;

  const setThumbCached = useCallback((id, value) => {
    thumbsRef.current[id] = value;
    setThumbs((prev) => (prev[id] === value ? prev : { ...prev, [id]: value }));
  }, []);

  const fetchThumb = useCallback(
    async (id, signal) => {
      if (!id) return null;

      if (Object.prototype.hasOwnProperty.call(thumbsRef.current, id)) {
        return thumbsRef.current[id];
      }

      try {
        const { data } = await api.get(`${BASE_NOTICIAS}/${id}`, signal ? { signal } : {});
        const it = data?.item ?? data ?? null;

        if (it?.imagen_base64 && it?.imagen_mime) {
          const dataUrl = `data:${it.imagen_mime};base64,${it.imagen_base64}`;
          setThumbCached(id, dataUrl);
          return dataUrl;
        }

        setThumbCached(id, null);
        return null;
      } catch (e) {
        if (!isCanceled(e)) setThumbCached(id, null);
        return null;
      }
    },
    [setThumbCached]
  );

  const fetchDetail = useCallback(async (id, signal) => {
    if (!id) return null;

    if (detailsRef.current[id]) return detailsRef.current[id];

    const { data } = await api.get(`${BASE_NOTICIAS}/${id}`, signal ? { signal } : {});
    // Asumimos { item: {...} } (como tu admin). Fallback defensivo:
    const it = data?.item ?? data ?? null;

    if (it) detailsRef.current[id] = it;
    return it;
  }, []);

  const openWithDetail = useCallback(
    async (it) => {
      if (!it?.id) return;

      // abrir rápido con lo que tenemos
      setActive(it);
      setOpen(true);
      setLoadingDetail(true);

      const ac = new AbortController();
      try {
        const full = await fetchDetail(it.id, ac.signal);
        if (full) setActive(full);
      } catch (e) {
        // si falla, queda con lo básico (resumen/título igual se ve)
      } finally {
        setLoadingDetail(false);
      }
    },
    [fetchDetail]
  );

  useEffect(() => {
    const ac = new AbortController();

    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(BASE_NOTICIAS, { signal: ac.signal });

        const popupFromApi = data?.popup ?? null;
        const cardsFromApi = Array.isArray(data?.cards) ? data.cards : [];

        const popupFallback =
          popupFromApi || cardsFromApi.find((x) => Number(x?.is_popup ?? 0) === 1) || null;

        const gridOnly = cardsFromApi.filter((x) => Number(x?.is_popup ?? 0) !== 1);

        const map = new Map();
        for (const it of gridOnly) {
          const id = Number(it?.id);
          if (!Number.isFinite(id) || id <= 0) continue;
          if (!map.has(id)) map.set(id, { ...it, id });
        }
        const mergedGrid = Array.from(map.values());

        setItems(mergedGrid);

        // precargar thumbs: popup + grid
        const idsToPreload = [popupFallback?.id, ...mergedGrid.map((x) => x?.id)].filter(Boolean);
        await Promise.allSettled(idsToPreload.map((nid) => fetchThumb(nid, ac.signal)));

        // abrir popup siempre (pero completando detalle para traer contenido)
        if (popupFallback?.id) {
          setActive(popupFallback);
          setOpen(true);
          setLoadingDetail(true);

          try {
            const fullPopup = await fetchDetail(popupFallback.id, ac.signal);
            if (fullPopup) setActive(fullPopup);
          } catch {
            // noop
          } finally {
            setLoadingDetail(false);
          }
        }
      } catch (e) {
        if (isCanceled(e)) return;
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [fetchThumb, fetchDetail]);

  const gridItems = useMemo(() => items, [items]);

  if (!hasItems && !loading) return null;
  if (loading && !hasItems) return null;

  return (
    <>
      <motion.section
        id="noticias"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: false, amount: 0.2 }}
        variants={SECTION_VARIANTS}
        className="w-full"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <div className="flex items-end justify-between gap-3 mb-8">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2">
                <span className="text-xs tracking-[0.35em] font-extrabold text-white/70 uppercase">
                  Novedades
                </span>
                <span className="h-[2px] w-12 bg-[#e82d89] shadow-[0_0_16px_#e82d89aa]" />
              </div>

              <h2 className="mt-2 text-4xl sm:text-5xl font-extrabold text-white leading-tight">
                Noticias{" "}
                <span className="text-[#e82d89] italic drop-shadow-[0_0_18px_#e82d8980]">
                  que rugen
                </span>
              </h2>

              <p className="mt-3 text-gray-200 font-medium text-sm sm:text-base leading-relaxed">
                Lo último del club, eventos y comunicados. Aquí no se publica relleno: solo{" "}
                <span className="font-extrabold text-white drop-shadow-[0_0_12px_#ffffff30]">
                  información que mueve la cancha
                </span>
                .
              </p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {gridItems.map((it, idx) => (
              <FloatingTooltipCard
                key={it.id}
                index={idx}
                item={it}
                imgSrc={thumbs[it.id] ?? null}
                dark={dark}
                onOpen={() => openWithDetail(it)}
              />
            ))}
          </div>
        </div>
      </motion.section>

      <ModalNoticia
        open={open}
        onClose={() => setOpen(false)}
        item={active}
        imgSrc={active?.id ? thumbs[active.id] ?? null : null}
        dark={dark}
        loadingDetail={loadingDetail}
      />
    </>
  );
}
