import type { User } from '../types/models';
import { Layout } from '../components/Layout';
import { LeaderboardTable } from '../components/LeaderboardTable';

export const leaderboardView = (users: User[]) => {
	return (
		<Layout
			title="読書メーター | 読書ランキング"
			children={
				<>
					<div class="max-w-4xl mx-auto">
						<div class="mb-8">
							<h2 class="text-xl font-bold text-gray-800 mb-2">読書ランキング</h2>
							<p class="text-sm text-gray-600">読書メーターのユーザーの読書量ランキングです。</p>
						</div>
						<LeaderboardTable users={users} />
						<div class="mt-6 text-center text-xs text-gray-500">
							最終更新: {new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
						</div>
					</div>
				</>
			}
		/>
	);
};
