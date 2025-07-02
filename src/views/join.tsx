import { Layout } from '../components/Layout';
import { JoinForm } from '../components/JoinForm';

export const joinView = () => {
	return (
		<Layout
			title="読書メーター追加機能 | グループに参加"
			children={
				<div class="max-w-4xl mx-auto">
					<div class="mb-8">
						<h2 class="text-xl font-bold text-gray-800 mb-2">グループに参加</h2>
						<p class="text-sm text-gray-600">
							読書メーターのプロフィールURLとグループのパスワードを入力して、読書グループに参加しましょう。
							グループメンバーと一緒に読書の記録を共有できます。
						</p>
					</div>
					<JoinForm />
				</div>
			}
		/>
	);
};
