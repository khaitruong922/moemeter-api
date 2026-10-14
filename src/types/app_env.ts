import { BookmeterApiService } from './bookmeter_api_service';

export type AppEnv = {
	HYPERDRIVE: Hyperdrive;
	SUPABASE_URL: string;
	SUPABASE_KEY: string;
	DEBUG?: string;
	// 'true' makes the cron sync re-import every user instead of skipping unchanged ones.
	// Local only, set by `npm run dev:full-sync`.
	FORCE_FULL_SYNC?: string;
	// 'true' closes each DB client after use. Local only (.dev.vars): a long-lived wrangler dev
	// otherwise keeps every connection open until the Supabase pooler hits its client limit.
	CLOSE_DB_CONNECTIONS?: string;
	BOOKMETER_API: BookmeterApiService;
	JWT_SECRET: string;
};
