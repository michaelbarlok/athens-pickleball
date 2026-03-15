-- Add city and state to shootout_groups
ALTER TABLE shootout_groups
  ADD COLUMN city TEXT,
  ADD COLUMN state TEXT;
