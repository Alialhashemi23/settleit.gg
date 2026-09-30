import { DurableObject } from "cloudflare:workers";
import {
  DEFAULT_TIMING, LIMITS, ROOM_LIFECYCLE,
  advanceRound, applyRoundCommand, computeAwards, createRound, finalVotesOf, isRoundFinished, seededShuffle,
  type Ballot, type BallotOption, type CommandOutcome, type CommandResponse, type MemberView, type Outcome,
  type RecapRound, type RecapView, type RoomCommand, type RoomCommandBody, type RoomSnapshot, type RoomStatus,
  type RoundCommand, type RoundState, type RoundView, type ServerPush,
} from "@settleit/core";
import { computeOutcome } from "@settleit/core";
import { filterForRoom, type ResolvedQuestion } from "@settleit/content";
import { loadApprovedLibrary } from "./library";
import type { Env } from "./env";
import { applyExport, recordExportFailure, type RoomExportEvent } from "./export";
import { HttpError, cleanText, json, newId } from "./util";

interface Meta {
  code: string;
  createdAt: number;
  status: RoomStatus;
  version: number;
  categories: string[];
  excludeSpoilers: boolean;
  queueSeed: string;
  lastActivityAt: number;
  pauseSince: number | null;
  roundsCompleted: number;
  isTest: boolean;
  outboxSeq: number;
}

interface MemberRow {
  actor_id: string;
  nickname: string;
  joined_at: number;
  last_seen_at: number;
  ready: number;
  left: number;
}

interface OutboxRow {
  seq: number;
  event_id: string;
  payload: string;
  attempts: number;
  next_attempt_at: number;
}

const EXPORT_BACKOFF_MS = [5_000, 30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000];

export class RoomDO extends DurableObject<Env> {
  private meta: Meta | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => this.initSchema());
  }

  // ---------- schema ----------

  private initSchema() {
    const sql = this.ctx.storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS member (actor_id TEXT PRIMARY KEY, nickname TEXT NOT NULL, joined_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, ready INTEGER NOT NULL DEFAULT 0, left INTEGER NOT NULL DEFAULT 0)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS round (round_id TEXT PRIMARY KEY, round_number INTEGER NOT NULL, state TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS vote (round_id TEXT NOT NULL, actor_id TEXT NOT NULL, revision INTEGER NOT NULL, option_id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (round_id, actor_id, revision))`);
    sql.exec(`CREATE TABLE IF NOT EXISTS dealt (question_id TEXT PRIMARY KEY)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS queue (seq INTEGER PRIMARY KEY, question TEXT NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS custom_queue (id TEXT PRIMARY KEY, seq INTEGER NOT NULL, prompt TEXT NOT NULL, options TEXT NOT NULL, queued_by TEXT NOT NULL, dealt INTEGER NOT NULL DEFAULT 0)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS receipt (op_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, body_hash TEXT NOT NULL, result TEXT NOT NULL, at INTEGER NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS outbox (seq INTEGER PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL, created_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0)`);
  }

  private loadMeta(): Meta | null {
    if (this.meta) return this.meta;
    const row = this.ctx.storage.sql.exec("SELECT v FROM meta WHERE k = 'meta'").toArray()[0];
    if (!row) return null;
    this.meta = JSON.parse(row.v as string) as Meta;
    return this.meta;
  }

  private saveMeta(m: Meta) {
    this.meta = m;
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('meta', ?)", JSON.stringify(m));
  }

  private requireMeta(): Meta {
    const m = this.loadMeta();
    if (!m) throw new HttpError(404, "room_not_found", "That room doesn't exist or has expired.");
    if (m.status === "expired") throw new HttpError(410, "room_expired", "That room has ended.");
    return m;
  }

  // ---------- HTTP entry ----------

  override async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    try {
      const now = Date.now();
      switch (url.pathname) {
        case "/create": return await this.handleCreate(req, now);
        case "/exists": return json({ exists: this.loadMeta() !== null && this.loadMeta()!.status !== "expired" });
        case "/join": return await this.handleJoin(req, now);
        case "/snapshot": return await this.handleSnapshot(url, now);
        case "/command": return await this.handleCommand(req, now);
        case "/recap": return this.handleRecap(url, now);
        case "/ws": return this.handleWebSocket(req, url, now);
        case "/export-sweep": { await this.drainOutbox(now); return json({ ok: true, pending: this.pendingExports() }); }
        default: throw new HttpError(404, "not_found");
      }
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message }, { status: e.status });
      console.error("room error", e);
      return json({ error: "internal", message: "Room error." }, { status: 500 });
    }
  }

  private async handleCreate(req: Request, now: number): Promise<Response> {
    const body = (await req.json()) as { code: string; actorId: string; nickname: string; categories?: string[]; excludeSpoilers?: boolean; isTest?: boolean };
    if (this.loadMeta()) throw new HttpError(409, "room_exists");
    const meta: Meta = {
      code: body.code,
      createdAt: now,
      status: "lobby",
      version: 1,
      categories: sanitizeCategories(body.categories),
      excludeSpoilers: body.excludeSpoilers !== false,
      queueSeed: `${body.code}:${newId()}`,
      lastActivityAt: now,
      pauseSince: null,
      roundsCompleted: 0,
      isTest: !!body.isTest,
      outboxSeq: 0,
    };
    this.saveMeta(meta);
    this.upsertMember(body.actorId, body.nickname, now);
    this.enqueue({ kind: "room_status", eventId: newId("ev_"), roomCode: meta.code, seq: 0, status: "lobby", roundsCompleted: 0, at: now, isTest: meta.isTest });
    await this.afterChange(now);
    return json({ snapshot: this.snapshotFor(body.actorId, now) });
  }

  private async handleJoin(req: Request, now: number): Promise<Response> {
    const meta = this.requireMeta();
    const body = (await req.json()) as { actorId: string; nickname: string };
    const existing = this.member(body.actorId);
    const activeMembers = this.members().filter((m) => !m.left).length;
    if (!existing && activeMembers >= LIMITS.maxPlayers) throw new HttpError(409, "room_full", `This room is full (${LIMITS.maxPlayers} players).`);
    const nickname = cleanText(body.nickname, LIMITS.maxNicknameLength) || existing?.nickname || "Player";
    this.upsertMember(body.actorId, nickname, now);
    meta.lastActivityAt = now;
    this.saveMeta(meta);
    await this.afterChange(now);
    return json({ snapshot: this.snapshotFor(body.actorId, now) });
  }

  private async handleSnapshot(url: URL, now: number): Promise<Response> {
    const meta = this.loadMeta();
    if (!meta) throw new HttpError(404, "room_not_found", "That room doesn't exist or has expired.");
    const actorId = url.searchParams.get("actor") ?? "";
    const m = this.member(actorId);
    if (!m) throw new HttpError(403, "not_a_member", "Join this room first.");
    if (meta.status === "expired") return json({ snapshot: this.snapshotFor(actorId, now) });
    this.touch(actorId, now);
    // Snapshot requests also settle overdue deadlines; the alarm is not the only clock.
    await this.afterChange(now);
    return json({ snapshot: this.snapshotFor(actorId, now) });
  }

  private handleRecap(url: URL, now: number): Response {
    const meta = this.loadMeta();
    if (!meta) throw new HttpError(404, "room_not_found");
    const actorId = url.searchParams.get("actor") ?? "";
    if (!this.member(actorId)) throw new HttpError(403, "not_a_member");
    return json({ recap: this.recap(), serverNow: now });
  }

  private async handleCommand(req: Request, now: number): Promise<Response> {
    const meta = this.requireMeta();
    const body = (await req.json()) as { actorId: string; command: RoomCommand };
    const actorId = body.actorId;
    const cmd = body.command;
    if (!cmd || typeof cmd.opId !== "string" || cmd.opId.length < 8 || cmd.opId.length > 64) throw new HttpError(400, "bad_command", "Missing operation id.");
    const member = this.member(actorId);
    if (!member) throw new HttpError(403, "not_a_member", "Join this room first.");
    this.touch(actorId, now);

    // Idempotency: the same opId returns the original result. A reused opId with a different body is rejected.
    const bodyHash = JSON.stringify(cmd.body);
    const prior = this.ctx.storage.sql.exec("SELECT body_hash, result FROM receipt WHERE op_id = ?", cmd.opId).toArray()[0];
    if (prior) {
      if (prior.body_hash !== bodyHash) throw new HttpError(409, "op_id_reused", "Operation id reused with different content.");
      const result = JSON.parse(prior.result as string) as CommandOutcome;
      return json({ result, snapshot: this.snapshotFor(actorId, now) } satisfies CommandResponse);
    }

    const result = this.ctx.storage.transactionSync(() => {
      const r = this.applyCommand(meta, actorId, cmd.body, now);
      this.ctx.storage.sql.exec("INSERT INTO receipt (op_id, actor_id, body_hash, result, at) VALUES (?, ?, ?, ?, ?)", cmd.opId, actorId, bodyHash, JSON.stringify(r), now);
      return r;
    });
    await this.afterChange(now);
    const final: CommandOutcome = { ...result, version: this.loadMeta()!.version };
    return json({ result: final, snapshot: this.snapshotFor(actorId, now) } satisfies CommandResponse);
  }

  // ---------- commands ----------

  private applyCommand(meta: Meta, actorId: string, body: RoomCommandBody, now: number): CommandOutcome {
    const ok = (note?: string): CommandOutcome => ({ ok: true, opId: "", version: meta.version, ...(note ? { note } : {}) });
    const fail = (error: string, message: string): CommandOutcome => ({ ok: false, opId: "", version: meta.version, error, message });
    meta.lastActivityAt = now;

    switch (body.type) {
      case "heartbeat":
        this.saveMeta(meta);
        return ok();
      case "set_ready": {
        this.ctx.storage.sql.exec("UPDATE member SET ready = ?, left = 0 WHERE actor_id = ?", body.ready ? 1 : 0, actorId);
        this.saveMeta(meta);
        return ok();
      }
      case "leave": {
        this.ctx.storage.sql.exec("UPDATE member SET left = 1, ready = 0 WHERE actor_id = ?", actorId);
        this.saveMeta(meta);
        return ok();
      }
      case "set_categories": {
        if (meta.status !== "lobby") return fail("not_in_lobby", "Categories can only change before the first question.");
        meta.categories = sanitizeCategories(body.categories);
        meta.excludeSpoilers = body.excludeSpoilers !== false;
        this.ctx.storage.sql.exec("DELETE FROM queue");
        this.saveMeta(meta);
        return ok();
      }
      case "queue_custom": {
        const prompt = cleanText(body.prompt, LIMITS.maxCustomPromptLength);
        const options = uniqueOptions((body.options ?? []).map((o) => cleanText(o, LIMITS.maxWriteInLength)));
        if (prompt.length < 3) return fail("invalid_prompt", "Write a question first.");
        if (options.length < 2 || options.length > 4) return fail("invalid_options", "Give 2 to 4 distinct answers.");
        const queued = this.ctx.storage.sql.exec("SELECT COUNT(*) AS n FROM custom_queue WHERE dealt = 0").toArray()[0]!.n as number;
        if (queued >= LIMITS.maxCustomQueued) return fail("queue_full", "Too many custom questions waiting.");
        const seq = (this.ctx.storage.sql.exec("SELECT COALESCE(MAX(seq), 0) AS s FROM custom_queue").toArray()[0]!.s as number) + 1;
        this.ctx.storage.sql.exec("INSERT INTO custom_queue (id, seq, prompt, options, queued_by) VALUES (?, ?, ?, ?, ?)", newId("cq_"), seq, prompt, JSON.stringify(options), actorId);
        this.saveMeta(meta);
        return ok("Queued for this room only.");
      }
      case "write_in": {
        const round = this.currentRound();
        if (!round || round.roundId !== body.roundId) return fail("stale_round", "That question has already moved on.");
        const advanced = advanceRound(round, now);
        if (advanced.state.phase !== "vote") { this.storeRound(advanced.state); return fail("phase_closed", "Voting has closed."); }
        if (!advanced.state.eligible.includes(actorId)) return fail("not_eligible", "You join in on the next question.");
        const text = cleanText(body.text, LIMITS.maxWriteInLength);
        if (text.length < 1) return fail("invalid_option", "Type an answer first.");
        const state = advanced.state;
        const norm = normalize(text);
        const dup = state.ballot.options.find((o) => normalize(o.text) === norm);
        const writeIns = state.ballot.options.filter((o) => o.writeIn).length;
        let optionId: string;
        if (dup) optionId = dup.id;
        else {
          if (writeIns >= LIMITS.maxWriteInsPerQuestion || state.ballot.options.length >= LIMITS.maxOptionsPerBallot) return fail("too_many_options", "No more write-ins on this question.");
          optionId = `w${writeIns + 1}`;
          state.ballot = { ...state.ballot, variant: true, options: [...state.ballot.options, { id: optionId, text, writeIn: true }] };
        }
        const voted = applyRoundCommand(state, { type: "vote", actorId, optionId, ballotRevision: state.ballotRevision }, now);
        this.storeRound(voted.state);
        this.recordVotes(voted.state);
        if (voted.error) return fail(voted.error, humanize(voted.error));
        this.saveMeta(meta);
        return ok(dup ? "That answer already existed, so we counted your vote for it." : "Added as a room-only answer.");
      }
      case "vote":
      case "request_revote":
      case "request_more_time":
      case "request_skip": {
        const round = this.currentRound();
        if (!round || round.roundId !== body.roundId) return fail("stale_round", "That question has already moved on.");
        const rc: RoundCommand = body.type === "vote"
          ? { type: "vote", actorId, optionId: String(body.optionId), ballotRevision: Number(body.ballotRevision) }
          : { type: body.type, actorId };
        const r = applyRoundCommand(round, rc, now);
        this.storeRound(r.state);
        if (body.type === "vote") this.recordVotes(r.state);
        this.saveMeta(meta);
        if (r.error) return fail(r.error, humanize(r.error));
        return ok();
      }
      default:
        return fail("unknown_command", "Unknown command.");
    }
  }

  // ---------- session orchestration ----------

  /**
   * Runs after every command, snapshot, join and alarm: settle deadlines, deal
   * questions, expire idle rooms, export results, bump the version, broadcast,
   * and schedule the single next alarm. Safe to run repeatedly.
   */
  private async afterChange(now: number): Promise<void> {
    const meta = this.loadMeta();
    if (!meta || meta.status === "expired") return;
    const before = this.stateFingerprint();

    let round = this.currentRound();
    if (round) {
      const adv = advanceRound(round, now);
      if (adv.events.length > 0) {
        this.storeRound(adv.state);
        round = adv.state;
        if (adv.events.some((e) => e.type === "round_completed")) this.onRoundCompleted(meta, adv.state, now);
      }
      if (isRoundFinished(round, now)) {
        this.ctx.storage.sql.exec("UPDATE round SET completed = 1 WHERE round_id = ?", round.roundId);
        round = null;
      }
    }

    if (!round) {
      const active = this.activeMembers(now);
      const canDeal = meta.status === "lobby"
        ? active.filter((m) => m.ready).length >= LIMITS.minPlayersToStart
        : active.length >= LIMITS.minActiveToContinue;
      if (canDeal) {
        const dealt = await this.dealNext(meta, active.map((m) => m.actor_id), now);
        if (dealt) {
          meta.status = "playing";
          meta.pauseSince = null;
        } else if (meta.status !== "lobby") {
          meta.status = "paused";
          meta.pauseSince ??= now;
        }
      } else if (meta.status === "playing") {
        meta.status = "paused";
        meta.pauseSince = now;
      } else if (meta.status === "paused" && meta.pauseSince === null) {
        meta.pauseSince = now;
      }
    }

    // Idle expiry: paused (or never started) for too long, or retention passed.
    const idleSince = meta.status === "paused" ? meta.pauseSince ?? now : meta.status === "lobby" ? meta.lastActivityAt : null;
    if (idleSince !== null && now - idleSince >= ROOM_LIFECYCLE.idlePauseExpiryMs) {
      meta.status = "expired";
      this.enqueue({ kind: "room_status", eventId: newId("ev_"), roomCode: meta.code, seq: 0, status: "expired", roundsCompleted: meta.roundsCompleted, at: now, isTest: meta.isTest });
    }

    if (this.stateFingerprint() !== before || meta.status === "expired") meta.version += 1;
    this.saveMeta(meta);
    // Exports go to D1 in the background: a slow or failing D1 delays public
    // totals, never the room. The outbox rows are already durable.
    this.ctx.waitUntil(this.drainOutbox(now).catch((e) => console.warn("drain failed", e)));
    this.broadcast(now);
    if (meta.status === "expired") {
      for (const ws of this.ctx.getWebSockets()) { try { ws.send(JSON.stringify({ kind: "expired" } satisfies ServerPush)); ws.close(1000, "expired"); } catch { /* ignore */ } }
    }
    await this.scheduleAlarm(now);
  }

  private stateFingerprint(): string {
    const m = this.loadMeta();
    const r = this.ctx.storage.sql.exec("SELECT state FROM round WHERE completed = 0 ORDER BY round_number DESC LIMIT 1").toArray()[0];
    const members = this.ctx.storage.sql.exec("SELECT actor_id, nickname, ready, left FROM member ORDER BY actor_id").toArray()
      .map((x) => `${x.actor_id}:${x.nickname}:${x.ready}:${x.left}`).join(",");
    return `${m?.status}|${members}|${r?.state ?? ""}`;
  }

  private async dealNext(meta: Meta, eligible: string[], now: number): Promise<boolean> {
    let ballot: Ballot | null = null;
    const custom = this.ctx.storage.sql.exec("SELECT id, prompt, options FROM custom_queue WHERE dealt = 0 ORDER BY seq LIMIT 1").toArray()[0];
    if (custom) {
      this.ctx.storage.sql.exec("UPDATE custom_queue SET dealt = 1 WHERE id = ?", custom.id);
      const opts = (JSON.parse(custom.options as string) as string[]).map((t, i): BallotOption => ({ id: `o${i + 1}`, text: t }));
      ballot = { questionId: null, versionId: null, prompt: custom.prompt as string, options: opts, tags: [], spoiler: false, variant: true, source: "custom" };
    } else {
      const dealt = new Set(this.ctx.storage.sql.exec("SELECT question_id FROM dealt").toArray().map((r) => r.question_id as string));
      const queue = await this.questionQueue(meta);
      const next = queue.find((q) => !dealt.has(q.id));
      if (!next) return false;
      this.ctx.storage.sql.exec("INSERT OR IGNORE INTO dealt (question_id) VALUES (?)", next.id);
      ballot = { questionId: next.id, versionId: next.versionId, prompt: next.prompt, options: next.options.map((o) => ({ id: o.id, text: o.text })), tags: next.tags, spoiler: next.spoiler, variant: false, source: "library" };
    }
    const roundNumber = (this.ctx.storage.sql.exec("SELECT COALESCE(MAX(round_number), 0) AS n FROM round").toArray()[0]!.n as number) + 1;
    const state = createRound({ roundId: newId("r_"), roundNumber, ballot, eligible, now, timing: DEFAULT_TIMING });
    this.ctx.storage.sql.exec("INSERT INTO round (round_id, round_number, state, completed) VALUES (?, ?, ?, 0)", state.roundId, roundNumber, JSON.stringify(state));
    return true;
  }

  /**
   * The room's shuffled question queue is built once (from D1, falling back to
   * the static catalog) and stored locally, so a restart or a D1 outage never
   * changes what an already-running room deals next.
   */
  private async questionQueue(meta: Meta): Promise<ResolvedQuestion[]> {
    const rows = this.ctx.storage.sql.exec("SELECT question FROM queue ORDER BY seq").toArray();
    if (rows.length > 0) return rows.map((r) => JSON.parse(r.question as string) as ResolvedQuestion);
    const { questions } = await loadApprovedLibrary(this.env);
    const shuffled = seededShuffle(filterForRoom(questions, meta.categories, meta.excludeSpoilers), meta.queueSeed);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("DELETE FROM queue");
      shuffled.forEach((q, i) => this.ctx.storage.sql.exec("INSERT INTO queue (seq, question) VALUES (?, ?)", i + 1, JSON.stringify(q)));
    });
    return shuffled;
  }

  private onRoundCompleted(meta: Meta, state: RoundState, now: number) {
    meta.roundsCompleted += 1;
    const result = state.result!;
    if (result.empty || result.skipped) return;
    const canonical = !state.ballot.variant && !!state.ballot.versionId;
    const finalVotes: Record<string, string> = {};
    if (canonical) for (const [a, v] of Object.entries(result.finalVotes)) finalVotes[a] = v.optionId;
    this.enqueue({
      kind: "round_completed",
      eventId: `${meta.code}:${state.roundId}`,
      roomCode: meta.code,
      roundId: state.roundId,
      seq: 0,
      versionId: canonical ? state.ballot.versionId : null,
      variant: !canonical,
      final: result.final,
      changedMinds: result.changedMinds.length,
      bothVotes: result.revoteHappened ? Object.keys(state.initialVotes).filter((a) => a in result.finalVotes).length : 0,
      finalVotes,
      completedAt: result.completedAt,
      isTest: meta.isTest,
    });
  }

  // ---------- outbox ----------

  private enqueue(ev: RoomExportEvent) {
    const meta = this.loadMeta()!;
    meta.outboxSeq += 1;
    ev.seq = meta.outboxSeq;
    this.ctx.storage.sql.exec("INSERT OR IGNORE INTO outbox (seq, event_id, payload, created_at) VALUES (?, ?, ?, ?)", ev.seq, ev.eventId, JSON.stringify(ev), Date.now());
    this.saveMeta(meta);
  }

  private pendingExports(): number {
    return this.ctx.storage.sql.exec("SELECT COUNT(*) AS n FROM outbox WHERE done = 0").toArray()[0]!.n as number;
  }

  private draining: Promise<void> | null = null;

  /** Deliver due outbox items in order. Local acknowledgement happens only after D1 confirms. */
  private drainOutbox(now: number): Promise<void> {
    if (this.draining) return this.draining;
    this.draining = this.drainOutboxNow(now).finally(() => { this.draining = null; });
    return this.draining;
  }

  private async drainOutboxNow(now: number): Promise<void> {
    const rows = this.ctx.storage.sql.exec("SELECT seq, event_id, payload, attempts, next_attempt_at FROM outbox WHERE done = 0 AND next_attempt_at <= ? ORDER BY seq", now).toArray() as unknown as OutboxRow[];
    for (const row of rows) {
      const ev = JSON.parse(row.payload) as RoomExportEvent;
      try {
        await applyExport(this.env.DB, ev);
        this.ctx.storage.sql.exec("UPDATE outbox SET done = 1 WHERE seq = ?", row.seq);
      } catch (e) {
        const attempts = row.attempts + 1;
        const delay = EXPORT_BACKOFF_MS[Math.min(attempts - 1, EXPORT_BACKOFF_MS.length - 1)]!;
        this.ctx.storage.sql.exec("UPDATE outbox SET attempts = ?, next_attempt_at = ? WHERE seq = ?", attempts, now + delay, row.seq);
        console.warn(`export failed for ${ev.roomCode} seq ${row.seq}: ${String(e)}`);
        await recordExportFailure(this.env.DB, ev.roomCode, this.pendingExports(), String(e));
        break; // keep order; later items wait for this one
      }
    }
  }

  // ---------- alarms ----------

  private async scheduleAlarm(now: number): Promise<void> {
    const meta = this.loadMeta();
    if (!meta) return;
    const candidates: number[] = [];
    if (meta.status === "expired") {
      if (this.pendingExports() === 0) candidates.push(meta.lastActivityAt + ROOM_LIFECYCLE.retentionMs);
    } else {
      const round = this.currentRound();
      if (round) candidates.push(round.deadline);
      if (meta.status === "paused" && meta.pauseSince !== null) candidates.push(meta.pauseSince + ROOM_LIFECYCLE.idlePauseExpiryMs);
      if (meta.status === "lobby") candidates.push(meta.lastActivityAt + ROOM_LIFECYCLE.idlePauseExpiryMs);
    }
    const nextExport = this.ctx.storage.sql.exec("SELECT MIN(next_attempt_at) AS t FROM outbox WHERE done = 0").toArray()[0]?.t as number | null;
    if (nextExport !== null && nextExport !== undefined) candidates.push(Math.max(nextExport, now + 1000));
    if (candidates.length === 0) { await this.ctx.storage.deleteAlarm(); return; }
    const at = Math.max(now + 250, Math.min(...candidates));
    await this.ctx.storage.setAlarm(at);
  }

  override async alarm(): Promise<void> {
    const now = Date.now();
    const meta = this.loadMeta();
    if (!meta) return;
    if (meta.status === "expired") {
      await this.drainOutbox(now);
      if (this.pendingExports() === 0 && now >= meta.lastActivityAt + ROOM_LIFECYCLE.retentionMs) {
        await this.ctx.storage.deleteAll();
        this.meta = null;
        return;
      }
      await this.scheduleAlarm(now);
      return;
    }
    await this.afterChange(now);
  }

  // ---------- websockets ----------

  private handleWebSocket(req: Request, url: URL, now: number): Response {
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") throw new HttpError(426, "upgrade_required");
    const meta = this.requireMeta();
    const actorId = url.searchParams.get("actor") ?? "";
    if (!this.member(actorId)) throw new HttpError(403, "not_a_member", "Join this room first.");
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [actorId]);
    this.touch(actorId, now);
    server.send(JSON.stringify({ kind: "snapshot", snapshot: this.snapshotFor(actorId, now) } satisfies ServerPush));
    void meta;
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const actorId = this.ctx.getTags(ws)[0];
    if (!actorId) return;
    const now = Date.now();
    this.touch(actorId, now);
    if (message === "ping") { ws.send("pong"); return; }
    if (message === "sync") { ws.send(JSON.stringify({ kind: "snapshot", snapshot: this.snapshotFor(actorId, now) } satisfies ServerPush)); }
    await this.afterChange(now);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    // Closing a socket changes presence only. Membership, votes and phase are untouched.
    try { ws.close(); } catch { /* already closed */ }
    await this.afterChange(Date.now());
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    try { ws.close(); } catch { /* ignore */ }
  }

  private broadcast(now: number) {
    for (const ws of this.ctx.getWebSockets()) {
      const actorId = this.ctx.getTags(ws)[0];
      if (!actorId) continue;
      try { ws.send(JSON.stringify({ kind: "snapshot", snapshot: this.snapshotFor(actorId, now) } satisfies ServerPush)); }
      catch { /* socket gone; close event will follow */ }
    }
  }

  // ---------- members ----------

  private members(): MemberRow[] {
    return this.ctx.storage.sql.exec("SELECT * FROM member ORDER BY joined_at").toArray() as unknown as MemberRow[];
  }

  private member(actorId: string): MemberRow | null {
    return (this.ctx.storage.sql.exec("SELECT * FROM member WHERE actor_id = ?", actorId).toArray()[0] as unknown as MemberRow) ?? null;
  }

  private upsertMember(actorId: string, nickname: string, now: number) {
    this.ctx.storage.sql.exec(
      "INSERT INTO member (actor_id, nickname, joined_at, last_seen_at, ready, left) VALUES (?, ?, ?, ?, 0, 0) ON CONFLICT(actor_id) DO UPDATE SET nickname = excluded.nickname, last_seen_at = excluded.last_seen_at, left = 0",
      actorId, cleanText(nickname, LIMITS.maxNicknameLength) || "Player", now, now,
    );
  }

  private touch(actorId: string, now: number) {
    this.ctx.storage.sql.exec("UPDATE member SET last_seen_at = ? WHERE actor_id = ?", now, actorId);
  }

  private isActive(m: MemberRow, now: number): boolean {
    if (m.left) return false;
    if (now - m.last_seen_at <= ROOM_LIFECYCLE.presenceWindowMs) return true;
    return this.ctx.getWebSockets(m.actor_id).length > 0;
  }

  private activeMembers(now: number): MemberRow[] {
    return this.members().filter((m) => this.isActive(m, now));
  }

  // ---------- rounds ----------

  private currentRound(): RoundState | null {
    const row = this.ctx.storage.sql.exec("SELECT state FROM round WHERE completed = 0 ORDER BY round_number DESC LIMIT 1").toArray()[0];
    return row ? (JSON.parse(row.state as string) as RoundState) : null;
  }

  private storeRound(state: RoundState) {
    this.ctx.storage.sql.exec("UPDATE round SET state = ? WHERE round_id = ?", JSON.stringify(state), state.roundId);
  }

  /** Second line of defence: one row per participant/round/ballot revision. */
  private recordVotes(state: RoundState) {
    for (const [rev, bucket] of [[1, state.initialVotes], [2, state.revoteVotes]] as const) {
      for (const [actorId, v] of Object.entries(bucket)) {
        this.ctx.storage.sql.exec(
          "INSERT INTO vote (round_id, actor_id, revision, option_id, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(round_id, actor_id, revision) DO UPDATE SET option_id = excluded.option_id, at = excluded.at",
          state.roundId, actorId, rev, v.optionId, v.at,
        );
      }
    }
  }

  private completedRounds(): RoundState[] {
    return this.ctx.storage.sql.exec("SELECT state FROM round WHERE completed = 1 OR state LIKE '%\"phase\":\"verdict\"%' ORDER BY round_number").toArray()
      .map((r) => JSON.parse(r.state as string) as RoundState)
      .filter((r) => r.result !== null);
  }

  // ---------- views ----------

  private snapshotFor(actorId: string, now: number): RoomSnapshot {
    const meta = this.loadMeta()!;
    const me = this.member(actorId);
    const round = this.currentRound();
    const members = this.members().filter((m) => !m.left);
    const eligible = new Set(round?.eligible ?? []);
    const memberViews: MemberView[] = members.map((m) => ({
      actorId: m.actor_id,
      nickname: m.nickname,
      presence: this.isActive(m, now) ? "active" : "away",
      ready: !!m.ready,
      joinedAt: m.joined_at,
      eligible: eligible.has(m.actor_id),
    }));
    const nick = new Map(members.map((m) => [m.actor_id, m.nickname]));
    let roundView: RoundView | null = null;
    if (round) {
      const bucket = round.phase === "revote" ? round.revoteVotes : round.phase === "verdict" && round.result ? round.result.finalVotes : round.initialVotes;
      const votes = Object.entries(bucket).map(([a, v]) => ({ actorId: a, nickname: nick.get(a) ?? "Player", optionId: v.optionId }));
      const openBucket = round.phase === "revote" ? round.revoteVotes : round.initialVotes;
      const initialOutcome: Outcome | null = round.phase === "vote" ? null : computeOutcome(round.initialVotes, round.ballot.options);
      roundView = {
        roundId: round.roundId,
        roundNumber: round.roundNumber,
        ballot: round.ballot,
        phase: round.phase,
        startedAt: round.startedAt,
        phaseStartedAt: round.phaseStartedAt,
        deadline: round.deadline,
        ballotRevision: round.ballotRevision,
        eligible: round.eligible,
        votes,
        initialOutcome,
        revoteRequests: round.revoteRequests,
        moreTimeRequests: round.moreTimeRequests,
        skipRequests: round.skipRequests,
        revoteUsed: round.revoteUsed,
        extensionUsed: round.extensionUsed,
        result: round.result,
        myVote: openBucket[actorId] ?? null,
      };
    }
    const customQueueLength = this.ctx.storage.sql.exec("SELECT COUNT(*) AS n FROM custom_queue WHERE dealt = 0").toArray()[0]!.n as number;
    const expiresAt = meta.status === "paused" && meta.pauseSince !== null ? meta.pauseSince + ROOM_LIFECYCLE.idlePauseExpiryMs
      : meta.status === "lobby" ? meta.lastActivityAt + ROOM_LIFECYCLE.idlePauseExpiryMs : null;
    return {
      code: meta.code,
      version: meta.version,
      status: meta.status,
      pauseReason: meta.status === "paused" ? "waiting_for_players" : null,
      me: { actorId, nickname: me?.nickname ?? "Player" },
      members: memberViews,
      categories: meta.categories,
      excludeSpoilers: meta.excludeSpoilers,
      round: roundView,
      roundsCompleted: meta.roundsCompleted,
      serverNow: now,
      expiresAt,
      customQueueLength,
    };
  }

  private recap(): RecapView {
    const rounds = this.completedRounds();
    const members = this.members().map((m) => ({ actorId: m.actor_id, nickname: m.nickname }));
    const recapRounds: RecapRound[] = rounds.map((r) => ({
      roundId: r.roundId,
      roundNumber: r.roundNumber,
      prompt: r.ballot.prompt,
      options: r.ballot.options.map((o) => ({ id: o.id, text: o.text })),
      final: r.result!.final,
      initial: r.result!.initial,
      changedMinds: r.result!.changedMinds,
      finalVotes: Object.fromEntries(Object.entries(finalVotesOf(r)).map(([a, v]) => [a, v.optionId])),
      skipped: r.result!.skipped,
      empty: r.result!.empty,
    }));
    return { rounds: recapRounds, awards: computeAwards(rounds), members };
  }
}

// ---------- helpers ----------

const KNOWN_CATEGORIES = new Set(["mix", "gaming", "anime", "internet", "screens", "music", "food", "sports", "nostalgia", "wildcard"]);

function sanitizeCategories(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out = v.filter((c): c is string => typeof c === "string" && KNOWN_CATEGORIES.has(c));
  return out.includes("mix") ? [] : [...new Set(out)];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function uniqueOptions(opts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of opts) {
    const n = normalize(o);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(o);
  }
  return out;
}

function humanize(error: string): string {
  switch (error) {
    case "not_eligible": return "You join in on the next question.";
    case "phase_closed": return "That part of the round is over.";
    case "deadline_passed": return "Too late: voting closed before this arrived.";
    case "invalid_option": return "That answer isn't on this question.";
    case "stale_ballot_revision": return "The ballot changed. Vote again.";
    case "revote_already_used": return "This question already had its revote.";
    case "extension_already_used": return "More time was already added once.";
    case "not_a_voter": return "Only people who voted can ask for that.";
    default: return "That didn't go through.";
  }
}
