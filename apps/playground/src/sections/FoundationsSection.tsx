import { density, fontScale, resolveColors, shape, zIndex } from "@monorise-team/tokens";
import { AppearanceControls, Card, useTheme } from "@monorise-team/ui";

/** Fundamenty projektu: sterowanie wyglądem, wszystkie tokeny kolorów i skale układu. */
export function FoundationsSection() {
  const { appearance, resolvedMode } = useTheme();
  const colors = resolveColors(resolvedMode, appearance.theme);

  return (
    <div className="flex flex-col gap-6">
      <Card surface="strong" className="p-4">
        <AppearanceControls />
      </Card>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-xs font-semibold text-text-tertiary uppercase">
            Tokeny kolorów ({appearance.theme} · {resolvedMode === "dark" ? "ciemny" : "jasny"})
          </h3>
          <span className="text-xs text-text-tertiary">{Object.keys(colors).length} tokenów</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Object.entries(colors).map(([name, value]) => (
            <div
              key={name}
              className="mr-row flex items-center gap-2.5 border border-border-secondary bg-bg-secondary p-2"
            >
              <span
                className="size-8 shrink-0 rounded-control border border-border-primary shadow-xs"
                style={{ backgroundColor: value }}
                title={value}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-text-primary">{name}</span>
                <span className="block truncate font-mono text-[10px] text-text-tertiary">{value}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="mr-row border border-border-secondary bg-bg-secondary p-3">
          <h3 className="mb-2 text-xs font-semibold text-text-tertiary uppercase">Warstwy (z-index)</h3>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(zIndex).map(([layer, level]) => (
              <span
                key={layer}
                className="rounded-control border border-border-secondary bg-bg-tertiary px-2 py-0.5 font-mono text-xs text-text-secondary"
              >
                {layer}: {level}
              </span>
            ))}
          </div>
        </div>

        <div className="mr-row border border-border-secondary bg-bg-secondary p-3">
          <h3 className="mb-2 text-xs font-semibold text-text-tertiary uppercase">Kształty (px)</h3>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(shape).map(([token, px]) => (
              <span
                key={token}
                className="rounded-control border border-border-secondary bg-bg-tertiary px-2 py-0.5 font-mono text-xs text-text-secondary"
              >
                {token}: {px}px
              </span>
            ))}
          </div>
        </div>

        <div className="mr-row border border-border-secondary bg-bg-secondary p-3">
          <h3 className="mb-2 text-xs font-semibold text-text-tertiary uppercase">Skala tekstu i gęstość</h3>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(fontScale).map(([name, ratio]) => (
              <span
                key={name}
                className="rounded-control border border-border-secondary bg-bg-tertiary px-2 py-0.5 font-mono text-xs text-text-secondary"
              >
                {name}: {Math.round(ratio * 100)}%
              </span>
            ))}
            {Object.entries(density).map(([name, spec]) => (
              <span
                key={name}
                className="rounded-control border border-border-secondary bg-bg-tertiary px-2 py-0.5 font-mono text-xs text-text-secondary"
              >
                {name}: {spec.rowPaddingX}×{spec.rowPaddingY} ({spec.avatarSize}px)
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
