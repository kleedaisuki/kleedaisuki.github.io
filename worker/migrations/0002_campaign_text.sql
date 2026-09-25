-- 为新活动保存可选的纯文本模板；旧活动保留 NULL 并使用原有回退。
-- Store an optional plain-text template for new campaigns; legacy rows retain NULL and the old fallback.
ALTER TABLE campaigns ADD COLUMN text TEXT;
