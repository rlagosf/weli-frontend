// src/routes/AppRoutes.jsx
import { Suspense } from "react";
import { useRoutes } from "react-router-dom";
import IsLoading from "../components/isLoading";
import { routes } from "./routes";

/** Error boundary minimalista para lazy chunks */
import React from "react";

class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error) {
    // Aquí podrías loguear a un endpoint si quieres (sin filtrar datos sensibles)
    // console.error("Route render error:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-black/10 bg-white p-6 text-center">
            <p className="text-sm font-black tracking-widest uppercase text-black/50">
              Algo falló
            </p>
            <h2 className="mt-2 text-xl font-extrabold text-black">
              No pudimos cargar esta vista
            </h2>
            <p className="mt-2 text-sm font-semibold text-black/70">
              Reintenta recargando la página.
            </p>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 w-full rounded-xl py-3 font-extrabold uppercase tracking-widest text-white bg-black hover:bg-black/80"
            >
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AppRoutes() {
  const element = useRoutes(routes);
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<IsLoading />}>{element}</Suspense>
    </RouteErrorBoundary>
  );
}
