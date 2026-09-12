import type { DockEdge } from "../types";

/**
 * Decorative "edge root": a small curved connector that visually attaches the
 * Dynamic Island to the screen edge it is docked against.
 *
 * It renders into the padding strip the island window reserves on the docked
 * side (window_mgr's PADDING + EDGE_INSET = 16px, see styles.css `.island-root`)
 * and is purely cosmetic — it never captures pointer events.
 *
 * Geometry is authored once in a "top mount" frame and mapped onto the active
 * edge, so it stays attached when the island moves, resizes, or changes dock
 * orientation.
 */

/** Gap between the pill's docked edge and the window (screen) edge, in px. */
const ROOT_GAP = 16;
/** How far the connector's fill bleeds into the pill to hide the seam, in px. */
const ROOT_BLEED = 2;

interface RootShape {
  /** Half-width of the stem at the screen edge. */
  stem: number;
  /** Half-width where the connector meets the pill. */
  base: number;
  /** Radius of the concave fillet blending the stem into the base. */
  fillet: number;
}

/**
 * The idle island is a circle, so its connector must stay narrow enough to sit
 * within the silhouette. The peek / expanded panels have a flat docked edge and
 * can take a slightly wider, more organic flare.
 */
const SHAPES: Record<"round" | "flat", RootShape> = {
  round: { stem: 4, base: 6, fillet: 2 },
  flat: { stem: 5, base: 10, fillet: 5 },
};

export function EdgeRoot({
  edge,
  round,
  tone,
}: {
  edge: DockEdge;
  /** True for the circular idle island, false for the flat-topped panels. */
  round: boolean;
  tone?: "err" | "warn" | "ok" | "idle" | null;
}) {
  const { stem, base, fillet } = round ? SHAPES.round : SHAPES.flat;
  const boxSmall = base * 2;
  const boxLong = ROOT_GAP;
  const centerX = boxSmall / 2;
  const yTip = 0;
  const yBase = ROOT_GAP;
  const yFillet = ROOT_GAP - fillet;

  const map = ([x, y]: [number, number]): [number, number] => {
    switch (edge) {
      case "bottom":
        return [x, boxLong - y];
      case "left":
        return [y, x];
      case "right":
        return [boxLong - y, x];
      default:
        return [x, y];
    }
  };

  const raw: [number, number][] = [
    [centerX - stem, yTip],
    [centerX - stem, yFillet],
    [centerX - stem, yBase],
    [centerX - base, yBase],
    [centerX + base, yBase],
    [centerX + stem, yBase],
    [centerX + stem, yFillet],
    [centerX + stem, yTip],
  ];
  const points = raw.map(map);
  const p = (i: number) => `${points[i][0]} ${points[i][1]}`;
  const flat = ([x, y]: [number, number]) => map([x, y]).join(" ");

  // Closed fill: stem + fillets, then a short bleed below the pill edge that
  // closes the notch where the pill's edge curves away from the connector.
  const fill = [
    `M ${p(0)}`,
    `L ${p(1)}`,
    `Q ${p(2)} ${p(3)}`,
    `L ${flat([centerX - base, yBase + ROOT_BLEED])}`,
    `L ${flat([centerX + base, yBase + ROOT_BLEED])}`,
    `L ${p(4)}`,
    `Q ${p(5)} ${p(6)}`,
    `L ${p(7)}`,
    "Z",
  ].join(" ");

  // Open outline: only the two sides and their fillets, so no line is drawn
  // across the pill edge — the pill's own border forms the junction.
  const outline = `M ${p(0)} L ${p(1)} Q ${p(2)} ${p(3)} M ${p(4)} Q ${p(5)} ${p(6)} L ${p(7)}`;

  const vertical = edge === "left" || edge === "right";
  const width = vertical ? boxLong : boxSmall;
  const height = vertical ? boxSmall : boxLong;

  const toneClass =
    tone === "err" ? "is-error" : tone === "warn" ? "is-warning" : "";

  return (
    <div
      className={`island-root ${toneClass}`.trim()}
      data-edge={edge}
      aria-hidden="true"
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <path className="root-fill" d={fill} />
        <path className="root-outline" d={outline} />
      </svg>
    </div>
  );
}
