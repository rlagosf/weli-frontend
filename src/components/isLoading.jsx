// src/components/isLoading.jsx
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../context/ThemeContext";

// ✅ Logo WELI (desde /src/statics/logo)
import logoOficial from "../statics/logo/logo-oficial.png";

export default function IsLoading() {
  const { darkMode } = useTheme();
  const [fade, setFade] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => setFade((p) => !p), 700);
    return () => clearInterval(t);
  }, []);

  // 🎨 Paleta WELI (hex directos para estilos inline)
  const weliCopper = "#aa5013";     // ra.fucsia (acento cobre)
  const weliTerracotta = "#e2773b"; // ra.terracotta
  const weliSand = "#ffdda1";       // ra.sand
  const weliCream = "#e8dac4";      // ra.cream

  // Fondo/track según modo, pero coherente con WELI
  const backgroundColor = darkMode ? "#0f0b06" : weliCream;
  const track = darkMode ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)";
  const textColor = darkMode ? "rgba(255,255,255,0.86)" : "rgba(0,0,0,0.72)";

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
        zIndex: 999999,
      }}
    >
      <style>{`
        @keyframes weli-indeterminate {
          0%   { transform: translateX(-70%) }
          50%  { transform: translateX(10%) }
          100% { transform: translateX(140%) }
        }
        @keyframes weli-shimmer {
          0%   { opacity: .65 }
          50%  { opacity: 1 }
          100% { opacity: .65 }
        }
      `}</style>

      <img
        src={logoOficial}
        alt="Cargando..."
        style={{
          width: "160px",
          height: "auto",
          opacity: fade ? 1 : 0,
          transition: "opacity 0.7s ease-in-out",
          filter: darkMode
            ? "drop-shadow(0 0 18px rgba(170,80,19,0.30))"
            : "drop-shadow(0 0 14px rgba(109,88,41,0.18))",
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
          boxShadow: `0 0 0 1px rgba(170,80,19,0.20) inset`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: "55%",
            background: `linear-gradient(90deg,
              rgba(170,80,19,0) 0%,
              ${weliCopper} 28%,
              rgba(226,119,59,0.55) 52%,
              ${weliTerracotta} 68%,
              ${weliSand} 82%,
              rgba(170,80,19,0) 100%
            )`,
            animation: "weli-indeterminate 1.1s ease-in-out infinite",
            boxShadow: darkMode
              ? "0 0 16px rgba(170,80,19,0.45)"
              : "0 0 12px rgba(109,88,41,0.22)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: darkMode
              ? "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0))"
              : "linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0))",
            animation: "weli-shimmer 1.4s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );

  return createPortal(ui, document.body);
}
