import type { Exercise, Workout } from './types';
import { downloadText } from './storage';

const pickDollarTag = (json: string) => {
  let tag = '$startfit_workouts$';
  let index = 1;
  while (json.includes(tag)) tag = `$startfit_workouts_${index++}$`;
  return tag;
};

export function buildSupabaseSql(workouts: Workout[], catalog: Exercise[]): string {
  const normalized = workouts.map((workout) => ({
    ...workout,
    exercises: [],
    activeWeekdays: workout.days
      .filter((day) => day.exercises.length > 0)
      .map((day) => day.weekday),
    updatedAt: new Date().toISOString(),
  }));
  const json = JSON.stringify(normalized);
  const usedExerciseIds = new Set(
    normalized.flatMap((workout) =>
      workout.days.flatMap((day) => day.exercises.map((exercise) => exercise.exerciseId)),
    ),
  );
  const catalogExerciseIds = new Set(catalog.map((exercise) => exercise.id));
  const missingExerciseIds = [...usedExerciseIds].filter((exerciseId) => !catalogExerciseIds.has(exerciseId));
  if (missingExerciseIds.length) {
    throw new Error(`Não foi possível exportar: ${missingExerciseIds.length} exercício(s) não existem mais no catálogo.`);
  }
  const exerciseNames = Object.fromEntries(
    catalog
      .filter((exercise) => usedExerciseIds.has(exercise.id))
      .map((exercise) => [exercise.id, exercise.name]),
  );
  const exerciseNamesJson = JSON.stringify(exerciseNames);
  const customExercisesJson = JSON.stringify(catalog.filter((exercise) => exercise.isCustom));
  const tag = pickDollarTag(json);
  const namesTag = pickDollarTag(exerciseNamesJson);
  const customTag = pickDollarTag(customExercisesJson);

  return `-- STARTFIT — importação de exercícios e treinos-modelo
-- Gerado em ${new Date().toISOString()}
-- Revise o arquivo e execute inteiro no SQL Editor do Supabase.
-- O script preserva os demais dados do painel e pode ser executado novamente.

begin;

do $$
declare
  v_new_workouts jsonb := ${tag}${json}${tag}::jsonb;
  v_exercise_names jsonb := ${namesTag}${exerciseNamesJson}${namesTag}::jsonb;
  v_custom_exercises jsonb := ${customTag}${customExercisesJson}${customTag}::jsonb;
  v_settings jsonb;
  v_merged_workouts jsonb;
  v_resolved_workouts jsonb := '[]'::jsonb;
  v_resolved_days jsonb;
  v_resolved_exercises jsonb;
  v_workout jsonb;
  v_day jsonb;
  v_exercise jsonb;
  v_exercise_definition jsonb;
  v_exercise_name text;
  v_resolved_exercise_id text;
begin
  if jsonb_typeof(v_new_workouts) <> 'array' then
    raise exception 'Pacote de treinos inválido.';
  end if;

  -- Cria ou atualiza primeiro os exercícios cadastrados pelo colaborador.
  for v_exercise_definition in select value from jsonb_array_elements(v_custom_exercises)
  loop
    update public.public_exercise_items
       set muscle_group = nullif(v_exercise_definition ->> 'muscleGroup', ''),
           youtube_id = nullif(v_exercise_definition ->> 'youtubeId', ''),
           youtube_url = nullif(v_exercise_definition ->> 'youtubeUrl', ''),
           video_orientation = coalesce(nullif(v_exercise_definition ->> 'videoOrientation', ''), 'auto'),
           default_rest_seconds = (v_exercise_definition ->> 'defaultRestSeconds')::integer,
           note = coalesce(v_exercise_definition ->> 'note', ''),
           volume_points = coalesce(v_exercise_definition -> 'volumePoints', '{}'::jsonb),
           equivalent_exercise_ids = coalesce(v_exercise_definition -> 'equivalentExerciseIds', '[]'::jsonb)
     where lower(trim(name)) = lower(trim(v_exercise_definition ->> 'name'));

    if not found then
      insert into public.public_exercise_items (
        name, muscle_group, youtube_id, youtube_url, video_orientation, default_rest_seconds, note,
        volume_points, equivalent_exercise_ids
      ) values (
        trim(v_exercise_definition ->> 'name'),
        nullif(v_exercise_definition ->> 'muscleGroup', ''),
        nullif(v_exercise_definition ->> 'youtubeId', ''),
        nullif(v_exercise_definition ->> 'youtubeUrl', ''),
        coalesce(nullif(v_exercise_definition ->> 'videoOrientation', ''), 'auto'),
        (v_exercise_definition ->> 'defaultRestSeconds')::integer,
        coalesce(v_exercise_definition ->> 'note', ''),
        coalesce(v_exercise_definition -> 'volumePoints', '{}'::jsonb),
        coalesce(v_exercise_definition -> 'equivalentExerciseIds', '[]'::jsonb)
      );
    end if;
  end loop;

  -- Converte os identificadores locais do Studio nos IDs reais do catálogo.
  -- A busca é feita pelo nome exato, ignorando maiúsculas e espaços externos.
  for v_workout in select value from jsonb_array_elements(v_new_workouts)
  loop
    v_resolved_days := '[]'::jsonb;

    for v_day in select value from jsonb_array_elements(coalesce(v_workout -> 'days', '[]'::jsonb))
    loop
      v_resolved_exercises := '[]'::jsonb;

      for v_exercise in select value from jsonb_array_elements(coalesce(v_day -> 'exercises', '[]'::jsonb))
      loop
        v_exercise_name := v_exercise_names ->> (v_exercise ->> 'exerciseId');

        select id::text
          into v_resolved_exercise_id
        from public.public_exercise_items
        where lower(trim(name)) = lower(trim(v_exercise_name))
        order by id
        limit 1;

        if v_resolved_exercise_id is null then
          raise exception 'Exercício não encontrado no catálogo: %', v_exercise_name;
        end if;

        v_resolved_exercises := v_resolved_exercises || jsonb_build_array(
          jsonb_set(v_exercise, '{exerciseId}', to_jsonb(v_resolved_exercise_id), true)
        );
      end loop;

      v_resolved_days := v_resolved_days || jsonb_build_array(
        jsonb_set(v_day, '{exercises}', v_resolved_exercises, true)
      );
    end loop;

    v_resolved_workouts := v_resolved_workouts || jsonb_build_array(
      jsonb_set(v_workout, '{days}', v_resolved_days, true)
    );
  end loop;

  v_new_workouts := v_resolved_workouts;

  select coalesce(settings, '{}'::jsonb)
    into v_settings
  from public.user_global_data
  where lower(trim(email)) = 'admin@admin.com'
  for update;

  if not found then
    raise exception 'Banco administrativo do STARTFIT não encontrado.';
  end if;

  select coalesce(jsonb_agg(item order by item ->> 'name'), '[]'::jsonb)
    into v_merged_workouts
  from (
    select old_item as item
    from jsonb_array_elements(
      coalesce(v_settings #> '{admin_db,workouts}', '[]'::jsonb)
    ) old_item
    where not exists (
      select 1
      from jsonb_array_elements(v_new_workouts) new_item
      where new_item ->> 'id' = old_item ->> 'id'
    )

    union all

    select new_item as item
    from jsonb_array_elements(v_new_workouts) new_item
  ) merged;

  v_settings := jsonb_set(
    v_settings,
    '{admin_db,workouts}',
    v_merged_workouts,
    true
  ) || jsonb_build_object(
    'admin_db_revision', gen_random_uuid()::text,
    'admin_db_updated_at', clock_timestamp()
  );

  update public.user_global_data
  set settings = v_settings,
      updated_at = now()
  where lower(trim(email)) = 'admin@admin.com';

  raise notice '% treino(s) importado(s). Total atual: %.',
    jsonb_array_length(v_new_workouts),
    jsonb_array_length(v_merged_workouts);
end;
$$;

commit;
`;
}

export function exportSupabaseSql(workouts: Workout[], catalog: Exercise[]) {
  downloadText(
    `startfit-importar-treinos-${new Date().toISOString().slice(0, 10)}.sql`,
    buildSupabaseSql(workouts, catalog),
    'application/sql;charset=utf-8',
  );
}

const readJsonVariable = (sql: string, variableName: string): unknown => {
  const pattern = new RegExp(
    `${variableName}\\s+jsonb\\s*:=\\s*(\\$[a-zA-Z0-9_]*\\$)([\\s\\S]*?)\\1::jsonb\\s*;`,
  );
  const match = sql.match(pattern);
  if (!match) throw new Error(`Arquivo SQL inválido: ${variableName} não foi encontrado.`);
  return JSON.parse(match[2]);
};

export function importSupabaseSql(sql: string): { workouts: Workout[]; customExercises: Exercise[] } {
  const workouts = readJsonVariable(sql, 'v_new_workouts');
  const customExercises = readJsonVariable(sql, 'v_custom_exercises');
  if (!Array.isArray(workouts) || !Array.isArray(customExercises)) {
    throw new Error('Arquivo SQL inválido: o pacote STARTFIT está incompleto.');
  }
  return { workouts: workouts as Workout[], customExercises: customExercises as Exercise[] };
}

