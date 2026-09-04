/**
 * Worker-API: erkannte Personen melden (z. B. Ergebnis von "Gruppe scannen"
 * oder eines gelesenen Kommentars). Legt die Person an bzw. aktualisiert sie
 * und schreibt einen Eintrag in ihre Kontaktakte.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateWorker, json } from "@/lib/worker-auth.server";
import { logContact, upsertRecipient } from "@/lib/contacts.server";

type Person = {
  fb_user_id?: string;
  name?: string;
  profile_url?: string;
  context?: string;
  group_id?: string;
  bot_id?: string;
  kind?: string;
};

export const Route = createFileRoute("/api/public/worker/recipients")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await authenticateWorker(request);
        if (ctx instanceof Response) return ctx;

        const body = (await request.json().catch(() => null)) as
          | (Person & { people?: Person[] })
          | null;
        if (!body) return json({ error: "body required" }, 400);

        const people = Array.isArray(body.people) ? body.people : [body];
        const ids: string[] = [];

        for (const p of people) {
          if (!p.name && !p.fb_user_id && !p.profile_url) continue;
          const id = await upsertRecipient(ctx.admin, {
            userId: ctx.userId,
            groupId: p.group_id ?? body.group_id ?? null,
            botId: p.bot_id ?? body.bot_id ?? null,
            fbUserId: p.fb_user_id ?? null,
            name: p.name ?? null,
            profileUrl: p.profile_url ?? null,
            context: p.context ?? null,
            source: "worker",
            // Rohdaten des Worker-Events unveraendert ablegen (Nachvollziehbarkeit
            // und spaetere Auswertung, falls das Namens-Parsing danebenliegt).
            rawEvent: p as unknown as Record<string, unknown>,
          });
          if (!id) continue;
          ids.push(id);
          await logContact(ctx.admin, {
            userId: ctx.userId,
            recipientId: id,
            botId: p.bot_id ?? body.bot_id ?? null,
            groupId: p.group_id ?? body.group_id ?? null,
            kind: p.kind ?? "scan",
            direction: "in",
            body: p.context ?? null,
          });
        }

        return json({ ok: true, recipient_ids: ids });
      },
    },
  },
});
