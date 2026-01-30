export default function Footer() {
  return (
    <footer className="text-white py-8 font-sans">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center">

        {/* Logo + Derechos reservados */}
        <div className="flex items-center space-x-3 mb-4 md:mb-0">
          <img
            src="/logo-en-blanco.png"
            alt="Logo Real Academy FC"
            className="w-7 h-7 object-contain"
          />
          <a
            href="/"
            className="text-sm text-gray-400 hover:text-white transition text-center md:text-left"
          >
            &copy; {new Date().getFullYear()} Real Academy FC. Todos los derechos reservados.
          </a>
        </div>

        {/* Redes Sociales */}
        <div className="flex space-x-5 text-2xl">
          <a
            href="https://wa.me/56967438184"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp"
            className="hover:text-green-400 transition"
          >
            <i className="fab fa-whatsapp"></i>
          </a>
          <a
            href="https://www.facebook.com/profile.php?id=61568512375165"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Facebook"
            className="hover:text-blue-500 transition"
          >
            <i className="fab fa-facebook-f"></i>
          </a>
          <a
            href="https://www.instagram.com/realacademyf.c"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            className="hover:text-pink-400 transition"
          >
            <i className="fab fa-instagram"></i>
          </a>
          <a
            href="https://www.linkedin.com/in/rodrigo-lagos-fernandez-403a33173/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
            className="hover:text-blue-300 transition"
          >
            <i className="fab fa-linkedin-in"></i>
          </a>
        </div>
      </div>
    </footer>
  );
}
