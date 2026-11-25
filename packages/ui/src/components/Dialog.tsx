"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { Button } from "./Button.js";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Przyciski na dole okna (np. Anuluj, Zapisz). */
  footer?: ReactNode;
  /** Szerokość panelu, np. "max-w-md". */
  className?: string;
  /** Etykieta przycisku zamknięcia dla czytników ekranu. */
  closeLabel?: string;
}

/**
 * Okno dialogowe w mocnym szkle (Radix Dialog): tytuł, treść i stopka. Renderowane w portalu, bo szkło
 * kart więzi elementy o stałej pozycji. Escape i kliknięcie obok zamykają okno, focus wraca do przycisku.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  closeLabel = "Zamknij",
}: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="mr-overlay mr-animate-overlay fixed inset-0 z-[var(--mr-z-overlay)]" />
        <DialogPrimitive.Content
          className={cn(
            "mr-float mr-animate-panel fixed top-1/2 left-1/2 z-[var(--mr-z-modal)] flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl text-text-primary outline-none",
            className,
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border-primary px-4 py-3">
            <DialogPrimitive.Title className="min-w-0 truncate text-sm font-semibold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="xs" iconOnly aria-label={closeLabel}>
                <X aria-hidden />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="overflow-y-auto px-4 py-4 text-sm">
            {description ? (
              <DialogPrimitive.Description className="mb-3 text-text-secondary">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
            {children}
          </div>
          {footer ? (
            <div className="flex justify-end gap-2 border-t border-border-secondary px-4 py-3">{footer}</div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Działanie nieodwracalne (np. usunięcie): czerwony przycisk. */
  danger?: boolean;
  onConfirm: () => void;
}

/** Pytanie z dwoma odpowiedziami, np. „Usunąć skrzynkę?” z przyciskami Anuluj i Usuń. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Anuluj",
  danger = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      className="max-w-sm"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            size="md"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
