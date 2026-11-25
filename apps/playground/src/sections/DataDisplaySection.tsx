import { Avatar, Badge, Card, EmptyState, ListItem, ProgressBar, Skeleton, Button } from "@monorise-team/ui";
import { Inbox } from "lucide-react";

/** Elementy list, awatary, etykiety, stany ładowania i pustego widoku. */
export function DataDisplaySection() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name="Anna Kowalska" seed="anna@acme.com" size="sm" />
          <Avatar name="Anna Kowalska" seed="anna@acme.com" size="md" />
          <Avatar name="Marek Nowak" seed="marek@nowak.pl" size="lg" />
          <Badge>12</Badge>
          <Badge tone="accent">Nowe</Badge>
          <Badge tone="success">Połączono</Badge>
          <Badge tone="warning">Wolne łącze</Badge>
          <Badge tone="danger">Błąd logowania</Badge>
        </div>

        <Card surface="middle" className="flex flex-col gap-0.5 p-2">
          <ListItem
            leading={<Avatar name="Anna Kowalska" seed="anna@acme.com" />}
            title="Anna Kowalska"
            meta="9:41"
            subtitle="Faktura za listopad"
            preview="Wiersz reaguje na ustawioną gęstość listy oraz podniesiony kontrast tekstu pomocniczego."
            unread
            selected
          />
          <ListItem
            leading={<Avatar name="Marek Nowak" seed="marek@nowak.pl" />}
            title="Marek Nowak"
            meta="Pon"
            subtitle="Re: Wycena aplikacji"
            preview="Dzięki za wycenę. Mamy jeszcze dwa pytania."
          />
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <ProgressBar label="Synchronizacja" value={64} />
        <ProgressBar label="Ładowanie" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Card surface="strong" className="p-0">
          <EmptyState
            icon={<Inbox />}
            title="Wszystko przeczytane"
            description="Nowe wiadomości pojawią się tutaj."
            action={
              <Button variant="outline" size="sm">
                Odśwież
              </Button>
            }
          />
        </Card>
      </div>
    </div>
  );
}
