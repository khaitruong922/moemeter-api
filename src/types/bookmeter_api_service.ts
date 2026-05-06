export type UserReadData = {
	id: number;
	book_id: number;
	title: string;
	author: string;
	author_url: string;
	thumbnail_url: string;
	page: number;
	date: Date | null;
	index: number;
};
type FetchUserReadsOfPagesResponse = {
	reads: UserReadData[];
	pages_read: number;
};

export type FetchBookSeriesResult = {
	seriesId: number;
	seriesName: string;
} | null;

export type SeriesBook = {
	id: number;
	title: string;
	author: string;
	author_url: string;
	thumbnail_url: string;
	page: number | null;
	series_number: number;
};

export interface BookmeterApiService {
	fetchUserReadsOfPages(
		id: number,
		pageStart: number,
		pageEnd: number,
		perPage: number,
		bookcase: string | null,
		blacklistedBookIds: Set<number>
	): Promise<FetchUserReadsOfPagesResponse>;
	fetchBookSeries(bookId: number): Promise<FetchBookSeriesResult>;
	fetchSeriesBooks(seriesId: number): Promise<SeriesBook[]>;
}
