// src/components/Navbar.jsx
import React, { useState, useEffect } from "react";
import { Link as ScrollLink } from "react-scroll";
import { Link as RouterLink } from "react-router-dom";

// ✅ Logo principal
import logoWeli from "../statics/logo/logo-weli-blanco.png";

// ✅ Logos accesos (desde /src/statics/logo)
import logoAdmin from "../statics/logo/logo-w-blanco.png";
import logoApoderado from "../statics/logo/logo-w-cafe.png";

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [scrolledPastHero, setScrolledPastHero] = useState(false);
  const [tocaDifuminado, setTocaDifuminado] = useState(false);
  const [showNavbar, setShowNavbar] = useState(true);

  const toggleMenu = () => {
    setIsMenuOpen((v) => !v);
    setIsLoginOpen(false);
  };

  const toggleLogin = () => setIsLoginOpen((v) => !v);

  const navLinks = [
    { name: "Inicio", target: "inicio" },
    { name: "Nosotros", target: "nosotros" },
    { name: "Servicios", target: "servicios" },
    { name: "Ubicación", target: "ubicacion" },
    { name: "Contacto", target: "contacto" },
  ];

  useEffect(() => {
    const observerHero = new IntersectionObserver(
      ([entry]) => setScrolledPastHero(!entry.isIntersecting),
      { threshold: 0.1 }
    );

    const observerDifuminado = new IntersectionObserver(
      ([entry]) => setTocaDifuminado(!entry.isIntersecting),
      { threshold: 0.1 }
    );

    const hero = document.getElementById("inicio");
    const difuminadoTrigger = document.getElementById("trigger-difuminado");

    if (hero) observerHero.observe(hero);
    if (difuminadoTrigger) observerDifuminado.observe(difuminadoTrigger);

    return () => {
      if (hero) observerHero.unobserve(hero);
      if (difuminadoTrigger) observerDifuminado.unobserve(difuminadoTrigger);
    };
  }, []);

  useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const isMobile = window.innerWidth < 768;

      if (!isMobile) {
        setShowNavbar(true);
        return;
      }

      if (window.scrollY <= 10) setShowNavbar(true);
      else if (window.scrollY > lastScrollY) setShowNavbar(false);
      else setShowNavbar(true);

      lastScrollY = window.scrollY;
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ✅ cerrar dropdown login al click fuera (desktop + mobile)
  useEffect(() => {
    const onClick = (e) => {
      if (!e.target.closest?.("#login-dropdown")) setIsLoginOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // ✅ Barra superior: cuando baja, usa marrón cálido (no negro puro)
  const topBarBackground = scrolledPastHero
    ? "bg-ra-marron/80 backdrop-blur-md"
    : "bg-transparent backdrop-blur-md";

  const menuMobileBackground =
    isMenuOpen && tocaDifuminado
      ? "bg-ra-marron/90 backdrop-blur-md"
      : "bg-transparent";

  return (
    <nav
      className={`fixed top-0 left-0 w-full z-50 font-sans text-white transition-all duration-500 ease-in-out transform ${
        showNavbar ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      {/* ✅ Estilo rainbow (scope: solo clase .rainbow) */}
      <style>{`
        @keyframes weli-rotate { 100% { transform: rotate(1turn); } }
        .rainbow::before{
          content:'';
          position:absolute;
          z-index:-2;
          left:-50%;
          top:-50%;
          width:200%;
          height:200%;
          background-position:100% 50%;
          background-repeat:no-repeat;
          background-size:50% 30%;
          filter:blur(6px);
          background-image: linear-gradient(#FFF);
          animation:weli-rotate 4s linear infinite;
        }
      `}</style>

      <div
        className={`w-full px-8 lg:px-40 py-4 flex justify-between items-center transition-all duration-500 ease-in-out ${topBarBackground}`}
      >
        <div className="flex items-center gap-6">
          <ScrollLink
            to="inicio"
            smooth={true}
            duration={500}
            offset={-64}
            className="cursor-pointer"
            onClick={() => {
              setIsMenuOpen(false);
              setIsLoginOpen(false);
            }}
          >
            <img src={logoWeli} alt="WELI" className="h-6 md:h-7 w-auto" />
          </ScrollLink>

          {/* Redes (Desktop) - colores de marca se mantienen */}
          <div className="hidden lg:flex space-x-5 text-xl">
            <a
              href="https://wa.me/56967438184"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-green-400 transition"
              aria-label="WhatsApp"
              title="WhatsApp"
            >
              <i className="fab fa-whatsapp" />
            </a>

            <a
              href="#"
              className="hover:text-blue-500 transition"
              aria-label="Facebook"
              title="Facebook"
            >
              <i className="fab fa-facebook-f" />
            </a>

            <a
              href="#"
              className="hover:text-pink-400 transition"
              aria-label="Instagram"
              title="Instagram"
            >
              <i className="fab fa-instagram" />
            </a>

            <a
              href="#"
              className="hover:text-blue-300 transition"
              aria-label="LinkedIn"
              title="LinkedIn"
            >
              <i className="fab fa-linkedin-in" />
            </a>
          </div>
        </div>

        {/* Links menú desktop */}
        <ul className="hidden md:flex space-x-6 text-sm font-medium items-center">
          {navLinks.map(({ name, target }) => (
            <li key={target}>
              <ScrollLink
                to={target}
                smooth={true}
                duration={600}
                offset={-64}
                spy={true}
                className="cursor-pointer text-white/90 hover:text-ra-sand transition"
                onClick={() => setIsLoginOpen(false)}
              >
                {name}
              </ScrollLink>
            </li>
          ))}

          {/* Dropdown login DESKTOP */}
          <li className="relative" id="login-dropdown">
            <div className="rainbow relative z-0 bg-white/15 overflow-hidden p-0.5 flex items-center justify-center rounded-full hover:scale-105 transition duration-300 active:scale-100">
              <button
                type="button"
                onClick={toggleLogin}
                className="
                  px-6 text-sm py-2 rounded-full font-medium
                  text-white bg-gray-900/80 backdrop-blur
                  hover:text-ra-sand transition
                "
              >
                Iniciar sesión
              </button>
            </div>

            {isLoginOpen && (
              <div className="absolute right-0 mt-3 w-64 rounded-xl bg-ra-marron/90 backdrop-blur-md border border-white/10 shadow-xl overflow-hidden">
                <RouterLink
                  to="/login"
                  className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/10 transition"
                  onClick={() => setIsLoginOpen(false)}
                >
                  <img
                    src={logoAdmin}
                    alt="Panel Administración"
                    className="w-6 h-6 object-contain"
                  />
                  <span className="text-white/90">Panel Administración</span>
                </RouterLink>

                <RouterLink
                  to="/login-apoderado"
                  className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/10 transition"
                  onClick={() => setIsLoginOpen(false)}
                >
                  <img
                    src={logoApoderado}
                    alt="Portal Apoderados"
                    className="w-6 h-6 object-contain"
                  />
                  <span className="text-white/90">Portal Apoderados</span>
                </RouterLink>

                {/* mini acento WELI */}
                <div className="h-[2px] bg-gradient-to-r from-ra-fucsia via-ra-terracotta to-ra-sand opacity-80" />
              </div>
            )}
          </li>
        </ul>

        {/* Botón hamburguesa */}
        <button
          onClick={toggleMenu}
          aria-label="Menu"
          className="md:hidden focus:outline-none"
        >
          <svg
            className="w-6 h-6 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {isMenuOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8h16M4 16h16"
              />
            )}
          </svg>
        </button>
      </div>

      {/* Menú móvil */}
      {isMenuOpen && (
        <div
          className={`md:hidden px-4 py-4 space-y-4 text-sm font-medium transition-all duration-300 ${menuMobileBackground}`}
          id="login-dropdown"
        >
          {navLinks.map(({ name, target }) => (
            <ScrollLink
              key={target}
              to={target}
              smooth={true}
              duration={600}
              offset={-64}
              spy={true}
              onClick={toggleMenu}
              className="block cursor-pointer text-white/90 hover:text-ra-sand transition"
            >
              {name}
            </ScrollLink>
          ))}

          {/* Login móvil con efecto rainbow */}
          <div className="space-y-3">
            <div className="rainbow relative z-0 bg-white/15 overflow-hidden p-0.5 flex items-center justify-center rounded-full hover:scale-105 transition duration-300 active:scale-100">
              <button
                type="button"
                onClick={() => setIsLoginOpen((v) => !v)}
                className="
                  w-full px-6 text-sm py-3 rounded-full font-medium
                  text-white bg-gray-900/80 backdrop-blur
                  hover:text-ra-sand transition
                "
              >
                Iniciar sesión
              </button>
            </div>

            {isLoginOpen && (
              <div className="space-y-2 pl-3 border-l border-white/20">
                <RouterLink
                  to="/login"
                  className="flex items-center gap-3 py-2 text-white/90 hover:text-ra-sand transition"
                  onClick={() => {
                    setIsLoginOpen(false);
                    toggleMenu();
                  }}
                >
                  <img
                    src={logoAdmin}
                    alt="Panel Administración"
                    className="w-6 h-6 object-contain"
                  />
                  <span>Panel Administración</span>
                </RouterLink>

                <RouterLink
                  to="/login-apoderado"
                  className="flex items-center gap-3 py-2 text-white/90 hover:text-ra-sand transition"
                  onClick={() => {
                    setIsLoginOpen(false);
                    toggleMenu();
                  }}
                >
                  <img
                    src={logoApoderado}
                    alt="Portal Apoderados"
                    className="w-6 h-6 object-contain"
                  />
                  <span>Portal Apoderados</span>
                </RouterLink>
              </div>
            )}
          </div>

          {/* Redes móvil - colores de marca se mantienen */}
          <div className="flex justify-center pt-4 space-x-5 text-xl border-t border-white/20 mt-4">
            <a
              href="https://wa.me/56967438184"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-green-400 transition"
              aria-label="WhatsApp"
              title="WhatsApp"
            >
              <i className="fab fa-whatsapp" />
            </a>
            <a href="#" className="hover:text-blue-500 transition" aria-label="Facebook" title="Facebook">
              <i className="fab fa-facebook-f" />
            </a>
            <a href="#" className="hover:text-pink-400 transition" aria-label="Instagram" title="Instagram">
              <i className="fab fa-instagram" />
            </a>
            <a href="#" className="hover:text-blue-300 transition" aria-label="LinkedIn" title="LinkedIn">
              <i className="fab fa-linkedin-in" />
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
