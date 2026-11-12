CREATE TABLE IF NOT EXISTS solo_release (
  id text PRIMARY KEY, scoring_release text NOT NULL, digest text NOT NULL,
  status text NOT NULL CHECK(status IN ('draft','published')), published_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS solo_source (
  release_id text REFERENCES solo_release, id text, label text NOT NULL, url text NOT NULL,
  license text NOT NULL, version text NOT NULL, PRIMARY KEY(release_id,id)
);
CREATE TABLE IF NOT EXISTS solo_tier (
  release_id text REFERENCES solo_release, name text, points int CHECK(points BETWEEN 1 AND 100),
  PRIMARY KEY(release_id,name), UNIQUE(release_id,name,points)
);
CREATE TABLE IF NOT EXISTS solo_topic (
  release_id text REFERENCES solo_release, name text, PRIMARY KEY(release_id,name)
);
CREATE TABLE IF NOT EXISTS solo_concept (id text PRIMARY KEY);
CREATE TABLE IF NOT EXISTS solo_prompt (
  release_id text REFERENCES solo_release, id text, topic text NOT NULL, prompt text NOT NULL,
  scope text NOT NULL, pool text NOT NULL CHECK(pool IN ('daily','open')),
  PRIMARY KEY(release_id,id), FOREIGN KEY(release_id,topic) REFERENCES solo_topic
);
CREATE TABLE IF NOT EXISTS solo_mapping (
  release_id text, prompt_id text, concept_id text REFERENCES solo_concept, term text NOT NULL,
  tier text NOT NULL, points int NOT NULL, reason text NOT NULL, fact text NOT NULL,
  source_id text NOT NULL, source_label text NOT NULL, source_url text NOT NULL, evidence text NOT NULL,
  PRIMARY KEY(release_id,prompt_id,concept_id),
  FOREIGN KEY(release_id,prompt_id) REFERENCES solo_prompt,
  FOREIGN KEY(release_id,tier,points) REFERENCES solo_tier(release_id,name,points),
  FOREIGN KEY(release_id,source_id) REFERENCES solo_source
);
CREATE TABLE IF NOT EXISTS solo_alias (
  release_id text, prompt_id text, norm text, concept_id text, disposition text NOT NULL
  CHECK(disposition IN ('hit','excluded','ambiguous')), typo_keys text[] NOT NULL,
  PRIMARY KEY(release_id,prompt_id,norm), FOREIGN KEY(release_id,prompt_id) REFERENCES solo_prompt,
  FOREIGN KEY(release_id,prompt_id,concept_id) REFERENCES solo_mapping,
  CHECK((disposition='hit')=(concept_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS solo_known_spelling ON solo_alias(release_id,norm);
CREATE INDEX IF NOT EXISTS solo_typo_keys ON solo_alias USING gin(typo_keys);
CREATE TABLE IF NOT EXISTS solo_issue (
  date text PRIMARY KEY, number integer UNIQUE NOT NULL, release_id text NOT NULL REFERENCES solo_release,
  reset_at bigint NOT NULL, grace_until bigint NOT NULL, UNIQUE(date,release_id)
);
CREATE TABLE IF NOT EXISTS solo_issue_slot (
  date text, slot int CHECK(slot BETWEEN 1 AND 7), release_id text NOT NULL, prompt_id text NOT NULL,
  PRIMARY KEY(date,slot), UNIQUE(date,prompt_id),
  FOREIGN KEY(date,release_id) REFERENCES solo_issue(date,release_id),
  FOREIGN KEY(release_id,prompt_id) REFERENCES solo_prompt
);
CREATE INDEX IF NOT EXISTS solo_reserved ON solo_issue_slot(prompt_id,date);
CREATE TABLE IF NOT EXISTS solo_run (
  id text PRIMARY KEY, actor_id text NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK(mode IN ('daily','practice','archive')),
  date text NOT NULL, release_id text NOT NULL REFERENCES solo_release,
  ranked boolean NOT NULL DEFAULT false, untimed boolean NOT NULL DEFAULT false,
  phase text NOT NULL CHECK(phase IN ('prompt','reveal','recap','expired')),
  take int NOT NULL CHECK(take BETWEEN 1 AND 7), total int NOT NULL CHECK(total BETWEEN 0 AND 700),
  created_at bigint NOT NULL, completed_at bigint, expires_at bigint,
  CHECK(NOT ranked OR mode='daily'), CHECK(NOT untimed OR mode='practice')
);
CREATE UNIQUE INDEX IF NOT EXISTS solo_one_ranked ON solo_run(actor_id,date) WHERE ranked;
CREATE INDEX IF NOT EXISTS solo_history ON solo_run(actor_id,created_at DESC,id);
CREATE INDEX IF NOT EXISTS solo_totals ON solo_run(date,total DESC,actor_id) WHERE ranked AND completed_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS solo_round (
  id text UNIQUE NOT NULL, run_id text NOT NULL REFERENCES solo_run ON DELETE CASCADE,
  slot int CHECK(slot BETWEEN 1 AND 7), release_id text NOT NULL, prompt_id text NOT NULL,
  opened_at bigint, deadline bigint, PRIMARY KEY(run_id,slot), UNIQUE(run_id,prompt_id),
  FOREIGN KEY(release_id,prompt_id) REFERENCES solo_prompt
);
CREATE TABLE IF NOT EXISTS solo_outcome (
  round_id text PRIMARY KEY REFERENCES solo_round(id) ON DELETE CASCADE,
  status text NOT NULL CHECK(status IN ('accepted','skipped','timeout')), concept_id text,
  release_id text NOT NULL, prompt_id text NOT NULL, points int NOT NULL CHECK(points BETWEEN 0 AND 100),
  receipt bigint NOT NULL, FOREIGN KEY(release_id,prompt_id,concept_id) REFERENCES solo_mapping,
  CHECK((status='accepted' AND concept_id IS NOT NULL AND points>0) OR
        (status<>'accepted' AND concept_id IS NULL AND points=0))
);
CREATE INDEX IF NOT EXISTS solo_answer_counts ON solo_outcome(release_id,prompt_id,concept_id);
CREATE TABLE IF NOT EXISTS solo_cmd (
  actor_id text REFERENCES principals(id) ON DELETE CASCADE, id text, signature text NOT NULL,
  response jsonb NOT NULL, created_at bigint NOT NULL, PRIMARY KEY(actor_id,id)
);
CREATE TABLE IF NOT EXISTS solo_seen (
  actor_id text REFERENCES principals(id) ON DELETE CASCADE, prompt_id text, last_seen bigint NOT NULL,
  PRIMARY KEY(actor_id,prompt_id)
);
CREATE TABLE IF NOT EXISTS solo_unlock (
  actor_id text REFERENCES principals(id) ON DELETE CASCADE, milestone int CHECK(milestone IN (3,7,14)),
  earned_at bigint NOT NULL, PRIMARY KEY(actor_id,milestone)
);
CREATE TABLE IF NOT EXISTS solo_report (
  id text PRIMARY KEY, actor_id text REFERENCES principals(id) ON DELETE CASCADE,
  round_id text NOT NULL REFERENCES solo_round(id) ON DELETE CASCADE, note text NOT NULL CHECK(length(note) BETWEEN 1 AND 280),
  created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS solo_report_limit ON solo_report(actor_id,created_at DESC);
CREATE TABLE IF NOT EXISTS solo_leader_cache (
 date text PRIMARY KEY REFERENCES solo_issue, epoch bigint NOT NULL DEFAULT 0,
 cached_epoch bigint NOT NULL DEFAULT -1, counts jsonb, updated_at bigint
);
CREATE OR REPLACE VIEW solo_ranked AS
 SELECT r.actor_id,r.date,r.total,r.completed_at,r.id AS run_id FROM solo_run r
 JOIN principals p ON p.id=r.actor_id AND NOT p.excluded WHERE r.ranked AND r.completed_at IS NOT NULL;
CREATE OR REPLACE VIEW solo_observed_frequency AS
 SELECT o.release_id,o.prompt_id,o.concept_id,count(*) AS accepted_finished_runs
 FROM solo_ranked s JOIN solo_round r ON r.run_id=s.run_id JOIN solo_outcome o ON o.round_id=r.id
 WHERE o.status='accepted' GROUP BY o.release_id,o.prompt_id,o.concept_id;

CREATE OR REPLACE FUNCTION solo_guard_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'INSERT' OR EXISTS(SELECT 1 FROM solo_release WHERE id=NEW.release_id AND status='published')
 THEN RAISE EXCEPTION 'Published revisions are immutable'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['solo_source','solo_tier','solo_topic','solo_prompt','solo_mapping','solo_alias'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS freeze_content ON %I',tab);
  EXECUTE format('CREATE TRIGGER freeze_content BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION solo_guard_content()',tab);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION solo_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Issue and outcome records are immutable'; END $$;
DO $$ DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['solo_issue','solo_issue_slot'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS freeze_issued ON %I',tab);
  EXECUTE format('CREATE TRIGGER freeze_issued BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION solo_immutable()',tab);
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS freeze_result ON solo_outcome;
CREATE TRIGGER freeze_result BEFORE UPDATE ON solo_outcome FOR EACH ROW EXECUTE FUNCTION solo_immutable();
CREATE OR REPLACE FUNCTION solo_guard_release() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status='published' OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Release is published'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS freeze_release ON solo_release;
CREATE TRIGGER freeze_release BEFORE UPDATE OR DELETE ON solo_release FOR EACH ROW EXECUTE FUNCTION solo_guard_release();

CREATE OR REPLACE FUNCTION solo_dirty_board() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected text;
BEGIN
 IF TG_OP<>'DELETE' AND NEW.ranked AND NEW.completed_at IS NOT NULL THEN
  affected=NEW.date;
 ELSIF TG_OP<>'INSERT' AND OLD.ranked AND OLD.completed_at IS NOT NULL THEN
  affected=OLD.date;
 END IF;
 IF affected IS NOT NULL THEN
  INSERT INTO solo_leader_cache(date,epoch) VALUES(affected,1)
  ON CONFLICT(date) DO UPDATE SET epoch=solo_leader_cache.epoch+1;
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS dirty_run ON solo_run;
CREATE TRIGGER dirty_run AFTER UPDATE OF ranked,completed_at,actor_id OR DELETE ON solo_run FOR EACH ROW EXECUTE FUNCTION solo_dirty_board();
CREATE OR REPLACE FUNCTION solo_dirty_exclusions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.excluded IS DISTINCT FROM OLD.excluded THEN
  INSERT INTO solo_leader_cache(date,epoch)
   SELECT date,1 FROM solo_run WHERE actor_id=NEW.id AND ranked AND completed_at IS NOT NULL ORDER BY date
   ON CONFLICT(date) DO UPDATE SET epoch=solo_leader_cache.epoch+1;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS dirty_exclusions ON principals;
CREATE TRIGGER dirty_exclusions AFTER UPDATE OF excluded ON principals FOR EACH ROW EXECUTE FUNCTION solo_dirty_exclusions();

-- Enforce the scoring proof even for another writer using the same DB role.
-- Separate indexes keep this migration idempotent for existing installations.
CREATE UNIQUE INDEX IF NOT EXISTS solo_run_release_pair ON solo_run(id,release_id);
CREATE UNIQUE INDEX IF NOT EXISTS solo_round_proof ON solo_round(id,release_id,prompt_id);
CREATE UNIQUE INDEX IF NOT EXISTS solo_mapping_score_proof ON solo_mapping(release_id,prompt_id,concept_id,points);
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='solo_round'::regclass AND conname='pinned_run_release') THEN
  ALTER TABLE solo_round ADD CONSTRAINT pinned_run_release FOREIGN KEY(run_id,release_id) REFERENCES solo_run(id,release_id) ON DELETE CASCADE;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='solo_outcome'::regclass AND conname='pinned_round_evidence') THEN
  ALTER TABLE solo_outcome ADD CONSTRAINT pinned_round_evidence FOREIGN KEY(round_id,release_id,prompt_id) REFERENCES solo_round(id,release_id,prompt_id) ON DELETE CASCADE;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='solo_outcome'::regclass AND conname='pinned_mapping_points') THEN
  ALTER TABLE solo_outcome ADD CONSTRAINT pinned_mapping_points FOREIGN KEY(release_id,prompt_id,concept_id,points) REFERENCES solo_mapping(release_id,prompt_id,concept_id,points);
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS solo_report_review (
 report_id text PRIMARY KEY REFERENCES solo_report(id) ON DELETE CASCADE,
 disposition text NOT NULL CHECK(disposition IN ('no-change','added')),
 release_id text REFERENCES solo_release(id), reviewed_at bigint NOT NULL,
 CHECK((disposition='added')=(release_id IS NOT NULL))
);
