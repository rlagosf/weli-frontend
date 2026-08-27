// src/pages/apoderado/configuracionApoderado.jsx
import { useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import { FiArrowLeft, FiCamera, FiLock, FiLogOut, FiMoon, FiSave, FiShield, FiSun } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import IsLoading from "../../components/isLoading";
import { useTheme } from "../../context/ThemeContext";
import api, { getToken, clearToken } from "../../services/api";

const ACCENT = "#2563EB"; // ✅ azul confianza

/* ───────────────────────────────
   UI helpers
─────────────────────────────── */
const Pill = ({ children, darkMode }) => (
  <span
    className={[
      "inline-flex items-center rounded-full px-3 py-1 text-xs font-extrabold",
      darkMode ? "bg-white/10 text-white/75" : "bg-black/5 text-black/70",
    ].join(" ")}
  >
    {children}
  </span>
);

/* ───────────────────────────────
   Foto helpers (browser-only)
─────────────────────────────── */
function isValidMime(m) {
  return ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(String(m || "").toLowerCase());
}

function approxBytesFromBase64(b64) {
  const s = String(b64 || "").replace(/\s+/g, "");
  const padding = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
  return Math.floor((s.length * 3) / 4) - padding;
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function dataURLToImage(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataURL;
  });
}

function canvasToBase64(canvas, mime = "image/jpeg", quality = 0.8) {
  const dataUrl = canvas.toDataURL(mime, quality);
  const base64 = dataUrl.split("base64,")[1] || "";
  return { dataUrl, base64 };
}

async function getCroppedCompressedBase64(imageSrc, cropPixels, outSize, quality) {
  const img = await dataURLToImage(imageSrc);

  const canvas = document.createElement("canvas");
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext("2d");

  ctx.drawImage(img, cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height, 0, 0, outSize, outSize);

  const { dataUrl, base64 } = canvasToBase64(canvas, "image/jpeg", quality);
  const approxBytes = approxBytesFromBase64(base64);

  return { dataUrl, base64, mime: "image/jpeg", approxBytes };
}

function clean(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s === "-" || s === "—") return null;
  return s;
}

function pickBest(items, key) {
  for (const it of items || []) {
    const val = clean(it?.[key]) ?? clean(it?.jugador?.[key]) ?? clean(it?.apoderado?.[key]);
    if (val) return val;
  }
  return null;
}

/* =======================
   Component
======================= */
export default function ConfiguracionApoderado() {
  const navigate = useNavigate();
  const { darkMode, toggleTheme } = useTheme();

  const [loading, setLoading] = useState(true);

  // Mensajes generales (password)
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  // ✅ toast (mini)
  const [toastOk, setToastOk] = useState("");
  const toastTimerRef = useRef(null);

  const showOkToast = (msg) => {
    setToastOk(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastOk(""), 2600);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  // jugadores asociados al apoderado
  const [jugadores, setJugadores] = useState([]);
  const [selectedRutJugador, setSelectedRutJugador] = useState("");

  // bloqueo suave: cuando el backend dice PASSWORD_CHANGE_REQUIRED
  const [pwdRequired, setPwdRequired] = useState(false);

  // cambio de clave
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [savingPass, setSavingPass] = useState(false);

  // ───────── FOTO ─────────
  const [fotoPreviewUrl, setFotoPreviewUrl] = useState(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropImageUrl, setCropImageUrl] = useState(null);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1.2);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const [savingFoto, setSavingFoto] = useState(false);
  const [fotoError, setFotoError] = useState("");
  const [fotoOk, setFotoOk] = useState("");

  // ⚙️ Ajusta a tu realidad
  const FOTO_SIZE = 512; // salida 512x512
  const FOTO_MAX_UPLOAD_MB = 8; // límite selección
  const FOTO_QUALITY = 0.78; // compresión JPEG
  const FOTO_MAX_STORED_KB = 350; // tope aproximado de guardado

  // estilos base (✅ sin “font-realacademy”)
  const pageClass = darkMode ? "text-white bg-[#0B1220]" : "text-[#0f172a] bg-[#eef2f7]";
  const surfaceClass = darkMode ? "border-white/10 bg-[#0F1A2B]" : "border-black/10 bg-[#ffffffcc]";
  const cardClass = darkMode ? "border-white/10 bg-[#0C1626]" : "border-black/10 bg-white";
  const mutedText = darkMode ? "text-white/65" : "text-slate-600";
  const softText = darkMode ? "text-white/80" : "text-slate-700";

  /* ───────────────────────────────
     Auth helpers
  ─────────────────────────────── */
  const clearSession = () => {
    try {
      localStorage.removeItem("apoderado_must_change_password");
      localStorage.removeItem("user_info");
    } catch {}
    try {
      clearToken();
    } catch {}
  };

  const goLogin = () => {
    clearSession();
    navigate("/login-apoderado", { replace: true });
  };

  const authHeaders = () => {
    const t = getToken() || "";
    return { Authorization: `Bearer ${t}` };
  };

  /* ───────────────────────────────
     Carga inicial: /mis-jugadores
  ─────────────────────────────── */
  useEffect(() => {
    const abort = new AbortController();

    (async () => {
      setLoading(true);
      setError("");
      setOkMsg("");
      setPwdRequired(false);

      // reset no críticos
      setJugadores([]);
      setSelectedRutJugador("");
      setFotoPreviewUrl(null);
      setFotoError("");
      setFotoOk("");

      const token = getToken();
      if (!token) {
        goLogin();
        return;
      }

      try {
        const { data } = await api.get("/portal-apoderado/mis-jugadores", {
          signal: abort.signal,
          headers: authHeaders(),
        });
        if (abort.signal.aborted) return;

        const arr = Array.isArray(data?.jugadores) ? data.jugadores : Array.isArray(data?.items) ? data.items : [];

        setJugadores(arr);

        const firstRut = pickBest(arr, "rut_jugador") || pickBest(arr, "rut") || pickBest(arr, "rutJugador") || "";

        if (firstRut) setSelectedRutJugador(String(firstRut));
      } catch (err) {
        if (err?.code === "ERR_CANCELED" || err?.message === "canceled") return;

        const st = err?.status ?? err?.response?.status;
        const msg = err?.response?.data?.message || err?.message || "Error";

        if (st === 401) {
          goLogin();
          return;
        }

        if (st === 403 && msg === "PASSWORD_CHANGE_REQUIRED") {
          setPwdRequired(true);
          setJugadores([]);
          setSelectedRutJugador("");
          setError("Debes cambiar tu contraseña para continuar.");
          return;
        }

        setError(msg);
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    })();

    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  /* ───────────────────────────────
     Cuando cambia jugador: traer foto
  ─────────────────────────────── */
  useEffect(() => {
    const abort = new AbortController();

    (async () => {
      setFotoError("");
      setFotoOk("");

      if (pwdRequired || !selectedRutJugador) {
        setFotoPreviewUrl(null);
        return;
      }

      try {
        const { data } = await api.get(`/portal-apoderado/jugadores/${selectedRutJugador}/foto`, {
          signal: abort.signal,
          headers: authHeaders(),
        });
        if (abort.signal.aborted) return;

        if (data?.foto_base64 && data?.foto_mime) {
          setFotoPreviewUrl(`data:${data.foto_mime};base64,${data.foto_base64}`);
        } else {
          setFotoPreviewUrl(null);
        }
      } catch (err) {
        const st = err?.status ?? err?.response?.status;
        const msg = err?.response?.data?.message || err?.message || "";
        if (st === 401) return goLogin();
        if (st === 403 && msg === "PASSWORD_CHANGE_REQUIRED") setPwdRequired(true);

        setFotoPreviewUrl(null);
      }
    })();

    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRutJugador, pwdRequired]);

  /* ───────────────────────────────
     Logout (apoderado)
  ─────────────────────────────── */
  const handleLogout = async () => {
    const token = getToken();
    if (!token) {
      clearSession();
      navigate("/", { replace: true });
      return;
    }

    try {
      await api.post("/auth-apoderado/logout", { reason: "user_click" }, { headers: authHeaders() });
    } catch {
      // igual cerramos sesión
    } finally {
      clearSession();
      navigate("/", { replace: true });
    }
  };

  const goBack = () => navigate("/portal-apoderado", { replace: true });

  /* ───────────────────────────────
     Password change
  ─────────────────────────────── */
  const validatePass = () => {
    if (!oldPass || !newPass || !newPass2) return "Completa todos los campos.";
    if (newPass.length < 8) return "La nueva clave debe tener al menos 8 caracteres.";
    if (newPass !== newPass2) return "La confirmación no coincide.";
    if (oldPass === newPass) return "La nueva clave debe ser distinta a la anterior.";
    return "";
  };

  const handleChangePassword = async (e) => {
    e?.preventDefault?.();
    if (savingPass) return;

    setError("");
    setOkMsg("");

    const v = validatePass();
    if (v) {
      setError(v);
      return;
    }

    const token = getToken();
    if (!token) return goLogin();

    setSavingPass(true);

    try {
      await api.post(
        "/auth-apoderado/change-password",
        { current_password: oldPass, new_password: newPass },
        { headers: authHeaders() }
      );

      try {
        localStorage.removeItem("apoderado_must_change_password");
      } catch {}

      setOldPass("");
      setNewPass("");
      setNewPass2("");

      setPwdRequired(false);

      const msg = "✅ Contraseña cambiada con éxito.";
      setOkMsg(msg);
      showOkToast(msg);

      setTimeout(() => {
        navigate("/portal-apoderado", { replace: true });
      }, 900);
    } catch (err) {
      const st = err?.status ?? err?.response?.status;
      const msg = err?.response?.data?.message || err?.message || "Error";

      if (st === 401) setError("❌ Clave actual incorrecta o sesión inválida.");
      else setError(`❌ ${msg}`);
    } finally {
      setSavingPass(false);
    }
  };

  /* ───────────────────────────────
     Foto handlers
  ─────────────────────────────── */
  const onPickFoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";

    setFotoError("");
    setFotoOk("");

    if (pwdRequired) {
      setFotoError("Primero debes cambiar tu contraseña para continuar.");
      return;
    }

    if (!selectedRutJugador) {
      setFotoError("Selecciona un jugador antes de subir la foto.");
      return;
    }
    if (!file) return;

    const mime = String(file.type || "").toLowerCase();
    if (!isValidMime(mime)) {
      setFotoError("Formato no permitido. Usa JPG/PNG/WEBP.");
      return;
    }

    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > FOTO_MAX_UPLOAD_MB) {
      setFotoError(`Archivo muy grande (${sizeMb.toFixed(1)}MB). Máximo ${FOTO_MAX_UPLOAD_MB}MB.`);
      return;
    }

    try {
      const dataURL = await fileToDataURL(file);
      setCropImageUrl(dataURL);
      setCrop({ x: 0, y: 0 });
      setZoom(1.2);
      setCroppedAreaPixels(null);
      setCropOpen(true);
    } catch {
      setFotoError("No se pudo leer el archivo. Intenta con otra imagen.");
    }
  };

  const handleSaveFoto = async () => {
    setFotoError("");
    setFotoOk("");

    if (pwdRequired) {
      setFotoError("Primero debes cambiar tu contraseña para continuar.");
      return;
    }

    if (!selectedRutJugador) {
      setFotoError("Selecciona un jugador antes de guardar.");
      return;
    }
    if (!cropImageUrl || !croppedAreaPixels) {
      setFotoError("No se pudo preparar el recorte. Intenta de nuevo.");
      return;
    }

    setSavingFoto(true);
    try {
      const { dataUrl, base64, mime, approxBytes } = await getCroppedCompressedBase64(
        cropImageUrl,
        croppedAreaPixels,
        FOTO_SIZE,
        FOTO_QUALITY
      );

      const maxBytes = FOTO_MAX_STORED_KB * 1024;
      if (approxBytes > maxBytes) {
        setFotoError(
          `Quedó pesada (${Math.round(approxBytes / 1024)}KB). Acércate más (menos fondo) y vuelve a guardar.`
        );
        return;
      }

      await api.patch(
        `/portal-apoderado/jugadores/${selectedRutJugador}/foto`,
        { foto_base64: base64, foto_mime: mime },
        { headers: authHeaders() }
      );

      setFotoPreviewUrl(dataUrl);
      setCropOpen(false);
      setFotoOk("✅ Foto actualizada. Nivel carnet… pero con aura de crack 😄");
    } catch (err) {
      const st = err?.status ?? err?.response?.status;
      const msg = err?.response?.data?.message || err?.message || "Error al guardar la foto";

      if (st === 401) return goLogin();
      if (st === 403 && msg === "PASSWORD_CHANGE_REQUIRED") {
        setPwdRequired(true);
        setFotoError("Primero debes cambiar tu contraseña para continuar.");
      } else {
        setFotoError(msg);
      }
    } finally {
      setSavingFoto(false);
    }
  };

  const onRemoveFoto = async () => {
    setFotoError("");
    setFotoOk("");

    if (pwdRequired) {
      setFotoError("Primero debes cambiar tu contraseña para continuar.");
      return;
    }

    if (!selectedRutJugador) {
      setFotoError("Selecciona un jugador antes de quitar la foto.");
      return;
    }

    setSavingFoto(true);
    try {
      await api.patch(
        `/portal-apoderado/jugadores/${selectedRutJugador}/foto`,
        { foto_base64: null, foto_mime: null },
        { headers: authHeaders() }
      );
      setFotoPreviewUrl(null);
      setFotoOk("✅ Foto eliminada.");
    } catch (err) {
      const st = err?.status ?? err?.response?.status;
      const msg = err?.response?.data?.message || err?.message || "Error al eliminar la foto";

      if (st === 401) return goLogin();
      if (st === 403 && msg === "PASSWORD_CHANGE_REQUIRED") {
        setPwdRequired(true);
        setFotoError("Primero debes cambiar tu contraseña para continuar.");
      } else {
        setFotoError(msg);
      }
    } finally {
      setSavingFoto(false);
    }
  };

  /* ───────────────────────────────
     Render values
  ─────────────────────────────── */
  if (loading) return <IsLoading />;

  const jugadorOptions = (jugadores || [])
    .map((it) => {
      const rutJ = pickBest([it], "rut_jugador") || pickBest([it], "rut") || pickBest([it], "rutJugador") || "";
      const nombreJ =
        pickBest([it], "nombre_jugador") || pickBest([it], "nombre") || pickBest([it], "jugador_nombre") || "Jugador";
      return { rut: String(rutJ || ""), nombre: String(nombreJ || "Jugador") };
    })
    .filter((x) => x.rut);

  const fotoDisabled = pwdRequired || !selectedRutJugador || savingFoto || !jugadorOptions.length;

  return (
    <div className={["min-h-screen", pageClass].join(" ")}>
      {/* ✅ Toast OK (mini-modal) */}
      {toastOk && (
        <div className="fixed top-4 right-4 z-[9999]">
          <div
            className={[
              "rounded-2xl border px-4 py-3 font-extrabold shadow-[0_20px_70px_rgba(0,0,0,0.20)]",
              darkMode
                ? "border-green-500/25 bg-green-500/10 text-green-200"
                : "border-green-200 bg-green-50 text-green-700",
            ].join(" ")}
            role="status"
            aria-live="polite"
          >
            {toastOk}
          </div>
        </div>
      )}

      {/* Brillo suave */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[980px] h-[980px] rounded-full blur-3xl opacity-60"
          style={{
            background: darkMode
              ? "radial-gradient(circle, rgba(37,99,235,0.14), transparent 60%)"
              : "radial-gradient(circle, rgba(37,99,235,0.18), transparent 60%)",
          }}
        />
        <div
          className="absolute -bottom-56 right-[-180px] w-[900px] h-[900px] rounded-full blur-3xl opacity-50"
          style={{
            background: darkMode
              ? "radial-gradient(circle, rgba(14,165,233,0.10), transparent 60%)"
              : "radial-gradient(circle, rgba(2,132,199,0.10), transparent 60%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            opacity: darkMode ? 0.06 : 0.12,
            backgroundImage: darkMode
              ? "repeating-linear-gradient(135deg, rgba(255,255,255,0.10) 0px, rgba(255,255,255,0.10) 1px, transparent 1px, transparent 18px)"
              : "repeating-linear-gradient(135deg, rgba(15,23,42,0.08) 0px, rgba(15,23,42,0.08) 1px, transparent 1px, transparent 18px)",
          }}
        />
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6">
        {/* Topbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-widest uppercase" style={{ color: ACCENT }}>
              Configuración
            </h1>
            <p className={["mt-1 text-sm font-semibold", mutedText].join(" ")}>
              Seguridad y foto. Menos drama, más control.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className={[
                "rounded-xl px-3 py-2 border transition inline-flex items-center gap-2 font-extrabold uppercase tracking-widest",
                darkMode
                  ? "bg-[#0F1A2B] border-white/10 text-white hover:bg-[#12203A]"
                  : "bg-white border-black/10 text-[#0f172a] hover:bg-white/70",
              ].join(" ")}
              title={darkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              aria-label={darkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              {darkMode ? (
                <FiSun size={18} style={{ color: ACCENT }} />
              ) : (
                <FiMoon size={18} style={{ color: ACCENT }} />
              )}
            </button>

            <button
              type="button"
              onClick={goBack}
              className={[
                "rounded-xl px-4 py-2 font-extrabold uppercase tracking-widest border transition inline-flex items-center gap-2",
                darkMode
                  ? "bg-[#0F1A2B] border-white/10 text-white hover:bg-[#12203A]"
                  : "bg-white border-black/10 text-[#0f172a] hover:bg-white/70",
              ].join(" ")}
              title="Volver al portal"
            >
              <FiArrowLeft size={18} />
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl px-4 py-2 font-extrabold uppercase tracking-widest text-white transition inline-flex items-center gap-2"
              style={{ background: ACCENT }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#1D4ED8")}
              onMouseLeave={(e) => (e.currentTarget.style.background = ACCENT)}
              title="Cerrar sesión"
            >
              <FiLogOut size={18} />
            </button>
          </div>
        </div>

        {/* Alerts */}
        <div className="mt-4 space-y-2">
          {error && (
            <div
              className={[
                "rounded-2xl border font-extrabold p-4",
                darkMode ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-red-200 bg-red-50 text-red-700",
              ].join(" ")}
            >
              {String(error).startsWith("❌") ? error : `❌ ${error}`}
            </div>
          )}

          {okMsg && (
            <div
              className={[
                "rounded-2xl border font-extrabold p-4",
                darkMode
                  ? "border-green-500/25 bg-green-500/10 text-green-200"
                  : "border-green-200 bg-green-50 text-green-700",
              ].join(" ")}
            >
              {okMsg}
            </div>
          )}

          {pwdRequired && (
            <div
              className={[
                "rounded-2xl border font-extrabold p-4",
                darkMode
                  ? "border-yellow-500/25 bg-yellow-500/10 text-yellow-200"
                  : "border-yellow-200 bg-yellow-50 text-yellow-800",
              ].join(" ")}
            >
              🔐 Tu cuenta requiere cambio de contraseña. Hazlo aquí y vuelves al juego.
            </div>
          )}
        </div>

        {/* ✅ Seguridad */}
        <section
          className={["mt-6 rounded-[26px] border shadow-[0_20px_70px_rgba(0,0,0,0.08)] p-5 sm:p-6", surfaceClass].join(
            " "
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p
                className={[
                  "text-xs font-black tracking-[0.35em] uppercase",
                  darkMode ? "text-white/50" : "text-slate-500",
                ].join(" ")}
              >
                Seguridad
              </p>
              <h2
                className={[
                  "mt-2 text-xl font-extrabold flex items-center gap-2",
                  darkMode ? "text-white" : "text-slate-900",
                ].join(" ")}
              >
                <FiLock style={{ color: ACCENT }} />
                Cambiar contraseña
              </h2>
              <p className={["mt-1 text-sm font-semibold", mutedText].join(" ")}>
                Cámbiala cuando quieras. Que la única “filtración” sea la defensa rival 😄
              </p>
            </div>

            <Pill darkMode={darkMode}>
              <FiShield className="mr-2" />
              Seguro
            </Pill>
          </div>

          <form onSubmit={handleChangePassword} className="mt-5 space-y-3">
            <div className="space-y-1">
              <label
                className={[
                  "text-xs font-black tracking-[0.30em] uppercase",
                  darkMode ? "text-white/45" : "text-slate-500",
                ].join(" ")}
              >
                Clave actual
              </label>
              <input
                type="password"
                value={oldPass}
                onChange={(e) => setOldPass(e.target.value)}
                className={[
                  "w-full rounded-xl border px-4 py-3 text-sm font-semibold outline-none transition",
                  darkMode
                    ? "border-white/10 bg-white/5 text-white placeholder:text-white/35"
                    : "border-black/10 bg-white text-slate-900 placeholder:text-slate-400",
                ].join(" ")}
                style={{ outlineColor: "transparent" }}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={savingPass}
              />
            </div>

            <div className="space-y-1">
              <label
                className={[
                  "text-xs font-black tracking-[0.30em] uppercase",
                  darkMode ? "text-white/45" : "text-slate-500",
                ].join(" ")}
              >
                Nueva clave
              </label>
              <input
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                className={[
                  "w-full rounded-xl border px-4 py-3 text-sm font-semibold outline-none transition",
                  darkMode
                    ? "border-white/10 bg-white/5 text-white placeholder:text-white/35"
                    : "border-black/10 bg-white text-slate-900 placeholder:text-slate-400",
                ].join(" ")}
                placeholder="mínimo 8 caracteres"
                autoComplete="new-password"
                disabled={savingPass}
                minLength={8}
              />
            </div>

            <div className="space-y-1">
              <label
                className={[
                  "text-xs font-black tracking-[0.30em] uppercase",
                  darkMode ? "text-white/45" : "text-slate-500",
                ].join(" ")}
              >
                Repetir nueva clave
              </label>
              <input
                type="password"
                value={newPass2}
                onChange={(e) => setNewPass2(e.target.value)}
                className={[
                  "w-full rounded-xl border px-4 py-3 text-sm font-semibold outline-none transition",
                  darkMode
                    ? "border-white/10 bg-white/5 text-white placeholder:text-white/35"
                    : "border-black/10 bg-white text-slate-900 placeholder:text-slate-400",
                ].join(" ")}
                placeholder="repítela tal cual"
                autoComplete="new-password"
                disabled={savingPass}
                minLength={8}
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="submit"
                disabled={savingPass}
                className={[
                  "rounded-xl px-4 py-2 font-extrabold uppercase tracking-widest transition inline-flex items-center gap-2 text-white",
                  savingPass ? "opacity-60 cursor-not-allowed" : "",
                ].join(" ")}
                style={{ background: savingPass ? "rgba(15,23,42,0.25)" : ACCENT }}
                onMouseEnter={(e) => !savingPass && (e.currentTarget.style.background = "#1D4ED8")}
                onMouseLeave={(e) => !savingPass && (e.currentTarget.style.background = ACCENT)}
              >
                {savingPass ? "Guardando..." : "Actualizar clave"}
                <FiSave size={18} />
              </button>
            </div>

            <div className={["mt-3 rounded-2xl border p-4", cardClass].join(" ")}>
              <p className={["text-sm font-semibold", softText].join(" ")}>
                Recomendación: usa frase + número + símbolo. Simple, memorable, y fuerte.
              </p>
            </div>
          </form>
        </section>

        {/* ======== FOTO ======== */}
        <section
          className={["mt-6 rounded-[26px] border shadow-[0_20px_70px_rgba(0,0,0,0.08)] p-5 sm:p-6", surfaceClass].join(
            " "
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p
                className={[
                  "text-xs font-black tracking-[0.35em] uppercase",
                  darkMode ? "text-white/50" : "text-slate-500",
                ].join(" ")}
              >
                Foto
              </p>
              <h2
                className={[
                  "mt-2 text-xl font-extrabold flex items-center gap-2",
                  darkMode ? "text-white" : "text-slate-900",
                ].join(" ")}
              >
                <FiCamera style={{ color: ACCENT }} />
                Fotografía del jugador
              </h2>
              <p className={["mt-1 text-sm font-semibold", mutedText].join(" ")}>
                Selecciona el jugador, sube una foto, ajusta el encuadre y listo. Optimizada para no “comerse” tu MySQL
                😄
              </p>
            </div>

            <Pill darkMode={darkMode}>
              <FiShield className="mr-2" />
              Optimizada
            </Pill>
          </div>

          <div className="mt-5">
            <label
              className={[
                "text-xs font-black tracking-[0.30em] uppercase",
                darkMode ? "text-white/45" : "text-slate-500",
              ].join(" ")}
            >
              Jugador
            </label>
            <select
              value={selectedRutJugador}
              onChange={(e) => setSelectedRutJugador(e.target.value)}
              className={[
                "mt-1 w-full rounded-xl border px-4 py-3 text-sm font-semibold outline-none transition",
                darkMode ? "border-white/10 bg-white/5 text-white" : "border-black/10 bg-white text-slate-900",
              ].join(" ")}
              disabled={pwdRequired || !jugadorOptions.length || savingFoto}
              title={pwdRequired ? "Primero cambia tu contraseña" : undefined}
            >
              {!jugadorOptions.length && <option value="">(Sin jugadores asociados)</option>}
              {jugadorOptions.map((j) => (
                <option key={j.rut} value={j.rut}>
                  {j.nombre} — {j.rut}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-4 items-start">
            <div className="flex flex-col items-center gap-3">
              <div
                className={[
                  "w-40 h-40 rounded-2xl overflow-hidden border flex items-center justify-center",
                  darkMode ? "border-white/10 bg-white/5" : "border-black/10 bg-slate-100",
                ].join(" ")}
              >
                {fotoPreviewUrl ? (
                  <img src={fotoPreviewUrl} alt="Foto del jugador" className="w-full h-full object-cover" />
                ) : (
                  <div
                    className={[
                      "text-xs font-black tracking-[0.30em] uppercase",
                      darkMode ? "text-white/45" : "text-slate-500",
                    ].join(" ")}
                  >
                    Sin foto
                  </div>
                )}
              </div>

              <label
                className={[
                  "cursor-pointer rounded-xl px-4 py-2 font-extrabold uppercase tracking-widest transition inline-flex items-center gap-2",
                  darkMode
                    ? "bg-[#0F1A2B] border border-white/10 text-white hover:bg-[#12203A]"
                    : "bg-white border border-black/10 text-[#0f172a] hover:bg-white/70",
                  fotoDisabled ? "opacity-60 cursor-not-allowed" : "",
                ].join(" ")}
                title={
                  pwdRequired
                    ? "Primero cambia tu contraseña"
                    : !selectedRutJugador
                      ? "Selecciona un jugador"
                      : "Subir foto"
                }
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={onPickFoto}
                  disabled={fotoDisabled}
                />
                Elegir foto
              </label>

              <button
                type="button"
                onClick={onRemoveFoto}
                disabled={pwdRequired || !fotoPreviewUrl || savingFoto || !selectedRutJugador}
                className={[
                  "rounded-xl px-4 py-2 font-extrabold uppercase tracking-widest transition",
                  pwdRequired || !fotoPreviewUrl || savingFoto || !selectedRutJugador
                    ? darkMode
                      ? "bg-white/5 text-white/35 cursor-not-allowed"
                      : "bg-black/5 text-black/30 cursor-not-allowed"
                    : "bg-red-500/90 text-white hover:bg-red-600",
                ].join(" ")}
              >
                Quitar
              </button>
            </div>

            <div className={["rounded-2xl border p-4", cardClass].join(" ")}>
              <p className={["text-sm font-semibold", softText].join(" ")}>
                Reglas: JPG/PNG/WEBP. Se recorta cuadrado y se comprime antes de enviar. Límite final aprox:{" "}
                <span className="font-extrabold">{FOTO_MAX_STORED_KB}KB</span>.
              </p>

              {fotoError && (
                <div
                  className={[
                    "mt-3 rounded-xl border p-3 font-extrabold",
                    darkMode ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-red-200 bg-red-50 text-red-700",
                  ].join(" ")}
                >
                  ❌ {fotoError}
                </div>
              )}

              {fotoOk && (
                <div
                  className={[
                    "mt-3 rounded-xl border p-3 font-extrabold",
                    darkMode
                      ? "border-green-500/25 bg-green-500/10 text-green-200"
                      : "border-green-200 bg-green-50 text-green-700",
                  ].join(" ")}
                >
                  {fotoOk}
                </div>
              )}

              {/* Modal crop */}
              {cropOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <div className="absolute inset-0 bg-black/60" onClick={() => !savingFoto && setCropOpen(false)} />

                  <div
                    className={[
                      "relative w-full max-w-2xl rounded-3xl border overflow-hidden",
                      darkMode ? "bg-[#0C1626] border-white/10" : "bg-white border-black/10",
                    ].join(" ")}
                  >
                    <div className="p-4 flex items-center justify-between">
                      <div
                        className={[
                          "font-extrabold uppercase tracking-widest",
                          darkMode ? "text-white" : "text-slate-900",
                        ].join(" ")}
                      >
                        Ajustar foto
                      </div>
                      <button
                        type="button"
                        onClick={() => setCropOpen(false)}
                        disabled={savingFoto}
                        className={[
                          "rounded-xl px-3 py-2 font-extrabold uppercase tracking-widest border transition",
                          darkMode
                            ? "border-white/10 text-white hover:bg-white/5"
                            : "border-black/10 text-slate-900 hover:bg-slate-50",
                          savingFoto ? "opacity-60 cursor-not-allowed" : "",
                        ].join(" ")}
                      >
                        Cerrar
                      </button>
                    </div>

                    <div className="relative w-full h-[360px] bg-black">
                      <Cropper
                        image={cropImageUrl}
                        crop={crop}
                        zoom={zoom}
                        aspect={1}
                        cropShape="rect"
                        showGrid={false}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
                      />
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={[
                            "text-xs font-black tracking-[0.30em] uppercase",
                            darkMode ? "text-white/45" : "text-slate-500",
                          ].join(" ")}
                        >
                          Zoom
                        </span>
                        <input
                          type="range"
                          min={1}
                          max={3}
                          step={0.01}
                          value={zoom}
                          onChange={(e) => setZoom(Number(e.target.value))}
                          className="w-full"
                          disabled={savingFoto}
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={handleSaveFoto}
                          disabled={savingFoto}
                          className={[
                            "rounded-xl px-4 py-2 font-extrabold uppercase tracking-widest transition inline-flex items-center gap-2 text-white",
                            savingFoto ? "opacity-60 cursor-not-allowed" : "",
                          ].join(" ")}
                          style={{ background: savingFoto ? "rgba(15,23,42,0.25)" : ACCENT }}
                          onMouseEnter={(e) => !savingFoto && (e.currentTarget.style.background = "#1D4ED8")}
                          onMouseLeave={(e) => !savingFoto && (e.currentTarget.style.background = ACCENT)}
                        >
                          {savingFoto ? "Guardando..." : "Guardar foto"}
                          <FiSave size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
