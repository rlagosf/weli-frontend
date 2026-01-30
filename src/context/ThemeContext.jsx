import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('modoOscuro');
    return stored === 'true'; // ✅ valor booleano controlado
  });

  useEffect(() => {
    localStorage.setItem('modoOscuro', darkMode);
  }, [darkMode]);

  const toggleTheme = () => setDarkMode(prev => !prev);

  return (
    <ThemeContext.Provider value={{ darkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// ✅ Hook personalizado
export const useTheme = () => useContext(ThemeContext);
