import { Button } from "@monorise-team/ui";
import { PenSquare, Settings } from "lucide-react";

/** Warianty i rozmiary przycisków. */
export function ButtonsSection() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="md" icon={<PenSquare />}>
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
    </div>
  );
}
