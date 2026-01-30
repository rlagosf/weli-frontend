import { Link } from 'react-router-dom';

export default function Breadcrumb({ rutaActual }) {
  return (
    <nav className="text-sm mb-4" aria-label="breadcrumb">
      <ol className="list-reset flex text-gray-600 dark:text-gray-300">
        <li>
          <Link to="/admin" className="hover:text-[#e82d89]">Inicio</Link>
        </li>
        <li><span className="mx-2">/</span></li>
        <li className="text-[#e82d89] font-semibold">{rutaActual}</li>
      </ol>
    </nav>
  );
}
