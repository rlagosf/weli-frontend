import { useTheme } from '../context/ThemeContext';

export default function Modal({ visible, onConfirm, onCancel }) {
  const { darkMode } = useTheme();

  if (!visible) return null;

  const fondo = darkMode ? 'bg-[#1f2937] text-white' : 'bg-white text-black';
  const overlay = 'bg-black bg-opacity-50 fixed inset-0 flex items-center justify-center z-50';
  const botonBase = 'px-4 py-2 rounded font-semibold transition duration-200';
  const botonConfirmar = darkMode
    ? 'bg-green-600 hover:bg-green-700 text-white'
    : 'bg-green-500 hover:bg-green-600 text-white';
  const botonCancelar = darkMode
    ? 'bg-gray-600 hover:bg-gray-700 text-white'
    : 'bg-gray-300 hover:bg-gray-400 text-black';

  return (
    <div className={overlay} role="dialog" aria-modal="true">
      <div className={`${fondo} w-full max-w-md p-6 rounded-lg shadow-xl border border-gray-300`}>
        <h3 className="text-lg font-bold mb-4 text-center">¿Estás seguro que deseas eliminar?</h3>
        <div className="flex justify-center gap-4">
          <button
            onClick={onConfirm}
            className={`${botonBase} ${botonConfirmar}`}
            autoFocus
          >
            Sí
          </button>
          <button
            onClick={onCancel}
            className={`${botonBase} ${botonCancelar}`}
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
}
