import React, { useState } from 'react';
import type { Settings } from '../../db/schema';
import { Header } from '../../ui/Header';
import './welcome.css';

type Purpose = NonNullable<Settings['purpose']>;
type Goal = NonNullable<Settings['dailyGoal']>;

const PURPOSES: { id: Purpose; icon: string; title: string; sub: string }[] = [
  { id: 'study', icon: '🎓', title: 'Studying', sub: 'lectures, exam prep, courses' },
  { id: 'work', icon: '💼', title: 'Work & learning', sub: 'talks, tutorials, podcasts' },
  { id: 'curiosity', icon: '🌱', title: 'Curiosity', sub: 'documentaries, explainers' },
];
const GOALS: { id: Goal; label: string }[] = [
  { id: '1video', label: '1 video' },
  { id: '10cards', label: '10 cards' },
  { id: '20min', label: '20 min' },
];

/** Two quick steps: purpose (tap advances), then daily goal + "Start learning". */
export function Setup({ onDone }: { onDone: (purpose: Purpose, dailyGoal: Goal) => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [purpose, setPurpose] = useState<Purpose | null>(null);
  const [goal, setGoal] = useState<Goal>('1video');

  return (
    <div className="mm-panel">
      <Header title="Let’s set you up" right={<span className="mm-hd-meta">{step} of 2</span>} />
      <div className="mm-body">
        {step === 1 ? (
          <>
            <div className="st-q">What brings you here?</div>
            {PURPOSES.map((p) => (
              <button
                key={p.id}
                type="button"
                className="st-opt"
                aria-pressed={purpose === p.id}
                onClick={() => {
                  setPurpose(p.id);
                  setStep(2);
                }}
              >
                <span aria-hidden="true">{p.icon}</span>
                <span>
                  <b>{p.title}</b>
                  <br />
                  <small>{p.sub}</small>
                </span>
              </button>
            ))}
          </>
        ) : (
          <>
            <button type="button" className="st-back" onClick={() => setStep(1)}>
              ← Back
            </button>
            <div className="st-q">Daily goal</div>
            <div className="st-chips">
              {GOALS.map((g) => (
                <button key={g.id} type="button" className="st-chip" aria-pressed={goal === g.id} onClick={() => setGoal(g.id)}>
                  {g.label}
                </button>
              ))}
            </div>
            <div className="st-hint">Hit your goal each day to keep your 🔥 streak.</div>
            <div style={{ flex: 1 }} />
            <button type="button" className="st-btn" onClick={() => purpose && onDone(purpose, goal)}>
              Start learning
            </button>
          </>
        )}
      </div>
    </div>
  );
}
