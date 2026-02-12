
-- Add attachment_url column to bug_reports
ALTER TABLE public.bug_reports ADD COLUMN IF NOT EXISTS attachment_url text;

-- Create storage bucket for bug report attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('bug-attachments', 'bug-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to upload to bug-attachments bucket
CREATE POLICY "Anyone can upload bug attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'bug-attachments');

-- Allow anyone to view bug attachments
CREATE POLICY "Anyone can view bug attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'bug-attachments');
