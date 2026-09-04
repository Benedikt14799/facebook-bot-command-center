/**
 * Beschriftungen fuer Kontaktstufen und Arten von Kontaktereignissen.
 * Bewusst ohne Serverbezug, damit die Oberflaeche sie nutzen kann.
 */

export const STAGES = ["new", "contacted", "replied", "offer_sent", "closed"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<string, string> = {
  new: "Neu",
  contacted: "Angeschrieben",
  replied: "Hat geantwortet",
  offer_sent: "Angebot gesendet",
  closed: "Abgeschlossen",
};

export const KIND_LABEL: Record<string, string> = {
  like: "Like vergeben",
  comment: "Kommentar geschrieben",
  welcome: "Welcome-Nachricht",
  follow_up: "Follow-up",
  reply_in: "Antwort erhalten",
  reply_out: "Antwort gesendet",
  offer: "Angebot platziert",
  scan: "Beim Scan gefunden",
};
