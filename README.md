# Bookmeter API

[読書メーター](https://bookmeter.com/)の各種情報を取得するRESTful APIです．

APIは全てGETリクエストのみを使用します．

## APIs

### Books

- 読んだ本 - `/users/{userId}/books/read`
- 読んでる本 - `/users/{userId}/books/reading`
- 積読中 - `/users/{userId}/books/stacked`
- 読みたい本 - `/users/{userId}/books/wish`

#### Optional Params

- `limit` - The number of results to fetch per page. Default is `20`.
- `page` - The page number to fetch. Default is `1`.
- `order` - Accepts `1` to indicate ascending order. Default is Desc.
- `pretty` - Flag of JSON pretty printing.

```http
GET /users/618830/books/read?pretty&limit=3&page=1&order=1
```

```json
{
  "books": [
    {
      "no": 1,
      "title": "数学ガール/ゲーデルの不完全性定理 (数学ガールシリーズ 3)",
      "url": "https://bookmeter.com/books/579988",
      "author": "結城 浩",
      "authorUrl": "https://bookmeter.com/search?author=%E7%B5%90%E5%9F%8E+%E6%B5%A9",
      "thumb": "https://m.media-amazon.com/images/I/514bGkTG2BL._SL500_.jpg",
      "date": "日付不明"
    },
    {
      "no": 2,
      "title": "ドグラ・マグラ(上) (角川文庫 緑 366-3)",
      "url": "https://bookmeter.com/books/570685",
      "author": "夢野 久作",
      "authorUrl": "https://bookmeter.com/search?author=%E5%A4%A2%E9%87%8E+%E4%B9%85%E4%BD%9C",
      "thumb": "https://m.media-amazon.com/images/I/41wwx3FSyFL._SL500_.jpg",
      "date": "日付不明"
    },
    {
      "no": 3,
      "title": "ドグラ・マグラ(下) (角川文庫 緑 366-4)",
      "url": "https://bookmeter.com/books/570188",
      "author": "夢野 久作",
      "authorUrl": "https://bookmeter.com/search?author=%E5%A4%A2%E9%87%8E+%E4%B9%85%E4%BD%9C",
      "thumb": "https://m.media-amazon.com/images/I/41510Rl6QPL._SL500_.jpg",
      "date": "日付不明"
    }
  ],
  "count": 3,
  "totalCount": 961,
  "pageInfo": {
    "currentPage": 1,
    "prevPage": null,
    "nextPage": 2,
    "lastPage": 321
  }
}
```

### Summary

- 月間まとめ - `/users/{userId}/summary/monthly/{year}/{month}`
- 年間まとめ - `/users/{userId}/summary/yearly/{year}`

#### Optional Params

- `limit` - The number of results to fetch per page. Default is `100`.
- `page` - The page number to fetch. Default is `1`.
- `order` - Accepts `1` to indicate ascending order. Default is Desc.
- `pretty` - Flag of JSON pretty printing.

```http
GET /users/618830/summary/monthly/2024/1?pretty&limit=1&page=53
```

```json
{
  "books": [
    {
      "no": 1,
      "title": "ときときチャンネル 宇宙飲んでみた (創元日本SF叢書)",
      "url": "https://bookmeter.com/books/21557218",
      "author": "宮澤 伊織",
      "authorUrl": "https://bookmeter.com/search?author=%E5%AE%AE%E6%BE%A4+%E4%BC%8A%E7%B9%94",
      "thumb": "https://m.media-amazon.com/images/I/51L6d84hbDL._SL500_.jpg",
      "date": "2024/01/01"
    }
  ],
  "count": 1,
  "totalCount": 53,
  "totalPages": 17535,
  "totalReviews": 0,
  "totalNice": 0,
  "pageInfo": {
    "currentPage": 53,
    "prevPage": 52,
    "nextPage": null,
    "lastPage": 53
  }
}
```

### Users

**将来実装されます．**

- ユーザーページ
- 著者リスト
- 本棚

## Errors

次のHTTPステータスコードが主に発生します． - `404`，`400`，`500`

Bookmeterに由来するエラー（例：無効なユーザーID）の場合，メッセージ先頭に`"Bookmeter:"`が付与されます．

### Sample response (404):

```json
{
  "errors": [
    {
      "message": "Bookmeter: Not found"
    }
  ]
}
```