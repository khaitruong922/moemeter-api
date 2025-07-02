import { UserRow } from './UserRow';
import type { User } from '../types/models';

type LeaderboardTableProps = {
	users: User[];
};

export const LeaderboardTable = ({ users }: LeaderboardTableProps) => {
	return (
		<div class="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-100">
			<div class="bookmeter-green text-white px-6 py-3 text-lg font-bold">読書ランキング</div>
			<table class="min-w-full">
				<thead class="bg-gray-50 border-b border-gray-200">
					<tr>
						<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">順位</th>
						<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ユーザー</th>
						<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">読んだ本</th>
						<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">読んだページ</th>
					</tr>
				</thead>
				<tbody class="bg-white divide-y divide-gray-200">
					{users.map((user, index) => (
						<UserRow user={user} rank={index + 1} />
					))}
				</tbody>
			</table>
		</div>
	);
};
