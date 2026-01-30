// src/components/isLoading.jsx
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../context/ThemeContext";

export default function IsLoading() {
  const { darkMode } = useTheme();
  const [fade, setFade] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => setFade((p) => !p), 700);
    return () => clearInterval(t);
  }, []);

  const rosa = "#e82d89";
  const backgroundColor = darkMode ? "#111111" : "#f5f5f5";
  const track = darkMode ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)";
  const textColor = darkMode ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.75)";

  if (!mounted) return null;

  const ui = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 999999, // bien arriba, sin pelear con nada
      }}
    >
      <style>{`
        @keyframes rafc-indeterminate {
          0%   { transform: translateX(-70%) }
          50%  { transform: translateX(10%) }
          100% { transform: translateX(140%) }
        }
        @keyframes rafc-shimmer {
          0%   { opacity: .65 }
          50%  { opacity: 1 }
          100% { opacity: .65 }
        }
      `}</style>

      <img
        src="/LOGO_SIN_FONDO_ROSA.png"
        alt="Cargando..."
        style={{
          width: "150px",
          height: "auto",
          opacity: fade ? 1 : 0,
          transition: "opacity 0.7s ease-in-out",
          filter: "drop-shadow(0 0 18px rgba(232,45,137,0.35))",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />

      <p
        style={{
          marginTop: 16,
          color: textColor,
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: "0.02em",
          textAlign: "center",
        }}
      >
        Espere un momento por favor
      </p>

      <div
        role="progressbar"
        aria-label="Cargando"
        aria-busy="true"
        style={{
          marginTop: 18,
          width: 320,
          height: 10,
          backgroundColor: track,
          borderRadius: 999,
          overflow: "hidden",
          position: "relative",
          boxShadow: "0 0 0 1px rgba(232,45,137,0.22) inset",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: "55%",
            background: `linear-gradient(90deg,
              rgba(232,45,137,0) 0%,
              ${rosa} 35%,
              rgba(232,45,137,0.35) 60%,
              ${rosa} 85%,
              rgba(232,45,137,0) 100%
            )`,
            animation: "rafc-indeterminate 1.1s ease-in-out infinite",
            boxShadow: "0 0 18px rgba(232,45,137,0.55)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0))",
            animation: "rafc-shimmer 1.4s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );

  // ✅ Esto lo saca del “encapsulado” por transforms
  return createPortal(ui, document.body);
}
