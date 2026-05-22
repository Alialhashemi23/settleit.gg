<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { connect } from "$lib/socket";
  import {
    players, currentQuestion, liveVotes, totalPlayers,
    myVote, questionEnded, roomEnded, resetQuestionState,
    questionHistory, countdown, myPlayerId, turnOrder, activePlayerId, askedPresetIds, presetsEnabled,
  } from "$lib/stores";
  import QuestionPicker from "$lib/QuestionPicker.svelte";
  import HistoryPanel from "$lib/HistoryPanel.svelte";

  const code = $page.params.code;
  let socket = connect();
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
    if (pending && pending === get(myPlayerId)) showPicker = true;
  }

  // Write-in state
  let writeInOptions = $state<Set<string>>(new Set());
  let showWriteIn = $state(false);
  let writeInText = $state('');

  function submitWriteIn(e: Event) {
    e.preventDefault();
    const trimmed = writeInText.trim();
    if (!trimmed || !$currentQuestion) return;
    socket.emit("response:add-option", { questionId: $currentQuestion.id, option: trimmed });
    writeInText = '';
    showWriteIn = false;
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
    socket.on("room:settings-updated", ({ presetsEnabled: pe }: any) => presetsEnabled.set(pe));

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
      showWriteIn = (question.options ?? []).length === 0;
      writeInText = '';
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

    socket.on("question:ended", ({ settledOption }: any) => {
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

    socket.on("room:ended", () => {
      roomEnded.set(true);
      goto("/summary");
    });
  });

  onDestroy(() => {
    if (revealTimeout) clearTimeout(revealTimeout);
    if (countdownInterval) clearInterval(countdownInterval);
    if (resultTimeout) clearTimeout(resultTimeout);
    if (copyTimeout) clearTimeout(copyTimeout);
    ["connect_error","disconnect","connect","room:updated","room:settings-updated","game:started","turn:changed",
     "question:new","question:option-added","response:update","question:countdown","question:countdown:cancelled",
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
  }

  function endRoom() {
    socket.emit("room:end");
    goto("/summary");
  }
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
          <button class="btn-copy-link {copied ? 'copied' : ''}" onclick={copyLink}>
            {copied ? '✓ Copied!' : '🔗 Copy Link'}
          </button>
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
          <label class="presets-toggle">
            <input type="checkbox" checked={$presetsEnabled} onchange={e => {
              const val = (e.target as HTMLInputElement).checked;
              presetsEnabled.set(val);
              socket.emit("room:set-presets-enabled", { enabled: val });
            }} />
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
            <span class="toggle-label">Use preset questions</span>
          </label>

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
      <!-- Active question -->
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

            <!-- Write-in -->
            {#if showWriteIn}
              <form class="write-in-form" onsubmit={submitWriteIn}>
                <input type="text" bind:value={writeInText} placeholder="Your option..." maxlength="50" autofocus />
                <div class="write-in-actions">
                  <button class="btn-write-submit" type="submit" disabled={!writeInText.trim()}>Add</button>
                  <button class="btn-ghost" type="button" onclick={() => { showWriteIn = false; writeInText = ''; }}>Cancel</button>
                </div>
              </form>
            {:else}
              <button class="btn-write-in" onclick={() => showWriteIn = true}>✏️ Add your own...</button>
            {/if}

            {#if isMyTurn}
              {#if ($currentQuestion?.options ?? []).length === 0}
                <p class="no-options-nudge">Add at least one option before settling</p>
              {:else}
                <button class="btn-force-settle" onclick={forceSettle}>Force Settle</button>
              {/if}
            {/if}
          </div>

          <div class="question-right">
            <div class="options-live">
              {#each votesByOption as { option, voters, count }}
                {@const pct = $players.length > 0 ? Math.round((count / $players.length) * 100) : 0}
                {@const isWriteIn = writeInOptions.has(option)}
                <div class="option-row {$myVote === option ? 'mine' : ''} {isWriteIn ? 'write-in' : ''}">
                  <div class="option-row-top">
                    <div class="option-name-wrap">
                      <span class="option-name">{option}</span>
                      {#if isWriteIn}<span class="write-in-chip">✏️ write-in</span>{/if}
                    </div>
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

    <HistoryPanel />
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

  .header-code {
    font-size: 1.1rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    color: var(--accent);
    flex: 1;
  }

  .turn-pill {
    font-size: 0.8rem;
    font-weight: 800;
    padding: 0.3rem 0.7rem;
    border-radius: 2rem;
    background: var(--surface);
    color: var(--accent);
    border: 1px solid var(--border);
  }

  .header-right { display: flex; align-items: center; gap: 0.75rem; }
  .player-count { color: var(--text-muted); font-size: 0.875rem; font-weight: 600; }

  .banner.error {
    background: rgba(224, 80, 80, 0.1);
    border: 1px solid var(--error);
    border-radius: 0.75rem;
    padding: 0.6rem 1rem;
    margin-bottom: 1rem;
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--error);
    text-align: center;
  }

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

  /* Code card */
  .code-card {
    background: var(--surface);
    border: 2px solid var(--accent);
    border-radius: 1.25rem;
    padding: 1.5rem 2rem;
    text-align: center;
    margin-bottom: 1.25rem;
    box-shadow: 0 0 32px var(--accent-alpha), inset 0 1px 0 rgba(232,131,26,0.1);
    animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .code-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-dim);
    margin-bottom: 0.4rem;
    font-weight: 800;
  }

  .code-big {
    font-size: 3.5rem;
    font-weight: 900;
    letter-spacing: 0.15em;
    color: var(--accent);
    line-height: 1;
    animation: glowPulse 2.5s ease-in-out infinite;
  }

  .code-url { font-size: 0.8rem; color: var(--text-dim); margin-top: 0.4rem; font-weight: 600; }

  .btn-copy-link {
    margin-top: 0.875rem;
    padding: 0.5rem 1.25rem;
    border-radius: 0.75rem;
    border: 1.5px solid var(--accent);
    background: transparent;
    color: var(--accent);
    font-size: 0.875rem;
    font-weight: 800;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s, color 0.15s, transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.15s;
  }

  .btn-copy-link:hover { background: rgba(232,131,26,0.08); box-shadow: 0 0 12px var(--accent-alpha); }
  .btn-copy-link:active { transform: scale(0.96); }

  .btn-copy-link.copied {
    border-color: var(--success);
    color: var(--success);
    background: rgba(96, 192, 128, 0.08);
    box-shadow: 0 0 12px rgba(96,192,128,0.2);
  }

  .content { flex: 1; }

  .lobby { display: flex; flex-direction: column; align-items: center; gap: 1rem; }

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
    background: var(--surface);
    padding: 0.4rem 0.9rem;
    border-radius: 2rem;
    font-size: 0.875rem;
    font-weight: 700;
    border: 1px solid var(--border);
    animation: bounceIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .player-chips li.active {
    background: var(--surface-raised);
    border-color: var(--accent);
    color: var(--accent);
    box-shadow: 0 0 8px var(--accent-alpha);
  }

  .player-chips li.empty { color: var(--text-dim); font-style: italic; border-color: transparent; }

  .settled-banner { font-size: 1.25rem; font-weight: 900; color: var(--success); }
  .waiting-turn { color: var(--text-muted); font-size: 0.95rem; margin: 0; font-weight: 600; }

  /* Active question */
  .question-layout { display: grid; grid-template-columns: 1fr 1.4fr; gap: 2rem; align-items: start; }

  @media (max-width: 640px) {
    .question-layout { grid-template-columns: 1fr; }
    .code-big { font-size: 2.5rem; }
  }

  .question-left { display: flex; flex-direction: column; gap: 0.85rem; }
  .question-right { display: flex; flex-direction: column; }

  h2 { font-size: 1.6rem; font-weight: 900; margin: 0; line-height: 1.3; color: var(--text); }
  .tally { color: var(--text-dim); font-size: 0.875rem; margin: 0; font-weight: 600; }

  .host-vote-section { display: flex; flex-direction: column; gap: 0.5rem; }
  .host-vote-label {
    font-size: 0.75rem;
    font-weight: 800;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0;
  }

  .host-options { display: flex; flex-direction: column; gap: 0.4rem; }

  .host-option-btn {
    padding: 0.6rem 0.9rem;
    border-radius: 0.75rem;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font-size: 0.875rem;
    font-weight: 700;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s, background 0.15s, transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
    font-family: inherit;
  }

  .host-option-btn:hover { border-color: var(--accent); background: var(--surface-raised); }
  .host-option-btn:active { transform: scale(0.97); }

  .voted-conf { color: var(--text-muted); font-size: 0.875rem; margin: 0; font-weight: 600; }
  .btn-link {
    background: none;
    border: none;
    color: var(--accent);
    font-size: 0.875rem;
    font-weight: 700;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    font-family: inherit;
  }

  .host-options-sm { display: flex; flex-wrap: wrap; gap: 0.35rem; }

  .host-option-btn-sm {
    padding: 0.35rem 0.7rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-muted);
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
  }

  .host-option-btn-sm.chosen {
    border-color: var(--accent);
    background: var(--surface-raised);
    color: var(--accent);
    box-shadow: 0 0 8px var(--accent-alpha);
  }

  .host-option-btn-sm:hover { border-color: var(--text-dim); }

  .btn-force-settle {
    padding: 0.6rem 1rem;
    border-radius: 0.75rem;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    font-size: 0.875rem;
    font-weight: 800;
    cursor: pointer;
    align-self: flex-start;
    transition: border-color 0.15s, color 0.15s, box-shadow 0.15s;
    font-family: inherit;
  }

  .btn-force-settle:hover {
    border-color: var(--accent);
    color: var(--accent);
    box-shadow: 0 0 10px var(--accent-alpha);
  }

  /* Live vote display */
  .options-live { display: flex; flex-direction: column; gap: 0.75rem; }

  .option-row {
    background: var(--surface);
    border-radius: 0.75rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .option-row.mine {
    border-color: var(--accent);
    background: var(--surface-raised);
    box-shadow: 0 0 12px var(--accent-alpha);
  }

  .option-row-top { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
  .option-name-wrap { display: flex; align-items: center; gap: 0.4rem; min-width: 0; }
  .option-name { font-weight: 800; font-size: 0.95rem; }
  .option-count { font-weight: 900; color: var(--accent); font-size: 0.875rem; flex-shrink: 0; }

  .write-in-chip {
    font-size: 0.6rem;
    font-weight: 800;
    color: var(--text-dim);
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 0.3rem;
    padding: 0.1rem 0.3rem;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .option-row.write-in { border-style: dashed; }

  .no-options-nudge {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-dim);
    font-style: italic;
    margin: 0;
  }

  .btn-write-in {
    padding: 0.5rem 0.75rem;
    border-radius: 0.6rem;
    border: 1px dashed var(--border);
    background: transparent;
    color: var(--text-dim);
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    align-self: flex-start;
    transition: border-color 0.15s, color 0.15s;
  }

  .btn-write-in:hover { border-color: var(--accent); color: var(--accent); }

  .write-in-form { display: flex; flex-direction: column; gap: 0.4rem; animation: slideUp 0.2s ease-out; }

  .write-in-form input {
    padding: 0.6rem 0.75rem;
    border-radius: 0.6rem;
    border: 2px solid var(--accent);
    background: var(--bg);
    color: var(--text);
    font-size: 0.9rem;
    font-family: inherit;
    font-weight: 600;
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-alpha);
  }

  .write-in-actions { display: flex; gap: 0.4rem; align-items: center; }

  .btn-write-submit {
    padding: 0.45rem 1rem;
    border-radius: 0.6rem;
    border: none;
    background: var(--accent);
    color: #fff;
    font-size: 0.85rem;
    font-weight: 800;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s, transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .btn-write-submit:hover:not(:disabled) { background: var(--accent-hover); }
  .btn-write-submit:active:not(:disabled) { transform: scale(0.96); }
  .btn-write-submit:disabled { opacity: 0.4; cursor: not-allowed; }

  .bar-track { height: 5px; background: var(--border); border-radius: 3px; overflow: hidden; }
  .bar-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.35s ease; box-shadow: 0 0 6px var(--accent-alpha); }

  .voter-names { display: flex; flex-wrap: wrap; gap: 0.35rem; }
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


  /* Buttons */
  /* Presets toggle */
  .presets-toggle {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    cursor: pointer;
    user-select: none;
  }

  .presets-toggle input[type="checkbox"] { display: none; }

  .toggle-track {
    width: 40px;
    height: 22px;
    border-radius: 999px;
    background: var(--border);
    position: relative;
    flex-shrink: 0;
    transition: background 0.2s;
  }

  .presets-toggle input:checked ~ .toggle-track { background: var(--accent); box-shadow: 0 0 8px var(--accent-alpha); }

  .toggle-thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .presets-toggle input:checked ~ .toggle-track .toggle-thumb { transform: translateX(18px); }

  .toggle-label { font-size: 0.875rem; font-weight: 800; color: var(--text-muted); }

  .btn-primary {
    min-height: 52px;
    padding: 0.85rem 1.5rem;
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

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
    box-shadow: 0 0 24px rgba(232, 131, 26, 0.4), 0 6px 16px rgba(0,0,0,0.4);
  }

  .btn-primary:active:not(:disabled) { transform: scale(0.95); }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }

  .btn-danger-sm {
    padding: 0.4rem 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid rgba(224, 80, 80, 0.4);
    background: transparent;
    color: var(--error);
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s;
  }

  .btn-danger-sm:hover { background: rgba(224, 80, 80, 0.15); }

  /* Reveal overlay */
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.88);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    animation: fadeIn 0.3s ease;
  }

  .reveal-card {
    background: var(--surface);
    border: 2px solid var(--accent);
    border-radius: 1.5rem;
    padding: 2rem;
    width: 100%;
    max-width: 360px;
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
    animation: bounceIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .reveal-item.me { border-color: var(--accent); box-shadow: 0 0 10px var(--accent-alpha); }
  .reveal-num { color: var(--text-dim); font-size: 0.8rem; width: 1.25rem; font-weight: 800; }
  .reveal-name { flex: 1; font-weight: 800; }
  .reveal-you { font-size: 0.7rem; font-weight: 900; color: var(--accent); text-transform: uppercase; }
  .reveal-goes-first { font-size: 0.7rem; font-weight: 900; color: var(--accent); text-transform: uppercase; }
  .reveal-item.first { border-color: var(--accent); box-shadow: 0 0 10px var(--accent-alpha); }

  /* Result screen */
  .result-overlay { z-index: 150; cursor: pointer; }

  .result-card {
    background: var(--surface);
    border: 2px solid var(--accent);
    border-radius: 1.5rem;
    padding: 2rem;
    width: 100%;
    max-width: 360px;
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

  .your-turn-banner {
    font-size: 1rem;
    font-weight: 900;
    color: var(--accent);
    text-align: center;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--border);
  }

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

  @keyframes glowPulse {
    0%, 100% { text-shadow: 0 0 20px rgba(232, 131, 26, 0.35); }
    50% { text-shadow: 0 0 40px rgba(232, 131, 26, 0.65), 0 0 70px rgba(232, 131, 26, 0.2); }
  }
</style>
