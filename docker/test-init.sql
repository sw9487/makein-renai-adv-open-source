-- Installed once at container init. pg_stat_statements is a DB-global
-- extension, not schema-scoped, so it must NOT be created inside per-test
-- migrations (concurrent migrations race the global CREATE EXTENSION and
-- throw duplicate-key on pg_extension_name_index). Leave it to init.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;