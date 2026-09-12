import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Loader2 } from "lucide-react";
import { ipc } from "../lib/ipc";
import { useProjectsStore } from "../stores/projectsStore";
import { useUiStore } from "../stores/uiStore";
import { Button, Mono, TextInput } from "./ui";

type Phase = "pick" | "scanning" | "review" | "error";

export function ProjectPickerDialog({ onClose }: { onClose: () => void }) {
  const add = useProjectsStore((s) => s.add);
  const toast = useUiStore((s) => s.toast);

  const [phase, setPhase] = useState<Phase>("pick");
  const [path, setPath] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [buildCommand, setBuildCommand] = useState<string>("");
  const [devCommand, setDevCommand] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const defaultName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? "Project";

  const pick = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || Array.isArray(selected)) return;
    setPath(selected);
    setPhase("scanning");
    try {
      const isGit = await ipc.checkIsGit(selected);
      if (!isGit) {
        setError("This folder is not a Git repository.");
        setPhase("error");
        return;
      }
      setName(defaultName(selected));
      setPhase("review");
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      await add(
        name.trim() || defaultName(path),
        path,
        buildCommand.trim() || null,
        devCommand.trim() || null,
        null
      );
      toast(`${name.trim() || defaultName(path)} registered`, { variant: "success" });
      onClose();
    } catch (e) {
      setError(String(e));
      setPhase("error");
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop fixed inset-0 z-40 flex items-center justify-center">
      <div className="fade-in w-[440px] rounded-xl border border-border bg-surface p-5 shadow-2xl shadow-black/50">
        <div className="text-sm font-medium text-text">Add Project</div>
        <div className="mt-1 text-xs text-secondary">
          Register a local Git repository. Dev Pilot never copies or moves your files — it monitors them in place.
        </div>

        <div className="mt-4">
          {phase === "pick" && (
            <Button
              variant="primary"
              icon={<FolderOpen className="h-3.5 w-3.5" />}
              onClick={pick}
              className="w-full justify-center py-2"
            >
              Choose Repository Folder…
            </Button>
          )}

          {phase === "scanning" && (
            <div className="flex items-center gap-2 text-xs text-secondary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Scanning repository…
            </div>
          )}

          {phase === "error" && (
            <div>
              <div className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
                {error}
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" onClick={pick}>
                  Try Again
                </Button>
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {phase === "review" && (
            <div className="flex flex-col gap-3">
              <div>
                <div className="label-overline mb-1">Repository</div>
                <Mono className="block truncate text-secondary">{path}</Mono>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="label-overline">Project name</label>
                <TextInput value={name} onChange={setName} placeholder="Project name" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <label className="label-overline">Build command (optional)</label>
                  <TextInput value={buildCommand} onChange={setBuildCommand} placeholder="npm run build" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="label-overline">Dev command (optional)</label>
                  <TextInput value={devCommand} onChange={setDevCommand} placeholder="npm run dev" />
                </div>
              </div>
              <div className="mt-1 flex justify-end gap-2">
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={confirm} disabled={busy}>
                  {busy ? "Registering…" : "Register Project"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}