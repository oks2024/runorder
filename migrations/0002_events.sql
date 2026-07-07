-- First-party product analytics. One row per tracked event, written by POST /api/events.
--
-- Privacy posture: no cookies, no durable per-person id. `visitor` is a *daily-rotating*
-- salted hash of coarse request signals (IP + UA + day) — enough to count unique visitors
-- within a day, but not linkable across days or back to a person. `user_id` is set only when
-- the request already carries a signed-in session cookie (nullable; most traffic is anon).
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,                    -- event name, e.g. 'pageview', 'pattern_insert'
  path TEXT,                             -- client route/path the event fired on
  props TEXT,                            -- small sanitized JSON object of event metadata, or NULL
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  visitor TEXT NOT NULL,                 -- daily-rotating anonymous hash (see above)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_events_name_created ON events (name, created_at);
CREATE INDEX idx_events_created ON events (created_at);
CREATE INDEX idx_events_visitor ON events (visitor);
