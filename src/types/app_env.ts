import { BookmeterApiService } from './bookmeter_api_service';

export type AppEnv = {
	HYPERDRIVE: Hyperdrive;
	SUPABASE_URL: string;
	SUPABASE_KEY: string;
	DEBUG?: string;
	// 'true' makes the cron sync re-import every user instead of skipping unchanged ones.
	// Local only, set by `npm run dev:full-sync`.
	FORCE_FULL_SYNC?: string;
	BOOKMETER_API: BookmeterApiService;
	JWT_SECRET: string;
};
