import {
  Avatar,
  Banner,
  Button,
  Card,
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  DateTimePickerDialog,
  ErrorBoundary,
  InputDialog,
  ListItem,
  Menu,
  MenuContent,
  MenuItem,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
  ToastProvider,
  useToast,
} from "@monorise-team/ui";
import { Archive, CalendarClock, FolderInput, MailOpen, Star, Tag, Trash2, WifiOff } from "lucide-react";
import { useState } from "react";

function ThrowOnDemand() {
  const [broken, setBroken] = useState(false);
  if (broken) {
    throw new Error("Przykładowy błąd renderowania karty wiadomości.");
  }
  return (
    <Card surface="strong" className="flex items-center justify-between gap-3 p-4">
      <div>
        <p className="text-sm font-medium text-text-primary">Widok pod ochroną ErrorBoundary</p>
        <p className="text-xs text-text-tertiary">Kliknięcie przycisku wywoła błąd podczas renderowania.</p>
      </div>
      <Button variant="danger" size="sm" onClick={() => setBroken(true)}>
        Wywołaj błąd
      </Button>
    </Card>
  );
}

function OverlaysExtraContent() {
  const { toast } = useToast();
  const [lastAction, setLastAction] = useState("Kliknij wiersz prawym przyciskiem myszy.");
  const [showImages, setShowImages] = useState(true);
  const [bannerVisible, setBannerVisible] = useState(true);
  const [inputOpen, setInputOpen] = useState(false);
  const [labelName, setLabelName] = useState("Faktury");
  const [dateOpen, setDateOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-text-tertiary">{lastAction}</span>
            <Menu>
              <MenuTrigger asChild>
                <Button variant="outline" size="xs">
                  Menu z podmenu
                </Button>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem icon={<Archive />} shortcut="E" onSelect={() => setLastAction("Zarchiwizowano z menu.")}>
                  Archiwizuj
                </MenuItem>
                <MenuSub>
                  <MenuSubTrigger icon={<FolderInput />}>Przenieś do</MenuSubTrigger>
                  <MenuSubContent>
                    <MenuItem onSelect={() => setLastAction("Przeniesiono do: Ważne.")}>Ważne</MenuItem>
                    <MenuItem onSelect={() => setLastAction("Przeniesiono do: Archiwum.")}>Archiwum</MenuItem>
                  </MenuSubContent>
                </MenuSub>
              </MenuContent>
            </Menu>
          </div>
          <Card surface="middle" className="p-2">
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div>
                  <ListItem
                    leading={<Avatar name="Anna Kowalska" seed="anna@acme.com" />}
                    title="Anna Kowalska"
                    meta="9:41"
                    subtitle="Faktura za listopad"
                    preview="Kliknij prawym przyciskiem myszy, aby otworzyć menu kontekstowe z podmenu."
                    unread
                  />
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuLabel>Wiadomość</ContextMenuLabel>
                <ContextMenuGroup>
                  <ContextMenuItem
                    icon={<MailOpen />}
                    shortcut="U"
                    onSelect={() => setLastAction("Oznaczono jako nieprzeczytane.")}
                  >
                    Oznacz jako nieprzeczytane
                  </ContextMenuItem>
                  <ContextMenuItem icon={<Star />} shortcut="S" onSelect={() => setLastAction("Dodano gwiazdkę.")}>
                    Oznacz gwiazdką
                  </ContextMenuItem>
                  <ContextMenuCheckboxItem checked={showImages} onCheckedChange={(v) => setShowImages(Boolean(v))}>
                    Pokaż obrazy od nadawcy
                  </ContextMenuCheckboxItem>
                </ContextMenuGroup>
                <ContextMenuSeparator />
                <ContextMenuSub>
                  <ContextMenuSubTrigger icon={<Tag />}>Przypisz etykietę</ContextMenuSubTrigger>
                  <ContextMenuSubContent>
                    <ContextMenuItem onSelect={() => setLastAction("Nadano etykietę: Praca.")}>Praca</ContextMenuItem>
                    <ContextMenuItem onSelect={() => setLastAction("Nadano etykietę: Faktury.")}>
                      Faktury
                    </ContextMenuItem>
                    <ContextMenuItem disabled>Zablokowana etykieta</ContextMenuItem>
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSeparator />
                <ContextMenuItem
                  icon={<Trash2 />}
                  shortcut="#"
                  danger
                  onSelect={() => setLastAction("Przeniesiono wiadomość do kosza.")}
                >
                  Usuń
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast({
                  title: "Wysyłanie wiadomości…",
                  progress: true,
                  duration: 5000,
                  action: {
                    label: "Cofnij",
                    onClick: () => setLastAction("Cofnięto wysyłanie wiadomości."),
                  },
                })
              }
            >
              Powiadomienie z odliczaniem
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast({
                  tone: "success",
                  title: "Połączono skrzynkę",
                  description: "Konto anna@acme.com jest gotowe do pracy.",
                })
              }
            >
              Sukces
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast({
                  tone: "warning",
                  title: "Wolna synchronizacja",
                  description: "Serwer poczty odpowiada wolniej niż zwykle.",
                })
              }
            >
              Ostrzeżenie
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast({
                  tone: "danger",
                  title: "Błąd logowania",
                  description: "Odśwież dostęp do skrzynki w ustawieniach konta.",
                })
              }
            >
              Błąd
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="md" onClick={() => setInputOpen(true)}>
              Zmień etykietę ({labelName})
            </Button>
            <Button variant="outline" size="md" icon={<CalendarClock />} onClick={() => setDateOpen(true)}>
              {scheduledDate
                ? `Odłożono: ${scheduledDate.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}`
                : "Odłóż na później"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {bannerVisible ? (
          <Banner
            tone="warning"
            icon={<WifiOff />}
            title="Brak połączenia z siecią"
            message="Zmiany zapisują się lokalnie i zsynchronizują się po odzyskaniu dostępu."
            action={{ label: "Ponów", onClick: () => setLastAction("Ponowiono sprawdzanie połączenia.") }}
            onDismiss={() => setBannerVisible(false)}
          />
        ) : (
          <div>
            <Button variant="outline" size="xs" onClick={() => setBannerVisible(true)}>
              Pokaż baner ponownie
            </Button>
          </div>
        )}
        <Banner
          tone="danger"
          title="Wygasła sesja skrzynki"
          message="Połącz ponownie konto anna@acme.com, aby dalej odbierać wiadomości."
          action={{ label: "Połącz ponownie", onClick: () => setLastAction("Otwarto ponowne łączenie konta.") }}
        />
        <Banner tone="success" message="Wszystkie skrzynki są aktualne." />
      </div>

      <ErrorBoundary>
        <ThrowOnDemand />
      </ErrorBoundary>

      <InputDialog
        open={inputOpen}
        onOpenChange={setInputOpen}
        title="Zmień nazwę etykiety"
        label="Nazwa etykiety"
        defaultValue={labelName}
        placeholder="Np. Faktury"
        validate={(value) => {
          const trimmed = value.trim();
          if (trimmed.length < 3) return "Nazwa musi mieć co najmniej 3 znaki.";
          return null;
        }}
        onConfirm={(next) => {
          setLabelName(next.trim());
          toast({ tone: "success", title: `Zapisano etykietę „${next.trim()}”` });
        }}
      />

      <DateTimePickerDialog
        open={dateOpen}
        onOpenChange={setDateOpen}
        title="Odłóż wiadomość do…"
        submitLabel="Odłóż"
        onSelect={(date) => {
          setScheduledDate(date);
          toast({
            tone: "neutral",
            title: "Odłożono wiadomość",
            description: date.toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" }),
          });
        }}
      />
    </div>
  );
}

/** Menu kontekstowe, powiadomienia, banery, okna formularza i granica błędów. */
export function OverlaysExtraSection() {
  return (
    <ToastProvider>
      <OverlaysExtraContent />
    </ToastProvider>
  );
}
