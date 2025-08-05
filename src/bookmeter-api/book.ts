import { safeParseUTCDate } from '../utils/string-utils';

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

type BookmeterUserReadsResponse = {
	metadata: {
		sort: string;
		order: string;
		offset: number;
		limit: number;
		count: number;
	};
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

export type FetchAllUserReadsResult = {
	reads: UserReadData[];
	books_read: number;
	pages_read: number;
};
export const fetchAllUserReads = async (
	id: number,
	bookcase: string | null
): Promise<FetchAllUserReadsResult> => {
	const reads: UserReadData[] = [];
	let page = 1;
	let hasMorePages = true;

	while (hasMorePages) {
		try {
			const url = `https://bookmeter.com/users/${id}/books/read.json?page=${page}&limit=1000`;
			console.log(`Fetching ${url}`);
			const response = await fetch(url);

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data: BookmeterUserReadsResponse = await response.json();

			// Process books from current page
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

			if (data.metadata.offset + data.metadata.limit >= data.metadata.count) {
				hasMorePages = false;
			} else {
				page += 1;
			}
		} catch (error) {
			console.error('Error fetching books:', error);
			throw error;
		}
	}

	return {
		reads: reads,
		books_read: reads.length,
		pages_read: reads.reduce((acc, book) => acc + (book.page || 0), 0),
	};
};
