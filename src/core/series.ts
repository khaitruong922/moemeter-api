import postgres from 'postgres';
import { bulkUpsertBooks } from '../db/books';
import { Book } from '../db/models';
import {
	markSeriesFetched,
	propagateSeriesNumbers,
	selectBlacklistedSeriesIds,
	selectBooksNeedingSeriesFetch,
	updateSeriesIdForBookAndVariants,
	upsertSeries,
} from '../db/series';
import { refreshAll } from '../db/users';
import { BookmeterApiService, SeriesBook } from '../types/bookmeter_api_service';

const BATCH_SIZE = 50;

const toBook = (b: SeriesBook): Book => ({
	id: b.id,
	title: b.title,
	author: b.author,
	author_url: b.author_url,
	thumbnail_url: b.thumbnail_url,
	page: b.page,
	series_number: b.series_number,
});

const syncSeriesForBook = async (
	sql: postgres.Sql<{}>,
	bookmeterApiService: BookmeterApiService,
	bookId: number,
	blacklistedSeriesIds: Set<number>
): Promise<number[]> => {
	const result = await bookmeterApiService.fetchBookSeries(bookId);

	if (result === null || blacklistedSeriesIds.has(result.seriesId)) {
		await markSeriesFetched(sql, [bookId]);
		return [bookId];
	}

	const { seriesId, seriesName } = result;
	await upsertSeries(sql, { id: seriesId, name: seriesName });

	const seriesBooks = await bookmeterApiService.fetchSeriesBooks(seriesId);
	await bulkUpsertBooks(sql, seriesBooks.map(toBook));

	const initialBookIds = [...new Set([bookId, ...seriesBooks.map((b) => b.id)])];
	const allBookIds = await updateSeriesIdForBookAndVariants(sql, initialBookIds, seriesId);
	await propagateSeriesNumbers(sql, allBookIds);
	await markSeriesFetched(sql, allBookIds);

	return allBookIds;
};

export const syncBookSeries = async (
	sql: postgres.Sql<{}>,
	bookmeterApiService: BookmeterApiService,
	bookIds?: number[]
): Promise<void> => {
	const processedBookIds = new Set<number>();
	const blacklistedSeriesIds = await selectBlacklistedSeriesIds(sql);

	const books = bookIds
		? bookIds.map((id) => ({ id }))
		: await selectBooksNeedingSeriesFetch(sql, BATCH_SIZE);

	console.log(`シリーズを同期する書籍を${books.length}件取得しました`);

	let iteration = 0;
	let skippedCount = 0;
	for (const book of books) {
		if (processedBookIds.has(book.id)) {
			skippedCount++;
			continue;
		}
		console.log('Iteration #', ++iteration, 'Skipped:', skippedCount);

		const processed = await syncSeriesForBook(sql, bookmeterApiService, book.id, blacklistedSeriesIds);
		for (const id of processed) processedBookIds.add(id);
	}

	await refreshAll(sql);
	console.log(`シリーズ同期完了: ${processedBookIds.size}冊処理済み`);
};
