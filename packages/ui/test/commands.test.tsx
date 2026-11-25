import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CommandPalette,
  ShortcutRecorder,
  ShortcutsHelp,
  createSequenceTracker,
  findShortcutConflict,
  formatShortcut,
  matchesShortcut,
  normalizeShortcut,
  parseShortcut,
  recordShortcut,
  useCommandPalette,
  useHotkeys,
  validateShortcut,
  type CommandPaletteGroup,
  type ShortcutHelpCategory,
} from "../src/index.js";

const keyEvt = (key: string, extra: Partial<KeyboardEvent> = {}) => ({
  key,
  code: "",
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...extra,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("shortcuts helpers", () => {
  it("parsuje i formatuje akordy, shift+? oraz sekwencje dla Apple i Windows/Linux", () => {
    expect(parseShortcut("mod+k")).toMatchObject({
      isSequence: false,
      normalized: "mod+k",
    });
    expect(parseShortcut("mod++")).toMatchObject({
      isSequence: false,
      normalized: "mod+Plus",
    });
    expect(parseShortcut("shift+?")).toMatchObject({
      isSequence: false,
      normalized: "?",
    });
    expect(parseShortcut("g i")).toMatchObject({
      isSequence: true,
      normalized: "g i",
    });
    expect(normalizeShortcut("g then I")).toBe("g i");

    expect(formatShortcut("mod+k", { mac: true })).toBe("⌘K");
    expect(formatShortcut("mod+k", { mac: false })).toBe("Ctrl+K");
    expect(formatShortcut("mod+alt+space", { mac: true })).toBe("⌘⌥␣");
    expect(formatShortcut("mod+alt+space", { mac: false })).toBe("Ctrl+Alt+␣");
    expect(formatShortcut("g i", { mac: true })).toBe("G → I");
    expect(formatShortcut("shift+?", { mac: false })).toBe("?");
    expect(formatShortcut("", { mac: true })).toBe("-");
    expect(() => parseShortcut("mod+Nieznany")).toThrow();
  });

  it("dopasowuje skróty per platforma i obsługuje Option na macOS oraz AltGr", () => {
    expect(matchesShortcut(keyEvt("k", { metaKey: true }), "mod+k", { mac: true })).toBe(true);
    expect(matchesShortcut(keyEvt("k", { ctrlKey: true }), "mod+k", { mac: true })).toBe(false);
    expect(matchesShortcut(keyEvt("k", { ctrlKey: true }), "mod+k", { mac: false })).toBe(true);
    expect(matchesShortcut(keyEvt("k", { metaKey: true }), "mod+k", { mac: false })).toBe(false);

    expect(matchesShortcut(keyEvt("?", { shiftKey: true }), "shift+?")).toBe(true);
    expect(matchesShortcut(keyEvt("?"), "shift+?")).toBe(true);
    expect(matchesShortcut(keyEvt("J", { shiftKey: true }), "j")).toBe(false);
    expect(
      matchesShortcut(keyEvt("˚", { code: "KeyK", metaKey: true, altKey: true }), "mod+alt+k", { mac: true }),
    ).toBe(true);

    const altGr = { ...keyEvt("k", { ctrlKey: true, altKey: true }), getModifierState: () => true };
    expect(matchesShortcut(altGr, "ctrl+alt+k", { mac: false })).toBe(false);
  });

  it("nagrywa akordy i odrzuca klawisze modyfikatorów oraz AltGr", () => {
    expect(recordShortcut(keyEvt("k", { metaKey: true }), { mac: true })).toBe("mod+k");
    expect(recordShortcut(keyEvt("k", { ctrlKey: true }), { mac: false })).toBe("mod+k");
    expect(recordShortcut(keyEvt("k", { ctrlKey: true }), { mac: true })).toBeNull();
    expect(recordShortcut(keyEvt("Shift"))).toBeNull();
    expect(recordShortcut(keyEvt("?", { shiftKey: true }), { mac: false })).toBe("?");
  });

  it("śledzi sekwencje w oknie 1 s i odrzuca po upływie czasu", () => {
    vi.useFakeTimers();
    const tracker = createSequenceTracker(1000);
    const items = [{ shortcut: "g i", id: "inbox" }];

    expect(tracker.match(keyEvt("g"), items, { mac: false }).status).toBe("pending");
    vi.advanceTimersByTime(500);
    expect(tracker.match(keyEvt("i"), items, { mac: false })).toMatchObject({
      status: "matched",
      shortcut: "g i",
    });

    expect(tracker.match(keyEvt("g"), items, { mac: false }).status).toBe("pending");
    vi.advanceTimersByTime(1001);
    expect(tracker.match(keyEvt("i"), items, { mac: false }).status).toBe("none");
  });

  it("wykrywa konflikty, konflikty prefiksów sekwencji oraz zastrzeżone skróty", () => {
    const existing = {
      inbox: "g i",
      palette: "mod+k",
      help: "?",
    };

    expect(validateShortcut("mod+k", existing)).toMatchObject({ type: "conflict", conflictId: "palette" });
    expect(findShortcutConflict("g", existing)).toBe("inbox");
    expect(findShortcutConflict("shift+?", existing)).toBe("help");
    expect(findShortcutConflict("mod+q", existing)).toBe("reserved");
    expect(findShortcutConflict("mod+p", existing, { reserved: ["mod+p"] })).toBe("reserved");
    expect(findShortcutConflict("mod+k", existing, { currentId: "palette" })).toBeNull();
  });
});

describe("useHotkeys", () => {
  it("obsługuje sekwencje w oknie 1 s i anuluje po 1 s oraz przy odmontowaniu", () => {
    vi.useFakeTimers();
    const onInbox = vi.fn();

    const { unmount } = renderHook(() => useHotkeys({ "g i": onInbox }, { mac: false }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "g", bubbles: true, cancelable: true }));
      vi.advanceTimersByTime(900);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "i", bubbles: true, cancelable: true }));
    });
    expect(onInbox).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "g", bubbles: true, cancelable: true }));
      vi.advanceTimersByTime(1001);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "i", bubbles: true, cancelable: true }));
    });
    expect(onInbox).toHaveBeenCalledTimes(1);

    unmount();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "g", bubbles: true, cancelable: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "i", bubbles: true, cancelable: true }));
    });
    expect(onInbox).toHaveBeenCalledTimes(1);
  });

  it("ignoruje zdarzenia z input, textarea, select i contenteditable bez allowInInputs", () => {
    const onTrigger = vi.fn();
    const onAllowed = vi.fn();
    renderHook(() =>
      useHotkeys(
        [
          { shortcut: "k", handler: onTrigger },
          { shortcut: "mod+k", handler: onAllowed, allowInInputs: true },
        ],
        { mac: false },
      ),
    );

    for (const tag of ["input", "textarea", "select", "div"] as const) {
      const el = document.createElement(tag);
      if (tag === "div") el.setAttribute("contenteditable", "true");
      document.body.append(el);
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true, cancelable: true }));
      expect(onTrigger).not.toHaveBeenCalled();

      el.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }));
      el.remove();
    }
    expect(onAllowed).toHaveBeenCalledTimes(4);
  });

  it("respektuje flagę disabled", () => {
    const handler = vi.fn();
    const { rerender } = renderHook(({ disabled }) => useHotkeys({ "mod+k": handler }, { disabled, mac: false }), {
      initialProps: { disabled: true },
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    expect(handler).not.toHaveBeenCalled();

    rerender({ disabled: false });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("CommandPalette", () => {
  function PaletteHarness({
    onInvite = vi.fn(),
    onCompany = vi.fn(),
    onSearch,
    slash = false,
    enableSourceToggles = false,
  }: {
    onInvite?: () => void;
    onCompany?: () => void;
    onSearch?: (query: string) => Promise<CommandPaletteGroup[]>;
    slash?: boolean;
    enableSourceToggles?: boolean;
  }) {
    const palette = useCommandPalette({ slash, mac: false });
    const groups: CommandPaletteGroup[] = [
      {
        id: "company",
        label: "Firma",
        items: [
          {
            id: "company-settings",
            label: "Ustawienia firmy",
            description: "Dane organizacji",
            shortcut: "g f",
            onSelect: onCompany,
          },
        ],
      },
      {
        id: "employees",
        label: "Pracownicy",
        items: [
          {
            id: "invite",
            label: "Zaproś osobę…",
            keywords: ["dodaj", "zespół"],
            shortcut: "mod+i",
            onSelect: onInvite,
          },
          {
            id: "attachments",
            label: "Załączniki",
            onSelect: () => {},
          },
        ],
      },
    ];

    return (
      <>
        <input aria-label="Pole" />
        <CommandPalette
          open={palette.open}
          onOpenChange={palette.onOpenChange}
          groups={groups}
          onSearch={onSearch}
          enableSourceToggles={enableSourceToggles}
          mac={false}
        />
      </>
    );
  }

  it("otwiera się skrótem mod+k (i opcjonalnie /) w portalu z warstwą modalną", () => {
    render(<PaletteHarness slash />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // "/" w polu tekstowym nie otwiera palety
    fireEvent.keyDown(screen.getByLabelText("Pole"), { key: "/" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // "/" poza polem tekstowym otwiera paletę
    fireEvent.keyDown(window, { key: "/" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // mod+k otwiera paletę w portalu z warstwą modalną
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveClass("mr-float", "z-[var(--mr-z-modal)]");
    expect(dialog.parentElement).toBe(document.body);
  });

  it("filtruje bez polskich znaków („zapros” → „Zaproś osobę…”) i nawiguje strzałkami/Home/End/Enter", () => {
    const onInvite = vi.fn();
    const onCompany = vi.fn();
    render(<PaletteHarness onInvite={onInvite} onCompany={onCompany} />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = screen.getByRole("combobox");
    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeInTheDocument();
    expect(screen.getByText("Firma")).toBeInTheDocument();
    expect(screen.getByText("Pracownicy")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+I")).toBeInTheDocument();
    expect(screen.getByText("Strzałki: wybór, Enter: otwórz, Escape: zamknij.")).toBeInTheDocument();

    // Nawigacja ArrowDown / End / Home
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const optionsBeforeFilter = screen.getAllByRole("option");
    expect(input).toHaveAttribute("aria-activedescendant", optionsBeforeFilter[1]!.id);

    fireEvent.keyDown(input, { key: "End" });
    expect(input).toHaveAttribute("aria-activedescendant", optionsBeforeFilter[2]!.id);
    expect(optionsBeforeFilter[2]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "Home" });
    expect(input).toHaveAttribute("aria-activedescendant", optionsBeforeFilter[0]!.id);

    // Filtrowanie bez polskich znaków (w tym "ł" -> "l")
    fireEvent.change(input, { target: { value: "zalaczniki" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option", { name: /Załączniki/ })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "zapros" } });
    const filteredOptions = screen.getAllByRole("option");
    expect(filteredOptions).toHaveLength(1);
    expect(filteredOptions[0]).toHaveTextContent("Zaproś osobę…");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onInvite).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("pozwala przełączać widoczność źródeł w palecie", () => {
    render(<PaletteHarness enableSourceToggles />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(screen.getByRole("option", { name: /Ustawienia firmy/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filtruj źródła" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Firma" }));
    expect(screen.queryByRole("option", { name: /Ustawienia firmy/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Zaproś osobę/ })).toBeInTheDocument();
  });

  it("obsługuje asynchroniczne onSearch ze stanem ładowania", async () => {
    let resolveSearch!: (groups: CommandPaletteGroup[]) => void;
    const onSearch = vi.fn(
      () =>
        new Promise<CommandPaletteGroup[]>((resolve) => {
          resolveSearch = resolve;
        }),
    );

    render(<PaletteHarness onSearch={onSearch} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Anna" } });

    expect(screen.getByRole("listbox")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Wyszukiwanie…");

    await act(async () => {
      resolveSearch([
        {
          id: "people",
          label: "Osoby",
          items: [{ id: "anna", label: "Anna Kowalska", onSelect: () => {} }],
        },
      ]);
    });

    await waitFor(() => expect(screen.getByRole("option", { name: /Anna Kowalska/ })).toBeInTheDocument());
    expect(screen.getByRole("listbox")).not.toHaveAttribute("aria-busy");
  });
});

describe("ShortcutsHelp", () => {
  const categories: ShortcutHelpCategory[] = [
    {
      category: "Nawigacja",
      items: [
        { label: "Przejdź do firmy", shortcut: "g f" },
        { label: "Paleta poleceń", shortcut: "mod+k" },
      ],
    },
    {
      category: "Pomoc",
      items: [{ label: "Pokaż skróty", shortcut: "?" }],
    },
  ];

  it("renderuje kategorie ze sformatowanymi etykietami Kbd i otwiera się pod ?", () => {
    render(<ShortcutsHelp categories={categories} bindShortcut mac={true} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "?", shiftKey: true });
    expect(screen.getByRole("dialog", { name: "Skróty klawiszowe" })).toBeInTheDocument();
    expect(screen.getByText("Nawigacja")).toBeInTheDocument();
    expect(screen.getByText("Pomoc")).toBeInTheDocument();
    expect(screen.getByText("G → F")).toBeInTheDocument();
    expect(screen.getByText("⌘K")).toBeInTheDocument();
  });
});

describe("ShortcutRecorder", () => {
  function RecorderHarness({
    initial = "mod+i",
    onChangeSpy,
  }: {
    initial?: string;
    onChangeSpy?: (v: string) => void;
  }) {
    const [value, setValue] = useState(initial);
    return (
      <ShortcutRecorder
        label="Zaproś osobę"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChangeSpy?.(next);
        }}
        mac={false}
        validate={(candidate) =>
          validateShortcut(candidate, { palette: "mod+k", inbox: "g i" }, { reserved: ["mod+w"] })
        }
      />
    );
  }

  it("nagrywa akord i sekwencję, Escape anuluje, Backspace czyści, a walidator zgłasza konflikty", () => {
    const onChangeSpy = vi.fn();
    render(<RecorderHarness onChangeSpy={onChangeSpy} />);

    const button = screen.getByRole("button", { name: "Zmień skrót: Zaproś osobę" });
    expect(button).toHaveTextContent("Ctrl+I");

    // Escape anuluje bez zmiany wartości
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(button, { key: "Escape" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveTextContent("Ctrl+I");
    expect(onChangeSpy).not.toHaveBeenCalled();

    // Konflikt z istniejącym skrótem
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "k", ctrlKey: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Ten skrót jest już zajęty.");
    expect(onChangeSpy).not.toHaveBeenCalled();

    // Skrót zastrzeżony
    fireEvent.keyDown(button, { key: "w", ctrlKey: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Ten skrót jest zarezerwowany przez system.");
    expect(onChangeSpy).not.toHaveBeenCalled();

    // Nagranie poprawnego akordu
    fireEvent.keyDown(button, { key: "u", ctrlKey: true });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(button).toHaveTextContent("Ctrl+U");
    expect(onChangeSpy).toHaveBeenLastCalledWith("mod+u");

    // Nagranie sekwencji dwóch klawiszy
    fireEvent.click(screen.getByRole("checkbox", { name: "Sekwencja dwóch klawiszy" }));
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "g" });
    expect(button).toHaveTextContent("G → …");
    fireEvent.keyDown(button, { key: "p" });
    expect(button).toHaveTextContent("G → P");
    expect(onChangeSpy).toHaveBeenLastCalledWith("g p");

    // Backspace czyści skrót
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "Backspace" });
    expect(button).toHaveTextContent("-");
    expect(onChangeSpy).toHaveBeenLastCalledWith("");
  });

  it("zatrzymuje propagację zdarzenia podczas nagrywania, żeby nie otwierać palety przez /", () => {
    function CombinedHarness() {
      const palette = useCommandPalette({ slash: true, mac: false });
      const [shortcut, setShortcut] = useState("mod+i");
      return (
        <>
          <ShortcutRecorder label="Akcja" value={shortcut} onChange={setShortcut} mac={false} />
          <CommandPalette
            open={palette.open}
            onOpenChange={palette.onOpenChange}
            groups={[{ id: "g", label: "Grupa", items: [{ id: "1", label: "Pozycja", onSelect: () => {} }] }]}
          />
        </>
      );
    }

    render(<CombinedHarness />);
    const button = screen.getByRole("button", { name: "Zmień skrót: Akcja" });
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "/" });
    expect(button).toHaveTextContent("/");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
