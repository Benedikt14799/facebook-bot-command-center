/**
 * Geführte Inbetriebnahme: nummerierte Checkliste vom leeren Cockpit bis zum
 * ersten echten Auftrag, den der Worker ausgeführt hat.
 *
 * Der Status jedes Schrittes wird aus vorhandenen Daten abgeleitet
 * (Bots, Gruppen, Worker-Heartbeat, Session-Status, erledigte Aufträge) —
 * es gibt dafür keine eigene Tabelle.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Circle, Copy } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { InfoHint } from "@/components/InfoHint";
import { Button } from "@/components/ui/button";
import { selectAll } from "@/lib/db";
import { toast } from "sonner";
import type { ReactNode } from "react";

export const Route = createFileRoute("/_authenticated/inbetriebnahme")({
  head: () => ({
    meta: [
      { title: "Inbetriebnahme — FB/Control" },
      {
        name: "description",
        content:
          "Schritt-für-Schritt vom leeren Cockpit bis zum ersten Auftrag, den dein Worker auf Facebook ausführt.",
      },
      { property: "og:title", content: "Inbetriebnahme — FB/Control" },
      {
        property: "og:description",
        content: "Geführte Checkliste für Cockpit, Bots, Proxy, Worker, Login und erste Aufträge.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SetupPage,
});

/** Worker gilt nach 5 Minuten ohne Heartbeat als offline (wie Worker-Health). */
const OFFLINE_AFTER_MS = 5 * 60 * 1000;

function Code({ children }: { children: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/30 p-2">
      <pre className="flex-1 overflow-x-auto font-mono text-[11px] leading-relaxed text-foreground">
        {children}
      </pre>
      <Button
        size="icon"
        variant="ghost"
        className="size-6 shrink-0"
        onClick={() => {
          navigator.clipboard.writeText(children);
          toast.success("Kopiert");
        }}
      >
        <Copy className="size-3" />
      </Button>
    </div>
  );
}

function Step({
  index,
  title,
  done,
  hint,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <li className="relative rounded-lg border border-border bg-card p-4 pl-14">
      <span
        className={`absolute left-4 top-4 flex size-7 items-center justify-center rounded-full border text-xs font-medium ${
          done
            ? "border-success/50 bg-success/15 text-success"
            : "border-border bg-muted/40 text-muted-foreground"
        }`}
      >
        {done ? <Check className="size-4" /> : index}
      </span>
      <div className="flex items-center gap-2">
        <h2 className="font-medium text-foreground">{title}</h2>
        {hint ? <InfoHint text={hint} /> : null}
        <span
          className={`ml-auto text-[11px] uppercase tracking-wide ${
            done ? "text-success" : "text-muted-foreground"
          }`}
        >
          {done ? "erledigt" : "offen"}
        </span>
      </div>
      <div className="mt-2 space-y-2 text-sm text-muted-foreground">{children}</div>
    </li>
  );
}

function SetupPage() {
  const bots = useQuery({ queryKey: ["bots"], queryFn: () => selectAll("bots") });
  const groups = useQuery({ queryKey: ["groups"], queryFn: () => selectAll("groups") });
  const workers = useQuery({ queryKey: ["workers"], queryFn: () => selectAll("workers") });
  const jobs = useQuery({
    queryKey: ["jobs", "setup"],
    queryFn: () => selectAll("jobs", (q) => q.order("scheduled_for", { ascending: false }).limit(50)),
  });

  const botList = bots.data ?? [];
  const workerList = workers.data ?? [];
  const jobList = jobs.data ?? [];

  const hasBot = botList.length > 0;
  const hasGroup = (groups.data ?? []).length > 0;
  const hasProxy = botList.some((b) => !!b.proxy_host || !!b.proxy);
  const hasWorker = workerList.length > 0;
  const workerOnline = workerList.some(
    (w) => w.last_seen_at && Date.now() - new Date(w.last_seen_at).getTime() < OFFLINE_AFTER_MS,
  );
  const hasSession = botList.some((b) => b.session_status === "valid" && !b.manual_mode);
  const hasDoneJob = jobList.some((j) => j.status === "done");
  const hasAutopilot = botList.some((b) => b.autopilot);

  const steps = [hasBot, hasGroup, hasProxy, hasWorker, workerOnline, hasSession, hasDoneJob, hasAutopilot];
  const doneCount = steps.filter(Boolean).length;

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <AppShell
      title="Inbetriebnahme"
      subtitle={`${doneCount} von ${steps.length} Schritten erledigt`}
      hint="Arbeite die Schritte von oben nach unten ab. Der Status wird automatisch aus deinen Daten ermittelt — die ausführliche Fassung steht in BETRIEB.md im Repo."
    >
      <div className="mb-5 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>

      <ol className="space-y-3">
        <Step
          index={1}
          title="Bot anlegen"
          done={hasBot}
          hint="Ein Bot entspricht genau einem Facebook-Profil. Persona und Tonfall fließen in jeden KI-Text ein."
        >
          <p>
            Lege einen Bot mit Name, Persona/Rolle, Tonfall, Tages-Caps und Arbeitszeiten an.
            Tippfehler-Rate auf ca. 12 % lassen, damit Texte menschlich wirken.
          </p>
          <Link to="/bots">
            <Button size="sm" variant="outline">
              Zu den Bots
            </Button>
          </Link>
        </Step>

        <Step
          index={2}
          title="Gruppe anlegen und zuordnen"
          done={hasGroup}
          hint="Das Thema der Gruppe wird von der KI in Kommentaren und Nachrichten aufgegriffen."
        >
          <p>
            Facebook-ID oder Link, Name, Thema und Sprache eintragen, danach dem Bot zuordnen und
            gruppenspezifische Caps setzen.
          </p>
          <Link to="/groups">
            <Button size="sm" variant="outline">
              Zu den Gruppen
            </Button>
          </Link>
        </Step>

        <Step
          index={3}
          title="Proxy, Fingerprint und Verhalten setzen"
          done={hasProxy}
          hint="Static-Residential- (ISP) oder Mobil-Proxy verwenden. Rechenzentrums-IPs führen bei Facebook fast immer sofort zu einem Checkpoint."
        >
          <p>
            Auf der Bot-Detailseite: Proxy-Typ, Host, Port, Zugangsdaten und Land eintragen,
            Fingerprint einmalig erzeugen und danach nicht mehr ändern, Verhaltenswerte
            (Tippgeschwindigkeit, Pausen, Scrollen) setzen. Ein Bot = ein Proxy, dauerhaft.
          </p>
          <p>Anschließend das Warmup-Profil festlegen: Stufen, Dauer und Mengen je Aktionstyp.</p>
          <div className="flex gap-2">
            <Link to="/bots">
              <Button size="sm" variant="outline">
                Bot-Einstellungen
              </Button>
            </Link>
            <Link to="/warmup">
              <Button size="sm" variant="outline">
                Aufwärmphase
              </Button>
            </Link>
          </div>
        </Step>

        <Step
          index={4}
          title="Worker registrieren und Skript laden"
          done={hasWorker}
          hint="Das Token ist das Passwort deines Workers. Nicht teilen und nicht ins Repository committen."
        >
          <p>
            Worker anlegen, danach <span className="text-foreground">fbcontrol_worker.py</span>{" "}
            herunterladen. Basis-URL und Token sind darin bereits eingetragen.
          </p>
          <Code>{`Basis-URL: ${baseUrl}`}</Code>
          <Link to="/workers">
            <Button size="sm" variant="outline">
              Zu den Workern
            </Button>
          </Link>
        </Step>

        <Step
          index={5}
          title="Worker-Rechner einrichten und starten"
          done={workerOnline}
          hint="Der Worker braucht Python 3.11+ und Chromium. Er muss dauerhaft laufen, damit Aufträge abgeholt werden."
        >
          <Code>{`mkdir -p ~/fbcontrol && cd ~/fbcontrol
python3 -m venv .venv
source .venv/bin/activate
pip install requests playwright playwright-stealth
playwright install chromium
python fbcontrol_worker.py`}</Code>
          <p>
            Auf einem Linux-VPS zusätzlich <span className="font-mono">playwright install-deps
            chromium</span>. Für den Dauerbetrieb als systemd-Dienst, launchd-Job oder geplante
            Aufgabe einrichten.
          </p>
          <Link to="/worker-health">
            <Button size="sm" variant="outline">
              Worker-Health prüfen
            </Button>
          </Link>
        </Step>

        <Step
          index={6}
          title="Facebook-Login einmal manuell erledigen"
          done={hasSession}
          hint="Passwörter werden nie gespeichert. Du meldest dich einmal von Hand an, danach arbeitet der Worker mit den Session-Cookies."
        >
          <p>
            Freischaltung anfordern: Der Worker öffnet ein sichtbares Browserfenster mit demselben
            Profil, Proxy und Fingerprint. Nach dem Login werden die Cookies gespeichert.
            Alternativ die Cookies als JSON importieren — der Cookie{" "}
            <span className="font-mono">c_user</span> muss enthalten sein.
          </p>
          <Link to="/unlock">
            <Button size="sm" variant="outline">
              Zur Freischaltung
            </Button>
          </Link>
        </Step>

        <Step
          index={7}
          title="Ersten Auftrag testen"
          done={hasDoneJob}
          hint="Erst im Simulationsmodus, dann echt. Mit einem einzelnen Like starten, nicht mit Direktnachrichten."
        >
          <p>
            Auftrag anlegen: Aktion „Beiträge liken", Startzeit jetzt, Payload{" "}
            <span className="font-mono">{`{ "count": 1 }`}</span>. Status läuft von
            „geplant" über „läuft" bis „erledigt".
          </p>
          <Link to="/jobs">
            <Button size="sm" variant="outline">
              Zu den Aufträgen
            </Button>
          </Link>
        </Step>

        <Step
          index={8}
          title="Automatik einschalten"
          done={hasAutopilot}
          hint="Der Planer erzeugt Aufträge innerhalb von Arbeitszeiten, Warmup-Stufe, Tages-Caps und Jitter."
        >
          <p>
            Autopilot je Bot aktivieren. Solange „Freigabe erforderlich" gesetzt ist, wartet jeder
            Text auf deine Bestätigung. Alarme zu Checkpoint, CAPTCHA, Sperren und Worker-Ausfällen
            erscheinen in der Glocke oben rechts.
          </p>
          <Link to="/bots">
            <Button size="sm" variant="outline">
              Autopilot einschalten
            </Button>
          </Link>
        </Step>
      </ol>

      <div className="mt-6 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 text-foreground">
          <Circle className="size-3.5 text-primary" />
          <span className="font-medium">Ausführliche Anleitung</span>
        </div>
        <p className="mt-2">
          Die vollständige Fassung mit systemd-Dienst, Fehlermeldungen, Endpunkt-Referenz und
          Härtungsempfehlungen liegt als <span className="font-mono">BETRIEB.md</span> im Repository.
        </p>
      </div>
    </AppShell>
  );
}
