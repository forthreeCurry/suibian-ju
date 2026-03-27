-- 让 preferences 支持 Realtime（等待大厅监听他人提交）
-- 在 Supabase SQL Editor 执行一次即可

alter publication supabase_realtime add table public.preferences;
