import {
  AppearanceControls,
  Avatar,
  Button,
  Card,
  ListItem,
  ResizableSplitPane,
  Select,
  SettingRow,
  SettingSection,
  SettingToggleRow,
  SettingsLayout,
  SidebarAccordion,
  SidebarCollapseButton,
  SidebarItem,
  SidebarNav,
  SidebarSection,
  SidebarShell,
  Tabs,
  TabsList,
  TabsTrigger,
  TitleBar,
  WindowControls,
  type WindowPlatform,
} from "@monorise-team/ui";
import {
  Archive,
  Bell,
  FolderSearch,
  Inbox,
  Palette,
  Send,
  Settings,
  SlidersHorizontal,
  Star,
  Tag,
} from "lucide-react";
import { useState } from "react";

const DEMO_THREADS = [
  { id: 1, from: "Anna Kowalska", email: "anna@acme.com", subject: "Faktura za listopad", time: "9:41", unread: true },
  { id: 2, from: "Zespół Acme", email: "zespol@acme.com", subject: "Plan wdrożenia", time: "Wczoraj", unread: true },
  { id: 3, from: "Marek Nowak", email: "marek@nowak.pl", subject: "Re: Wycena", time: "Pon", unread: false },
];

const LABELS = [
  { id: "klienci", name: "Klienci" },
  { id: "faktury", name: "Faktury" },
  { id: "zespol", name: "Zespół" },
  { id: "prywatne", name: "Prywatne" },
];

const SETTINGS_ITEMS = [
  { id: "wyglad", label: "Wygląd", icon: <Palette /> },
  { id: "ogolne", label: "Ogólne", icon: <SlidersHorizontal /> },
  { id: "powiadomienia", label: "Powiadomienia", icon: <Bell /> },
];

/** Zwijany pasek boczny, dzielony panel, pasek tytułu z przyciskami okna oraz układ ustawień. */
export function ShellSection() {
  const [platform, setPlatform] = useState<WindowPlatform>("windows");
  const [maximized, setMaximized] = useState(false);
  const [lastWindowAction, setLastWindowAction] = useState("Kliknij przycisk okna");

  const [activeNav, setActiveNav] = useState("inbox");
  const [selectedThread, setSelectedThread] = useState(1);
  const [splitOrientation, setSplitOrientation] = useState<"horizontal" | "vertical">("horizontal");

  const [settingsTab, setSettingsTab] = useState("wyglad");
  const [narrowSettings, setNarrowSettings] = useState(false);
  const [blockImages, setBlockImages] = useState(true);
  const [language, setLanguage] = useState("pl");

  const thread = DEMO_THREADS.find((item) => item.id === selectedThread) ?? DEMO_THREADS[0]!;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-text-tertiary uppercase">Pasek tytułu i przyciski okna</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={platform} onValueChange={(value) => setPlatform(value as WindowPlatform)}>
              <TabsList aria-label="System przycisków okna">
                <TabsTrigger value="windows">Windows</TabsTrigger>
                <TabsTrigger value="linux">Linux</TabsTrigger>
                <TabsTrigger value="mac">macOS (ukryte)</TabsTrigger>
              </TabsList>
            </Tabs>
            <span className="text-xs text-text-tertiary">{lastWindowAction}</span>
          </div>
        </div>

        <Card surface="strong" className="overflow-hidden">
          <TitleBar
            title={
              <>
                <span className="opacity-65">Monorise</span>
                <span aria-hidden className="opacity-40">
                  ·
                </span>
                <span>Acme</span>
              </>
            }
            insetStart={platform === "mac" ? 80 : 0}
          >
            <WindowControls
              platform={platform}
              maximized={maximized}
              onMinimize={() => setLastWindowAction("Minimalizuj")}
              onMaximize={() => {
                setMaximized((prev) => !prev);
                setLastWindowAction(maximized ? "Przywróć" : "Maksymalizuj");
              }}
              onClose={() => setLastWindowAction("Zamknij")}
            />
          </TitleBar>
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-text-tertiary uppercase">
            Pasek boczny, akordeon i dzielony panel
          </h3>
          <Tabs
            value={splitOrientation}
            onValueChange={(value) => setSplitOrientation(value as "horizontal" | "vertical")}
          >
            <TabsList aria-label="Kierunek podziału">
              <TabsTrigger value="horizontal">Obok siebie</TabsTrigger>
              <TabsTrigger value="vertical">Jeden nad drugim</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex h-[420px] min-h-0 gap-card">
          <SidebarShell
            aria-label="Nawigacja szkieletu"
            footer={
              <>
                <SidebarItem
                  icon={<Settings />}
                  label="Ustawienia"
                  active={activeNav === "settings"}
                  onClick={() => setActiveNav("settings")}
                  className="flex-1"
                />
                <SidebarCollapseButton />
              </>
            }
          >
            <SidebarNav aria-label="Foldery">
              <SidebarSection>
                <SidebarItem
                  icon={<Inbox />}
                  label="Odebrane"
                  count={2}
                  active={activeNav === "inbox"}
                  onClick={() => setActiveNav("inbox")}
                />
                <SidebarItem
                  icon={<Star />}
                  label="Oznaczone"
                  active={activeNav === "starred"}
                  onClick={() => setActiveNav("starred")}
                />
                <SidebarItem
                  icon={<Send />}
                  label="Wysłane"
                  active={activeNav === "sent"}
                  onClick={() => setActiveNav("sent")}
                />
              </SidebarSection>

              <SidebarAccordion title="Etykiety" visibleCount={2}>
                {LABELS.map((item) => (
                  <SidebarItem
                    key={item.id}
                    icon={<Tag />}
                    label={item.name}
                    active={activeNav === item.id}
                    onClick={() => setActiveNav(item.id)}
                  />
                ))}
              </SidebarAccordion>

              <SidebarAccordion title="Inteligentne" defaultOpen={false}>
                <SidebarItem
                  icon={<FolderSearch />}
                  label="Nieprzeczytane"
                  active={activeNav === "unread"}
                  onClick={() => setActiveNav("unread")}
                />
                <SidebarItem
                  icon={<Archive />}
                  label="Archiwum"
                  active={activeNav === "archive"}
                  onClick={() => setActiveNav("archive")}
                />
              </SidebarAccordion>
            </SidebarNav>
          </SidebarShell>

          <ResizableSplitPane
            orientation={splitOrientation}
            defaultSize={splitOrientation === "horizontal" ? 260 : 180}
            minSize={splitOrientation === "horizontal" ? 190 : 120}
            maxSize={splitOrientation === "horizontal" ? 420 : 280}
            primary={
              <Card surface="middle" className="flex flex-col gap-0.5 overflow-y-auto p-2">
                {DEMO_THREADS.map((item) => (
                  <ListItem
                    key={item.id}
                    leading={<Avatar name={item.from} seed={item.email} size="sm" />}
                    title={item.from}
                    meta={item.time}
                    subtitle={item.subject}
                    unread={item.unread}
                    selected={item.id === selectedThread}
                    onClick={() => setSelectedThread(item.id)}
                  />
                ))}
              </Card>
            }
            secondary={
              <Card surface="reading" className="flex flex-col gap-2 overflow-y-auto p-4">
                <h4 className="font-display text-base font-semibold">{thread.subject}</h4>
                <p className="text-xs text-text-tertiary">
                  {thread.from} · {thread.email}
                </p>
                <p className="text-sm text-text-secondary">
                  Przeciągnij uchwyt między kartami, użyj strzałek (±16 px) albo kliknij dwukrotnie, aby przywrócić
                  domyślny rozmiar panelu.
                </p>
              </Card>
            }
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-text-tertiary uppercase">
            Układ ustawień (@container &lt; 640 px) i kontrolki wyglądu
          </h3>
          <Button
            variant={narrowSettings ? "primary" : "outline"}
            size="xs"
            onClick={() => setNarrowSettings((prev) => !prev)}
          >
            {narrowSettings ? "Szerokość kontenera: 480 px" : "Sprawdź wąski kontener (480 px)"}
          </Button>
        </div>

        <div className={narrowSettings ? "max-w-[480px]" : "w-full"}>
          <SettingsLayout
            items={SETTINGS_ITEMS}
            activeId={settingsTab}
            onActiveChange={setSettingsTab}
            className="h-[540px]"
          >
            {settingsTab === "wyglad" ? (
              <SettingSection title="Wygląd" description="Zmiany zapisują się od razu przez ThemeProvider.">
                <AppearanceControls showReset={false} />
              </SettingSection>
            ) : null}

            {settingsTab === "ogolne" ? (
              <SettingSection title="Ogólne" description="Przykładowe wiersze ustawień i przełączniki.">
                <SettingRow label="Język aplikacji" description="Wybór listy wiąże etykietę z polem.">
                  <Select value={language} onChange={(event) => setLanguage(event.target.value)} className="w-48">
                    <option value="pl">Polski</option>
                    <option value="en">Angielski</option>
                  </Select>
                </SettingRow>
                <SettingToggleRow
                  label="Blokuj zdalne obrazy"
                  description="Ukrywa obrazy od zewnętrznych nadawców do czasu ręcznego wczytania."
                  checked={blockImages}
                  onCheckedChange={setBlockImages}
                />
              </SettingSection>
            ) : null}

            {settingsTab === "powiadomienia" ? (
              <SettingSection title="Powiadomienia">
                <SettingToggleRow
                  label="Powiadomienia na pulpicie"
                  description="Pokazuje nowe wiadomości od ważnych nadawców."
                  defaultChecked
                />
              </SettingSection>
            ) : null}
          </SettingsLayout>
        </div>
      </div>
    </div>
  );
}
