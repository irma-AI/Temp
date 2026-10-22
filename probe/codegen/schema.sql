CREATE TYPE status AS ENUM ('draft', 'live', 'archived');
CREATE TABLE tenant (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);
CREATE TABLE note (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  status status NOT NULL DEFAULT 'draft',
  title text NOT NULL CHECK (length(title) <= 200),
  body jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  score numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_log (id bigserial PRIMARY KEY, note_id bigint REFERENCES note(id), at timestamptz NOT NULL DEFAULT now(), detail text);
CREATE VIEW live_note AS SELECT id, title FROM note WHERE status = 'live';
