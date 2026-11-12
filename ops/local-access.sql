DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='night_play') THEN
  CREATE ROLE night_play LOGIN PASSWORD 'local-play-only';
 END IF;
END $$;
\ir runtime-grants.sql
