import type { User } from '../types/models';
import { Layout } from '../components/Layout';
import { LeaderboardTable } from '../components/LeaderboardTable';
import { ErrorPage } from '../components/ErrorPage';

export const leaderboardView = (users: User[]) => {
	return (
		<Layout
			title="Bookmeter Leaderboard"
			children={
				<>
					<h1 class="text-3xl font-bold text-center mb-8 text-gray-800">📚 Bookmeter Leaderboard</h1>
					<LeaderboardTable users={users} />
					<div class="mt-8 text-center text-sm text-gray-500">Last updated: {new Date().toLocaleString()}</div>
				</>
			}
		/>
	);
};
