-- Drop enum type only if it exists (PostgreSQL)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AppointmentStatus') THEN
    DROP TYPE "AppointmentStatus";
  END IF;
END $$;
