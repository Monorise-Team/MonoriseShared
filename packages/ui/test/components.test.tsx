import { themeNames } from "@monorise-team/tokens";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  APPEARANCE_STORAGE_KEY,
  AppBackdrop,
  Avatar,
  Button,
  ConfirmDialog,
  Dialog,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  ListItem,
  SidebarItem,
  TextField,
  ThemeProvider,
  Tooltip,
  TooltipProvider,
  WALLPAPER_URLS,
  appearanceInitScript,
  applyAppearance,
  defaultAppearance,
  initials,
  readAppearance,
  useTheme,
} from "../src/index.js";

function resetDocumentAndStorage() {
  const root = document.documentElement;
  root.className = "";
  delete root.dataset.theme;
  delete root.dataset.backdrop;
  delete root.dataset.fontScale;
  delete root.dataset.density;
  window.localStorage.clear();
}

beforeEach(() => {
  resetDocumentAndStorage();
});

describe("Button", () => {
  it("domyślnie jest zwykłym przyciskiem, a nie przyciskiem wysyłającym formularz", () => {
    render(<Button>Zapisz</Button>);
    expect(screen.getByRole("button", { name: "Zapisz" })).toHaveAttribute("type", "button");
  });

  it("primary ma wypełnienie akcentem i czytelny tekst na nim", () => {
    render(<Button variant="primary">Napisz</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-accent", "text-accent-fg");
  });

  it("asChild przekazuje wygląd do linku", () => {
    render(
      <Button asChild variant="primary">
        <a href="/pobierz">Pobierz</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Pobierz" });
    expect(link).toHaveClass("bg-accent");
    expect(link).not.toHaveAttribute("type");
  });
});

describe("TextField", () => {
  it("łączy etykietę z polem i oznacza błąd", () => {
    render(<TextField label="Adres e-mail" error="Nieprawidłowy adres" />);
    const input = screen.getByLabelText("Adres e-mail");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Nieprawidłowy adres");
  });
});

describe("ConfirmDialog i warstwy z-index", () => {
  function Example({ onConfirm }: { onConfirm: () => void }) {
    const [open, setOpen] = useState(true);
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Usunąć skrzynkę?"
        description="Wiadomości zostaną u dostawcy poczty."
        confirmLabel="Usuń"
        danger
        onConfirm={onConfirm}
      />
    );
  }

  it("pokazuje okno z tytułem i potwierdza akcję", () => {
    let confirmed = 0;
    render(<Example onConfirm={() => (confirmed += 1)} />);
    const dialog = screen.getByRole("dialog", { name: "Usunąć skrzynkę?" });
    expect(dialog).toHaveTextContent("Wiadomości zostaną u dostawcy poczty.");
    expect(dialog).toHaveClass("z-[var(--mr-z-modal)]");
    expect(dialog).not.toHaveClass("z-50");
    fireEvent.click(screen.getByRole("button", { name: "Usuń" }));
    expect(confirmed).toBe(1);
  });

  it("Dialog, Menu i Tooltip używają zmiennych --mr-z-* zamiast z-50", () => {
    render(
      <Dialog open onOpenChange={() => {}} title="Okno" description="Treść">
        Zawartość
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Okno" });
    expect(dialog).toHaveClass("z-[var(--mr-z-modal)]");
    expect(dialog).not.toHaveClass("z-50");
    const overlay = document.querySelector(".mr-overlay");
    expect(overlay).toHaveClass("z-[var(--mr-z-overlay)]");
    expect(overlay).not.toHaveClass("z-50");
    cleanup();

    render(
      <Menu open>
        <MenuTrigger asChild>
          <Button>Menu</Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem>Pozycja</MenuItem>
        </MenuContent>
      </Menu>,
    );
    const menu = screen.getByRole("menu");
    expect(menu).toHaveClass("z-[var(--mr-z-dropdown)]");
    expect(menu).not.toHaveClass("z-50");
    cleanup();

    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip content="Podpowiedź">
          <Button>Cel</Button>
        </Tooltip>
      </TooltipProvider>,
    );
    fireEvent.focus(screen.getByRole("button", { name: "Cel" }));
    const tooltip = document.querySelector(".mr-float");
    expect(tooltip).toHaveClass("z-[var(--mr-z-tooltip)]");
    expect(tooltip).not.toHaveClass("z-50");
  });
});

describe("Sidebar i lista", () => {
  it("aktywna pozycja ma aria-current, data-active i licznik", () => {
    render(<SidebarItem label="Odebrane" count={12} active />);
    const item = screen.getByRole("button", { name: /Odebrane/ });
    expect(item).toHaveAttribute("aria-current", "page");
    expect(item).toHaveAttribute("data-active", "true");
    expect(item).toHaveClass("mr-nav-indicator", "text-accent-strong");
    expect(item).toHaveTextContent("12");
  });

  it("nieaktywna pozycja używa hover:bg-sidebar-hover", () => {
    render(<SidebarItem label="Wysłane" />);
    expect(screen.getByRole("button", { name: "Wysłane" })).toHaveClass("hover:bg-sidebar-hover");
  });

  it("wiersz listy pogrubia nieprzeczytane i korzysta z tokenów gęstości", () => {
    render(<ListItem title="Anna Kowalska" subtitle="Faktura za listopad" unread />);
    expect(screen.getByText("Anna Kowalska")).toHaveClass("font-semibold");
    expect(screen.getByRole("button")).toHaveClass("px-[var(--mr-row-px)]", "py-[var(--mr-row-py)]");
  });
});

describe("Avatar", () => {
  it("pokazuje inicjały z imienia i nazwiska albo z adresu", () => {
    expect(initials("Anna Kowalska")).toBe("AK");
    expect(initials("anna@acme.com")).toBe("AN");
    render(<Avatar name="Anna Kowalska" />);
    expect(screen.getByRole("img", { name: "Anna Kowalska" })).toHaveTextContent("AK");
  });
});

describe("wygląd i AppBackdrop", () => {
  it("uszkodzony albo pusty zapis daje wygląd domyślny", () => {
    const storage = { getItem: (key: string) => (key === APPEARANCE_STORAGE_KEY ? "{nie json" : null) };
    expect(readAppearance(storage)).toEqual(defaultAppearance);
    expect(readAppearance(undefined)).toEqual(defaultAppearance);
  });

  it("zachowuje zgodność ze starszym zapisem bez nowych pól", () => {
    const legacy = JSON.stringify({ mode: "light", theme: "moonlight", reduceMotion: true, glass: false });
    const storage = { getItem: (key: string) => (key === APPEARANCE_STORAGE_KEY ? legacy : null) };
    expect(readAppearance(storage)).toEqual({
      mode: "light",
      theme: "moonlight",
      reduceMotion: true,
      glass: false,
      backdrop: "wallpaper",
      wallpaperDim: 0,
      wallpaperBlur: 0,
      fontScale: "default",
      density: "default",
    });
  });

  it("odczytuje i ogranicza wallpaperDim, wallpaperBlur, fontScale, density oraz backdrop", () => {
    const raw = JSON.stringify({
      mode: "dark",
      theme: "emerald",
      backdrop: "gradient",
      wallpaperDim: 120,
      wallpaperBlur: -5,
      fontScale: "large",
      density: "compact",
    });
    const storage = { getItem: (key: string) => (key === APPEARANCE_STORAGE_KEY ? raw : null) };
    expect(readAppearance(storage)).toEqual({
      mode: "dark",
      theme: "emerald",
      backdrop: "gradient",
      wallpaperDim: 80,
      wallpaperBlur: 0,
      fontScale: "large",
      density: "compact",
      reduceMotion: false,
      glass: true,
    });
  });

  it("ustawia tryb, motyw, tło, skalę tekstu, gęstość, ruch i szkło na <html>", () => {
    const root = document.documentElement;
    applyAppearance(
      root,
      {
        mode: "system",
        theme: "moonlight",
        backdrop: "gradient",
        wallpaperDim: 20,
        wallpaperBlur: 8,
        fontScale: "xlarge",
        density: "spacious",
        reduceMotion: true,
        glass: false,
      },
      false,
    );
    expect(root).not.toHaveClass("dark");
    expect(root).toHaveClass("reduce-motion", "no-glass");
    expect(root.dataset.theme).toBe("moonlight");
    expect(root.dataset.backdrop).toBe("gradient");
    expect(root.dataset.fontScale).toBe("xlarge");
    expect(root.dataset.density).toBe("spacious");

    // Zgodność wsteczna: starsze wywołanie bez nowych pól
    applyAppearance(root, { mode: "dark", theme: "mono", reduceMotion: false, glass: true }, false);
    expect(root).toHaveClass("dark");
    expect(root).not.toHaveClass("reduce-motion", "no-glass");
    expect(root.dataset.backdrop).toBe("wallpaper");
    expect(root.dataset.fontScale).toBe("default");
    expect(root.dataset.density).toBe("default");
  });

  it("skrypt startowy ustawia klasy i atrybuty z localStorage", () => {
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({
        mode: "light",
        theme: "amethyst",
        backdrop: "gradient",
        fontScale: "small",
        density: "compact",
        reduceMotion: true,
        glass: false,
      }),
    );
    new Function(appearanceInitScript)();
    const root = document.documentElement;
    expect(root).not.toHaveClass("dark");
    expect(root).toHaveClass("reduce-motion", "no-glass");
    expect(root.dataset.theme).toBe("amethyst");
    expect(root.dataset.backdrop).toBe("gradient");
    expect(root.dataset.fontScale).toBe("small");
    expect(root.dataset.density).toBe("compact");
  });

  it("ThemeProvider udostępnia i zapisuje nowe ustawienia wyglądu", () => {
    function Probe() {
      const { appearance, setAppearance } = useTheme();
      return (
        <div>
          <span data-testid="state">{JSON.stringify(appearance)}</span>
          <button
            type="button"
            onClick={() =>
              setAppearance({
                theme: "amethyst",
                wallpaperDim: 35,
                wallpaperBlur: 12,
                fontScale: "large",
                density: "spacious",
              })
            }
          >
            Zmień
          </button>
        </div>
      );
    }

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Zmień" }));
    const saved = JSON.parse(window.localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    expect(saved).toMatchObject({
      theme: "amethyst",
      wallpaperDim: 35,
      wallpaperBlur: 12,
      fontScale: "large",
      density: "spacious",
    });
    expect(document.documentElement.dataset.fontScale).toBe("large");
    expect(document.documentElement.dataset.density).toBe("spacious");
  });

  it.each(themeNames)("AppBackdrop renderuje tapetę motywu %s", (theme) => {
    const { container } = render(
      <ThemeProvider initial={{ theme }}>
        <AppBackdrop />
      </ThemeProvider>,
    );
    const backdrop = container.querySelector(".mr-backdrop");
    const image = container.querySelector<HTMLElement>(".mr-backdrop-image");
    expect(backdrop).toHaveAttribute("data-backdrop", "wallpaper");
    expect(backdrop).toHaveAttribute("data-wallpaper", theme);
    expect(image).not.toBeNull();
    expect(image!.style.backgroundImage).toContain(WALLPAPER_URLS[theme]);
    expect(image!.style.backgroundImage).toContain(`${theme}.jpg`);
  });

  it("AppBackdrop renderuje zapasowy gradient oraz przyciemnienie i rozmycie", () => {
    const { container, rerender } = render(
      <ThemeProvider initial={{ theme: "moonlight", wallpaperDim: 40, wallpaperBlur: 16 }}>
        <AppBackdrop />
      </ThemeProvider>,
    );
    const backdrop = container.querySelector<HTMLElement>(".mr-backdrop");
    const image = container.querySelector<HTMLElement>(".mr-backdrop-image");
    const dim = container.querySelector<HTMLElement>(".mr-backdrop-dim");
    expect(image).toHaveClass("is-blurred");
    expect(dim).not.toBeNull();
    expect(backdrop!.style.getPropertyValue("--mr-wallpaper-dim")).toBe("0.4");
    expect(backdrop!.style.getPropertyValue("--mr-wallpaper-blur")).toBe("16px");

    rerender(
      <ThemeProvider initial={{ theme: "moonlight", backdrop: "gradient" }}>
        <AppBackdrop backdrop="gradient" />
      </ThemeProvider>,
    );
    expect(container.querySelector(".mr-backdrop")).toHaveClass("mr-backdrop-gradient");
    expect(container.querySelector(".mr-backdrop")).toHaveAttribute("data-backdrop", "gradient");
    expect(container.querySelector(".mr-backdrop-image")).toBeNull();
  });

  it("styles.css zawiera reguły aven-mail dla .mr-middle, wypłowienia, rozmycia i no-glass", () => {
    const css = readFileSync(join(import.meta.dirname, "../src/styles.css"), "utf8");
    expect(css).toContain(".dark .mr-middle");
    expect(css).toContain("var(--mr-middle-text-tertiary, #b9ccd5)");
    expect(css).toContain("contrast(0.58) brightness(1.4) saturate(0.85)");
    expect(css).toContain("transform: scale(1.06);");
    expect(css).toContain(":root.no-glass .mr-backdrop-image.is-blurred");
    expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
  });
});
