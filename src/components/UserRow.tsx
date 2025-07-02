import { UserAvatar } from './UserAvatar';
import type { User } from '../types/models';

type UserRowProps = {
	user: User;
	rank: number;
};

export const UserRow = ({ user, rank }: UserRowProps) => {
	return (
		<tr class="hover:bg-gray-50">
			<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{rank}</td>
			<td class="px-6 py-4 whitespace-nowrap">
				<div class="flex items-center">
					<UserAvatar avatarUrl={user.avatar_url} name={user.name} />
					<div class="ml-4">
						<div class="text-sm font-medium text-gray-900">{user.name ?? 'Anonymous'}</div>
						{user.bookmeter_url && (
							<a href={user.bookmeter_url} target="_blank" class="text-sm text-blue-500 hover:text-blue-700">
								View Profile
							</a>
						)}
					</div>
				</div>
			</td>
			<td class="px-6 py-4 whitespace-nowrap">
				<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
					{user.books_read ?? 0}
				</span>
			</td>
			<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.pages_read?.toLocaleString() ?? 0}</td>
		</tr>
	);
};
