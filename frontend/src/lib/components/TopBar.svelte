<script lang="ts">
	import { page } from '$app/state';
	import Logo from './Logo.svelte';
	const links = [
		{ href: '/daily', label: 'Daily' },
		{ href: '/topics', label: 'Topics' }
	];
</script>

<header class="topbar">
	<a class="brand" href="/"><Logo size={18} /> Settle It</a>
	<nav>
		{#each links as l}
			<a href={l.href} aria-current={page.url.pathname.startsWith(l.href) ? 'page' : undefined}>{l.label}</a>
		{/each}
	</nav>
</header>
