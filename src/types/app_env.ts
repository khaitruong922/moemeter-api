import { BookmeterApiService } from './bookmeter_api_service';

export type AppEnv = {
	HYPERDRIVE: Hyperdrive;
	SUPABASE_URL: string;
	SUPABASE_KEY: string;
	DEBUG?: string;
	BOOKMETER_API: BookmeterApiService;
	JWT_SECRET: string;
};
