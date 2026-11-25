import { themeNames, themes, type ThemeName } from "@monorise-team/tokens";
import {
  AppShell,
  AppearanceControls,
  Button,
  Card,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TitleBar,
  useTheme,
  type ModePreference,
} from "@monorise-team/ui";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { MailDemo } from "./MailDemo";
import { SECTIONS } from "./sections";

function AppearanceBar({ controlsOpen, onToggleControls }: { controlsOpen: boolean; onToggleControls: () => void }) {
  const { appearance, setAppearance } = useTheme();
  return (
    <TitleBar className="justify-between">
      <span className="flex items-center gap-2">
        <span className="uppercase">Monorise</span>
        <span aria-hidden>·</span>
        <span className="text-accent uppercase">katalog komponentów</span>
      </span>
      <span className="flex items-center gap-2">
        <Button
          variant={controlsOpen ? "primary" : "ghost"}
          size="xs"
          icon={<SlidersHorizontal />}
          onClick={onToggleControls}
          aria-expanded={controlsOpen}
        >
          Wygląd
        </Button>
        <Tabs value={appearance.mode} onValueChange={(mode) => setAppearance({ mode: mode as ModePreference })}>
          <TabsList aria-label="Tryb">
            <TabsTrigger value="light">Jasny</TabsTrigger>
            <TabsTrigger value="dark">Ciemny</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={appearance.theme} onValueChange={(theme) => setAppearance({ theme: theme as ThemeName })}>
          <TabsList aria-label="Motyw">
            {themeNames.map((name) => (
              <TabsTrigger key={name} value={name}>
                {themes[name].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </span>
    </TitleBar>
  );
}

function Gallery() {
  return (
    <Card surface="reading" className="min-w-0 flex-1 overflow-y-auto">
      <CardHeader>
        <CardTitle>Komponenty</CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-8 p-6">
        {SECTIONS.map(({ id, title, Component }) => (
          <section key={id} id={id} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-text-tertiary uppercase">{title}</h2>
            <Component />
          </section>
        ))}
      </div>
    </Card>
  );
}

export function App() {
  const [view, setView] = useState("mail");
  const [controlsOpen, setControlsOpen] = useState(false);

  return (
    <AppShell
      titleBar={<AppearanceBar controlsOpen={controlsOpen} onToggleControls={() => setControlsOpen((open) => !open)} />}
    >
      <Tabs value={view} onValueChange={setView} className="flex min-w-0 flex-1 flex-col gap-card">
        <TabsList aria-label="Widok" className="w-fit">
          <TabsTrigger value="mail">Poczta</TabsTrigger>
          <TabsTrigger value="gallery">Komponenty</TabsTrigger>
        </TabsList>
        {controlsOpen ? (
          <Card surface="strong" className="p-4">
            <AppearanceControls compact />
          </Card>
        ) : null}
        <TabsContent value="mail" className="flex min-h-0 flex-1 gap-card">
          <MailDemo />
        </TabsContent>
        <TabsContent value="gallery" className="flex min-h-0 flex-1">
          <Gallery />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
