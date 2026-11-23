import { themeNames, themes, type ThemeName } from "@monorise-team/tokens";
import {
  AppShell,
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ListItem,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  ProgressBar,
  SearchField,
  Select,
  Separator,
  SidebarItem,
  SidebarNav,
  SidebarSection,
  Skeleton,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea,
  TextField,
  TitleBar,
  Toolbar,
  Tooltip,
  useTheme,
  type ModePreference,
} from "@monorise-team/ui";
import {
  Archive,
  Clock,
  FileText,
  Forward,
  Inbox,
  MailOpen,
  MoreHorizontal,
  Paperclip,
  PenSquare,
  Reply,
  Send,
  Settings,
  Star,
  Trash2,
} from "lucide-react";
import { useState } from "react";

const THREADS = [
  {
    id: 1,
    from: "Anna Kowalska",
    email: "anna@acme.com",
    subject: "Faktura za listopad",
    preview: "Cześć, w załączniku faktura za listopad. Termin płatności 14 dni, numer konta bez zmian.",
    time: "9:41",
    unread: true,
  },
  {
    id: 2,
    from: "Zespół Acme",
    email: "zespol@acme.com",
    subject: "Plan wdrożenia na grudzień",
    preview: "Przesyłamy plan: szkolenie w poniedziałek, start w środę. Daj znać, czy termin pasuje.",
    time: "Wczoraj",
    unread: true,
  },
  {
    id: 3,
    from: "Marek Nowak",
    email: "marek@nowak.pl",
    subject: "Re: Wycena aplikacji",
    preview: "Dzięki za wycenę. Mamy jeszcze dwa pytania o aplikację na telefon.",
    time: "Pon",
    unread: false,
  },
  {
    id: 4,
    from: "home.pl",
    email: "powiadomienia@home.pl",
    subject: "Twoja skrzynka ma 80% miejsca",
    preview: "Skrzynka anna@acme.com zajmuje 8 z 10 GB. Usuń stare wiadomości albo zwiększ limit.",
    time: "12 lis",
    unread: false,
  },
];

const FOLDERS = [
  { id: "inbox", label: "Odebrane", icon: <Inbox />, count: 2 },
  { id: "starred", label: "Oznaczone gwiazdką", icon: <Star /> },
  { id: "snoozed", label: "Odłożone", icon: <Clock /> },
  { id: "sent", label: "Wysłane", icon: <Send /> },
  { id: "drafts", label: "Wersje robocze", icon: <FileText />, count: 1 },
  { id: "archive", label: "Archiwum", icon: <Archive /> },
  { id: "trash", label: "Kosz", icon: <Trash2 /> },
];

function AppearanceBar() {
  const { appearance, setAppearance } = useTheme();
  return (
    <TitleBar className="justify-between">
      <span className="flex items-center gap-2">
        <span className="uppercase">Monorise</span>
        <span aria-hidden>·</span>
        <span className="text-accent uppercase">katalog komponentów</span>
      </span>
      <span className="flex items-center gap-2">
        <Tabs value={appearance.mode} onValueChange={(mode) => setAppearance({ mode: mode as ModePreference })}>
          <TabsList aria-label="Tryb">
            <TabsTrigger value="light">Jasny</TabsTrigger>
            <TabsTrigger value="dark">Ciemny</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={appearance.theme} onValueChange={(theme) => setAppearance({ theme: theme as ThemeName })}>
          <TabsList aria-label="Motyw">
            {themeNames.map((name) => (
              <TabsTrigger key={name} value={name}>
                {themes[name].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </span>
    </TitleBar>
  );
}

function MailDemo() {
  const [folder, setFolder] = useState("inbox");
  const [selected, setSelected] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const thread = THREADS.find((t) => t.id === selected) ?? THREADS[0]!;

  return (
    <>
      <Card surface="side" className="flex w-60 shrink-0 flex-col gap-3 p-3">
        <div className="flex items-center gap-2.5 px-1">
          <Avatar name="Acme" seed="acme.com" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Acme</p>
            <p className="truncate text-xs text-text-tertiary">anna@acme.com</p>
          </div>
        </div>
        <Button variant="primary" size="lg" icon={<PenSquare />} className="w-full rounded-full">
          Napisz
        </Button>
        <SidebarNav aria-label="Foldery" className="min-h-0 flex-1 overflow-y-auto">
          <SidebarSection>
            {FOLDERS.map((f) => (
              <SidebarItem
                key={f.id}
                icon={f.icon}
                label={f.label}
                count={f.count}
                active={folder === f.id}
                onClick={() => setFolder(f.id)}
              />
            ))}
          </SidebarSection>
          <SidebarSection title="Etykiety">
            <SidebarItem label="Klienci" icon={<span className="size-2.5 rounded-full bg-[#0e7490]" />} />
            <SidebarItem label="Faktury" icon={<span className="size-2.5 rounded-full bg-[#b45309]" />} />
          </SidebarSection>
        </SidebarNav>
        <SidebarItem icon={<Settings />} label="Ustawienia" />
      </Card>

      <Card surface="middle" className="flex w-96 shrink-0 flex-col">
        <CardHeader className="flex-col items-stretch gap-2 border-b-0 pt-3">
          <SearchField placeholder="Szukaj w poczcie" shortcut="⌘K" />
        </CardHeader>
        <div className="flex items-center justify-between px-4 pb-1 text-xs text-text-tertiary">
          <span>Odebrane</span>
          <span>2 nieprzeczytane</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
          {THREADS.map((t) => (
            <ListItem
              key={t.id}
              leading={<Avatar name={t.from} seed={t.email} />}
              title={t.from}
              meta={t.time}
              subtitle={t.subject}
              preview={t.preview}
              unread={t.unread}
              selected={t.id === selected}
              onClick={() => setSelected(t.id)}
            />
          ))}
        </div>
      </Card>

      <Card surface="reading" className="flex min-w-0 flex-1 flex-col">
        <CardHeader className="justify-between">
          <Toolbar aria-label="Działania na wiadomości">
            <Tooltip content="Odpowiedz" shortcut="R">
              <Button iconOnly variant="ghost" aria-label="Odpowiedz">
                <Reply />
              </Button>
            </Tooltip>
            <Tooltip content="Przekaż dalej" shortcut="F">
              <Button iconOnly variant="ghost" aria-label="Przekaż dalej">
                <Forward />
              </Button>
            </Tooltip>
            <Separator vertical />
            <Tooltip content="Archiwizuj" shortcut="E">
              <Button iconOnly variant="ghost" aria-label="Archiwizuj">
                <Archive />
              </Button>
            </Tooltip>
            <Tooltip content="Usuń" shortcut="#">
              <Button iconOnly variant="ghost" aria-label="Usuń" onClick={() => setConfirmOpen(true)}>
                <Trash2 />
              </Button>
            </Tooltip>
          </Toolbar>
          <Menu>
            <MenuTrigger asChild>
              <Button iconOnly variant="ghost" aria-label="Więcej">
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuLabel>Wiadomość</MenuLabel>
              <MenuItem icon={<MailOpen />} shortcut="U">
                Oznacz jako nieprzeczytane
              </MenuItem>
              <MenuItem icon={<Star />} shortcut="S">
                Oznacz gwiazdką
              </MenuItem>
              <MenuCheckboxItem checked>Pokaż obrazy od nadawcy</MenuCheckboxItem>
              <MenuSeparator />
              <MenuItem icon={<Trash2 />} danger onSelect={() => setConfirmOpen(true)}>
                Usuń
              </MenuItem>
            </MenuContent>
          </Menu>
        </CardHeader>
        <article className="mr-enter flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6" key={thread.id}>
          <h1 className="font-display text-xl font-semibold">{thread.subject}</h1>
          <div className="flex items-center gap-3">
            <Avatar name={thread.from} seed={thread.email} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{thread.from}</p>
              <p className="text-xs text-text-tertiary">
                {thread.email} · do mnie · {thread.time}
              </p>
            </div>
            <Badge tone="accent">Klienci</Badge>
          </div>
          <div className="flex flex-col gap-3 text-sm leading-relaxed text-text-secondary">
            <p>{thread.preview}</p>
            <p>Pozdrawiam,</p>
            <p>{thread.from}</p>
          </div>
          <div className="mr-card mr-strong flex w-fit items-center gap-3 px-3 py-2 text-sm">
            <Paperclip className="size-4 text-text-tertiary" aria-hidden />
            <span>faktura-11-2026.pdf</span>
            <span className="text-xs text-text-tertiary">184 KB</span>
          </div>
        </article>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Usunąć wiadomość?"
        description="Wiadomość trafi do kosza na serwerze poczty. Po 30 dniach dostawca usunie ją na stałe."
        confirmLabel="Usuń"
        danger
        onConfirm={() => {}}
      />
    </>
  );
}

function Gallery() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { appearance, setAppearance } = useTheme();
  return (
    <Card surface="reading" className="min-w-0 flex-1 overflow-y-auto">
      <CardHeader>
        <CardTitle>Komponenty</CardTitle>
      </CardHeader>
      <div className="grid gap-8 p-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-text-tertiary uppercase">Przyciski</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="md">
              Zapisz
            </Button>
            <Button variant="secondary" size="md">
              Anuluj
            </Button>
            <Button variant="outline" size="md">
              Szczegóły
            </Button>
            <Button variant="ghost" size="md">
              Pomiń
            </Button>
            <Button variant="danger" size="md">
              Usuń
            </Button>
            <Button variant="primary" size="md" disabled>
              Wyłączony
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="xs">
              XS
            </Button>
            <Button variant="primary" size="sm">
              SM
            </Button>
            <Button variant="primary" size="md">
              MD
            </Button>
            <Button variant="primary" size="lg">
              LG
            </Button>
            <Button iconOnly variant="outline" aria-label="Ustawienia">
              <Settings />
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-text-tertiary uppercase">Pola</h2>
          <TextField label="Adres e-mail" placeholder="anna@acme.com" hint="Adres skrzynki u dostawcy poczty" />
          <TextField label="Hasło aplikacji" type="password" defaultValue="tajne" error="Serwer odrzucił hasło" />
          <Select label="Szyfrowanie" defaultValue="ssl">
            <option value="ssl">SSL/TLS</option>
            <option value="starttls">STARTTLS</option>
          </Select>
          <TextArea label="Podpis" defaultValue={"Anna Kowalska\nAcme sp. z o.o."} rows={3} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-text-tertiary uppercase">Przełączniki</h2>
          <Switch
            label="Ogranicz animacje"
            description="Wyłącza ruch niezależnie od ustawień systemu."
            checked={appearance.reduceMotion}
            onCheckedChange={(reduceMotion) => setAppearance({ reduceMotion })}
          />
          <Switch
            label="Szklane panele"
            description="Na słabszych komputerach wyłącz rozmycie tła."
            checked={appearance.glass}
            onCheckedChange={(glass) => setAppearance({ glass })}
          />
          <Checkbox label="Pokazuj podgląd treści" defaultChecked />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-text-tertiary uppercase">Etykiety i postęp</h2>
          <div className="flex flex-wrap gap-2">
            <Badge>12</Badge>
            <Badge tone="accent">Nowe</Badge>
            <Badge tone="success">Połączono</Badge>
            <Badge tone="warning">Wolne łącze</Badge>
            <Badge tone="danger">Błąd logowania</Badge>
          </div>
          <ProgressBar label="Synchronizacja" value={64} />
          <ProgressBar label="Ładowanie" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-text-tertiary uppercase">Okno dialogowe</h2>
          <Button variant="outline" size="md" className="w-fit" onClick={() => setDialogOpen(true)}>
            Dodaj skrzynkę
          </Button>
          <Dialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            title="Dodaj skrzynkę"
            description="Podaj adres i hasło skrzynki. Serwery IMAP i SMTP dobierzemy sami, jeśli znamy dostawcę."
            footer={
              <>
                <Button variant="secondary" size="md" onClick={() => setDialogOpen(false)}>
                  Anuluj
                </Button>
                <Button variant="primary" size="md" onClick={() => setDialogOpen(false)}>
                  Połącz
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-3">
              <TextField label="Adres e-mail" placeholder="anna@acme.com" />
              <TextField label="Hasło" type="password" />
            </div>
          </Dialog>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-text-tertiary uppercase">Pusty stan</h2>
          <Card surface="strong" className="p-0">
            <EmptyState
              icon={<Inbox />}
              title="Wszystko przeczytane"
              description="Nowe wiadomości pojawią się tutaj."
              action={
                <Button variant="outline" size="sm">
                  Odśwież
                </Button>
              }
            />
          </Card>
        </section>
      </div>
    </Card>
  );
}

export function App() {
  const [view, setView] = useState("mail");
  return (
    <AppShell titleBar={<AppearanceBar />}>
      <Tabs value={view} onValueChange={setView} className="flex min-w-0 flex-1 flex-col gap-card">
        <TabsList aria-label="Widok" className="w-fit">
          <TabsTrigger value="mail">Poczta</TabsTrigger>
          <TabsTrigger value="gallery">Komponenty</TabsTrigger>
        </TabsList>
        <TabsContent value="mail" className="flex min-h-0 flex-1 gap-card">
          <MailDemo />
        </TabsContent>
        <TabsContent value="gallery" className="flex min-h-0 flex-1">
          <Gallery />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
