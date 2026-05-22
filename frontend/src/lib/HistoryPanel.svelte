<script lang="ts">
  import { questionHistory } from "$lib/stores";

  let showHistory = $state(false);
</script>

{#if $questionHistory.length > 0}
  <section class="history">
    <button class="history-toggle" onclick={() => showHistory = !showHistory}>
      Session History ({$questionHistory.length}) {showHistory ? "▲" : "▼"}
    </button>

    {#if showHistory}
      <div class="history-list">
        {#each $questionHistory as entry, i}
          {@const optionCounts = (entry.question.options ?? []).map(opt => ({
            opt,
            count: entry.votes.filter(v => v.value === opt).length,
            voters: entry.votes.filter(v => v.value === opt).map(v => v.nickname),
          })).sort((a, b) => b.count - a.count)}
          {@const total = entry.votes.length}
          <div class="history-entry">
            <div class="history-header">
              <span class="history-num">Q{i + 1}</span>
              {#if entry.settledOption}
                <span class="history-settled">✅ {entry.settledOption}</span>
              {/if}
            </div>
            <div class="history-prompt">{entry.question.prompt}</div>
            {#if total > 0}
              <div class="history-votes">
                {#each optionCounts as { opt, count, voters }}
                  {@const pct = Math.round((count / total) * 100)}
                  <div class="hv-row {entry.settledOption === opt ? 'winner' : ''}">
                    <div class="hv-top">
                      <span class="hv-opt">{opt}</span>
                      <span class="hv-count">{count}</span>
                    </div>
                    <div class="hv-bar-track">
                      <div class="hv-bar-fill" style="width:{pct}%"></div>
                    </div>
                    {#if voters.length > 0}
                      <div class="hv-names">{voters.join(', ')}</div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>
{/if}

<style>
  .history {
    margin-top: 2rem;
    border-top: 1px solid var(--border);
    padding-top: 1rem;
  }

  .history-toggle {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 0.875rem;
    font-weight: 800;
    cursor: pointer;
    padding: 0;
    font-family: inherit;
    transition: color 0.15s;
  }

  .history-toggle:hover { color: var(--text); }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 1rem;
  }

  .history-entry {
    background: var(--surface);
    border-radius: 0.75rem;
    padding: 0.875rem 1rem;
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .history-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .history-num {
    font-size: 0.7rem;
    font-weight: 800;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .history-settled {
    font-size: 0.75rem;
    font-weight: 800;
    color: var(--success);
    background: rgba(96, 192, 128, 0.1);
    padding: 0.15rem 0.5rem;
    border-radius: 0.35rem;
    border: 1px solid rgba(96, 192, 128, 0.25);
  }

  .history-prompt {
    font-size: 0.9rem;
    font-weight: 800;
    color: var(--text);
    line-height: 1.3;
  }

  .history-votes {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-top: 0.15rem;
  }

  .hv-row {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .hv-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .hv-opt {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-muted);
  }

  .hv-row.winner .hv-opt { color: var(--success); }

  .hv-count {
    font-size: 0.75rem;
    font-weight: 800;
    color: var(--text-dim);
  }

  .hv-bar-track {
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
  }

  .hv-bar-fill {
    height: 100%;
    background: var(--border);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .hv-row.winner .hv-bar-fill {
    background: var(--success);
    box-shadow: 0 0 6px rgba(96, 192, 128, 0.3);
  }

  .hv-names {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--text-dim);
  }
</style>
