import app from "../../src/routes/user-books";

const firstReadBookData = {
  no: 1,
  title: '数学ガール/ゲーデルの不完全性定理 (数学ガールシリーズ 3)',
  url: 'https://bookmeter.com/books/579988',
  author: '結城 浩',
  authorUrl: 'https://bookmeter.com/search?author=%E7%B5%90%E5%9F%8E+%E6%B5%A9',
  thumb: 'https://m.media-amazon.com/images/I/514bGkTG2BL._SL500_.jpg',
  date: '日付不明',
}

describe('GET /users/:id/books/read', () => {
  it('Should return books with GET /users/618830/books/read', async () => {
    const res = await app.request('/users/618830/books/read');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data['books']).not.toBeUndefined();
    expect(data['count']).toBe(20);
    expect(data['totalCount']).toBeGreaterThanOrEqual(1);
    expect(data['pageInfo']['currentPage']).toBe(1);
    expect(data['pageInfo']['prevPage']).toBeNull();
    expect(data['totalCount'] / data['count'] <= data['pageInfo']['lastPage']).toBeTruthy();
  });

  it('Should return books with GET /users/618830/books/read?page=1&limit=1&order=1', async () => {
    const res = await app.request('/users/618830/books/read?page=1&limit=1&order=1');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data['books'][0]).toEqual(firstReadBookData);
    expect(data['books'][1]).toBeUndefined();
    expect(data['books'][0]['no']).toBe(1);
    expect(data['count']).toBe(1);
    expect(data['totalCount'] == data['pageInfo']['lastPage']).toBeTruthy();
    expect(data['pageInfo']['currentPage']).toBe(1);
    expect(data['pageInfo']['prevPage']).toBeNull();
  });
  
  it('Should return 404 response: bad url', async () => {
    const res = await app.request('/users/0/0/books/read');
    expect(res.status).toBe(404);
  });
  
  it('Should return 400 response: non-existent id', async () => {
    const res = await app.request('/users/0/books/read');
    expect(res.status).toBe(400);
  });
});

describe('GET /users/:id/books/reading', () => {
  it('Should return books with GET /users/618830/books/reading', async () => {
    const res = await app.request('/users/618830/books/reading');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data['books']).not.toBeUndefined();
    expect(data['count']).toBeGreaterThanOrEqual(1);
    expect(data['totalCount']).toBeGreaterThanOrEqual(1);
    expect(data['pageInfo']['currentPage']).toBe(1);
    expect(data['pageInfo']['prevPage']).toBeNull();
    expect(data['totalCount'] / data['count'] <= data['pageInfo']['lastPage']).toBeTruthy();
  });

  it('Should return books with GET /users/618830/books/reading?page=1&limit=1&order=1', async () => {
    const res = await app.request('/users/618830/books/reading?page=1&limit=1&order=1');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data['books'][0]).not.toBeUndefined();
    expect(data['books'][1]).toBeUndefined();
    expect(data['books'][0]['no']).toBe(1);
    expect(data['count']).toBe(1);
    expect(data['totalCount'] == data['pageInfo']['lastPage']).toBeTruthy();
    expect(data['pageInfo']['currentPage']).toBe(1);
    expect(data['pageInfo']['prevPage']).toBeNull();
  });
  
  it('Should return 404 response: bad url', async () => {
    const res = await app.request('/users/0/0/books/reading');
    expect(res.status).toBe(404);
  });
  
  it('Should return 400 response: non-existent id', async () => {
    const res = await app.request('/users/0/books/reading');
    expect(res.status).toBe(400);
  });
});

describe('GET /users/:id/books/stacked', () => {
  it('Should return books with GET /users/618830/books/stacked', async () => {
    const res = await app.request('/users/618830/books/stacked');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data['books']).not.toBeUndefined();
    expect(data['count']).toBeGreaterThanOrEqual(1);
    expect(data['totalCount']).toBeGreaterThanOrEqual(1);
    expect(data['pageInfo']['currentPage']).toBe(1);
    expect(data['pageInfo']['prevPage']).toBeNull();
    expect(data['totalCount'] / data['count'] <= data['pageInfo']['lastPage']).toBeTruthy();
  });

  it('Should return books with GET /users/618830/books/stacked?page=1&limit=1&order=1', async () => {
    const res = await app.request('/users/618830/books/stacked?page=1&limit=1&order=1');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data['books'][0]).not.toBeUndefined();
    expect(data['books'][1]).toBeUndefined();
    expect(data['books'][0]['no']).toBe(1);
    expect(data['count']).toBe(1);
    expect(data['totalCount'] == data['pageInfo']['lastPage']).toBeTruthy();
    expect(data['pageInfo']['currentPage']).toBe(1);
    expect(data['pageInfo']['prevPage']).toBeNull();
  });
  
  it('Should return 404 response: bad url', async () => {
    const res = await app.request('/users/0/0/books/stacked');
    expect(res.status).toBe(404);
  });
  
  it('Should return 400 response: non-existent id', async () => {
    const res = await app.request('/users/0/books/stacked');
    expect(res.status).toBe(400);
  });
});

describe('GET /users/:id/books/wish', () => {
  it('Should return books with GET /users/618830/books/wish', async () => {
    const res = await app.request('/users/618830/books/wish');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data['books']).not.toBeUndefined();
    expect(data['count']).toBeGreaterThanOrEqual(1);
    expect(data['totalCount']).toBeGreaterThanOrEqual(1);
    expect(data['pageInfo']['currentPage']).toBe(1);
    expect(data['pageInfo']['prevPage']).toBeNull();
    expect(data['totalCount'] / data['count'] <= data['pageInfo']['lastPage']).toBeTruthy();
  });

  it('Should return books with GET /users/618830/books/wish?page=1&limit=1&order=1', async () => {
    const res = await app.request('/users/618830/books/wish?page=1&limit=1&order=1');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data['books'][0]).not.toBeUndefined();
    expect(data['books'][1]).toBeUndefined();
    expect(data['books'][0]['no']).toBe(1);
    expect(data['count']).toBe(1);
    expect(data['totalCount'] == data['pageInfo']['lastPage']).toBeTruthy();
    expect(data['pageInfo']['currentPage']).toBe(1);
    expect(data['pageInfo']['prevPage']).toBeNull();
  });
  
  it('Should return 404 response: bad url', async () => {
    const res = await app.request('/users/0/0/books/wish');
    expect(res.status).toBe(404);
  });
  
  it('Should return 400 response: non-existent id', async () => {
    const res = await app.request('/users/0/books/wish');
    expect(res.status).toBe(400);
  });
});