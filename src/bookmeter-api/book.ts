import { safeParseUTCDate } from '../utils/string';

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
type Metadata = {
	sort: string;
	order: string;
	offset: number;
	limit: number;
	count: number;
};

type BookmeterUserReadsResponse = {
	metadata: Metadata;
	resources: Array<{
		id: number;
		bookcase_names: string[];
		created_at: string;
		page: number;
		book: {
			id: number;
			title: string;
			image_url: string;
			author: {
				name: string;
				path: string;
			};
		};
	}>;
};

type PagedUserReadsResponse = {
	metadata: Metadata;
	reads: UserReadData[];
};

const PER_PAGE = 24;

const fetchUserReadsByPage = async (
	id: number,
	page: number,
	bookcase: string | null
): Promise<PagedUserReadsResponse> => {
	const url = `https://bookmeter.com/users/${id}/books/read.json?page=${page}&limit=${PER_PAGE}`;
	console.log(`URL取得中: ${url}`);
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`HTTPエラー! ステータス: ${response.status}`);
	}

	const data: BookmeterUserReadsResponse = await response.json();
	const reads: UserReadData[] = [];
	for (const resource of data.resources) {
		if (bookcase && !resource.bookcase_names.includes(bookcase)) {
			continue;
		}
		reads.push({
			id: resource.id,
			book_id: resource.book.id,
			page: resource.page,
			title: resource.book.title,
			author: resource.book.author.name,
			author_url: resource.book.author.path,
			thumbnail_url: resource.book.image_url,
			date: resource.created_at ? safeParseUTCDate(resource.created_at) : null,
		});
	}
	return {
		metadata: data.metadata,
		reads: reads,
	};
};

export type FetchAllUserReadsResult = {
	reads: UserReadData[];
	books_read: number;
	pages_read: number;
};
export const fetchAllUserReads = async (
	id: number,
	bookcase: string | null,
	original_books_read: number
): Promise<FetchAllUserReadsResult> => {
	const reads: UserReadData[] = [];
	const pageTotal = Math.ceil(original_books_read / PER_PAGE);
	const promises = [];
	for (let page = 1; page <= pageTotal; page++) {
		promises.push(fetchUserReadsByPage(id, page, bookcase));
	}
	const results = await Promise.all(promises);
	for (const result of results) {
		const { reads: pageReads } = result;
		reads.push(...pageReads);
	}

	return {
		reads: reads,
		books_read: reads.length,
		pages_read: reads.reduce((acc, book) => acc + (book.page || 0), 0),
	};
};
