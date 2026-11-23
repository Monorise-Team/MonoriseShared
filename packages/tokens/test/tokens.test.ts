import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { accentVariables, resolveColors, semantic, themeNames, themes } from "../src/index.js";

const RGBA = /^rgba?\(\d+, \d+, \d+(, [\d.]+)?\)$|^#[0-9a-f]{6}$/i;

function luminance(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(hex.replace("#", "").slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

describe("tokens", () => {
  it("oba tryby mają te same nazwy kolorów", () => {
    expect(Object.keys(semantic.dark).sort()).toEqual(Object.keys(semantic.light).sort());
  });

  it.each(themeNames.flatMap((theme) => (["light", "dark"] as const).map((mode) => [theme, mode] as const)))(
    "%s w trybie %s rozwiązuje się do konkretnych kolorów",
    (theme, mode) => {
      const colors = resolveColors(mode, theme);
      for (const [name, value] of Object.entries(colors)) {
        expect(value, name).not.toContain("var(");
        expect(value, name).not.toContain("color-mix");
        expect(value, name).toMatch(RGBA);
      }
    },
  );

  it.each(themeNames.flatMap((theme) => (["light", "dark"] as const).map((mode) => [theme, mode] as const)))(
    "tekst na akcencie %s (%s) ma kontrast co najmniej 4,5:1",
    (theme, mode) => {
      const accent = themes[theme].accent[mode];
      expect(contrast(accent.accent, accent.accentFg)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(["light", "dark"] as const)(
    "biały tekst na czerwonym przycisku (%s) ma kontrast co najmniej 4,5:1",
    (mode) => {
      expect(contrast(semantic[mode]["danger-solid"]!, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("zmienne akcentu mają przedrostek --mr-", () => {
    expect(Object.keys(accentVariables("moonlight", "dark"))).toContain("--mr-accent");
  });

  it("wygenerowany CSS zawiera każdy motyw i każdy kolor", () => {
    const css = readFileSync(join(import.meta.dirname, "../dist/tokens.css"), "utf8");
    for (const theme of themeNames) expect(css).toContain(`:root.dark[data-theme="${theme}"]`);
    for (const name of Object.keys(semantic.light)) expect(css).toContain(`--mr-${name}:`);
    const tailwind = readFileSync(join(import.meta.dirname, "../dist/tailwind.css"), "utf8");
    for (const name of Object.keys(semantic.light)) expect(tailwind).toContain(`--color-${name}: var(--mr-${name});`);
  });
});
