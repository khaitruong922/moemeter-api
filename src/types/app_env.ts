export interface ApiService {
	fetchUserReadsOfPages(
		id: number,
		pageStart: number,
		pageEnd: number,
		perPage: number,
		bookcase: string | null
	): Promise<any>;
}

export type AppEnv = {
	DATABASE_URL: string;
	SUPABASE_URL: string;
	SUPABASE_KEY: string;
	DEBUG?: string;
	BOOKMETER_API: ApiService;
};
