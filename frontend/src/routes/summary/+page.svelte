<script lang="ts">
  import { goto } from "$app/navigation";
  import { questionHistory } from "$lib/stores";

  let history = $questionHistory;

  function playAgain() {
    questionHistory.set([]);
    goto("/");
  }
</script>

<main>
  <div class="container">
    <h1>Session Over 🔥</h1>

    {#if history.length === 0}
      <p class="empty">No questions were asked this session.</p>
    {:else}
      <p class="subtitle">{history.length} question{history.length !== 1 ? "s" : ""} played</p>

      <div class="entries">
        {#each history as entry, i}
          {@const optionCounts = (entry.question.options ?? []).map(opt => ({
            opt,
            count: entry.votes.filter(v => v.value === opt).length,
            voters: entry.votes.filter(v => v.value === opt).map(v => v.nickname),
          }))}
          {@const total = entry.votes.length}
          <div class="entry" style="animation-delay: {i * 80}ms">
            <div class="entry-header">
              <span class="entry-num">Q{i + 1}</span>
              {#if entry.settledOption}
                <span class="settled-badge">✅ Settled: {entry.settledOption}</span>
              {/if}
            </div>
            <h3>{entry.question.prompt}</h3>
            <div class="vote-results">
              {#each optionCounts.sort((a, b) => b.count - a.count) as { opt, count, voters }}
                {@const pct = Math.round((count / Math.max(1, total)) * 100)}
                <div class="bar-row {entry.settledOption === opt ? 'settled' : ''}">
                  <span class="bar-label">{opt}</span>
                  <div class="bar-track">
                    <div class="bar-fill" style="width: {pct}%"></div>
                  </div>
                  <span class="bar-stat">{count}</span>
                </div>
                {#if voters.length > 0}
                  <div class="voter-names">{voters.join(', ')}</div>
                {/if}
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <button class="btn-primary" onclick={playAgain}>New Game</button>
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 2rem 1rem;
    background: radial-gradient(ellipse at 50% 0%, rgba(232, 131, 26, 0.07) 0%, transparent 60%);
  }

  .container {
    width: 100%;
    max-width: 600px;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  h1 {
    font-size: 2.5rem;
    font-weight: 900;
    margin: 0;
    color: var(--accent);
    animation: glowPulse 3s ease-in-out infinite;
  }

  .subtitle { color: var(--text-muted); margin: 0; font-size: 0.95rem; font-weight: 700; }

  .empty { color: var(--text-dim); font-style: italic; font-weight: 600; }

  .entries { display: flex; flex-direction: column; gap: 1rem; }

  .entry {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 1rem;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    animation: bounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  .entry-header { display: flex; align-items: center; gap: 0.5rem; }

  .settled-badge {
    font-size: 0.75rem;
    font-weight: 800;
    color: var(--success);
    background: rgba(96, 192, 128, 0.12);
    padding: 0.2rem 0.6rem;
    border-radius: 0.35rem;
    border: 1px solid rgba(96, 192, 128, 0.3);
  }

  .bar-row.settled .bar-label { color: var(--success); }
  .bar-row.settled .bar-fill { background: var(--success); box-shadow: 0 0 8px rgba(96,192,128,0.3); }

  .voter-names { font-size: 0.75rem; font-weight: 600; color: var(--text-dim); margin-top: -0.25rem; padding-left: 0.25rem; }

  .entry-num { font-size: 0.75rem; font-weight: 800; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; }

  h3 { margin: 0; font-size: 1.1rem; font-weight: 800; line-height: 1.4; color: var(--text); }

  .vote-results { display: flex; flex-direction: column; gap: 0.5rem; }

  .bar-row {
    display: grid;
    grid-template-columns: 1fr 2fr 4.5rem;
    align-items: center;
    gap: 0.6rem;
  }

  .bar-label {
    font-size: 0.875rem;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-muted);
  }

  .bar-track { background: var(--surface-raised); border-radius: 0.35rem; height: 1.5rem; overflow: hidden; border: 1px solid var(--border); }

  .bar-fill { height: 100%; background: var(--accent); border-radius: 0.25rem; box-shadow: 0 0 8px var(--accent-alpha); }

  .bar-stat { font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-align: right; }

  .btn-primary {
    min-height: 52px;
    padding: 0.9rem;
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

  .btn-primary:hover { background: var(--accent-hover); box-shadow: 0 0 24px rgba(232,131,26,0.4), 0 6px 16px rgba(0,0,0,0.4); }
  .btn-primary:active { transform: scale(0.95); }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(24px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes bounceIn {
    0% { opacity: 0; transform: scale(0.88) translateY(10px); }
    60% { transform: scale(1.03); }
    100% { opacity: 1; transform: scale(1); }
  }

  @keyframes glowPulse {
    0%, 100% { text-shadow: 0 0 20px rgba(232, 131, 26, 0.3); }
    50% { text-shadow: 0 0 40px rgba(232, 131, 26, 0.6), 0 0 80px rgba(232, 131, 26, 0.15); }
  }
</style>
