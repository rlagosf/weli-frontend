// src/pages/admin/modulo-noticias/registroNoticias.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { useTheme } from "../../context/ThemeContext";
import api, { getToken, clearToken } from "../../services/api";
import IsLoading from "../../components/isLoading";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";
import { Newspaper, Plus, Save, Trash2, X, Image as ImageIcon, RefreshCcw } from "lucide-react";

const BASE_NOTICIAS = "/admin-noticias";
const BASE_ESTADOS = "/estado-noticias";

/* ---------------------------
   Helpers
---------------------------- */

const toArray = (resp) => {
  const d = resp?.data ?? resp ?? [];
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.results)) return d.results;
  if (d?.ok && Array.isArray(d.items)) return d.items;
  if (d?.ok && Array.isArray(d.data)) return d.data;
  return [];
};

const isCanceled = (e) =>
  e?.name === "CanceledError" ||
  e?.code === "ERR_CANCELED" ||
  String(e?.message || "").toLowerCase().includes("canceled");

/**
 * Normaliza status/mensaje por compatibilidad:
 * - axios clásico: e.response.status / e.response.data
 * - api.js normalizado: e.status / e.data / e.message
 */
const getStatus = (e) => e?.status ?? e?.response?.status;
const getMessage = (e, fallback = "Error") =>
  e?.message || e?.data?.message || e?.response?.data?.message || fallback;

const getList = async (basePath, signal, config = {}) => {
  const urls = basePath.endsWith("/") ? [basePath, basePath.slice(0, -1)] : [basePath, `${basePath}/`];

  let lastErr = null;

  for (const url of urls) {
    try {
      const r = await api.get(url, { ...(signal ? { signal } : {}), ...(config || {}) });
      return toArray(r);
    } catch (e) {
      if (isCanceled(e)) {
        console.warn("[getList] canceled", url);
        return [];
      }
      lastErr = e;

      const st = getStatus(e);
      console.warn("[getList] fail", url, st, e?.data ?? e?.response?.data ?? e?.message);

      if (st === 401 || st === 403) throw e;
    }
  }

  if (lastErr) throw lastErr;
  return [];
};

const slugify = (input) =>
  String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 160);

const fromAnyToDatetimeLocal = (value) => {
  if (!value) return "";
  const s = String(value).trim();
  if (!s) return "";

  const isoLike = s.includes(" ") ? s.replace(" ", "T") : s;
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return "";

  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

const toMysqlDatetimeLocal = (value) => {
  if (!value) return null;
  const s = String(value);
  return s.includes("T") ? `${s.replace("T", " ")}:00` : s;
};

const isValidMime = (m) => ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(String(m || "").toLowerCase());

const fileToDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });

const dataURLToImage = (dataURL) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataURL;
  });

const approxBytesFromBase64 = (b64) => {
  const s = String(b64 || "").replace(/\s+/g, "");
  const padding = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
  return Math.floor((s.length * 3) / 4) - padding;
};

async function compressToBase64Jpeg(dataUrl, maxW = 1280, quality = 0.78) {
  const img = await dataURLToImage(dataUrl);
  const ratio = img.width / img.height || 1;

  const outW = Math.min(maxW, img.width);
  const outH = Math.round(outW / ratio);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, outW, outH);

  const outDataUrl = canvas.toDataURL("image/jpeg", quality);
  const base64 = outDataUrl.split("base64,")[1] || "";

  return { preview: outDataUrl, base64, mime: "image/jpeg", bytes: approxBytesFromBase64(base64) };
}

const emptyForm = {
  id: null,
  slotType: "card",
  slotIndex: null,

  slug: "",
  titulo: "",
  resumen: "",
  contenido: "",

  estado_noticia_id: null,

  is_popup: false,
  popup_start_at: "",
  popup_end_at: "",
  readOnly: false,

  pinned: false,
  pinned_order: 0,

  imagen_preview: null,
  imagen_mime: null,
  imagen_base64: null,
  imagen_bytes: null,
};

export default function RegistroNoticias() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  useMobileAutoScrollTop();

  const [isLoading, setIsLoading] = useState(true);

  const [boardPopup, setBoardPopup] = useState(null);
  const [boardCardsBySlot, setBoardCardsBySlot] = useState(Array(6).fill(null));
  const [boardArchived, setBoardArchived] = useState([]);

  const [estados, setEstados] = useState([]);
  const [thumbs, setThumbs] = useState({});

  const thumbsRef = useRef({});
  useEffect(() => {
    thumbsRef.current = thumbs;
  }, [thumbs]);

  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const bootstrappedRef = useRef(false);
  const loadBoardInFlightRef = useRef(false);

  // ✅ imagen flags
  const imageDirtyRef = useRef(false);
  const imageRemoveRef = useRef(false);

  // ✅ objectURL para preview
  const objectUrlRef = useRef(null);

  // ✅ cleanup global
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  // ✅ guard auth (roles 1 y 2)
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);
      if (decoded?.exp && decoded.exp < now) throw new Error("expired");

      const rol = Number(decoded?.rol_id ?? decoded?.role_id ?? decoded?.role);
      if (![1, 2].includes(rol)) throw new Error("no-role");
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const estadoNombre = useMemo(() => {
    const m = new Map(estados.map((e) => [Number(e.id), e.nombre]));
    return (id) => m.get(Number(id)) ?? "—";
  }, [estados]);

  const findEstadoIdByName = useMemo(() => {
    const norm = (s) => String(s || "").trim().toLowerCase();
    const byName = new Map(estados.map((e) => [norm(e.nombre), Number(e.id)]));
    return (name) => byName.get(norm(name)) ?? null;
  }, [estados]);

  const archivadaId = useMemo(() => {
    return Number(findEstadoIdByName("archivada") ?? findEstadoIdByName("archivado") ?? 3);
  }, [findEstadoIdByName]);

  const isArchivedItem = useCallback((it) => Number(it?.estado_noticia_id) === Number(archivadaId), [archivadaId]);

  const getDefaultEstadoForSlot = useCallback(
    (slotType) => {
      const fallback = estados?.length ? Number(estados[0].id) : null;
      if (slotType === "popup") {
        return findEstadoIdByName("publicada") ?? findEstadoIdByName("publicado") ?? fallback;
      }
      return findEstadoIdByName("borrador") ?? fallback;
    },
    [estados, findEstadoIdByName]
  );

  // ✅ thumbs: permite overwrite y limpieza cuando no hay imagen
  const ensureThumb = useCallback(async (id, opts = {}) => {
    const force = !!opts.force;
    if (!id) return null;

    if (!force && thumbsRef.current[id]) return thumbsRef.current[id];

    try {
      const { data } = await api.get(`${BASE_NOTICIAS}/${id}`);
      const it = data?.item;

      if (it?.imagen_base64 && it?.imagen_mime) {
        const dataUrl = `data:${it.imagen_mime};base64,${it.imagen_base64}`;
        setThumbs((p) => ({ ...p, [id]: dataUrl }));
        return dataUrl;
      }

      if (force) {
        setThumbs((p) => {
          const copy = { ...p };
          delete copy[id];
          return copy;
        });
      }
    } catch (e) {
      // ✅ no romper flujo; si es 401/403 ya lo manejará el caller principal
    }

    return null;
  }, []);

  const loadEstados = useCallback(async (signal) => {
    const arr = await getList(BASE_ESTADOS, signal);
    if (arr?.length) setEstados(arr);
  }, []);

  const loadBoard = useCallback(
    async (signal) => {
      if (loadBoardInFlightRef.current) return;
      loadBoardInFlightRef.current = true;

      try {
        const list = await getList(BASE_NOTICIAS, signal, {
          params: { include_archived: 1, limit: 200, offset: 0 },
        });

        const archived = list.filter((x) => isArchivedItem(x));
        const active = list.filter((x) => !isArchivedItem(x));

        const popup = active.find((x) => Number(x?.is_popup ?? 0) === 1) || null;

        const slots = Array(6).fill(null);

        for (const it of active) {
          if (Number(it?.is_popup ?? 0) === 1) continue;
          if (Number(it?.pinned ?? 0) !== 1) continue;

          const idx = Number(it?.pinned_order);
          if (Number.isInteger(idx) && idx >= 0 && idx < 6 && !slots[idx]) slots[idx] = it;
        }

        for (const it of active) {
          if (Number(it?.is_popup ?? 0) === 1) continue;
          if (slots.some((s) => s?.id === it?.id)) continue;

          const emptyIdx = slots.findIndex((s) => !s);
          if (emptyIdx === -1) break;
          slots[emptyIdx] = it;
        }

        setBoardPopup(popup);
        setBoardCardsBySlot(slots);
        setBoardArchived(archived);

        const ids = [popup?.id, ...slots.map((x) => x?.id), ...archived.slice(0, 12).map((x) => x?.id)].filter(Boolean);
        await Promise.allSettled(ids.map((nid) => ensureThumb(nid)));
      } finally {
        loadBoardInFlightRef.current = false;
      }
    },
    [ensureThumb, isArchivedItem]
  );

  useEffect(() => {
    const abort = new AbortController();
    let alive = true;

    (async () => {
      if (!bootstrappedRef.current) setIsLoading(true);

      setError("");
      setOk("");

      try {
        await loadEstados(abort.signal);
        await loadBoard(abort.signal);
        if (alive) bootstrappedRef.current = true;
      } catch (e) {
        if (isCanceled(e)) return;

        const st = getStatus(e);
        if (st === 401 || st === 403) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }

        if (alive) setError(getMessage(e, "❌ Error al cargar noticias"));
      } finally {
        if (alive) setIsLoading(false);
      }
    })();

    return () => {
      alive = false;
      abort.abort();
    };
  }, [loadBoard, loadEstados, navigate]);

  const popupSlot = useMemo(() => ({ type: "popup", item: boardPopup }), [boardPopup]);

  const miniSlots = useMemo(() => {
    const slots = [];
    for (let i = 0; i < 6; i++) slots.push({ type: "card", idx: i, item: boardCardsBySlot[i] || null });
    return slots;
  }, [boardCardsBySlot]);

  const openSlot = async (slot) => {
    setError("");
    setOk("");

    const archivedFromList = !!(slot?.item && isArchivedItem(slot.item));
    if (archivedFromList) setOk("👀 Abriendo en modo lectura (Archivada).");

    // al abrir modal, limpiamos objectURL previo (para no mezclar)
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (slot?.item?.id) {
      setOpening(true);
      try {
        const { data } = await api.get(`${BASE_NOTICIAS}/${slot.item.id}`);
        const it = data?.item ?? slot.item;

        const archived = isArchivedItem(it);

        imageDirtyRef.current = false;
        imageRemoveRef.current = false;

        if (it?.id && it?.imagen_base64 && it?.imagen_mime) {
          const dataUrl = `data:${it.imagen_mime};base64,${it.imagen_base64}`;
          setThumbs((p) => ({ ...p, [it.id]: dataUrl }));
        }

        setForm({
          ...emptyForm,
          readOnly: archived,

          id: it?.id ?? slot.item.id,
          slotType: slot.type,
          slotIndex: slot.type === "card" ? slot.idx : null,

          slug: it?.slug ?? "",
          titulo: it?.titulo ?? "",
          resumen: it?.resumen ?? "",
          contenido: it?.contenido ?? "",

          estado_noticia_id: it?.estado_noticia_id != null ? Number(it.estado_noticia_id) : null,

          is_popup: Number(it?.is_popup ?? 0) === 1,
          popup_start_at: fromAnyToDatetimeLocal(it?.popup_start_at),
          popup_end_at: fromAnyToDatetimeLocal(it?.popup_end_at),

          pinned: Number(it?.pinned ?? 0) === 1,
          pinned_order: Number(it?.pinned_order ?? 0),

          imagen_preview:
            it?.imagen_base64 && it?.imagen_mime
              ? `data:${it.imagen_mime};base64,${it.imagen_base64}`
              : thumbsRef.current[it?.id] ?? null,

          imagen_mime: it?.imagen_mime ?? null,
          imagen_base64: null,
          imagen_bytes: it?.imagen_bytes ?? null,
        });

        setOpen(true);
      } catch (e) {
        if (!isCanceled(e)) {
          const st = getStatus(e);
          if (st === 401 || st === 403) {
            clearToken();
            navigate("/login", { replace: true });
            return;
          }
          setError(getMessage(e, "No se pudo abrir la noticia"));
        }
      } finally {
        setOpening(false);
      }
      return;
    }

    // crear (nunca es readOnly)
    imageDirtyRef.current = false;
    imageRemoveRef.current = false;

    const isPopup = slot.type === "popup";
    const defaultEstado = getDefaultEstadoForSlot(slot.type);

    setForm({
      ...emptyForm,
      readOnly: false,

      slotType: slot.type,
      slotIndex: slot.type === "card" ? slot.idx : null,

      is_popup: isPopup,
      estado_noticia_id: defaultEstado,

      pinned: slot.type === "card",
      pinned_order: slot.type === "card" ? slot.idx : 0,

      popup_start_at: "",
      popup_end_at: "",
    });

    setOpen(true);
  };

  const closeModal = () => {
    if (saving || archiving || opening) return;

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    setOpen(false);
  };

  const validate = () => {
    if (!String(form.titulo || "").trim()) return "El título es obligatorio.";
    if (!String(form.slug || "").trim()) return "La palabra clave es obligatoria.";

    if (String(form.slug).length > 160) return "La palabra clave excede 160 caracteres.";
    if (String(form.titulo).length > 180) return "El título excede 180 caracteres.";
    if (String(form.resumen || "").length > 280) return "El resumen excede 280 caracteres.";

    if (!form.estado_noticia_id) return "Selecciona un estado válido desde el catálogo.";
    if (form.is_popup && !form.popup_start_at) return "Si es POPUP, define fecha de inicio.";
    return "";
  };

  const handleAutoSlug = () => setForm((p) => ({ ...p, slug: slugify(p.titulo) }));

  const handlePickImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";

    setError("");
    setOk("");

    if (!file) return;

    if (!isValidMime(file.type)) {
      setError("Formato no permitido. Usa JPG/PNG/WEBP.");
      return;
    }

    // ✅ preview por objectURL
    try {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const objUrl = URL.createObjectURL(file);
      objectUrlRef.current = objUrl;

      setForm((p) => ({
        ...p,
        imagen_preview: objUrl,
      }));
    } catch (err) {
      console.warn("[pick] objectURL failed:", err);
    }

    // ✅ base64 optimizada para enviar
    try {
      const raw = await fileToDataURL(file);
      const { base64, mime, bytes } = await compressToBase64Jpeg(raw, 1280, 0.78);

      const MAX_KB = 600;
      if (bytes > MAX_KB * 1024) {
        setError(`La imagen quedó pesada (${Math.round(bytes / 1024)}KB). Usa una más liviana o recorta.`);
        return;
      }

      setForm((p) => ({
        ...p,
        imagen_base64: base64,
        imagen_mime: mime,
        imagen_bytes: bytes,
      }));

      imageDirtyRef.current = true;
      imageRemoveRef.current = false;

      setOk("✅ Imagen lista (optimizada).");
    } catch (err) {
      console.error("[pick] compress failed:", err);
      setError("No se pudo procesar la imagen.");
    }
  };

  const handleRemoveImage = () => {
    setError("");
    setOk("");

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    setForm((p) => ({
      ...p,
      imagen_preview: null,
      imagen_base64: null,
      imagen_mime: null,
      imagen_bytes: null,
    }));

    imageDirtyRef.current = true;
    imageRemoveRef.current = true;

    setOk("🗑️ Imagen eliminada. Guarda para aplicar el cambio.");
  };

  const handleRefresh = async () => {
    const ac = new AbortController();
    setError("");
    setOk("");
    try {
      await loadBoard(ac.signal);
      setOk("✅ Refrescado.");
    } catch (e) {
      if (isCanceled(e)) return;

      const st = getStatus(e);
      if (st === 401 || st === 403) {
        clearToken();
        navigate("/login", { replace: true });
        return;
      }

      setError(getMessage(e, "No se pudo refrescar"));
    }
  };

  const handleArchive = async () => {
    if (!form.id || archiving) return;

    setError("");
    setOk("");
    setArchiving(true);

    try {
      await api.delete(`${BASE_NOTICIAS}/${form.id}`);
      setOk("✅ Noticia archivada (no editable).");

      imageDirtyRef.current = false;
      imageRemoveRef.current = false;

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }

      setThumbs((p) => {
        const copy = { ...p };
        delete copy[form.id];
        return copy;
      });

      await handleRefresh();
      setOpen(false);
    } catch (e) {
      if (!isCanceled(e)) {
        const st = getStatus(e);
        if (st === 401 || st === 403) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }
        setError(getMessage(e, "No se pudo archivar"));
      }
    } finally {
      setArchiving(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    if (form.readOnly) return;

    setError("");
    setOk("");

    const v = validate();
    if (v) return setError(v);

    setSaving(true);
    try {
      const isCardSlot = form.slotType === "card" && Number.isInteger(form.slotIndex);

      const payload = {
        slug: String(form.slug).trim(),
        titulo: String(form.titulo).trim(),
        resumen: form.resumen ? String(form.resumen).trim() : null,
        contenido: form.contenido ? String(form.contenido) : null,

        estado_noticia_id: Number(form.estado_noticia_id),

        is_popup: !!form.is_popup,
        popup_start_at: form.is_popup ? toMysqlDatetimeLocal(form.popup_start_at) : null,
        popup_end_at: form.is_popup ? toMysqlDatetimeLocal(form.popup_end_at) : null,

        pinned: isCardSlot ? true : !!form.pinned,
        pinned_order: isCardSlot ? Number(form.slotIndex) : form.pinned ? Number(form.pinned_order || 0) : null,
      };

      const touchedImage = imageDirtyRef.current;

      if (touchedImage) {
        if (imageRemoveRef.current) {
          payload.imagen_mime = null;
          payload.imagen_base64 = null;
          payload.imagen_bytes = null;
        } else {
          payload.imagen_mime = form.imagen_mime ?? null;
          payload.imagen_base64 = form.imagen_base64 ?? null;
          payload.imagen_bytes = form.imagen_bytes ?? null;
        }
      }

      let idToRefresh = form.id;

      if (!form.id) {
        const { data } = await api.post(BASE_NOTICIAS, payload);
        idToRefresh = data?.id ?? null;

        setOk("✅ Noticia creada.");

        if (idToRefresh && touchedImage) await ensureThumb(idToRefresh, { force: true });

        imageDirtyRef.current = false;
        imageRemoveRef.current = false;

        await handleRefresh();

        if (idToRefresh) {
          setOpen(false);
          await openSlot({ type: form.slotType, idx: form.slotIndex, item: { id: idToRefresh } });
          return;
        }

        setOpen(false);
      } else {
        await api.patch(`${BASE_NOTICIAS}/${form.id}`, payload);

        if (touchedImage) await ensureThumb(form.id, { force: true });

        imageDirtyRef.current = false;
        imageRemoveRef.current = false;

        setOk("✅ Cambios guardados.");
        await handleRefresh();
        setOpen(false);
      }
    } catch (e) {
      if (!isCanceled(e)) {
        const st = getStatus(e);
        if (st === 401 || st === 403) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }
        setError(String(getMessage(e, "Error guardando noticia")));
      }
    } finally {
      setSaving(false);
    }
  };

  const fondo = darkMode ? "bg-[#111827] text-white" : "bg-white text-[#1d0b0b]";
  const surface = darkMode ? "bg-[#1f2937] border border-[#2b3341]" : "bg-white border border-[#eee]";
  const cardBase = darkMode
    ? "bg-[#1f2937] border border-[#2b3341] hover:border-[#e82d89]"
    : "bg-white border border-[#eee] hover:border-[#e82d89]";
  const inputBase = darkMode ? "bg-[#374151] text-white border border-gray-600" : "bg-gray-50 text-black border border-gray-300";

  const badgeEstadoClass = (id) => {
    const name = String(estadoNombre(id)).toLowerCase();
    if (name.includes("public")) return "bg-green-600 text-white border-green-700 shadow-md";
    if (name.includes("archiv")) return "bg-red-600 text-white border-red-700 shadow-sm";
    if (name.includes("borr")) return "bg-yellow-500/15 text-yellow-200 border-yellow-500/25";
    return darkMode ? "bg-white/10 text-white/80 border-white/20" : "bg-black/5 text-black/70 border-black/10";
  };

  if (isLoading) return <IsLoading />;

  const renderThumb = (it, className = "w-full h-full object-cover") => {
    if (!it?.id) return null;

    if (thumbs[it.id]) return <img src={thumbs[it.id]} alt="thumb" className={className} />;

    if (it?.imagen_base64 && it?.imagen_mime) {
      const dataUrl = `data:${it.imagen_mime};base64,${it.imagen_base64}`;
      return <img src={dataUrl} alt="thumb" className={className} />;
    }

    if (it?.imagen_bytes)
      return <div className="w-full h-full flex items-center justify-center text-xs opacity-70 font-semibold">Cargando miniatura…</div>;

    return <div className="w-full h-full flex items-center justify-center text-xs opacity-70 font-semibold">Sin imagen</div>;
  };

  const isCardCreating = form.slotType === "card" && Number.isInteger(form.slotIndex);
  const isReadOnly = !!form.readOnly;

  return (
    <div className={`${fondo} min-h-screen font-realacademy px-4 sm:px-6 pt-6 pb-20`}>
      <div className="max-w-6xl mx-auto">
        <div className={`${surface} rounded-2xl p-5 shadow`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Newspaper className="opacity-90" />
              <h2 className="text-2xl font-bold">Registro Noticias</h2>
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15 font-semibold"
              title="Refrescar tablero"
            >
              <RefreshCcw size={16} />
              Refrescar
            </button>
          </div>

          {error && <div className="mt-3 text-red-400 font-semibold">{error}</div>}
          {ok && <div className="mt-3 text-green-400 font-semibold">{ok}</div>}
        </div>

        <div className="mt-6">
          <div className="text-xs tracking-widest font-bold opacity-70 mb-2 ml-2">ANUNCIO POPUP</div>

          <button
            type="button"
            onClick={() => openSlot(popupSlot)}
            className={`${cardBase} w-full rounded-2xl p-5 shadow transition hover:-translate-y-0.5`}
          >
            {popupSlot.item ? (
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="w-full sm:w-56 h-32 rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
                  {renderThumb(popupSlot.item)}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full border text-xs font-bold ${badgeEstadoClass(
                        popupSlot.item.estado_noticia_id
                      )}`}
                    >
                      {isArchivedItem(popupSlot.item) ? "ARCHIVADA" : estadoNombre(popupSlot.item.estado_noticia_id)}
                    </span>
                    <span className="text-xs opacity-70 font-semibold">#{popupSlot.item.id}</span>
                  </div>

                  <div className="mt-2 text-xl font-extrabold">{popupSlot.item.titulo}</div>
                  <div className="mt-1 text-sm opacity-75 font-semibold">{popupSlot.item.resumen || popupSlot.item.slug}</div>

                  <div className="mt-3 text-sm font-semibold opacity-80">
                    Click para abrir {isArchivedItem(popupSlot.item) ? "(solo lectura)" : "y editar"}.
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center gap-2">
                <div>
                  <div className="text-lg font-extrabold">Crear anuncio principal</div>
                  <div className="text-sm opacity-75 font-semibold">Este anuncio será publicado en primera plana al acceder al sitio</div>
                </div>

                <div className="mt-2 w-14 h-14 rounded-2xl bg-[#e82d89] text-white flex items-center justify-center shadow">
                  <Plus size={26} />
                </div>
              </div>
            )}
          </button>
        </div>

        <div className="mt-8">
          <div className="text-xs tracking-widest font-bold opacity-70 mb-2 ml-2">NOTICIAS (6 TARJETAS FIJAS)</div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {miniSlots.map((slot) => {
              const it = slot.item;

              return (
                <button
                  key={`slot-${slot.idx}`}
                  type="button"
                  onClick={() => openSlot(slot)}
                  className={`${cardBase} rounded-2xl p-5 shadow transition hover:-translate-y-0.5 text-left`}
                >
                  {it ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full border text-xs font-bold ${badgeEstadoClass(it.estado_noticia_id)}`}>
                          {isArchivedItem(it) ? "ARCHIVADA" : estadoNombre(it.estado_noticia_id)}
                        </span>
                        <span className="text-xs opacity-70 font-semibold">#{it.id}</span>
                      </div>

                      <div className="mt-3 rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 h-28">
                        {renderThumb(it)}
                      </div>

                      <div className="mt-3 text-lg font-extrabold line-clamp-2">{it.titulo}</div>
                      <div className="mt-1 text-sm opacity-75 font-semibold line-clamp-2">{it.resumen || it.slug}</div>

                      <div className="mt-3 text-xs opacity-70 font-semibold">Slot #{slot.idx}</div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center gap-2">
                      <div className="text-lg font-extrabold">Crear noticia</div>

                      <div className="w-12 h-12 rounded-2xl bg-[#e82d89] text-white flex items-center justify-center shadow">
                        <Plus size={22} />
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-10">
          <div className="text-xs tracking-widest font-bold opacity-70 mb-2 ml-2">NOTICIAS ANTERIORES</div>

          {boardArchived.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {boardArchived.slice(0, 30).map((it) => (
                <button
                  type="button"
                  key={`arch-${it.id}`}
                  onClick={() => openSlot({ type: "archived", item: it })}
                  className={`${cardBase} rounded-2xl p-5 shadow text-left opacity-90 transition hover:-translate-y-0.5`}
                  title="Archivada: solo lectura"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full border text-xs font-bold ${badgeEstadoClass(it.estado_noticia_id)}`}>
                      ARCHIVADA
                    </span>
                    <span className="text-xs opacity-70 font-semibold">#{it.id}</span>
                  </div>

                  <div className="mt-3 rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 h-28">
                    {renderThumb(it)}
                  </div>

                  <div className="mt-3 text-lg font-extrabold line-clamp-2">{it.titulo}</div>
                  <div className="mt-1 text-sm opacity-75 font-semibold line-clamp-2">{it.resumen || it.slug}</div>

                  <div className="mt-3 text-xs opacity-70 font-semibold">Archivada (solo lectura)</div>
                </button>
              ))}
            </div>
          ) : (
            <div className={`rounded-xl p-4 border ${darkMode ? "border-white/10 bg-white/5" : "border-black/10 bg-black/5"}`}>
              <div className="text-sm font-semibold opacity-80">No hay noticias anteriores todavía.</div>
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeModal} />

          <div
            className={`relative w-full max-w-4xl rounded-2xl overflow-hidden border ${
              darkMode ? "bg-[#1f2937] border-[#2b3341] text-white" : "bg-white border-[#eee] text-[#1d0b0b]"
            }`}
          >
            <div className="p-4 sm:p-5 flex items-center justify-between">
              <div className="font-extrabold">
                {form.id ? `Editar noticia #${form.id}` : form.slotType === "popup" ? "Crear POPUP" : `Crear noticia (slot #${form.slotIndex})`}
                {isReadOnly && <div className="mt-1 text-xs font-bold text-red-300">ARCHIVADA · Solo lectura (no se permite editar)</div>}
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving || archiving || opening}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl font-semibold border ${
                  darkMode ? "border-white/10 hover:bg-white/10" : "border-black/10 hover:bg-black/5"
                } ${saving || archiving || opening ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <X size={16} />
                Cerrar
              </button>
            </div>

            {opening ? (
              <div className="p-8">
                <div className="text-sm font-semibold opacity-80">Abriendo noticia...</div>
              </div>
            ) : (
              <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
                {/* IZQUIERDA */}
                <div className={`${darkMode ? "bg-[#111827]" : "bg-white"} rounded-xl p-4 border ${darkMode ? "border-white/10" : "border-black/10"}`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold opacity-75">Título</label>
                      <input
                        className={`w-full mt-1 p-2 rounded ${inputBase} ${isReadOnly ? "opacity-70 cursor-not-allowed" : ""}`}
                        value={form.titulo}
                        disabled={isReadOnly}
                        onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold opacity-75">Palabra clave</label>
                      <div className="mt-1 flex gap-2">
                        <input
                          className={`w-full p-2 rounded ${inputBase} ${isReadOnly ? "opacity-70 cursor-not-allowed" : ""}`}
                          value={form.slug}
                          disabled={isReadOnly}
                          onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                        />
                        <button
                          type="button"
                          onClick={handleAutoSlug}
                          disabled={isReadOnly}
                          className={`px-3 rounded bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15 font-semibold ${
                            isReadOnly ? "opacity-60 cursor-not-allowed" : ""
                          }`}
                        >
                          Auto
                        </button>
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <label className="text-xs font-bold opacity-75">Resumen (max 280)</label>
                      <input
                        className={`w-full mt-1 p-2 rounded ${inputBase} ${isReadOnly ? "opacity-70 cursor-not-allowed" : ""}`}
                        value={form.resumen}
                        maxLength={280}
                        disabled={isReadOnly}
                        onChange={(e) => setForm((p) => ({ ...p, resumen: e.target.value }))}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="text-xs font-bold opacity-75">Contenido</label>
                      <textarea
                        className={`w-full mt-1 p-2 rounded ${inputBase} min-h-[140px] ${isReadOnly ? "opacity-70 cursor-not-allowed" : ""}`}
                        value={form.contenido}
                        disabled={isReadOnly}
                        onChange={(e) => setForm((p) => ({ ...p, contenido: e.target.value }))}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold opacity-75">Estado</label>
                      <select
                        className={`w-full mt-1 p-2 rounded ${inputBase} ${isReadOnly ? "opacity-70 cursor-not-allowed" : ""}`}
                        value={form.estado_noticia_id ?? ""}
                        disabled={isReadOnly}
                        onChange={(e) => setForm((p) => ({ ...p, estado_noticia_id: e.target.value ? Number(e.target.value) : null }))}
                      >
                        <option value="">— Seleccionar —</option>
                        {estados.map((es) => (
                          <option key={es.id} value={es.id}>
                            {es.nombre}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold opacity-75">Pinned</label>
                      <div className={`mt-1 p-2 rounded border ${darkMode ? "border-white/10" : "border-black/10"} flex items-center justify-between`}>
                        <label className={`flex items-center gap-2 text-sm font-semibold ${isReadOnly ? "opacity-70" : ""}`}>
                          <input
                            type="checkbox"
                            checked={!!form.pinned}
                            onChange={(e) => setForm((p) => ({ ...p, pinned: e.target.checked }))}
                            disabled={isReadOnly || isCardCreating}
                            title={isCardCreating ? "Slot fijo: se ancla automáticamente" : ""}
                          />
                          Destacar
                        </label>

                        <input
                          type="number"
                          min={0}
                          max={5}
                          className={`w-24 p-1 rounded ${inputBase} ${!form.pinned || isCardCreating || isReadOnly ? "opacity-60 cursor-not-allowed" : ""}`}
                          disabled={!form.pinned || isCardCreating || isReadOnly}
                          value={form.pinned_order}
                          onChange={(e) => setForm((p) => ({ ...p, pinned_order: Number(e.target.value) }))}
                          title={isCardCreating ? "Slot fijo: se ancla automáticamente" : "Orden slot (0..5)"}
                        />
                      </div>

                      {isCardCreating && <div className="text-xs opacity-70 mt-1">Slot fijo: esta noticia quedará en el slot #{form.slotIndex}.</div>}
                    </div>

                    <div className="md:col-span-2">
                      <label className="text-xs font-bold opacity-75">Popup</label>
                      <div className={`mt-1 p-3 rounded border ${darkMode ? "border-white/10 bg-white/5" : "border-black/10 bg-black/5"}`}>
                        <label className={`flex items-center gap-2 text-sm font-semibold ${isReadOnly ? "opacity-70" : ""}`}>
                          <input
                            type="checkbox"
                            checked={!!form.is_popup}
                            disabled={isReadOnly}
                            onChange={(e) =>
                              setForm((p) => {
                                const checked = e.target.checked;
                                const nextEstado = p.estado_noticia_id ?? getDefaultEstadoForSlot("popup");
                                return { ...p, is_popup: checked, estado_noticia_id: checked ? nextEstado : p.estado_noticia_id };
                              })
                            }
                          />
                          Mostrar como popup al cargar landing
                        </label>

                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-bold opacity-75">Inicio</label>
                            <input
                              type="datetime-local"
                              className={`w-full mt-1 p-2 rounded ${inputBase} ${!form.is_popup || isReadOnly ? "opacity-60 cursor-not-allowed" : ""}`}
                              disabled={!form.is_popup || isReadOnly}
                              value={form.popup_start_at}
                              onChange={(e) => setForm((p) => ({ ...p, popup_start_at: e.target.value }))}
                            />
                          </div>

                          <div>
                            <label className="text-xs font-bold opacity-75">Fin (opcional)</label>
                            <input
                              type="datetime-local"
                              className={`w-full mt-1 p-2 rounded ${inputBase} ${!form.is_popup || isReadOnly ? "opacity-60 cursor-not-allowed" : ""}`}
                              disabled={!form.is_popup || isReadOnly}
                              value={form.popup_end_at}
                              onChange={(e) => setForm((p) => ({ ...p, popup_end_at: e.target.value }))}
                            />
                          </div>
                        </div>

                        <div className="text-xs opacity-70 mt-2">Si marcas popup, el backend exige inicio. Fin es opcional.</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-2">
                    {form.id && !isReadOnly && (
                      <button
                        type="button"
                        onClick={handleArchive}
                        disabled={archiving || saving}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-white ${
                          archiving || saving ? "bg-red-500/40 cursor-not-allowed" : "bg-red-600 hover:bg-red-700"
                        }`}
                      >
                        <Trash2 size={16} />
                        {archiving ? "Archivando..." : "Archivar"}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving || archiving || isReadOnly}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-white ${
                        saving || archiving || isReadOnly ? "bg-[#e82d89]/50 cursor-not-allowed" : "bg-[#e82d89] hover:bg-pink-700"
                      }`}
                    >
                      <Save size={16} />
                      {isReadOnly ? "Solo lectura" : saving ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </div>

                {/* DERECHA */}
                <div className={`${darkMode ? "bg-[#111827]" : "bg-white"} rounded-xl p-4 border ${darkMode ? "border-white/10" : "border-black/10"}`}>
                  <div className="flex items-center justify-between">
                    <div className="font-bold">Imagen</div>

                    <div className="flex items-center gap-2">
                      <label
                        className={`cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15 font-semibold ${
                          saving || archiving || isReadOnly ? "opacity-60 cursor-not-allowed" : ""
                        }`}
                        title={isReadOnly ? "Archivada: solo lectura" : "Elegir imagen"}
                      >
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={handlePickImage}
                          disabled={saving || archiving || isReadOnly}
                        />
                        <ImageIcon size={16} />
                        Elegir
                      </label>

                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        disabled={saving || archiving || isReadOnly || !form.imagen_preview}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl font-semibold border ${
                          darkMode ? "border-white/10 hover:bg-white/10" : "border-black/10 hover:bg-black/5"
                        } ${saving || archiving || isReadOnly || !form.imagen_preview ? "opacity-60 cursor-not-allowed" : ""}`}
                        title={isReadOnly ? "Archivada: solo lectura" : "Quitar imagen"}
                      >
                        <Trash2 size={16} />
                        Quitar
                      </button>
                    </div>
                  </div>

                  <div className={`mt-3 rounded-xl overflow-hidden border ${darkMode ? "border-white/10 bg-white/5" : "border-black/10 bg-black/5"}`}>
                    {form.imagen_preview ? (
                      <img src={form.imagen_preview} alt="Preview" className="w-full h-48 object-cover" />
                    ) : (
                      <div className="h-48 flex items-center justify-center text-xs font-semibold opacity-70">Sin imagen</div>
                    )}
                  </div>

                  <div className="mt-2 text-xs opacity-75 font-semibold">
                    {form.imagen_bytes ? `Optimizada: ~${Math.round(form.imagen_bytes / 1024)}KB (${form.imagen_mime})` : "Tip: ideal < 600KB"}
                  </div>

                  <div className="mt-4 p-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
                    <div className="text-xs font-bold opacity-70">Vista rápida</div>
                    <div className="mt-2 font-extrabold">{form.titulo || "Título..."}</div>
                    <div className="text-sm opacity-80 font-semibold">{form.resumen || "Resumen..."}</div>
                    <div className="mt-2 text-xs opacity-70 font-semibold">
                      Estado: {isReadOnly ? "ARCHIVADA" : estadoNombre(form.estado_noticia_id)}
                      {form.is_popup ? " · POPUP" : ""}
                      {form.pinned ? ` · SLOT(${form.pinned_order})` : ""}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="px-4 sm:px-6 pb-4 text-xs opacity-70 font-semibold">
              Archivadas bajan a “Noticias anteriores” y no se pueden editar (pero sí abrir en modo lectura, porque somos civilizados).
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
