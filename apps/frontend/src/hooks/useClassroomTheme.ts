import { useEffect, useRef } from "react";

/**
 * Classroom mavzusini faqat classroom route ochiq turgan vaqt root'ga qo'llaydi.
 * Sahifadan chiqilganda global saytning avvalgi mavzusi aynan tiklanadi.
 */
export function useClassroomTheme(theme: "light" | "dark") {
  const previousRef = useRef<{ captured: boolean; value: string | null }>({
    captured: false,
    value: null,
  });

  useEffect(() => {
    const root = document.documentElement;
    if (!previousRef.current.captured) {
      previousRef.current = {
        captured: true,
        value: root.getAttribute("data-theme"),
      };
    }
    root.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => () => {
    const previous = previousRef.current.value;
    if (previous === null) document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", previous);
  }, []);
}
