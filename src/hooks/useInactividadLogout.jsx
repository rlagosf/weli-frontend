// src/hooks/useInactividadLogout.jsx

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { getToken, clearToken } from "../services/api";

const USER_INFO_KEY = "weli_user_info";

function getUserModeFromToken(token) {
  try {
    const decoded = jwtDecode(token);
    const type = String(decoded?.type ?? decoded?.user?.type ?? "").trim().toLowerCase();

    return type === "apoderado" ? "apoderado" : "admin";
  } catch {
    return "admin";
  }
}

export default function useInactividadLogout({
  timeoutMs = 5 * 60 * 1000,
  pingMs = 15 * 1000,
  storageKey = "weli_lastActivity",
  forceKey = "weli_forceLogout",
  redirectTo,
  redirectAdminTo = "/login",
  redirectApoderadoTo = "/login-apoderado",
} = {}) {
  const navigate = useNavigate();

  const timerRef = useRef(null);
  const bcRef = useRef(null);
  const lastSetRef = useRef(0);
  const loggingOutRef = useRef(false);

  /* ───────────────────────── Activity ───────────────────────── */

  const markActivity = (timestamp = Date.now()) => {
    if (!getToken()) return;

    if (timestamp - lastSetRef.current < 800) {
      return;
    }

    lastSetRef.current = timestamp;

    try {
      localStorage.setItem(storageKey, String(timestamp));
    } catch {}
  };

  /* ───────────────────────── Logout helpers ───────────────────────── */

  const getRedirectBeforeLogout = () => {
    if (redirectTo) return redirectTo;

    const token = getToken();

    if (!token) {
      return redirectAdminTo;
    }

    return getUserModeFromToken(token) === "apoderado"
      ? redirectApoderadoTo
      : redirectAdminTo;
  };

  const clearLocalSession = () => {
    try {
      clearToken();
    } catch {}

    try {
      localStorage.removeItem(USER_INFO_KEY);
      localStorage.removeItem("apoderado_must_change_password");
      localStorage.removeItem(storageKey);
    } catch {}
  };

  /**
   * Ejecuta el logout local.
   *
   * broadcast=true:
   * comunica logout a otras pestañas.
   *
   * broadcast=false:
   * logout recibido desde otra pestaña;
   * no vuelve a emitir para evitar loops.
   */
  const doLogout = ({ broadcast = false } = {}) => {
    if (loggingOutRef.current) return;

    loggingOutRef.current = true;

    /*
     * Resolver destino ANTES de eliminar el JWT.
     */
    const destination = getRedirectBeforeLogout();

    clearLocalSession();

    if (broadcast) {
      /*
       * Storage event para pestañas que no soporten
       * BroadcastChannel.
       */
      try {
        localStorage.setItem(forceKey, String(Date.now()));
      } catch {}

      /*
       * Canal moderno entre pestañas.
       */
      try {
        bcRef.current?.postMessage("forceLogout");
      } catch {}
    }

    try {
      navigate(destination, { replace: true });
    } catch {
      window.location.replace(destination);
    }
  };

  /* ───────────────────────── Inactivity ───────────────────────── */

  const checkInactivity = () => {
    const token = getToken();

    if (!token || loggingOutRef.current) {
      return;
    }

    let lastActivity = 0;

    try {
      lastActivity = Number(localStorage.getItem(storageKey) || "0");
    } catch {
      lastActivity = 0;
    }

    const now = Date.now();

    if (!Number.isFinite(lastActivity) || lastActivity <= 0) {
      markActivity(now);
      return;
    }

    if (now - lastActivity >= timeoutMs) {
      doLogout({ broadcast: true });
    }
  };

  /* ───────────────────────── Lifecycle ───────────────────────── */

  useEffect(() => {
    loggingOutRef.current = false;

    /*
     * Al montar una zona privada con token válido,
     * comenzamos una nueva ventana de actividad.
     *
     * Esto evita que una marca antigua provoque
     * logout instantáneo después de iniciar sesión.
     */
    if (getToken()) {
      markActivity(Date.now());
    }

    const doc = document;
    const passive = { passive: true };

    const onActivity = () => markActivity(Date.now());

    /*
     * Actividad humana.
     *
     * No usamos requests HTTP como actividad porque
     * polling/background requests no deberían mantener
     * una sesión viva indefinidamente.
     */
    doc.addEventListener("click", onActivity, passive);
    doc.addEventListener("keydown", onActivity);
    doc.addEventListener("pointerdown", onActivity, passive);
    doc.addEventListener("pointermove", onActivity, passive);
    doc.addEventListener("touchstart", onActivity, passive);
    doc.addEventListener("scroll", onActivity, true);

    window.addEventListener("mousemove", onActivity, passive);
    window.addEventListener("wheel", onActivity, passive);

    const onVisibilityChange = () => {
      if (!doc.hidden) markActivity(Date.now());
    };

    const onFocus = () => {
      markActivity(Date.now());
    };

    doc.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    /* ───────── Cross-tab: localStorage ───────── */

    const onStorage = (event) => {
      if (event.key === forceKey && event.newValue) {
        doLogout({ broadcast: false });
      }

      /*
       * Si otra pestaña registra actividad,
       * no hace falta reescribir storage:
       * todas comparten el mismo localStorage.
       */
    };

    window.addEventListener("storage", onStorage);

    /* ───────── Cross-tab: BroadcastChannel ───────── */

    try {
      bcRef.current = new BroadcastChannel(`weli_bc_${forceKey}`);

      bcRef.current.onmessage = (event) => {
        if (event?.data === "forceLogout") {
          doLogout({ broadcast: false });
        }
      };
    } catch {
      bcRef.current = null;
    }

    /* ───────── Timer ───────── */

    timerRef.current = window.setInterval(checkInactivity, pingMs);

    /*
     * No llamamos a logout inmediatamente:
     * markActivity() acaba de inicializar la sesión actual.
     */
    checkInactivity();

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }

      doc.removeEventListener("click", onActivity);
      doc.removeEventListener("keydown", onActivity);
      doc.removeEventListener("pointerdown", onActivity);
      doc.removeEventListener("pointermove", onActivity);
      doc.removeEventListener("touchstart", onActivity);
      doc.removeEventListener("scroll", onActivity, true);
      doc.removeEventListener("visibilitychange", onVisibilityChange);

      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("wheel", onActivity);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);

      if (bcRef.current) {
        try {
          bcRef.current.close();
        } catch {}

        bcRef.current = null;
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    timeoutMs,
    pingMs,
    storageKey,
    forceKey,
    redirectTo,
    redirectAdminTo,
    redirectApoderadoTo,
  ]);

  /* ───────────────────────── Public API ───────────────────────── */

  const forceLogout = () => {
    doLogout({ broadcast: true });
  };

  const markActivityNow = () => {
    markActivity(Date.now());
  };

  return {
    forceLogout,
    markActivityNow,
  };
}