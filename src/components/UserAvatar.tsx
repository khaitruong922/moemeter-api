import { html } from 'hono/html';

type UserAvatarProps = {
	avatarUrl?: string | null;
	name?: string | null;
};

export const UserAvatar = ({ avatarUrl, name }: UserAvatarProps) => {
	if (avatarUrl) {
		return <img class="h-10 w-10 rounded-full" src={avatarUrl} alt="" />;
	}

	return (
		<div class="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
			<span class="text-gray-500 text-sm">{name?.[0]?.toUpperCase() ?? '?'}</span>
		</div>
	);
};
