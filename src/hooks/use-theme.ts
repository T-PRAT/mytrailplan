import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "trailprep-theme";

const isBrowser = typeof window !== "undefined";

function getSystemTheme(): Theme {
  if (!isBrowser) return "dark";
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  if (theme === "dark") {
    html.classList.add("dark");
    html.style.background = "#0e0e0e";
  } else {
    html.classList.remove("dark");
    html.style.background = "#f5f2eb";
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (!isBrowser) return "dark";
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored as Theme | null) ?? getSystemTheme();
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
