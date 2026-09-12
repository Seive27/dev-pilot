import type { ReactNode } from "react";
import { cx } from "../lib/utils";

// ---- Button ---------------------------------------------------------------
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  size = "md",
  className,
  title,
  icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  title?: string;
  icon?: ReactNode;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors duration-100 select-none whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30";
  const sizes = size === "sm" ? "h-6 px-2 text-[11.5px]" : "h-7 px-2.5 text-xs";
  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-text text-bg hover:bg-white/90 active:bg-white/80",
    secondary:
      "bg-surface-2 text-text border border-border hover:bg-surface-3 hover:border-border-strong",
    ghost: "text-secondary hover:text-text hover:bg-surface-2",
    danger: "bg-error/10 text-error border border-error/30 hover:bg-error/20",
  };
  return (
    <button
      className={cx(base, sizes, variants[variant], className)}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {icon}
      {children}
    </button>
  );
}

// ---- IconButton -----------------------------------------------------------
export function IconButton({
  onClick,
  children,
  title,
  disabled,
  danger,
  className,
}: {
  onClick?: () => void;
  children: ReactNode;
  title?: string;
  disabled?: boolean;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      className={cx(
        "inline-flex h-6 w-6 items-center justify-center rounded-md text-secondary transition-colors duration-100 hover:bg-surface-2 hover:text-text disabled:opacity-40",
        danger && "hover:bg-error/15 hover:text-error",
        className
      )}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

// ---- Switch ---------------------------------------------------------------
export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cx(
        "relative h-[18px] w-8 rounded-full border transition-colors duration-150 disabled:opacity-40",
        checked ? "bg-text border-transparent" : "bg-surface-3 border-border-strong"
      )}
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span
        className={cx(
          "absolute top-[2px] h-3 w-3 rounded-full bg-bg transition-all duration-150",
          checked ? "left-[16px]" : "left-[2px]"
        )}
      />
    </button>
  );
}

// ---- Select ---------------------------------------------------------------
export function Select({
  value,
  onChange,
  options,
  className,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cx(
        "h-7 rounded-md border border-border bg-surface-2 px-2 text-xs text-text outline-none transition-colors hover:border-border-strong focus:border-border-strong focus:ring-1 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border",
        className
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ---- TextInput ------------------------------------------------------------
export function TextInput({
  value,
  onChange,
  placeholder,
  className,
  autoFocus,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) onEnter();
      }}
      className={cx(
        "h-7 rounded-md border border-border bg-surface-2 px-2.5 text-xs text-text placeholder:text-muted outline-none transition-colors focus:border-border-strong focus:ring-1 focus:ring-white/20",
        className
      )}
    />
  );
}

// ---- Section --------------------------------------------------------------
export function Section({
  title,
  children,
  right,
  className,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="label-overline">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

// ---- StatusDot ------------------------------------------------------------
export function StatusDot({
  tone,
  className,
}: {
  tone: "ok" | "warn" | "err" | "idle";
  className?: string;
}) {
  const cls =
    tone === "ok"
      ? "dot dot-ok"
      : tone === "warn"
      ? "dot dot-warn"
      : tone === "err"
      ? "dot dot-err"
      : "dot dot-idle";
  return <span className={cx(cls, className)} />;
}

// ---- EmptyState -----------------------------------------------------------
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="text-[13px] font-medium text-text">{title}</div>
      {description && <div className="max-w-sm text-xs text-muted">{description}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ---- Misc -----------------------------------------------------------------
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-[11.5px]", className)}>{children}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-surface-2 px-1 py-px font-mono text-[10px] text-secondary">
      {children}
    </kbd>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cx("h-px bg-border", className)} />;
}

export function StatRow({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn" | "err";
}) {
  return (
    <div className="flex flex-col gap-1 border-l border-border pl-4">
      <div className="label-overline">{label}</div>
      <div className={cx("text-lg font-semibold leading-tight", tone === "err" && "text-error", tone === "warn" && "text-warning", tone === "ok" && "text-success")}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

export function ProgressBar({ percent, tone }: { percent: number; tone?: "ok" | "warn" | "err" }) {
  const color =
    tone === "err" ? "bg-error" : tone === "warn" ? "bg-warning" : tone === "ok" ? "bg-success" : "bg-secondary";
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-surface-3">
      <div
        className={cx("h-full rounded-full transition-all duration-300", color)}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}