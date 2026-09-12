import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IslandApp } from "./island/IslandApp";
import { CommandCenterApp } from "./components/CommandCenterApp";
import { CloseTargetApp } from "./components/CloseTargetApp";

export default function App() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(getCurrentWindow().label);
  }, []);

  if (label === null) return null;
  if (label === "close-target") return <CloseTargetApp />;
  return label === "island" ? <IslandApp /> : <CommandCenterApp />;
}