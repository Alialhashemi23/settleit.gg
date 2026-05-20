<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { connect } from "$lib/socket";
  import {
    players, currentQuestion, voteCounts, freetextResponses,
    questionEnded, hostDisconnected, roomEnded, resetQuestionState,
    questionHistory, gameMode, myPlayerId, turnOrder, activePlayerId,
  } from "$lib/stores";
  import QuestionPicker from "$lib/QuestionPicker.svelte";

  const code = $page.params.code;

  let socket = connect();
  let connectionLost = $state(false);
  let showPicker = $state(false);
  let showHistory = $state(false);
  let showReveal = $state(false);
  let revealTimeout: ReturnType<typeof setTimeout> | null = null;

  let totalPlayers = $derived($players.length);
  let totalVotes = $derived(Object.values($voteCounts).reduce((a, b) => a + b, 0));
  let isMyTurn = $derived($gameMode === "player-turns" && $activePlayerId !== null && $activePlayerId === $myPlayerId);
  let activeTurnNickname = $derived(
    $turnOrder.find(p => p.id === $activePlayerId)?.nickname ?? ""
  );

  onMount(() => {
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

    socket.on("turn:changed", ({ activePlayerId: apId, activeNickname }: any) => {
      activePlayerId.set(apId);
      if (apId === get(myPlayerId)) {
        showPicker = true;
      }
    });

    socket.on("question:new", ({ question }: any) => {
      currentQuestion.set(question);
      voteCounts.set(question.options ? Object.fromEntries(question.options.map((o: string) => [o, 0])) : {});
      freetextResponses.set([]);
      questionEnded.set(false);
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
    socket.on("host:disconnected", () => {});
    socket.on("room:ended", () => {
      roomEnded.set(true);
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
    socket.off("room:ended");
  });

  function startGame() {
    socket.emit("game:start");
  }

  function nextQuestion() {
    socket.emit("question:next");
    resetQuestionState();
  }

  function endRoom() {
    socket.emit("room:end");
    goto("/summary");
  }

  function openPicker() {
    showPicker = true;
  }
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

<main>
  <header>
    <div class="header-code">{code}</div>
    <div class="player-count">{totalPlayers} player{totalPlayers !== 1 ? "s" : ""}</div>
    {#if $gameMode === "player-turns" && $turnOrder.length > 0}
      <div class="turn-badge">
        {isMyTurn ? "Your turn to ask" : `${activeTurnNickname}'s turn`}
      </div>
    {/if}
    <button class="btn-danger-sm" onclick={endRoom}>End Room</button>
  </header>

  {#if connectionLost}
    <div class="banner-error">Connection lost — trying to reconnect...</div>
  {/if}

  <div class="content">
    {#if !$currentQuestion || $questionEnded}
      <section class="lobby">
        <div class="code-card">
          <div class="code-label">Room Code</div>
          <div class="code-big">{code}</div>
          <div class="code-url">settleit.gg</div>
        </div>

        <ul class="player-list">
          {#each $players as player (player.id)}
            <li class="{$gameMode === 'player-turns' && $turnOrder.length > 0 && player.id === $activePlayerId ? 'active-turn' : ''}">
              {player.nickname}
            </li>
          {/each}
          {#if $players.length === 0}
            <li class="empty">No players yet — share the code above</li>
          {/if}
        </ul>

        {#if $questionEnded && $currentQuestion}
          <div class="result-summary">
            <h3>Results: {$currentQuestion.prompt}</h3>
            {#if $currentQuestion.type === "vote"}
              {#each Object.entries($voteCounts) as [opt, count]}
                <div class="result-row">
                  <span>{opt}</span>
                  <span class="count">{count} vote{count !== 1 ? "s" : ""}</span>
                </div>
              {/each}
            {:else}
              {#each $freetextResponses as r}
                <div class="result-row"><span>{r}</span></div>
              {/each}
            {/if}
          </div>
        {/if}

        {#if $gameMode === "host-picks"}
          <button class="btn-primary" onclick={openPicker}>Ask a Question</button>
        {:else if $turnOrder.length === 0}
          <button class="btn-primary" onclick={startGame} disabled={$players.length < 2}>
            {$players.length < 2 ? "Need 2+ players" : "Start Game"}
          </button>
        {:else if isMyTurn}
          <button class="btn-primary" onclick={openPicker}>Ask Your Question</button>
        {:else}
          <p class="waiting-turn">Waiting for <strong>{activeTurnNickname}</strong> to ask a question...</p>
        {/if}
      </section>

      {#if showPicker}
        <div class="modal-backdrop" onclick={(e) => { if (e.target === e.currentTarget) showPicker = false; }}>
          <div class="modal">
            <div class="modal-header">
              <h3>{$gameMode === "player-turns" ? "Your Question" : "New Question"}</h3>
            </div>
            <QuestionPicker {socket} onPushed={() => showPicker = false} />
          </div>
        </div>
      {/if}

    {:else}
      <section class="active-question">
        <div class="question-layout">
          <div class="question-left">
            <div class="question-type-badge {$currentQuestion.type}">
              {$currentQuestion.type === "vote" ? "Vote" : "Hot Take"}
            </div>
            <h2>{$currentQuestion.prompt}</h2>
            <p class="vote-tally">{totalVotes} / {totalPlayers} responded</p>
            <button class="btn-primary" onclick={nextQuestion}>Next Question</button>
          </div>

          <div class="question-right">
            {#if $currentQuestion.type === "vote"}
              <div class="bars">
                {#each Object.entries($voteCounts) as [opt, count]}
                  {@const pct = Math.round((count / Math.max(1, totalVotes)) * 100)}
                  <div class="bar-row">
                    <span class="bar-label">{opt}</span>
                    <div class="bar-track">
                      <div class="bar-fill" style="width: {pct}%"></div>
                    </div>
                    <span class="bar-count">{count}</span>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="freetext-list">
                {#each $freetextResponses as r}
                  <div class="freetext-item">{r}</div>
                {/each}
                {#if $freetextResponses.length === 0}
                  <p class="empty">Waiting for answers...</p>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      </section>
    {/if}

    {#if $questionHistory.length > 0}
      <section class="history">
        <button class="history-toggle" onclick={() => showHistory = !showHistory}>
          Session History ({$questionHistory.length}) {showHistory ? "▲" : "▼"}
        </button>
        {#if showHistory}
          <div class="history-list">
            {#each $questionHistory as entry, i}
              <div class="history-entry">
                <div class="history-q">Q{i + 1}: {entry.question.prompt}</div>
                {#if entry.question.type === "vote" && entry.counts}
                  {#each Object.entries(entry.counts) as [opt, count]}
                    <div class="history-row"><span>{opt}</span><span class="count">{count}</span></div>
                  {/each}
                {:else if entry.responses}
                  {#each entry.responses as r}
                    <div class="history-row"><span>{r}</span></div>
                  {/each}
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/if}
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
    max-width: 900px;
    margin: 0 auto;
  }

  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
    flex-wrap: wrap;
  }

  .header-code {
    font-size: 1.1rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    color: #ff4d00;
    flex: 1;
  }

  .player-count { color: #888; font-size: 0.875rem; }

  .turn-badge {
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.3rem 0.7rem;
    border-radius: 2rem;
    background: #1a1a1a;
    color: #ff4d00;
    border: 1px solid #333;
  }

  .banner-error {
    background: #1a0a0a;
    border: 1px solid #8b0000;
    border-radius: 0.5rem;
    padding: 0.6rem 1rem;
    margin-bottom: 1rem;
    font-size: 0.875rem;
    color: #ff6b6b;
    text-align: center;
  }

  .content { flex: 1; }

  /* Room code card */
  .code-card {
    background: #0f0f0f;
    border: 2px solid #ff4d00;
    border-radius: 1rem;
    padding: 1.25rem 2rem;
    text-align: center;
    margin-bottom: 1.25rem;
  }

  .code-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.12em; color: #666; margin-bottom: 0.4rem; }
  .code-big { font-size: 3.5rem; font-weight: 900; letter-spacing: 0.15em; color: #ff4d00; line-height: 1; }
  .code-url { font-size: 0.8rem; color: #444; margin-top: 0.4rem; }

  .player-list {
    list-style: none;
    padding: 0;
    margin: 0 0 1.5rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .player-list li {
    background: #1e1e1e;
    padding: 0.4rem 0.9rem;
    border-radius: 2rem;
    font-size: 0.875rem;
    transition: background 0.15s;
  }

  .player-list li.active-turn {
    background: #2a1500;
    border: 1px solid #ff4d00;
    color: #ff4d00;
  }

  .empty { color: #555; font-style: italic; }

  .waiting-turn { color: #888; font-size: 0.95rem; margin: 0; }

  .result-summary {
    background: #111;
    border-radius: 0.75rem;
    padding: 1rem 1.25rem;
    margin-bottom: 1.5rem;
  }

  .result-summary h3 { margin: 0 0 0.75rem; font-size: 1rem; color: #aaa; }

  .result-row {
    display: flex;
    justify-content: space-between;
    padding: 0.25rem 0;
    border-bottom: 1px solid #1e1e1e;
  }

  .count { color: #888; }

  /* Two-column active question layout */
  .question-layout {
    display: grid;
    grid-template-columns: 1fr 1.4fr;
    gap: 2rem;
    align-items: start;
  }

  @media (max-width: 640px) {
    .question-layout { grid-template-columns: 1fr; }
    .code-big { font-size: 2.5rem; }
  }

  .question-left { display: flex; flex-direction: column; gap: 0.75rem; }
  .question-right { display: flex; flex-direction: column; }

  .active-question h2 { font-size: 1.75rem; margin: 0; line-height: 1.3; }

  .question-type-badge {
    display: inline-block;
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.2rem 0.6rem;
    border-radius: 0.25rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    align-self: flex-start;
  }

  .question-type-badge.vote { background: #1a3a1a; color: #5dde5d; }
  .question-type-badge.freetext { background: #1a1a3a; color: #7d9fff; }

  .vote-tally { color: #888; margin: 0; }

  .bars { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1rem; }

  .bar-row {
    display: grid;
    grid-template-columns: 8rem 1fr 3rem;
    align-items: center;
    gap: 0.75rem;
  }

  .bar-label { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .bar-track { background: #222; border-radius: 0.25rem; height: 2rem; overflow: hidden; }

  .bar-fill {
    height: 100%;
    background: #ff4d00;
    border-radius: 0.25rem;
    transition: width 0.3s ease;
  }

  .bar-count { text-align: right; font-weight: 700; color: #ccc; }

  .freetext-list { display: flex; flex-direction: column; gap: 0.5rem; }

  .freetext-item {
    background: #1e1e1e;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    animation: slideIn 0.2s ease;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* History */
  .history { margin-top: 2rem; border-top: 1px solid #222; padding-top: 1rem; }

  .history-toggle {
    background: none;
    border: none;
    color: #888;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
  }

  .history-toggle:hover { color: #ccc; }

  .history-list { display: flex; flex-direction: column; gap: 1rem; margin-top: 1rem; }

  .history-entry { background: #111; border-radius: 0.5rem; padding: 0.75rem 1rem; }

  .history-q { font-size: 0.875rem; font-weight: 700; color: #aaa; margin-bottom: 0.5rem; }

  .history-row {
    display: flex;
    justify-content: space-between;
    padding: 0.2rem 0;
    font-size: 0.8rem;
    border-bottom: 1px solid #1e1e1e;
    color: #ccc;
  }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
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

  .modal-header h3 { margin: 0; font-size: 1.25rem; }

  .btn-primary {
    padding: 0.85rem;
    border-radius: 0.5rem;
    border: none;
    background: #ff4d00;
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
  }

  .btn-primary:hover { opacity: 0.9; }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

  .btn-danger-sm {
    padding: 0.4rem 0.75rem;
    border-radius: 0.4rem;
    border: 1px solid #8b0000;
    background: transparent;
    color: #ff4d4d;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .btn-danger-sm:hover { background: #8b0000; }

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
    max-width: 360px;
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
