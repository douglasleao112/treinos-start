import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Copy,
  Database,
  Dumbbell,
  ExternalLink,
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
import { emptyStudioData, loadStudioData, saveStudioData } from './storage';
import { exportSupabaseSql, importSupabaseSql } from './sql';

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
const MUSCLE_GROUPS = ['Peitoral', 'Costas', 'Deltoide', 'Bíceps', 'Tríceps', 'Quadríceps', 'Posterior de coxa', 'Glúteos', 'Panturrilha', 'Abdômen'];

const extractYoutubeId = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{6,})/i);
  return match?.[1] || trimmed;
};

function App() {
  const [data, setData] = useState<StudioData>(() => loadStudioData());
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [selectedDay, setSelectedDay] = useState(1);
  const [exerciseCatalog, setExerciseCatalog] = useState<Exercise[]>(FALLBACK_EXERCISES);
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'online' | 'fallback'>('loading');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [exerciseQuery, setExerciseQuery] = useState('');
  const [expandedExercises, setExpandedExercises] = useState<Record<string, boolean>>({});
  const [copiedDay, setCopiedDay] = useState<WorkoutDay | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [videoExercise, setVideoExercise] = useState<Exercise | null>(null);
  const [activePage, setActivePage] = useState<'workouts' | 'exercises'>('workouts');
  const [exerciseLibraryQuery, setExerciseLibraryQuery] = useState('');
  const [exerciseGroup, setExerciseGroup] = useState('');
  const [exercisePage, setExercisePage] = useState(1);
  const [exerciseDraft, setExerciseDraft] = useState<Exercise | null>(null);
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
        setExerciseCatalog([...(items.length ? items : FALLBACK_EXERCISES), ...data.customExercises]);
        setCatalogStatus('online');
      })
      .catch(() => {
        if (!active) return;
        setExerciseCatalog([...FALLBACK_EXERCISES, ...data.customExercises]);
        setCatalogStatus('fallback');
      });
    return () => { active = false; };
  }, [data.customExercises]);

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
    const newIndex = currentDay?.exercises.length || 0;
    updateDay((day) => ({ ...day, exercises: [...day.exercises, createExerciseRef(exercise)] }));
    setExerciseQuery('');
    if (selectedWorkout) {
      setExpandedExercises((current) => ({ ...current, [`${selectedWorkout.id}-${selectedDay}-${newIndex}`]: true }));
    }
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

  const handleImport = async (file: File) => {
    try {
      const parsed = importSupabaseSql(await file.text());
      const workouts = parsed.workouts;
      const valid = workouts.filter((workout: any) => workout?.id && workout?.name && Array.isArray(workout?.days));
      const customExercises = Array.isArray(parsed.customExercises)
        ? parsed.customExercises.filter((exercise: any) => exercise?.id && exercise?.name)
        : [];
      if (!valid.length && !customExercises.length) throw new Error('Nenhum treino ou exercício válido encontrado.');
      setData({ version: 1, workouts: valid, customExercises, selectedWorkoutId: valid[0]?.id ?? null, updatedAt: now() });
      setToast({ tone: 'success', text: `${valid.length} treino(s) e ${customExercises.length} exercício(s) importado(s) do SQL.` });
    } catch (error: any) {
      setToast({ tone: 'error', text: error?.message || 'Não foi possível importar o arquivo SQL.' });
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  const newExercise = () => setExerciseDraft({
    id: uid(), name: '', muscleGroup: '', youtubeId: '', youtubeUrl: '', videoOrientation: 'vertical',
    defaultRestSeconds: null, note: '', secondaryMuscleGroups: [''], volumePoints: {}, equivalentExerciseIds: [],
    isCustom: true, createdAt: now(),
  });

  const saveExercise = () => {
    if (!exerciseDraft?.name.trim()) {
      setToast({ tone: 'error', text: 'Informe o nome do exercício.' });
      return;
    }
    const normalizedName = exerciseDraft.name.trim().toLocaleLowerCase('pt-BR');
    const duplicate = exerciseCatalog.some((exercise) =>
      exercise.id !== exerciseDraft.id &&
      exercise.name.trim().toLocaleLowerCase('pt-BR') === normalizedName
    );
    if (duplicate) {
      setToast({ tone: 'error', text: 'Já existe um exercício com esse nome.' });
      return;
    }
    const secondaryMuscleGroups = Array.from(new Set(exerciseDraft.secondaryMuscleGroups || []))
      .filter((group) => group && group !== exerciseDraft.muscleGroup)
      .slice(0, 2);
    const volumePoints = exerciseDraft.muscleGroup
      ? Object.fromEntries([[exerciseDraft.muscleGroup, 1], ...secondaryMuscleGroups.map((group) => [group, 0.5])])
      : {};
    const normalized = {
      ...exerciseDraft,
      name: exerciseDraft.name.trim(),
      youtubeId: extractYoutubeId(exerciseDraft.youtubeUrl || exerciseDraft.youtubeId || ''),
      youtubeUrl: exerciseDraft.youtubeUrl?.trim() || '',
      videoOrientation: exerciseDraft.videoOrientation || 'vertical',
      defaultRestSeconds: null,
      secondaryMuscleGroups,
      volumePoints,
      equivalentExerciseIds: exerciseDraft.equivalentExerciseIds || [],
      isCustom: true,
    };
    setData((current) => ({
      ...current,
      customExercises: current.customExercises.some((item) => item.id === normalized.id)
        ? current.customExercises.map((item) => item.id === normalized.id ? normalized : item)
        : [normalized, ...current.customExercises],
    }));
    setExerciseDraft(null);
    setToast({ tone: 'success', text: 'Exercício salvo neste navegador.' });
  };

  const deleteCustomExercise = (exercise: Exercise) => {
    if (!exercise.isCustom || !data.customExercises.some((item) => item.id === exercise.id)) {
      setToast({ tone: 'error', text: 'Exercícios do banco de dados não podem ser excluídos.' });
      return;
    }
    const isUsed = data.workouts.some((workout) =>
      workout.days.some((day) => day.exercises.some((item) => item.exerciseId === exercise.id))
    );
    if (isUsed) {
      setToast({ tone: 'error', text: 'Remova este exercício dos treinos antes de excluí-lo.' });
      return;
    }
    setData((current) => ({ ...current, customExercises: current.customExercises.filter((item) => item.id !== exercise.id) }));
    setToast({ tone: 'info', text: 'Exercício personalizado excluído.' });
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
  const filteredExerciseLibrary = exerciseCatalog.filter((exercise) => {
    const query = exerciseLibraryQuery.trim().toLocaleLowerCase('pt-BR');
    return (!exerciseGroup || exercise.muscleGroup === exerciseGroup)
      && (!query || `${exercise.name} ${exercise.muscleGroup || ''}`.toLocaleLowerCase('pt-BR').includes(query));
  });
  const exercisePageCount = Math.max(1, Math.ceil(filteredExerciseLibrary.length / 24));
  const visibleExerciseLibrary = filteredExerciseLibrary.slice((exercisePage - 1) * 24, exercisePage * 24);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="STARTFIT">
          <img src="/startfit-logo.png" alt="STARTFIT" />
          <b>Studio de Treinos</b>
        </div>
        <div className="save-status" aria-live="polite">
          <span className="status-dot" aria-hidden="true" />
          {savedAt
            ? `Salvo localmente às ${savedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
            : 'Salvando localmente...'}
        </div>
        <div className="header-actions">
          <button className="button ghost" onClick={() => importRef.current?.click()}><FileUp size={16} /> Importar SQL</button>
          <button className="button primary" onClick={() => { exportSupabaseSql(data.workouts, exerciseCatalog); setToast({ tone: 'success', text: 'Arquivo SQL exportado.' }); }} disabled={!data.workouts.length && !data.customExercises.length}><Database size={16} /> Exportar SQL</button>
          <input ref={importRef} type="file" accept="application/sql,text/plain,.sql" hidden onChange={(event) => event.target.files?.[0] && void handleImport(event.target.files[0])} />
        </div>
      </header>

      <main className="workspace">
        <aside className="library">
          <nav className="studio-tabs" aria-label="Seções do Studio">
            <button className={activePage === 'workouts' ? 'active' : ''} onClick={() => setActivePage('workouts')}><Dumbbell size={16} /> Treinos</button>
            <button className={activePage === 'exercises' ? 'active' : ''} onClick={() => setActivePage('exercises')}><Video size={16} /> Exercícios</button>
          </nav>
          {activePage === 'workouts' ? <>
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
          </> : <>
            <div className="library-header exercise-library-header"><div><h1>Exercícios</h1><small>{exerciseCatalog.length} exercícios cadastrados · {data.customExercises.length} criado(s) aqui</small></div></div>
            <button className="button primary full" onClick={newExercise}><Plus size={18} /> Novo exercício</button>
            <label className="search-field exercise-library-search"><Search size={17} /><input value={exerciseLibraryQuery} onChange={(event) => { setExerciseLibraryQuery(event.target.value); setExercisePage(1); }} placeholder="Buscar exercício ou grupo muscular..." /></label>
            <select className="group-filter" value={exerciseGroup} onChange={(event) => { setExerciseGroup(event.target.value); setExercisePage(1); }} aria-label="Filtrar exercícios">
              <option value="">Todos os grupamentos</option>
              {MUSCLE_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
            </select>
            <div className="exercise-library-grid">
              {visibleExerciseLibrary.map((exercise) => <article className="exercise-library-card" key={exercise.id}>
                <button className="exercise-library-thumb" onClick={() => exercise.youtubeId && setVideoExercise(exercise)} disabled={!exercise.youtubeId} aria-label={exercise.youtubeId ? `Vídeo de ${exercise.name}` : `Sem vídeo para ${exercise.name}`}>
                  {exercise.youtubeId ? <img src={`https://img.youtube.com/vi/${exercise.youtubeId}/mqdefault.jpg`} alt="" /> : <Dumbbell size={24} />}
                  {exercise.youtubeId && <span><Play size={14} fill="currentColor" /></span>}
                </button>
                <div className="exercise-library-info"><strong>{exercise.name}</strong><small>{exercise.muscleGroup || 'Sem grupamento'}</small><em>{exercise.youtubeId ? 'Com vídeo' : 'Sem vídeo'}</em>{exercise.isCustom && <b>CRIADO NO STUDIO</b>}</div>
                {exercise.isCustom && <div className="exercise-library-actions"><button onClick={() => setExerciseDraft({ ...exercise })} title="Editar"><Pencil size={15} /></button><button onClick={() => deleteCustomExercise(exercise)} title="Excluir"><Trash2 size={15} /></button></div>}
              </article>)}
              {!visibleExerciseLibrary.length && <div className="empty-list"><Dumbbell size={30} /><p>Nenhum exercício encontrado.</p></div>}
            </div>
            <div className="exercise-pagination"><span>Mostrando {(exercisePage - 1) * 24 + (visibleExerciseLibrary.length ? 1 : 0)}–{(exercisePage - 1) * 24 + visibleExerciseLibrary.length} de {filteredExerciseLibrary.length}</span><div><button disabled={exercisePage <= 1} onClick={() => setExercisePage((page) => page - 1)}>‹</button><b>{exercisePage} / {exercisePageCount}</b><button disabled={exercisePage >= exercisePageCount} onClick={() => setExercisePage((page) => page + 1)}>›</button></div></div>
          </>}
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
                <div className="day-config-grid">
                  <div className="day-name-field">
                    <div className="field-heading"><label>Nome da sessão</label><span className="inline-tools"><button onClick={copyCurrentDay} title="Copiar dia"><Clipboard size={14} /></button><button onClick={pasteCurrentDay} disabled={!copiedDay} title="Colar dia"><Upload size={14} /></button></span></div>
                    <input value={currentDay.label} onChange={(event) => updateDay((day) => ({ ...day, label: event.target.value }))} />
                  </div>
                  <div className="day-note-field">
                    <div className="field-heading"><label>Observação do treino</label><span className="note-tools"><button onClick={() => updateDay((day) => ({ ...day, note: '' }))} disabled={!currentDay.note?.trim()}>Limpar</button><button onClick={repeatDayNote} disabled={!currentDay.note?.trim()}><span className="check-square" /> Repetir dias</button></span></div>
                    <input value={currentDay.note || ''} onChange={(event) => updateDay((day) => ({ ...day, note: event.target.value }))} placeholder="Ex.: Realizar bike, mobilidade..." />
                  </div>
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
                    const expanded = expandedExercises[key] ?? index === 0;
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
                          <button className="expand" onClick={() => setExpandedExercises((current) => ({ ...current, [key]: !expanded }))} title={expanded ? 'Recolher' : 'Expandir'}>{expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
                          <button onClick={() => duplicateExercise(index)} title="Duplicar"><Copy size={16} /></button>
                          <button className="danger" onClick={() => removeExercise(index)} title="Excluir"><Trash2 size={16} /></button>
                        </div>
                      </div>
                      {expanded && <div className="exercise-content">
                        <div className="exercise-meta-grid">
                          <label>Série<input type="number" min="1" max="20" value={item.sets} onChange={(event) => changeSets(index, Number(event.target.value))} /></label>
                          <label>Reps<input value={item.reps} onChange={(event) => updateExercise(index, (exerciseItem) => ({ ...exerciseItem, reps: event.target.value }))} /></label>
                          <label>Peso<input value={item.prescribedLoad || ''} onChange={(event) => updateExercise(index, (exerciseItem) => ({ ...exerciseItem, prescribedLoad: event.target.value }))} /></label>
                          <label>Descanso<input type="number" min="0" value={item.restSeconds} onChange={(event) => updateExercise(index, (exerciseItem) => ({ ...exerciseItem, restSeconds: Number(event.target.value) }))} /></label>
                          <label className="exercise-note">Observação<input value={item.note || ''} onChange={(event) => updateExercise(index, (exerciseItem) => ({ ...exerciseItem, note: event.target.value }))} placeholder="Observações sobre o exercício" /></label>
                        </div>
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

      {exerciseDraft && <div className="modal-layer"><div className="modal exercise-form-modal">
        <button className="modal-close" onClick={() => setExerciseDraft(null)} aria-label="Fechar cadastro"><X size={20} /></button>
        <div className="exercise-form-heading"><h2>{data.customExercises.some((item) => item.id === exerciseDraft.id) ? 'Editar exercício' : 'Novo exercício'}</h2></div>
        <div className="exercise-form-body"><div className="exercise-form-grid">
          <label className="wide">Nome<input autoFocus value={exerciseDraft.name} onChange={(event) => setExerciseDraft({ ...exerciseDraft, name: event.target.value })} placeholder="Ex.: Supino reto" /></label>
          <label>Músculo Primário<select value={exerciseDraft.muscleGroup || ''} onChange={(event) => { const muscleGroup = event.target.value; setExerciseDraft({ ...exerciseDraft, muscleGroup, secondaryMuscleGroups: (exerciseDraft.secondaryMuscleGroups || ['']).map((group) => group === muscleGroup ? '' : group) }); }}><option value="">Selecione...</option>{MUSCLE_GROUPS.map((group) => <option key={group}>{group}</option>)}</select></label>
          <div className="secondary-muscles"><span>Músculo secundário</span>
            {Array.from({ length: Math.max(1, exerciseDraft.secondaryMuscleGroups?.length || 0) }).map((_, index) => {
              const selected = exerciseDraft.secondaryMuscleGroups?.[index] || '';
              return <select key={index} value={selected} disabled={!exerciseDraft.muscleGroup} onChange={(event) => { const next = [...(exerciseDraft.secondaryMuscleGroups || [''])]; next[index] = event.target.value; setExerciseDraft({ ...exerciseDraft, secondaryMuscleGroups: next }); }}>
                <option value="">{exerciseDraft.muscleGroup ? 'Nenhum' : 'Selecione o principal'}</option>
                {MUSCLE_GROUPS.filter((group) => group !== exerciseDraft.muscleGroup && (group === selected || !(exerciseDraft.secondaryMuscleGroups || []).includes(group))).map((group) => <option key={group}>{group}</option>)}
              </select>;
            })}
            {(exerciseDraft.secondaryMuscleGroups?.length || 0) < 2 && <button type="button" onClick={() => setExerciseDraft({ ...exerciseDraft, secondaryMuscleGroups: [...(exerciseDraft.secondaryMuscleGroups || ['']), ''].slice(0, 2) })}>Deseja adicionar outro?</button>}
          </div>
          <label className="wide">Link ou ID do vídeo do YouTube<input value={exerciseDraft.youtubeUrl || exerciseDraft.youtubeId || ''} onChange={(event) => { const value = event.target.value.trim(); setExerciseDraft({ ...exerciseDraft, youtubeUrl: value, youtubeId: extractYoutubeId(value) }); }} placeholder="Ex.: https://www.youtube.com/shorts/UHa9U-O09_U" /></label>
          <label className="wide">Observação (opcional)<textarea rows={2} value={exerciseDraft.note || ''} onChange={(event) => setExerciseDraft({ ...exerciseDraft, note: event.target.value })} placeholder="Dica de execução..." /></label>
        </div></div>
        <div className="modal-actions exercise-form-actions"><button className="button ghost" onClick={() => setExerciseDraft(null)}>Cancelar</button><button className="button primary" onClick={saveExercise}>Salvar</button></div>
      </div></div>}

      {confirmDeleteId && <div className="modal-layer"><div className="modal compact">
        <button className="modal-close" onClick={() => setConfirmDeleteId(null)}><X size={20} /></button>
        <div className="modal-icon danger-bg"><Trash2 size={25} /></div>
        <h2>Excluir este treino?</h2><p>Ele será removido somente deste navegador. Essa ação não pode ser desfeita.</p>
        <div className="modal-actions"><button className="button ghost" onClick={() => setConfirmDeleteId(null)}>Cancelar</button><button className="button danger-fill" onClick={() => removeWorkout(confirmDeleteId)}>Excluir</button></div>
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
