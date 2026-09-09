-- MOSTIK v5.2.4 — extend selectable animal avatar icons from 7 to 14.
-- Existing avatar_icon values remain unchanged; only invalid values are normalized.
UPDATE animals
SET avatar_icon = (1 + (get_byte(decode(substr(md5(id),1,2),'hex'),0) % 14))::text
WHERE avatar_icon IS NULL
   OR avatar_icon NOT IN ('1','2','3','4','5','6','7','8','9','10','11','12','13','14');
