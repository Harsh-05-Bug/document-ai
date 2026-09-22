import { createContext, useContext, useEffect, useState } from "react";

/**
 * Theme preference, persisted per browser.
 *
 * The chosen theme is written to <html data-theme="...">, so every colour
 * resolves through CSS variables and no component needs to know which
 * theme is active.
 */

export const THEMES = [
  { id: "light", label: "Day" },
  { id: "dark", label: "Night" },
  { id: "nocturne", label: "Nocturne" },
];

const STORAGE_KEY = "theme";
const ThemeContext = createContext(null);

function readStoredTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (THEMES.some((t) => t.id === saved)) return saved;
  } catch {
    // Private browsing can throw on localStorage access.
  }
  // Fall back to whatever the operating system prefers.
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Not being able to remember the choice shouldn't break the app.
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}