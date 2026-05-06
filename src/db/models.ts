export type SyncStatus = 'success' | 'failed' | 'skipped';
export interface User {
	id: number;
	name: string | null;
	avatar_url: string | null;
	books_read: number | null;
	pages_read: number | null;
	sync_status?: SyncStatus | null;
	registration_date: Date | null;
	first_log_date: Date | null;
	original_books_read: number;
	original_pages_read: number;

	// Bookcase only fields
	bookcase: string | null;

	// Optional fields when processing only
	reviews_count?: number | null;
}

export interface Book {
	id: number;
	title: string | null;
	author: string | null;
	author_url: string | null;
	page: number | null;
	thumbnail_url: string | null;
	series_id?: number | null;
	series_name?: string | null;
	series_number?: number | null;
	last_series_fetched?: Date | null;
}

export interface BookWithReadId extends Book {
	read_id: number;
}

export interface Read {
	id: number;
	user_id: number;
	book_id: number;
	merged_book_id: number;
	date: Date | null;
	index: number;
}

export interface Review {
	id: number;
	content: string | null;
	is_spoiler: boolean | null;
	nice_count: number;
	created_at: Date | null;
}

export interface Group {
	id: number;
	name: string;
}

export interface Metadata {
	last_updated: Date | null;
}
