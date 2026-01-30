// src/components/BotonCerrarSesion.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { getToken, clearToken } from "../services/api";

function decodeJwt(token) {
  try {
    const [, payload] = String(token).split(".");
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default function BotonCerrarSesion() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const cerrarSesion = async () => {
    if (busy) return;
    setBusy(true);

    const token = getToken();

    try {
      if (token) {
        const payload = decodeJwt(token);
        const type = String(payload?.type || "").toLowerCase();

        if (type === "apoderado") {
          await api.post("/auth-apoderado/logout", null);
        } else {
          // panel/admin/staff (o desconocido → intentamos panel)
          await api.post("/auth/logout", null);
        }
      }
    } catch {
      // logout no bloquea cierre local
    } finally {
      clearToken();
      try {
        localStorage.removeItem("user_info");
        localStorage.removeItem("apoderado_must_change_password");
      } catch {}
      setBusy(false);
      navigate("/login", { replace: true });
    }
  };

  return (
    <button
      type="button"
      onClick={cerrarSesion}
      disabled={busy}
      className={`bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 ${
        busy ? "opacity-70 cursor-not-allowed" : ""
      }`}
      title="Cerrar sesión"
      aria-busy={busy}
    >
      {busy ? "Cerrando…" : "Cerrar Sesión"}
    </button>
  );
}
