import { createClient } from '@supabase/supabase-js';
import { AppEnv } from '../types/app_env';

export const createSupabaseClient = (env: AppEnv) => {
	if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
		throw new Error('Supabase configuration is missing in environment variables.');
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

		console.log('Supabase keep-alive query successful:', data);
		return true;
	} catch (error) {
		console.error('Supabase keep-alive query failed:', error);
		return false;
	}
};
