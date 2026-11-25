import { Checkbox, SearchField, Select, Switch, TextArea, TextField } from "@monorise-team/ui";

/** Pola formularza, wyszukiwanie i przełączniki. */
export function FormsSection() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <SearchField placeholder="Szukaj w ustawieniach" shortcut="⌘K" />
        <TextField label="Adres e-mail" placeholder="anna@acme.com" hint="Adres skrzynki u dostawcy poczty" />
        <TextField label="Hasło aplikacji" type="password" defaultValue="tajne" error="Serwer odrzucił hasło" />
      </div>
      <div className="flex flex-col gap-3">
        <Select label="Szyfrowanie" defaultValue="ssl">
          <option value="ssl">SSL/TLS</option>
          <option value="starttls">STARTTLS</option>
        </Select>
        <TextArea label="Podpis" defaultValue={"Anna Kowalska\nAcme sp. z o.o."} rows={3} />
        <Switch label="Powiadomienia" description="Pokazuj powiadomienia o nowych wiadomościach." defaultChecked />
        <Checkbox label="Pokazuj podgląd treści" defaultChecked />
      </div>
    </div>
  );
}
