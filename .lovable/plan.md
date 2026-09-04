# Aufträge, Personalisierung und freie KI-Wahl

## 1. Erklärungen zu jedem Auftragstyp

Im Auftragstyp-Dropdown bekommt jeder Eintrag eine kurze Beschreibung direkt unter dem Namen, zusätzlich eine ausführlichere Erklärung als Hinweis-Box unter dem Feld, sobald ein Typ gewählt ist:

- **Neues Gruppenmitglied anschreiben** – der Bot öffnet das Profil eines frisch beigetretenen Mitglieds und schickt eine persönliche Erstnachricht.
- **Auf Nachricht antworten** – der Bot liest eine eingegangene Direktnachricht und antwortet im Gesprächskontext.
- **Beiträge liken** – der Bot scrollt durch die Gruppe und vergibt eine begrenzte Anzahl Likes.
- **Beitrag kommentieren** – der Bot liest einen Beitrag und schreibt einen inhaltlich passenden Kommentar.
- **Gruppe scannen** – kein sichtbares Handeln: der Bot sammelt nur neue Mitglieder, Beiträge und Kommentare für spätere Aufträge.

## 2. Aufträge bearbeiten

Auf der Auftragsseite wird jede Zeile anklickbar und öffnet ein Bearbeiten-Fenster:

- **Wartende Aufträge**: Bot, Gruppe, Empfänger, Typ, geplante Zeit, Text/Payload ändern und speichern.
- **Fehlgeschlagene Aufträge**: gleiche Bearbeitung plus „Erneut einplanen“ – setzt den Auftrag zurück auf wartend mit neuem Zeitpunkt.
- **Erledigte Aufträge**: nur ansehen, mit Button „Duplizieren“, der einen neuen Auftrag mit denselben Daten anlegt.
- Zusätzlich weiterhin Abbrechen/Löschen.

## 3. Namen und Kontext (Interaktivität)

Ziel: Nachrichten wie „Hallo Benedikt, dein Kommentar zu …“.

- Der Worker meldet bei „Gruppe scannen“ und bei erkannten Kommentaren/Nachrichten künftig Name, Profil-Link, Facebook-ID sowie den erkannten Text. Diese Personen werden als Empfänger gespeichert bzw. aktualisiert (Vorname wird aus dem vollen Namen abgeleitet).
- Jeder Auftrag trägt den Empfängerbezug, sodass Texterstellung Vorname, letzten Beitrag/Kommentar und den Gesprächsverlauf mit dieser Person kennt.
- Der Gesprächsverlauf (ein- und ausgehende Nachrichten) wird der KI als Kontext mitgegeben, damit Folgeantworten sinnvoll anschließen und sich nicht wiederholen.
- Neue Spalten für Empfänger: Vorname, letzter erkannter Text, Quelle. Ansicht der Empfänger je Gruppe inklusive letzter Nachricht.

## 4. Freie KI-Wahl

- Neue Seite **KI-Einstellungen**: Standard ist die eingebaute KI (ohne eigenen Schlüssel). Optional lassen sich eigene Anbieter hinterlegen – OpenAI, Anthropic, OpenRouter oder ein beliebiger OpenAI-kompatibler Endpunkt.
- Pro Anbieter: Schlüssel (verschlüsselt serverseitig gespeichert, nie im Browser lesbar), Modellname, optionale Basis-URL, Test-Button („Verbindung prüfen“).
- Auswahl gilt global; zusätzlich kann jeder Bot später einen abweichenden Anbieter nutzen (Feld ist im Datenmodell vorgesehen).
- Textgenerierung läuft immer serverseitig; Schlüssel verlassen den Server nicht.

## 5. Menschlich klingende Texte

- Prompt bekommt: Vorname, Gruppenthema, erkannter Beitrag/Kommentar im Wortlaut, Gesprächsverlauf, gewünschter Tonfall des Bots, Beispieltexte aus den Vorlagen.
- Nachbearbeitung wie bisher verschärft: keine Floskeln („Als KI“, „gerne helfe ich“), keine Emoji-Häufung, kurze Sätze, gelegentlich Umgangssprache, keine übertriebene Höflichkeit, Länge passend zum Kanal (Kommentar kurz, DM etwas länger).
- Texte werden ohne Freigabeschritt direkt gesendet (so gewünscht); der erzeugte Text ist im Auftrag sichtbar und vor Ausführung noch editierbar.

## Technische Details

- Migration: `recipients` erhält `first_name`, `last_context`, `context_updated_at`; `jobs` erhält `generated_text`; neue Tabelle `ai_settings` (pro Nutzer: Anbieter, Modell, Basis-URL, verschlüsselter Schlüssel) mit RLS und Grants, kein Lesezugriff auf den Schlüssel im Browser.
- `src/lib/ai.server.ts` wird zu einem Anbieter-Router: eingebaute Lovable-KI oder OpenAI-kompatibler Aufruf mit hinterlegtem Schlüssel; Fehler (401/402/429) werden verständlich gemeldet.
- Worker-Endpunkte `messages` und `events` nehmen zusätzlich Personendaten entgegen und legen Empfänger an bzw. aktualisieren sie; `WORKER_INTEGRATION.md` und das Worker-Skript werden entsprechend ergänzt.
- `jobs.tsx` erhält Dialog zum Bearbeiten, Server-Aktionen für Update/Neu-Einplanen/Duplizieren.
- Scheduler nutzt Empfängerkontext und Gesprächsverlauf beim Erzeugen der Texte.
