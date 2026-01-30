// src/pages/admin/crearUsuario.jsx
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { useTheme } from "../../context/ThemeContext";
import api, { getToken, clearToken } from "../../services/api";
import IsLoading from "../../components/isLoading";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";

/* =======================
   Helpers
======================= */
const asArrayRoles = (resp) => {
  const d = resp?.data ?? resp;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.results)) return d.results;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.roles)) return d.roles;
  if (Array.isArray(d?.data?.roles)) return d.data.roles;
  return [];
};

// intenta varias rutas y variantes con/without slash
const tryGetList = async (paths, signal) => {
  const variants = [];
  for (const p of paths) {
    if (p.endsWith("/")) variants.push(p, p.slice(0, -1));
    else variants.push(p, `${p}/`);
  }
  const uniq = [...new Set(variants)];

  for (const url of uniq) {
    try {
      const r = await api.get(url, { signal });
      const arr = asArrayRoles(r);
      if (arr.length) return arr;
    } catch (e) {
      const st = e?.response?.status;
      if (st === 401 || st === 403) throw e;
      // probar siguiente variante
    }
  }
  return [];
};

const isExpired = (decoded) => {
  const now = Math.floor(Date.now() / 1000);
  return !decoded?.exp || decoded.exp <= now;
};

const extractRol = (decoded) => {
  const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role;
  const parsed = Number(rawRol);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function CrearUsuario() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    nombre_usuario: "",
    rut_usuario: "",
    email: "",
    password: "",
    rol_id: "",
    estado_id: 1,
  });

  const [roles, setRoles] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useMobileAutoScrollTop();

  /* =======================
     Auth (admin-only)
  ======================= */
  useEffect(() => {
    try {
      const token = getToken(); // ✅ fuente de verdad (WELI)
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);

      if (isExpired(decoded)) {
        clearToken();
        navigate("/login", { replace: true });
        return;
      }

      const rol = extractRol(decoded);

      // ✅ si no es admin, lo mando al dashboard admin (sin limpiar token)
      if (rol !== 1) {
        navigate("/admin", { replace: true });
        return;
      }
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  /* =======================
     Carga robusta de roles
  ======================= */
  useEffect(() => {
    const abort = new AbortController();

    (async () => {
      setIsLoading(true);
      setError("");

      try {
        const listaRaw = await tryGetList(["/roles", "/rol"], abort.signal);

        const lista = listaRaw
          .map((r) => {
            const id = r?.id ?? r?.rol_id ?? r?.role_id ?? r?.ID ?? null;
            const nombre =
              r?.nombre ??
              r?.descripcion ??
              r?.name ??
              r?.desc ??
              (id != null ? String(id) : "");
            return { id: Number(id), nombre: String(nombre) };
          })
          .filter((r) => Number.isFinite(r.id) && r.nombre && r.nombre.trim().length > 0);

        setRoles(lista);

        // si no hay selección, y existe un único rol, precargarlo (opcional)
        if (!formData.rol_id && lista.length === 1) {
          setFormData((prev) => ({ ...prev, rol_id: String(lista[0].id) }));
        }
      } catch (err) {
        if (abort.signal.aborted) return;

        const st = err?.response?.status;
        if (st === 401 || st === 403) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }

        setError("❌ No se pudieron cargar los roles.");
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    })();

    return () => abort.abort();
    // ⚠️ formData no es dependencia por diseño (evitar loops)
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;

    if (name === "rut_usuario") {
      const digits = value.replace(/\D/g, "");
      if (digits.length <= 8) {
        setFormData((prev) => ({ ...prev, rut_usuario: digits }));
      }
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  }, []);

  const isValidRut = (v) => /^\d{7,8}$/.test(v);
  const isStrongPassword = (v) => typeof v === "string" && v.length >= 6;

  const enviarUsuario = useCallback(
    async (e) => {
      e.preventDefault();
      if (submitting) return;

      setMensaje("");
      setError("");

      if (!isValidRut(formData.rut_usuario)) {
        setError("El RUT debe ser de 7 u 8 dígitos (sin DV).");
        return;
      }
      if (!roles.find((r) => r.id === Number(formData.rol_id))) {
        setError("Rol seleccionado inválido.");
        return;
      }
      if (!isStrongPassword(formData.password)) {
        setError("La contraseña debe tener al menos 6 caracteres.");
        return;
      }

      setSubmitting(true);
      try {
        await api.post("/usuarios", {
          ...formData,
          rut_usuario: Number(formData.rut_usuario),
          rol_id: Number(formData.rol_id),
          estado_id: Number(formData.estado_id) || 1,
        });

        setMensaje("✅ Usuario registrado correctamente");
        setFormData({
          nombre_usuario: "",
          rut_usuario: "",
          email: "",
          password: "",
          rol_id: "",
          estado_id: 1,
        });
      } catch (err) {
        const st = err?.response?.status;
        if (st === 401 || st === 403) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }
        const detail = err?.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "❌ Error al registrar usuario");
      } finally {
        setSubmitting(false);
      }
    },
    [formData, roles, submitting, navigate]
  );

  /* =======================
     UI
  ======================= */
  const fondoClase = darkMode ? "bg-[#111827] text-white" : "bg-white text-[#1d0b0b]";
  const tarjetaClase = darkMode ? "bg-[#1f2937] text-white" : "bg-white text-[#1d0b0b]";
  const inputBase = darkMode
    ? "bg-[#1f2937] text-white border border-gray-600 placeholder-gray-400"
    : "bg-white text-black border border-gray-300 placeholder-gray-500";
  const inputClase = `${inputBase} w-full p-2 rounded`;

  if (isLoading) return <IsLoading />;

  return (
    <div className={`${fondoClase} px-4 pt-4 pb-16 font-weli`}>
      {/* ❌ Sin breadcrumb local. El layout (/admin) ya lo muestra. */}
      <h2 className="text-2xl font-bold mb-6 text-center">Registrar Usuario</h2>

      <div className={`${tarjetaClase} border shadow-lg rounded-2xl p-8 max-w-3xl mx-auto`}>
        <form onSubmit={enviarUsuario} className="space-y-4" autoComplete="off">
          <input
            name="nombre_usuario"
            value={formData.nombre_usuario}
            onChange={handleChange}
            placeholder="Nombre"
            pattern="^[a-zA-ZáéíóúÁÉÍÓÚñÑ ]{3,}$"
            title="Solo letras y mínimo 3 caracteres"
            className={inputClase}
            required
          />

          <input
            name="rut_usuario"
            type="text"
            inputMode="numeric"
            pattern="^\\d{7,8}$"
            maxLength={8}
            value={formData.rut_usuario}
            onChange={handleChange}
            placeholder="RUT sin dígito verificador (Ej: 12345678)"
            className={inputClase}
            required
          />

          <input
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="Correo"
            className={inputClase}
            required
            autoComplete="new-email"
          />

          <input
            name="password"
            type="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="Contraseña (mínimo 6 caracteres)"
            className={inputClase}
            required
            autoComplete="new-password"
            minLength={6}
          />

          <select
            name="rol_id"
            value={formData.rol_id}
            onChange={handleChange}
            className={inputClase}
            required
          >
            <option value="">Selecciona un Rol</option>
            {roles.map((rol) => (
              <option key={rol.id} value={String(rol.id)}>
                {rol.nombre}
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={submitting}
            className={`w-full text-white py-2 rounded transition-colors ${
              submitting ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {submitting ? "Guardando…" : "Guardar"}
          </button>
        </form>

        {mensaje && <p className="text-green-500 mt-4 text-center">{mensaje}</p>}
        {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
      </div>
    </div>
  );
}
