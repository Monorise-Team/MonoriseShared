import { densityNames, fontScaleNames, type Density, type FontScale } from "@monorise-team/tokens";
import {
  Button,
  Select,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  WALLPAPER_BLUR_MAX,
  WALLPAPER_DIM_MAX,
  defaultAppearance,
  useTheme,
  type BackdropMode,
} from "@monorise-team/ui";
import { RotateCcw } from "lucide-react";

const FONT_SCALE_LABELS: Record<FontScale, string> = {
  small: "Mała (82%)",
  default: "Domyślna (100%)",
  large: "Duża (118%)",
  xlarge: "Bardzo duża (136%)",
};

const DENSITY_LABELS: Record<Density, string> = {
  compact: "Zwarta",
  default: "Domyślna",
  spacious: "Wygodna",
};

/** Wspólny zestaw kontrolek wyglądu: tło, przyciemnienie, rozmycie, skala tekstu, gęstość, szkło i ruch. */
export function AppearanceControls({ compact = false }: { compact?: boolean }) {
  const { appearance, setAppearance } = useTheme();

  return (
    <div className={compact ? "flex flex-wrap items-end gap-4" : "flex flex-col gap-4"}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Tło</span>
          <Tabs
            value={appearance.backdrop}
            onValueChange={(backdrop) => setAppearance({ backdrop: backdrop as BackdropMode })}
          >
            <TabsList aria-label="Rodzaj tła">
              <TabsTrigger value="wallpaper">Tapeta</TabsTrigger>
              <TabsTrigger value="gradient">Gradient</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between text-xs font-medium text-text-secondary">
            <span>Przyciemnienie tapety</span>
            <span className="text-text-tertiary tabular-nums">{appearance.wallpaperDim}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={WALLPAPER_DIM_MAX}
            value={appearance.wallpaperDim}
            onChange={(e) => setAppearance({ wallpaperDim: Number(e.target.value) })}
            className="h-7 w-full accent-[var(--mr-accent)]"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between text-xs font-medium text-text-secondary">
            <span>Rozmycie tapety</span>
            <span className="text-text-tertiary tabular-nums">{appearance.wallpaperBlur} px</span>
          </span>
          <input
            type="range"
            min={0}
            max={WALLPAPER_BLUR_MAX}
            value={appearance.wallpaperBlur}
            onChange={(e) => setAppearance({ wallpaperBlur: Number(e.target.value) })}
            className="h-7 w-full accent-[var(--mr-accent)]"
          />
        </label>

        <Select
          label="Skala tekstu"
          value={appearance.fontScale}
          onChange={(e) => setAppearance({ fontScale: e.target.value as FontScale })}
        >
          {fontScaleNames.map((name) => (
            <option key={name} value={name}>
              {FONT_SCALE_LABELS[name]}
            </option>
          ))}
        </Select>

        <Select
          label="Gęstość listy"
          value={appearance.density}
          onChange={(e) => setAppearance({ density: e.target.value as Density })}
        >
          {densityNames.map((name) => (
            <option key={name} value={name}>
              {DENSITY_LABELS[name]}
            </option>
          ))}
        </Select>

        <div className="flex flex-col justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<RotateCcw />}
            className="w-fit"
            onClick={() => setAppearance(defaultAppearance)}
          >
            Przywróć domyślne
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Switch
          label="Ogranicz animacje"
          description="Wyłącza ruch niezależnie od ustawień systemu."
          checked={appearance.reduceMotion}
          onCheckedChange={(reduceMotion) => setAppearance({ reduceMotion })}
        />
        <Switch
          label="Szklane panele"
          description="Na słabszych komputerach wyłącz rozmycie szkła i tapety."
          checked={appearance.glass}
          onCheckedChange={(glass) => setAppearance({ glass })}
        />
      </div>
    </div>
  );
}
