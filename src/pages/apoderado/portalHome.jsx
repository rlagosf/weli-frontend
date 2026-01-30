// src/pages/apoderado/portalHome.jsx
import CambiarClaveApoderado from "./cambiarClave";

const ACCENT = "#e82d89";

export default function PortalHome() {
  return (
    <div className="min-h-screen font-sans antialiased text-[#1a1a1a] bg-[#e9eaec]">
      {/* Textura / brillo suave tipo afiche */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[980px] h-[980px] rounded-full blur-3xl opacity-60"
          style={{
            background: `radial-gradient(circle, rgba(232,45,137,0.30), transparent 60%)`,
          }}
        />
        <div
          className="absolute -bottom-56 right-[-180px] w-[900px] h-[900px] rounded-full blur-3xl opacity-50"
          style={{
            background: "radial-gradient(circle, rgba(0,0,0,0.08), transparent 60%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(0,0,0,0.08) 0px, rgba(0,0,0,0.08) 1px, transparent 1px, transparent 18px)",
          }}
        />
      </div>

      {/* Contenido centrado */}
      <section className="min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-5xl">
          {/* Tarjeta principal */}
          <div className="rounded-[28px] border border-black/10 bg-[#f2f2f3] shadow-[0_20px_70px_rgba(0,0,0,0.10)] overflow-hidden">
            {/* Header */}
            <div className="px-6 sm:px-10 py-6 border-b border-black/10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black tracking-[0.35em] uppercase text-black/60">
                    Seguridad
                  </p>
                  <h2 className="mt-1 text-xl sm:text-2xl font-extrabold uppercase tracking-widest text-black">
                    Cambiar contraseña
                  </h2>
                </div>

                {/* Leyenda + logo (esquina derecha) */}
                <div className="hidden sm:flex items-center gap-3">
                  <div className="text-right leading-tight">
                    <p
                      className="text-xs font-black tracking-[0.35em] uppercase"
                      style={{ color: ACCENT }}
                    >
                      Portal
                    </p>
                    <p className="text-xs font-semibold text-black/60">
                      Acceso apoderados
                    </p>
                  </div>

                  <img
                    src="/LOGO_SIN_FONDO_ROSA.png"
                    alt="Portal"
                    className="w-11 h-11 object-contain drop-shadow-[0_0_18px_rgba(232,45,137,0.45)]"
                  />
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 sm:px-10 py-10">
              {/* Título + subtítulo centrados (dentro de la tarjeta) */}
              <div className="text-center mb-8">
                <h1
                  className="text-4xl sm:text-5xl font-extrabold tracking-widest uppercase"
                  style={{ color: ACCENT }}
                >
                  Portal Apoderados
                </h1>
                <p className="mt-1 text-sm sm:text-base font-semibold text-black/70">
                  Antes de continuar, necesitas asignar una nueva contraseña a tu portal.
                </p>
              </div>

              {/* Form */}
              <div className="flex justify-center">
                <CambiarClaveApoderado />
              </div>
            </div>

            {/* Footer Tip */}
            <div className="px-6 sm:px-10 py-6 border-t border-black/10 bg-[#f6f6f7]">
              <p className="text-center text-xs font-semibold text-black/60">
                Tip: Usa una clave segura (mín. 8), que incluya símbolos, números y letras mayúsculas.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
