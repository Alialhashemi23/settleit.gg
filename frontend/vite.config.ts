import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Local development: `bun run dev` here plus `bun run dev` in workers/api (port 8787).
// The proxy keeps /api same-origin, including WebSocket upgrades.
export default defineConfig({
	plugins: [sveltekit()],
	server: {
		allowedHosts: ['settleit.gg', 'www.settleit.gg'],
		proxy: {
			'/api': { target: 'http://localhost:8787', changeOrigin: false, ws: true }
		}
	}
});
