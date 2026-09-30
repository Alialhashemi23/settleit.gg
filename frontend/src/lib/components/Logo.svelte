<script lang="ts">
	let { size = 72 }: { size?: number } = $props();
</script>

<svg class="flame" viewBox="0 0 60 80" width={size} height={size * 4 / 3} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
	<defs>
		<radialGradient id="outerFire" cx="50%" cy="85%" r="75%">
			<stop offset="0%" stop-color="#ffd166" />
			<stop offset="45%" stop-color="#e8831a" />
			<stop offset="100%" stop-color="#a03000" />
		</radialGradient>
		<radialGradient id="innerFire" cx="50%" cy="75%" r="65%">
			<stop offset="0%" stop-color="#fffbe0" />
			<stop offset="50%" stop-color="#ffd166" />
			<stop offset="100%" stop-color="#e8831a" />
		</radialGradient>
	</defs>
	<path d="M30 76 C13 66 5 49 10 31 C13 20 21 15 25 25 C20 10 29 1 30 0 C31 1 40 10 35 25 C39 15 47 20 50 31 C55 49 47 66 30 76Z" fill="url(#outerFire)" class="outer" />
	<path d="M30 64 C21 56 17 43 20 32 C22 25 27 23 29 29 C26 19 30 9 30 9 C30 9 34 19 31 29 C33 23 38 25 40 32 C43 43 39 56 30 64Z" fill="url(#innerFire)" opacity="0.95" class="inner" />
	<ellipse cx="30" cy="52" rx="6" ry="9" fill="#fffbe0" opacity="0.6" />
</svg>

<style>
	.flame { display: block; filter: drop-shadow(0 0 14px rgba(232, 131, 26, 0.5)); }
	.outer { animation: flicker 1.8s ease-in-out infinite alternate; transform-origin: 30px 76px; }
	.inner { animation: flickerInner 1.3s ease-in-out infinite alternate; transform-origin: 30px 64px; }
	@keyframes flicker { 0% { transform: scaleX(1) scaleY(1) rotate(-1deg); } 100% { transform: scaleX(0.98) scaleY(1.03) rotate(1deg); } }
	@keyframes flickerInner { 0% { transform: scaleX(1) scaleY(1); opacity: 0.95; } 100% { transform: scaleX(0.96) scaleY(1.04); opacity: 1; } }
	@media (prefers-reduced-motion: reduce) { .outer, .inner { animation: none; } }
</style>
