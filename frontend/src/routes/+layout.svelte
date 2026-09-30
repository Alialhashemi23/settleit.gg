<script lang="ts">
	import '$lib/app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { afterNavigate } from '$app/navigation';
	import { trackPageView } from '$lib/telemetry';
	let { children } = $props();
	afterNavigate((nav) => trackPageView(nav.to?.url.pathname ?? '/'));
</script>

<svelte:head>
	<title>Settle It</title>
	<link rel="icon" href={favicon} />
	<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
	<link rel="manifest" href="/manifest.json" />
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
	<meta name="theme-color" content="#e8831a" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
	<meta name="apple-mobile-web-app-title" content="Settle It" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" />
	<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;800;900&display=swap" rel="stylesheet" />
</svelte:head>

{@render children()}
