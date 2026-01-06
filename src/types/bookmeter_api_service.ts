export type UserReadData = {
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
	pages_read: number;
};

export interface BookmeterApiService {
	fetchUserReadsOfPages(
		id: number,
		pageStart: number,
		pageEnd: number,
		perPage: number,
		bookcase: string | null
	): Promise<FetchUserReadsOfPagesResponse>;
}
