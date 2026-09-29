ALTER TABLE public.ca_document_extractions
  DROP CONSTRAINT IF EXISTS ca_document_extractions_review_state_check;

ALTER TABLE public.ca_document_extractions
  ADD CONSTRAINT ca_document_extractions_review_state_check
  CHECK (review_state IN ('pending','auto_accepted','needs_review','posted','rejected','failed','pending_verification'));