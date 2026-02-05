// src/components/Footer.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link as ScrollLink } from "react-scroll";
import { Link as RouterLink } from "react-router-dom";

import logoWeli from "../statics/logo/logo-weli-blanco.png";
import logoAdmin from "../statics/logo/logo-w-blanco.png";
import logoApoderado from "../statics/logo/logo-w-cafe.png";

const NAV_LINKS = [
  { name: "Inicio", target: "inicio" },
  { name: "Nosotros", target: "nosotros" },
  { name: "Servicios", target: "servicios" },
  { name: "Ubicación", target: "ubicacion" },
  { name: "Contacto", target: "contacto" },
];

export default function Footer() {
  const year = useMemo(() => new Date().getFullYear(), []);

  const rootRef = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.12, rootMargin: "-8% 0px -8% 0px" }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ✅ mismo “socialBase” del Navbar
  const socialBase =
    "text-white/90 transition-transform duration-150 hover:-translate-y-[1px] active:translate-y-0";

  return (
    <footer
      ref={rootRef}
      className={[
        "text-white py-10 font-sans",
        // ✅ animación barata SIN transform (evita scroll paralelo)
        "transition-opacity duration-500 ease-out",
        inView ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
      ].join(" ")}
    >
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between gap-10 md:gap-12 md:items-start">
          {/* Marca */}
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-4">
              <ScrollLink
                to="inicio"
                smooth
                duration={600}
                offset={-64}
                className="cursor-pointer"
              >
                <img
                  src={logoWeli}
                  alt="Logo WELI"
                  className="w-20 h-20 md:w-24 md:h-24 object-contain -mt-2"
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              </ScrollLink>

              <p className="text-sm text-white/70 leading-relaxed max-w-xs">
                Gestión deportiva inteligente: centraliza jugadores, pagos,
                comunicación y estadísticas en una sola plataforma.
              </p>
            </div>

            <div className="mt-4">
              <ScrollLink
                to="contacto"
                smooth
                duration={600}
                offset={-64}
                className="
                  cursor-pointer inline-flex items-center rounded-xl px-4 py-2
                  bg-ra-cream text-black text-sm font-semibold
                  hover:bg-ra-sand transition-colors duration-150
                "
              >
                Solicitar demo
              </ScrollLink>
            </div>
          </div>

          {/* Navegación */}
          <div className="flex flex-col items-start">
            <p className="text-sm font-semibold tracking-wide">Navegación</p>

            <div className="mt-3 flex flex-col gap-2">
              {NAV_LINKS.map(({ name, target }) => (
                <ScrollLink
                  key={target}
                  to={target}
                  smooth
                  duration={600}
                  offset={-64}
                  className="
                    block cursor-pointer text-sm text-white/70
                    hover:text-ra-sand transition-colors duration-150
                  "
                >
                  {name}
                </ScrollLink>
              ))}
            </div>
          </div>

          {/* Accesos */}
          <div className="flex flex-col items-start w-full md:w-auto">
            <div className="w-full md:w-64">
              <p className="text-sm font-semibold tracking-wide text-center">
                Accesos
              </p>

              <div className="mt-3 space-y-3">
                <RouterLink
                  to="/login"
                  className="
                    flex items-center gap-3 rounded-xl
                    border border-white/10 bg-white/5
                    px-4 py-3 text-sm
                    hover:bg-white/10 hover:border-ra-fucsia/30
                    transition-colors duration-150
                  "
                >
                  <img
                    src={logoAdmin}
                    alt="Panel Administración"
                    className="w-6 h-6 object-contain"
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                  <span className="text-white/90">Panel Administración</span>
                </RouterLink>

                <RouterLink
                  to="/login-apoderado"
                  className="
                    flex items-center gap-3 rounded-xl
                    border border-white/10 bg-white/5
                    px-4 py-3 text-sm
                    hover:bg-white/10 hover:border-ra-fucsia/30
                    transition-colors duration-150
                  "
                >
                  <img
                    src={logoApoderado}
                    alt="Portal Apoderados"
                    className="w-6 h-6 object-contain"
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                  <span className="text-white/90">Portal Apoderados</span>
                </RouterLink>
              </div>
            </div>
          </div>

          {/* Contacto */}
          <div className="flex flex-col items-start">
            <p className="text-sm font-semibold tracking-wide">Contacto</p>

            <div className="mt-3 flex items-center gap-5 text-2xl">
              <a
                href="https://wa.me/56958066120"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className={`${socialBase} hover:text-green-400`}
                title="WhatsApp"
              >
                <i className="fab fa-whatsapp" />
              </a>

              <a
                href="https://www.facebook.com/profile.php?id=61568512375165"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className={`${socialBase} hover:text-blue-500`}
                title="Facebook"
              >
                <i className="fab fa-facebook-f" />
              </a>

              <a
                href="https://www.instagram.com/realacademyf.c"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className={`${socialBase} hover:text-pink-400`}
                title="Instagram"
              >
                <i className="fab fa-instagram" />
              </a>

              <a
                href="https://www.linkedin.com/in/rodrigo-lagos-fernandez-403a33173/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className={`${socialBase} hover:text-blue-300`}
                title="LinkedIn"
              >
                <i className="fab fa-linkedin-in" />
              </a>
            </div>
          </div>
        </div>

        {/* Barra inferior */}
        <div className="mt-10 pt-6 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-xs text-white/60 text-center md:text-left">
            © {year} WELI. Todos los derechos reservados.
          </p>

          <div className="flex items-center gap-4">
            <RouterLink
              to="/privacidad"
              className="text-xs text-white/60 hover:text-ra-cream transition-colors duration-150"
            >
              Privacidad
            </RouterLink>
            <RouterLink
              to="/terminos"
              className="text-xs text-white/60 hover:text-ra-cream transition-colors duration-150"
            >
              Términos
            </RouterLink>
          </div>
        </div>
      </div>
    </footer>
  );
}
