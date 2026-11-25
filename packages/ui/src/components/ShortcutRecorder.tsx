"use client";

import { useEffect, useId, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cn } from "../lib/cn.js";
import { formatShortcut, recordShortcut, type ShortcutIssue } from "../lib/shortcuts.js";
import { Button } from "./Button.js";
import { Checkbox } from "./Checkbox.js";
import { Kbd } from "./Kbd.js";

export interface ShortcutRecorderProps {
  /** Aktualnie zapisany skrót (np. `"mod+k"` lub `"g i"`). Pusty ciąg oznacza brak skrótu. */
  value: string;
  onChange: (shortcut: string) => void;
  /** Walidator sprawdzający konflikty lub skróty zastrzeżone. */
  validate?: (shortcut: string) => string | ShortcutIssue | null | undefined;
  /** Nazwa akcji używana w `aria-label` przycisku nagrywania. */
  label?: string;
  /** Czy zezwalać na nagrywanie sekwencji dwóch klawiszy (domyślnie `true`). */
  allowSequence?: boolean;
  /** Kontrolowany tryb nagrywania sekwencji dwóch klawiszy. */
  sequence?: boolean;
  onSequenceChange?: (sequence: boolean) => void;
  /** Domyślny tryb nagrywania sekwencji, gdy `sequence` nie jest kontrolowane. */
  defaultSequence?: boolean;
  /** Czy wyświetlić przełącznik sekwencji (domyślnie równe `allowSequence`). */
  showSequenceToggle?: boolean;
  /** Opcjonalny callback przywracania skrótu; pokazuje przycisk „Przywróć”, gdy podany. */
  onReset?: () => void;
  disabled?: boolean;
  mac?: boolean;
  placeholder?: string;
  recordingLabel?: string;
  sequenceToggleLabel?: string;
  className?: string;
}

function formatIssueMessage(issue: string | ShortcutIssue | null | undefined): string | null {
  if (!issue) return null;
  if (typeof issue === "string") return issue;
  if (issue.type === "reserved") return "Ten skrót jest zarezerwowany przez system.";
  if (issue.type === "invalid") return "Nieprawidłowy skrót.";
  return issue.conflictLabel ? `Ten skrót koliduje z „${issue.conflictLabel}”.` : "Ten skrót jest już zajęty.";
}

/**
 * Przycisk nagrywania skrótu klawiszowego (akordu albo sekwencji dwóch klawiszy, jak w ustawieniach aven-mail).
 * Escape anuluje nagrywanie, a Backspace czyści bieżący skrót.
 */
export function ShortcutRecorder({
  value,
  onChange,
  validate,
  label,
  allowSequence = true,
  sequence: controlledSequence,
  onSequenceChange,
  defaultSequence = false,
  showSequenceToggle = allowSequence,
  onReset,
  disabled = false,
  mac,
  placeholder = "-",
  recordingLabel = "Naciśnij klawisze…",
  sequenceToggleLabel = "Sekwencja dwóch klawiszy",
  className,
}: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [first, setFirst] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uncontrolledSequence, setUncontrolledSequence] = useState(defaultSequence);

  const isSequence = allowSequence && (controlledSequence !== undefined ? controlledSequence : uncontrolledSequence);
  const errorId = useId();

  useEffect(() => {
    if (!recording) return;
    const cancel = () => {
      setRecording(false);
      setFirst("");
    };
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, [recording]);

  const setSequenceMode = (next: boolean) => {
    if (controlledSequence === undefined) setUncontrolledSequence(next);
    onSequenceChange?.(next);
  };

  const commitShortcut = (candidate: string) => {
    const issueMessage = formatIssueMessage(validate?.(candidate));
    if (issueMessage) {
      setError(issueMessage);
      setFirst("");
      return;
    }
    setError(null);
    setRecording(false);
    setFirst("");
    onChange(candidate);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      setRecording(false);
      setFirst("");
      return;
    }

    if (event.key === "Backspace" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      setRecording(false);
      setFirst("");
      setError(null);
      onChange("");
      return;
    }

    if (disabled || event.repeat || event.nativeEvent.isComposing) return;

    const formatOpts = mac !== undefined ? { mac } : undefined;
    const recorded = recordShortcut(event.nativeEvent, formatOpts);
    if (!recorded) return;

    if (isSequence && !first) {
      setFirst(recorded);
      setError(null);
      return;
    }

    const candidate = first ? `${first} ${recorded}` : recorded;
    commitShortcut(candidate);
  };

  const formatOpts = mac !== undefined ? { mac, emptyLabel: placeholder } : { emptyLabel: placeholder };
  const buttonDisplay = recording
    ? first
      ? `${formatShortcut(first, formatOpts)} → …`
      : recordingLabel
    : formatShortcut(value, formatOpts);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          aria-label={label ? `Zmień skrót: ${label}` : "Zmień skrót"}
          aria-pressed={recording}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onClick={(event) => {
            // WebKit na macOS nie ustawia fokusu na przycisku po kliknięciu domyślnie.
            event.currentTarget.focus();
            setRecording((prev) => !prev);
            setFirst("");
            setError(null);
          }}
          onBlur={() => {
            setRecording(false);
            setFirst("");
          }}
          onKeyDown={handleKeyDown}
          className={cn(
            "mr-press mr-no-text-shadow inline-flex min-h-8 min-w-24 items-center justify-center rounded-control border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            recording
              ? "border-accent bg-accent/15 text-accent-strong"
              : "border-border-primary bg-bg-tertiary text-text-primary hover:border-accent/50",
          )}
        >
          {recording ? (
            <span className="font-medium">{buttonDisplay}</span>
          ) : (
            <Kbd className="border-0 bg-transparent px-0 text-inherit">{buttonDisplay}</Kbd>
          )}
        </button>

        {showSequenceToggle ? (
          <Checkbox
            label={sequenceToggleLabel}
            checked={isSequence}
            disabled={disabled}
            onCheckedChange={(checked) => setSequenceMode(checked === true)}
          />
        ) : null}

        {onReset ? (
          <Button variant="ghost" size="xs" disabled={disabled} onClick={onReset}>
            Przywróć
          </Button>
        ) : null}
      </div>

      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
