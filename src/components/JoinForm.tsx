export const JoinForm = () => {
	return (
		<div class="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md">
			<h2 class="text-2xl font-bold text-gray-800 mb-6">ランキングに参加</h2>
			<form method="POST">
				<div class="space-y-6">
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-2" for="bookmeter_url">
							読書メーターのプロフィールURL
						</label>
						<input
							type="url"
							id="bookmeter_url"
							name="bookmeter_url"
							required
							placeholder="https://bookmeter.com/users/..."
							class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-200 focus:border-bookmeter-green outline-none"
						/>
						<p class="mt-2 text-xs text-gray-500">あなたの読書メーターのプロフィールURLを入力してください。</p>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-700 mb-2" for="group">
							グループ
						</label>
						<select
							id="group"
							name="group"
							required
							class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-200 focus:border-bookmeter-green outline-none bg-white"
						>
							<option value="tmw_novel">TMW Novel Club</option>
						</select>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-700 mb-2" for="password">
							パスワード
						</label>
						<input
							type="password"
							id="password"
							name="password"
							required
							class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-200 focus:border-bookmeter-green outline-none"
						/>
						<p class="mt-2 text-xs text-gray-500">グループに参加するためのパスワードを入力してください。</p>
					</div>

					<div class="flex justify-end">
						<button type="submit" class="join-button">
							参加する
						</button>
					</div>
				</div>
			</form>
		</div>
	);
};
