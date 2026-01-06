import { BookmeterApiService } from './bookmeter_api_service';

export type AppEnv = {
	DATABASE_URL: string;
	SUPABASE_URL: string;
	SUPABASE_KEY: string;
	DEBUG?: string;
	BOOKMETER_API: BookmeterApiService;
};
