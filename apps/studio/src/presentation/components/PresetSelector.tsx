"use client";

interface Preset {
  name: string;
  display_name: string;
  style: string;
  description: string;
}

interface PresetSelectorProps {
  presets: Preset[];
  selected: string;
  onSelect: (name: string) => void;
}

const PRESET_COLORS: Record<string, string> = {
  universal: "#00d4aa",
  fuego: "#ff6b35",
  claridad: "#4a9eff",
  cinta: "#d4a574",
  natural: "#8bc34a",
  espacial: "#7c5cfc",
  cinematico: "#ff3b30",
  empuje: "#ff9500",
};

export default function PresetSelector({ presets, selected, onSelect }: PresetSelectorProps) {
  return (
    <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border)]">
      <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
        Mastering Preset
      </h3>

      <div className="grid grid-cols-2 gap-2">
        {presets.map((preset) => {
          const isActive = preset.name === selected;
          const color = PRESET_COLORS[preset.name] || "#888";

          return (
            <button
              key={preset.name}
              onClick={() => onSelect(preset.name)}
              className={`
                relative p-3 rounded-lg text-left transition-all duration-150
                border
                ${isActive
                  ? "border-transparent"
                  : "border-[var(--border)] hover:border-[var(--border-hover)] bg-[var(--bg-tertiary)]"
                }
              `}
              style={isActive ? {
                background: `${color}15`,
                borderColor: color,
              } : undefined}
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: color }}
                />
                <span className={`text-sm font-medium ${isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
                  {preset.display_name}
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] line-clamp-2">
                {preset.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
