// src/pages/apoderado/cambiarClave.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { getToken, clearToken } from "../../services/api";

export default function CambiarClaveApoderado() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    current_password: "",
    new_password: "",
    confirm: "",
  });

  const [mensaje, setMensaje] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const onChange = (e) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    // limpieza inmediata de feedback al escribir
    if (mensaje) setMensaje("");
  };

  // ✅ error normalizado (mismo criterio que en admin)
  const getErrStatus = (err) => err?.status ?? err?.response?.status ?? 0;
  const getErrData = (err) => err?.data ?? err?.response?.data ?? null;

  const handleAuth = () => {
    clearToken();
    navigate("/login-apoderado", { replace: true });
  };

  const prettyError = (err) => {
    const st = getErrStatus(err);
    const data = getErrData(err);

    const backendMsg =
      data?.message || data?.detail || data?.error || err?.message || null;

    if (st === 401 || st === 403) {
      return "❌ Clave actual incorrecta o sesión inválida.";
    }

    if (st === 400) {
      return backendMsg || "❌ Datos inválidos. Revisa tu nueva clave.";
    }

    return `❌ ${backendMsg || "Ocurrió un error inesperado."}`;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;

    setMensaje("");

    // Validaciones frontend
    if (!form.current_password || form.new_password.length < 8) {
      setMensaje("❌ La nueva clave debe tener al menos 8 caracteres.");
      return;
    }
    if (form.new_password !== form.confirm) {
      setMensaje("❌ La confirmación no coincide.");
      return;
    }

    // ✅ Tema token: sin hardcodear llaves antiguas
    const token = getToken();
    if (!token) {
      setMensaje("❌ Sesión no válida. Vuelve a iniciar sesión.");
      return handleAuth();
    }

    setIsLoading(true);
    try {
      await api.post("/auth-apoderado/change-password", {
        current_password: form.current_password,
        new_password: form.new_password,
      });

      // Limpia flag si existe
      try {
        localStorage.removeItem("apoderado_must_change_password");
      } catch {}

      setMensaje("✅ Contraseña actualizada. Entrando al portal...");
      navigate("/portal-apoderado", { replace: true });
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setMensaje(prettyError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const input =
    "w-full rounded-2xl px-4 py-3 border border-black/10 bg-[#fbfbfc] " +
    "focus:outline-none focus:ring-2 focus:ring-[#e82d89]/40";

  return (
    <div className="max-w-md">
      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <div>
          <label className="text-xs font-black tracking-[0.35em] uppercase text-black/60">
            Contraseña actual
          </label>
          <input
            name="current_password"
            type="password"
            className={input}
            value={form.current_password}
            onChange={onChange}
            disabled={isLoading}
            required
            autoComplete="current-password"
          />
        </div>

        <div>
          <label className="text-xs font-black tracking-[0.35em] uppercase text-black/60">
            Nueva contraseña (mín. 8)
          </label>
          <input
            name="new_password"
            type="password"
            className={input}
            value={form.new_password}
            onChange={onChange}
            disabled={isLoading}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <div>
          <label className="text-xs font-black tracking-[0.35em] uppercase text-black/60">
            Confirmar nueva contraseña
          </label>
          <input
            name="confirm"
            type="password"
            className={input}
            value={form.confirm}
            onChange={onChange}
            disabled={isLoading}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className={`w-full rounded-2xl py-3 font-extrabold uppercase tracking-widest text-white transition
            ${isLoading ? "bg-black/30 cursor-not-allowed" : "bg-[#e82d89] hover:bg-[#c61f74]"}`}
        >
          {isLoading ? "Guardando..." : "Guardar nueva clave"}
        </button>

        {mensaje && (
          <p
            className={`text-sm font-extrabold ${
              mensaje.startsWith("✅") ? "text-green-700" : "text-red-700"
            }`}
          >
            {mensaje}
          </p>
        )}
      </form>
    </div>
  );
}
