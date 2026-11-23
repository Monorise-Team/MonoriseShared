/**
 * Wartości wyglądu Monorise: system „Moonlight glass” z desktopowego Aven (ADR-0091).
 *
 * To jedyne źródło prawdy: z niego powstaje CSS dla przeglądarki i komputera (dist/tokens.css,
 * dist/tailwind.css, scripts/generate-css.mjs) oraz wartości dla Expo (resolveTokens w index.ts).
 *
 * Panele to szklane karty na tle. Szkło ma odcień motywu (`tint`): neutralny w Mono, granatowo-turkusowy
 * w Moonlight, fioletowy w Amethyst i zielony w Emerald. Tryb ciemny jest wzorcowy i domyślny.
 */

export type Mode = "light" | "dark";
export type ThemeName = "mono" | "moonlight" | "amethyst" | "emerald";

export const modes = ["light", "dark"] as const satisfies readonly Mode[];
export const themeNames = ["mono", "moonlight", "amethyst", "emerald"] as const satisfies readonly ThemeName[];
export const defaultMode: Mode = "dark";
export const defaultTheme: ThemeName = "mono";

/** Odcień szkła jako trzy liczby RGB oddzielone spacją, do użycia w `rgb(var(--mr-tint-…) / alfa)`. */
export interface Tint {
  light: string;
  lightHi: string;
  lightDeep: string;
  dark: string;
  darkHi: string;
}

export interface Accent {
  accent: string;
  accentHover: string;
  accentLight: string;
  /** Tekst na wypełnionym akcencie: zawsze razem z `accent`. */
  accentFg: string;
  selected: string;
  link: string;
}

export interface Theme {
  label: string;
  tint: Tint;
  accent: Record<Mode, Accent>;
  /** Tło pod szklanymi kartami (CSS `background`). */
  backdrop: Record<Mode, string>;
}

export const themes: Record<ThemeName, Theme> = {
  mono: {
    label: "Mono",
    tint: {
      light: "243 243 244",
      lightHi: "250 250 250",
      lightDeep: "220 220 224",
      dark: "12 12 14",
      darkHi: "20 20 23",
    },
    accent: {
      light: {
        accent: "#27272a",
        accentHover: "#18181b",
        accentLight: "#e4e4e7",
        accentFg: "#ffffff",
        selected: "rgba(39, 39, 42, 0.12)",
        link: "#27272a",
      },
      dark: {
        accent: "#e4e4e7",
        accentHover: "#d4d4d8",
        accentLight: "#3f3f46",
        accentFg: "#18181b",
        selected: "rgba(228, 228, 231, 0.18)",
        link: "#f4f4f5",
      },
    },
    backdrop: {
      light:
        "radial-gradient(1100px 700px at 78% -12%, rgb(255 255 255 / 0.95), transparent 62%), radial-gradient(900px 700px at -10% 110%, rgb(212 212 216 / 0.7), transparent 60%), linear-gradient(180deg, #f4f4f5 0%, #e4e4e7 100%)",
      dark: "radial-gradient(1100px 700px at 78% -12%, rgb(255 255 255 / 0.1), transparent 62%), radial-gradient(900px 700px at -10% 110%, rgb(161 161 170 / 0.12), transparent 60%), linear-gradient(180deg, #141416 0%, #09090b 100%)",
    },
  },
  moonlight: {
    label: "Moonlight",
    tint: {
      light: "238 247 250",
      lightHi: "246 251 253",
      lightDeep: "205 226 234",
      dark: "6 16 26",
      darkHi: "10 22 34",
    },
    accent: {
      light: {
        accent: "#0e7490",
        accentHover: "#155e75",
        accentLight: "#cff3f8",
        accentFg: "#ffffff",
        selected: "rgba(14, 116, 144, 0.16)",
        link: "#0e7490",
      },
      dark: {
        accent: "#67d5e5",
        accentHover: "#3fb3c8",
        accentLight: "#164e63",
        accentFg: "#04222b",
        selected: "rgba(76, 195, 217, 0.3)",
        link: "#a5e7f0",
      },
    },
    backdrop: {
      light:
        "radial-gradient(520px 520px at 74% 8%, rgb(255 255 255 / 0.95), transparent 70%), radial-gradient(1000px 600px at 15% 105%, rgb(125 198 214 / 0.55), transparent 65%), linear-gradient(180deg, #d9eef4 0%, #b9dbe6 55%, #9cc7d6 100%)",
      dark: "radial-gradient(420px 420px at 74% 8%, rgb(186 236 245 / 0.32), transparent 70%), radial-gradient(1000px 600px at 15% 105%, rgb(14 116 144 / 0.35), transparent 65%), linear-gradient(180deg, #0d2a3d 0%, #071826 55%, #030c14 100%)",
    },
  },
  amethyst: {
    label: "Amethyst",
    tint: {
      light: "244 240 252",
      lightHi: "250 247 254",
      lightDeep: "220 212 240",
      dark: "14 9 28",
      darkHi: "21 14 38",
    },
    accent: {
      light: {
        accent: "#7c3aed",
        accentHover: "#6d28d9",
        accentLight: "#ede9fe",
        accentFg: "#ffffff",
        selected: "rgba(124, 58, 237, 0.14)",
        link: "#7c3aed",
      },
      dark: {
        accent: "#a78bfa",
        accentHover: "#8b5cf6",
        accentLight: "#2e1065",
        accentFg: "#2e1065",
        selected: "rgba(167, 139, 250, 0.26)",
        link: "#c4b5fd",
      },
    },
    backdrop: {
      light:
        "radial-gradient(520px 520px at 74% 8%, rgb(255 255 255 / 0.95), transparent 70%), radial-gradient(1000px 600px at 15% 105%, rgb(167 139 250 / 0.45), transparent 65%), linear-gradient(180deg, #ece6fb 0%, #d9cdf6 55%, #c7b6f0 100%)",
      dark: "radial-gradient(420px 420px at 74% 8%, rgb(221 214 254 / 0.28), transparent 70%), radial-gradient(1000px 600px at 15% 105%, rgb(109 40 217 / 0.35), transparent 65%), linear-gradient(180deg, #1f1238 0%, #120a24 55%, #080412 100%)",
    },
  },
  emerald: {
    label: "Emerald",
    tint: {
      light: "238 248 243",
      lightHi: "246 252 249",
      lightDeep: "204 230 217",
      dark: "5 18 13",
      darkHi: "9 26 19",
    },
    accent: {
      light: {
        accent: "#047857",
        accentHover: "#065f46",
        accentLight: "#d1fae5",
        accentFg: "#ffffff",
        selected: "rgba(4, 120, 87, 0.14)",
        link: "#047857",
      },
      dark: {
        accent: "#4be3b0",
        accentHover: "#2dd4a0",
        accentLight: "#064e3b",
        accentFg: "#022c22",
        selected: "rgba(45, 212, 160, 0.24)",
        link: "#7ef0c8",
      },
    },
    backdrop: {
      light:
        "radial-gradient(520px 520px at 74% 8%, rgb(255 255 255 / 0.95), transparent 70%), radial-gradient(1000px 600px at 15% 105%, rgb(52 211 153 / 0.4), transparent 65%), linear-gradient(180deg, #e2f5ec 0%, #c6eadb 55%, #a9dcc6 100%)",
      dark: "radial-gradient(420px 420px at 74% 8%, rgb(209 250 229 / 0.24), transparent 70%), radial-gradient(1000px 600px at 15% 105%, rgb(4 120 87 / 0.35), transparent 65%), linear-gradient(180deg, #0b2a1f 0%, #061a13 55%, #020c08 100%)",
    },
  },
};

/**
 * Kolory i powierzchnie zależne od trybu. Odwołania `var(--mr-tint-…)` i `var(--mr-accent)` wskazują
 * odcień i akcent bieżącego motywu.
 */
export const semantic: Record<Mode, Record<string, string>> = {
  light: {
    "bg-primary": "rgb(var(--mr-tint-light-hi) / 0.97)",
    "bg-secondary": "rgba(255, 255, 255, 0.55)",
    "bg-tertiary": "rgb(var(--mr-tint-light-deep) / 0.6)",
    "bg-hover": "color-mix(in srgb, var(--mr-accent) 9%, transparent)",
    "bg-selected": "var(--mr-selected)",
    "row-hover": "rgba(255, 255, 255, 0.5)",
    "text-primary": "#0a1c26",
    "text-secondary": "#1f3846",
    "text-tertiary": "#365161",
    "border-primary": "rgba(8, 40, 56, 0.13)",
    "border-secondary": "rgba(8, 40, 56, 0.07)",
    danger: "#dc2626",
    "danger-hover": "#b91c1c",
    "danger-solid": "#dc2626",
    "danger-solid-hover": "#b91c1c",
    warning: "#b45309",
    success: "#047857",
    "sidebar-bg": "rgb(var(--mr-tint-light) / 0.6)",
    "sidebar-text": "#0a1c26",
    "surface-side": "rgb(var(--mr-tint-light) / 0.36)",
    "surface-middle": "rgb(var(--mr-tint-light) / 0.32)",
    "surface-reading": "rgb(var(--mr-tint-light-hi) / 0.5)",
    "surface-strong": "rgb(var(--mr-tint-light-hi) / 0.5)",
    "surface-menu": "rgb(var(--mr-tint-light-hi) / 0.97)",
    "surface-float": "rgb(var(--mr-tint-light-hi) / 0.96)",
    "card-border": "rgba(255, 255, 255, 0.5)",
    "scrollbar-thumb": "rgba(8, 40, 56, 0.22)",
    "scrollbar-thumb-hover": "rgba(8, 40, 56, 0.36)",
    "progress-track": "rgba(8, 40, 56, 0.14)",
    "backdrop-fg": "#0a1c26",
    overlay: "rgba(0, 0, 0, 0.2)",
  },
  dark: {
    "bg-primary": "rgb(var(--mr-tint-dark-hi) / 0.96)",
    "bg-secondary": "rgb(var(--mr-tint-dark-hi) / 0.6)",
    "bg-tertiary": "rgba(255, 255, 255, 0.08)",
    "bg-hover": "rgba(255, 255, 255, 0.07)",
    "bg-selected": "var(--mr-selected)",
    "row-hover": "rgb(var(--mr-tint-dark) / 0.45)",
    "text-primary": "#f1f7fa",
    "text-secondary": "#d3e3ea",
    "text-tertiary": "#9fb6c1",
    "border-primary": "rgba(255, 255, 255, 0.12)",
    "border-secondary": "rgba(255, 255, 255, 0.07)",
    danger: "#f87171",
    "danger-hover": "#ef4444",
    "danger-solid": "#dc2626",
    "danger-solid-hover": "#b91c1c",
    warning: "#fbbf24",
    success: "#34d399",
    "sidebar-bg": "rgb(var(--mr-tint-dark) / 0.32)",
    "sidebar-text": "#eaf3f7",
    "surface-side": "rgb(var(--mr-tint-dark) / 0.32)",
    "surface-middle": "rgb(var(--mr-tint-dark) / 0.34)",
    "surface-reading": "rgb(var(--mr-tint-dark) / 0.5)",
    "surface-strong": "rgb(var(--mr-tint-dark-hi) / 0.6)",
    "surface-menu": "rgb(var(--mr-tint-dark-hi) / 0.96)",
    "surface-float": "rgb(var(--mr-tint-dark-hi) / 0.92)",
    "card-border": "rgba(255, 255, 255, 0.1)",
    "scrollbar-thumb": "rgba(255, 255, 255, 0.2)",
    "scrollbar-thumb-hover": "rgba(255, 255, 255, 0.3)",
    "progress-track": "rgba(255, 255, 255, 0.2)",
    "backdrop-fg": "#f1f7fa",
    overlay: "rgba(0, 0, 0, 0.45)",
  },
};

/** Efekty, których nie da się zapisać jako kolor: cienie, rozmycie szkła, cień tekstu. Tylko CSS. */
export const effects: Record<Mode, Record<string, string>> = {
  light: {
    "card-shadow": "0 10px 30px rgba(3, 20, 30, 0.22)",
    "glass-shadow": "0 10px 30px rgba(3, 20, 30, 0.2)",
    "glass-shadow-elevated": "0 18px 50px rgba(3, 20, 30, 0.3)",
    "glass-highlight": "inset 0 1px 0 0 rgba(255, 255, 255, 0.5)",
    "surface-side-filter": "blur(24px) saturate(160%)",
    "surface-middle-filter": "blur(26px) saturate(160%)",
    "surface-reading-filter": "blur(28px) saturate(160%)",
    "surface-float-filter": "blur(16px) saturate(160%)",
    "text-shadow-panel": "none",
    "text-shadow-middle": "none",
    "glow-primary": "drop-shadow(0 0 10px color-mix(in srgb, var(--mr-accent) 35%, transparent))",
  },
  dark: {
    "card-shadow": "0 10px 30px rgba(0, 0, 0, 0.22)",
    "glass-shadow": "0 10px 30px rgba(0, 0, 0, 0.22)",
    "glass-shadow-elevated": "0 18px 50px rgba(0, 0, 0, 0.45)",
    "glass-highlight": "inset 0 1px 0 0 rgba(255, 255, 255, 0.06)",
    "surface-side-filter": "blur(3px) saturate(120%)",
    "surface-middle-filter": "blur(6px) saturate(115%)",
    "surface-reading-filter": "blur(10px) saturate(125%)",
    "surface-float-filter": "blur(16px) saturate(160%)",
    "text-shadow-panel": "0 1px 3px rgba(0, 0, 0, 0.55)",
    "text-shadow-middle": "0 1px 2px rgba(0, 0, 0, 0.85), 0 0 12px rgba(0, 0, 0, 0.45)",
    "glow-primary": "drop-shadow(0 0 12px color-mix(in srgb, var(--mr-accent) 55%, transparent))",
  },
};

/** Kształty: pływające karty z odstępem 10 px i zaokrągleniem 16 px. */
export const shape = {
  "card-gap": 10,
  "card-radius": 16,
  "menu-radius": 12,
  "row-radius": 10,
  "control-radius": 8,
} as const;

/** Ruch: szybko reaguje, miękko się zatrzymuje; wyjście krótsze niż wejście. Czasy w milisekundach. */
export const motion = {
  duration: { fast: 150, normal: 200, slow: 300, enter: 220, exit: 140, staggerStep: 18 },
  easing: {
    out: "cubic-bezier(0.22, 1, 0.36, 1)",
    in: "cubic-bezier(0.4, 0, 1, 1)",
    standard: "cubic-bezier(0.2, 0, 0, 1)",
  },
  rise: 4,
} as const;

/** Czcionka systemowa: SF Pro na urządzeniach Apple, Segoe UI Variable na Windows. */
export const fonts = {
  sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI Variable Text", "Segoe UI", Roboto, Arial, sans-serif',
  display:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", "Segoe UI Variable Display", "Segoe UI", Roboto, Arial, sans-serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace',
} as const;
