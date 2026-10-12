import postgres from 'postgres';
import { bulkUpsertBooks } from '../db/books';
import { Book } from '../db/models';
import {
	markSeriesFetched,
	selectBookAndMergeRelatives,
	selectBlacklistedSeriesIds,
	selectBooksNeedingSeriesFetch,
	upsertBookmeterSeriesBooks,
	upsertSeries,
} from '../db/series';
import { refreshAll } from '../db/users';
import { BookmeterApiService, SeriesBook } from '../types/bookmeter_api_service';

const BATCH_SIZE = 25;

const toBook = (b: SeriesBook): Book => ({
	id: b.id,
	title: b.title,
	author: b.author,
	author_url: b.author_url,
	thumbnail_url: b.thumbnail_url,
	page: b.page,
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

	// series_number is Bookmeter's position in the series list; the fetched book itself is
	// normally among seriesBooks, and gets an unpositioned row if it is not
	const memberships = seriesBooks.map((b) => ({
		book_id: b.id,
		series_id: seriesId,
		position: b.series_number,
	}));
	if (!memberships.some((m) => m.book_id === bookId)) {
		memberships.push({ book_id: bookId, series_id: seriesId, position: null });
	}
	await upsertBookmeterSeriesBooks(sql, memberships);

	const allBookIds = await selectBookAndMergeRelatives(
		sql,
		memberships.map((m) => m.book_id)
	);
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

		const processed = await syncSeriesForBook(
			sql,
			bookmeterApiService,
			book.id,
			blacklistedSeriesIds
		);
		for (const id of processed) processedBookIds.add(id);
	}

	if (processedBookIds.size === 0) {
		console.log('シリーズ同期: 処理する書籍なし、スキップします');
		return;
	}

	await refreshAll(sql);
	console.log(`シリーズ同期完了: ${processedBookIds.size}冊処理済み`);
};
