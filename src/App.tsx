import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Copy,
  Database,
  Download,
  Dumbbell,
  ExternalLink,
  FileJson,
  FileUp,
  GripVertical,
  HardDrive,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import type { Exercise, StudioData, Workout, WorkoutDay, WorkoutExercise, WorkoutSet } from './types';
import { FALLBACK_EXERCISES, loadExerciseCatalog } from './catalog';
import { emptyStudioData, exportBackup, loadStudioData, saveStudioData } from './storage';
import { buildSupabaseSql, exportSupabaseSql } from './sql';

const WEEKDAYS = [
  { value: 0, short: 'DOM', label: 'Domingo' },
  { value: 1, short: 'SEG', label: 'Segunda' },
  { value: 2, short: 'TER', label: 'Terça' },
  { value: 3, short: 'QUA', label: 'Quarta' },
  { value: 4, short: 'QUI', label: 'Quinta' },
  { value: 5, short: 'SEX', label: 'Sexta' },
  { value: 6, short: 'SÁB', label: 'Sábado' },
];

const uid = () => crypto.randomUUID?.() || `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const now = () => new Date().toISOString();

const emptyDay = (weekday: number, label: string): WorkoutDay => ({
  id: uid(),
  weekday,
  label: `Treino de ${label}`,
  note: '',
  exercises: [],
});

const createWorkout = (name = 'Novo treino'): Workout => ({
  id: uid(),
  name,
  note: '',
  exercises: [],
  days: WEEKDAYS.map((day) => emptyDay(day.value, day.label)),
  activeWeekdays: [],
  sequences: [],
  startDate: null,
  endDate: null,
  isTemplate: true,
  createdAt: now(),
  updatedAt: now(),
});

const createExerciseRef = (exercise: Exercise): WorkoutExercise => {
  const rest = exercise.defaultRestSeconds == null ? 60 : Number(exercise.defaultRestSeconds);
  return {
    exerciseId: exercise.id,
    sets: 3,
    reps: '10–12',
    restSeconds: rest,
    prescribedLoad: '',
    note: '',
    setDetails: Array.from({ length: 3 }, () => ({ reps: '10–12', restSeconds: rest, prescribedLoad: '' })),
  };
};

const cloneExercise = (exercise: WorkoutExercise): WorkoutExercise => ({
  ...exercise,
  setDetails: exercise.setDetails?.map((set) => ({ ...set })),
});

const cloneDay = (day: WorkoutDay, weekday = day.weekday, label = day.label): WorkoutDay => ({
  ...day,
  id: uid(),
  weekday,
  label,
  exercises: day.exercises.map(cloneExercise),
});

const cloneWorkout = (workout: Workout): Workout => ({
  ...workout,
  id: uid(),
  name: `${workout.name} — cópia`,
  days: workout.days.map((day) => cloneDay(day)),
  createdAt: now(),
  updatedAt: now(),
});

const videoUrl = (exercise?: Exercise) => {
  if (!exercise) return '';
  if (exercise.youtubeUrl) return exercise.youtubeUrl;
  if (exercise.youtubeId) return `https://www.youtube.com/watch?v=${exercise.youtubeId}`;
  return '';
};

const workoutExerciseCount = (workout: Workout) => workout.days.reduce((total, day) => total + day.exercises.length, 0);

const workoutMuscleVolumes = (workout: Workout, exerciseById: Map<string, Exercise>) => {
  const totals = new Map<string, number>();
  workout.days.forEach((day) => day.exercises.forEach((item) => {
    const group = exerciseById.get(item.exerciseId)?.muscleGroup?.trim();
    if (group) totals.set(group, (totals.get(group) || 0) + Number(item.sets || 0));
  }));
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
};

type Toast = { tone: 'success' | 'error' | 'info'; text: string } | null;

function App() {
  const [data, setData] = useState<StudioData>(() => loadStudioData());
  const [selectedDay, setSelectedDay] = useState(1);
  const [exerciseCatalog, setExerciseCatalog] = useState<Exercise[]>(FALLBACK_EXERCISES);
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'online' | 'fallback'>('loading');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [exerciseQuery, setExerciseQuery] = useState('');
  const [expandedExercises, setExpandedExercises] = useState<Record<string, boolean>>({});
  const [copiedDay, setCopiedDay] = useState<WorkoutDay | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showSqlPreview, setShowSqlPreview] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [videoExercise, setVideoExercise] = useState<Exercise | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const selectedWorkout = data.workouts.find((item) => item.id === data.selectedWorkoutId) || null;
  const currentDay = selectedWorkout?.days.find((day) => day.weekday === selectedDay) || null;
  const exerciseById = useMemo(() => new Map(exerciseCatalog.map((item) => [item.id, item])), [exerciseCatalog]);

  useEffect(() => {
    saveStudioData(data);
    setSavedAt(new Date());
  }, [data]);

  useEffect(() => {
    let active = true;
    loadExerciseCatalog('')
      .then((items) => {
        if (!active) return;
        setExerciseCatalog(items.length ? items : FALLBACK_EXERCISES);
        setCatalogStatus('online');
      })
      .catch(() => {
        if (!active) return;
        setExerciseCatalog(FALLBACK_EXERCISES);
        setCatalogStatus('fallback');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!selectedWorkout) return;
    if (selectedWorkout.days.some((day) => day.weekday === selectedDay && day.exercises.length)) return;
    const firstActive = selectedWorkout.days.find((day) => day.exercises.length);
    if (firstActive) setSelectedDay(firstActive.weekday);
  }, [data.selectedWorkoutId]);

  const updateSelectedWorkout = (updater: (workout: Workout) => Workout) => {
    if (!selectedWorkout) return;
    setData((current) => ({
      ...current,
      workouts: current.workouts.map((workout) => {
        if (workout.id !== selectedWorkout.id) return workout;
        const next = updater(workout);
        const activeWeekdays = next.days.filter((day) => day.exercises.length).map((day) => day.weekday);
        return { ...next, activeWeekdays, exercises: [], updatedAt: now() };
      }),
    }));
  };

  const updateDay = (updater: (day: WorkoutDay) => WorkoutDay) => {
    updateSelectedWorkout((workout) => ({
      ...workout,
      days: workout.days.map((day) => day.weekday === selectedDay ? updater(day) : day),
    }));
  };

  const updateExercise = (index: number, updater: (exercise: WorkoutExercise) => WorkoutExercise) => {
    updateDay((day) => ({
      ...day,
      exercises: day.exercises.map((exercise, itemIndex) => itemIndex === index ? updater(exercise) : exercise),
    }));
  };

  const addWorkout = () => {
    const workout = createWorkout(`Treino ${data.workouts.length + 1}`);
    setData((current) => ({ ...current, workouts: [workout, ...current.workouts], selectedWorkoutId: workout.id }));
    setSelectedDay(1);
    setEditorOpen(true);
    setToast({ tone: 'success', text: 'Novo treino criado e salvo neste navegador.' });
  };

  const selectWorkout = (id: string) => {
    setData((current) => ({ ...current, selectedWorkoutId: id }));
    setEditorOpen(true);
  };

  const duplicateWorkout = (workout: Workout) => {
    const copy = cloneWorkout(workout);
    setData((current) => ({ ...current, workouts: [copy, ...current.workouts], selectedWorkoutId: copy.id }));
    setEditorOpen(true);
    setToast({ tone: 'success', text: 'Treino duplicado.' });
  };

  const removeWorkout = (id: string) => {
    setData((current) => {
      const workouts = current.workouts.filter((workout) => workout.id !== id);
      return {
        ...current,
        workouts,
        selectedWorkoutId: current.selectedWorkoutId === id ? workouts[0]?.id || null : current.selectedWorkoutId,
      };
    });
    setConfirmDeleteId(null);
    if (data.selectedWorkoutId === id) setEditorOpen(false);
    setToast({ tone: 'info', text: 'Treino excluído do armazenamento local.' });
  };

  const addExercise = (exercise: Exercise) => {
    updateDay((day) => ({ ...day, exercises: [...day.exercises, createExerciseRef(exercise)] }));
    setExerciseQuery('');
    setExpandedExercises((current) => ({ ...current, [`${selectedDay}-${currentDay?.exercises.length || 0}`]: true }));
    setToast({ tone: 'success', text: `${exercise.name} adicionado.` });
  };

  const removeExercise = (index: number) => updateDay((day) => ({
    ...day,
    exercises: day.exercises.filter((_, itemIndex) => itemIndex !== index),
  }));

  const duplicateExercise = (index: number) => updateDay((day) => {
    const exercises = [...day.exercises];
    exercises.splice(index + 1, 0, cloneExercise(exercises[index]));
    return { ...day, exercises };
  });

  const moveExercise = (index: number, direction: -1 | 1) => updateDay((day) => {
    const target = index + direction;
    if (target < 0 || target >= day.exercises.length) return day;
    const exercises = [...day.exercises];
    [exercises[index], exercises[target]] = [exercises[target], exercises[index]];
    return { ...day, exercises };
  });

  const changeSets = (index: number, amount: number) => updateExercise(index, (exercise) => {
    const sets = Math.max(1, Math.min(20, amount || 1));
    const current = exercise.setDetails?.length ? exercise.setDetails : Array.from({ length: exercise.sets }, () => ({
      reps: exercise.reps,
      restSeconds: exercise.restSeconds,
      prescribedLoad: exercise.prescribedLoad || '',
    }));
    const setDetails = Array.from({ length: sets }, (_, setIndex) => current[setIndex] || { ...current[current.length - 1] });
    return { ...exercise, sets, setDetails };
  });

  const updateSet = (exerciseIndex: number, setIndex: number, field: keyof WorkoutSet, value: string | number) => {
    updateExercise(exerciseIndex, (exercise) => {
      const details = exercise.setDetails?.length ? [...exercise.setDetails] : [];
      while (details.length < exercise.sets) details.push({
        reps: exercise.reps,
        restSeconds: exercise.restSeconds,
        prescribedLoad: exercise.prescribedLoad || '',
      });
      details[setIndex] = { ...details[setIndex], [field]: value };
      const first = details[0];
      return {
        ...exercise,
        setDetails: details,
        reps: first?.reps || exercise.reps,
        restSeconds: Number(first?.restSeconds ?? exercise.restSeconds),
        prescribedLoad: first?.prescribedLoad || '',
      };
    });
  };

  const copyCurrentDay = () => {
    if (!currentDay) return;
    setCopiedDay(cloneDay(currentDay));
    setToast({ tone: 'success', text: `${currentDay.label} copiado.` });
  };

  const pasteCurrentDay = () => {
    if (!copiedDay || !currentDay) return;
    updateDay((day) => ({ ...cloneDay(copiedDay, day.weekday, day.label), id: day.id }));
    setToast({ tone: 'success', text: 'Exercícios e observações colados neste dia.' });
  };

  const repeatDayNote = () => {
    if (!currentDay) return;
    updateSelectedWorkout((workout) => ({
      ...workout,
      note: currentDay.note || '',
      days: workout.days.map((day) => day.exercises.length ? { ...day, note: currentDay.note || '' } : day),
    }));
    setToast({ tone: 'success', text: 'Observação aplicada em todos os dias com treino.' });
  };

  const clearDay = () => {
    updateDay((day) => ({ ...day, exercises: [], note: '' }));
    setToast({ tone: 'info', text: 'Dia de treino limpo.' });
  };

  const handleImport = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      const workouts = Array.isArray(parsed) ? parsed : parsed?.workouts;
      if (!Array.isArray(workouts)) throw new Error('Arquivo sem lista de treinos.');
      const valid = workouts.filter((workout: any) => workout?.id && workout?.name && Array.isArray(workout?.days));
      if (!valid.length) throw new Error('Nenhum treino válido encontrado.');
      setData({ version: 1, workouts: valid, selectedWorkoutId: valid[0].id, updatedAt: now() });
      setToast({ tone: 'success', text: `${valid.length} treino(s) restaurado(s).` });
    } catch (error: any) {
      setToast({ tone: 'error', text: error?.message || 'Não foi possível importar o backup.' });
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  const filteredWorkouts = data.workouts.filter((workout) =>
    workout.name.toLocaleLowerCase('pt-BR').includes(libraryQuery.trim().toLocaleLowerCase('pt-BR')),
  );

  const exerciseResults = useMemo(() => {
    const query = exerciseQuery.trim().toLocaleLowerCase('pt-BR');
    if (query.length < 2) return [];
    return exerciseCatalog.filter((exercise) =>
      `${exercise.name} ${exercise.muscleGroup || ''}`.toLocaleLowerCase('pt-BR').includes(query),
    ).slice(0, 12);
  }, [exerciseCatalog, exerciseQuery]);

  const totalExercises = data.workouts.reduce((total, workout) => total + workoutExerciseCount(workout), 0);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="STARTFIT">
          <span>ST</span><i>▲</i><span>RT</span>
          <b>Studio de Treinos</b>
        </div>
        <div className="save-status"><span className="status-dot" /> Salvo localmente {savedAt ? `às ${savedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</div>
        <div className="header-actions">
          <button className="button ghost" onClick={() => exportBackup(data.workouts)} disabled={!data.workouts.length}><FileJson size={16} /> Backup</button>
          <button className="button ghost" onClick={() => importRef.current?.click()}><FileUp size={16} /> Restaurar</button>
          <button className="button primary" onClick={() => setShowSqlPreview(true)} disabled={!data.workouts.length}><Database size={16} /> Exportar SQL</button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => event.target.files?.[0] && void handleImport(event.target.files[0])} />
        </div>
      </header>

      <main className="workspace">
        <aside className="library">
          <div className="library-header">
            <div>
              <p className="eyebrow">BIBLIOTECA LOCAL</p>
              <h1>Treinos</h1>
            </div>
          </div>
          <button className="button primary full" onClick={addWorkout}><Plus size={18} /> Novo treino</button>
          <label className="search-field">
            <Search size={17} />
            <input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="Buscar treino..." />
          </label>
          <div className="library-summary">
            <span>{data.workouts.length} treino(s)</span>
            <span>{totalExercises} exercícios</span>
          </div>
          <div className="workout-list">
            {filteredWorkouts.map((workout) => {
              const volumes = workoutMuscleVolumes(workout, exerciseById);
              return <article key={workout.id} className="workout-list-card" onClick={() => selectWorkout(workout.id)}>
                <div className="workout-card-main">
                  <Dumbbell size={17} />
                  <div><strong>{workout.name}</strong><small>{workoutExerciseCount(workout)} exercício(s) · {workout.activeWeekdays.length} dia(s)</small></div>
                </div>
                <div className="workout-card-actions">
                  <button onClick={(event) => { event.stopPropagation(); selectWorkout(workout.id); }} title="Editar"><Pencil size={15} /></button>
                  <button onClick={(event) => { event.stopPropagation(); duplicateWorkout(workout); }} title="Duplicar"><Copy size={15} /></button>
                  <button className="danger" onClick={(event) => { event.stopPropagation(); setConfirmDeleteId(workout.id); }} title="Excluir"><Trash2 size={15} /></button>
                </div>
                <div className="workout-volume-badges">
                  {volumes.map(([group, sets]) => <span key={group}>{group} · {sets} séries</span>)}
                </div>
                <div className="workout-day-chips">
                  {WEEKDAYS.filter((weekday) => workout.days.find((day) => day.weekday === weekday.value)?.exercises.length).map((weekday) => {
                    const count = workout.days.find((day) => day.weekday === weekday.value)?.exercises.length || 0;
                    return <span key={weekday.value}>{weekday.short.slice(0, 1) + weekday.short.slice(1).toLowerCase()} #{count}</span>;
                  })}
                </div>
              </article>;
            })}
            {!filteredWorkouts.length && <div className="empty-list"><Dumbbell size={30} /><p>Nenhum treino encontrado.</p></div>}
          </div>
          <div className="local-note"><HardDrive size={16} /><span>Os dados permanecem somente neste navegador até você exportar.</span></div>
        </aside>

        <section className="editor-area">
          {editorOpen && selectedWorkout && (
            <div className="editor-card">
              <button className="editor-close" onClick={() => setEditorOpen(false)} aria-label="Fechar editor"><X size={20} /></button>
              <div className="editor-heading">
                <div className="name-field">
                  <span>Nome do treino</span>
                  <input value={selectedWorkout.name} onChange={(event) => updateSelectedWorkout((workout) => ({ ...workout, name: event.target.value }))} />
                </div>
                <div className="catalog-indicator" data-status={catalogStatus}>
                  <span /> {catalogStatus === 'loading' ? 'Carregando exercícios' : catalogStatus === 'online' ? `${exerciseCatalog.length} exercícios do STARTFIT` : 'Catálogo básico offline'}
                </div>
              </div>

              <div className="weekday-tabs">
                {WEEKDAYS.map((weekday) => {
                  const day = selectedWorkout.days.find((item) => item.weekday === weekday.value);
                  const count = day?.exercises.length || 0;
                  return <button key={weekday.value} className={selectedDay === weekday.value ? 'active' : ''} onClick={() => setSelectedDay(weekday.value)}>
                    <span>{weekday.short}</span><b>{count}</b>
                  </button>;
                })}
              </div>

              {currentDay && <>
                <div className="day-toolbar">
                  <div className="day-name-field"><label>Nome da sessão</label><input value={currentDay.label} onChange={(event) => updateDay((day) => ({ ...day, label: event.target.value }))} /></div>
                  <div className="day-tools">
                    <button className="button ghost small" onClick={copyCurrentDay}><Clipboard size={15} /> Copiar dia</button>
                    <button className="button ghost small" onClick={pasteCurrentDay} disabled={!copiedDay}><Upload size={15} /> Colar</button>
                    <button className="button danger-outline small" onClick={clearDay} disabled={!currentDay.exercises.length}><Trash2 size={15} /> Limpar</button>
                  </div>
                </div>

                <div className="day-note-row">
                  <label><span>Observação do treino</span><textarea value={currentDay.note || ''} onChange={(event) => updateDay((day) => ({ ...day, note: event.target.value }))} placeholder="Ex.: realizar 20 minutos de cardio após o treino..." /></label>
                  <button className="button secondary repeat-note" onClick={repeatDayNote} disabled={!currentDay.note?.trim()}><Copy size={16} /> Aplicar nos dias com treino</button>
                </div>

                <div className="exercise-picker">
                  <label>Adicionar exercício</label>
                  <div className="exercise-search"><Search size={18} /><input value={exerciseQuery} onChange={(event) => setExerciseQuery(event.target.value)} placeholder="Digite para buscar um exercício..." /></div>
                  {exerciseResults.length > 0 && <div className="exercise-results">
                    {exerciseResults.map((exercise) => <button key={exercise.id} onClick={() => addExercise(exercise)}>
                      <div className="exercise-result-main">
                        {exercise.youtubeId ? <img src={`https://img.youtube.com/vi/${exercise.youtubeId}/mqdefault.jpg`} alt="" /> : <span className="no-video"><Dumbbell size={16} /></span>}
                        <div><strong>{exercise.name}</strong><small>{exercise.muscleGroup || 'Sem grupamento'} · {exercise.youtubeId ? 'Com vídeo' : 'Sem vídeo'}</small></div>
                      </div><Plus size={17} />
                    </button>)}
                  </div>}
                </div>

                <div className="exercise-list">
                  {currentDay.exercises.map((item, index) => {
                    const exercise = exerciseById.get(item.exerciseId);
                    const key = `${selectedWorkout.id}-${selectedDay}-${index}`;
                    const expanded = expandedExercises[key] !== false;
                    const details = item.setDetails?.length ? item.setDetails : Array.from({ length: item.sets }, () => ({ reps: item.reps, restSeconds: item.restSeconds, prescribedLoad: item.prescribedLoad || '' }));
                    return <article className="exercise-card" key={`${item.exerciseId}-${index}`}>
                      <div className="exercise-card-header">
                        <GripVertical size={18} className="grip" />
                        <div className="exercise-title"><strong>{exercise?.name || `Exercício ${item.exerciseId}`}</strong><small>{exercise?.muscleGroup || 'Exercício do catálogo'}</small></div>
                        {exercise?.youtubeId && <button className="video-preview" onClick={() => setVideoExercise(exercise)} title="Assistir ao vídeo">
                          <img src={`https://img.youtube.com/vi/${exercise.youtubeId}/mqdefault.jpg`} alt={`Vídeo de ${exercise.name}`} />
                          <span><Play size={14} fill="currentColor" /></span>
                        </button>}
                        <div className="exercise-actions">
                          <button onClick={() => moveExercise(index, -1)} disabled={index === 0} title="Mover para cima"><ArrowUp size={16} /></button>
                          <button onClick={() => moveExercise(index, 1)} disabled={index === currentDay.exercises.length - 1} title="Mover para baixo"><ArrowDown size={16} /></button>
                          <button onClick={() => duplicateExercise(index)} title="Duplicar"><Copy size={16} /></button>
                          <button className="danger" onClick={() => removeExercise(index)} title="Excluir"><Trash2 size={16} /></button>
                          <button className="expand" onClick={() => setExpandedExercises((current) => ({ ...current, [key]: !expanded }))} title={expanded ? 'Recolher' : 'Expandir'}>{expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
                        </div>
                      </div>
                      {expanded && <div className="exercise-content">
                        <div className="exercise-meta-grid">
                          <label>Séries<input type="number" min="1" max="20" value={item.sets} onChange={(event) => changeSets(index, Number(event.target.value))} /></label>
                          <label>Repetições<input value={item.reps} onChange={(event) => updateExercise(index, (exerciseItem) => ({ ...exerciseItem, reps: event.target.value }))} /></label>
                          <label>Carga<input value={item.prescribedLoad || ''} onChange={(event) => updateExercise(index, (exerciseItem) => ({ ...exerciseItem, prescribedLoad: event.target.value }))} placeholder="Opcional" /></label>
                          <label>Descanso<input type="number" min="0" value={item.restSeconds} onChange={(event) => updateExercise(index, (exerciseItem) => ({ ...exerciseItem, restSeconds: Number(event.target.value) }))} /></label>
                        </div>
                        <label className="exercise-note">Observação do exercício<input value={item.note || ''} onChange={(event) => updateExercise(index, (exerciseItem) => ({ ...exerciseItem, note: event.target.value }))} placeholder="Orientações de execução..." /></label>
                        <div className="sets-table">
                          <div className="set-row set-head"><span>Série</span><span>Repetições</span><span>Carga</span><span>Descanso</span></div>
                          {details.map((set, setIndex) => <div className="set-row" key={setIndex}>
                            <b>{setIndex + 1}ª</b>
                            <input value={set.reps} onChange={(event) => updateSet(index, setIndex, 'reps', event.target.value)} />
                            <input value={set.prescribedLoad || ''} onChange={(event) => updateSet(index, setIndex, 'prescribedLoad', event.target.value)} placeholder="—" />
                            <input type="number" min="0" value={set.restSeconds} onChange={(event) => updateSet(index, setIndex, 'restSeconds', Number(event.target.value))} />
                          </div>)}
                        </div>
                      </div>}
                    </article>;
                  })}
                  {!currentDay.exercises.length && <div className="empty-day"><Dumbbell size={31} /><strong>Nenhum exercício neste dia</strong><p>Use a busca acima para começar a montar a sessão.</p></div>}
                </div>
              </>}
              <div className="editor-footer">
                <button className="button ghost" onClick={() => setEditorOpen(false)}>Cancelar</button>
                <button className="button primary" onClick={() => { setEditorOpen(false); setToast({ tone: 'success', text: 'Treino salvo neste navegador.' }); }}><Check size={16} /> Salvar treino</button>
              </div>
            </div>
          )}
        </section>
      </main>

      {confirmDeleteId && <div className="modal-layer"><div className="modal compact">
        <button className="modal-close" onClick={() => setConfirmDeleteId(null)}><X size={20} /></button>
        <div className="modal-icon danger-bg"><Trash2 size={25} /></div>
        <h2>Excluir este treino?</h2><p>Ele será removido somente deste navegador. Essa ação não pode ser desfeita.</p>
        <div className="modal-actions"><button className="button ghost" onClick={() => setConfirmDeleteId(null)}>Cancelar</button><button className="button danger-fill" onClick={() => removeWorkout(confirmDeleteId)}>Excluir</button></div>
      </div></div>}

      {showSqlPreview && <div className="modal-layer"><div className="modal sql-modal">
        <button className="modal-close" onClick={() => setShowSqlPreview(false)}><X size={20} /></button>
        <div className="modal-title-row"><div className="modal-icon"><Database size={25} /></div><div><p className="eyebrow">EXPORTAÇÃO FINAL</p><h2>Arquivo SQL para o Supabase</h2></div></div>
        <div className="export-summary"><div><b>{data.workouts.length}</b><span>treino(s)</span></div><div><b>{totalExercises}</b><span>exercícios prescritos</span></div><div><b>Seguro</b><span>preserva dados existentes</span></div></div>
        <div className="info-box"><Check size={18} /><p>O SQL atualiza somente a biblioteca de treinos do painel, substituindo treinos com o mesmo ID e mantendo todos os outros. Ele também atualiza a revisão do banco para o aplicativo reconhecer a importação.</p></div>
        <textarea className="sql-preview" readOnly value={buildSupabaseSql(data.workouts, exerciseCatalog)} />
        <div className="modal-actions"><button className="button ghost" onClick={() => setShowSqlPreview(false)}>Voltar</button><button className="button primary" onClick={() => { exportSupabaseSql(data.workouts, exerciseCatalog); setToast({ tone: 'success', text: 'Arquivo SQL exportado.' }); }}><Download size={17} /> Baixar arquivo SQL</button></div>
      </div></div>}

      {videoExercise?.youtubeId && <div className="modal-layer video-layer"><div className="modal video-modal">
        <button className="modal-close" onClick={() => setVideoExercise(null)} aria-label="Fechar vídeo"><X size={20} /></button>
        <div className="video-modal-heading"><div><p className="eyebrow">VÍDEO DO EXERCÍCIO</p><h2>{videoExercise.name}</h2></div><span>{videoExercise.muscleGroup || 'Exercício'}</span></div>
        <div className="video-frame"><iframe src={`https://www.youtube-nocookie.com/embed/${videoExercise.youtubeId}?rel=0`} title={`Execução de ${videoExercise.name}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>
        <div className="modal-actions"><a className="button ghost" href={videoUrl(videoExercise)} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Abrir no YouTube</a><button className="button primary" onClick={() => setVideoExercise(null)}>Fechar</button></div>
      </div></div>}

      {toast && <div className={`toast ${toast.tone}`}><span>{toast.tone === 'success' ? <Check size={17} /> : toast.tone === 'error' ? <X size={17} /> : <HardDrive size={17} />}</span>{toast.text}</div>}
    </div>
  );
}

export default App;
