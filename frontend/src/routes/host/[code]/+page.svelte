<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { connect } from "$lib/socket";
  import {
    players, currentQuestion, voteCounts, freetextResponses,
    questionEnded, hostDisconnected, roomEnded, resetQuestionState,
    questionHistory,
  } from "$lib/stores";
  import { packs } from "$lib/packs";
  import type { Pack, PackQuestion } from "$lib/packs";

  const code = $page.params.code;

  let socket = connect();
  let showPicker = $state(false);
  let pickerTab: "custom" | "pack" = $state("custom");
  let questionType: "vote" | "freetext" = $state("vote");
  let customPrompt = $state("");
  let customOptions: string[] = $state(["", ""]);
  let selectedPack: Pack | null = $state(null);
  let showHistory = $state(false);

  let totalPlayers = $derived($players.length);
  let totalVotes = $derived(Object.values($voteCounts).reduce((a, b) => a + b, 0));

  onMount(() => {
    socket.on("room:updated", ({ players: pl }: any) => players.set(pl));
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
    socket.off("room:updated");
    socket.off("question:new");
    socket.off("response:update");
    socket.off("question:ended");
    socket.off("room:ended");
  });

  function pushQuestion() {
    if (!customPrompt.trim()) return;
    if (questionType === "vote") {
      const opts = customOptions.filter(o => o.trim());
      if (opts.length < 2) return;
      socket.emit("question:ask", { type: "vote", prompt: customPrompt.trim(), options: opts });
    } else {
      socket.emit("question:ask", { type: "freetext", prompt: customPrompt.trim() });
    }
    customPrompt = "";
    customOptions = ["", ""];
  }

  function askPackQuestion(q: PackQuestion) {
    socket.emit("question:ask", {
      type: q.type,
      prompt: q.prompt,
      ...(q.type === "vote" ? { options: q.options } : {}),
    });
  }

  function nextQuestion() {
    socket.emit("question:next");
    resetQuestionState();
    showPicker = true;
  }

  function endRoom() {
    socket.emit("room:end");
    goto("/summary");
  }

  function openPicker() {
    pickerTab = "custom";
    selectedPack = null;
    showPicker = true;
  }

  let maxVotes = $derived(Math.max(1, ...Object.values($voteCounts)));
</script>

<main>
  <header>
    <div class="room-code">{code}</div>
    <div class="player-count">{totalPlayers} player{totalPlayers !== 1 ? "s" : ""}</div>
    <button class="btn-danger-sm" onclick={endRoom}>End Room</button>
  </header>

  <div class="content">
    {#if !$currentQuestion || $questionEnded}
      <section class="lobby">
        <h2>Waiting Room</h2>
        <ul class="player-list">
          {#each $players as player (player.id)}
            <li>{player.nickname}</li>
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

        <button class="btn-primary" onclick={openPicker}>Ask a Question</button>
      </section>

      {#if showPicker}
        <div class="modal-backdrop" onclick={(e) => { if (e.target === e.currentTarget) showPicker = false; }}>
          <div class="modal">
            <div class="modal-header">
              <h3>New Question</h3>
              <div class="tabs">
                <button class="tab {pickerTab === 'custom' ? 'active' : ''}" onclick={() => pickerTab = 'custom'}>Custom</button>
                <button class="tab {pickerTab === 'pack' ? 'active' : ''}" onclick={() => { pickerTab = 'pack'; selectedPack = null; }}>From Pack</button>
              </div>
            </div>

            {#if pickerTab === 'custom'}
              <form onsubmit={(e) => { e.preventDefault(); pushQuestion(); }}>
                <div class="type-toggle">
                  <button type="button" class="type-btn {questionType === 'vote' ? 'active' : ''}" onclick={() => questionType = 'vote'}>Vote</button>
                  <button type="button" class="type-btn {questionType === 'freetext' ? 'active' : ''}" onclick={() => questionType = 'freetext'}>Hot Take</button>
                </div>
                <label>
                  Question
                  <input
                    type="text"
                    bind:value={customPrompt}
                    placeholder={questionType === 'vote' ? 'Best villain ever?' : 'What would your supervillain name be?'}
                    autofocus
                    maxlength="200"
                  />
                </label>
                {#if questionType === 'vote'}
                  <fieldset>
                    <legend>Options</legend>
                    {#each customOptions as _, i}
                      <input type="text" bind:value={customOptions[i]} placeholder="Option {i + 1}" maxlength="60" />
                    {/each}
                    {#if customOptions.length < 4}
                      <button type="button" class="btn-ghost" onclick={() => customOptions = [...customOptions, ""]}>
                        + Add option
                      </button>
                    {/if}
                  </fieldset>
                {/if}
                <button class="btn-primary" type="submit">Push Question</button>
              </form>
            {:else}
              <div class="pack-browser">
                {#if !selectedPack}
                  <div class="pack-grid">
                    {#each packs as pack}
                      <button class="pack-card" onclick={() => selectedPack = pack}>
                        <span class="pack-emoji">{pack.emoji}</span>
                        <span class="pack-name">{pack.name}</span>
                        <span class="pack-count">{pack.questions.length} questions</span>
                      </button>
                    {/each}
                  </div>
                {:else}
                  <div class="pack-questions">
                    <button class="btn-ghost back-btn" onclick={() => selectedPack = null}>← Back</button>
                    <h4>{selectedPack.emoji} {selectedPack.name}</h4>
                    {#each selectedPack.questions as q}
                      <button class="question-card" onclick={() => askPackQuestion(q)}>
                        <span class="q-prompt">{q.prompt}</span>
                        <span class="q-badge {q.type}">{q.type === 'vote' ? 'Vote' : 'Hot Take'}</span>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/if}

    {:else}
      <section class="active-question">
        <h2>{$currentQuestion.prompt}</h2>
        <p class="vote-tally">{totalVotes} / {totalPlayers} responded</p>

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

        <button class="btn-primary" onclick={nextQuestion}>Next Question</button>
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
                    <div class="history-row">
                      <span>{opt}</span>
                      <span class="count">{count}</span>
                    </div>
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

  .room-code {
    font-size: 2rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    color: #ff4d00;
    flex: 1;
  }

  .player-count {
    color: #888;
    font-size: 0.875rem;
  }

  .content { flex: 1; }

  .lobby h2, .active-question h2 {
    font-size: 1.75rem;
    margin: 0 0 1rem;
  }

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
  }

  .empty { color: #555; font-style: italic; }

  .vote-tally { color: #888; margin: 0 0 1.5rem; }

  .bars {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 2rem;
  }

  .bar-row {
    display: grid;
    grid-template-columns: 8rem 1fr 3rem;
    align-items: center;
    gap: 0.75rem;
  }

  .bar-label {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar-track {
    background: #222;
    border-radius: 0.25rem;
    height: 2rem;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background: #ff4d00;
    border-radius: 0.25rem;
    transition: width 0.3s ease;
  }

  .bar-count {
    text-align: right;
    font-weight: 700;
    color: #ccc;
  }

  .freetext-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 2rem;
  }

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

  .result-summary {
    background: #111;
    border-radius: 0.75rem;
    padding: 1rem 1.25rem;
    margin-bottom: 1.5rem;
  }

  .result-summary h3 {
    margin: 0 0 0.75rem;
    font-size: 1rem;
    color: #aaa;
  }

  .result-row {
    display: flex;
    justify-content: space-between;
    padding: 0.25rem 0;
    border-bottom: 1px solid #1e1e1e;
  }

  .count { color: #888; }

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

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .modal-header h3 { margin: 0; font-size: 1.25rem; }

  .tabs {
    display: flex;
    gap: 0.25rem;
    background: #1a1a1a;
    border-radius: 0.5rem;
    padding: 0.2rem;
  }

  .tab {
    padding: 0.35rem 0.85rem;
    border-radius: 0.35rem;
    border: none;
    background: transparent;
    color: #888;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .tab.active {
    background: #ff4d00;
    color: #fff;
  }

  .type-toggle {
    display: flex;
    gap: 0.25rem;
    background: #1a1a1a;
    border-radius: 0.5rem;
    padding: 0.2rem;
  }

  .type-btn {
    flex: 1;
    padding: 0.4rem;
    border-radius: 0.35rem;
    border: none;
    background: transparent;
    color: #888;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .type-btn.active {
    background: #333;
    color: #fff;
  }

  /* Pack browser */
  .pack-browser { display: flex; flex-direction: column; gap: 0.75rem; }

  .pack-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
  }

  .pack-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    padding: 1rem 0.5rem;
    border-radius: 0.75rem;
    border: 2px solid #222;
    background: #1a1a1a;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .pack-card:hover { border-color: #ff4d00; }

  .pack-emoji { font-size: 2rem; }
  .pack-name { font-weight: 700; font-size: 0.9rem; }
  .pack-count { color: #666; font-size: 0.75rem; }

  .pack-questions { display: flex; flex-direction: column; gap: 0.5rem; }

  .pack-questions h4 {
    margin: 0.25rem 0 0.5rem;
    font-size: 1rem;
  }

  .back-btn {
    align-self: flex-start;
    padding: 0;
    font-size: 0.875rem;
  }

  .question-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid #222;
    background: #1a1a1a;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
  }

  .question-card:hover { border-color: #ff4d00; background: #1f0d00; }

  .q-prompt {
    flex: 1;
    font-size: 0.9rem;
    color: #ddd;
  }

  .q-badge {
    flex-shrink: 0;
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.2rem 0.5rem;
    border-radius: 0.25rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .q-badge.vote { background: #1a3a1a; color: #5dde5d; }
  .q-badge.freetext { background: #1a1a3a; color: #7d9fff; }

  /* History */
  .history {
    margin-top: 2rem;
    border-top: 1px solid #222;
    padding-top: 1rem;
  }

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

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 1rem;
  }

  .history-entry {
    background: #111;
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
  }

  .history-q {
    font-size: 0.875rem;
    font-weight: 700;
    color: #aaa;
    margin-bottom: 0.5rem;
  }

  .history-row {
    display: flex;
    justify-content: space-between;
    padding: 0.2rem 0;
    font-size: 0.8rem;
    border-bottom: 1px solid #1e1e1e;
    color: #ccc;
  }

  /* Shared form styles */
  .modal form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  fieldset {
    border: 1px solid #333;
    border-radius: 0.5rem;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  legend { font-size: 0.8rem; color: #888; padding: 0 0.25rem; }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: #ccc;
  }

  input[type="text"] {
    padding: 0.65rem 0.9rem;
    border-radius: 0.5rem;
    border: 2px solid #333;
    background: #1a1a1a;
    color: #fff;
    font-size: 1rem;
    outline: none;
  }

  input[type="text"]:focus { border-color: #ff4d00; }

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

  .btn-ghost {
    background: none;
    border: none;
    color: #666;
    font-size: 0.875rem;
    cursor: pointer;
    text-align: left;
    padding: 0;
  }

  .btn-ghost:hover { color: #aaa; }

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
</style>
