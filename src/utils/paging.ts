export type PageInfo = {
	currentPage: number;
	prevPage: number | null;
	nextPage: number | null;
	lastPage: number;
};

export const getPageInfo = (
	reqPage: number,
	countPerPage: number,
	totalCount: number
): PageInfo => {
	if (countPerPage > totalCount) countPerPage = totalCount;
	const lastPage =
		totalCount % countPerPage == 0
			? totalCount / countPerPage
			: ((totalCount / countPerPage) | 0) + 1;
	const prevPage = reqPage > 1 ? reqPage - 1 : null;
	const nextPage = lastPage > reqPage ? reqPage + 1 : null;

	return {
		currentPage: reqPage,
		prevPage,
		nextPage,
		lastPage,
	};
};
