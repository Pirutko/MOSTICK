-- MOSTIK v5.2.0
-- Access-by-ID uses existing animal_access relation.
-- Keep uniqueness so repeated attachment is idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS animal_access_user_animal_unique
ON animal_access(user_id, animal_id);
