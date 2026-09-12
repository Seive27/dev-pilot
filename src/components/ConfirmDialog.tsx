import { AlertTriangle } from "lucide-react";
import { useUiStore } from "../stores/uiStore";
import { Button } from "./ui";

export function ConfirmDialog() {
  const confirm = useUiStore((s) => s.confirm);
  const resolve = useUiStore((s) => s.resolveConfirm);

  if (!confirm) return null;

  return (
    <div className="dialog-backdrop fixed inset-0 z-40 flex items-center justify-center">
      <div className="fade-in w-[380px] rounded-xl border border-border bg-surface p-4 shadow-2xl shadow-black/50">
        <div className="flex items-start gap-3">
          {confirm.danger && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
          <div className="min-w-0">
            <div className="text-sm font-medium text-text">{confirm.title}</div>
            {confirm.message && <div className="mt-1 text-xs text-secondary">{confirm.message}</div>}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => resolve(false)}>
            Cancel
          </Button>
          <Button
            variant={confirm.danger ? "danger" : "primary"}
            onClick={() => resolve(true)}
          >
            {confirm.confirmLabel ?? "Confirm"}
          </Button>
        </div>
      </div>
    </div>
  );
}