import { useState } from "react";
import { cn } from "@/lib/utils";
import { hexToRgb } from "@/lib/utils";
import type { BackgroundColor } from "@/types";

interface OutputOptionsProps {
  value: BackgroundColor;
  onChange: (bg: BackgroundColor) => void;
  disabled?: boolean;
}

type Preset = "Transparent" | "White" | "Black" | "Custom";

const PRESETS: { id: Preset; label: string; preview: string }[] = [
  { id: "Transparent", label: "Transparent", preview: "checkerboard" },
  { id: "White",       label: "Blanc",       preview: "bg-white" },
  { id: "Black",       label: "Noir",        preview: "bg-black border-border" },
  { id: "Custom",      label: "Couleur",     preview: "" },
];

export function OutputOptions({ value, onChange, disabled }: OutputOptionsProps) {
  const [customHex, setCustomHex] = useState("#22c55e");

  const currentPreset: Preset =
    value.type === "Transparent" ? "Transparent"
    : value.type === "White"    ? "White"
    : value.type === "Black"    ? "Black"
    : "Custom";

  const selectPreset = (preset: Preset) => {
    if (preset === "Transparent") onChange({ type: "Transparent" });
    else if (preset === "White")  onChange({ type: "White" });
    else if (preset === "Black")  onChange({ type: "Black" });
    else {
      const { r, g, b } = hexToRgb(customHex);
      onChange({ type: "Color", r, g, b });
    }
  };

  const onCustomColorChange = (hex: string) => {
    setCustomHex(hex);
    const { r, g, b } = hexToRgb(hex);
    onChange({ type: "Color", r, g, b });
  };

  return (
    <div className={cn("space-y-2", disabled && "opacity-50 pointer-events-none")}>
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
        Fond de sortie
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        {PRESETS.map(({ id, label, preview }) => (
          <button
            key={id}
            onClick={() => selectPreset(id)}
            title={label}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all",
              currentPreset === id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-primary/40"
            )}
          >
            {id !== "Custom" && (
              <span
                className={cn(
                  "w-4 h-4 rounded flex-shrink-0 border border-white/10",
                  preview
                )}
              />
            )}
            {id === "Custom" && (
              <span
                className="w-4 h-4 rounded flex-shrink-0 border border-white/10"
                style={{ backgroundColor: customHex }}
              />
            )}
            {label}
          </button>
        ))}

        {/* Color picker inline pour Custom */}
        {currentPreset === "Custom" && (
          <div className="flex items-center gap-2 ml-1">
            <input
              type="color"
              value={customHex}
              onChange={(e) => onCustomColorChange(e.target.value)}
              className="w-8 h-8 cursor-pointer rounded border border-border bg-transparent p-0.5"
              title="Choisir une couleur"
            />
            <span className="text-muted-foreground text-xs font-mono">{customHex.toUpperCase()}</span>
          </div>
        )}
      </div>
    </div>
  );
}
