import {
  Activity,
  AudioLines,
  BookOpen,
  Drum,
  LayoutGrid,
  Mic2,
  Radio,
  Scissors,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** Tabs paintable onto the mastering canvas (shared by page + dock). */
export type MasteringTab =
  | "modules"
  | "splitter"
  | "vocal"
  | "songstarter"
  | "genres"
  | "pipeline"
  | "analysis"
  | "stereo"
  | "live";

export interface DockModuleDef {
  key: MasteringTab;
  label: string;
  icon: LucideIcon;
}

/**
 * The dock IS the module navigator: one item per module, exact labels/icons
 * inherited from the old Módulos dropdown. Order defines the two groups
 * separated by the telemetry tiles in the dock center.
 */
export const DOCK_MODULES: readonly DockModuleDef[] = [
  { key: "modules", label: "Macro-Carácter", icon: LayoutGrid },
  { key: "splitter", label: "Splitter", icon: Scissors },
  { key: "vocal", label: "Vocal", icon: Mic2 },
  { key: "songstarter", label: "Beats", icon: Drum },
  { key: "genres", label: "Guía de Géneros", icon: BookOpen },
  { key: "pipeline", label: "Cadena de Master", icon: AudioLines },
  { key: "analysis", label: "Análisis", icon: Activity },
  { key: "stereo", label: "Estéreo", icon: Radio },
  { key: "live", label: "Live Engine", icon: Zap },
];
