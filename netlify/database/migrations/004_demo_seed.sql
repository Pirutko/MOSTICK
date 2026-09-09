-- MOSTIK demo dataset. Idempotent: safe to deploy once; existing user/real data is preserved.
INSERT INTO users(id,email,display_name,password_hash,role) VALUES
('demo-owner','demo.owner@mostik.local','Анна Владелец','mostik-demo-salt:ff50cbd1457ea36cb28d033c6d310dec8f10c665cfac01a03847c0a2a31cbbe3','owner'),
('demo-trainer','demo.trainer@mostik.local','Илья Тренер','mostik-demo-salt:ff50cbd1457ea36cb28d033c6d310dec8f10c665cfac01a03847c0a2a31cbbe3','trainer'),
('demo-trainer2','demo.trainer2@mostik.local','Марина Тренер','mostik-demo-salt:ff50cbd1457ea36cb28d033c6d310dec8f10c665cfac01a03847c0a2a31cbbe3','trainer'),
('demo-keeper','demo.keeper@mostik.local','Олег Кипер','mostik-demo-salt:ff50cbd1457ea36cb28d033c6d310dec8f10c665cfac01a03847c0a2a31cbbe3','keeper'),
('demo-vet','demo.vet@mostik.local','Елена Ветеринар','mostik-demo-salt:ff50cbd1457ea36cb28d033c6d310dec8f10c665cfac01a03847c0a2a31cbbe3','vet'),
('demo-vet2','demo.vet2@mostik.local','Алексей Ветеринар','mostik-demo-salt:ff50cbd1457ea36cb28d033c6d310dec8f10c665cfac01a03847c0a2a31cbbe3','vet'),
('demo-owner2','demo.owner2@mostik.local','Сергей Владелец','mostik-demo-salt:ff50cbd1457ea36cb28d033c6d310dec8f10c665cfac01a03847c0a2a31cbbe3','owner'),
('demo-owner3','demo.owner3@mostik.local','Наталья Владелец','mostik-demo-salt:ff50cbd1457ea36cb28d033c6d310dec8f10c665cfac01a03847c0a2a31cbbe3','owner'),
('demo-owner4','demo.owner4@mostik.local','Дмитрий Владелец','mostik-demo-salt:ff50cbd1457ea36cb28d033c6d310dec8f10c665cfac01a03847c0a2a31cbbe3','owner'),
('demo-owner5','demo.owner5@mostik.local','Ольга Владелец','mostik-demo-salt:ff50cbd1457ea36cb28d033c6d310dec8f10c665cfac01a03847c0a2a31cbbe3','owner')
ON CONFLICT (id) DO NOTHING;

INSERT INTO animals(id,name,species,breed,owner_id) VALUES
('demo-animal-baikal','Байкал','Собака','Лабрадор-ретривер','demo-owner'),
('demo-animal-dymka','Дымка','Кошка','Британская короткошёрстная','demo-owner2'),
('demo-animal-keks','Кекс','Кролик','Карликовый кролик','demo-owner3'),
('demo-animal-grey','Грей','Птица','Жако','demo-owner4'),
('demo-animal-tori','Тори','Черепаха','Среднеазиатская черепаха','demo-owner5')
ON CONFLICT (id) DO NOTHING;

INSERT INTO animal_access(user_id,animal_id) VALUES
('demo-trainer','demo-animal-baikal'),('demo-trainer','demo-animal-dymka'),('demo-trainer','demo-animal-keks'),
('demo-trainer2','demo-animal-baikal'),('demo-trainer2','demo-animal-grey'),
('demo-keeper','demo-animal-baikal'),('demo-keeper','demo-animal-dymka'),('demo-keeper','demo-animal-keks'),('demo-keeper','demo-animal-grey'),('demo-keeper','demo-animal-tori'),
('demo-vet','demo-animal-baikal'),('demo-vet','demo-animal-dymka'),('demo-vet','demo-animal-keks'),('demo-vet','demo-animal-grey'),('demo-vet','demo-animal-tori'),
('demo-vet2','demo-animal-baikal'),('demo-vet2','demo-animal-tori')
ON CONFLICT DO NOTHING;

INSERT INTO skills(id,animal_id,name,signal,goal) VALUES
('demo-skill-baikal-sit','demo-animal-baikal','Сидеть','Сидеть','Спокойно выполнять сигнал'),
('demo-skill-baikal-place','demo-animal-baikal','Место','Место','Оставаться на коврике'),
('demo-skill-dymka-carrier','demo-animal-dymka','Переноска','В переноску','Спокойно заходить в переноску'),
('demo-skill-keks-hand','demo-animal-keks','Подход к руке','Ко мне','Спокойно подходить к руке'),
('demo-skill-grey-step','demo-animal-grey','Шаг на руку','Шаг','Спокойно переходить на руку'),
('demo-skill-tori-touch','demo-animal-tori','Контакт','Касание','Спокойно переносить осмотр')
ON CONFLICT (id) DO NOTHING;

INSERT INTO skill_steps(id,skill_id,step_no,title,goal,criterion,bridge,reinforcement,reinforcement_other,reinforcement_schedule) VALUES
('demo-step-1','demo-skill-baikal-sit',1,'Захват положения','Сесть по сигналу','Садится сразу','кликер','пищевое','','постоянный'),
('demo-step-2','demo-skill-baikal-sit',2,'Увеличение выдержки','Сохранять положение','5 секунд','кликер','игровое','','переменный'),
('demo-step-3','demo-skill-baikal-place',1,'Заход на коврик','Самостоятельно зайти','4 из 5 попыток','жест','пищевое','','постоянный'),
('demo-step-4','demo-skill-dymka-carrier',1,'Подход к переноске','Подойти без избегания','3 спокойных подхода','звук','пищевое','','постоянный'),
('demo-step-5','demo-skill-keks-hand',1,'Нос к руке','Подойти к ладони','4 из 5','нет','пищевое','','постоянный'),
('demo-step-6','demo-skill-grey-step',1,'Касание руки','Поставить лапу','3 из 4','жест','игровое','','переменный'),
('demo-step-7','demo-skill-tori-touch',1,'Спокойное касание','Не отдёргиваться','10 секунд','жест','пищевое','','постоянный')
ON CONFLICT (id) DO NOTHING;

-- 12 тренировок за последние ~2 месяца.
INSERT INTO sessions(id,animal_id,trainer_id,started_at,ended_at,duration_minutes,ending_type,ending_other,success_score,external_stimulus,external_reason,internal_stimulus,internal_reason,concentration,arousal)
SELECT 'demo-session-'||n,
       CASE WHEN n<=5 THEN 'demo-animal-baikal' WHEN n<=8 THEN 'demo-animal-dymka' WHEN n<=10 THEN 'demo-animal-keks' WHEN n=11 THEN 'demo-animal-grey' ELSE 'demo-animal-tori' END,
       CASE WHEN n%2=0 THEN 'demo-trainer2' ELSE 'demo-trainer' END,
       now() - ((n*5)||' days')::interval,
       now() - ((n*5)||' days')::interval + interval '28 minutes',
       28, CASE WHEN n%4=0 THEN 'игра' ELSE 'джекпот' END,'',
       5 + (n%6), 'низкий','Обычная обстановка', CASE WHEN n%3=0 THEN 'средний' ELSE 'низкий' END,'Небольшая усталость',
       3 + (n%3), 2 + (n%4)
FROM generate_series(1,12) n
ON CONFLICT (id) DO NOTHING;

INSERT INTO session_skills(session_id,skill_id,repetitions)
SELECT 'demo-session-'||n, CASE WHEN n<=5 THEN CASE WHEN n%2=0 THEN 'demo-skill-baikal-place' ELSE 'demo-skill-baikal-sit' END WHEN n<=8 THEN 'demo-skill-dymka-carrier' WHEN n<=10 THEN 'demo-skill-keks-hand' WHEN n=11 THEN 'demo-skill-grey-step' ELSE 'demo-skill-tori-touch' END, 5+n%4
FROM generate_series(1,12) n
ON CONFLICT DO NOTHING;

INSERT INTO observations(id,animal_id,author_id,observed_at,behavior_note,health_note,arousal,stress,concentration,appetite,pain,sleep,note)
SELECT 'demo-obs-'||n,
       CASE WHEN n%5=1 THEN 'demo-animal-baikal' WHEN n%5=2 THEN 'demo-animal-dymka' WHEN n%5=3 THEN 'demo-animal-keks' WHEN n%5=4 THEN 'demo-animal-grey' ELSE 'demo-animal-tori' END,
       CASE WHEN n%3=0 THEN 'demo-keeper' WHEN n%3=1 THEN 'demo-owner' ELSE 'demo-trainer' END,
       now() - ((n*2)||' days')::interval,
       CASE WHEN n%2=0 THEN 'Спокоен, контактный, интересуется окружением' ELSE 'Активен, хорошо реагирует на человека' END,
       CASE WHEN n%4=0 THEN 'Небольшая усталость после активности' ELSE 'Без заметных изменений' END,
       2+n%3, 1+n%3, 3+n%3, 3+n%3, 1+(n%2), 3+n%3,
       'Демонстрационная запись наблюдения №'||n
FROM generate_series(1,30) n
ON CONFLICT (id) DO NOTHING;

INSERT INTO homework(id,animal_id,trainer_id,skill_id,title,instructions,due_date,status)
VALUES
('demo-hw-1','demo-animal-baikal','demo-trainer','demo-skill-baikal-sit','Сидеть дома','3 подхода по 5 повторений. Заканчивать на успешном повторе, поощрение сразу после выполнения.',current_date+3,'active'),
('demo-hw-2','demo-animal-baikal','demo-trainer2','demo-skill-baikal-place','Место на коврике','Тренировать 5 минут вечером. Постепенно увеличивать дистанцию до коврика.',current_date+5,'active'),
('demo-hw-3','demo-animal-dymka','demo-trainer','demo-skill-dymka-carrier','Знакомство с переноской','Оставить переноску открытой и поощрять добровольный подход.',current_date+7,'active'),
('demo-hw-4','demo-animal-grey','demo-trainer2','demo-skill-grey-step','Шаг на руку','2 коротких подхода в спокойной комнате.',current_date+4,'active'),
('demo-hw-5','demo-animal-tori','demo-trainer','demo-skill-tori-touch','Спокойный контакт','Короткие касания без удержания, завершать до появления напряжения.',current_date+6,'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO vet_records(id,animal_id,vet_id,record_type,note,medication_name,dosage,frequency,start_date,end_date,instructions)
VALUES
('demo-vet-1','demo-animal-baikal','demo-vet','prescription','Контроль состояния после нагрузки','Омега-3','1 капсула','1 раз в день с кормом',current_date-10,current_date+20,'Наблюдать аппетит и стул.'),
('demo-vet-2','demo-animal-baikal','demo-vet','note','Общее состояние стабильное',NULL,NULL,NULL,NULL,NULL,'Плановый контроль через 2 недели.'),
('demo-vet-3','demo-animal-dymka','demo-vet','prescription','Поддерживающая терапия','Препарат А','0,5 мл','2 раза в день',current_date-3,current_date+7,'Давать после еды.'),
('demo-vet-4','demo-animal-keks','demo-vet','note','Аппетит сохранён',NULL,NULL,NULL,NULL,NULL,'Продолжать наблюдение за потреблением сена.'),
('demo-vet-5','demo-animal-grey','demo-vet2','prescription','Витаминный курс','Витамины B','по инструкции','1 раз в сутки',current_date-5,current_date+9,'Не сочетать с другими витаминными комплексами.'),
('demo-vet-6','demo-animal-tori','demo-vet','note','Активность соответствует обычной',NULL,NULL,NULL,NULL,NULL,'Следить за аппетитом и сном.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO food_logs(id,animal_id,author_id,logged_at,meal,offered,eaten,not_eaten,appetite,note)
SELECT 'demo-food-'||n,
       CASE WHEN n%5=1 THEN 'demo-animal-baikal' WHEN n%5=2 THEN 'demo-animal-dymka' WHEN n%5=3 THEN 'demo-animal-keks' WHEN n%5=4 THEN 'demo-animal-grey' ELSE 'demo-animal-tori' END,
       'demo-keeper', now() - ((n)||' days')::interval,
       CASE WHEN n%2=0 THEN 'Утро' ELSE 'Вечер' END,
       CASE WHEN n%5=3 THEN 'Сено 100 г + зелень' ELSE 'Основной рацион' END,
       CASE WHEN n%4=0 THEN '80%' ELSE '100%' END,
       CASE WHEN n%4=0 THEN 'Небольшая часть' ELSE 'Ничего' END,
       3+n%3,
       'Демонстрационная запись питания'
FROM generate_series(1,25) n
ON CONFLICT (id) DO NOTHING;
