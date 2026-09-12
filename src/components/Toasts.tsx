import { CheckCircle2, Info, XCircle } from "lucide-react";
import { useUiStore } from "../stores/uiStore";
import { cx } from "../lib/utils";

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cx(
            "toast-in pointer-events-auto flex cursor-pointer items-start gap-2.5 rounded-lg border bg-surface-2/95 px-3 py-2.5 shadow-lg shadow-black/30",
            t.variant === "error" ? "border-error/30" : "border-border"
          )}
        >
          {t.variant === "error" ? (
            <XCircle className="mt-px h-3.5 w-3.5 shrink-0 text-error" />
          ) : t.variant === "success" ? (
            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-success" />
          ) : (
            <Info className="mt-px h-3.5 w-3.5 shrink-0 text-secondary" />
          )}
          <div className="min-w-0">
            <div className="text-xs font-medium text-text">{t.title}</div>
            {t.detail && <div className="mt-0.5 break-words text-[11px] text-secondary">{t.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}