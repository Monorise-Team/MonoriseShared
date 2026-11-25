import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  ListItem,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  SearchField,
  Separator,
  SidebarItem,
  SidebarNav,
  SidebarSection,
  Toolbar,
  Tooltip,
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

export function MailDemo() {
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
            <SidebarItem label="Klienci" icon={<span className="size-2.5 rounded-full bg-accent" />} />
            <SidebarItem label="Faktury" icon={<span className="size-2.5 rounded-full bg-warning" />} />
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
