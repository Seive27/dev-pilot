import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { X } from "lucide-react";
import { cx } from "../lib/utils";

export function CloseTargetApp() {
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const unlisten = listen<boolean>("devpilot:close-target-state", (event) => {
      setHovered(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div className="flex h-screen w-screen items-center justify-center select-none bg-transparent pointer-events-none">
      <div
        className={cx(
          "flex h-12 w-12 items-center justify-center rounded-full border transition-all duration-150 ease-out",
          hovered
            ? "scale-115 border-white/35 bg-[#18181b] shadow-[0_0_24px_rgba(255,255,255,0.12)] opacity-100"
            : "scale-100 border-white/12 bg-[#101012]/90 opacity-80"
        )}
      >
        <X
          className={cx(
            "h-5 w-5 transition-colors duration-150",
            hovered ? "text-text" : "text-secondary"
          )}
          strokeWidth={2}
        />
      </div>
    </div>
  );
}
