import { createClient } from '@supabase/supabase-js';
import { AppEnv } from '../types/app_env';

export const createSupabaseClient = (env: AppEnv) => {
	if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
		throw new Error('環境変数にSupabaseの設定がありません。');
	}
	return createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
};

export const performKeepAliveQuery = async (env: AppEnv) => {
	const supabase = createSupabaseClient(env);
	try {
		// Execute a simple query to keep the connection alive
		const { data, error } = await supabase.from('metadata').select('last_updated').limit(1);

		if (error) {
			throw error;
		}

		console.log('Supabaseキープアライブクエリ成功:', data);
		return true;
	} catch (error) {
		console.error('Supabaseキープアライブクエリ失敗:', error);
		return false;
	}
};
