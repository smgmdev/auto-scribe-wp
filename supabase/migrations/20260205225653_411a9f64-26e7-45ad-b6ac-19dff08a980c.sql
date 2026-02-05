-- Drop the existing CASCADE foreign key constraint
ALTER TABLE public.ai_published_sources 
  DROP CONSTRAINT ai_published_sources_setting_id_fkey;

-- Make setting_id nullable (if not already)
ALTER TABLE public.ai_published_sources 
  ALTER COLUMN setting_id DROP NOT NULL;

-- Re-add the constraint with SET NULL behavior
ALTER TABLE public.ai_published_sources 
  ADD CONSTRAINT ai_published_sources_setting_id_fkey 
  FOREIGN KEY (setting_id) 
  REFERENCES public.ai_publishing_settings(id) 
  ON DELETE SET NULL;