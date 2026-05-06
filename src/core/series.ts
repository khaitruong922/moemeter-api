import postgres from 'postgres';
import { bulkUpsertBooks } from '../db/books';
import { Book } from '../db/models';
import {
	applySeriesMerges,
	markSeriesFetched,
	selectBooksNeedingSeriesFetch,
	updateSeriesIdForBookAndVariants,
	upsertSeries,
} from '../db/series';
import { BookmeterApiService, SeriesBook } from '../types/bookmeter_api_service';

const BATCH_SIZE = 50;

const mapSeriesBookToBook = (b: SeriesBook): Book => ({
	id: b.id,
	title: b.title,
	author: b.author,
	author_url: b.author_url,
	thumbnail_url: b.thumbnail_url,
	page: b.page,
});

export const syncSeriesForBook = async (
	sql: postgres.Sql<{}>,
	bookmeterApiService: BookmeterApiService,
	bookId: number
): Promise<void> => {
	const result = await bookmeterApiService.fetchBookSeries(bookId);

	if (result === null) {
		await markSeriesFetched(sql, [bookId]);
		return;
	}

	await upsertSeries(sql, { id: result.seriesId, name: result.seriesName });

	const seriesBooks = result.books.map(mapSeriesBookToBook);
	await bulkUpsertBooks(sql, seriesBooks);

	const allBookIds = [...new Set([bookId, ...result.books.map((b) => b.id)])];
	await updateSeriesIdForBookAndVariants(sql, allBookIds, result.seriesId);
	await markSeriesFetched(sql, allBookIds);
	await applySeriesMerges(sql);
};

export const syncBookSeries = async (
	sql: postgres.Sql<{}>,
	bookmeterApiService: BookmeterApiService
): Promise<void> => {
	const processedBookIds = new Set<number>();
	const books = await selectBooksNeedingSeriesFetch(sql, BATCH_SIZE);

	for (const book of books) {
		console.log(`シリーズを同期中: 書籍ID ${book.id}...`);
		if (processedBookIds.has(book.id)) continue;

		await syncSeriesForBook(sql, bookmeterApiService, book.id);

		processedBookIds.add(book.id);
	}

	console.log(`シリーズ同期完了: ${processedBookIds.size}冊処理済み`);
};
