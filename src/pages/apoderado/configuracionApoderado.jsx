// src/pages/apoderado/configuracionApoderado.jsx

import { useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import {
  FiArrowLeft,
  FiCamera,
  FiCheckCircle,
  FiImage,
  FiLock,
  FiLogOut,
  FiMoon,
  FiSave,
  FiShield,
  FiSun,
  FiTrash2,
  FiUser,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";

import IsLoading from "../../components/isLoading";
import { useTheme } from "../../context/ThemeContext";
import api, { getToken, clearToken } from "../../services/api";

/* =========================================================
   PALETA PORTAL APODERADO
========================================================= */

const COLORS = {
  coral: "#F97316",
  coralDark: "#EA580C",
  violet: "#8B5CF6",
  violetDark: "#7C3AED",
  teal: "#14B8A6",
  tealDark: "#0F766E",
  emerald: "#22C55E",
  amber: "#F59E0B",
  rose: "#F43F5E",
};

/* =========================================================
   UI HELPERS
========================================================= */

const Pill = ({ children, darkMode, tone = "violet" }) => {
  const tones = {
    violet: darkMode
      ? "border-violet-400/20 bg-violet-400/10 text-violet-200"
      : "border-violet-200 bg-violet-50 text-violet-700",
    teal: darkMode ? "border-teal-400/20 bg-teal-400/10 text-teal-200" : "border-teal-200 bg-teal-50 text-teal-700",
    green: darkMode
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
      : "border-emerald-200 bg-emerald-50 text-emerald-700",
  };

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-3 py-1.5",
        "text-[11px] font-extrabold tracking-wide",
        tones[tone] ?? tones.violet,
      ].join(" ")}
    >
      {children}
    </span>
  );
};

/* =========================================================
   FOTO HELPERS
========================================================= */

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

  return {
    dataUrl,
    base64,
    mime: "image/jpeg",
    approxBytes,
  };
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

/* =========================================================
   COMPONENT
========================================================= */

export default function ConfiguracionApoderado() {
  const navigate = useNavigate();

  const { darkMode, toggleTheme } = useTheme();

  const [loading, setLoading] = useState(true);

  /* =======================================================
     MENSAJES GENERALES
  ======================================================= */

  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [toastOk, setToastOk] = useState("");
  const toastTimerRef = useRef(null);

  const showOkToast = (msg) => {
    setToastOk(msg);

    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = window.setTimeout(() => {
      setToastOk("");
    }, 2600);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  /* =======================================================
     JUGADORES
  ======================================================= */

  const [jugadores, setJugadores] = useState([]);
  const [selectedRutJugador, setSelectedRutJugador] = useState("");

  /* =======================================================
     PASSWORD CHANGE REQUIRED
  ======================================================= */

  const [pwdRequired, setPwdRequired] = useState(false);

  /* =======================================================
     CAMBIO DE CONTRASEÑA
  ======================================================= */

  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [savingPass, setSavingPass] = useState(false);

  /* =======================================================
     FOTO
  ======================================================= */

  const [fotoPreviewUrl, setFotoPreviewUrl] = useState(null);

  const [cropOpen, setCropOpen] = useState(false);
  const [cropImageUrl, setCropImageUrl] = useState(null);

  const [crop, setCrop] = useState({
    x: 0,
    y: 0,
  });

  const [zoom, setZoom] = useState(1.2);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const [savingFoto, setSavingFoto] = useState(false);
  const [fotoError, setFotoError] = useState("");
  const [fotoOk, setFotoOk] = useState("");

  const FOTO_SIZE = 512;
  const FOTO_MAX_UPLOAD_MB = 8;
  const FOTO_QUALITY = 0.78;
  const FOTO_MAX_STORED_KB = 350;

  /* =======================================================
     ESTILOS BASE
  ======================================================= */

  const pageClass = darkMode ? "bg-[#0b1020] text-slate-100" : "bg-[#fffaf5] text-slate-900";

  const surfaceClass = darkMode ? "border-white/[0.08] bg-[#111827]/95" : "border-orange-100/90 bg-white/95";

  const innerCardClass = darkMode ? "border-white/[0.08] bg-white/[0.035]" : "border-slate-200 bg-slate-50/80";

  const inputClass = darkMode
    ? "border-white/10 bg-white/[0.055] text-white placeholder:text-white/30 focus:border-violet-400/70 focus:ring-violet-400/15"
    : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:ring-violet-100";

  const mutedText = darkMode ? "text-slate-400" : "text-slate-500";
  const softText = darkMode ? "text-slate-300" : "text-slate-700";

  /* =======================================================
     AUTH HELPERS
  ======================================================= */

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

    navigate("/login-apoderado", {
      replace: true,
    });
  };

  const authHeaders = () => {
    const t = getToken() || "";

    return {
      Authorization: `Bearer ${t}`,
    };
  };

  /* =======================================================
     CARGA INICIAL
  ======================================================= */

  useEffect(() => {
    const abort = new AbortController();

    (async () => {
      setLoading(true);
      setError("");
      setOkMsg("");
      setPwdRequired(false);

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

        if (firstRut) {
          setSelectedRutJugador(String(firstRut));
        }
      } catch (err) {
        if (err?.code === "ERR_CANCELED" || err?.message === "canceled") {
          return;
        }

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
        if (!abort.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => abort.abort();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  /* =======================================================
     FOTO DEL JUGADOR SELECCIONADO
  ======================================================= */

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

        if (st === 401) {
          return goLogin();
        }

        if (st === 403 && msg === "PASSWORD_CHANGE_REQUIRED") {
          setPwdRequired(true);
        }

        setFotoPreviewUrl(null);
      }
    })();

    return () => abort.abort();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRutJugador, pwdRequired]);

  /* =======================================================
     LOGOUT
  ======================================================= */

  const handleLogout = async () => {
    const token = getToken();

    if (!token) {
      clearSession();

      navigate("/", {
        replace: true,
      });

      return;
    }

    try {
      await api.post(
        "/auth-apoderado/logout",
        {
          reason: "user_click",
        },
        {
          headers: authHeaders(),
        }
      );
    } catch {
      // igual cerramos sesión
    } finally {
      clearSession();

      navigate("/", {
        replace: true,
      });
    }
  };

  const goBack = () =>
    navigate("/portal-apoderado", {
      replace: true,
    });

  /* =======================================================
     CAMBIO DE CONTRASEÑA
  ======================================================= */

  const validatePass = () => {
    if (!oldPass || !newPass || !newPass2) {
      return "Completa todos los campos.";
    }

    if (newPass.length < 8) {
      return "La nueva clave debe tener al menos 8 caracteres.";
    }

    if (newPass !== newPass2) {
      return "La confirmación no coincide.";
    }

    if (oldPass === newPass) {
      return "La nueva clave debe ser distinta a la anterior.";
    }

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

    if (!token) {
      return goLogin();
    }

    setSavingPass(true);

    try {
      await api.post(
        "/auth-apoderado/change-password",
        {
          current_password: oldPass,
          new_password: newPass,
        },
        {
          headers: authHeaders(),
        }
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
        navigate("/portal-apoderado", {
          replace: true,
        });
      }, 900);
    } catch (err) {
      const st = err?.status ?? err?.response?.status;

      const msg = err?.response?.data?.message || err?.message || "Error";

      if (st === 401) {
        setError("❌ Clave actual incorrecta o sesión inválida.");
      } else {
        setError(`❌ ${msg}`);
      }
    } finally {
      setSavingPass(false);
    }
  };

  /* =======================================================
     FOTO HANDLERS
  ======================================================= */

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

      setCrop({
        x: 0,
        y: 0,
      });

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
        {
          foto_base64: base64,
          foto_mime: mime,
        },
        {
          headers: authHeaders(),
        }
      );

      setFotoPreviewUrl(dataUrl);
      setCropOpen(false);

      setFotoOk("✅ Foto actualizada. Nivel carnet… pero con aura de crack 😄");
    } catch (err) {
      const st = err?.status ?? err?.response?.status;

      const msg = err?.response?.data?.message || err?.message || "Error al guardar la foto";

      if (st === 401) {
        return goLogin();
      }

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
        {
          foto_base64: null,
          foto_mime: null,
        },
        {
          headers: authHeaders(),
        }
      );

      setFotoPreviewUrl(null);
      setFotoOk("✅ Foto eliminada.");
    } catch (err) {
      const st = err?.status ?? err?.response?.status;

      const msg = err?.response?.data?.message || err?.message || "Error al eliminar la foto";

      if (st === 401) {
        return goLogin();
      }

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

  /* =======================================================
     RENDER VALUES
  ======================================================= */

  if (loading) {
    return <IsLoading />;
  }

  const jugadorOptions = (jugadores || [])
    .map((it) => {
      const rutJ = pickBest([it], "rut_jugador") || pickBest([it], "rut") || pickBest([it], "rutJugador") || "";

      const nombreJ =
        pickBest([it], "nombre_jugador") || pickBest([it], "nombre") || pickBest([it], "jugador_nombre") || "Jugador";

      return {
        rut: String(rutJ || ""),
        nombre: String(nombreJ || "Jugador"),
      };
    })
    .filter((x) => x.rut);

  const fotoDisabled = pwdRequired || !selectedRutJugador || savingFoto || !jugadorOptions.length;

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className={`relative min-h-screen overflow-x-hidden ${pageClass}`}>
      {/* ===================================================
          FONDO DECORATIVO
      =================================================== */}

      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute -left-28 -top-28 h-[430px] w-[430px] rounded-full blur-3xl"
          style={{
            background: darkMode
              ? "radial-gradient(circle, rgba(249,115,22,0.15), transparent 68%)"
              : "radial-gradient(circle, rgba(249,115,22,0.17), transparent 68%)",
          }}
        />

        <div
          className="absolute right-[-180px] top-[17%] h-[560px] w-[560px] rounded-full blur-3xl"
          style={{
            background: darkMode
              ? "radial-gradient(circle, rgba(139,92,246,0.12), transparent 68%)"
              : "radial-gradient(circle, rgba(139,92,246,0.13), transparent 68%)",
          }}
        />

        <div
          className="absolute -bottom-48 left-[20%] h-[540px] w-[540px] rounded-full blur-3xl"
          style={{
            background: darkMode
              ? "radial-gradient(circle, rgba(20,184,166,0.10), transparent 68%)"
              : "radial-gradient(circle, rgba(20,184,166,0.11), transparent 68%)",
          }}
        />
      </div>

      {/* ===================================================
          TOAST
      =================================================== */}

      {toastOk && (
        <div className="fixed left-4 right-4 top-4 z-[9999] sm:left-auto sm:right-6 sm:max-w-sm">
          <div
            role="status"
            aria-live="polite"
            className={[
              "flex items-center gap-3 rounded-2xl border px-4 py-3",
              "shadow-[0_20px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl",
              darkMode
                ? "border-emerald-400/20 bg-[#12241f]/95 text-emerald-100"
                : "border-emerald-200 bg-white/95 text-emerald-700",
            ].join(" ")}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white">
              <FiCheckCircle size={18} />
            </span>

            <span className="text-sm font-bold">{toastOk}</span>
          </div>
        </div>
      )}

      {/* ===================================================
          CONTENIDO
      =================================================== */}

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-12 pt-5 sm:px-6 sm:pt-7 lg:px-8">
        {/* =================================================
            CABECERA
        ================================================= */}

        <header
          className={[
            "relative overflow-hidden rounded-[28px] border",
            "shadow-[0_22px_70px_rgba(15,23,42,0.10)]",
            darkMode ? "border-white/[0.08] bg-[#111827]/95" : "border-orange-100 bg-white/95",
          ].join(" ")}
        >
          <div
            className="absolute inset-x-0 top-0 h-1.5"
            style={{
              background: `linear-gradient(90deg, ${COLORS.coral}, ${COLORS.amber}, ${COLORS.violet}, ${COLORS.teal})`,
            }}
          />

          <div className="relative p-5 sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg"
                  style={{
                    background: `linear-gradient(135deg, ${COLORS.coral}, ${COLORS.violet})`,
                  }}
                >
                  <FiShield size={27} />
                </div>

                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className={[
                        "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em]",
                        darkMode ? "bg-orange-400/10 text-orange-300" : "bg-orange-50 text-orange-600",
                      ].join(" ")}
                    >
                      Mi cuenta
                    </span>

                    <Pill darkMode={darkMode} tone="teal">
                      <FiShield className="mr-1.5" />
                      Zona protegida
                    </Pill>
                  </div>

                  <h1
                    className={[
                      "text-2xl font-black tracking-tight sm:text-3xl lg:text-4xl",
                      darkMode ? "text-white" : "text-slate-900",
                    ].join(" ")}
                  >
                    Configuración
                  </h1>

                  <p className={["mt-2 max-w-2xl text-sm font-medium leading-6 sm:text-base", mutedText].join(" ")}>
                    Administra la seguridad de tu cuenta y las fotografías de tus jugadores desde un solo lugar.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                <button
                  type="button"
                  onClick={toggleTheme}
                  title={darkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                  aria-label={darkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                  className={[
                    "flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3",
                    "text-sm font-bold transition duration-200",
                    darkMode
                      ? "border-white/10 bg-white/[0.05] text-white hover:bg-white/[0.09]"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
                  ].join(" ")}
                >
                  {darkMode ? <FiSun size={18} color={COLORS.amber} /> : <FiMoon size={18} color={COLORS.violet} />}

                  <span className="hidden xl:inline">{darkMode ? "Claro" : "Oscuro"}</span>
                </button>

                <button
                  type="button"
                  onClick={goBack}
                  title="Volver al portal"
                  className={[
                    "flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 sm:px-4",
                    "text-sm font-bold transition duration-200",
                    darkMode
                      ? "border-white/10 bg-white/[0.05] text-white hover:bg-white/[0.09]"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                  ].join(" ")}
                >
                  <FiArrowLeft size={18} />

                  <span className="hidden sm:inline">Volver</span>
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  title="Cerrar sesión"
                  className={[
                    "flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 sm:px-4",
                    "text-sm font-bold text-white shadow-lg transition duration-200",
                    "hover:-translate-y-0.5",
                  ].join(" ")}
                  style={{
                    background: `linear-gradient(135deg, ${COLORS.coral}, ${COLORS.rose})`,
                  }}
                >
                  <FiLogOut size={18} />

                  <span className="hidden sm:inline">Salir</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* =================================================
            ALERTAS
        ================================================= */}

        {(error || okMsg || pwdRequired) && (
          <div className="mt-5 space-y-3">
            {error && (
              <div
                className={[
                  "flex items-start gap-3 rounded-2xl border p-4 text-sm font-bold",
                  darkMode ? "border-red-400/20 bg-red-400/10 text-red-200" : "border-red-200 bg-red-50 text-red-700",
                ].join(" ")}
              >
                <span className="mt-0.5">❌</span>

                <span>{String(error).startsWith("❌") ? String(error).replace(/^❌\s*/, "") : error}</span>
              </div>
            )}

            {okMsg && (
              <div
                className={[
                  "flex items-start gap-3 rounded-2xl border p-4 text-sm font-bold",
                  darkMode
                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700",
                ].join(" ")}
              >
                <FiCheckCircle className="mt-0.5 shrink-0" size={18} />
                <span>{okMsg}</span>
              </div>
            )}

            {pwdRequired && (
              <div
                className={[
                  "flex items-start gap-3 rounded-2xl border p-4 text-sm font-bold",
                  darkMode
                    ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
                    : "border-amber-200 bg-amber-50 text-amber-800",
                ].join(" ")}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{
                    background: COLORS.amber,
                  }}
                >
                  <FiLock size={17} />
                </span>

                <div>
                  <div className="font-extrabold">Cambio de contraseña requerido</div>

                  <div className={["mt-1 font-medium", darkMode ? "text-amber-100/75" : "text-amber-700"].join(" ")}>
                    Actualiza tu contraseña para poder continuar utilizando las demás funciones del portal.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =================================================
            GRID PRINCIPAL
        ================================================= */}

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          {/* ===============================================
              SEGURIDAD
          =============================================== */}

          <section
            className={[
              "relative overflow-hidden rounded-[28px] border",
              "shadow-[0_18px_55px_rgba(15,23,42,0.08)]",
              surfaceClass,
            ].join(" ")}
          >
            <div
              className="absolute inset-y-0 left-0 w-1.5"
              style={{
                background: `linear-gradient(180deg, ${COLORS.violet}, ${COLORS.coral})`,
              }}
            />

            <div className="p-5 sm:p-6 lg:p-7">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 gap-4">
                  <div
                    className={[
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                      darkMode ? "bg-violet-400/10" : "bg-violet-50",
                    ].join(" ")}
                  >
                    <FiLock size={23} color={COLORS.violet} />
                  </div>

                  <div>
                    <p
                      className={[
                        "text-[11px] font-black uppercase tracking-[0.24em]",
                        darkMode ? "text-violet-300" : "text-violet-600",
                      ].join(" ")}
                    >
                      Seguridad
                    </p>

                    <h2
                      className={[
                        "mt-1 text-xl font-black sm:text-2xl",
                        darkMode ? "text-white" : "text-slate-900",
                      ].join(" ")}
                    >
                      Cambiar contraseña
                    </h2>

                    <p className={["mt-2 text-sm font-medium leading-6", mutedText].join(" ")}>
                      Mantén protegida tu cuenta utilizando una contraseña segura y exclusiva para WELI.
                    </p>
                  </div>
                </div>

                <div className="hidden sm:block">
                  <Pill darkMode={darkMode} tone="violet">
                    <FiShield className="mr-1.5" />
                    Protegido
                  </Pill>
                </div>
              </div>

              <form onSubmit={handleChangePassword} className="mt-6 space-y-4">
                <div>
                  <label
                    className={[
                      "mb-2 block text-xs font-extrabold",
                      darkMode ? "text-slate-300" : "text-slate-600",
                    ].join(" ")}
                  >
                    Contraseña actual
                  </label>

                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                      <FiLock size={16} className={darkMode ? "text-slate-500" : "text-slate-400"} />
                    </div>

                    <input
                      type="password"
                      value={oldPass}
                      onChange={(e) => setOldPass(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      disabled={savingPass}
                      className={[
                        "w-full rounded-2xl border py-3.5 pl-11 pr-4 text-sm font-semibold",
                        "outline-none transition duration-200 focus:ring-4",
                        inputClass,
                        savingPass ? "cursor-not-allowed opacity-60" : "",
                      ].join(" ")}
                    />
                  </div>
                </div>

                <div>
                  <label
                    className={[
                      "mb-2 block text-xs font-extrabold",
                      darkMode ? "text-slate-300" : "text-slate-600",
                    ].join(" ")}
                  >
                    Nueva contraseña
                  </label>

                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                      <FiShield size={16} className={darkMode ? "text-slate-500" : "text-slate-400"} />
                    </div>

                    <input
                      type="password"
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      autoComplete="new-password"
                      disabled={savingPass}
                      minLength={8}
                      className={[
                        "w-full rounded-2xl border py-3.5 pl-11 pr-4 text-sm font-semibold",
                        "outline-none transition duration-200 focus:ring-4",
                        inputClass,
                        savingPass ? "cursor-not-allowed opacity-60" : "",
                      ].join(" ")}
                    />
                  </div>
                </div>

                <div>
                  <label
                    className={[
                      "mb-2 block text-xs font-extrabold",
                      darkMode ? "text-slate-300" : "text-slate-600",
                    ].join(" ")}
                  >
                    Confirmar nueva contraseña
                  </label>

                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                      <FiShield size={16} className={darkMode ? "text-slate-500" : "text-slate-400"} />
                    </div>

                    <input
                      type="password"
                      value={newPass2}
                      onChange={(e) => setNewPass2(e.target.value)}
                      placeholder="Repítela exactamente"
                      autoComplete="new-password"
                      disabled={savingPass}
                      minLength={8}
                      className={[
                        "w-full rounded-2xl border py-3.5 pl-11 pr-4 text-sm font-semibold",
                        "outline-none transition duration-200 focus:ring-4",
                        inputClass,
                        savingPass ? "cursor-not-allowed opacity-60" : "",
                      ].join(" ")}
                    />
                  </div>
                </div>

                <div className={["rounded-2xl border p-4", innerCardClass].join(" ")}>
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{
                        background: darkMode ? "rgba(245,158,11,0.12)" : "#FFFBEB",
                      }}
                    >
                      <FiShield size={17} color={COLORS.amber} />
                    </div>

                    <div>
                      <div
                        className={["text-sm font-extrabold", darkMode ? "text-slate-200" : "text-slate-800"].join(" ")}
                      >
                        Recomendación
                      </div>

                      <p className={["mt-1 text-sm font-medium leading-5", mutedText].join(" ")}>
                        Utiliza una frase que recuerdes fácilmente y combínala con números y símbolos.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingPass}
                  className={[
                    "flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-5",
                    "text-sm font-extrabold text-white shadow-lg transition duration-200",
                    savingPass ? "cursor-not-allowed opacity-60" : "hover:-translate-y-0.5 hover:shadow-xl",
                  ].join(" ")}
                  style={{
                    background: savingPass
                      ? "rgba(100,116,139,0.55)"
                      : `linear-gradient(135deg, ${COLORS.violet}, ${COLORS.coral})`,
                  }}
                >
                  {savingPass ? "Guardando..." : "Actualizar contraseña"}

                  <FiSave size={18} />
                </button>
              </form>
            </div>
          </section>

          {/* ===============================================
              FOTO
          =============================================== */}

          <section
            className={[
              "relative overflow-hidden rounded-[28px] border",
              "shadow-[0_18px_55px_rgba(15,23,42,0.08)]",
              surfaceClass,
            ].join(" ")}
          >
            <div
              className="absolute inset-y-0 left-0 w-1.5"
              style={{
                background: `linear-gradient(180deg, ${COLORS.teal}, ${COLORS.emerald})`,
              }}
            />

            <div className="p-5 sm:p-6 lg:p-7">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 gap-4">
                  <div
                    className={[
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                      darkMode ? "bg-teal-400/10" : "bg-teal-50",
                    ].join(" ")}
                  >
                    <FiCamera size={23} color={COLORS.teal} />
                  </div>

                  <div>
                    <p
                      className={[
                        "text-[11px] font-black uppercase tracking-[0.24em]",
                        darkMode ? "text-teal-300" : "text-teal-600",
                      ].join(" ")}
                    >
                      Perfil deportivo
                    </p>

                    <h2
                      className={[
                        "mt-1 text-xl font-black sm:text-2xl",
                        darkMode ? "text-white" : "text-slate-900",
                      ].join(" ")}
                    >
                      Fotografía del jugador
                    </h2>

                    <p className={["mt-2 text-sm font-medium leading-6", mutedText].join(" ")}>
                      Selecciona uno de tus jugadores y administra su fotografía de perfil.
                    </p>
                  </div>
                </div>

                <div className="hidden sm:block">
                  <Pill darkMode={darkMode} tone="teal">
                    <FiImage className="mr-1.5" />
                    Optimizada
                  </Pill>
                </div>
              </div>

              {/* ===========================================
                  SELECT JUGADOR
              =========================================== */}

              <div className={["mt-6 rounded-2xl border p-4", innerCardClass].join(" ")}>
                <label
                  className={[
                    "mb-2 flex items-center gap-2 text-xs font-extrabold",
                    darkMode ? "text-slate-300" : "text-slate-600",
                  ].join(" ")}
                >
                  <FiUser size={15} color={COLORS.coral} />
                  Jugador
                </label>

                <select
                  value={selectedRutJugador}
                  onChange={(e) => setSelectedRutJugador(e.target.value)}
                  disabled={pwdRequired || !jugadorOptions.length || savingFoto}
                  title={pwdRequired ? "Primero cambia tu contraseña" : undefined}
                  className={[
                    "w-full rounded-2xl border px-4 py-3.5 text-sm font-semibold",
                    "outline-none transition duration-200 focus:ring-4",
                    inputClass,
                    pwdRequired || !jugadorOptions.length || savingFoto ? "cursor-not-allowed opacity-60" : "",
                  ].join(" ")}
                >
                  {!jugadorOptions.length && <option value="">(Sin jugadores asociados)</option>}

                  {jugadorOptions.map((j) => (
                    <option key={j.rut} value={j.rut}>
                      {j.nombre} — {j.rut}
                    </option>
                  ))}
                </select>
              </div>

              {/* ===========================================
                  FOTO / ACCIONES
              =========================================== */}

              <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-[190px_1fr]">
                <div className="flex flex-col items-center">
                  <div
                    className={[
                      "relative h-44 w-44 overflow-hidden rounded-[30px] border-4",
                      "shadow-[0_16px_45px_rgba(15,23,42,0.15)]",
                      darkMode
                        ? "border-[#1f2937] bg-white/[0.05]"
                        : "border-white bg-gradient-to-br from-orange-50 via-violet-50 to-teal-50",
                    ].join(" ")}
                  >
                    {fotoPreviewUrl ? (
                      <img src={fotoPreviewUrl} alt="Foto del jugador" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                        <div
                          className={[
                            "flex h-16 w-16 items-center justify-center rounded-full",
                            darkMode ? "bg-white/[0.07]" : "bg-white shadow-sm",
                          ].join(" ")}
                        >
                          <FiUser size={29} color={darkMode ? "#94A3B8" : COLORS.violet} />
                        </div>

                        <span className={["text-xs font-extrabold", mutedText].join(" ")}>Sin fotografía</span>
                      </div>
                    )}

                    <div
                      className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 text-white shadow-lg"
                      style={{
                        background: COLORS.teal,
                      }}
                    >
                      <FiCamera size={16} />
                    </div>
                  </div>

                  <div className="mt-4 grid w-full max-w-[190px] grid-cols-1 gap-2">
                    <label
                      title={
                        pwdRequired
                          ? "Primero cambia tu contraseña"
                          : !selectedRutJugador
                            ? "Selecciona un jugador"
                            : "Subir foto"
                      }
                      className={[
                        "flex min-h-11 items-center justify-center gap-2 rounded-xl px-3",
                        "text-sm font-extrabold transition duration-200",
                        fotoDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:-translate-y-0.5",
                        darkMode
                          ? "border border-teal-400/20 bg-teal-400/10 text-teal-200"
                          : "border border-teal-200 bg-teal-50 text-teal-700",
                      ].join(" ")}
                    >
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={onPickFoto}
                        disabled={fotoDisabled}
                      />
                      <FiCamera size={17} />
                      Elegir foto
                    </label>

                    <button
                      type="button"
                      onClick={onRemoveFoto}
                      disabled={pwdRequired || !fotoPreviewUrl || savingFoto || !selectedRutJugador}
                      className={[
                        "flex min-h-11 items-center justify-center gap-2 rounded-xl px-3",
                        "text-sm font-extrabold transition duration-200",
                        pwdRequired || !fotoPreviewUrl || savingFoto || !selectedRutJugador
                          ? darkMode
                            ? "cursor-not-allowed bg-white/[0.04] text-white/25"
                            : "cursor-not-allowed bg-slate-100 text-slate-400"
                          : darkMode
                            ? "border border-rose-400/20 bg-rose-400/10 text-rose-200 hover:bg-rose-400/15"
                            : "border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100",
                      ].join(" ")}
                    >
                      <FiTrash2 size={16} />
                      Quitar foto
                    </button>
                  </div>
                </div>

                {/* =========================================
                    INFORMACIÓN
                ========================================= */}

                <div className="space-y-4">
                  <div className={["rounded-2xl border p-4 sm:p-5", innerCardClass].join(" ")}>
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        style={{
                          background: darkMode ? "rgba(139,92,246,0.12)" : "#F5F3FF",
                        }}
                      >
                        <FiImage size={18} color={COLORS.violet} />
                      </div>

                      <div>
                        <h3
                          className={["text-sm font-extrabold", darkMode ? "text-white" : "text-slate-900"].join(" ")}
                        >
                          Imagen optimizada automáticamente
                        </h3>

                        <p className={["mt-1 text-sm font-medium leading-6", softText].join(" ")}>
                          Puedes utilizar imágenes JPG, PNG o WEBP. Antes de enviarla, WELI permite ajustar el encuadre
                          y comprime la fotografía.
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span
                            className={[
                              "rounded-full px-2.5 py-1 text-[11px] font-bold",
                              darkMode ? "bg-white/[0.06] text-slate-300" : "bg-white text-slate-600",
                            ].join(" ")}
                          >
                            512 × 512 px
                          </span>

                          <span
                            className={[
                              "rounded-full px-2.5 py-1 text-[11px] font-bold",
                              darkMode ? "bg-white/[0.06] text-slate-300" : "bg-white text-slate-600",
                            ].join(" ")}
                          >
                            Máx. {FOTO_MAX_UPLOAD_MB} MB
                          </span>

                          <span
                            className={[
                              "rounded-full px-2.5 py-1 text-[11px] font-bold",
                              darkMode ? "bg-white/[0.06] text-slate-300" : "bg-white text-slate-600",
                            ].join(" ")}
                          >
                            Guardado aprox. {FOTO_MAX_STORED_KB} KB
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {fotoError && (
                    <div
                      className={[
                        "rounded-2xl border p-4 text-sm font-bold",
                        darkMode
                          ? "border-red-400/20 bg-red-400/10 text-red-200"
                          : "border-red-200 bg-red-50 text-red-700",
                      ].join(" ")}
                    >
                      ❌ {fotoError}
                    </div>
                  )}

                  {fotoOk && (
                    <div
                      className={[
                        "flex items-start gap-2 rounded-2xl border p-4 text-sm font-bold",
                        darkMode
                          ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700",
                      ].join(" ")}
                    >
                      <FiCheckCircle size={18} className="mt-0.5 shrink-0" />

                      <span>{fotoOk}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* =================================================
            PIE VISUAL
        ================================================= */}

        <div
          className={[
            "mt-6 rounded-2xl border px-4 py-3 text-center text-xs font-medium",
            darkMode
              ? "border-white/[0.06] bg-white/[0.025] text-slate-500"
              : "border-orange-100 bg-white/60 text-slate-500",
          ].join(" ")}
        >
          Tus preferencias y datos se administran de forma segura dentro de tu sesión de WELI.
        </div>
      </div>

      {/* ===================================================
          MODAL RECORTE
      =================================================== */}

      {cropOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-5">
          <div
            className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
            onClick={() => !savingFoto && setCropOpen(false)}
          />

          <div
            className={[
              "relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border",
              "shadow-[0_30px_100px_rgba(0,0,0,0.45)]",
              darkMode ? "border-white/10 bg-[#111827]" : "border-white bg-white",
            ].join(" ")}
          >
            <div
              className="h-1.5 shrink-0"
              style={{
                background: `linear-gradient(90deg, ${COLORS.coral}, ${COLORS.violet}, ${COLORS.teal})`,
              }}
            />

            <div className="flex shrink-0 items-center justify-between gap-4 p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div
                  className={[
                    "flex h-10 w-10 items-center justify-center rounded-xl",
                    darkMode ? "bg-violet-400/10" : "bg-violet-50",
                  ].join(" ")}
                >
                  <FiCamera size={19} color={COLORS.violet} />
                </div>

                <div>
                  <h3 className={["font-black", darkMode ? "text-white" : "text-slate-900"].join(" ")}>
                    Ajustar fotografía
                  </h3>

                  <p className={`mt-0.5 text-xs font-medium ${mutedText}`}>Mueve la imagen y ajusta el zoom.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCropOpen(false)}
                disabled={savingFoto}
                className={[
                  "rounded-xl border px-3 py-2 text-sm font-bold transition",
                  darkMode
                    ? "border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
                  savingFoto ? "cursor-not-allowed opacity-50" : "",
                ].join(" ")}
              >
                Cerrar
              </button>
            </div>

            <div className="relative h-[330px] w-full bg-black sm:h-[400px]">
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

            <div
              className={["shrink-0 border-t p-4 sm:p-5", darkMode ? "border-white/[0.07]" : "border-slate-100"].join(
                " "
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={["w-12 text-xs font-extrabold", darkMode ? "text-slate-300" : "text-slate-600"].join(" ")}
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
                  disabled={savingFoto}
                  className="w-full accent-violet-500"
                />

                <span className={["w-12 text-right text-xs font-bold", mutedText].join(" ")}>{zoom.toFixed(1)}×</span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:justify-end">
                <button
                  type="button"
                  onClick={() => setCropOpen(false)}
                  disabled={savingFoto}
                  className={[
                    "min-h-11 rounded-xl border px-5 text-sm font-bold transition",
                    darkMode
                      ? "border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    savingFoto ? "cursor-not-allowed opacity-50" : "",
                  ].join(" ")}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleSaveFoto}
                  disabled={savingFoto}
                  className={[
                    "flex min-h-11 items-center justify-center gap-2 rounded-xl px-5",
                    "text-sm font-extrabold text-white shadow-lg transition",
                    savingFoto ? "cursor-not-allowed opacity-60" : "hover:-translate-y-0.5",
                  ].join(" ")}
                  style={{
                    background: savingFoto
                      ? "rgba(100,116,139,0.6)"
                      : `linear-gradient(135deg, ${COLORS.violet}, ${COLORS.coral})`,
                  }}
                >
                  {savingFoto ? "Guardando..." : "Guardar fotografía"}

                  <FiSave size={17} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
