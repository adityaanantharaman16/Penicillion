CREATE TABLE IF NOT EXISTS principals(
 id text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('guest','account')),
 handle text, listed boolean NOT NULL DEFAULT false, share_answers boolean NOT NULL DEFAULT false,
 excluded boolean NOT NULL DEFAULT false, created_at bigint NOT NULL, claimed_by text
);
CREATE UNIQUE INDEX IF NOT EXISTS unique_handle ON principals(lower(handle)) WHERE handle IS NOT NULL;
CREATE TABLE IF NOT EXISTS identities(
 issuer text NOT NULL, subject text NOT NULL, actor text NOT NULL REFERENCES principals ON DELETE CASCADE,
 PRIMARY KEY(issuer,subject)
);
CREATE TABLE IF NOT EXISTS sessions(
 digest text PRIMARY KEY, actor text NOT NULL REFERENCES principals ON DELETE CASCADE,
 csrf text NOT NULL, expires bigint NOT NULL, pending_guest text REFERENCES principals ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS sessions_actor ON sessions(actor);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
CREATE TABLE IF NOT EXISTS login_attempts(
 state text PRIMARY KEY, session_digest text NOT NULL REFERENCES sessions ON DELETE CASCADE,
 verifier text NOT NULL, nonce text NOT NULL, expires bigint NOT NULL);
CREATE TABLE IF NOT EXISTS friend_groups(
 id text PRIMARY KEY, name text NOT NULL, created_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS memberships(
 gid text REFERENCES friend_groups ON DELETE CASCADE, actor text REFERENCES principals ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('owner','member')), joined bigint NOT NULL, PRIMARY KEY(gid,actor));
CREATE INDEX IF NOT EXISTS member_groups ON memberships(actor,gid);
CREATE TABLE IF NOT EXISTS invitations(
 digest text PRIMARY KEY, gid text NOT NULL REFERENCES friend_groups ON DELETE CASCADE, expires bigint NOT NULL);
CREATE INDEX IF NOT EXISTS invites_group ON invitations(gid);
CREATE TABLE IF NOT EXISTS blocks(
 actor text REFERENCES principals ON DELETE CASCADE, target text REFERENCES principals ON DELETE CASCADE,
 PRIMARY KEY(actor,target));
CREATE TABLE IF NOT EXISTS group_bans(gid text REFERENCES friend_groups ON DELETE CASCADE, actor text REFERENCES principals ON DELETE CASCADE,PRIMARY KEY(gid,actor));
CREATE TABLE IF NOT EXISTS rooms(
 code text PRIMARY KEY, host text NOT NULL, status text NOT NULL CHECK(status IN ('lobby','playing','finished','expired')),
 quick boolean NOT NULL, epoch integer NOT NULL DEFAULT 0, version integer NOT NULL DEFAULT 1, active text, winner text,
 prompt_id text, prompt_text text, scope text, prompt_count integer, used text[] NOT NULL DEFAULT '{}',
 previous_prompts text[] NOT NULL DEFAULT '{}', fuse bigint, updated bigint NOT NULL, expires bigint NOT NULL,
 notice text NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS room_expiry ON rooms(status,expires);
CREATE INDEX IF NOT EXISTS room_fuse ON rooms(fuse) WHERE status='playing';
CREATE TABLE IF NOT EXISTS seats(
 code text REFERENCES rooms ON DELETE CASCADE, actor text NOT NULL REFERENCES principals ON DELETE CASCADE,
 n integer NOT NULL, ready boolean NOT NULL DEFAULT false, lives integer NOT NULL DEFAULT 3 CHECK(lives BETWEEN 0 AND 3),
 charge integer NOT NULL DEFAULT 0 CONSTRAINT seat_charge_points CHECK(charge BETWEEN 0 AND 99), last_seen bigint NOT NULL, departed boolean NOT NULL DEFAULT false,
 PRIMARY KEY(code,actor), UNIQUE(code,n));
CREATE INDEX IF NOT EXISTS seat_actor ON seats(actor);
CREATE UNIQUE INDEX IF NOT EXISTS one_current_seat ON seats(actor) WHERE NOT departed;
CREATE TABLE IF NOT EXISTS room_commands(
 code text REFERENCES rooms ON DELETE CASCADE, actor text NOT NULL, cmd text NOT NULL, signature text NOT NULL,
 result jsonb NOT NULL, PRIMARY KEY(code,actor,cmd));
CREATE TABLE IF NOT EXISTS room_events(
 code text REFERENCES rooms ON DELETE CASCADE, seq integer NOT NULL, message text NOT NULL, committed_at bigint NOT NULL,
 PRIMARY KEY(code,seq));

ALTER TABLE room_events ADD COLUMN IF NOT EXISTS epoch integer;
ALTER TABLE room_events ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'update';
ALTER TABLE room_events ADD COLUMN IF NOT EXISTS motion jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS one_room_timeout ON room_events(code,epoch) WHERE kind='timeout';

-- Existing saves used three focus tokens per life. Use the old constraint as
-- the one-time migration marker and replace it in the same transaction.
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='seats'::regclass AND conname='seats_charge_check') THEN
  ALTER TABLE seats DROP CONSTRAINT seats_charge_check;
  UPDATE seats SET charge=charge*33 WHERE charge<>0;
  ALTER TABLE seats ADD CONSTRAINT seat_charge_points CHECK(charge BETWEEN 0 AND 99);
 END IF;
END $$;

-- A new seat for the same principal is a new authorization lifetime.
ALTER TABLE seats ADD COLUMN IF NOT EXISTS occupied_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE room_commands ADD COLUMN IF NOT EXISTS occupied_id uuid;
