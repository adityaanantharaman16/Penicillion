REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO night_play;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO night_play;
GRANT INSERT,UPDATE,DELETE ON principals,identities,sessions,login_attempts,friend_groups,memberships,invitations,blocks,group_bans,rooms,seats,room_commands,room_events,solo_run,solo_round,solo_cmd,solo_seen,solo_unlock,solo_leader_cache TO night_play;
GRANT INSERT,DELETE ON solo_outcome,solo_report TO night_play;
GRANT UPDATE(actor_id) ON solo_report TO night_play;
