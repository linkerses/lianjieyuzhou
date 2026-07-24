ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS booking_note TEXT;
