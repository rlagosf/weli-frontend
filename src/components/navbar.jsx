// src/components/Navbar.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function useIntersectionFlag(elementId, options) {
  const [flag, setFlag] = useState(false);

  useEffect(() => {
    const el = document.getElementById(elementId);
    if (!el) return;

    const obs = new IntersectionObserver(([entry]) => {
      const next = !entry.isIntersecting;
      setFlag((prev) => (prev === next ? prev : next));
    }, options);

    obs.observe(el);
    return () => obs.disconnect();
  }, [elementId, options]);

  return flag;
}

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [showNavbar, setShowNavbar] = useState(true);

  // ✅ NO TOCAR: transparente en landing / temático al scrollear
  const scrolledPastHero = useIntersectionFlag("inicio", { threshold: 0.1 });
  const tocaDifuminado = useIntersectionFlag("trigger-difuminado", {
    threshold: 0.1,
  });

  const desktopLoginRef = useRef(null);
  const mobileLoginRef = useRef(null);

  const lastScrollYRef = useRef(0);
  const tickingRef = useRef(false);
  const isMobileRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => {
      isMobileRef.current = mq.matches;
      if (!mq.matches) setShowNavbar(true);
    };
    update();

    if (mq.addEventListener) mq.addEventListener("change", update);
    else mq.addListener(update);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", update);
      else mq.removeListener(update);
    };
  }, []);

  const closeAll = useCallback(() => {
    setIsMenuOpen(false);
    setIsLoginOpen(false);
  }, []);

  const toggleMenu = useCallback(() => {
    setIsMenuOpen((v) => {
      const next = !v;
      setIsLoginOpen(false);
      return next;
    });
  }, []);

  const toggleLogin = useCallback(() => {
    setIsLoginOpen((v) => !v);
  }, []);

  // hide/show mobile navbar (barato: transform + rAF)
  useEffect(() => {
    lastScrollYRef.current = window.scrollY || 0;

    const onScroll = () => {
      if (!isMobileRef.current) return;
      if (tickingRef.current) return;
      tickingRef.current = true;

      requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        const last = lastScrollYRef.current;

        let nextShow = true;
        if (y <= 10) nextShow = true;
        else if (y > last) nextShow = false;
        else nextShow = true;

        setShowNavbar((prev) => (prev === nextShow ? prev : nextShow));
        lastScrollYRef.current = y;
        tickingRef.current = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // click-outside: cerrar login
  useEffect(() => {
    const onPointerDown = (e) => {
      const t = e.target;

      const inDesktop = desktopLoginRef.current?.contains?.(t);
      const inMobile = mobileLoginRef.current?.contains?.(t);

      if (!inDesktop && !inMobile) setIsLoginOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const topBarBackground = useMemo(() => {
    // ✅ NO TOCAR tu comportamiento base, solo añadimos blur leve (barato)
    return scrolledPastHero ? "bg-ra-marron/80 backdrop-blur-md" : "bg-transparent";
  }, [scrolledPastHero]);

  const menuMobileBackground = useMemo(() => {
    return isMenuOpen && tocaDifuminado ? "bg-ra-marron/90 backdrop-blur-md" : "bg-transparent";
  }, [isMenuOpen, tocaDifuminado]);

  // ✅ clases “económicas” reutilizables
  const navItemClass =
    "cursor-pointer text-white/90 hover:text-ra-sand transition-colors duration-150";
  const navUnderlineClass =
    "relative after:content-[''] after:absolute after:left-0 after:-bottom-1 after:h-[2px] after:w-0 after:bg-ra-sand after:transition-all after:duration-200 hover:after:w-full";

  const socialBase =
    "text-white/90 transition-transform duration-150 hover:-translate-y-[1px] active:translate-y-0";

  return (
    <nav
      className={[
        "fixed top-0 left-0 w-full z-50 font-sans text-white",
        "transition-transform duration-200 will-change-transform",
        showNavbar ? "translate-y-0" : "-translate-y-full",
      ].join(" ")}
    >
      <div className={`w-full px-8 lg:px-40 py-4 flex justify-between items-center ${topBarBackground}`}>
        <div className="flex items-center gap-6">
          <ScrollLink
            to="inicio"
            smooth
            duration={500}
            offset={-64}
            className="cursor-pointer"
            onClick={closeAll}
          >
            <img src={logoWeli} alt="WELI" className="h-6 md:h-7 w-auto" draggable={false} />
          </ScrollLink>

          {/* Redes (Desktop) */}
          <div className="hidden lg:flex space-x-5 text-xl">
            <a
              href="https://wa.me/56967438184"
              target="_blank"
              rel="noopener noreferrer"
              className={`${socialBase} hover:text-green-400`}
              aria-label="WhatsApp"
              title="WhatsApp"
            >
              <i className="fab fa-whatsapp" />
            </a>

            <a
              href="#"
              className={`${socialBase} hover:text-blue-500`}
              aria-label="Facebook"
              title="Facebook"
            >
              <i className="fab fa-facebook-f" />
            </a>

            <a
              href="#"
              className={`${socialBase} hover:text-pink-400`}
              aria-label="Instagram"
              title="Instagram"
            >
              <i className="fab fa-instagram" />
            </a>

            <a
              href="#"
              className={`${socialBase} hover:text-blue-300`}
              aria-label="LinkedIn"
              title="LinkedIn"
            >
              <i className="fab fa-linkedin-in" />
            </a>
          </div>
        </div>

        {/* Links menú desktop */}
        <ul className="hidden md:flex space-x-6 text-sm font-medium items-center">
          {NAV_LINKS.map(({ name, target }) => (
            <li key={target}>
              <ScrollLink
                to={target}
                smooth
                duration={600}
                offset={-64}
                spy
                className={`${navItemClass} ${navUnderlineClass}`}
                onClick={() => setIsLoginOpen(false)}
              >
                {name}
              </ScrollLink>
            </li>
          ))}

          {/* Dropdown login DESKTOP */}
          <li className="relative" ref={desktopLoginRef}>
            <button
              type="button"
              onClick={toggleLogin}
              className="
                px-6 text-sm py-2 rounded-full font-medium
                text-white bg-gray-900/80 border border-white/10
                hover:border-ra-sand/60 hover:text-ra-sand
                transition-colors duration-150
              "
            >
              Iniciar sesión
            </button>

            {isLoginOpen && (
              <div className="absolute right-0 mt-3 w-64 rounded-xl bg-ra-marron/90 backdrop-blur-md border border-white/10 overflow-hidden shadow-xl">
                <RouterLink
                  to="/login"
                  className="flex items-center gap-3 px-4 py-3 text-sm text-white/90 hover:bg-white/10 transition-colors duration-150"
                  onClick={() => setIsLoginOpen(false)}
                >
                  <img src={logoAdmin} alt="Panel Administración" className="w-6 h-6 object-contain" />
                  <span>Panel Administración</span>
                </RouterLink>

                <RouterLink
                  to="/login-apoderado"
                  className="flex items-center gap-3 px-4 py-3 text-sm text-white/90 hover:bg-white/10 transition-colors duration-150"
                  onClick={() => setIsLoginOpen(false)}
                >
                  <img src={logoApoderado} alt="Portal Apoderados" className="w-6 h-6 object-contain" />
                  <span>Portal Apoderados</span>
                </RouterLink>

                <div className="h-[2px] bg-gradient-to-r from-ra-fucsia via-ra-terracotta to-ra-sand opacity-80" />
              </div>
            )}
          </li>
        </ul>

        {/* Botón hamburguesa */}
        <button onClick={toggleMenu} aria-label="Menu" className="md:hidden">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Menú móvil */}
      {isMenuOpen && (
        <div className={`md:hidden px-4 py-4 space-y-4 text-sm font-medium ${menuMobileBackground}`}>
          {NAV_LINKS.map(({ name, target }) => (
            <ScrollLink
              key={target}
              to={target}
              smooth
              duration={600}
              offset={-64}
              spy
              onClick={toggleMenu}
              className="block cursor-pointer text-white/90 hover:text-ra-sand transition-colors duration-150"
            >
              {name}
            </ScrollLink>
          ))}

          {/* Login móvil */}
          <div className="space-y-3" ref={mobileLoginRef}>
            <button
              type="button"
              onClick={toggleLogin}
              className="
                w-full px-6 text-sm py-3 rounded-full font-medium
                text-white bg-gray-900/80 border border-white/10
                hover:border-ra-sand/60 hover:text-ra-sand
                transition-colors duration-150
              "
            >
              Iniciar sesión
            </button>

            {isLoginOpen && (
              <div className="space-y-2 pl-3 border-l border-white/20">
                <RouterLink
                  to="/login"
                  className="flex items-center gap-3 py-2 text-white/90 hover:text-ra-sand transition-colors duration-150"
                  onClick={() => {
                    setIsLoginOpen(false);
                    toggleMenu();
                  }}
                >
                  <img src={logoAdmin} alt="Panel Administración" className="w-6 h-6 object-contain" />
                  <span>Panel Administración</span>
                </RouterLink>

                <RouterLink
                  to="/login-apoderado"
                  className="flex items-center gap-3 py-2 text-white/90 hover:text-ra-sand transition-colors duration-150"
                  onClick={() => {
                    setIsLoginOpen(false);
                    toggleMenu();
                  }}
                >
                  <img src={logoApoderado} alt="Portal Apoderados" className="w-6 h-6 object-contain" />
                  <span>Portal Apoderados</span>
                </RouterLink>
              </div>
            )}
          </div>

          {/* Redes móvil */}
          <div className="flex justify-center pt-4 space-x-5 text-xl border-t border-white/20 mt-4">
            <a
              href="https://wa.me/56958066120"
              target="_blank"
              rel="noopener noreferrer"
              className={`${socialBase} hover:text-green-400`}
              aria-label="WhatsApp"
              title="WhatsApp"
            >
              <i className="fab fa-whatsapp" />
            </a>
            <a href="#" className={`${socialBase} hover:text-blue-500`} aria-label="Facebook" title="Facebook">
              <i className="fab fa-facebook-f" />
            </a>
            <a href="#" className={`${socialBase} hover:text-pink-400`} aria-label="Instagram" title="Instagram">
              <i className="fab fa-instagram" />
            </a>
            <a href="#" className={`${socialBase} hover:text-blue-300`} aria-label="LinkedIn" title="LinkedIn">
              <i className="fab fa-linkedin-in" />
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
