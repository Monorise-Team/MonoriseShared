"use client";

import { isValidElement, useId, useState, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import type { Surface } from "./Card.js";
import { Switch, type SwitchProps } from "./Checkbox.js";
import { Select } from "./TextField.js";

export interface SettingsNavItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
}

export interface SettingsLayoutProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Tytuł paska nagłówka ustawień; przekaż `null`, aby go ukryć. */
  title?: ReactNode;
  /** Element przed tytułem w nagłówku (np. przycisk powrotu). */
  headerStart?: ReactNode;
  /** Element po prawej stronie nagłówka. */
  headerEnd?: ReactNode;
  /** Zakładki sekcji ustawień. */
  items: SettingsNavItem[];
  /** Aktywna zakładka (tryb kontrolowany). */
  activeId?: string;
  /** Domyślna zakładka (tryb niekontrolowany). */
  defaultActiveId?: string;
  /** Wywoływane przy zmianie zakładki. */
  onActiveChange?: (id: string) => void;
  /** Etykieta nawigacji dla czytników ekranu. */
  navLabel?: string;
  /** Czy pokazać tytuł aktywnej sekcji nad treścią (domyślnie `true`). */
  showSectionHeading?: boolean;
  /** Powierzchnia karty (domyślnie `"reading"`). */
  surface?: Surface;
  children: ReactNode;
}

const layoutSurfaces: Record<Surface, string> = {
  side: "mr-card mr-side",
  middle: "mr-card mr-middle",
  reading: "mr-card mr-reading",
  strong: "mr-card mr-strong",
  float: "mr-float rounded-card",
};

/**
 * Układ ustawień z zapytaniem kontenera (`@container`): powyżej 640 px pokazuje pionową nawigację `w-48`,
 * a poniżej 640 px przełącza się wyłącznie w CSS na poziomy przewijany pasek nad treścią.
 */
export function SettingsLayout({
  title = "Ustawienia",
  headerStart,
  headerEnd,
  items,
  activeId: activeIdProp,
  defaultActiveId,
  onActiveChange,
  navLabel = "Sekcje ustawień",
  showSectionHeading = true,
  surface = "reading",
  className,
  children,
  ...rest
}: SettingsLayoutProps) {
  const [internalActiveId, setInternalActiveId] = useState(() => defaultActiveId ?? items[0]?.id ?? "");
  const currentId = activeIdProp !== undefined ? activeIdProp : internalActiveId;
  const activeItem = items.find((item) => item.id === currentId) ?? items[0];

  const selectItem = (id: string) => {
    if (activeIdProp === undefined) setInternalActiveId(id);
    onActiveChange?.(id);
  };

  return (
    <div
      className={cn(
        layoutSurfaces[surface],
        "@container flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden text-text-primary",
        className,
      )}
      {...rest}
    >
      {title !== null || headerStart || headerEnd ? (
        <div className="flex shrink-0 items-center gap-3 border-b border-border-primary px-5 py-3">
          {headerStart}
          {title !== null ? <h1 className="text-base font-semibold text-text-primary">{title}</h1> : null}
          {headerEnd ? <div className="ml-auto flex items-center gap-2">{headerEnd}</div> : null}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 @max-[640px]:flex-col">
        <nav
          aria-label={navLabel}
          className="flex w-48 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border-primary p-2 @max-[640px]:w-full @max-[640px]:flex-row @max-[640px]:gap-1 @max-[640px]:overflow-x-auto @max-[640px]:overflow-y-visible @max-[640px]:border-r-0 @max-[640px]:border-b"
        >
          {items.map((item) => {
            const isActive = item.id === activeItem?.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => selectItem(item.id)}
                className={cn(
                  "mr-row mr-press flex w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left text-[0.8125rem] transition-colors @max-[640px]:w-auto @max-[640px]:shrink-0 [&_svg]:size-[15px] [&_svg]:shrink-0",
                  isActive
                    ? "bg-bg-selected font-medium text-accent-strong"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
                )}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto">
          <div key={activeItem?.id ?? "empty"} className="mr-enter w-full px-8 py-6 @max-[640px]:px-4">
            {showSectionHeading && activeItem ? (
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-text-primary">{activeItem.label}</h2>
              </div>
            ) : null}
            <div className="space-y-8">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface SettingSectionProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
}

/** Grupa powiązanych wierszy ustawień z tytułem i opcjonalnym opisem. */
export function SettingSection({ title, description, className, children, ...rest }: SettingSectionProps) {
  return (
    <section className={cn("space-y-3", className)} {...rest}>
      <div className="space-y-1">
        <h3 className="text-xs font-semibold tracking-wider text-text-tertiary uppercase">{title}</h3>
        {description ? <p className="text-xs text-text-tertiary">{description}</p> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export interface SettingRowProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  label: ReactNode;
  description?: ReactNode;
  /** Kontrolka ustawienia; alternatywnie można przekazać jako `children`. */
  control?: ReactNode;
  children?: ReactNode;
}

/**
 * Pojedynczy wiersz ustawień z etykietą, opcjonalnym opisem i miejscem na kontrolkę.
 * Pojedynczą listę wyboru (`select` / `Select`) wiąże przez `<label>`, a inne kontrolki grupuje przez `role="group"`.
 */
export function SettingRow({ label, description, control, children, className, ...rest }: SettingRowProps) {
  const labelId = useId();
  const descriptionId = useId();
  const slot = control ?? children;

  const isSingleSelect =
    isValidElement(slot) &&
    (slot.type === "select" || (slot.type === Select && !(slot.props as { label?: ReactNode }).label));

  if (isSingleSelect) {
    return (
      <label className={cn("flex min-w-0 flex-wrap items-center justify-between gap-2", className)}>
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <span id={labelId} className="block text-sm text-text-secondary">
            {label}
          </span>
          {description ? (
            <span id={descriptionId} className="mt-0.5 block text-xs text-text-tertiary">
              {description}
            </span>
          ) : null}
        </span>
        <span className="block max-w-full min-w-0 [&>select]:max-w-full">{slot}</span>
      </label>
    );
  }

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn("flex min-w-0 flex-wrap items-center justify-between gap-2", className)}
      {...rest}
    >
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <span id={labelId} className="block text-sm text-text-secondary">
          {label}
        </span>
        {description ? (
          <p id={descriptionId} className="mt-0.5 text-xs text-text-tertiary">
            {description}
          </p>
        ) : null}
      </div>
      <div className="max-w-full min-w-0 [&>select]:max-w-full">{slot}</div>
    </div>
  );
}

export interface SettingToggleRowProps extends Omit<SwitchProps, "label" | "description" | "onToggle"> {
  label: ReactNode;
  description?: ReactNode;
  /** Opcjonalny skrót wywoływany obok `onCheckedChange` przy przełączeniu. */
  onToggle?: (checked: boolean) => void;
}

/** Wiersz ustawień z przełącznikiem `Switch`, etykietą i opisem po lewej stronie. */
export function SettingToggleRow({
  label,
  description,
  onCheckedChange,
  onToggle,
  className,
  id,
  ...rest
}: SettingToggleRowProps) {
  const generatedId = useId();
  const descriptionId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={cn("flex min-w-0 items-center justify-between gap-4", className)}>
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <label htmlFor={inputId} className="block text-sm text-text-secondary">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="mt-0.5 text-xs text-text-tertiary">
            {description}
          </p>
        ) : null}
      </div>
      <Switch
        id={inputId}
        aria-describedby={description ? descriptionId : undefined}
        className="shrink-0"
        onCheckedChange={(checked) => {
          onCheckedChange?.(checked);
          onToggle?.(checked);
        }}
        {...rest}
      />
    </div>
  );
}
