// Shared UI primitives — Notion dark: hairlines over boxes, elevation over borders,
// type weight over color. Every control here is one job, one name.
import { ReactNode, useEffect, useRef } from "react";

// Dialogs stack (the model picker opens over Settings). Escape must close only the topmost,
// so every open dialog registers here and checks it owns the top slot before reacting.
const dialogStack: symbol[] = [];

export function useDialog(onClose: () => void): void {
  const id = useRef<symbol | null>(null);
  if (!id.current) id.current = Symbol("dialog");

  useEffect(() => {
    const self = id.current!;
    dialogStack.push(self);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (dialogStack[dialogStack.length - 1] !== self) return; // a dialog above us owns this
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      const i = dialogStack.indexOf(self);
      if (i !== -1) dialogStack.splice(i, 1);
      if (!dialogStack.length) document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      {title && <div className="text-sm font-medium mb-3">{title}</div>}
      {children}
    </div>
  );
}

export function PageTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-xl font-semibold tracking-tight">{children}</h1>
      {right}
    </div>
  );
}

export function Pct({ value }: { value: number }) {
  return <span>{(value * 100).toFixed(0)}%</span>;
}

/** Minimal inline bar (0..1). No chart lib — keep it dependency-free. */
export function Bar({ value, label }: { value: number; label?: string }) {
  return (
    <div>
      {label && (
        <div className="flex justify-between text-xs text-muted mb-1">
          <span>{label}</span>
          <span>{(value * 100).toFixed(0)}%</span>
        </div>
      )}
      <div className="h-2 rounded bg-soft overflow-hidden">
        <div className="h-full bg-accent" style={{ width: `${Math.min(100, value * 100)}%` }} />
      </div>
    </div>
  );
}

/** Minimal sparkline as inline SVG. points: y-values 0..1. */
export function Spark({ points }: { points: number[] }) {
  if (points.length < 2) return <div className="text-xs text-muted">Not enough data yet</div>;
  const w = 320;
  const h = 48;
  const step = w / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(h - p * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={d} fill="none" stroke="currentColor" className="text-accent" strokeWidth={1.5} />
    </svg>
  );
}

export function EngineTag({ id }: { id: string }) {
  const label: Record<string, string> = {
    perplexity: "Perplexity",
    openai: "ChatGPT",
    gemini: "Gemini",
    ai_overviews: "AI Overviews",
  };
  // OpenRouter engines are "openrouter:anthropic/claude-sonnet-5" — show the model, not the
  // transport. The full id stays in the tooltip.
  const via = id.startsWith("openrouter:");
  const text = via
    ? id.slice("openrouter:".length).split("/").slice(1).join("/") || id
    : label[id] ?? id;

  return (
    <span
      title={id}
      className="inline-block rounded bg-soft px-1.5 py-0.5 font-mono text-xs text-muted"
    >
      {text}
      {via && <span className="ml-1 text-faint">via OR</span>}
    </span>
  );
}

// ─── Primitives ──────────────────────────────────────────────────────────────

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const styles = {
    primary: "bg-accent text-white hover:brightness-110",
    secondary: "border border-line bg-raised text-ink hover:bg-line",
    ghost: "text-muted hover:bg-raised hover:text-ink",
    danger: "text-danger hover:bg-raised",
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  mono,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "password" | "number";
  mono?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      autoFocus={autoFocus}
      autoComplete="off"
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-md border border-line bg-bg px-3 py-1.5 text-sm text-ink transition-colors placeholder:text-faint hover:border-faint focus:border-accent focus:outline-none ${
        mono ? "font-mono" : ""
      }`}
    />
  );
}

/** Label above a control. The label labels; the hint explains. Neither does both jobs. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

/** Status dot. Color is a second signal — the adjacent text always says it too. */
export function Dot({ tone }: { tone: "ok" | "off" | "danger" }) {
  const color = { ok: "bg-ok", off: "bg-faint", danger: "bg-danger" }[tone];
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />;
}

export function Chip({ children, onRemove }: { children: ReactNode; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-soft px-2 py-0.5 font-mono text-xs text-muted">
      {children}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label="Remove"
          className="text-faint transition-colors hover:text-danger"
        >
          ×
        </button>
      )}
    </span>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "danger";
  children: ReactNode;
}) {
  const styles =
    tone === "danger"
      ? "border-danger/30 bg-danger/10 text-danger"
      : "border-line bg-panel text-muted";
  return <div className={`rounded-md border px-3 py-2 text-sm ${styles}`}>{children}</div>;
}

/**
 * Centred dialog for work that would otherwise push the page around — the model catalogue
 * being the case that forced it. Escape closes; the backdrop closes; body scroll is locked.
 */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  layer = 50,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Raise above another dialog when nested. */
  layer?: 50 | 60;
}) {
  useDialog(onClose);

  return (
    <div
      style={{ zIndex: layer }}
      className="fixed inset-0 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="my-auto flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <div className="text-sm font-medium">{title}</div>
            {subtitle && <div className="mt-0.5 text-xs text-muted">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-muted transition-colors hover:bg-raised hover:text-ink"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
