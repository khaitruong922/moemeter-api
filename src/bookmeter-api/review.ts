import { safeParseUTCDate } from '../utils/string';

type UserReviewData = {
	id: number;
	content: string | null;
	is_spoiler: boolean | null;
	nice_count: number;
	created_at: Date | null;
};

type BookmeterUserReviewsResponse = {
	metadata: {
		sort: string;
		order: string;
		offset: number;
		limit: number;
		count: number;
	};
	resources: Array<{
		id: number;
		created_at: string | null;
		content: string;
		netabare: {
			netabare: boolean;
		};
		nice: {
			count: number;
		};
	}>;
};

export const fetchAllUserReviews = async (id: number): Promise<UserReviewData[]> => {
	const reviews: UserReviewData[] = [];
	let page = 1;
	let hasMorePages = true;

	while (hasMorePages) {
		try {
			const url = `https://bookmeter.com/users/${id}/reviews.json?page=${page}&limit=1000`;
			console.log(`URL取得中: ${url}`);
			const response = await fetch(url);

			if (!response.ok) {
				throw new Error(`HTTPエラー! ステータス: ${response.status}`);
			}

			const data: BookmeterUserReviewsResponse = await response.json();
			// Process reviews from current page
			for (const resource of data.resources) {
				reviews.push({
					id: resource.id,
					content: resource.content ?? null,
					is_spoiler: resource.netabare?.netabare ?? null,
					nice_count: resource.nice?.count ?? 0,
					created_at: resource.created_at ? safeParseUTCDate(resource.created_at) : null,
				});
			}
			if (data.metadata.offset + data.metadata.limit >= data.metadata.count) {
				hasMorePages = false;
			} else {
				page += 1;
			}
		} catch (error) {
			console.error('レビューの取得エラー:', error);
			throw error;
		}
	}

	return reviews;
};
