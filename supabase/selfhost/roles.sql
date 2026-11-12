-- Runs once, when the database volume is first created (mounted into the supabase/postgres init-scripts).
-- The image ships these roles without a usable password; the services connect with POSTGRES_PASSWORD.
\set pgpass `echo "$POSTGRES_PASSWORD"`

alter user authenticator with password :'pgpass';
alter user supabase_auth_admin with password :'pgpass';
alter user supabase_storage_admin with password :'pgpass';
