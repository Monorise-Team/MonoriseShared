import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  APPEARANCE_STORAGE_KEY,
  applyAppearance,
  Avatar,
  Button,
  ConfirmDialog,
  initials,
  ListItem,
  readAppearance,
  SidebarItem,
  TextField,
} from "../src/index.js";

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

describe("ConfirmDialog", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Usuń" }));
    expect(confirmed).toBe(1);
  });
});

describe("Sidebar i lista", () => {
  it("aktywna pozycja ma aria-current i licznik", () => {
    render(<SidebarItem label="Odebrane" count={12} active />);
    const item = screen.getByRole("button", { name: /Odebrane/ });
    expect(item).toHaveAttribute("aria-current", "page");
    expect(item).toHaveTextContent("12");
  });

  it("wiersz listy pogrubia nieprzeczytane", () => {
    render(<ListItem title="Anna Kowalska" subtitle="Faktura za listopad" unread />);
    expect(screen.getByText("Anna Kowalska")).toHaveClass("font-semibold");
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

describe("wygląd", () => {
  it("uszkodzony zapis daje wygląd domyślny", () => {
    const storage = { getItem: (key: string) => (key === APPEARANCE_STORAGE_KEY ? "{nie json" : null) };
    expect(readAppearance(storage)).toMatchObject({ mode: "dark", theme: "mono", glass: true });
  });

  it("ustawia tryb, motyw, ruch i szkło na <html>", () => {
    const root = document.documentElement;
    applyAppearance(root, { mode: "system", theme: "moonlight", reduceMotion: true, glass: false }, false);
    expect(root).not.toHaveClass("dark");
    expect(root).toHaveClass("reduce-motion", "no-glass");
    expect(root.dataset.theme).toBe("moonlight");
    applyAppearance(root, { mode: "dark", theme: "mono", reduceMotion: false, glass: true }, false);
    expect(root).toHaveClass("dark");
    expect(root).not.toHaveClass("reduce-motion", "no-glass");
  });
});
