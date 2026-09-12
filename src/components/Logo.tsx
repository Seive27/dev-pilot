import logoUrl from "../assets/dev-pilot.png";
import { cx } from "../lib/utils";

/**
 * The official Dev Pilot mark. One source of truth for in-app branding —
 * never substitute a placeholder or generic developer icon.
 *
 * `fit="cover"` is used where the logo fills a circular container (the idle
 * Dynamic Island), `contain` elsewhere so the full mark is always visible.
 */
export function Logo({
  size = 18,
  className,
  fit = "contain",
}: {
  size?: number;
  className?: string;
  fit?: "contain" | "cover";
}) {
  return (
    <img
      src={logoUrl}
      alt="Dev Pilot"
      width={size}
      height={size}
      draggable={false}
      className={cx(
        "shrink-0 select-none",
        fit === "cover" ? "object-cover" : "object-contain",
        className
      )}
      style={{ width: size, height: size }}
    />
  );
}
