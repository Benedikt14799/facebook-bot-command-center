/**
 * Zentrale Liste aller Auftragstypen inkl. kurzer und ausfuehrlicher
 * Erklaerung. Wird im Auftrags-Dialog und in Uebersichten verwendet.
 */

export type JobTypeInfo = {
  value: string;
  label: string;
  /** Ein Satz, direkt unter dem Namen in der Auswahl. */
  short: string;
  /** Ausfuehrliche Erklaerung, erscheint als Hinweisbox unter dem Feld. */
  long: string;
  /** Was der Auftrag als Eingabe braucht (Payload/Kontext). */
  inputLabel: string;
  /** Beispiel-Payload, so wie du sie im JSON-Feld hinterlegen kannst. */
  exampleInput: string;
  /** Was danach passiert bzw. was gespeichert wird. */
  outputLabel: string;
  /** Beispielhaftes Ergebnis. */
  exampleOutput: string;
};

export const JOB_TYPES: JobTypeInfo[] = [
  {
    value: "dm_new_member",
    label: "Neues Gruppenmitglied anschreiben",
    short: "Persönliche Erstnachricht an frisch beigetretene Mitglieder",
    long: "Der Bot öffnet das Profil eines neuen Gruppenmitglieds und schickt eine persönliche Willkommensnachricht mit dem Vornamen der Person. Zählt auf das Tageslimit für Direktnachrichten.",
    inputLabel: "Person (Name oder Profil-Link) und die Gruppe, aus der sie kommt",
    exampleInput: `{ "profile_url": "https://facebook.com/benedikt.mueller", "name": "Benedikt Müller" }`,
    outputLabel: "Gesendete Direktnachricht + Eintrag in der Kontaktakte (Stufe „kontaktiert“)",
    exampleOutput:
      "„Hey Benedikt, schön dass du dabei bist. Was hat dich denn in die Gruppe gebracht?“",
  },
  {
    value: "reply_message",
    label: "Auf Nachricht antworten",
    short: "Antwort auf eine eingegangene Direktnachricht",
    long: "Der Bot liest die eingegangene Nachricht sowie den bisherigen Gesprächsverlauf mit dieser Person und schreibt eine passende Antwort. Je nach Einstellung wird hier auch dein Angebot platziert.",
    inputLabel: "Bestehende Person + ihre letzte Nachricht (der Verlauf wird automatisch geladen)",
    exampleInput: `{ "recipient_id": "…", "context": "Danke! Ich hab seit Monaten Knieschmerzen beim Laufen." }`,
    outputLabel: "Gesendete Antwort, Verlauf und Stufe der Person werden fortgeschrieben",
    exampleOutput:
      "„Knieschmerzen beim Laufen kenn ich gut, Benedikt. Läuft das eher beim Bergab oder direkt am Anfang?“",
  },
  {
    value: "like_posts",
    label: "Beiträge liken",
    short: "Ein paar Likes in der Gruppe verteilen",
    long: "Der Bot scrollt durch die Gruppe und vergibt eine begrenzte Anzahl Likes auf aktuelle Beiträge. Reine Aufwärm-/Sichtbarkeitsaktion ohne Text.",
    inputLabel: "Gruppe und Anzahl der Likes (ohne Text)",
    exampleInput: `{ "count": 3 }`,
    outputLabel: "Ergebnis mit Anzahl der Likes; jedes Like landet in der Akte der Person",
    exampleOutput: `{ "liked": 3, "posts": ["…", "…", "…"] }`,
  },
  {
    value: "comment_post",
    label: "Beitrag kommentieren",
    short: "Inhaltlich passender Kommentar unter einem Beitrag",
    long: "Der Bot liest den Beitrag und schreibt einen kurzen, thematisch passenden Kommentar — geht also wirklich auf den Inhalt ein statt Floskeln zu posten.",
    inputLabel: "Beitrags-Link oder -ID; der erkannte Beitragstext ist der Kontext für die KI",
    exampleInput: `{ "post_url": "https://facebook.com/groups/123/posts/456" }`,
    outputLabel: "Veröffentlichter Kommentar + Eintrag in der Akte des Verfassers",
    exampleOutput:
      "„Das mit dem Knie hatte ich auch, bei mir war's die Laufschuh-Dämpfung. Wie lange geht das bei dir schon?“",
  },
  {
    value: "scan_group",
    label: "Gruppe scannen",
    short: "Nur sammeln: neue Mitglieder, Beiträge, Kommentare",
    long: "Keine sichtbare Aktion. Der Bot liest die Gruppe aus und legt neue Personen mit Name und Profil-Link an, damit spätere Aufträge personalisiert werden können.",
    inputLabel: "Nur die Gruppe (optional wie viele Beiträge tief gescannt wird)",
    exampleInput: `{ "limit": 20 }`,
    outputLabel: "Neue/aktualisierte Personen inkl. Vorname und Rohdaten des Events",
    exampleOutput: `{ "found": 7, "new": 2 }`,
  },
];

/** Ältere/interne Typbezeichnungen des Planers auf die Anzeige mappen. */
const ALIAS: Record<string, string> = {
  like: "like_posts",
  comment: "comment_post",
  follow_up: "reply_message",
};

export function jobTypeInfo(value: string) {
  const key = ALIAS[value] ?? value;
  return JOB_TYPES.find((t) => t.value === key);
}

export function jobTypeLabel(value: string) {
  if (value === "follow_up") return "Follow-up-Nachricht";
  return jobTypeInfo(value)?.label ?? value;
}
