<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { connect } from "$lib/socket";
  import {
    roomCode, players, currentQuestion, liveVotes, totalPlayers,
    myVote, questionEnded, hostDisconnected, roomEnded,
    resetQuestionState, questionHistory, countdown,
    myPlayerId, turnOrder, activePlayerId,
  } from "$lib/stores";
  import QuestionPicker from "$lib/QuestionPicker.svelte";

  const code = $page.params.code;
  let socket = connect();
  let hostWaitSeconds = $state(0);
  let hostTimer: ReturnType<typeof setInterval> | null = null;
  let notInRoom = $state(false);
  let connectionLost = $state(false);
  let showPicker = $state(false);
  let showReveal = $state(false);
  let revealTimeout: ReturnType<typeof setTimeout> | null = null;
  let countdownSeconds = $state(0);
  let countdownInterval: ReturnType<typeof setInterval> | null = null;

  let isMyTurn = $derived($activePlayerId !== null && $activePlayerId === $myPlayerId);
  let activeTurnNickname = $derived($turnOrder.find(p => p.id === $activePlayerId)?.nickname ?? "");

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
    if (!get(roomCode)) { notInRoom = true; return; }

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

    socket.on("question:ended", ({ final, settledOption }: any) => {
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
    if (hostTimer) clearInterval(hostTimer);
    if (countdownInterval) clearInterval(countdownInterval);
    ["connect_error","disconnect","connect","room:updated","game:started","turn:changed",
     "question:new","response:update","question:countdown","question:countdown:cancelled",
     "question:ended","host:disconnected","room:ended"].forEach(e => socket.off(e));
  });

  function castVote(option: string) {
    if (!$currentQuestion) return;
    myVote.set(option);
    socket.emit("response:submit", { questionId: $currentQuestion.id, value: option });
  }

  // Votes grouped by option for display
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
  {#if notInRoom}
    <div class="fullscreen-center">
      <p class="muted">You're not in a room.</p>
      <a href="/" class="btn-primary">Go home</a>
    </div>
  {:else}
    <div class="room-header">
      <span class="room-code">{code}</span>
      {#if $turnOrder.length > 0 && !$currentQuestion && !$questionEnded}
        <span class="turn-pill">{isMyTurn ? "Your turn" : `${activeTurnNickname}'s turn`}</span>
      {/if}
    </div>

    {#if connectionLost}
      <div class="banner error">Connection lost — trying to reconnect...</div>
    {/if}
    {#if $hostDisconnected && !$roomEnded}
      <div class="banner warn">Host disconnected — waiting ({hostWaitSeconds}s)</div>
    {/if}

    <!-- Countdown bar -->
    {#if $countdown}
      {@const pct = Math.round((countdownSeconds / 10) * 100)}
      <div class="countdown-bar-wrap">
        <div class="countdown-bar" style="width:{pct}%"></div>
        <span class="countdown-text">
          Settling on <strong>{$countdown.leadingOption}</strong> in {countdownSeconds}s — change your vote to stop it!
        </span>
      </div>
    {/if}

    {#if !$currentQuestion || $questionEnded}
      <section class="lobby">
        {#if $questionEnded}
          <div class="settled-banner">
            ✅ Settled!
          </div>
        {/if}

        {#if $turnOrder.length === 0}
          <div class="waiting-center">
            <div class="pulse-dot"></div>
            <span class="muted">Waiting for host to start...</span>
          </div>
          <ul class="player-chips">
            {#each $players as p (p.id)}<li>{p.nickname}</li>{/each}
          </ul>
        {:else if isMyTurn}
          <div class="your-turn-lobby">
            <p class="your-turn-text">It's your turn to ask!</p>
            <button class="btn-primary" onclick={() => showPicker = true}>Ask a Question</button>
          </div>
        {:else}
          <div class="waiting-center">
            <div class="pulse-dot"></div>
            <span class="muted">Waiting for <strong>{activeTurnNickname}</strong> to ask...</span>
          </div>
          <ul class="player-chips">
            {#each $players as p (p.id)}
              <li class="{p.id === $activePlayerId ? 'active' : ''}">{p.nickname}</li>
            {/each}
          </ul>
        {/if}
      </section>

    {:else}
      <section class="question">
        <h2>{$currentQuestion.prompt}</h2>
        <p class="tally">{$liveVotes.length}/{$totalPlayers} voted · {agreedCount} agreed</p>

        <div class="options">
          {#each votesByOption as { option, voters, count }}
            {@const isChosen = $myVote === option}
            {@const pct = $totalPlayers > 0 ? Math.round((count / $totalPlayers) * 100) : 0}
            <button
              class="option-card {isChosen ? 'chosen' : ''}"
              onclick={() => castVote(option)}
            >
              <div class="option-top">
                <span class="option-label">{option}</span>
                <span class="option-count">{count}</span>
              </div>
              <div class="option-bar-track">
                <div class="option-bar-fill" style="width:{pct}%"></div>
              </div>
              {#if voters.length > 0}
                <div class="voter-names">
                  {#each voters as v}
                    <span class="voter-chip {v.playerId === $myPlayerId ? 'me' : ''}">{v.nickname}</span>
                  {/each}
                </div>
              {/if}
            </button>
          {/each}
        </div>

        {#if $myVote}
          <p class="change-hint">Tap any option to change your vote</p>
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

  .fullscreen-center {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
  }

  .room-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .room-code { font-size: 1.1rem; font-weight: 700; color: #ff4d00; letter-spacing: 0.08em; }

  .turn-pill {
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
    padding: 0.6rem 1rem;
    margin-bottom: 0.75rem;
    font-size: 0.875rem;
    text-align: center;
  }

  .banner.warn { background: #2a1500; border: 1px solid #ff4d00; color: #ffaa77; }
  .banner.error { background: #1a0a0a; border: 1px solid #8b0000; color: #ff6b6b; }

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

  .countdown-text {
    position: relative;
    font-size: 0.875rem;
    color: #ffaa77;
  }

  /* Lobby */
  .lobby { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.25rem; }

  .settled-banner {
    font-size: 1.5rem;
    font-weight: 800;
    color: #5dde5d;
    text-align: center;
  }

  .waiting-center {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: #888;
  }

  .your-turn-lobby {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    text-align: center;
  }

  .your-turn-text {
    font-size: 1.2rem;
    font-weight: 700;
    color: #ff4d00;
    margin: 0;
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

  .player-chips {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
  }

  .player-chips li {
    background: #1e1e1e;
    padding: 0.35rem 0.8rem;
    border-radius: 2rem;
    font-size: 0.8rem;
    color: #aaa;
  }

  .player-chips li.active {
    background: #2a1500;
    border: 1px solid #ff4d00;
    color: #ff4d00;
  }

  /* Question */
  .question { flex: 1; display: flex; flex-direction: column; padding-top: 0.5rem; }

  h2 { font-size: 1.5rem; font-weight: 800; margin: 0 0 0.5rem; line-height: 1.3; }

  .tally { color: #666; font-size: 0.875rem; margin: 0 0 1.25rem; }

  .options { display: flex; flex-direction: column; gap: 0.75rem; }

  .option-card {
    width: 100%;
    padding: 0.85rem 1rem;
    border-radius: 0.75rem;
    border: 2px solid #222;
    background: #111;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .option-card:hover { border-color: #444; }
  .option-card:active { transform: scale(0.99); }
  .option-card.chosen { border-color: #ff4d00; background: #1a0800; }

  .option-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .option-label { font-size: 1rem; font-weight: 600; color: #fff; }
  .option-count { font-size: 0.875rem; font-weight: 700; color: #ff4d00; }

  .option-bar-track {
    height: 4px;
    background: #222;
    border-radius: 2px;
    overflow: hidden;
  }

  .option-bar-fill {
    height: 100%;
    background: #ff4d00;
    border-radius: 2px;
    transition: width 0.35s ease;
  }

  .voter-names {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.1rem;
  }

  .voter-chip {
    font-size: 0.72rem;
    color: #888;
    background: #1e1e1e;
    padding: 0.15rem 0.5rem;
    border-radius: 2rem;
  }

  .voter-chip.me { color: #ff4d00; background: #2a1500; }

  .change-hint { color: #444; font-size: 0.75rem; text-align: center; margin: 0.75rem 0 0; }

  .muted { color: #888; }

  .btn-primary {
    padding: 0.9rem 2rem;
    border-radius: 0.5rem;
    border: none;
    background: #ff4d00;
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
  }

  a.btn-primary { display: inline-block; text-decoration: none; text-align: center; }

  /* Modal */
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
    font-size: 1rem;
    font-weight: 700;
    color: #ff4d00;
    text-align: center;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #222;
  }

  /* Reveal overlay */
  .overlay {
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
  .reveal-you { font-size: 0.7rem; font-weight: 700; color: #ff4d00; text-transform: uppercase; }

  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
</style>
