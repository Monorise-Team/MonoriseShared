"use client";

import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { Button } from "./Button.js";
import { Card } from "./Card.js";

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Własny widok zastępczy (element albo funkcja dostająca błąd i funkcję resetującą). */
  fallback?: ReactNode | ((args: { error: Error; reset: () => void }) => ReactNode);
  /** Wywołane po przechwyceniu błędu renderowania. */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  title?: ReactNode;
  message?: ReactNode;
  retryLabel?: string;
  detailsLabel?: string;
  /** Czy pokazać przełącznik szczegółów błędu (domyślnie `true`). */
  showDetails?: boolean;
  className?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
  detailsOpen: boolean;
}

/**
 * Granica błędu Reacta ze szklaną kartą błędu, przyciskiem „Spróbuj ponownie”, opcjonalnym rozwinięciem
 * szczegółów technicznych oraz obsługą własnego `fallback` i `onError`.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      componentStack: null,
      detailsOpen: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ componentStack: errorInfo.componentStack ?? null });
    this.props.onError?.(error, errorInfo);
  }

  reset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      componentStack: null,
      detailsOpen: false,
    });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const error = this.state.error ?? new Error("Wystąpił nieoczekiwany błąd.");

    if (this.props.fallback !== undefined) {
      return typeof this.props.fallback === "function"
        ? this.props.fallback({ error, reset: this.reset })
        : this.props.fallback;
    }

    const {
      title = "Coś poszło nie tak",
      message = error.message || "Wystąpił nieoczekiwany błąd.",
      retryLabel = "Spróbuj ponownie",
      detailsLabel = "Szczegóły błędu",
      showDetails = true,
      className,
    } = this.props;

    const detailsText = [error.stack ?? error.message, this.state.componentStack].filter(Boolean).join("\n");
    const canShowDetails = showDetails && Boolean(detailsText);

    return (
      <Card
        surface="reading"
        role="alert"
        className={cn("flex flex-col items-center justify-center gap-3 p-6 text-center", className)}
      >
        <div className="flex size-10 items-center justify-center rounded-2xl bg-danger/10 text-danger [&_svg]:size-5">
          <AlertTriangle aria-hidden />
        </div>
        <div className="flex max-w-md flex-col gap-1">
          <p className="text-sm font-semibold text-text-primary">{title}</p>
          <p className="text-xs break-words text-text-secondary">{message}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="primary" size="sm" onClick={this.reset}>
            {retryLabel}
          </Button>
          {canShowDetails ? (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={this.state.detailsOpen}
              icon={this.state.detailsOpen ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
              onClick={() => this.setState((prev) => ({ detailsOpen: !prev.detailsOpen }))}
            >
              {detailsLabel}
            </Button>
          ) : null}
        </div>
        {canShowDetails && this.state.detailsOpen ? (
          <pre className="mr-no-text-shadow max-h-48 w-full overflow-auto rounded-control border border-border-secondary bg-bg-tertiary p-3 text-left font-mono text-[11px] break-words whitespace-pre-wrap text-text-secondary">
            {detailsText}
          </pre>
        ) : null}
      </Card>
    );
  }
}
