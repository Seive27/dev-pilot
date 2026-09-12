import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import type { Window as TauriWindow } from "@tauri-apps/api/window";
import type { DockEdge, MonitorInfo, PhysRect } from "../types";

export const SNAP_THRESHOLD = 80;

export function nearestMonitor(layout: MonitorInfo[], x: number, y: number): MonitorInfo {
  let best = layout[0];
  let bestD = Infinity;
  for (const m of layout) {
    const dx = Math.max(m.work.x - x, 0, x - (m.work.x + m.work.width));
    const dy = Math.max(m.work.y - y, 0, y - (m.work.y + m.work.height));
    const d = Math.hypot(dx, dy);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

export function clampRectToWork(rect: PhysRect, work: PhysRect): PhysRect {
  return {
    x: Math.min(Math.max(rect.x, work.x), work.x + work.width - rect.width),
    y: Math.min(Math.max(rect.y, work.y), work.y + work.height - rect.height),
    width: rect.width,
    height: rect.height,
  };
}

export interface EdgeHint {
  edge: DockEdge;
  monitor: MonitorInfo;
  distance: number;
  offset: number;
}

/** Distance from a rect to each work-area edge; picks the nearest. */
export function nearestEdge(rect: PhysRect, work: PhysRect): EdgeHint {
  const candidates: { edge: DockEdge; distance: number; offset: number }[] = [
    { edge: "top", distance: rect.y - work.y, offset: edgeOffset(rect, work, "top") },
    { edge: "bottom", distance: work.y + work.height - (rect.y + rect.height), offset: edgeOffset(rect, work, "bottom") },
    { edge: "left", distance: rect.x - work.x, offset: edgeOffset(rect, work, "left") },
    { edge: "right", distance: work.x + work.width - (rect.x + rect.width), offset: edgeOffset(rect, work, "right") },
  ];
  let best = candidates[0];
  for (const c of candidates) {
    if (c.distance < best.distance) best = c;
  }
  return { edge: best.edge, monitor: undefined as never, distance: best.distance, offset: best.offset };
}

function edgeOffset(rect: PhysRect, work: PhysRect, edge: DockEdge): number {
  const travelX = Math.max(work.width - rect.width, 0);
  const travelY = Math.max(work.height - rect.height, 0);
  const offset =
    edge === "top" || edge === "bottom"
      ? (rect.x - work.x) / travelX
      : (rect.y - work.y) / travelY;
  return Math.min(Math.max(offset, 0), 1);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Animate the island window between two physical rects. */
export async function tweenWindow(
  win: TauriWindow,
  from: PhysRect,
  to: PhysRect,
  ms = 180
): Promise<void> {
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const step = async (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = easeOutCubic(t);
      const x = Math.round(lerp(from.x, to.x, e));
      const y = Math.round(lerp(from.y, to.y, e));
      const width = Math.max(10, Math.round(lerp(from.width, to.width, e)));
      const height = Math.max(10, Math.round(lerp(from.height, to.height, e)));

      await Promise.all([
        win.setPosition(new PhysicalPosition(x, y)),
        win.setSize(new PhysicalSize(width, height)),
      ]);

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}