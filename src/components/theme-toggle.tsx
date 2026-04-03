import { Moon, Sun } from "lucide-react";
import type { Theme } from "@/hooks/use-theme";

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <button
      aria-label={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
      className="shrink-0 text-gray-500 transition-colors hover:text-gray-200"
      onClick={onToggle}
      title={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
      type="button"
    >
      {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
