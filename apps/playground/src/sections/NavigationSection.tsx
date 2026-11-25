import {
  Button,
  Card,
  Kbd,
  Separator,
  SidebarItem,
  SidebarNav,
  SidebarSection,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toolbar,
} from "@monorise-team/ui";
import { Archive, Inbox, Send, Star } from "lucide-react";
import { useState } from "react";

/** Nawigacja boczna, zakładki i pasek narzędzi. */
export function NavigationSection() {
  const [activeNav, setActiveNav] = useState("inbox");
  const [tab, setTab] = useState("ogolne");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card surface="side" className="p-3">
        <SidebarNav aria-label="Przykładowa nawigacja">
          <SidebarSection title="Skrzynka">
            <SidebarItem
              icon={<Inbox />}
              label="Odebrane"
              count={4}
              active={activeNav === "inbox"}
              onClick={() => setActiveNav("inbox")}
            />
            <SidebarItem
              icon={<Star />}
              label="Oznaczone gwiazdką"
              active={activeNav === "starred"}
              onClick={() => setActiveNav("starred")}
            />
            <SidebarItem
              icon={<Send />}
              label="Wysłane"
              active={activeNav === "sent"}
              onClick={() => setActiveNav("sent")}
            />
            <SidebarItem
              icon={<Archive />}
              label="Archiwum"
              active={activeNav === "archive"}
              onClick={() => setActiveNav("archive")}
            />
          </SidebarSection>
        </SidebarNav>
      </Card>

      <div className="flex flex-col gap-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label="Sekcje ustawień">
            <TabsTrigger value="ogolne">Ogólne</TabsTrigger>
            <TabsTrigger value="konta">Konta</TabsTrigger>
            <TabsTrigger value="skroty">Skróty</TabsTrigger>
          </TabsList>
          <TabsContent value="ogolne" className="pt-2 text-sm text-text-secondary">
            Ustawienia ogólne interfejsu i zachowania aplikacji.
          </TabsContent>
          <TabsContent value="konta" className="pt-2 text-sm text-text-secondary">
            Połączone skrzynki pocztowe i grupy kont.
          </TabsContent>
          <TabsContent value="skroty" className="flex items-center gap-2 pt-2 text-sm text-text-secondary">
            <span>Szybkie wyszukiwanie:</span>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </TabsContent>
        </Tabs>

        <Toolbar aria-label="Narzędzia" className="mr-row border border-border-secondary bg-bg-secondary p-1.5">
          <Button variant="ghost" size="sm">
            Odpowiedz
          </Button>
          <Separator vertical />
          <Button variant="ghost" size="sm">
            Archiwizuj
          </Button>
        </Toolbar>
      </div>
    </div>
  );
}
