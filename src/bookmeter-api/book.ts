export type BookData = {
	id: number;
	title: string;
	author: string;
	author_url: string;
	thumbnail_url: string;
	page: number;
	date: Date | null;
};

type BookmeterResponse = {
	metadata: {
		sort: string;
		order: string;
		offset: number;
		limit: number;
		count: number;
	};
	resources: Array<{
		id: number;
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

export type FetchAllBooksResult = {
	books: BookData[];
	books_read: number;
	pages_read: number;
};

export async function fetchAllBooks(id: number): Promise<FetchAllBooksResult> {
	const books: BookData[] = [];
	let page = 1;
	let hasMorePages = true;
	console.log('fetching books for user', id);

	while (hasMorePages) {
		try {
			const response = await fetch(
				`https://bookmeter.com/users/${id}/books/read.json?page=${page}`
			);

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data: BookmeterResponse = await response.json();

			// Process books from current page
			data.resources.forEach((resource) => {
				books.push({
					id: resource.book.id,
					page: resource.page,
					title: resource.book.title,
					author: resource.book.author.name,
					author_url: resource.book.author.path,
					thumbnail_url: resource.book.image_url,
					date: resource.created_at ? new Date(resource.created_at) : null,
				});
			});

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
		books,
		books_read: books.length,
		pages_read: books.reduce((acc, book) => acc + (book.page || 0), 0),
	};
}
