<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { connect, saveSession, clearSession } from "$lib/socket";
  import { roomCode, players, myPlayerId } from "$lib/stores";

  onMount(() => {
    clearSession();
    const prefill = $page.url.searchParams.get("code");
    if (prefill) {
      code = prefill.toUpperCase();
      mode = "join";
    }
  });

  let mode: "none" | "join" | "create" = $state("none");
  let nickname = $state("");
  let code = $state("");
  let error = $state("");
  let loading = $state(false);

  function handleCreate() {
    if (!nickname.trim()) { error = "Enter a nickname"; return; }
    loading = true;
    error = "";
    const socket = connect();

    socket.once("connect_error", () => {
      error = "Can't connect to server. Try again in a moment.";
      loading = false;
    });

    socket.once("room:created", ({ roomCode: rc }: { roomCode: string }) => {
      roomCode.set(rc);
    });

    socket.once("room:joined", ({ roomCode: rc, players: pl, playerId: pid }: { roomCode: string; players: any[]; playerId: string }) => {
      roomCode.set(rc);
      players.set(pl);
      myPlayerId.set(pid);
      saveSession(rc, pid, nickname.trim());
      loading = false;
      goto(`/host/${rc}`);
    });

    socket.once("error", ({ message }: { message: string }) => {
      error = message;
      loading = false;
    });

    socket.emit("room:create", { nickname: nickname.trim() });
  }

  function formatCode(e: Event) {
    const raw = (e.target as HTMLInputElement).value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    code = raw.length > 4 ? raw.slice(0, 4) + '-' + raw.slice(4, 8) : raw;
  }

  function handleJoin() {
    if (!nickname.trim()) { error = "Enter a nickname"; return; }
    if (!code.trim()) { error = "Enter a room code"; return; }
    loading = true;
    error = "";
    const socket = connect();

    socket.once("connect_error", () => {
      error = "Can't connect to server. Try again in a moment.";
      loading = false;
    });

    socket.once("room:joined", ({ roomCode: rc, players: pl, playerId: pid }: { roomCode: string; players: any[]; playerId: string }) => {
      roomCode.set(rc);
      players.set(pl);
      myPlayerId.set(pid);
      saveSession(rc, pid, nickname.trim());
      loading = false;
      goto(`/play/${rc}`);
    });

    socket.once("error", ({ message }: { message: string }) => {
      error = message === "room_not_found" ? "Room not found. Check the code and try again." : message;
      loading = false;
    });

    socket.emit("room:join", { roomCode: code.trim().toUpperCase(), nickname: nickname.trim() });
  }
</script>

<main>
  <div class="hero">

    <!-- Flame logo -->
    <div class="logo-wrap">
      <svg class="flame" viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <radialGradient id="outerFire" cx="50%" cy="85%" r="75%">
            <stop offset="0%" stop-color="#ffd166"/>
            <stop offset="45%" stop-color="#e8831a"/>
            <stop offset="100%" stop-color="#a03000"/>
          </radialGradient>
          <radialGradient id="innerFire" cx="50%" cy="75%" r="65%">
            <stop offset="0%" stop-color="#fffbe0"/>
            <stop offset="50%" stop-color="#ffd166"/>
            <stop offset="100%" stop-color="#e8831a"/>
          </radialGradient>
          <filter id="glow" x="-40%" y="-20%" width="180%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <!-- Outer flame body -->
        <path
          d="M30 76 C13 66 5 49 10 31 C13 20 21 15 25 25 C20 10 29 1 30 0 C31 1 40 10 35 25 C39 15 47 20 50 31 C55 49 47 66 30 76Z"
          fill="url(#outerFire)"
          filter="url(#glow)"
          class="outer-flame"
        />
        <!-- Inner flame -->
        <path
          d="M30 64 C21 56 17 43 20 32 C22 25 27 23 29 29 C26 19 30 9 30 9 C30 9 34 19 31 29 C33 23 38 25 40 32 C43 43 39 56 30 64Z"
          fill="url(#innerFire)"
          opacity="0.95"
          class="inner-flame"
        />
        <!-- Hot core -->
        <ellipse cx="30" cy="52" rx="6" ry="9" fill="#fffbe0" opacity="0.6" class="core"/>
      </svg>
    </div>

    <h1>Settle It</h1>
    <p class="tagline">The group debate game.<br/>No accounts. Just a code.</p>

    {#if mode === "none"}
      <div class="actions">
        <button class="btn-primary" onclick={() => mode = "create"}>Create Room</button>
        <button class="btn-secondary" onclick={() => mode = "join"}>Join Room</button>
      </div>
      <p class="hint">Gather around. Pick a side.</p>
    {:else if mode === "create"}
      <form class="form" onsubmit={(e) => { e.preventDefault(); handleCreate(); }}>
        <label>
          Your nickname
          <input type="text" bind:value={nickname} placeholder="e.g. Alex" maxlength="20" autofocus />
        </label>
        {#if error}<p class="error">{error}</p>{/if}
        <button class="btn-primary" type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Room"}
        </button>
        <button class="btn-ghost" type="button" onclick={() => { mode = "none"; error = ""; }}>Back</button>
      </form>
    {:else if mode === "join"}
      <form class="form" onsubmit={(e) => { e.preventDefault(); handleJoin(); }}>
        <label>
          Room code
          <input
            type="text"
            value={code}
            oninput={formatCode}
            placeholder="e.g. FIRE-4829"
            maxlength="9"
            autofocus
            style="text-transform: uppercase; letter-spacing: 0.1em;"
          />
        </label>
        <label>
          Your nickname
          <input type="text" bind:value={nickname} placeholder="e.g. Alex" maxlength="20" />
        </label>
        {#if error}<p class="error">{error}</p>{/if}
        <button class="btn-primary" type="submit" disabled={loading}>
          {loading ? "Joining..." : "Join Room"}
        </button>
        <button class="btn-ghost" type="button" onclick={() => { mode = "none"; error = ""; }}>Back</button>
      </form>
    {/if}

    <p class="credit">created by dijaj garage</p>
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background:
      radial-gradient(ellipse at 50% 70%, rgba(232, 131, 26, 0.1) 0%, transparent 65%),
      radial-gradient(ellipse at 50% 100%, rgba(160, 48, 0, 0.12) 0%, transparent 50%);
  }

  .hero {
    text-align: center;
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    animation: slideUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  /* Flame logo */
  .logo-wrap {
    margin-bottom: 0.5rem;
    filter: drop-shadow(0 0 18px rgba(232, 131, 26, 0.5));
    animation: logoGlow 2.5s ease-in-out infinite alternate;
  }

  .flame {
    width: 72px;
    height: 96px;
    display: block;
  }

  .outer-flame {
    animation: flicker 1.8s ease-in-out infinite alternate;
    transform-origin: 30px 76px;
  }

  .inner-flame {
    animation: flickerInner 1.3s ease-in-out infinite alternate;
    transform-origin: 30px 64px;
  }

  .core {
    animation: coreFlicker 0.9s ease-in-out infinite alternate;
  }

  h1 {
    font-size: 4rem;
    font-weight: 900;
    margin: 0 0 0.2rem;
    letter-spacing: -0.03em;
    background: linear-gradient(to bottom, #f5ede0 20%, #e8831a 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: titleGlow 3s ease-in-out infinite;
    line-height: 1;
  }

  .tagline {
    color: var(--text-muted);
    margin: 0 0 2rem;
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.6;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
  }

  .hint {
    margin: 1rem 0 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-dim);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    text-align: left;
    width: 100%;
    animation: slideUp 0.3s ease-out;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    font-size: 0.875rem;
    font-weight: 800;
    color: var(--text-muted);
  }

  input {
    padding: 0.875rem 1rem;
    border-radius: 0.75rem;
    border: 2px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font-size: 1rem;
    font-family: inherit;
    font-weight: 600;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-alpha);
  }

  .btn-primary {
    min-height: 52px;
    padding: 0.85rem;
    border-radius: 1rem;
    border: none;
    background: var(--accent);
    color: #fff;
    font-size: 1rem;
    font-weight: 800;
    cursor: pointer;
    font-family: inherit;
    box-shadow: 0 0 18px var(--accent-alpha), 0 4px 12px rgba(0,0,0,0.4);
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 150ms ease, background 150ms ease;
    width: 100%;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
    box-shadow: 0 0 28px rgba(232, 131, 26, 0.45), 0 6px 16px rgba(0,0,0,0.4);
  }

  .btn-primary:active:not(:disabled) {
    transform: scale(0.95);
    box-shadow: 0 0 32px rgba(232, 131, 26, 0.55), 0 2px 8px rgba(0,0,0,0.3);
  }

  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }

  .btn-secondary {
    min-height: 52px;
    padding: 0.85rem;
    border-radius: 1rem;
    border: 2px solid var(--border);
    background: transparent;
    color: var(--text);
    font-size: 1rem;
    font-weight: 800;
    cursor: pointer;
    font-family: inherit;
    width: 100%;
    transition: border-color 0.15s, transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .btn-secondary:hover { border-color: var(--accent); }
  .btn-secondary:active { transform: scale(0.97); }

  .btn-ghost {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    text-align: center;
    padding: 0.25rem;
    font-family: inherit;
    transition: color 0.15s;
  }

  .btn-ghost:hover { color: var(--text-muted); }

  .credit {
    margin: 2rem 0 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-dim);
    letter-spacing: 0.04em;
  }

  .error {
    color: var(--error);
    font-size: 0.875rem;
    font-weight: 700;
    margin: 0;
    animation: shake 0.4s ease;
  }

  /* Animations */
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(28px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes flicker {
    0%   { transform: scaleX(1)    scaleY(1)    rotate(-1deg); }
    30%  { transform: scaleX(0.97) scaleY(1.02) rotate(0.5deg); }
    60%  { transform: scaleX(1.02) scaleY(0.97) rotate(-0.5deg); }
    100% { transform: scaleX(0.98) scaleY(1.03) rotate(1deg); }
  }

  @keyframes flickerInner {
    0%   { transform: scaleX(1)    scaleY(1)    rotate(1deg); opacity: 0.95; }
    40%  { transform: scaleX(1.04) scaleY(0.96) rotate(-0.5deg); opacity: 0.85; }
    100% { transform: scaleX(0.96) scaleY(1.04) rotate(0.5deg); opacity: 1; }
  }

  @keyframes coreFlicker {
    0%   { opacity: 0.6; transform: scaleY(1); }
    100% { opacity: 0.9; transform: scaleY(1.1); }
  }

  @keyframes logoGlow {
    from { filter: drop-shadow(0 0 14px rgba(232, 131, 26, 0.4)); }
    to   { filter: drop-shadow(0 0 28px rgba(232, 131, 26, 0.7)); }
  }

  @keyframes titleGlow {
    0%, 100% { filter: drop-shadow(0 0 12px rgba(232, 131, 26, 0.2)); }
    50%       { filter: drop-shadow(0 0 28px rgba(232, 131, 26, 0.5)); }
  }

  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-8px); }
    40% { transform: translateX(8px); }
    60% { transform: translateX(-5px); }
    80% { transform: translateX(5px); }
  }
</style>
