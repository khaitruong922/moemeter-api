export type SyncStatus = 'success' | 'failed' | 'skipped';
export interface User {
	id: number;
	name: string | null;
	avatar_url: string | null;
	books_read: number | null;
	pages_read: number | null;
	sync_status?: SyncStatus | null;
}

export interface Book {
	id: number;
	title: string | null;
	author: string | null;
	author_url: string | null;
	thumbnail_url: string | null;
}

export interface Read {
	user_id: number;
	book_id: number;
	merged_book_id: number;
	date: Date | null;
}

export interface Group {
	id: number;
	name: string;
}

export interface UserGroup {
	user_id: number;
	group_id: number;
}

export interface Metadata {
	last_updated: Date | null;
}
