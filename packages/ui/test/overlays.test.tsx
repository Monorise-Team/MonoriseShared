import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Archive, MailOpen, Star, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Banner,
  Button,
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
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
  Menu,
  MenuContent,
  MenuItem,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
  ToastProvider,
  useToast,
} from "../src/index.js";

describe("ContextMenu i MenuSub", () => {
  it("otwiera menu po zdarzeniu contextmenu, pokazuje skrót i uruchamia akcję", () => {
    const onArchive = vi.fn();
    const onDelete = vi.fn();
    const onDisabled = vi.fn();

    render(
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div data-testid="row">Wiersz wiadomości</div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuLabel>Akcje</ContextMenuLabel>
          <ContextMenuItem icon={<Archive />} shortcut="E" onSelect={onArchive}>
            Archiwizuj
          </ContextMenuItem>
          <ContextMenuItem icon={<Star />} disabled onSelect={onDisabled}>
            Wyróżnij
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem icon={<Trash2 />} danger onSelect={onDelete}>
            Usuń
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    const trigger = screen.getByTestId("row");
    fireEvent.contextMenu(trigger, { clientX: 120, clientY: 160 });

    const menu = screen.getByRole("menu");
    expect(menu).toHaveClass("mr-menu", "z-[var(--mr-z-dropdown)]");
    expect(screen.getByText("E")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Usuń/ })).toHaveClass("text-danger");

    fireEvent.click(screen.getByRole("menuitem", { name: /Wyróżnij/ }));
    expect(onDisabled).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("menuitem", { name: /Archiwizuj/ }));
    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  it("otwiera podmenu klawiaturą i uruchamia element z podmenu", async () => {
    const onApplyLabel = vi.fn();
    const onCheckedChange = vi.fn();

    render(
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button type="button">Wątek</button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuCheckboxItem checked={false} onCheckedChange={onCheckedChange}>
            Pokaż obrazy
          </ContextMenuCheckboxItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Etykiety</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem onSelect={onApplyLabel}>Faktury</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuContent>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "Wątek" }), { clientX: 80, clientY: 90 });

    const subTrigger = screen.getByRole("menuitem", { name: "Etykiety" });
    subTrigger.focus();
    fireEvent.keyDown(subTrigger, { key: "ArrowRight" });

    const subItem = await screen.findByRole("menuitem", { name: "Faktury" });
    expect(subItem.closest('[role="menu"]')).toHaveClass("mr-menu", "z-[var(--mr-z-dropdown)]");

    fireEvent.click(subItem);
    expect(onApplyLabel).toHaveBeenCalledTimes(1);

    fireEvent.contextMenu(screen.getByRole("button", { name: "Wątek" }), { clientX: 80, clientY: 90 });
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Pokaż obrazy" }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("Menu obsługuje MenuSub, MenuSubTrigger i MenuSubContent", async () => {
    const onSubAction = vi.fn();

    render(
      <Menu open>
        <MenuTrigger asChild>
          <Button>Opcje</Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem icon={<MailOpen />}>Otwórz</MenuItem>
          <MenuSub>
            <MenuSubTrigger>Przenieś</MenuSubTrigger>
            <MenuSubContent>
              <MenuItem onSelect={onSubAction}>Archiwum</MenuItem>
            </MenuSubContent>
          </MenuSub>
        </MenuContent>
      </Menu>,
    );

    const subTrigger = screen.getByRole("menuitem", { name: "Przenieś" });
    subTrigger.focus();
    fireEvent.keyDown(subTrigger, { key: "ArrowRight" });

    const archive = await screen.findByRole("menuitem", { name: "Archiwum" });
    fireEvent.click(archive);
    expect(onSubAction).toHaveBeenCalledTimes(1);
  });
});

describe("ToastProvider, useToast i Banner", () => {
  function ToastHarness({ onAction }: { onAction?: () => void }) {
    const { toast, dismiss } = useToast();
    const [lastId, setLastId] = useState<string>("");

    return (
      <div>
        <button
          type="button"
          onClick={() => {
            const id = toast({
              title: "Wysyłanie wiadomości…",
              description: "Za chwilę opuści skrzynkę",
              tone: "warning",
              progress: true,
              duration: 4000,
              action: onAction ? { label: "Cofnij", onClick: onAction } : undefined,
            });
            setLastId(id);
          }}
        >
          Pokaż powiadomienie
        </button>
        <button type="button" onClick={() => dismiss(lastId)}>
          Zamknij z kodu
        </button>
      </div>
    );
  }

  it("wyświetla powiadomienie z paskiem odliczania, uruchamia akcję i zamyka przez dismiss(id)", () => {
    const onAction = vi.fn();
    render(
      <ToastProvider position="bottom-center">
        <ToastHarness onAction={onAction} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Pokaż powiadomienie" }));

    expect(screen.getByText("Wysyłanie wiadomości…")).toBeInTheDocument();
    expect(screen.getByText("Za chwilę opuści skrzynkę")).toBeInTheDocument();

    const viewport = screen.getByRole("region", { name: /Powiadomienia/ }).querySelector("ol");
    expect(viewport).toHaveClass("z-[var(--mr-z-toast)]", "left-1/2", "-translate-x-1/2");
    expect(document.querySelector("[data-toast-progress]")).toBeInTheDocument();

    const toastRoot = screen.getByText("Wysyłanie wiadomości…").closest("li");
    expect(toastRoot).toHaveClass("mr-float");

    fireEvent.click(screen.getByRole("button", { name: "Cofnij" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Wysyłanie wiadomości…")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pokaż powiadomienie" }));
    expect(screen.getByText("Wysyłanie wiadomości…")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Zamknij z kodu" }));
    expect(screen.queryByText("Wysyłanie wiadomości…")).not.toBeInTheDocument();
  });

  it("domyślnie ustawia stos w prawym dolnym rogu i zamyka przyciskiem X", () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Pokaż powiadomienie" }));
    const viewport = screen.getByRole("region", { name: /Powiadomienia/ }).querySelector("ol");
    expect(viewport).toHaveClass("z-[var(--mr-z-toast)]", "bottom-5", "right-5");

    fireEvent.click(screen.getByRole("button", { name: "Zamknij" }));
    expect(screen.queryByText("Wysyłanie wiadomości…")).not.toBeInTheDocument();
  });

  it("Banner ustawia właściwą rolę status/alert, obsługuje akcję i zamykanie", () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();

    const { rerender } = render(<Banner tone="neutral" message="Synchronizacja zakończona." />);
    expect(screen.getByRole("status")).toHaveTextContent("Synchronizacja zakończona.");

    rerender(
      <Banner
        tone="warning"
        title="Brak połączenia"
        message="Zmiany zsynchronizują się później."
        action={{ label: "Ponów", onClick: onAction }}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Brak połączenia");
    fireEvent.click(screen.getByRole("button", { name: "Ponów" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Zamknij" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    rerender(<Banner tone="danger" message="Błąd uwierzytelniania" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Błąd uwierzytelniania");
  });
});

describe("InputDialog", () => {
  it("ustawia fokus i zaznacza tekst po otwarciu, waliduje i zatwierdza Enterem", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <InputDialog
        open
        onOpenChange={onOpenChange}
        title="Nowa etykieta"
        label="Nazwa"
        defaultValue="Faktury"
        validate={(value) => (value.trim().length < 3 ? "Minimum 3 znaki." : null)}
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByLabelText("Nazwa") as HTMLInputElement;
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe("Faktury".length);
    });

    fireEvent.change(input, { target: { value: "ab" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Minimum 3 znaki.");

    fireEvent.change(input, { target: { value: "Pilne" } });
    expect(input).not.toHaveAttribute("aria-invalid");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledWith("Pilne");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("resetuje wartość po ponownym otwarciu i zamyka przyciskiem Anuluj", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <InputDialog
        open={false}
        onOpenChange={onOpenChange}
        title="Zmień nazwę"
        label="Nazwa"
        defaultValue="Robocze"
        confirmLabel="Potwierdź"
        cancelLabel="Wróć"
        onConfirm={onConfirm}
      />,
    );

    rerender(
      <InputDialog
        open
        onOpenChange={onOpenChange}
        title="Zmień nazwę"
        label="Nazwa"
        defaultValue="Robocze"
        confirmLabel="Potwierdź"
        cancelLabel="Wróć"
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByLabelText("Nazwa") as HTMLInputElement;
    expect(input.value).toBe("Robocze");
    expect(document.activeElement).toBe(input);

    fireEvent.click(screen.getByRole("button", { name: "Wróć" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("DateTimePickerDialog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 25, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pokazuje domyślne polskie podpowiedzi i zwraca Date po wyborze", () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();

    render(<DateTimePickerDialog open onOpenChange={onOpenChange} onSelect={onSelect} />);

    expect(screen.getByText("Jutro rano")).toBeInTheDocument();
    expect(screen.getByText("W przyszłym tygodniu")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Jutro rano/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    const chosen = onSelect.mock.calls[0]?.[0] as Date;
    expect(chosen).toBeInstanceOf(Date);
    expect(chosen.getFullYear()).toBe(2026);
    expect(chosen.getMonth()).toBe(10);
    expect(chosen.getDate()).toBe(26);
    expect(chosen.getHours()).toBe(9);
    expect(chosen.getMinutes()).toBe(0);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("odrzuca datę z przeszłości i zwraca Date dla własnego terminu", () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <DateTimePickerDialog
        open
        onOpenChange={onOpenChange}
        onSelect={onSelect}
        title="Zaplanuj wysyłkę"
        submitLabel="Zaplanuj"
      />,
    );

    const dateInput = screen.getByLabelText("Data");
    const timeInput = screen.getByLabelText("Godzina");

    fireEvent.change(dateInput, { target: { value: "2020-01-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Zaplanuj" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Wybierz przyszłą datę i godzinę.");

    fireEvent.change(dateInput, { target: { value: "2026-12-01" } });
    fireEvent.change(timeInput, { target: { value: "14:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Zaplanuj" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    const chosen = onSelect.mock.calls[0]?.[0] as Date;
    expect(chosen).toBeInstanceOf(Date);
    expect(chosen.getFullYear()).toBe(2026);
    expect(chosen.getMonth()).toBe(11);
    expect(chosen.getDate()).toBe(1);
    expect(chosen.getHours()).toBe(14);
    expect(chosen.getMinutes()).toBe(30);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("ErrorBoundary", () => {
  const originalConsoleError = console.error;

  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it("wyświetla szklaną kartę błędu, szczegóły, wywołuje onError i resetuje po kliknięciu", () => {
    let shouldThrow = true;
    const onError = vi.fn();

    function Unstable() {
      if (shouldThrow) throw new Error("Awaria widoku");
      return <div>Widok odzyskany</div>;
    }

    render(
      <ErrorBoundary onError={onError}>
        <Unstable />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    const card = screen.getByRole("alert");
    expect(card).toHaveClass("mr-card", "mr-reading");
    expect(screen.getByText("Coś poszło nie tak")).toBeInTheDocument();
    expect(screen.getByText("Awaria widoku")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Szczegóły błędu" }));
    expect(screen.getByText(/Awaria widoku/, { selector: "pre" })).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(screen.getByText("Widok odzyskany")).toBeInTheDocument();
  });

  it("renderuje własny fallback, gdy został przekazany", () => {
    function Broken(): ReactNode {
      throw new Error("Błąd");
    }

    render(
      <ErrorBoundary fallback={<div>Własny widok błędu</div>}>
        <Broken />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Własny widok błędu")).toBeInTheDocument();
    expect(screen.queryByText("Coś poszło nie tak")).not.toBeInTheDocument();
  });
});
