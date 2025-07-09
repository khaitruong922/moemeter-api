import { Hono } from 'hono';
import { AppEnv } from '../types/app_env';

const app = new Hono<{ Bindings: AppEnv }>();

export default app;
