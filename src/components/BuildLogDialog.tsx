import { X } from "lucide-react";
import type { BuildState } from "../types";
import { IconButton, Mono } from "./ui";

export function BuildLogDialog({
  build,
  onClose,
}: {
  build: BuildState;
  onClose: () => void;
}) {
  const failed = build.status === "failed";
  return (
    <div className="dialog-backdrop fixed inset-0 z-40 flex items-center justify-center">
      <div className="fade-in flex h-[70vh] w-[640px] flex-col rounded-xl border border-border bg-surface shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-medium text-text">
              {failed ? "BUILD FAILED" : "Build output"} — {build.projectName}
            </div>
            {build.command && <Mono className="mt-0.5 text-secondary">{build.command}</Mono>}
          </div>
          <IconButton onClick={onClose} title="Close">
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-auto bg-[#0c0c0e] p-4">
          {build.log.length === 0 ? (
            <div className="text-xs text-muted">No output captured.</div>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-secondary">
              {build.log.join("\n")}
            </pre>
          )}
        </div>
        {failed && build.exitCode != null && (
          <div className="border-t border-error/30 bg-error/10 px-4 py-2.5 text-xs text-error">
            Exited with code {build.exitCode}
          </div>
        )}
      </div>
    </div>
  );
}