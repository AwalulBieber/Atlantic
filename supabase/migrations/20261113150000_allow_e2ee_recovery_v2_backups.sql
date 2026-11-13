-- Preserve legacy v1 backups while allowing the automatic v2 format.
-- No backup rows are rewritten by this migration.
alter table public.profile_e2ee_recovery_backups
  drop constraint if exists profile_e2ee_recovery_backups_shape;

alter table public.profile_e2ee_recovery_backups
  add constraint profile_e2ee_recovery_backups_shape check (
    jsonb_typeof(backup) = 'object'
    and backup->>'version' in ('1', '2')
    and backup->>'kdf' = 'PBKDF2-SHA256'
    and backup ?& array['iterations','salt','iv','ciphertext','publicJwk']
    and pg_column_size(backup) < 16384
  );
