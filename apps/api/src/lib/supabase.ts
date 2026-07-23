import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('[WARN] SUPABASE_URL or SUPABASE_SERVICE_KEY not set. Using placeholder.');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// 获取当前登录的联结者CID（从JWT或请求头中提取）
export function getCurrentCid(req: any): string | null {
  // V0.2: 从请求头 X-Connector-CID 获取（小程序端由Auth中间件注入）
  const cid = req.headers['x-connector-cid'];
  return cid || null;
}
