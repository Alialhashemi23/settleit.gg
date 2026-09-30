declare global {
	namespace App {
		interface Platform {
			env: {
				API: Fetcher;
				ASSETS: Fetcher;
			};
			context: ExecutionContext;
		}
	}
}

export {};
