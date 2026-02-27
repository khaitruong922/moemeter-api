# Moemeter API

A Cloudflare Workers-based API service for aggregating and analyzing reading data from Bookmeter, a Japanese book tracking platform. Built with Hono framework and TypeScript, this API provides endpoints for user statistics, book information, reading trends, and social features.

## Features

- **User Management**: Track and sync user reading data from Bookmeter
- **Book Database**: Comprehensive book information with merge capabilities for duplicate entries
- **Reading Analytics**:
  - Leaderboards (yearly and all-time)
  - "Lonely" book tracking (books read by only one user)
  - Peak reading month analysis
  - Common reads between users
- **Group Support**: Group-based reading analytics and comparisons
- **Automated Syncing**: Scheduled cron jobs for regular data synchronization
- **Review System**: Track and manage user book reviews
- **Blacklist Management**: Filter unwanted books from statistics

## Tech Stack

- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/)
- **Framework**: [Hono](https://hono.dev/) - Ultrafast web framework
- **Database**: [Supabase](https://supabase.com/) (PostgreSQL)
- **Language**: TypeScript
- **Testing**: Jest with Miniflare
- **Package Manager**: npm

## Prerequisites

- Node.js (v18 or later recommended)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (Cloudflare Workers CLI)
- Supabase account and project
- Bookmeter API service (separate microservice)

## Installation

1. Clone the repository:

```bash
git clone https://github.com/khaitruong922/moemeter-api.git
cd moemeter-api
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables in Wrangler:

```bash
# Configure Supabase credentials
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_KEY

# Configure other required secrets as needed
```

## Development

Start the development server:

```bash
npm run dev
# or
npm start
```

The API will be available at `http://localhost:8787`

### Running Tests

```bash
npm test
```

### Code Formatting

```bash
npm run format
```

## Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

## API Endpoints

### Health & Info

- `GET /` - Welcome message
- `GET /health` - Health check endpoint

### Users

- `GET /users/leaderboard` - Get user leaderboard
  - Query params: `period` (this_year), `order` (books/pages)
- `GET /users/lonely-leaderboard` - Get lonely reader leaderboard
  - Query params: `order` (days/book_count)
- `GET /users/:id` - Get user details
- `POST /users/sync` - Sync user data from Bookmeter
- And more user-related endpoints...

### Books

- `GET /books` - List books with pagination
  - Query params: `page`, `per_page`, `q` (search), `field` (title/author), `period`, `user_id`, `lonely`, `latest`
- `GET /books/:id` - Get book details
- And more book-related endpoints...

### Reads

- `GET /reads` - Get reading records
- And more read-related endpoints...

### Other Endpoints

- `/blacklisted_books` - Manage blacklisted books
- `/book_merges` - Manage book merge operations
- `/manual_book_merges` - Manual book merge management
- `/book_merge_exceptions` - Handle merge exceptions
- `/groups` - Group management and analytics
- `/metadata` - System metadata

## Scheduled Jobs

The API includes automated cron jobs configured in `wrangler.jsonc`:

- **Every day at 3:00 and 15:00 UTC** (`0 3,15 * * *`): Full user sync
- **Every 3 minutes during sync hours** (`*/3 3,15 * * *`): Retry failed syncs

## Project Structure

```
src/
├── bookmeter-api/     # Bookmeter API integration
├── core/              # Core business logic
├── db/                # Database queries and models
├── infra/             # Infrastructure utilities
├── jobs/              # Scheduled job handlers
├── middlewares/       # Hono middlewares (auth, etc.)
├── routes/            # API route handlers
├── scraping/          # Web scraping utilities
├── types/             # TypeScript type definitions
└── utils/             # Helper utilities
```

## Database Schema

The database schema can be found in `schema.sql`. Use `schema-pull.sh` to sync the latest schema from Supabase.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

ISC

## Author

khaitruong922

## Acknowledgments

- Built for the Japanese reading community
- Data sourced from [Bookmeter](https://bookmeter.com/)
