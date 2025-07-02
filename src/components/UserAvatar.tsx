import { html } from 'hono/html';

type UserAvatarProps = {
	avatarUrl?: string | null;
	name?: string | null;
};

export const UserAvatar = ({ avatarUrl, name }: UserAvatarProps) => {
	if (avatarUrl) {
		return <img class="h-12 w-12 rounded-full border-2 border-gray-200" src={avatarUrl} alt="" />;
	}

	return (
		<div class="h-12 w-12 rounded-full border-2 border-gray-200 bg-white flex items-center justify-center">
			<span class="text-gray-400 text-sm font-medium">{name?.[0]?.toUpperCase() ?? '?'}</span>
		</div>
	);
};
