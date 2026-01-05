// Copied from bookmeter-api
type UserReadData = {
	id: number;
	book_id: number;
	title: string;
	author: string;
	author_url: string;
	thumbnail_url: string;
	page: number;
	date: Date | null;
};
type FetchUserReadsOfPagesResponse = {
	reads: UserReadData[];
	read_pages_count: number;
};
//

export interface ApiService {
	fetchUserReadsOfPages(
		id: number,
		pageStart: number,
		pageEnd: number,
		perPage: number,
		bookcase: string | null
	): Promise<FetchUserReadsOfPagesResponse>;
}

export type AppEnv = {
	DATABASE_URL: string;
	SUPABASE_URL: string;
	SUPABASE_KEY: string;
	DEBUG?: string;
	BOOKMETER_API: ApiService;
};
