import type { ReactNode } from "react";
import {
  useSettingsStore,
  AUTO_HIDE_OPTIONS,
  POLLING_OPTIONS,
  REMOTE_POLLING_OPTIONS,
} from "../stores/settingsStore";
import { Select, Section, Switch } from "../components/ui";
import { cx } from "../lib/utils";

function SettingRow({
  label,
  description,
  children,
  disabled,
}: {
  label: string;
  description?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={cx("flex items-center justify-between gap-4 px-3.5 py-2.5", disabled && "opacity-45")}>
      <div className="min-w-0">
        <div className="text-xs font-medium text-text">{label}</div>
        {description && <div className="mt-0.5 text-[11px] leading-snug text-muted">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Section
      title={title}
      className="mt-4"
      right={note ? <span className="text-[10px] text-muted">{note}</span> : undefined}
    >
      <div className="flex flex-col divide-y divide-border/60 rounded-md border border-border bg-surface">
        {children}
      </div>
    </Section>
  );
}

export function SettingsPage() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="max-w-3xl">
          <h1 className="text-sm font-semibold text-text">Settings</h1>
          <div className="mt-0.5 text-[11px] text-muted">
            Changes apply immediately and are stored locally — Dev Pilot works fully offline.
          </div>

          <Group title="General">
            <SettingRow
              label="Launch on Windows startup"
              description="Automatically launch Dev Pilot when you sign in to Windows."
            >
              <Switch
                checked={settings.autostart}
                onChange={(v) => update({ autostart: v })}
                label="Launch on Windows startup"
              />
            </SettingRow>
            <SettingRow
              label="Start minimized"
              description="Start quietly in the tray without opening the Command Center."
            >
              <Switch
                checked={settings.startMinimized}
                onChange={(v) => update({ startMinimized: v })}
                label="Start minimized"
              />
            </SettingRow>
            <SettingRow
              label="Minimize to tray"
              description="Keep Dev Pilot running when the Command Center is closed."
            >
              <Switch
                checked={settings.minimizeToTray}
                onChange={(v) => update({ minimizeToTray: v })}
                label="Minimize to tray"
              />
            </SettingRow>
            <SettingRow
              label="Show Dynamic Island"
              description="Show the floating developer status interface."
            >
              <Switch
                checked={settings.showIsland}
                onChange={(v) => update({ showIsland: v })}
                label="Show Dynamic Island"
              />
            </SettingRow>
          </Group>

          <Group title="Dynamic Island">
            <SettingRow label="Dock position" description="Which screen edge the island snaps to.">
              <Select
                value={settings.dockPosition}
                onChange={(v) => update({ dockPosition: v as typeof settings.dockPosition })}
                options={[
                  { value: "top", label: "Top" },
                  { value: "bottom", label: "Bottom" },
                  { value: "left", label: "Left" },
                  { value: "right", label: "Right" },
                ]}
              />
            </SettingRow>
            <SettingRow label="Island size" description="Default is recommended for most displays.">
              <Select
                value={settings.islandSize}
                onChange={(v) => update({ islandSize: v as typeof settings.islandSize })}
                options={[
                  { value: "small", label: "Small" },
                  { value: "normal", label: "Default" },
                  { value: "large", label: "Large" },
                ]}
              />
            </SettingRow>
            <SettingRow label="Animation" description="Smooth transitions when expanding, collapsing and docking.">
              <Switch
                checked={settings.animation}
                onChange={(v) => update({ animation: v })}
                label="Animation"
              />
            </SettingRow>
            <SettingRow
              label="Auto-hide delay"
              description="Collapse the expanded island after inactivity. Never collapses while you interact with it."
            >
              <Select
                value={String(settings.autoHideDelay)}
                onChange={(v) => update({ autoHideDelay: Number(v) })}
                options={AUTO_HIDE_OPTIONS.map((n) => ({
                  value: String(n),
                  label: n === 0 ? "Off" : `${n} sec`,
                }))}
              />
            </SettingRow>
          </Group>

          <Group title="Repository Monitoring">
            <SettingRow
              label="Monitor repositories"
              description="Continuously watch registered Git repositories for changes."
            >
              <Switch
                checked={settings.monitoringEnabled}
                onChange={(v) => update({ monitoringEnabled: v })}
                label="Monitor repositories"
              />
            </SettingRow>
            <SettingRow
              label="Local polling interval"
              description="How frequently local repository state is checked."
              disabled={!settings.monitoringEnabled}
            >
              <Select
                value={String(settings.pollingInterval)}
                onChange={(v) => update({ pollingInterval: Number(v) })}
                disabled={!settings.monitoringEnabled}
                options={POLLING_OPTIONS.map((n) => ({ value: String(n), label: `${n} sec` }))}
              />
            </SettingRow>
            <SettingRow
              label="Remote monitoring"
              description="Periodically check remote tracking branches for incoming collaborator commits."
              disabled={!settings.monitoringEnabled}
            >
              <Switch
                checked={settings.remoteMonitoringEnabled}
                onChange={(v) => update({ remoteMonitoringEnabled: v })}
                disabled={!settings.monitoringEnabled}
                label="Remote monitoring"
              />
            </SettingRow>
            <SettingRow
              label="Remote polling interval"
              description="How frequently remote repository state is polled via git fetch."
              disabled={!settings.monitoringEnabled || !settings.remoteMonitoringEnabled}
            >
              <Select
                value={String(settings.remotePollingInterval)}
                onChange={(v) => update({ remotePollingInterval: Number(v) })}
                disabled={!settings.monitoringEnabled || !settings.remoteMonitoringEnabled}
                options={REMOTE_POLLING_OPTIONS.map((n) => ({
                  value: String(n),
                  label: n >= 60 ? `${n / 60} min` : `${n} sec`,
                }))}
              />
            </SettingRow>
            <SettingRow
              label="Notify on new collaborator commits"
              description="Show notifications and Dynamic Island alerts when collaborator commits arrive."
              disabled={!settings.monitoringEnabled || !settings.remoteMonitoringEnabled}
            >
              <Switch
                checked={settings.notifyOnRemoteCommits}
                onChange={(v) => update({ notifyOnRemoteCommits: v })}
                disabled={!settings.monitoringEnabled || !settings.remoteMonitoringEnabled}
                label="Notify on new collaborator commits"
              />
            </SettingRow>
            <SettingRow
              label="Notify on pull requests"
              description="Notify when pull requests or review requests are updated."
              disabled={!settings.monitoringEnabled || !settings.remoteMonitoringEnabled}
            >
              <Switch
                checked={settings.notifyOnPullRequests}
                onChange={(v) => update({ notifyOnPullRequests: v })}
                disabled={!settings.monitoringEnabled || !settings.remoteMonitoringEnabled}
                label="Notify on pull requests"
              />
            </SettingRow>
            <SettingRow
              label="Notify on GitHub Actions / CI failures"
              description="Receive notifications when remote builds fail."
              disabled={!settings.monitoringEnabled || !settings.remoteMonitoringEnabled}
            >
              <Switch
                checked={settings.notifyOnCiFailures}
                onChange={(v) => update({ notifyOnCiFailures: v })}
                disabled={!settings.monitoringEnabled || !settings.remoteMonitoringEnabled}
                label="Notify on GitHub Actions / CI failures"
              />
            </SettingRow>
          </Group>

          <Group title="System Monitoring" note="optional">
            <SettingRow label="CPU monitoring" description="Collect CPU usage information.">
              <Switch
                checked={settings.cpuMonitoring}
                onChange={(v) => update({ cpuMonitoring: v })}
                label="CPU monitoring"
              />
            </SettingRow>
            <SettingRow label="Memory monitoring" description="Collect system memory information.">
              <Switch
                checked={settings.ramMonitoring}
                onChange={(v) => update({ ramMonitoring: v })}
                label="Memory monitoring"
              />
            </SettingRow>
            <SettingRow label="Network monitoring" description="Collect download and upload activity.">
              <Switch
                checked={settings.networkMonitoring}
                onChange={(v) => update({ networkMonitoring: v })}
                label="Network monitoring"
              />
            </SettingRow>
          </Group>

          <div className="mt-4 pb-4 text-[10.5px] leading-relaxed text-muted">
            Dev Pilot stores its configuration as local JSON files in your Windows AppData folder.
            No repository contents are ever copied or uploaded.
          </div>
        </div>
      </div>
    </div>
  );
}
