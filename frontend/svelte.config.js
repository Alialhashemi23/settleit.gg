import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// Cloudflare Workers with static assets. The generated _worker.js is wrapped by
		// worker.ts, which forwards /api/* (including WebSocket upgrades) to the
		// API Worker through a service binding before SvelteKit ever sees the request.
		adapter: adapter({ routes: { include: ['/*'], exclude: ['<all>'] } })
	}
};

export default config;
