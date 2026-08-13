import {useCallback, useState} from 'react';

// Vaqtga qarab avtomatik yashirilmaydi — faqat bitta bosish (tap) bilan
// ko'rinadi/yashiriladi (toggle).
export function useAutoHideOverlay() {
  const [visible, setVisible] = useState(true);

  const toggle = useCallback(() => {
    setVisible(v => !v);
  }, []);

  return {visible, toggle};
}
