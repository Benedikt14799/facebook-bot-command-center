/**
 * Regressionstests fuer den Worker-Vertrag 1.0 (reine Logik, ohne Netzwerk).
 */
import { describe, expect, it } from "vitest";
import { validateJob } from "@/lib/job-validation";
import {
  BLOCKING_SESSION_STATES,
  CAPABILITY_BY_JOB_TYPE,
  JOB_STATUSES,
  REPORTABLE_STATUSES,
  SESSION_STATES,
  TERMINAL_STATUSES,
} from "@/lib/worker-contract";
import { hashWorkerToken } from "@/lib/worker-auth.server";
import { decryptSecret, encryptSecret } from "@/lib/secret-crypto.server";

describe("Zustandsmodell", () => {
  it("kennt nur die kanonischen Zustaende", () => {
    expect([...JOB_STATUSES]).toEqual([
      "pending",
      "running",
      "done",
      "failed",
      "skipped",
      "cancelled",
    ]);
    expect(JOB_STATUSES).not.toContain("claimed" as never);
  });

  it("Worker duerfen nur done/failed/skipped melden", () => {
    expect([...REPORTABLE_STATUSES]).toEqual(["done", "failed", "skipped"]);
  });

  it("Endzustaende sind vollstaendig", () => {
    expect(TERMINAL_STATUSES).toEqual(["done", "failed", "skipped", "cancelled"]);
  });

  it("Sitzungszustaende und Sperrzustaende passen zusammen", () => {
    for (const s of BLOCKING_SESSION_STATES) expect(SESSION_STATES).toContain(s as never);
    expect(BLOCKING_SESSION_STATES).not.toContain("ok");
  });
});

describe("Auftragsvalidierung", () => {
  it("follow_up gibt es nicht mehr", () => {
    const r = validateJob("follow_up", null, "r1", {});
    expect(r.valid).toBe(false);
  });

  it("Likes brauchen Gruppe und ganze Anzahl 1..20", () => {
    expect(validateJob("like_posts", "g1", null, { count: 3 }).valid).toBe(true);
    expect(validateJob("like_posts", null, null, { count: 3 }).valid).toBe(false);
    expect(validateJob("like_posts", "g1", null, { count: 0 }).valid).toBe(false);
    expect(validateJob("like_posts", "g1", null, { count: 2.5 }).valid).toBe(false);
    expect(validateJob("like_posts", "g1", null, { count: "3" }).valid).toBe(false);
    expect(validateJob("like_posts", "g1", null, {}).valid).toBe(false);
  });

  it("Kommentare brauchen Beitrag und Text", () => {
    expect(validateJob("comment_post", "g1", null, { post_url: "https://x/1" }).valid).toBe(false);
    expect(
      validateJob("comment_post", "g1", null, { post_url: "https://x/1", text: "Hallo" }).valid,
    ).toBe(true);
    expect(
      validateJob("comment_post", "g1", null, { post_url: "https://x/1" }, "Hallo").valid,
    ).toBe(true);
    expect(
      validateJob("comment_post", "g1", null, { post_url: "https://x/1", text: "a".repeat(2001) })
        .valid,
    ).toBe(false);
  });

  it("Nachrichten brauchen Person und Text", () => {
    expect(validateJob("dm_new_member", null, "r1", { text: "Hi" }).valid).toBe(true);
    expect(validateJob("dm_new_member", null, null, { text: "Hi" }).valid).toBe(false);
    expect(validateJob("reply_message", null, "r1", {}).valid).toBe(false);
  });

  it("Scan-Tiefe ist optional, aber ganzzahlig", () => {
    expect(validateJob("scan_group", "g1", null, {}).valid).toBe(true);
    expect(validateJob("scan_group", "g1", null, { limit: 101 }).valid).toBe(false);
    expect(validateJob("scan_group", "g1", null, { limit: 10 }).valid).toBe(true);
  });

  it("jeder Auftragstyp hat eine Faehigkeit", () => {
    for (const type of ["like_posts", "comment_post", "scan_group", "dm_new_member", "reply_message"])
      expect(CAPABILITY_BY_JOB_TYPE[type]).toBeTruthy();
  });
});

describe("Schluessel und Geheimnisse", () => {
  it("Token werden stabil und nicht rueckrechenbar gehasht", async () => {
    const a = await hashWorkerToken("fbc_beispiel");
    const b = await hashWorkerToken("fbc_beispiel");
    const c = await hashWorkerToken("fbc_anders");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("fbc_");
  });

  it("Cookies werden verschluesselt und wieder lesbar", async () => {
    process.env["WORKER_SECRETS_KEY_V1"] = "test-schluessel-nur-fuer-den-test";
    const enc = await encryptSecret([{ name: "c_user", value: "123" }]);
    expect(enc).not.toBeNull();
    expect(enc!.ciphertext).not.toContain("c_user");
    const back = await decryptSecret<{ name: string }[]>(enc!.ciphertext, enc!.keyId);
    expect(back?.[0]?.name).toBe("c_user");
  });

  it("ohne Schluessel wird nichts verschluesselt", async () => {
    delete process.env["WORKER_SECRETS_KEY_V1"];
    expect(await encryptSecret({ a: 1 })).toBeNull();
  });
});
