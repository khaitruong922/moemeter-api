import { UserRow } from './UserRow';
import type { User } from '../types/models';

type LeaderboardTableProps = {
	users: User[];
};

export const LeaderboardTable = ({ users }: LeaderboardTableProps) => {
	return (
		<div class="bg-white shadow-lg rounded-lg overflow-hidden">
			<table class="min-w-full">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
						<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
						<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Books Read</th>
						<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pages Read</th>
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
