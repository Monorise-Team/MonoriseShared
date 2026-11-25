"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { Button } from "./Button.js";
import { Dialog } from "./Dialog.js";

export interface DateTimePreset {
  label: string;
  value: Date;
  /** Opcjonalny opis po prawej stronie; bez niego formatowany jest automatycznie według `locale`. */
  detail?: string;
}

export interface DateTimePresetLabels {
  laterToday?: string;
  tomorrowMorning?: string;
  thisWeekend?: string;
  nextWeek?: string;
}

export interface DateTimePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  /** Własna lista szybkich wyborów; pusta tablica ukrywa sekcję. */
  presets?: DateTimePreset[];
  presetLabels?: DateTimePresetLabels;
  customLabel?: ReactNode;
  dateLabel?: string;
  timeLabel?: string;
  submitLabel?: string;
  closeLabel?: string;
  pastErrorMessage?: string;
  invalidErrorMessage?: string;
  /** Ustawienie `true` pozwala wybierać daty z przeszłości (domyślnie `false`, jak w Aven). */
  allowPast?: boolean;
  /** Domyślna data i godzina w polach własnych. */
  defaultValue?: Date;
  locale?: string;
  className?: string;
  onSelect: (date: Date) => void;
}

function formatDateInput(date: Date | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeInput(date: Date | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return "09:00";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function buildDefaultPresets(labels?: DateTimePresetLabels): DateTimePreset[] {
  const now = new Date();

  const laterToday = new Date(now);
  if (now.getHours() < 14) {
    laterToday.setHours(17, 0, 0, 0);
  } else {
    laterToday.setTime(now.getTime() + 3 * 60 * 60 * 1000);
  }

  const tomorrowMorning = new Date(now);
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setHours(9, 0, 0, 0);

  const weekend = new Date(now);
  const dayOfWeek = weekend.getDay();
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
  weekend.setDate(weekend.getDate() + daysUntilSaturday);
  weekend.setHours(9, 0, 0, 0);

  const nextWeek = new Date(now);
  const daysUntilMonday = (1 - dayOfWeek + 7) % 7 || 7;
  nextWeek.setDate(nextWeek.getDate() + daysUntilMonday);
  nextWeek.setHours(9, 0, 0, 0);

  return [
    { label: labels?.laterToday ?? "Później dzisiaj", value: laterToday },
    { label: labels?.tomorrowMorning ?? "Jutro rano", value: tomorrowMorning },
    { label: labels?.thisWeekend ?? "W ten weekend", value: weekend },
    { label: labels?.nextWeek ?? "W przyszłym tygodniu", value: nextWeek },
  ];
}

function isPastTimestamp(time: number): boolean {
  return time <= Date.now();
}

function parseDateTimeInputs(dateValue: string, timeValue: string): Date | null {
  const dateParts = dateValue.split("-").map(Number);
  const timeParts = timeValue.split(":").map(Number);
  if (dateParts.length !== 3 || timeParts.length < 2) return null;
  const [year, month, day] = dateParts;
  const [hours, minutes] = timeParts;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hours === undefined ||
    minutes === undefined ||
    [year, month, day, hours, minutes].some((n) => !Number.isFinite(n))
  ) {
    return null;
  }
  const dt = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

const inputClass =
  "h-8 rounded-control border border-border-primary bg-bg-tertiary px-2.5 text-xs text-text-primary outline-none transition-colors focus:border-accent";

/**
 * Okno wyboru daty i godziny z szybkimi podpowiedziami i polami własnymi (jak w `DateTimePickerDialog` w Aven).
 * Wszystkie teksty mają domyślne etykiety `pl-PL` i można je nadpisać przez propsy.
 */
export function DateTimePickerDialog({
  open,
  onOpenChange,
  title = "Wybierz datę i godzinę",
  description,
  presets,
  presetLabels,
  customLabel = "Własna data i godzina",
  dateLabel = "Data",
  timeLabel = "Godzina",
  submitLabel = "Wybierz",
  closeLabel = "Zamknij",
  pastErrorMessage = "Wybierz przyszłą datę i godzinę.",
  invalidErrorMessage = "Wybierz prawidłową datę i godzinę.",
  allowPast = false,
  defaultValue,
  locale = "pl-PL",
  className = "max-w-xs",
  onSelect,
}: DateTimePickerDialogProps) {
  const dateInputId = useId();
  const timeInputId = useId();
  const [customDate, setCustomDate] = useState(() => formatDateInput(defaultValue));
  const [customTime, setCustomTime] = useState(() => formatTimeInput(defaultValue));
  const [error, setError] = useState<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(open);
  const [defaultPresets, setDefaultPresets] = useState<DateTimePreset[]>(() => buildDefaultPresets(presetLabels));

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setCustomDate(formatDateInput(defaultValue));
      setCustomTime(formatTimeInput(defaultValue));
      setError(null);
      if (presets === undefined) {
        setDefaultPresets(buildDefaultPresets(presetLabels));
      }
    }
  }

  const activePresets = presets ?? defaultPresets;

  const commitDate = (candidate: Date) => {
    const time = candidate.getTime();
    if (!Number.isFinite(time)) {
      setError(invalidErrorMessage);
      return;
    }
    if (!allowPast && isPastTimestamp(time)) {
      setError(pastErrorMessage);
      return;
    }
    setError(null);
    onSelect(candidate);
    onOpenChange(false);
  };

  const handleCustomSubmit = () => {
    if (!customDate || !customTime) return;
    const parsed = parseDateTimeInputs(customDate, customTime);
    if (!parsed) {
      setError(invalidErrorMessage);
      return;
    }
    commitDate(parsed);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      closeLabel={closeLabel}
      className={className}
    >
      <div className="-mx-4 -my-4">
        {activePresets.length > 0 ? (
          <div className="py-1">
            {activePresets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => commitDate(new Date(preset.value.getTime()))}
                className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-hover"
              >
                <span className="min-w-0 truncate">{preset.label}</span>
                <span className="shrink-0 text-xs text-text-tertiary tabular-nums">
                  {preset.detail ??
                    preset.value.toLocaleString(locale, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div className={cn("space-y-2.5 px-4 py-3", activePresets.length > 0 && "border-t border-border-secondary")}>
          <div className="text-xs font-medium text-text-tertiary">{customLabel}</div>
          <div className="flex gap-2">
            <input
              id={dateInputId}
              aria-label={dateLabel}
              type="date"
              value={customDate}
              onChange={(event) => {
                setCustomDate(event.target.value);
                if (error) setError(null);
              }}
              className={cn(inputClass, "min-w-0 flex-1")}
            />
            <input
              id={timeInputId}
              aria-label={timeLabel}
              type="time"
              value={customTime}
              onChange={(event) => {
                setCustomTime(event.target.value);
                if (error) setError(null);
              }}
              className={cn(inputClass, "w-24 shrink-0")}
            />
          </div>
          {error ? (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          ) : null}
          <Button
            variant="primary"
            size="md"
            onClick={handleCustomSubmit}
            disabled={!customDate || !customTime}
            className="w-full"
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
