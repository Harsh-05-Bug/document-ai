import { useTheme } from "../../context/ThemeContext.jsx";

export default function ThemeSwitch() {
  const { theme, setTheme, themes } = useTheme();

  return (
    <div className="theme-switch" role="group" aria-label="Colour theme">
      {themes.map((t) => (
        <button
          key={t.id}
          type="button"
          className={theme === t.id ? "active" : ""}
          aria-pressed={theme === t.id}
          onClick={() => setTheme(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}