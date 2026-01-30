import React, { useState, useEffect } from 'react';
import { Link as ScrollLink } from 'react-scroll';
import { Link as RouterLink } from 'react-router-dom';
import logoRAFC from '../statics/logos/logo-sin-fondo.png';

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [scrolledPastHero, setScrolledPastHero] = useState(false);
  const [tocaDifuminado, setTocaDifuminado] = useState(false);
  const [showNavbar, setShowNavbar] = useState(true);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
    setIsLoginOpen(false);
  };

  const toggleLogin = () => setIsLoginOpen((v) => !v);

  const navLinks = [
    { name: 'Inicio', target: 'inicio' },
    { name: 'Nosotros', target: 'nosotros' },
    { name: 'Servicios', target: 'servicios' },
    { name: 'Ubicacion', target: 'ubicacion' },
    { name: 'Contacto', target: 'contacto' },
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

    const hero = document.getElementById('inicio');
    const difuminadoTrigger = document.getElementById('trigger-difuminado');

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

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ✅ cerrar dropdown login al click fuera (desktop + mobile)
  useEffect(() => {
    const onClick = (e) => {
      if (!e.target.closest?.('#login-dropdown')) setIsLoginOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const topBarBackground = scrolledPastHero
    ? 'bg-black/80 backdrop-blur-md'
    : 'bg-transparent backdrop-blur-md';

  const menuMobileBackground =
    isMenuOpen && tocaDifuminado
      ? 'bg-[#1d0b0b] backdrop-blur-md'
      : 'bg-transparent';

  // ✅ paths desde /public
  const ADMIN_ICON = "/LOGO_SIN_FONDO_ROSA.png";
  const APODERADO_ICON = "/logo-en-blanco.png";

  return (
    <nav
      className={`fixed top-0 left-0 w-full z-50 font-sans text-white transition-all duration-500 ease-in-out transform ${
        showNavbar ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
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
            <img src={logoRAFC} alt="Real Academy FC" className="h-12 w-auto" />
          </ScrollLink>

          <div className="hidden lg:flex space-x-5 text-xl">
            <a
              href="https://wa.me/56967438184"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-green-400 transition"
            >
              <i className="fab fa-whatsapp"></i>
            </a>
            <a
              href="https://www.facebook.com/realacademyfc"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-500 transition"
            >
              <i className="fab fa-facebook-f"></i>
            </a>
            <a
              href="https://www.instagram.com/realacademyfc"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-pink-400 transition"
            >
              <i className="fab fa-instagram"></i>
            </a>
            <a
              href="https://www.linkedin.com/company/realacademyfc"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-300 transition"
            >
              <i className="fab fa-linkedin-in"></i>
            </a>
          </div>
        </div>

        {/* 🔹 Links menú desktop */}
        <ul className="hidden md:flex space-x-6 text-sm font-medium items-center">
          {navLinks.map(({ name, target }) => (
            <li key={target}>
              <ScrollLink
                to={target}
                smooth={true}
                duration={600}
                offset={-64}
                spy={true}
                className="cursor-pointer hover:text-[#e82d89] transition"
                onClick={() => setIsLoginOpen(false)}
              >
                {name}
              </ScrollLink>
            </li>
          ))}

          {/* ✅ Dropdown login DESKTOP */}
          <li className="relative" id="login-dropdown">
            <button
              type="button"
              onClick={toggleLogin}
              className="hover:text-[#e82d89] transition"
            >
              Iniciar sesión
            </button>

            {isLoginOpen && (
              <div className="absolute right-0 mt-3 w-64 rounded-xl bg-black/90 backdrop-blur-md border border-white/10 shadow-xl overflow-hidden">
                <RouterLink
                  to="/login"
                  className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/10 transition"
                  onClick={() => setIsLoginOpen(false)}
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
                  className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/10 transition"
                  onClick={() => setIsLoginOpen(false)}
                >
                  <img
                    src={APODERADO_ICON}
                    alt="Apoderados"
                    className="w-6 h-6 object-contain"
                  />
                  <span>Portal Apoderados</span>
                </RouterLink>
              </div>
            )}
          </li>
        </ul>

        {/* 🔹 Botón hamburguesa */}
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            )}
          </svg>
        </button>
      </div>

      {/* 🔸 Menú móvil */}
      {isMenuOpen && (
        <div
          className={`md:hidden px-4 py-4 space-y-4 text-sm font-medium transition-all duration-300 ${menuMobileBackground}`}
          id="login-dropdown" // ✅ CLAVE: ahora el click fuera no lo mata
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
              className="block cursor-pointer hover:text-[#e82d89]"
            >
              {name}
            </ScrollLink>
          ))}

          {/* ✅ Login móvil con 2 opciones (ahora sí despliega) */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setIsLoginOpen((v) => !v)}
              className="w-full text-left hover:text-[#e82d89]"
            >
              Iniciar Sesión
            </button>

            {isLoginOpen && (
              <div className="space-y-2 pl-3 border-l border-white/20">
                <RouterLink
                  to="/login"
                  className="flex items-center gap-3 py-2 hover:text-[#e82d89]"
                  onClick={() => {
                    setIsLoginOpen(false);
                    toggleMenu();
                  }}
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
                  className="flex items-center gap-3 py-2 hover:text-[#e82d89]"
                  onClick={() => {
                    setIsLoginOpen(false);
                    toggleMenu();
                  }}
                >
                  <img
                    src={APODERADO_ICON}
                    alt="Apoderados"
                    className="w-6 h-6 object-contain"
                  />
                  <span>Portal Apoderados</span>
                </RouterLink>
              </div>
            )}
          </div>

          <div className="flex justify-center pt-4 space-x-5 text-xl border-t border-white/20 mt-4">
            <a href="https://wa.me/56967438184" target="_blank" rel="noopener noreferrer" className="hover:text-green-400 transition">
              <i className="fab fa-whatsapp"></i>
            </a>
            <a href="https://www.facebook.com/realacademyfc" target="_blank" rel="noopener noreferrer" className="hover:text-blue-500 transition">
              <i className="fab fa-facebook-f"></i>
            </a>
            <a href="https://www.instagram.com/realacademyfc" target="_blank" rel="noopener noreferrer" className="hover:text-pink-400 transition">
              <i className="fab fa-instagram"></i>
            </a>
            <a href="https://www.linkedin.com/company/realacademyfc" target="_blank" rel="noopener noreferrer" className="hover:text-blue-300 transition">
              <i className="fab fa-linkedin-in"></i>
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
