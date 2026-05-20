<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { connect } from "$lib/socket";
  import {
    players, currentQuestion, liveVotes, totalPlayers,
    myVote, questionEnded, roomEnded, resetQuestionState,
    questionHistory, countdown, myPlayerId, turnOrder, activePlayerId,
  } from "$lib/stores";
  import QuestionPicker from "$lib/QuestionPicker.svelte";

  const code = $page.params.code;
  let socket = connect();
  let connectionLost = $state(false);
  let showPicker = $state(false);
  let showHistory = $state(false);
  let showReveal = $state(false);
  let revealTimeout: ReturnType<typeof setTimeout> | null = null;
  let countdownSeconds = $state(0);
  let countdownInterval: ReturnType<typeof setInterval> | null = null;

  let isMyTurn = $derived($activePlayerId !== null && $activePlayerId === $myPlayerId);
  let activeTurnNickname = $derived($turnOrder.find(p => p.id === $activePlayerId)?.nickname ?? "");

  let votesByOption = $derived(
    ($currentQuestion?.options ?? []).map(opt => ({
      option: opt,
      voters: $liveVotes.filter(v => v.value === opt),
      count: $liveVotes.filter(v => v.value === opt).length,
    }))
  );

  let agreedCount = $derived(
    $currentQuestion
      ? Math.max(...($currentQuestion.options ?? []).map(opt => $liveVotes.filter(v => v.value === opt).length))
      : 0
  );

  function startCountdownTick(deadline: number) {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownSeconds = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    countdownInterval = setInterval(() => {
      countdownSeconds = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      if (countdownSeconds <= 0 && countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }, 200);
  }

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

    socket.on("turn:changed", ({ activePlayerId: apId }: any) => {
      activePlayerId.set(apId);
      if (apId === get(myPlayerId)) showPicker = true;
    });

    socket.on("question:new", ({ question }: any) => {
      currentQuestion.set(question);
      liveVotes.set([]);
      totalPlayers.set(get(players).length);
      myVote.set(null);
      questionEnded.set(false);
      countdown.set(null);
      showPicker = false;
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    });

    socket.on("response:update", ({ votes, totalPlayers: tp }: any) => {
      liveVotes.set(votes);
      totalPlayers.set(tp);
      const pid = get(myPlayerId);
      const mine = votes.find((v: any) => v.playerId === pid);
      if (mine) myVote.set(mine.value);
    });

    socket.on("question:countdown", ({ deadline, leadingOption }: any) => {
      countdown.set({ deadline, leadingOption });
      startCountdownTick(deadline);
    });

    socket.on("question:countdown:cancelled", () => {
      countdown.set(null);
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    });

    socket.on("question:ended", ({ settledOption }: any) => {
      questionEnded.set(true);
      countdown.set(null);
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
      const q = get(currentQuestion);
      if (q) {
        questionHistory.update(h => [...h, {
          question: q,
          settledOption: settledOption ?? null,
          votes: get(liveVotes),
        }]);
      }
    });

    socket.on("room:ended", () => {
      roomEnded.set(true);
      goto("/summary");
    });
  });

  onDestroy(() => {
    if (revealTimeout) clearTimeout(revealTimeout);
    if (countdownInterval) clearInterval(countdownInterval);
    ["connect_error","disconnect","connect","room:updated","game:started","turn:changed",
     "question:new","response:update","question:countdown","question:countdown:cancelled",
     "question:ended","room:ended"].forEach(e => socket.off(e));
  });

  function startGame() { socket.emit("game:start"); }

  function castVote(option: string) {
    if (!$currentQuestion) return;
    myVote.set(option);
    socket.emit("response:submit", { questionId: $currentQuestion.id, value: option });
  }

  function forceSettle() {
    socket.emit("question:next");
    resetQuestionState();
  }

  function endRoom() {
    socket.emit("room:end");
    goto("/summary");
  }
</script>

<!-- Turn reveal overlay -->
{#if showReveal}
  <div class="overlay">
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

<!-- Your turn picker modal -->
{#if showPicker && isMyTurn && !$currentQuestion}
  <div class="modal-backdrop">
    <div class="modal">
      <div class="your-turn-banner">🎤 Your turn — ask something</div>
      <QuestionPicker {socket} onPushed={() => showPicker = false} />
    </div>
  </div>
{/if}

<main>
  <header>
    <div class="header-code">{code}</div>
    {#if $turnOrder.length > 0 && !$currentQuestion && !$questionEnded}
      <span class="turn-pill">{isMyTurn ? "Your turn" : `${activeTurnNickname}'s turn`}</span>
    {/if}
    <div class="header-right">
      <span class="player-count">{$players.length} player{$players.length !== 1 ? "s" : ""}</span>
      <button class="btn-danger-sm" onclick={endRoom}>End Room</button>
    </div>
  </header>

  {#if connectionLost}
    <div class="banner error">Connection lost — trying to reconnect...</div>
  {/if}

  <!-- Countdown bar -->
  {#if $countdown}
    {@const pct = Math.round((countdownSeconds / 10) * 100)}
    <div class="countdown-bar-wrap">
      <div class="countdown-bar" style="width:{pct}%"></div>
      <span class="countdown-text">
        Settling on <strong>{$countdown.leadingOption}</strong> in {countdownSeconds}s
      </span>
    </div>
  {/if}

  <div class="content">
    {#if !$currentQuestion || $questionEnded}
      <section class="lobby">
        <!-- Big code card -->
        <div class="code-card">
          <div class="code-label">Room Code</div>
          <div class="code-big">{code}</div>
          <div class="code-url">settleit.gg</div>
        </div>

        <ul class="player-chips">
          {#each $players as player (player.id)}
            <li class="{$turnOrder.length > 0 && player.id === $activePlayerId ? 'active' : ''}">
              {player.nickname}
            </li>
          {/each}
          {#if $players.length === 0}
            <li class="empty">No players yet — share the code above</li>
          {/if}
        </ul>

        {#if $questionEnded}
          <div class="settled-banner">✅ Settled!</div>
        {/if}

        {#if $turnOrder.length === 0}
          <button class="btn-primary" onclick={startGame} disabled={$players.length < 2}>
            {$players.length < 2 ? "Need 2+ players" : "Start Game"}
          </button>
        {:else if isMyTurn}
          <button class="btn-primary" onclick={() => showPicker = true}>Ask Your Question</button>
        {:else}
          <p class="waiting-turn">Waiting for <strong>{activeTurnNickname}</strong> to ask...</p>
        {/if}
      </section>

    {:else}
      <!-- Active question — two column on desktop -->
      <section class="active-question">
        <div class="question-layout">
          <div class="question-left">
            <h2>{$currentQuestion.prompt}</h2>
            <p class="tally">{$liveVotes.length}/{$players.length} voted · {agreedCount} agreed</p>

            {#if !$myVote}
              <div class="host-vote-section">
                <p class="host-vote-label">Cast your vote</p>
                <div class="host-options">
                  {#each ($currentQuestion.options ?? []) as option}
                    <button class="host-option-btn" onclick={() => castVote(option)}>{option}</button>
                  {/each}
                </div>
              </div>
            {:else}
              <p class="voted-conf">Voted: <strong>{$myVote}</strong> · <button class="btn-link" onclick={() => myVote.set(null)}>change</button></p>
              {#if $myVote}
                <div class="host-options-sm">
                  {#each ($currentQuestion.options ?? []) as option}
                    <button class="host-option-btn-sm {option === $myVote ? 'chosen' : ''}" onclick={() => castVote(option)}>{option}</button>
                  {/each}
                </div>
              {/if}
            {/if}

            {#if isMyTurn}
              <button class="btn-force-settle" onclick={forceSettle}>Force Settle</button>
            {/if}
          </div>

          <div class="question-right">
            <div class="options-live">
              {#each votesByOption as { option, voters, count }}
                {@const pct = $players.length > 0 ? Math.round((count / $players.length) * 100) : 0}
                <div class="option-row {$myVote === option ? 'mine' : ''}">
                  <div class="option-row-top">
                    <span class="option-name">{option}</span>
                    <span class="option-count">{count}</span>
                  </div>
                  <div class="bar-track">
                    <div class="bar-fill" style="width:{pct}%"></div>
                  </div>
                  {#if voters.length > 0}
                    <div class="voter-names">
                      {#each voters as v}
                        <span class="voter-chip {v.playerId === $myPlayerId ? 'me' : ''}">{v.nickname}</span>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        </div>
      </section>
    {/if}

    <!-- Session history -->
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
                {#if entry.settledOption}
                  <div class="history-settled">Settled: {entry.settledOption}</div>
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
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .header-code { font-size: 1.1rem; font-weight: 900; letter-spacing: 0.1em; color: #ff4d00; flex: 1; }

  .turn-pill {
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.3rem 0.7rem;
    border-radius: 2rem;
    background: #1a1a1a;
    color: #ff4d00;
    border: 1px solid #333;
  }

  .header-right { display: flex; align-items: center; gap: 0.75rem; }
  .player-count { color: #888; font-size: 0.875rem; }

  .banner.error { background: #1a0a0a; border: 1px solid #8b0000; border-radius: 0.5rem; padding: 0.6rem 1rem; margin-bottom: 1rem; font-size: 0.875rem; color: #ff6b6b; text-align: center; }

  /* Countdown */
  .countdown-bar-wrap {
    position: relative;
    background: #111;
    border: 1px solid #ff4d00;
    border-radius: 0.5rem;
    overflow: hidden;
    margin-bottom: 1rem;
    padding: 0.6rem 0.9rem;
  }

  .countdown-bar {
    position: absolute;
    inset: 0;
    background: rgba(255, 77, 0, 0.15);
    transition: width 0.2s linear;
    pointer-events: none;
  }

  .countdown-text { position: relative; font-size: 0.875rem; color: #ffaa77; }

  /* Code card */
  .code-card { background: #0f0f0f; border: 2px solid #ff4d00; border-radius: 1rem; padding: 1.25rem 2rem; text-align: center; margin-bottom: 1.25rem; }
  .code-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.12em; color: #666; margin-bottom: 0.4rem; }
  .code-big { font-size: 3.5rem; font-weight: 900; letter-spacing: 0.15em; color: #ff4d00; line-height: 1; }
  .code-url { font-size: 0.8rem; color: #444; margin-top: 0.4rem; }

  .content { flex: 1; }

  .lobby { display: flex; flex-direction: column; align-items: center; gap: 1rem; }

  .player-chips { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; }
  .player-chips li { background: #1e1e1e; padding: 0.4rem 0.9rem; border-radius: 2rem; font-size: 0.875rem; }
  .player-chips li.active { background: #2a1500; border: 1px solid #ff4d00; color: #ff4d00; }
  .player-chips li.empty { color: #555; font-style: italic; }

  .settled-banner { font-size: 1.25rem; font-weight: 800; color: #5dde5d; }
  .waiting-turn { color: #888; font-size: 0.95rem; margin: 0; }

  /* Active question two-column */
  .question-layout { display: grid; grid-template-columns: 1fr 1.4fr; gap: 2rem; align-items: start; }

  @media (max-width: 640px) {
    .question-layout { grid-template-columns: 1fr; }
    .code-big { font-size: 2.5rem; }
  }

  .question-left { display: flex; flex-direction: column; gap: 0.85rem; }
  .question-right { display: flex; flex-direction: column; }

  h2 { font-size: 1.6rem; font-weight: 800; margin: 0; line-height: 1.3; }
  .tally { color: #666; font-size: 0.875rem; margin: 0; }

  .host-vote-section { display: flex; flex-direction: column; gap: 0.5rem; }
  .host-vote-label { font-size: 0.75rem; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.06em; margin: 0; }

  .host-options { display: flex; flex-direction: column; gap: 0.4rem; }

  .host-option-btn {
    padding: 0.55rem 0.85rem;
    border-radius: 0.5rem;
    border: 1px solid #333;
    background: #1a1a1a;
    color: #fff;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
  }

  .host-option-btn:hover { border-color: #ff4d00; background: #1f0d00; }

  .voted-conf { color: #888; font-size: 0.875rem; margin: 0; }
  .btn-link { background: none; border: none; color: #ff4d00; font-size: 0.875rem; cursor: pointer; padding: 0; text-decoration: underline; }

  .host-options-sm { display: flex; flex-wrap: wrap; gap: 0.35rem; }

  .host-option-btn-sm {
    padding: 0.35rem 0.7rem;
    border-radius: 0.4rem;
    border: 1px solid #333;
    background: #1a1a1a;
    color: #aaa;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .host-option-btn-sm.chosen { border-color: #ff4d00; background: #2a1500; color: #ff4d00; }
  .host-option-btn-sm:hover { border-color: #555; }

  .btn-force-settle {
    padding: 0.6rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid #666;
    background: transparent;
    color: #aaa;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    align-self: flex-start;
    transition: border-color 0.15s, color 0.15s;
  }

  .btn-force-settle:hover { border-color: #ff4d00; color: #ff4d00; }

  /* Live vote display */
  .options-live { display: flex; flex-direction: column; gap: 0.75rem; }

  .option-row {
    background: #111;
    border-radius: 0.6rem;
    padding: 0.75rem 1rem;
    border: 1px solid #1e1e1e;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    transition: border-color 0.15s;
  }

  .option-row.mine { border-color: #ff4d00; background: #120800; }

  .option-row-top { display: flex; justify-content: space-between; align-items: center; }
  .option-name { font-weight: 600; font-size: 0.95rem; }
  .option-count { font-weight: 700; color: #ff4d00; font-size: 0.875rem; }

  .bar-track { height: 4px; background: #222; border-radius: 2px; overflow: hidden; }
  .bar-fill { height: 100%; background: #ff4d00; border-radius: 2px; transition: width 0.35s ease; }

  .voter-names { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .voter-chip { font-size: 0.72rem; color: #888; background: #1e1e1e; padding: 0.15rem 0.5rem; border-radius: 2rem; }
  .voter-chip.me { color: #ff4d00; background: #2a1500; }

  /* History */
  .history { margin-top: 2rem; border-top: 1px solid #222; padding-top: 1rem; }
  .history-toggle { background: none; border: none; color: #888; font-size: 0.875rem; font-weight: 600; cursor: pointer; padding: 0; }
  .history-toggle:hover { color: #ccc; }
  .history-list { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem; }
  .history-entry { background: #111; border-radius: 0.5rem; padding: 0.75rem 1rem; }
  .history-q { font-size: 0.875rem; font-weight: 700; color: #aaa; }
  .history-settled { font-size: 0.8rem; color: #5dde5d; margin-top: 0.25rem; }

  /* Shared */
  .btn-primary {
    padding: 0.85rem 1.5rem;
    border-radius: 0.5rem;
    border: none;
    background: #ff4d00;
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.15s;
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

  /* Reveal overlay */
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 200; animation: fadeIn 0.3s ease; }
  .reveal-card { background: #111; border: 2px solid #ff4d00; border-radius: 1.25rem; padding: 2rem; width: 100%; max-width: 360px; text-align: center; }
  .reveal-title { font-size: 1.75rem; font-weight: 900; margin-bottom: 0.5rem; }
  .reveal-subtitle { color: #888; font-size: 0.875rem; margin-bottom: 1.25rem; text-transform: uppercase; letter-spacing: 0.08em; }
  .reveal-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; text-align: left; }
  .reveal-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; border-radius: 0.5rem; background: #1a1a1a; }
  .reveal-item.me { background: #2a1500; border: 1px solid #ff4d00; }
  .reveal-num { color: #555; font-size: 0.8rem; width: 1.25rem; }
  .reveal-name { flex: 1; font-weight: 600; }
  .reveal-you { font-size: 0.7rem; font-weight: 700; color: #ff4d00; text-transform: uppercase; }

  /* Modal */
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 1rem; }
  .modal { background: #111; border: 1px solid #222; border-radius: 1rem; padding: 1.5rem; width: 100%; max-width: 480px; display: flex; flex-direction: column; gap: 1rem; max-height: 85vh; overflow-y: auto; }
  .your-turn-banner { font-size: 1rem; font-weight: 700; color: #ff4d00; text-align: center; padding-bottom: 0.75rem; border-bottom: 1px solid #222; }

  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
</style>
