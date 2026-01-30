// src/hooks/useMobileAutoScrollTop.jsx
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function useMobileAutoScrollTop() {
  const location = useLocation();

  useEffect(() => {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.pathname]);
}
