-- MOSTIK v5.2.3 — selectable animal avatar icons
ALTER TABLE animals ADD COLUMN IF NOT EXISTS avatar_icon text;
UPDATE animals
SET avatar_icon = CASE
  WHEN avatar_icon IN ('1','2','3','4','5','6','7') THEN avatar_icon
  ELSE (1 + (get_byte(decode(substr(md5(id),1,2),'hex'),0) % 7))::text
END
WHERE avatar_icon IS NULL OR avatar_icon NOT IN ('1','2','3','4','5','6','7');
ALTER TABLE animals ALTER COLUMN avatar_icon SET DEFAULT '1';
