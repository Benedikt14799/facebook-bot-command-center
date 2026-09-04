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
};

export const JOB_TYPES: JobTypeInfo[] = [
  {
    value: "dm_new_member",
    label: "Neues Gruppenmitglied anschreiben",
    short: "Persönliche Erstnachricht an frisch beigetretene Mitglieder",
    long: "Der Bot öffnet das Profil eines neuen Gruppenmitglieds und schickt eine persönliche Willkommensnachricht mit dem Vornamen der Person. Zählt auf das Tageslimit für Direktnachrichten.",
  },
  {
    value: "reply_message",
    label: "Auf Nachricht antworten",
    short: "Antwort auf eine eingegangene Direktnachricht",
    long: "Der Bot liest die eingegangene Nachricht sowie den bisherigen Gesprächsverlauf mit dieser Person und schreibt eine passende Antwort. Je nach Einstellung wird hier auch dein Angebot platziert.",
  },
  {
    value: "like_posts",
    label: "Beiträge liken",
    short: "Ein paar Likes in der Gruppe verteilen",
    long: "Der Bot scrollt durch die Gruppe und vergibt eine begrenzte Anzahl Likes auf aktuelle Beiträge. Reine Aufwärm-/Sichtbarkeitsaktion ohne Text.",
  },
  {
    value: "comment_post",
    label: "Beitrag kommentieren",
    short: "Inhaltlich passender Kommentar unter einem Beitrag",
    long: "Der Bot liest den Beitrag und schreibt einen kurzen, thematisch passenden Kommentar — geht also wirklich auf den Inhalt ein statt Floskeln zu posten.",
  },
  {
    value: "scan_group",
    label: "Gruppe scannen",
    short: "Nur sammeln: neue Mitglieder, Beiträge, Kommentare",
    long: "Keine sichtbare Aktion. Der Bot liest die Gruppe aus und legt neue Personen mit Name und Profil-Link an, damit spätere Aufträge personalisiert werden können.",
  },
];

export function jobTypeInfo(value: string) {
  return JOB_TYPES.find((t) => t.value === value);
}

export function jobTypeLabel(value: string) {
  return jobTypeInfo(value)?.label ?? value;
}
