import {
  Button,
  CommandPalette,
  Kbd,
  ShortcutRecorder,
  ShortcutsHelp,
  formatShortcut,
  useCommandPalette,
  useTheme,
  validateShortcut,
  type CommandPaletteGroup,
  type ShortcutHelpCategory,
} from "@monorise-team/ui";
import { AppWindow, Building2, FolderTree, Keyboard, Moon, Search, Shield, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";

const SAMPLE_PEOPLE = [
  { id: "anna", name: "Anna Kowalska", role: "Kierowniczka zespołu · anna@acme.com" },
  { id: "marek", name: "Marek Nowak", role: "Księgowość · marek@acme.com" },
  { id: "zofia", name: "Zofia Wiśniewska", role: "Kadry · zofia@acme.com" },
];

const SHORTCUT_CATEGORIES: readonly ShortcutHelpCategory[] = [
  {
    category: "Nawigacja",
    items: [
      { id: "company", label: "Ustawienia firmy", shortcut: "g f" },
      { id: "structure", label: "Struktura i działy", shortcut: "g d" },
      { id: "employees", label: "Lista pracowników", shortcut: "g p" },
    ],
  },
  {
    category: "Działania",
    items: [
      { id: "invite", label: "Zaproś osobę…", shortcut: "mod+i" },
      { id: "palette", label: "Paleta poleceń", shortcut: "mod+k" },
      { id: "help", label: "Skróty klawiszowe", shortcut: "?" },
    ],
  },
];

/** Paleta poleceń, ściąga skrótów i przycisk nagrywania skrótu. */
export function CommandsSection() {
  const palette = useCommandPalette({ slash: true });
  const [helpOpen, setHelpOpen] = useState(false);
  const [lastAction, setLastAction] = useState<string>("Brak");
  const [customShortcut, setCustomShortcut] = useState("mod+i");
  const { resolvedMode, setAppearance } = useTheme();

  const groups = useMemo<CommandPaletteGroup[]>(
    () => [
      {
        id: "company",
        label: "Firma",
        items: [
          {
            id: "company-settings",
            label: "Ustawienia firmy",
            description: "Nazwa, NIP i dane rozliczeniowe Acme",
            icon: <Building2 />,
            shortcut: "g f",
            keywords: ["organizacja", "dane", "nazwa"],
            onSelect: () => setLastAction("Otwarto ustawienia firmy"),
          },
          {
            id: "company-structure",
            label: "Struktura i działy",
            description: "Jednostki organizacyjne i przełożeni",
            icon: <FolderTree />,
            shortcut: "g d",
            keywords: ["dzialy", "zespoly", "oddzialy"],
            onSelect: () => setLastAction("Otwarto strukturę firmy"),
          },
          {
            id: "company-roles",
            label: "Role i uprawnienia",
            icon: <Shield />,
            shortcut: "g r",
            keywords: ["dostep", "uprawnienia", "role"],
            onSelect: () => setLastAction("Otwarto role i uprawnienia"),
          },
        ],
      },
      {
        id: "employees",
        label: "Pracownicy",
        items: [
          {
            id: "employees-list",
            label: "Lista pracowników",
            description: "Aktywne konta w firmie Acme",
            icon: <Users />,
            shortcut: "g p",
            keywords: ["osoby", "pracownicy", "uzytkownicy"],
            onSelect: () => setLastAction("Otwarto listę pracowników"),
          },
          {
            id: "employees-invite",
            label: "Zaproś osobę…",
            description: "Wyślij zaproszenie do nowego pracownika",
            icon: <UserPlus />,
            shortcut: customShortcut,
            keywords: ["zaproszenie", "nowy pracownik", "dodaj"],
            onSelect: () => setLastAction("Otwarto formularz zaproszenia"),
          },
          {
            id: "employees-apps",
            label: "Dostęp do aplikacji",
            icon: <AppWindow />,
            keywords: ["timotime", "avenmail", "aplikacje"],
            onSelect: () => setLastAction("Otwarto dostęp do aplikacji"),
          },
        ],
      },
      {
        id: "app",
        label: "Aplikacja",
        items: [
          {
            id: "app-shortcuts",
            label: "Skróty klawiszowe",
            icon: <Keyboard />,
            shortcut: "?",
            keywords: ["pomoc", "klawisze"],
            onSelect: () => setHelpOpen(true),
          },
          {
            id: "app-theme",
            label: resolvedMode === "dark" ? "Przełącz na tryb jasny" : "Przełącz na tryb ciemny",
            icon: <Moon />,
            keywords: ["motyw", "wyglad", "tryb"],
            onSelect: () => setAppearance({ mode: resolvedMode === "dark" ? "light" : "dark" }),
          },
        ],
      },
    ],
    [customShortcut, resolvedMode, setAppearance],
  );

  const handleAsyncSearch = async (query: string) => {
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    const folded = query.toLowerCase();
    return SAMPLE_PEOPLE.filter((person) => `${person.name} ${person.role}`.toLowerCase().includes(folded)).map(
      (person) => ({
        id: `person-${person.id}`,
        label: person.name,
        description: person.role,
        icon: <Users />,
        onSelect: () => setLastAction(`Wybrano pracownika: ${person.name}`),
      }),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="md" icon={<Search />} onClick={() => palette.setOpen(true)}>
          Otwórz paletę ({formatShortcut("mod+k")})
        </Button>
        <Button variant="outline" size="md" icon={<Keyboard />} onClick={() => setHelpOpen(true)}>
          Skróty klawiszowe (<Kbd>?</Kbd>)
        </Button>
        <span className="text-xs text-text-tertiary">Ostatnie polecenie: {lastAction}</span>
      </div>

      <div className="mr-row flex flex-col gap-2 border border-border-secondary bg-bg-secondary p-4">
        <p className="text-sm font-medium text-text-primary">Nagrywanie skrótu („Zaproś osobę…”)</p>
        <p className="text-xs text-text-tertiary">
          Kliknij przycisk i naciśnij nowy akord lub włącz sekwencję. Escape anuluje, Backspace czyści.
        </p>
        <ShortcutRecorder
          label="Zaproś osobę"
          value={customShortcut}
          onChange={setCustomShortcut}
          onReset={() => setCustomShortcut("mod+i")}
          validate={(candidate) =>
            validateShortcut(
              candidate,
              [
                { id: "company-settings", shortcut: "g f", label: "Ustawienia firmy" },
                { id: "company-structure", shortcut: "g d", label: "Struktura i działy" },
                { id: "employees-list", shortcut: "g p", label: "Lista pracowników" },
                { id: "palette", shortcut: "mod+k", label: "Paleta poleceń" },
                { id: "help", shortcut: "?", label: "Skróty klawiszowe" },
              ],
              { reserved: ["mod+q", "mod+w"] },
            )
          }
        />
      </div>

      <CommandPalette
        open={palette.open}
        onOpenChange={palette.onOpenChange}
        groups={groups}
        placeholder="Szukaj w portalu… (np. „zapros”, „Anna”)"
        searchResultsLabel="Osoby"
        enableSourceToggles
        onSearch={handleAsyncSearch}
      />

      <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} categories={SHORTCUT_CATEGORIES} bindShortcut />
    </div>
  );
}
