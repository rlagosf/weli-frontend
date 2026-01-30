// src/hooks/useInactividadLogout.jsx
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api, { getToken, clearToken } from "../services/api";

/** Decode liviano (sin dependencia extra) */
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

function getUserModeFromToken(token) {
  const decoded = decodeJwt(token);
  const type = String(decoded?.type ?? "").toLowerCase();
  return type === "apoderado" ? "apoderado" : "admin";
}

export default function useInactividadLogout({
  timeoutMs = 5 * 60 * 1000,
  pingMs = 15 * 1000,

  // ✅ WELI keys
  storageKey = "weli_lastActivity",
  forceKey = "weli_forceLogout",

  // ✅ Rutas por tipo de usuario
  redirectAdminTo = "/login",
  redirectApoderadoTo = "/login-apoderado",
} = {}) {
  const navigate = useNavigate();

  const timerRef = useRef(null);
  const bcRef = useRef(null);
  const lastSetRef = useRef(0);

  const markActivity = (ts = Date.now()) => {
    if (ts - lastSetRef.current < 800) return;
    lastSetRef.current = ts;
    try {
      localStorage.setItem(storageKey, String(ts));
    } catch {}
  };

  const resolveRedirect = () => {
    const token = getToken();
    if (!token) return redirectAdminTo;
    return getUserModeFromToken(token) === "apoderado"
      ? redirectApoderadoTo
      : redirectAdminTo;
  };

  const doLogoutEverywhere = () => {
    clearToken();

    try {
      localStorage.setItem(forceKey, String(Date.now()));
    } catch {}

    const to = resolveRedirect();

    try {
      navigate(to, { replace: true });
    } catch {
      window.location.href = to;
    }
  };

  const checkInactivity = () => {
    const token = getToken();
    if (!token) return;

    let last = 0;
    try {
      last = Number(localStorage.getItem(storageKey) || "0");
    } catch {
      last = 0;
    }

    const now = Date.now();

    if (!last) {
      markActivity(now);
      return;
    }

    if (now - last >= timeoutMs) doLogoutEverywhere();
  };

  useEffect(() => {
    if (getToken()) markActivity();

    // Requests cuentan como actividad (solo si hay token)
    const interceptorId = api.interceptors.request.use((cfg) => {
      if (getToken()) markActivity();
      return cfg;
    });

    const onAnyActivity = () => markActivity();
    const optsPassive = { passive: true };
    const doc = document;

    doc.addEventListener("click", onAnyActivity, optsPassive);
    doc.addEventListener("keydown", onAnyActivity, optsPassive);
    doc.addEventListener("pointerdown", onAnyActivity, optsPassive);
    doc.addEventListener("pointermove", onAnyActivity, optsPassive);
    doc.addEventListener("touchstart", onAnyActivity, optsPassive);
    doc.addEventListener("touchmove", onAnyActivity, optsPassive);
    window.addEventListener("mousemove", onAnyActivity, optsPassive);
    window.addEventListener("wheel", onAnyActivity, optsPassive);

    const onScrollCapture = () => markActivity();
    doc.addEventListener("scroll", onScrollCapture, true);

    const onVis = () => {
      if (!doc.hidden) markActivity();
    };
    doc.addEventListener("visibilitychange", onVis);

    const onFocus = () => markActivity();
    window.addEventListener("focus", onFocus);

    // Cross-tab logout via storage
    const onStorage = (e) => {
      if (e.key === forceKey && e.newValue) doLogoutEverywhere();
    };
    window.addEventListener("storage", onStorage);

    // BroadcastChannel
    try {
      const channelName = `weli_bc_${forceKey}`;
      bcRef.current = new BroadcastChannel(channelName);
      bcRef.current.onmessage = (msg) => {
        if (msg?.data === "forceLogout") doLogoutEverywhere();
        if (msg?.data === "activityPing") markActivity();
      };
    } catch {
      bcRef.current = null;
    }

    timerRef.current = setInterval(checkInactivity, pingMs);
    checkInactivity();

    return () => {
      try { clearInterval(timerRef.current); } catch {}
      try { api.interceptors.request.eject(interceptorId); } catch {}
      try { window.removeEventListener("storage", onStorage); } catch {}

      try {
        doc.removeEventListener("click", onAnyActivity, optsPassive);
        doc.removeEventListener("keydown", onAnyActivity, optsPassive);
        doc.removeEventListener("pointerdown", onAnyActivity, optsPassive);
        doc.removeEventListener("pointermove", onAnyActivity, optsPassive);
        doc.removeEventListener("touchstart", onAnyActivity, optsPassive);
        doc.removeEventListener("touchmove", onAnyActivity, optsPassive);
        doc.removeEventListener("scroll", onScrollCapture, true);
        doc.removeEventListener("visibilitychange", onVis);
      } catch {}

      try { window.removeEventListener("mousemove", onAnyActivity, optsPassive); } catch {}
      try { window.removeEventListener("wheel", onAnyActivity, optsPassive); } catch {}
      try { window.removeEventListener("focus", onFocus); } catch {}

      if (bcRef.current) {
        try { bcRef.current.close(); } catch {}
        bcRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeoutMs, pingMs, storageKey, forceKey, redirectAdminTo, redirectApoderadoTo]);

  const forceLogout = () => {
    try {
      bcRef.current?.postMessage("forceLogout");
    } catch {}
    doLogoutEverywhere();
  };

  return { forceLogout, markActivityNow: () => markActivity() };
}
