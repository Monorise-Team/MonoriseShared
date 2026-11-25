import type { ComponentType } from "react";
import { ButtonsSection } from "./ButtonsSection";
import { CommandsSection } from "./CommandsSection";
import { DataDisplaySection } from "./DataDisplaySection";
import { FormsSection } from "./FormsSection";
import { FoundationsSection } from "./FoundationsSection";
import { NavigationSection } from "./NavigationSection";
import { OverlaysExtraSection } from "./OverlaysExtraSection";
import { OverlaysSection } from "./OverlaysSection";
import { ShellSection } from "./ShellSection";

export interface PlaygroundSection {
  id: string;
  title: string;
  Component: ComponentType;
}

/** Jedna lista sekcji katalogu: nowy dział wymaga pliku w `src/sections/` i jednego wpisu tutaj. */
export const SECTIONS: PlaygroundSection[] = [
  { id: "foundations", title: "Fundamenty i tokeny", Component: FoundationsSection },
  { id: "buttons", title: "Przyciski", Component: ButtonsSection },
  { id: "forms", title: "Formularze i przełączniki", Component: FormsSection },
  { id: "navigation", title: "Nawigacja", Component: NavigationSection },
  { id: "data-display", title: "Dane i stany", Component: DataDisplaySection },
  { id: "overlays", title: "Okna i podpowiedzi", Component: OverlaysSection },
  { id: "overlays-extra", title: "Menu kontekstowe, powiadomienia i błędy", Component: OverlaysExtraSection },
  { id: "shell", title: "Szkielet i ustawienia", Component: ShellSection },
  { id: "commands", title: "Paleta poleceń i skróty", Component: CommandsSection },
];
