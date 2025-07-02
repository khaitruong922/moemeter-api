import { Layout } from './Layout';

type ErrorPageProps = {
	message?: string;
};

export const ErrorPage = ({ message = 'Failed to load leaderboard. Please try again later.' }: ErrorPageProps) => {
	return (
		<Layout
			title="Error - Bookmeter Leaderboard"
			children={
				<div class="h-[80vh] flex items-center justify-center">
					<div class="text-center">
						<h1 class="text-2xl font-bold text-red-600 mb-4">Error</h1>
						<p class="text-gray-600">{message}</p>
					</div>
				</div>
			}
		/>
	);
};
