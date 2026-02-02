// src/components/Footer.jsx
import React from "react";
import { Link as ScrollLink } from "react-scroll";
import { Link as RouterLink } from "react-router-dom";

import logoWeli from "../statics/logo/logo-weli-blanco.png"; // ajusta ruta si corresponde

export default function Footer() {
  const year = new Date().getFullYear();

  const navLinks = [
    { name: "Inicio", target: "inicio" },
    { name: "Nosotros", target: "nosotros" },
    { name: "Servicios", target: "servicios" },
    { name: "Ubicación", target: "ubicacion" },
    { name: "Contacto", target: "contacto" },
  ];

  const ADMIN_ICON = "/LOGO_SIN_FONDO_ROSA.png";
  const APODERADO_ICON = "/logo-en-blanco.png";

  return (
    <footer className="text-white py-10 font-sans">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between gap-10 md:gap-12 md:items-start">
          {/* Marca */}
          <div className="flex flex-col items-start">
            <ScrollLink
              to="inicio"
              smooth={true}
              duration={600}
              offset={-64}
              className="cursor-pointer"
            >
              {/* ✅ Logo más grande */}
              <img
                src={logoWeli}
                alt="Logo WELI"
                className="w-20 h-20 md:w-24 md:h-24 object-contain -mt-9"
              />

            </ScrollLink>

            <p className="mt-2 text-sm text-white/70">
              Gestión deportiva inteligente
            </p>

            <p className="mt-3 text-sm text-white/70 leading-relaxed max-w-sm">
              Centraliza jugadores, pagos, comunicación y estadísticas en una
              sola plataforma.
            </p>

            <div className="mt-4">
              <ScrollLink
                to="contacto"
                smooth={true}
                duration={600}
                offset={-64}
                className="cursor-pointer inline-flex items-center rounded-xl px-4 py-2 bg-white/90 text-black text-sm font-semibold hover:bg-white transition"
              >
                Solicitar demo
              </ScrollLink>
            </div>
          </div>

          {/* Navegación */}
          <div className="flex flex-col items-start">
            <p className="text-sm font-semibold tracking-wide">Navegación</p>
            <div className="mt-3 flex flex-col gap-2">
              {navLinks.map(({ name, target }) => (
                <ScrollLink
                  key={target}
                  to={target}
                  smooth={true}
                  duration={600}
                  offset={-64}
                  spy={true}
                  className="block cursor-pointer text-sm text-white/70 hover:text-[#e82d89] transition"
                >
                  {name}
                </ScrollLink>
              ))}
            </div>
          </div>

          {/* Accesos */}
          <div className="flex flex-col items-start w-full md:w-auto">
            {/* ✅ Título centrado sobre el ancho de los botones */}
            <div className="w-full md:w-64">
              <p className="text-sm font-semibold tracking-wide text-center">
                Accesos
              </p>

              <div className="mt-3 space-y-3">
                <RouterLink
                  to="/login"
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm hover:bg-white/10 transition"
                >
                  <img
                    src={ADMIN_ICON}
                    alt="Admin"
                    className="w-6 h-6 object-contain"
                  />
                  <span>Panel Administración</span>
                </RouterLink>

                <RouterLink
                  to="/login-apoderado"
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm hover:bg-white/10 transition"
                >
                  <img
                    src={APODERADO_ICON}
                    alt="Apoderados"
                    className="w-6 h-6 object-contain"
                  />
                  <span>Portal Apoderados</span>
                </RouterLink>
              </div>
            </div>
          </div>

          {/* Contacto */}
          <div className="flex flex-col items-start">
            <p className="text-sm font-semibold tracking-wide">Contacto</p>
            <div className="mt-3 flex items-center gap-5 text-2xl">
              <a
                href="https://wa.me/56967438184"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="text-white/70 hover:text-green-400 transition"
                title="WhatsApp"
              >
                <i className="fab fa-whatsapp"></i>
              </a>

              <a
                href="https://www.facebook.com/profile.php?id=61568512375165"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="text-white/70 hover:text-blue-500 transition"
                title="Facebook"
              >
                <i className="fab fa-facebook-f"></i>
              </a>

              <a
                href="https://www.instagram.com/realacademyf.c"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="text-white/70 hover:text-pink-400 transition"
                title="Instagram"
              >
                <i className="fab fa-instagram"></i>
              </a>

              <a
                href="https://www.linkedin.com/in/rodrigo-lagos-fernandez-403a33173/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="text-white/70 hover:text-blue-300 transition"
                title="LinkedIn"
              >
                <i className="fab fa-linkedin-in"></i>
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
              className="text-xs text-white/60 hover:text-white transition"
            >
              Privacidad
            </RouterLink>
            <RouterLink
              to="/terminos"
              className="text-xs text-white/60 hover:text-white transition"
            >
              Términos
            </RouterLink>
          </div>
        </div>
      </div>
    </footer>
  );
}
