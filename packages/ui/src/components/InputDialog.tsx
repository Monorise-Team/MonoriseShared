"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type SyntheticEvent } from "react";
import { Button } from "./Button.js";
import { Dialog } from "./Dialog.js";
import { TextField } from "./TextField.js";

export interface InputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  label: ReactNode;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  /** Wymaga niepustego tekstu, gdy nie podano własnej funkcji `validate` (domyślnie `true`). */
  required?: boolean;
  /** Walidacja wartości: zwrócenie tekstu wyświetla błąd i blokuje zatwierdzenie. */
  validate?: (value: string) => string | null | undefined;
  confirmLabel?: string;
  cancelLabel?: string;
  closeLabel?: string;
  className?: string;
  onConfirm: (value: string) => void;
}

/**
 * Okno dialogowe z pojedynczym polem tekstowym (na bazie `Dialog`): walidacja, zatwierdzenie klawiszem
 * Enter oraz automatyczne ustawienie focusu i zaznaczenie tekstu po otwarciu.
 */
export function InputDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  defaultValue = "",
  placeholder,
  type = "text",
  required,
  validate,
  confirmLabel = "Zapisz",
  cancelLabel = "Anuluj",
  closeLabel = "Zamknij",
  className = "max-w-sm",
  onConfirm,
}: InputDialogProps) {
  const formId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setValue(defaultValue);
      setError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    const focusAndSelect = () => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    };
    focusAndSelect();
    const frame = requestAnimationFrame(focusAndSelect);
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const isRequired = required ?? !validate;
  const isSubmitDisabled = isRequired && !value.trim();

  const submit = () => {
    if (isSubmitDisabled) return;
    const validationError = validate?.(value);
    if (validationError) {
      setError(validationError);
      return;
    }
    onConfirm(value);
    onOpenChange(false);
  };

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      closeLabel={closeLabel}
      className={className}
      footer={
        <>
          <Button variant="secondary" size="md" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button type="submit" form={formId} variant="primary" size="md" disabled={isSubmitDisabled}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit}>
        <TextField
          ref={inputRef}
          autoFocus
          type={type}
          label={label}
          value={value}
          placeholder={placeholder}
          error={error ?? undefined}
          onChange={(event) => {
            const next = event.target.value;
            setValue(next);
            if (error !== null) {
              setError(validate?.(next) ?? null);
            }
          }}
          onKeyDown={handleKeyDown}
        />
      </form>
    </Dialog>
  );
}
