<script lang="ts">
  import { goto } from "$app/navigation";
  import { connect } from "$lib/socket";
  import { roomCode, players, gameMode, myPlayerId } from "$lib/stores";

  let mode: "none" | "join" | "create" = $state("none");
  let nickname = $state("");
  let code = $state("");
  let error = $state("");
  let loading = $state(false);
  let selectedMode: "host-picks" | "player-turns" = $state("host-picks");

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

    socket.once("room:joined", ({ roomCode: rc, players: pl, mode: m, playerId: pid }: { roomCode: string; players: any[]; mode: string; playerId: string }) => {
      roomCode.set(rc);
      players.set(pl);
      gameMode.set(m === "player-turns" ? "player-turns" : "host-picks");
      myPlayerId.set(pid);
      loading = false;
      goto(`/host/${rc}`);
    });

    socket.once("error", ({ message }: { message: string }) => {
      error = message;
      loading = false;
    });

    socket.emit("room:create", { nickname: nickname.trim(), mode: selectedMode });
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

    socket.once("room:joined", ({ roomCode: rc, players: pl, mode: m, playerId: pid }: { roomCode: string; players: any[]; mode: string; playerId: string }) => {
      roomCode.set(rc);
      players.set(pl);
      gameMode.set(m === "player-turns" ? "player-turns" : "host-picks");
      myPlayerId.set(pid);
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
    <h1>Settle It</h1>
    <p class="tagline">The group opinion game. No accounts. Just a code.</p>

    {#if mode === "none"}
      <div class="actions">
        <button class="btn-primary" onclick={() => mode = "create"}>Create Room</button>
        <button class="btn-secondary" onclick={() => mode = "join"}>Join Room</button>
      </div>
    {:else if mode === "create"}
      <form class="form" onsubmit={(e) => { e.preventDefault(); handleCreate(); }}>
        <label>
          Your nickname
          <input type="text" bind:value={nickname} placeholder="e.g. Alex" maxlength="20" autofocus />
        </label>
        <div class="field-group">
          <span class="field-label">Game mode</span>
          <div class="mode-toggle">
            <button type="button" class="mode-btn {selectedMode === 'host-picks' ? 'active' : ''}" onclick={() => selectedMode = 'host-picks'}>
              Host Picks
            </button>
            <button type="button" class="mode-btn {selectedMode === 'player-turns' ? 'active' : ''}" onclick={() => selectedMode = 'player-turns'}>
              Player Turns
            </button>
          </div>
          <p class="mode-hint">
            {selectedMode === 'host-picks' ? 'Host chooses all questions.' : 'Question asking rotates through everyone.'}
          </p>
        </div>
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
            bind:value={code}
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
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .hero {
    text-align: center;
    width: 100%;
    max-width: 400px;
  }

  h1 {
    font-size: 3.5rem;
    font-weight: 900;
    margin: 0 0 0.25rem;
    letter-spacing: -0.02em;
  }

  .tagline {
    color: #888;
    margin: 0 0 2.5rem;
    font-size: 1rem;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    text-align: left;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: #ccc;
  }

  input {
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    border: 2px solid #333;
    background: #1a1a1a;
    color: #fff;
    font-size: 1rem;
    outline: none;
    transition: border-color 0.15s;
  }

  input:focus {
    border-color: #ff4d00;
  }

  .btn-primary {
    padding: 0.85rem;
    border-radius: 0.5rem;
    border: none;
    background: #ff4d00;
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn-primary:hover:not(:disabled) { opacity: 0.9; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-secondary {
    padding: 0.85rem;
    border-radius: 0.5rem;
    border: 2px solid #333;
    background: transparent;
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .btn-secondary:hover { border-color: #555; }

  .btn-ghost {
    background: none;
    border: none;
    color: #666;
    font-size: 0.875rem;
    cursor: pointer;
    text-align: center;
    padding: 0.25rem;
  }

  .btn-ghost:hover { color: #aaa; }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .field-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: #ccc;
  }

  .mode-toggle {
    display: flex;
    gap: 0.25rem;
    background: #1a1a1a;
    border-radius: 0.5rem;
    padding: 0.2rem;
  }

  .mode-btn {
    flex: 1;
    padding: 0.5rem;
    border-radius: 0.35rem;
    border: none;
    background: transparent;
    color: #888;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .mode-btn.active { background: #ff4d00; color: #fff; }

  .mode-hint {
    font-size: 0.75rem;
    color: #555;
    margin: 0;
  }

  .error {
    color: #ff4d4d;
    font-size: 0.875rem;
    margin: 0;
  }
</style>
