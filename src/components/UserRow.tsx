import { UserAvatar } from './UserAvatar';
import type { User } from '../types/models';

type UserRowProps = {
	user: User;
	rank: number;
};

export const UserRow = ({ user, rank }: UserRowProps) => {
	return (
		<tr class="hover:bg-gray-50">
			<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{rank}位</td>
			<td class="px-6 py-4 whitespace-nowrap">
				<div class="flex items-center">
					<UserAvatar avatarUrl={user.avatar_url} name={user.name} />
					<div class="ml-4">
						<div class="text-sm font-medium text-gray-900">
							<a
								href={`https://bookmeter.com/users/${user.id}`}
								target="_blank"
								rel="noopener noreferrer"
								class="bookmeter-link hover:underline"
							>
								{user.name ?? '匿名'}
							</a>
						</div>
						{user.bookmeter_url && (
							<a href={user.bookmeter_url} target="_blank" class="bookmeter-link text-sm">
								プロフィール
							</a>
						)}
					</div>
				</div>
			</td>
			<td class="px-6 py-4 whitespace-nowrap">
				<span class="px-2 inline-flex text-sm font-medium bookmeter-green-text">{user.books_read ?? 0}冊</span>
			</td>
			<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.pages_read?.toLocaleString() ?? 0}</td>
		</tr>
	);
};
