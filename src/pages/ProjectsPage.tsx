import { useState } from "react";
import { Plus } from "lucide-react";
import { useProjectsStore } from "../stores/projectsStore";
import { useSystemStore } from "../stores/systemStore";
import { useUiStore } from "../stores/uiStore";
import { ProjectRow } from "../components/ProjectRow";
import { ProjectPickerDialog } from "../components/ProjectPickerDialog";
import { Button, EmptyState, Section } from "../components/ui";

export function ProjectsPage({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const projects = useProjectsStore((s) => s.projects);
  const snapshots = useProjectsStore((s) => s.snapshots);
  const builds = useSystemStore((s) => s.builds);
  const devServers = useSystemStore((s) => s.devServers);
  const toast = useUiStore((s) => s.toast);
  const [showPicker, setShowPicker] = useState(false);

  const monitored = projects.filter((p) => p.monitoring);
  const paused = projects.filter((p) => !p.monitoring);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex-1 px-5 py-4">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-sm font-semibold text-text">Projects</h1>
            <div className="mt-0.5 text-xs text-muted">
              {monitored.length} monitored · {paused.length} paused
            </div>
          </div>
          <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowPicker(true)}>
            Add Project
          </Button>
        </div>

        {projects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            description="Add your first Git repository to start monitoring your development activity."
            action={
              <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowPicker(true)}>
                Add Project
              </Button>
            }
          />
        ) : (
          <div className="mt-4 flex flex-col gap-5">
            {monitored.length > 0 && (
              <Section title="Monitored">
                <div className="flex flex-col gap-0.5">
                  {monitored.map((p) => {
                    const build = builds.find((b) => b.projectId === p.id);
                    const dev = devServers.find((d) => d.projectId === p.id);
                    return (
                      <ProjectRow
                        key={p.id}
                        project={p}
                        snapshot={snapshots[p.id]}
                        buildStatus={build?.status}
                        devStatus={dev?.status}
                        onClick={() => onOpenProject(p.id)}
                      />
                    );
                  })}
                </div>
              </Section>
            )}
            {paused.length > 0 && (
              <Section title="Paused">
                <div className="flex flex-col gap-0.5 opacity-60">
                  {paused.map((p) => (
                    <ProjectRow key={p.id} project={p} snapshot={snapshots[p.id]} onClick={() => onOpenProject(p.id)} />
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}

        {projects.length > 0 && (
          <div className="mt-4 text-[11px] text-muted">
            Click a project to open it. Use the actions on a project page to fetch, pull, push, or build.
          </div>
        )}
      </div>
      {showPicker && <ProjectPickerDialog onClose={() => setShowPicker(false)} />}
    </div>
  );
}