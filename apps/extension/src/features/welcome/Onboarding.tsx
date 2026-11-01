import React, { useState } from 'react';
import { saveSettings } from '../../db/settings';
import { Welcome } from './Welcome';
import { Setup } from './Setup';

/**
 * Shown every time the panel opens: Welcome, then Setup only if it was never done.
 * Skip finishes straight away (writing defaults the first time).
 */
export function Onboarding({ onboarded = false, onFinished }: { onboarded?: boolean; onFinished: () => void }) {
  const [step, setStep] = useState<'welcome' | 'setup'>('welcome');
  const finish = (s: Parameters<typeof saveSettings>[0]) =>
    void saveSettings({ onboardingDone: true, ...s }).then(onFinished, (e) => {
      console.error('MediaMind: could not save settings', e);
      onFinished();
    });

  if (step === 'welcome')
    return (
      <Welcome
        onContinue={() => (onboarded ? onFinished() : setStep('setup'))}
        onSkip={() => (onboarded ? onFinished() : finish({ purpose: null, dailyGoal: null }))}
      />
    );
  return <Setup onDone={(purpose, dailyGoal) => finish({ purpose, dailyGoal })} />;
}
