import app from '../../src/routes/summary';

const firstBookMonthly202401Data = {
	no: 1,
	title: 'ときときチャンネル 宇宙飲んでみた (創元日本SF叢書)',
	url: 'https://bookmeter.com/books/21557218',
	author: '宮澤 伊織',
	authorUrl: 'https://bookmeter.com/search?author=%E5%AE%AE%E6%BE%A4+%E4%BC%8A%E7%B9%94',
	thumbnailUrl: 'https://m.media-amazon.com/images/I/51L6d84hbDL._SL500_.jpg',
	date: '2024/01/01',
};

describe('GET /users/:id/summary/monthly/:year/:month', () => {
	it('Should return books with GET /users/618830/summary/monthly/2024/1', async () => {
		const res = await app.request('/users/618830/summary/monthly/2024/1');
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data['books'][52]).toEqual(firstBookMonthly202401Data);
		expect(data['count']).toBe(53);
		expect(data['totalCount']).toBe(53);
		expect(data['totalPages']).toBe(17535);
		expect(data['totalReviews']).toBe(0);
		expect(data['totalNice']).toBe(0);
		expect(data['pageInfo']['currentPage']).toBe(1);
		expect(data['pageInfo']['prevPage']).toBeNull();
		expect(data['pageInfo']['nextPage']).toBeNull();
		expect(data['pageInfo']['lastPage']).toBe(1);
	});

	it('Should return books with GET /users/618830/summary/monthly/2024/1?page=1&per_page=1&order=1', async () => {
		const res = await app.request('/users/618830/summary/monthly/2024/1?page=1&per_page=1&order=1');
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data['books'][0]).toEqual(firstBookMonthly202401Data);
		expect(data['books'][1]).toBeUndefined();
		expect(data['books'][0]['no']).toBe(1);
		expect(data['count']).toBe(1);
		expect(data['totalCount'] == data['pageInfo']['lastPage']).toBeTruthy();
		expect(data['totalPages']).toBe(17535);
		expect(data['totalReviews']).toBe(0);
		expect(data['totalNice']).toBe(0);
		expect(data['pageInfo']['currentPage']).toBe(1);
		expect(data['pageInfo']['prevPage']).toBeNull();
	});

	it('Should return books with GET /users/618830/summary/monthly/2018/1', async () => {
		const res = await app.request('/users/618830/summary/monthly/2018/1');
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data['books'][0]).toBeUndefined();
		expect(data['count']).toBe(0);
		expect(data['totalPages']).toBe(0);
		expect(data['totalReviews']).toBe(0);
		expect(data['totalNice']).toBe(0);
		expect(data['pageInfo']['currentPage']).toBe(1);
		expect(data['pageInfo']['prevPage']).toBeNull();
		expect(data['pageInfo']['nextPage']).toBeNull();
		expect(data['pageInfo']['lastPage']).toBe(1);
	});

	it('Should return 404 response: bad url', async () => {
		const res = await app.request('/users/0/0/summary/monthly/2024/1');
		expect(res.status).toBe(404);
	});

	it('Should return 400 response: non-existent id', async () => {
		const res = await app.request('/users/0/summary/monthly/2024/1');
		expect(res.status).toBe(400);
	});

	it('Should return 500 response: invalid month (0)', async () => {
		const res = await app.request('/users/618830/summary/monthly/2024/0');
		expect(res.status).toBe(500);
	});

	it('Should return 500 response: invalid month (13)', async () => {
		const res = await app.request('/users/618830/summary/monthly/2024/13');
		expect(res.status).toBe(500);
	});

	it('Should return 404 response: invalid year (0)', async () => {
		const res = await app.request('/users/618830/summary/monthly/0/1');
		expect(res.status).toBe(404);
	});

	it('Should return 404 response: invalid year (20000)', async () => {
		const res = await app.request('/users/618830/summary/monthly/20000/1');
		expect(res.status).toBe(404);
	});
});
