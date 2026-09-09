CREATE TABLE IF NOT EXISTS animal_attention (
  id text PRIMARY KEY,
  animal_id text NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'Другое',
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(animal_id, title)
);
CREATE INDEX IF NOT EXISTS animal_attention_animal_idx ON animal_attention(animal_id, title);

ALTER TABLE skills ADD COLUMN IF NOT EXISTS mastered boolean NOT NULL DEFAULT false;

INSERT INTO animal_attention(id,animal_id,category,title) VALUES
('demo-att-baikal-1','demo-animal-baikal','Аллергия','Аллергия на курицу'),
('demo-att-baikal-2','demo-animal-baikal','Поведение','Чувствителен к резким звукам'),
('demo-att-dymka-1','demo-animal-dymka','Зрение/слух','Плохой слух на одно ухо'),
('demo-att-keks-1','demo-animal-keks','Здоровье','Чувствительное пищеварение'),
('demo-att-grey-1','demo-animal-grey','Поведение','Не любит резкие движения'),
('demo-att-tori-1','demo-animal-tori','Здоровье','Требуется контроль температуры')
ON CONFLICT (id) DO NOTHING;

UPDATE skills SET mastered=true WHERE id IN ('demo-skill-baikal-sit','demo-skill-dymka-carrier','demo-skill-grey-step');
