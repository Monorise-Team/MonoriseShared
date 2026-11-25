import { act, fireEvent, render, screen } from "@testing-library/react";
import { Inbox, Palette, Settings, Star, Tag } from "lucide-react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppearanceControls,
  ResizableSplitPane,
  Select,
  SettingRow,
  SettingSection,
  SettingToggleRow,
  SettingsLayout,
  SidebarAccordion,
  SidebarCollapseButton,
  SidebarItem,
  SidebarLink,
  SidebarNav,
  SidebarShell,
  ThemeProvider,
  TitleBar,
  WindowControls,
  useTheme,
} from "../src/index.js";

function resetEnv() {
  const root = document.documentElement;
  root.className = "";
  delete root.dataset.theme;
  delete root.dataset.backdrop;
  delete root.dataset.fontScale;
  delete root.dataset.density;
  window.localStorage.clear();
}

function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const original = window.matchMedia;

  const mql = {
    get matches() {
      return matches;
    },
    media: "(max-width: 760px)",
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;

  const impl = vi.fn((query: string) => {
    if (query === "(max-width: 760px)") return mql;
    return {
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
  });

  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: impl });

  return {
    setMatches(next: boolean) {
      matches = next;
      const event = { matches: next, media: "(max-width: 760px)" } as MediaQueryListEvent;
      for (const listener of listeners) listener(event);
    },
    restore() {
      if (original) {
        Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: original });
      } else {
        delete (window as { matchMedia?: unknown }).matchMedia;
      }
    },
  };
}

beforeEach(() => {
  resetEnv();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SidebarShell, SidebarCollapseButton i SidebarAccordion", () => {
  it("przełącza szerokość między w-60 a w-16 i zachowuje dostępną nazwę pozycji", () => {
    const media = mockMatchMedia(false);
    render(
      <SidebarShell aria-label="Boczny" footer={<SidebarCollapseButton />}>
        <SidebarNav>
          <SidebarItem icon={<Inbox />} label="Odebrane" count={5} active />
          <SidebarLink icon={<Star />} label="Oznaczone" href="#starred" />
        </SidebarNav>
      </SidebarShell>,
    );

    const aside = screen.getByLabelText("Boczny");
    expect(aside).toHaveClass("mr-card", "mr-side", "mr-sidebar-shell", "w-60");
    expect(aside).not.toHaveAttribute("data-collapsed");

    const toggle = screen.getByRole("button", { name: "Zwiń pasek boczny" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);

    expect(aside).toHaveClass("w-16");
    expect(aside).toHaveAttribute("data-collapsed", "true");
    expect(screen.getByRole("button", { name: "Rozwiń pasek boczny" })).toHaveAttribute("aria-expanded", "false");

    const inboxButton = screen.getByRole("button", { name: "Odebrane" });
    expect(inboxButton).toHaveClass("mr-nav-indicator");
    expect(inboxButton).toHaveAttribute("data-active", "true");
    expect(screen.getByText("Odebrane")).toHaveClass("sr-only");
    expect(screen.getByRole("link", { name: "Oznaczone" })).toBeInTheDocument();

    fireEvent.focus(inboxButton);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Odebrane");

    media.restore();
  });

  it("automatycznie zwija się poniżej 760 px i ukrywa przycisk zwijania", () => {
    const media = mockMatchMedia(true);
    render(
      <SidebarShell aria-label="Boczny" footer={<SidebarCollapseButton />}>
        <SidebarNav>
          <SidebarItem icon={<Inbox />} label="Odebrane" />
        </SidebarNav>
      </SidebarShell>,
    );

    const aside = screen.getByLabelText("Boczny");
    expect(aside).toHaveClass("w-16");
    expect(aside).toHaveAttribute("data-collapsed", "true");
    expect(aside).toHaveAttribute("data-compact", "true");
    expect(screen.queryByRole("button", { name: /pasek boczny/i })).toBeNull();

    act(() => {
      media.setMatches(false);
    });

    expect(aside).toHaveClass("w-60");
    expect(aside).not.toHaveAttribute("data-compact");
    expect(screen.getByRole("button", { name: "Zwiń pasek boczny" })).toBeInTheDocument();

    media.restore();
  });

  it("obsługuje kontrolowane zwijanie i rozwijanie akordeonów z animacją grid-rows", () => {
    const onCollapsedChange = vi.fn();
    render(
      <SidebarShell collapsed={false} onCollapsedChange={onCollapsedChange} footer={<SidebarCollapseButton />}>
        <SidebarNav>
          <SidebarAccordion title="Foldery" defaultOpen={false}>
            <SidebarItem icon={<Inbox />} label="Wersje robocze" />
          </SidebarAccordion>
          <SidebarAccordion title="Etykiety" visibleCount={1}>
            <SidebarItem icon={<Tag />} label="Klienci" />
            <SidebarItem icon={<Tag />} label="Faktury" />
            <SidebarItem icon={<Tag />} label="Zespół" />
          </SidebarAccordion>
        </SidebarNav>
      </SidebarShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Zwiń pasek boczny" }));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);

    const foldersBtn = screen.getByRole("button", { name: "Foldery" });
    expect(foldersBtn).toHaveAttribute("aria-expanded", "false");
    const foldersPanel = document.getElementById(foldersBtn.getAttribute("aria-controls")!);
    expect(foldersPanel).toHaveClass("grid-rows-[0fr]");

    fireEvent.click(foldersBtn);
    expect(foldersBtn).toHaveAttribute("aria-expanded", "true");
    expect(foldersPanel).toHaveClass("grid-rows-[1fr]");

    const moreBtn = screen.getByRole("button", { name: "Pokaż więcej" });
    expect(moreBtn).toHaveAttribute("aria-expanded", "false");
    const labelsPanel = document.getElementById(moreBtn.getAttribute("aria-controls")!);
    expect(labelsPanel).toHaveClass("grid-rows-[0fr]");

    fireEvent.click(moreBtn);
    expect(screen.getByRole("button", { name: "Pokaż mniej" })).toHaveAttribute("aria-expanded", "true");
    expect(labelsPanel).toHaveClass("grid-rows-[1fr]");
  });
});

describe("ResizableSplitPane", () => {
  it("zmienia rozmiar klawiaturą o 16 px, pilnuje limitów, resetuje i zapisuje w localStorage", () => {
    const onSizeChange = vi.fn();
    render(
      <ResizableSplitPane
        defaultSize={320}
        minSize={240}
        maxSize={400}
        storageKey="test-split-size"
        onSizeChange={onSizeChange}
        primary={<div>Lista</div>}
        secondary={<div>Treść</div>}
      />,
    );

    const separator = screen.getByRole("separator");
    expect(separator).toHaveAttribute("aria-orientation", "vertical");
    expect(separator).toHaveAttribute("aria-valuenow", "320");
    expect(separator).toHaveAttribute("aria-valuemin", "240");
    expect(separator).toHaveAttribute("aria-valuemax", "400");

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(separator).toHaveAttribute("aria-valuenow", "336");
    expect(onSizeChange).toHaveBeenLastCalledWith(336);
    expect(window.localStorage.getItem("test-split-size")).toBe("336");

    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(separator).toHaveAttribute("aria-valuenow", "320");

    fireEvent.keyDown(separator, { key: "End" });
    expect(separator).toHaveAttribute("aria-valuenow", "400");
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(separator).toHaveAttribute("aria-valuenow", "400");

    fireEvent.keyDown(separator, { key: "Home" });
    expect(separator).toHaveAttribute("aria-valuenow", "240");
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(separator).toHaveAttribute("aria-valuenow", "240");

    fireEvent.doubleClick(separator);
    expect(separator).toHaveAttribute("aria-valuenow", "320");
    expect(window.localStorage.getItem("test-split-size")).toBe("320");
  });

  it("odtwarza zapisany rozmiar z localStorage, przeciąga myszą i wspiera układ pionowy", () => {
    window.localStorage.setItem("test-vertical-split", "300");
    render(
      <ResizableSplitPane
        orientation="vertical"
        defaultSize={260}
        minSize={150}
        maxSize={500}
        storageKey="test-vertical-split"
        primary={<div>Góra</div>}
        secondary={<div>Dół</div>}
      />,
    );

    const separator = screen.getByRole("separator");
    expect(separator).toHaveAttribute("aria-orientation", "horizontal");
    expect(separator).toHaveAttribute("aria-valuenow", "300");

    fireEvent.keyDown(separator, { key: "ArrowDown" });
    expect(separator).toHaveAttribute("aria-valuenow", "316");

    fireEvent.mouseDown(separator, { button: 0, clientY: 100 });
    fireEvent.mouseMove(document, { clientY: 140 });
    fireEvent.mouseUp(document, { clientY: 140 });
    expect(separator).toHaveAttribute("aria-valuenow", "356");
    expect(window.localStorage.getItem("test-vertical-split")).toBe("356");
  });
});

describe("WindowControls i TitleBar", () => {
  it("wywołuje akcje okna na Windows/Linux i nie renderuje nic na macOS", () => {
    const onMinimize = vi.fn();
    const onMaximize = vi.fn();
    const onClose = vi.fn();

    const { rerender, container } = render(
      <TitleBar title="Acme · Poczta">
        <WindowControls platform="windows" onMinimize={onMinimize} onMaximize={onMaximize} onClose={onClose} />
      </TitleBar>,
    );

    expect(screen.getByText("Acme · Poczta")).toBeInTheDocument();
    const minBtn = screen.getByRole("button", { name: "Minimalizuj" });
    const maxBtn = screen.getByRole("button", { name: "Maksymalizuj" });
    const closeBtn = screen.getByRole("button", { name: "Zamknij" });
    expect(minBtn).toHaveClass("w-[46px]");

    fireEvent.click(minBtn);
    fireEvent.click(maxBtn);
    fireEvent.click(closeBtn);
    expect(onMinimize).toHaveBeenCalledOnce();
    expect(onMaximize).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();

    rerender(<WindowControls platform="linux" maximized onMaximize={onMaximize} />);
    expect(screen.getByRole("button", { name: "Przywróć" })).toBeInTheDocument();

    rerender(<WindowControls platform="mac" onMinimize={onMinimize} onMaximize={onMaximize} onClose={onClose} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("SettingsLayout, SettingSection, SettingRow i SettingToggleRow", () => {
  it("renderuje układ z @container, przełącza sekcje i łączy etykiety kontrolek", () => {
    const onToggle = vi.fn();
    function DemoSettings() {
      const [active, setActive] = useState("ogolne");
      const [checked, setChecked] = useState(false);
      return (
        <SettingsLayout
          items={[
            { id: "ogolne", label: "Ogólne", icon: <Settings /> },
            { id: "wyglad", label: "Wygląd", icon: <Palette /> },
          ]}
          activeId={active}
          onActiveChange={setActive}
        >
          <SettingSection title="Preferencje" description="Podstawowe zachowanie aplikacji.">
            <SettingRow label="Język">
              <Select defaultValue="pl">
                <option value="pl">Polski</option>
                <option value="en">English</option>
              </Select>
            </SettingRow>
            <SettingRow label="Akcje">
              <button type="button">Eksportuj</button>
              <button type="button">Resetuj</button>
            </SettingRow>
            <SettingToggleRow
              label="Blokuj zdalne obrazy"
              description="Ukrywa zewnętrzną treść"
              checked={checked}
              onCheckedChange={setChecked}
              onToggle={onToggle}
            />
          </SettingSection>
        </SettingsLayout>
      );
    }

    const { container } = render(<DemoSettings />);
    expect(container.firstChild).toHaveClass("@container");
    expect(container.querySelector(".\\@max-\\[640px\\]\\:flex-col")).not.toBeNull();
    expect(screen.getByText("Podstawowe zachowanie aplikacji.")).toBeInTheDocument();

    expect(screen.getByRole("combobox", { name: "Język" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Akcje" })).toBeInTheDocument();

    const toggle = screen.getByRole("switch", { name: "Blokuj zdalne obrazy", checked: false });
    expect(toggle).toHaveAccessibleDescription("Ukrywa zewnętrzną treść");
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(screen.getByRole("switch", { name: "Blokuj zdalne obrazy", checked: true })).toBeInTheDocument();

    const appearanceNav = screen.getByRole("button", { name: "Wygląd" });
    fireEvent.click(appearanceNav);
    expect(appearanceNav).toHaveAttribute("aria-current", "page");
  });
});

describe("AppearanceControls", () => {
  function ThemeProbe() {
    const { appearance } = useTheme();
    return <output data-testid="theme-state">{JSON.stringify(appearance)}</output>;
  }

  it("zmienia motyw, tryb, tło, przyciemnienie i rozmycie przez useTheme", () => {
    render(
      <ThemeProvider>
        <AppearanceControls />
        <ThemeProbe />
      </ThemeProvider>,
    );

    const readState = () =>
      JSON.parse(screen.getByTestId("theme-state").textContent ?? "{}") as Record<string, unknown>;

    fireEvent.click(screen.getByRole("radio", { name: "Moonlight" }));
    expect(readState().theme).toBe("moonlight");
    expect(document.documentElement.dataset.theme).toBe("moonlight");

    const lightTab = screen.getByRole("tab", { name: "Jasny" });
    fireEvent.mouseDown(lightTab, { button: 0 });
    fireEvent.click(lightTab);
    expect(readState().mode).toBe("light");
    expect(document.documentElement).not.toHaveClass("dark");

    const gradientTab = screen.getByRole("tab", { name: "Gradient" });
    fireEvent.mouseDown(gradientTab, { button: 0 });
    fireEvent.click(gradientTab);
    expect(readState().backdrop).toBe("gradient");
    expect(document.documentElement.dataset.backdrop).toBe("gradient");

    fireEvent.change(screen.getByLabelText(/Przyciemnienie tapety/), { target: { value: "45" } });
    expect(readState().wallpaperDim).toBe(45);

    fireEvent.change(screen.getByLabelText(/Rozmycie tapety/), { target: { value: "14" } });
    expect(readState().wallpaperBlur).toBe(14);
  });

  it("pozwala nadpisać etykiety tekstowe przez props labels", () => {
    render(
      <ThemeProvider>
        <AppearanceControls
          labels={{
            theme: "Theme",
            mode: "Color mode",
            modeLight: "Light",
            modeDark: "Dark",
            modeSystem: "System",
            wallpaperDim: "Dim",
            wallpaperBlur: "Blur",
          }}
        />
      </ThemeProvider>,
    );

    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Light" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Dim/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Blur/)).toBeInTheDocument();
  });
});
