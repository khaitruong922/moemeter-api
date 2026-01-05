export type AppEnv = {
	DATABASE_URL: string;
	SUPABASE_URL: string;
	SUPABASE_KEY: string;
	DEBUG?: string;
	BOOKMETER_API: Fetcher;
};
