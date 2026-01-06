import { BookmeterApiService, UserReadData } from '../types/bookmeter_api_service';

const PER_PAGE = 24;
const MAX_PAGE_COUNT_PER_REQUEST = 50;

export type FetchAllUserReadsResult = {
	reads: UserReadData[];
	books_read: number;
	pages_read: number;
};
export const fetchAllUserReadsV2 = async (
	bookmeterApiService: BookmeterApiService,
	id: number,
	bookcase: string | null,
	original_books_read: number
): Promise<FetchAllUserReadsResult> => {
	const reads: UserReadData[] = [];
	let pages_read = 0;
	const pageTotal = Math.ceil(original_books_read / PER_PAGE);
	const pagePartitions = [];

	for (let i = 1; i <= pageTotal; i += MAX_PAGE_COUNT_PER_REQUEST) {
		const pageStart = i;
		const pageEnd = Math.min(i + MAX_PAGE_COUNT_PER_REQUEST - 1, pageTotal);
		pagePartitions.push({ pageStart, pageEnd });
	}

	const promises = pagePartitions.map(({ pageStart, pageEnd }) =>
		bookmeterApiService.fetchUserReadsOfPages(id, pageStart, pageEnd, PER_PAGE, bookcase)
	);

	console.log(
		'Bookmeter API読みます... ユーザーID:',
		id,
		'ページ数:',
		pageTotal,
		'本棚:',
		bookcase
	);
	const results = await Promise.all(promises);
	for (const result of results) {
		const { reads: partitionReads } = result;
		reads.push(...partitionReads);
		console.log(`取得済みの読書数: ${reads.length} / ${original_books_read}`);
		pages_read += result.pages_read;
	}

	return {
		reads,
		books_read: reads.length,
		pages_read,
	};
};
