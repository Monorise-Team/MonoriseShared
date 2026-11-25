import {
  Button,
  ConfirmDialog,
  Dialog,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  TextField,
  Tooltip,
} from "@monorise-team/ui";
import { MailOpen, MoreHorizontal, Star, Trash2 } from "lucide-react";
import { useState } from "react";

/** Okna dialogowe, menu kontekstowe i dymki podpowiedzi w portalu. */
export function OverlaysSection() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" size="md" onClick={() => setDialogOpen(true)}>
        Dodaj skrzynkę
      </Button>
      <Button variant="danger" size="md" onClick={() => setConfirmOpen(true)}>
        Potwierdź usunięcie
      </Button>

      <Menu>
        <MenuTrigger asChild>
          <Button variant="outline" size="md" icon={<MoreHorizontal />}>
            Menu działań
          </Button>
        </MenuTrigger>
        <MenuContent align="start">
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

      <Tooltip content="Podpowiedź z warstwą --mr-z-tooltip" shortcut="⌘/">
        <Button variant="secondary" size="md">
          Najedź po dymek
        </Button>
      </Tooltip>

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

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Usunąć wiadomość?"
        description="Wiadomość trafi do kosza na serwerze poczty. Po 30 dniach dostawca usunie ją na stałe."
        confirmLabel="Usuń"
        danger
        onConfirm={() => {}}
      />
    </div>
  );
}
