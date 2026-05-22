<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { connect, getSession, clearSession } from "$lib/socket";
  import {
    roomCode, players, currentQuestion, liveVotes, totalPlayers,
    myVote, questionEnded, hostDisconnected, roomEnded,
    resetQuestionState, questionHistory, countdown, askedPresetIds,
    myPlayerId, turnOrder, activePlayerId,
  } from "$lib/stores";
  import QuestionPicker from "$lib/QuestionPicker.svelte";
  import HistoryPanel from "$lib/HistoryPanel.svelte";

  const code = $page.params.code;
  let socket = connect();
  let hostWaitSeconds = $state(0);
  let hostTimer: ReturnType<typeof setInterval> | null = null;
  let notInRoom = $state(false);
  let connectionLost = $state(false);
  let showPicker = $state(false);
  let showReveal = $state(false);
  let copied = $state(false);
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;

  function copyLink() {
    navigator.clipboard.writeText(`https://settleit.gg/join/${code}`).then(() => {
      copied = true;
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => { copied = false; }, 2000);
    });
  }
  let revealTimeout: ReturnType<typeof setTimeout> | null = null;
  let countdownSeconds = $state(0);
  let countdownInterval: ReturnType<typeof setInterval> | null = null;

  let isMyTurn = $derived($activePlayerId !== null && $activePlayerId === $myPlayerId);
  let activeTurnNickname = $derived($turnOrder.find(p => p.id === $activePlayerId)?.nickname ?? "");

  // Write-in state
  let writeInOptions = $state<Set<string>>(new Set());
  let showWriteIn = $state(false);
  let writeInText = $state('');
  let writeInError = $state('');

  function submitWriteIn(e: Event) {
    e.preventDefault();
    const trimmed = writeInText.trim();
    if (!trimmed || !$currentQuestion) return;
    writeInError = '';
    socket.emit("response:add-option", { questionId: $currentQuestion.id, option: trimmed });
    writeInText = '';
    showWriteIn = false;
  }

  // Result screen state
  let showResult = $state(false);
  let resultSettledOption = $state<string | null>(null);
  let resultQuestion = $state<{ id: string; type: string; prompt: string; options: string[] } | null>(null);
  let resultVotes = $state<{ playerId: string; nickname: string; value: string }[]>([]);
  let resultTimeout: ReturnType<typeof setTimeout> | null = null;
  let pendingPickerTurn = $state<string | null>(null);

  function dismissResult() {
    if (resultTimeout) { clearTimeout(resultTimeout); resultTimeout = null; }
    showResult = false;
    const pending = pendingPickerTurn;
    pendingPickerTurn = null;
    if (pending && pending === $myPlayerId) showPicker = true;
  }

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

  // Always rejoin from session on reconnect — socket disconnect removes us from backend
  function rejoinSession() {
    const session = getSession();
    if (session && session.roomCode === code) {
      socket.emit("room:player-rejoin", session);
    } else {
      notInRoom = true;
    }
  }

  onMount(() => {
    if (!get(roomCode)) {
      const session = getSession();
      if (session && session.roomCode === code) {
        socket.emit("room:player-rejoin", session);
      } else {
        notInRoom = true;
        return;
      }
    }

    socket.on("connect_error", () => { connectionLost = true; });
    socket.on("disconnect", () => { connectionLost = true; });
    socket.on("connect", () => { connectionLost = false; rejoinSession(); });
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
        if (showResult) {
          pendingPickerTurn = apId;
        } else {
          showPicker = true;
        }
      }
    });

    socket.on("question:new", ({ question, presetId }: any) => {
      currentQuestion.set(question);
      liveVotes.set([]);
      totalPlayers.set(get(players).length);
      myVote.set(null);
      questionEnded.set(false);
      countdown.set(null);
      showPicker = false;
      if (presetId) askedPresetIds.update(s => { s.add(presetId); return new Set(s); });
      writeInOptions = new Set();
      showWriteIn = false;
      writeInText = '';
      writeInError = '';
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    });

    socket.on("question:option-added", ({ questionId, option }: any) => {
      const q = get(currentQuestion);
      if (q && q.id === questionId) {
        currentQuestion.update(cq => cq ? { ...cq, options: [...cq.options, option] } : cq);
        writeInOptions = new Set([...writeInOptions, option]);
      }
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
      const votes = get(liveVotes);
      if (q) {
        questionHistory.update(h => [...h, {
          question: q,
          settledOption: settledOption ?? null,
          votes,
        }]);
        resultQuestion = q;
        resultVotes = [...votes];
        resultSettledOption = settledOption ?? null;
        showResult = true;
        if (resultTimeout) clearTimeout(resultTimeout);
        resultTimeout = setTimeout(dismissResult, 3000);
      }
      currentQuestion.set(null);
    });

    socket.on("host:disconnected", ({ deadline }: { deadline: number }) => {
      hostDisconnected.set({ deadline });
      hostWaitSeconds = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      hostTimer = setInterval(() => {
        hostWaitSeconds = Math.max(0, Math.round((deadline - Date.now()) / 1000));
        if (hostWaitSeconds <= 0 && hostTimer) clearInterval(hostTimer);
      }, 1000);
    });

    socket.on("room:rejoined", ({ roomCode: rc, playerId: pid, players: pl, turnOrder: order, activePlayerId: apId, currentQuestion: q, currentVotes: votes, history: hist, askedPresetIds: askedIds }: any) => {
      roomCode.set(rc);
      myPlayerId.set(pid);
      players.set(pl);
      totalPlayers.set(pl.length);
      if (order) { turnOrder.set(order); activePlayerId.set(apId); }
      if (q) {
        currentQuestion.set(q);
        liveVotes.set(votes);
        myVote.set(votes.find((v: any) => v.playerId === pid)?.value ?? null);
      }
      if (hist?.length) questionHistory.set(hist);
      if (askedIds?.length) askedPresetIds.set(new Set(askedIds));
      connectionLost = false;
      notInRoom = false;
    });

    socket.on("room:ended", () => {
      roomEnded.set(true);
      clearSession();
      if (hostTimer) clearInterval(hostTimer);
      goto("/summary");
    });
  });

  onDestroy(() => {
    if (revealTimeout) clearTimeout(revealTimeout);
    if (hostTimer) clearInterval(hostTimer);
    if (countdownInterval) clearInterval(countdownInterval);
    if (resultTimeout) clearTimeout(resultTimeout);
    if (copyTimeout) clearTimeout(copyTimeout);
    ["connect_error","disconnect","connect","room:updated","game:started","turn:changed",
     "question:new","question:option-added","response:update","question:countdown","question:countdown:cancelled",
     "question:ended","host:disconnected","room:ended","room:rejoined"].forEach(e => socket.off(e));
  });

  function castVote(option: string) {
    if (!$currentQuestion) return;
    myVote.set(option);
    socket.emit("response:submit", { questionId: $currentQuestion.id, value: option });
  }

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

<!-- Post-question result screen -->
{#if showResult && resultQuestion}
  <div class="overlay result-overlay" onclick={dismissResult} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && dismissResult()}>
    <div class="result-card">
      <div class="result-settled">Settled!</div>
      <div class="result-option">{resultSettledOption}</div>
      <div class="result-breakdown">
        {#each resultQuestion.options as opt}
          {@const voters = resultVotes.filter(v => v.value === opt)}
          {#if voters.length > 0}
            <div class="rb-row {opt === resultSettledOption ? 'winner' : ''}">
              <span class="rb-opt">{opt}</span>
              <span class="rb-names">{voters.map(v => v.nickname).join(', ')}</span>
            </div>
          {/if}
        {/each}
      </div>
      <p class="result-hint">Tap anywhere to continue</p>
    </div>
  </div>
{/if}

<!-- Turn reveal overlay -->
{#if showReveal}
  <div class="overlay">
    <div class="reveal-card">
      <div class="reveal-title">🎲 Player Turns!</div>
      <div class="reveal-subtitle">Turn order</div>
      <ol class="reveal-list">
        {#each $turnOrder as player, i}
          <li class="reveal-item {player.id === $myPlayerId ? 'me' : ''} {i === 0 ? 'first' : ''}">
            <span class="reveal-num">{i + 1}</span>
            <span class="reveal-name">{player.nickname}</span>
            {#if player.id === $myPlayerId}<span class="reveal-you">YOU</span>{/if}
            {#if i === 0 && player.id !== $myPlayerId}<span class="reveal-goes-first">FIRST</span>{/if}
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
      <button class="btn-copy-sm {copied ? 'copied' : ''}" onclick={copyLink} title="Copy invite link">
        {copied ? '✓' : '🔗'}
      </button>
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
          <div class="settled-banner">✅ Settled!</div>
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
            {@const isWriteIn = writeInOptions.has(option)}
            {@const pct = $totalPlayers > 0 ? Math.round((count / $totalPlayers) * 100) : 0}
            <button
              class="option-card {isChosen ? 'chosen' : ''} {isWriteIn ? 'write-in' : ''}"
              onclick={() => castVote(option)}
            >
              <div class="option-top">
                <span class="option-label">{option}</span>
                <div class="option-top-right">
                  {#if isWriteIn}<span class="write-in-chip">✏️ write-in</span>{/if}
                  <span class="option-count">{count}</span>
                </div>
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

        <!-- Write-in -->
        {#if showWriteIn}
          <form class="write-in-form" onsubmit={submitWriteIn}>
            <input
              type="text"
              bind:value={writeInText}
              placeholder="Your option..."
              maxlength="50"
              autofocus
            />
            <div class="write-in-actions">
              <button class="btn-write-submit" type="submit" disabled={!writeInText.trim()}>Add</button>
              <button class="btn-ghost" type="button" onclick={() => { showWriteIn = false; writeInText = ''; writeInError = ''; }}>Cancel</button>
            </div>
            {#if writeInError}<p class="write-in-error">{writeInError}</p>{/if}
          </form>
        {:else}
          <button class="btn-write-in" onclick={() => showWriteIn = true}>✏️ Add your own...</button>
        {/if}

        {#if $myVote && !showWriteIn}
          <p class="change-hint">Tap any option to change your vote</p>
        {/if}
      </section>
    {/if}

    <HistoryPanel />
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
    background: radial-gradient(ellipse at 50% 30%, rgba(232, 131, 26, 0.05) 0%, transparent 65%);
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

  .room-code { font-size: 1.1rem; font-weight: 900; color: var(--accent); letter-spacing: 0.08em; }

  .btn-copy-sm {
    margin-left: auto;
    padding: 0.25rem 0.6rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-dim);
    font-size: 0.85rem;
    cursor: pointer;
    font-family: inherit;
    transition: border-color 0.15s, color 0.15s, transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
    flex-shrink: 0;
  }

  .btn-copy-sm:hover { border-color: var(--accent); color: var(--accent); }
  .btn-copy-sm:active { transform: scale(0.94); }
  .btn-copy-sm.copied { border-color: var(--success); color: var(--success); }

  .turn-pill {
    font-size: 0.8rem;
    font-weight: 800;
    padding: 0.25rem 0.6rem;
    border-radius: 2rem;
    background: var(--surface);
    color: var(--accent);
    border: 1px solid var(--border);
  }

  .banner {
    border-radius: 0.75rem;
    padding: 0.6rem 1rem;
    margin-bottom: 0.75rem;
    font-size: 0.875rem;
    font-weight: 700;
    text-align: center;
  }

  .banner.warn { background: var(--surface-raised); border: 1px solid var(--accent); color: var(--accent-hover); }
  .banner.error { background: rgba(224,80,80,0.1); border: 1px solid var(--error); color: var(--error); }

  /* Countdown */
  .countdown-bar-wrap {
    position: relative;
    background: var(--surface);
    border: 1px solid var(--accent);
    border-radius: 0.75rem;
    overflow: hidden;
    margin-bottom: 1rem;
    padding: 0.6rem 0.9rem;
    box-shadow: 0 0 12px var(--accent-alpha);
  }

  .countdown-bar {
    position: absolute;
    inset: 0;
    background: var(--accent-alpha);
    transition: width 0.2s linear;
    pointer-events: none;
  }

  .countdown-text { position: relative; font-size: 0.875rem; font-weight: 700; color: var(--accent-hover); }

  /* Lobby */
  .lobby { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.25rem; }

  .settled-banner { font-size: 1.5rem; font-weight: 900; color: var(--success); text-align: center; animation: bounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }

  .waiting-center { display: flex; align-items: center; gap: 0.75rem; color: var(--text-muted); font-weight: 600; }

  .your-turn-lobby { display: flex; flex-direction: column; align-items: center; gap: 1rem; text-align: center; }

  .your-turn-text { font-size: 1.2rem; font-weight: 900; color: var(--accent); margin: 0; animation: glowPulse 2s ease-in-out infinite; }

  .pulse-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
    animation: emberPulse 1.5s ease-in-out infinite;
  }

  .player-chips { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; }

  .player-chips li {
    background: var(--surface);
    padding: 0.35rem 0.8rem;
    border-radius: 2rem;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-muted);
    border: 1px solid var(--border);
    animation: bounceIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .player-chips li.active {
    background: var(--surface-raised);
    border-color: var(--accent);
    color: var(--accent);
    box-shadow: 0 0 8px var(--accent-alpha);
  }

  /* Question */
  .question { flex: 1; display: flex; flex-direction: column; padding-top: 0.5rem; animation: slideUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }

  h2 { font-size: 1.5rem; font-weight: 900; margin: 0 0 0.5rem; line-height: 1.3; color: var(--text); }

  .tally { color: var(--text-dim); font-size: 0.875rem; font-weight: 600; margin: 0 0 1.25rem; }

  .options { display: flex; flex-direction: column; gap: 0.75rem; }

  .option-card {
    width: 100%;
    min-height: 72px;
    padding: 1rem 1.1rem;
    border-radius: 1rem;
    border: 2px solid var(--border);
    background: var(--surface);
    cursor: pointer;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-family: inherit;
    transition: border-color 0.15s, background 0.15s, box-shadow 0.15s, transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .option-card:hover { border-color: var(--text-dim); background: var(--surface-raised); }
  .option-card:active { transform: scale(0.97); }

  .option-card.chosen {
    border-color: var(--accent);
    background: var(--surface-raised);
    box-shadow: 0 0 16px var(--accent-alpha), inset 0 1px 0 rgba(232,131,26,0.08);
  }

  .option-top { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
  .option-top-right { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }

  .option-label { font-size: 1.05rem; font-weight: 800; color: var(--text); }
  .option-count { font-size: 0.9rem; font-weight: 900; color: var(--accent); }

  .write-in-chip {
    font-size: 0.65rem;
    font-weight: 800;
    color: var(--text-dim);
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 0.35rem;
    padding: 0.1rem 0.35rem;
    white-space: nowrap;
  }

  .option-card.write-in { border-style: dashed; }

  .btn-write-in {
    width: 100%;
    padding: 0.7rem 1rem;
    border-radius: 0.75rem;
    border: 1px dashed var(--border);
    background: transparent;
    color: var(--text-dim);
    font-size: 0.875rem;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    text-align: center;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
    margin-top: 0.25rem;
  }

  .btn-write-in:hover { border-color: var(--accent); color: var(--accent); background: rgba(232,131,26,0.04); }

  .write-in-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.25rem;
    animation: slideUp 0.2s ease-out;
  }

  .write-in-form input {
    padding: 0.75rem 1rem;
    border-radius: 0.75rem;
    border: 2px solid var(--accent);
    background: var(--surface);
    color: var(--text);
    font-size: 1rem;
    font-family: inherit;
    font-weight: 600;
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-alpha);
  }

  .write-in-actions { display: flex; gap: 0.5rem; align-items: center; }

  .btn-write-submit {
    padding: 0.6rem 1.25rem;
    border-radius: 0.75rem;
    border: none;
    background: var(--accent);
    color: #fff;
    font-size: 0.9rem;
    font-weight: 800;
    cursor: pointer;
    font-family: inherit;
    box-shadow: 0 0 12px var(--accent-alpha);
    transition: transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1), background 0.15s;
  }

  .btn-write-submit:hover:not(:disabled) { background: var(--accent-hover); }
  .btn-write-submit:active:not(:disabled) { transform: scale(0.96); }
  .btn-write-submit:disabled { opacity: 0.4; cursor: not-allowed; }

  .write-in-error { color: var(--error); font-size: 0.8rem; font-weight: 700; margin: 0; }

  .option-bar-track { height: 5px; background: var(--border); border-radius: 3px; overflow: hidden; }
  .option-bar-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.4s ease; box-shadow: 0 0 6px var(--accent-alpha); }

  .voter-names { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.1rem; }

  .voter-chip {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--text-muted);
    background: var(--surface-raised);
    padding: 0.15rem 0.5rem;
    border-radius: 2rem;
    border: 1px solid var(--border);
  }

  .voter-chip.me { color: var(--accent); border-color: var(--accent); box-shadow: 0 0 5px var(--accent-alpha); }

  .change-hint { color: var(--text-dim); font-size: 0.75rem; font-weight: 600; text-align: center; margin: 0.75rem 0 0; }

  .muted { color: var(--text-muted); font-weight: 600; }

  .btn-primary {
    min-height: 52px;
    padding: 0.9rem 2rem;
    border-radius: 1rem;
    border: none;
    background: var(--accent);
    color: #fff;
    font-size: 1rem;
    font-weight: 800;
    cursor: pointer;
    font-family: inherit;
    box-shadow: 0 0 16px var(--accent-alpha), 0 4px 12px rgba(0,0,0,0.4);
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 150ms ease, background 150ms ease;
  }

  .btn-primary:hover { background: var(--accent-hover); }
  .btn-primary:active { transform: scale(0.95); }

  a.btn-primary { display: inline-block; text-decoration: none; text-align: center; }

  /* Modal */
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 1rem; }

  .modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 1.25rem;
    padding: 1.5rem;
    width: 100%;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-height: 85vh;
    overflow-y: auto;
    animation: bounceIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .your-turn-banner { font-size: 1rem; font-weight: 900; color: var(--accent); text-align: center; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border); }

  /* Reveal overlay */
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.88); display: flex; align-items: center; justify-content: center; z-index: 200; animation: fadeIn 0.3s ease; }

  .reveal-card {
    background: var(--surface);
    border: 2px solid var(--accent);
    border-radius: 1.5rem;
    padding: 2rem;
    width: 100%;
    max-width: 320px;
    text-align: center;
    box-shadow: 0 0 40px var(--accent-alpha);
    animation: bounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .reveal-title { font-size: 1.75rem; font-weight: 900; margin-bottom: 0.5rem; }
  .reveal-subtitle { color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1.25rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 800; }
  .reveal-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; text-align: left; }

  .reveal-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.75rem;
    background: var(--surface-raised);
    border: 1px solid var(--border);
  }

  .reveal-item.me { border-color: var(--accent); box-shadow: 0 0 10px var(--accent-alpha); }
  .reveal-num { color: var(--text-dim); font-size: 0.8rem; width: 1.25rem; font-weight: 800; }
  .reveal-name { flex: 1; font-weight: 800; }
  .reveal-you { font-size: 0.7rem; font-weight: 900; color: var(--accent); text-transform: uppercase; }
  .reveal-goes-first { font-size: 0.7rem; font-weight: 900; color: var(--accent); text-transform: uppercase; }

  /* Result screen */
  .result-overlay { z-index: 150; cursor: pointer; }

  .result-card {
    background: var(--surface);
    border: 2px solid var(--accent);
    border-radius: 1.5rem;
    padding: 2rem;
    width: 100%;
    max-width: 320px;
    text-align: center;
    box-shadow: 0 0 48px var(--accent-alpha);
    animation: bounceIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    cursor: default;
  }

  .result-settled { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-dim); font-weight: 800; margin-bottom: 0.25rem; }
  .result-option { font-size: 2rem; font-weight: 900; color: var(--accent); margin-bottom: 1.25rem; line-height: 1.2; text-shadow: 0 0 24px var(--accent-alpha); }

  .result-breakdown { display: flex; flex-direction: column; gap: 0.5rem; text-align: left; margin-bottom: 1.25rem; }

  .rb-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.75rem;
    padding: 0.4rem 0.75rem;
    border-radius: 0.5rem;
    background: var(--surface-raised);
    border: 1px solid var(--border);
  }

  .rb-row.winner { border-color: var(--accent); background: rgba(232,131,26,0.08); }

  .rb-opt { font-size: 0.875rem; font-weight: 800; color: var(--text-muted); flex-shrink: 0; }
  .rb-row.winner .rb-opt { color: var(--accent); }
  .rb-names { font-size: 0.75rem; font-weight: 600; color: var(--text-dim); text-align: right; }

  .result-hint { font-size: 0.75rem; font-weight: 600; color: var(--text-dim); margin: 0; }

  /* BUG-002: first player highlight in turn reveal */
  .reveal-item.first { border-color: var(--accent); box-shadow: 0 0 10px var(--accent-alpha); }

  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes bounceIn {
    0% { opacity: 0; transform: scale(0.85) translateY(8px); }
    60% { transform: scale(1.04); }
    100% { opacity: 1; transform: scale(1); }
  }

  @keyframes emberPulse {
    0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 8px var(--accent-alpha); }
    50% { opacity: 0.5; transform: scale(0.8); box-shadow: 0 0 16px rgba(232,131,26,0.4); }
  }

  @keyframes glowPulse {
    0%, 100% { text-shadow: 0 0 16px rgba(232, 131, 26, 0.3); }
    50% { text-shadow: 0 0 32px rgba(232, 131, 26, 0.6); }
  }
</style>
