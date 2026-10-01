-- Client documents are read by the Extract agent, which refuses files over
-- 25 MB. Enforce the same limit at upload so oversized files never land.
UPDATE storage.buckets
SET file_size_limit = 26214400
WHERE id = 'ca-client-documents'
  AND (file_size_limit IS NULL OR file_size_limit > 26214400);
