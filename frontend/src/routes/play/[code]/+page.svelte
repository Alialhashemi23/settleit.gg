<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { connect } from "$lib/socket";
  import {
    roomCode, players, currentQuestion, voteCounts, freetextResponses,
    hasVoted, questionEnded, hostDisconnected, roomEnded, resetQuestionState,
    questionHistory, gameMode, myPlayerId, turnOrder, activePlayerId,
  } from "$lib/stores";
  import QuestionPicker from "$lib/QuestionPicker.svelte";

  const code = $page.params.code;
  let socket = connect();
  let selectedOption: string | null = $state(null);
  let freetextInput = $state("");
  let submitted = $state(false);
  let hostWaitSeconds = $state(0);
  let hostTimer: ReturnType<typeof setInterval> | null = null;
  let notInRoom = $state(false);
  let connectionLost = $state(false);
  let showPicker = $state(false);
  let showReveal = $state(false);
  let revealTimeout: ReturnType<typeof setTimeout> | null = null;

  let isMyTurn = $derived($gameMode === "player-turns" && $activePlayerId !== null && $activePlayerId === $myPlayerId);
  let activeTurnNickname = $derived($turnOrder.find(p => p.id === $activePlayerId)?.nickname ?? "");

  onMount(() => {
    if (!get(roomCode)) {
      notInRoom = true;
      return;
    }

    socket.on("connect_error", () => { connectionLost = true; });
    socket.on("disconnect", () => { connectionLost = true; });
    socket.on("connect", () => { connectionLost = false; });
    socket.on("room:updated", ({ players: pl }: any) => players.set(pl));

    socket.on("game:started", ({ turnOrder: order, activePlayerId: apId }: any) => {
      turnOrder.set(order);
      activePlayerId.set(apId);
      showReveal = true;
      revealTimeout = setTimeout(() => {
        showReveal = false;
        if (apId === get(myPlayerId)) showPicker = true;
      }, 2500);
    });

    socket.on("turn:changed", ({ activePlayerId: apId }: any) => {
      activePlayerId.set(apId);
      if (apId === get(myPlayerId)) {
        showPicker = true;
      }
    });

    socket.on("question:new", ({ question }: any) => {
      currentQuestion.set(question);
      voteCounts.set(question.options ? Object.fromEntries(question.options.map((o: string) => [o, 0])) : {});
      freetextResponses.set([]);
      hasVoted.set(false);
      questionEnded.set(false);
      selectedOption = null;
      freetextInput = "";
      submitted = false;
      showPicker = false;
    });

    socket.on("response:update", ({ counts, responses }: any) => {
      if (counts && Object.keys(counts).length) voteCounts.set(counts);
      if (responses?.length) freetextResponses.set(responses);
    });

    socket.on("question:ended", ({ final }: any) => {
      questionEnded.set(true);
      if (final.counts) voteCounts.set(final.counts);
      if (final.responses) freetextResponses.set(final.responses);
      const q = get(currentQuestion);
      if (q) {
        questionHistory.update(h => [...h, {
          question: q,
          counts: final.counts,
          responses: final.responses,
        }]);
      }
    });

    socket.on("host:disconnected", ({ deadline }: { deadline: number }) => {
      hostDisconnected.set({ deadline });
      hostWaitSeconds = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      hostTimer = setInterval(() => {
        hostWaitSeconds = Math.max(0, Math.round((deadline - Date.now()) / 1000));
        if (hostWaitSeconds <= 0 && hostTimer) clearInterval(hostTimer);
      }, 1000);
    });

    socket.on("room:ended", () => {
      roomEnded.set(true);
      if (hostTimer) clearInterval(hostTimer);
      goto("/summary");
    });
  });

  onDestroy(() => {
    if (revealTimeout) clearTimeout(revealTimeout);
    socket.off("connect_error");
    socket.off("disconnect");
    socket.off("connect");
    socket.off("room:updated");
    socket.off("game:started");
    socket.off("turn:changed");
    socket.off("question:new");
    socket.off("response:update");
    socket.off("question:ended");
    socket.off("host:disconnected");
    socket.off("room:ended");
    if (hostTimer) clearInterval(hostTimer);
  });

  function vote(option: string) {
    if ($hasVoted || !$currentQuestion) return;
    selectedOption = option;
    hasVoted.set(true);
    socket.emit("response:submit", { questionId: $currentQuestion.id, value: option });
  }

  function submitFreetext() {
    if (submitted || !freetextInput.trim() || !$currentQuestion) return;
    submitted = true;
    socket.emit("response:submit", { questionId: $currentQuestion.id, value: freetextInput.trim() });
  }

  let totalVotes = $derived(Object.values($voteCounts).reduce((a, b) => a + b, 0));
  let charCount = $derived(freetextInput.length);
</script>

<!-- Turn order reveal overlay -->
{#if showReveal}
  <div class="reveal-overlay">
    <div class="reveal-card">
      <div class="reveal-title">🎲 Player Turns!</div>
      <div class="reveal-subtitle">Turn order</div>
      <ol class="reveal-list">
        {#each $turnOrder as player, i}
          <li class="reveal-item {player.id === $myPlayerId ? 'me' : ''}">
            <span class="reveal-num">{i + 1}</span>
            <span class="reveal-name">{player.nickname}</span>
            {#if player.id === $myPlayerId}<span class="reveal-you">YOU</span>{/if}
          </li>
        {/each}
      </ol>
    </div>
  </div>
{/if}

<!-- Active player's question picker modal -->
{#if showPicker && isMyTurn && !$currentQuestion}
  <div class="modal-backdrop">
    <div class="modal">
      <div class="your-turn-banner">🎤 It's your turn to ask!</div>
      <QuestionPicker {socket} onPushed={() => showPicker = false} />
    </div>
  </div>
{/if}

<main>
  {#if notInRoom}
    <div class="error-screen">
      <p>You're not in a room.</p>
      <a href="/" class="btn-primary">Go home</a>
    </div>
  {:else}
    <div class="room-header">
      <div class="room-code">{code}</div>
      {#if $gameMode === "player-turns" && $turnOrder.length > 0 && !$currentQuestion}
        <div class="turn-indicator">
          {isMyTurn ? "Your turn to ask" : `${activeTurnNickname}'s turn`}
        </div>
      {/if}
    </div>

    {#if connectionLost}
      <div class="banner banner-error">Connection lost — trying to reconnect...</div>
    {/if}

    {#if $hostDisconnected && !$roomEnded}
      <div class="banner banner-warn">
        Host disconnected — waiting for reconnect ({hostWaitSeconds}s)
      </div>
    {/if}

    {#if !$currentQuestion || $questionEnded}
      <section class="waiting">
        {#if $questionEnded && $currentQuestion}
          <h2>Round over!</h2>
          {#if $currentQuestion.type === "vote"}
            <div class="results">
              {#each Object.entries($voteCounts).sort(([,a],[,b]) => b - a) as [opt, count]}
                {@const pct = Math.round((count / Math.max(1, totalVotes)) * 100)}
                <div class="result-bar">
                  <span class="result-label">{opt}</span>
                  <div class="bar-track">
                    <div class="bar-fill" style="width:{pct}%"></div>
                  </div>
                  <span class="pct">{pct}%</span>
                </div>
              {/each}
            </div>
          {:else}
            <div class="freetext-results">
              {#each $freetextResponses as r}
                <div class="freetext-item">{r}</div>
              {/each}
            </div>
          {/if}
          <p class="next-hint">Waiting for host to continue...</p>
        {:else if $gameMode === "player-turns" && $turnOrder.length > 0}
          {#if isMyTurn}
            <div class="your-turn-msg">
              <div>It's your turn!</div>
              <button class="btn-primary" onclick={() => showPicker = true}>Ask a Question</button>
            </div>
          {:else}
            <div class="waiting-msg">
              <div class="pulse-dot"></div>
              Waiting for <strong>{activeTurnNickname}</strong> to ask...
            </div>
            <ul class="player-list">
              {#each $players as player (player.id)}
                <li class="{player.id === $activePlayerId ? 'active-turn' : ''}">{player.nickname}</li>
              {/each}
            </ul>
          {/if}
        {:else}
          <div class="waiting-msg">
            <div class="pulse-dot"></div>
            Waiting for the next question...
          </div>
          <ul class="player-list">
            {#each $players as player (player.id)}
              <li>{player.nickname}</li>
            {/each}
          </ul>
        {/if}
      </section>

    {:else}
      <section class="question">
        <h2>{$currentQuestion.prompt}</h2>

        {#if $currentQuestion.type === "vote"}
          {#if !$hasVoted}
            <div class="options">
              {#each ($currentQuestion.options ?? []) as option}
                <button class="option-btn" onclick={() => vote(option)}>
                  {option}
                </button>
              {/each}
            </div>
          {:else}
            <p class="voted-msg">Voted for <strong>{selectedOption}</strong></p>
            <div class="live-counts">
              {#each Object.entries($voteCounts) as [opt, count]}
                {@const pct = Math.round((count / Math.max(1, totalVotes)) * 100)}
                <div class="bar-row">
                  <span class="bar-label {opt === selectedOption ? 'chosen' : ''}">{opt}</span>
                  <div class="bar-track">
                    <div class="bar-fill" style="width:{pct}%"></div>
                  </div>
                  <span class="bar-count">{count}</span>
                </div>
              {/each}
            </div>
          {/if}

        {:else}
          {#if !submitted}
            <form onsubmit={(e) => { e.preventDefault(); submitFreetext(); }} class="freetext-form">
              <div class="textarea-wrap">
                <textarea
                  bind:value={freetextInput}
                  placeholder="Type your answer..."
                  maxlength="300"
                  rows="4"
                ></textarea>
                <span class="char-count {charCount > 270 ? 'near-limit' : ''}">{charCount}/300</span>
              </div>
              <button class="btn-primary" type="submit" disabled={!freetextInput.trim()}>Submit</button>
            </form>
          {:else}
            <p class="voted-msg">Answer submitted!</p>
            <div class="freetext-live">
              {#each $freetextResponses as r}
                <div class="freetext-item">{r}</div>
              {/each}
              {#if $freetextResponses.length <= 1}
                <p class="others-hint">Other answers will appear here as people submit...</p>
              {/if}
            </div>
          {/if}
        {/if}
      </section>
    {/if}
  {/if}
</main>

<style>
  main {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 1.25rem;
    max-width: 480px;
    margin: 0 auto;
  }

  .error-screen {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
    color: #888;
  }

  .room-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .room-code {
    font-size: 1.1rem;
    font-weight: 700;
    color: #ff4d00;
    letter-spacing: 0.08em;
  }

  .turn-indicator {
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.25rem 0.6rem;
    border-radius: 2rem;
    background: #1a1a1a;
    color: #ff4d00;
    border: 1px solid #333;
  }

  .banner {
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    font-size: 0.875rem;
    text-align: center;
  }

  .banner-warn { background: #2a1500; border: 1px solid #ff4d00; color: #ffaa77; }
  .banner-error { background: #1a0a0a; border: 1px solid #8b0000; color: #ff6b6b; }

  .waiting {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
  }

  .waiting-msg {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: #888;
    font-size: 1rem;
  }

  .your-turn-msg {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    font-size: 1.25rem;
    font-weight: 700;
    color: #ff4d00;
  }

  .pulse-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ff4d00;
    flex-shrink: 0;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.8); }
  }

  .player-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
  }

  .player-list li {
    background: #1e1e1e;
    padding: 0.35rem 0.8rem;
    border-radius: 2rem;
    font-size: 0.8rem;
    color: #aaa;
  }

  .player-list li.active-turn {
    background: #2a1500;
    border: 1px solid #ff4d00;
    color: #ff4d00;
  }

  .next-hint, .others-hint {
    color: #555;
    font-size: 0.8rem;
    text-align: center;
    margin: 0;
    font-style: italic;
  }

  .question { flex: 1; display: flex; flex-direction: column; padding-top: 0.5rem; }

  h2 { font-size: 1.6rem; font-weight: 800; margin: 0 0 1.5rem; line-height: 1.3; }

  .options { display: flex; flex-direction: column; gap: 0.75rem; }

  .option-btn {
    padding: 1.25rem 1rem;
    border-radius: 0.75rem;
    border: 2px solid #2a2a2a;
    background: #111;
    color: #fff;
    font-size: 1.1rem;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s, background 0.15s, transform 0.1s;
    min-height: 4rem;
    width: 100%;
  }

  .option-btn:hover { border-color: #ff4d00; background: #1a0800; }
  .option-btn:active { transform: scale(0.98); }

  .voted-msg { color: #aaa; font-size: 0.95rem; margin: 0 0 1.25rem; }

  .live-counts, .results { display: flex; flex-direction: column; gap: 0.6rem; margin-bottom: 1.5rem; }

  .bar-row, .result-bar {
    display: grid;
    grid-template-columns: 1fr 2fr 2.5rem;
    align-items: center;
    gap: 0.6rem;
  }

  .bar-label, .result-label {
    font-size: 0.9rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar-label.chosen { color: #ff4d00; }

  .bar-track { background: #1e1e1e; border-radius: 0.25rem; height: 1.75rem; overflow: hidden; }

  .bar-fill {
    height: 100%;
    background: #ff4d00;
    border-radius: 0.25rem;
    transition: width 0.35s ease;
  }

  .bar-count, .pct { font-size: 0.8rem; color: #888; text-align: right; }

  .freetext-form { display: flex; flex-direction: column; gap: 0.75rem; }

  .textarea-wrap { position: relative; }

  textarea {
    width: 100%;
    padding: 0.85rem 1rem 2rem;
    border-radius: 0.5rem;
    border: 2px solid #333;
    background: #1a1a1a;
    color: #fff;
    font-size: 1rem;
    resize: none;
    outline: none;
    font-family: inherit;
    box-sizing: border-box;
  }

  textarea:focus { border-color: #ff4d00; }

  .char-count {
    position: absolute;
    bottom: 0.5rem;
    right: 0.75rem;
    font-size: 0.7rem;
    color: #555;
    pointer-events: none;
  }

  .char-count.near-limit { color: #ff4d4d; }

  .btn-primary {
    padding: 1rem;
    border-radius: 0.5rem;
    border: none;
    background: #ff4d00;
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    width: 100%;
    transition: opacity 0.15s;
  }

  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

  .freetext-live, .freetext-results { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; }

  .freetext-item {
    background: #1e1e1e;
    padding: 0.65rem 0.9rem;
    border-radius: 0.5rem;
    font-size: 0.95rem;
    animation: slideIn 0.2s ease;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  a.btn-primary {
    display: inline-block;
    text-decoration: none;
    text-align: center;
  }

  /* Picker modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }

  .modal {
    background: #111;
    border: 1px solid #222;
    border-radius: 1rem;
    padding: 1.5rem;
    width: 100%;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-height: 85vh;
    overflow-y: auto;
  }

  .your-turn-banner {
    font-size: 1.1rem;
    font-weight: 700;
    color: #ff4d00;
    text-align: center;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #222;
  }

  /* Turn reveal overlay */
  .reveal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    animation: fadeIn 0.3s ease;
  }

  .reveal-card {
    background: #111;
    border: 2px solid #ff4d00;
    border-radius: 1.25rem;
    padding: 2rem;
    width: 100%;
    max-width: 320px;
    text-align: center;
  }

  .reveal-title { font-size: 1.75rem; font-weight: 900; margin-bottom: 0.5rem; }
  .reveal-subtitle { color: #888; font-size: 0.875rem; margin-bottom: 1.25rem; text-transform: uppercase; letter-spacing: 0.08em; }

  .reveal-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    text-align: left;
  }

  .reveal-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: #1a1a1a;
  }

  .reveal-item.me { background: #2a1500; border: 1px solid #ff4d00; }

  .reveal-num { color: #555; font-size: 0.8rem; width: 1.25rem; }
  .reveal-name { flex: 1; font-weight: 600; }
  .reveal-you { font-size: 0.7rem; font-weight: 700; color: #ff4d00; text-transform: uppercase; letter-spacing: 0.05em; }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
