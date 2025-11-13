type Bookcase = {
	id: number;
	name: string;
	book_count: number;
};

export const getBookcase = async (userId: number, bookcaseName: string): Promise<Bookcase> => {
	const url = `https://bookmeter.com/users/${userId}/bookcases.json?sort=book_count&order=desc`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`HTTPエラー! ステータス: ${response.status}`);
	}
	const data: { bookcases: Bookcase[] } = await response.json();
	const bookcase = data.bookcases.find((bc) => bc.name === bookcaseName);
	if (!bookcase) {
		throw new Error(`本棚 ${bookcaseName} がユーザー ${userId} に見つかりません`);
	}
	return bookcase;
};
