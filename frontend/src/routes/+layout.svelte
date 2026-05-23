<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	let { children } = $props();
</script>

<svelte:head>
	<title>Settle It</title>
	<link rel="icon" href={favicon} />
	<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
	<link rel="manifest" href="/manifest.json" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta name="theme-color" content="#e8831a" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
	<meta name="apple-mobile-web-app-title" content="Settle It" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" />
	<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;800;900&display=swap" rel="stylesheet" />
</svelte:head>

{@render children()}

<style>
	:global(:root) {
		--bg: #0d0905;
		--surface: #1a1208;
		--surface-raised: #241a0e;
		--border: #3d2e1a;
		--accent: #e8831a;
		--accent-alpha: rgba(232, 131, 26, 0.28);
		--accent-hover: #f09030;
		--text: #f5ede0;
		--text-muted: #a08060;
		--text-dim: #5c4433;
		--success: #60c080;
		--error: #e05050;
	}

	:global(*, *::before, *::after) {
		box-sizing: border-box;
	}

	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--text);
		font-family: 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		-webkit-font-smoothing: antialiased;
	}

	:global(button) {
		font-family: inherit;
		touch-action: manipulation;
	}
</style>
