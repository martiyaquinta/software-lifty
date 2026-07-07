ALTER TABLE driver_documents ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'pending_review';
ALTER TABLE driver_documents ADD COLUMN IF NOT EXISTS superseded_at timestamp;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS documents_pending_review boolean NOT NULL DEFAULT false;

-- Backfill: documents that were already verified stay approved.
UPDATE driver_documents SET status = 'approved' WHERE verified_at IS NOT NULL AND status = 'pending_review';
