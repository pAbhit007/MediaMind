import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Welcome, GREETINGS } from '../src/features/welcome/Welcome';
import { Setup } from '../src/features/welcome/Setup';
import { Onboarding } from '../src/features/welcome/Onboarding';
import { getSettings, saveSettings } from '../src/db/settings';
import App from '../src/entrypoints/sidepanel/App';

vi.mock('../src/session/useVideoSession', () => ({
  useVideoSession: () => ({ state: { s: 'no-video', recent: [] }, seek() {}, pause() {}, ask: async () => [] }),
}));
vi.mock('../src/session/useStreak', () => ({ useStreak: () => 0 }));

let store: Record<string, unknown>;
function fakeChrome() {
  store = {};
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async (defaults: Record<string, unknown>) => ({ ...defaults, ...store })),
        set: vi.fn(async (items: Record<string, unknown>) => void Object.assign(store, items)),
      },
    },
  };
}
function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn((q: string) => ({
    matches: reduce && q === '(prefers-reduced-motion: reduce)',
    media: q,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as any;
}

const greeting = () => screen.getByTestId('greeting').querySelector('b')!.textContent;
const continueBtn = () => screen.getByRole('button', { name: /Continue/ }) as HTMLButtonElement;
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => {
  fakeChrome();
  mockReducedMotion(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (globalThis as any).chrome;
  delete (window as any).matchMedia;
});

describe('Welcome', () => {
  it('has the ten greetings of spec §4.2 in order', () => {
    expect(GREETINGS.map((g) => g.text)).toEqual([
      'नमस्ते', 'வணக்கம்', 'নমস্কার', 'నమస్కారం', 'नमस्कार', 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ', 'નમસ્તે', 'ನಮಸ್ಕಾರ', 'നമസ്കാരം', 'Hello',
    ]);
    expect(GREETINGS.map((g) => g.lang)).toEqual([
      'Hindi', 'Tamil', 'Bengali', 'Telugu', 'Marathi', 'Punjabi', 'Gujarati', 'Kannada', 'Malayalam', 'English',
    ]);
  });

  it('cycles greetings every 1.2s', () => {
    vi.useFakeTimers();
    render(<Welcome onContinue={() => {}} onSkip={() => {}} />);
    expect(greeting()).toBe('नमस्ते');
    expect(screen.getByTestId('greeting').textContent).toContain('Hindi');
    advance(1199);
    expect(greeting()).toBe('नमस्ते');
    advance(1);
    expect(greeting()).toBe('வணக்கம்');
    advance(12_000 - 1200);
    expect(greeting()).toBe('नमस्ते');
  });

  it('continue enables at 2.5s', () => {
    vi.useFakeTimers();
    const onContinue = vi.fn();
    render(<Welcome onContinue={onContinue} onSkip={() => {}} />);
    fireEvent.click(continueBtn());
    expect(onContinue).not.toHaveBeenCalled();
    advance(2499);
    expect(continueBtn().disabled).toBe(true);
    advance(1);
    expect(continueBtn().disabled).toBe(false);
    fireEvent.click(continueBtn());
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('reduced motion enables continue immediately', () => {
    vi.useFakeTimers();
    mockReducedMotion(true);
    const { container } = render(<Welcome onContinue={() => {}} onSkip={() => {}} />);
    expect(continueBtn().disabled).toBe(false);
    expect(container.querySelector('.wl')!.classList.contains('is-reduced')).toBe(true);
  });

  it('shows tagline, footer line, toran and a 16-petal rangoli', () => {
    const { container } = render(<Welcome onContinue={() => {}} onSkip={() => {}} />);
    expect(screen.getByText('Turn any YouTube video into notes, chapters & flashcards.')).toBeTruthy();
    expect(screen.getByText('Free forever · no account · nothing leaves your browser')).toBeTruthy();
    expect(container.querySelectorAll('.wl-toran i').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.wl-rangoli .wl-petal').length).toBe(16);
  });
});

describe('Onboarding', () => {
  it('skip is enabled immediately and marks onboarding done', async () => {
    const onFinished = vi.fn();
    render(<Onboarding onFinished={onFinished} />);
    const skip = screen.getByRole('button', { name: /Skip/ }) as HTMLButtonElement;
    expect(skip.disabled).toBe(false);
    fireEvent.click(skip);
    await waitFor(() => expect(onFinished).toHaveBeenCalledOnce());
    expect(store).toEqual({ onboardingDone: true, purpose: null, dailyGoal: null });
  });

  it('continue leads to setup, which saves purpose and goal', async () => {
    mockReducedMotion(true);
    const onFinished = vi.fn();
    render(<Onboarding onFinished={onFinished} />);
    fireEvent.click(continueBtn());
    fireEvent.click(screen.getByRole('button', { name: /Curiosity/ }));
    fireEvent.click(screen.getByRole('button', { name: '20 min' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start learning' }));
    await waitFor(() => expect(onFinished).toHaveBeenCalledOnce());
    expect(store).toEqual({ onboardingDone: true, purpose: 'curiosity', dailyGoal: '20min' });
  });
});

describe('Setup', () => {
  it('setup saves purpose and goal', () => {
    const onDone = vi.fn();
    render(<Setup onDone={onDone} />);
    expect(screen.getByText('What brings you here?')).toBeTruthy();
    expect(screen.getByText('1 of 2')).toBeTruthy();
    for (const label of [/Studying/, /Work & learning/, /Curiosity/]) expect(screen.getByRole('button', { name: label })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Studying/ }));
    expect(screen.getByText('Daily goal')).toBeTruthy();
    expect(screen.getByText('2 of 2')).toBeTruthy();
    for (const label of ['1 video', '10 cards', '20 min']) expect(screen.getByRole('button', { name: label })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '10 cards' }));
    expect(screen.getByRole('button', { name: '10 cards' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Start learning' }));
    expect(onDone).toHaveBeenCalledWith('study', '10cards');
  });

  it('back returns to the purpose step keeping the choice', () => {
    render(<Setup onDone={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Work & learning/ }));
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByRole('button', { name: /Work & learning/ }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('settings accessor', () => {
  it('defaults when empty and round-trips partial saves', async () => {
    expect(await getSettings()).toEqual({ onboardingDone: false, purpose: null, dailyGoal: null });
    await saveSettings({ onboardingDone: true, purpose: 'work' });
    expect(await getSettings()).toEqual({ onboardingDone: true, purpose: 'work', dailyGoal: null });
  });
});

describe('Onboarding when already onboarded', () => {
  it('continue goes straight to the panel without setup or saving', async () => {
    mockReducedMotion(true);
    const onFinished = vi.fn();
    render(<Onboarding onboarded onFinished={onFinished} />);
    fireEvent.click(continueBtn());
    expect(onFinished).toHaveBeenCalledOnce();
    expect(screen.queryByText('What brings you here?')).toBeNull();
    expect(store).toEqual({});
  });
  it('skip finishes without touching settings', () => {
    const onFinished = vi.fn();
    render(<Onboarding onboarded onFinished={onFinished} />);
    fireEvent.click(screen.getByRole('button', { name: /Skip/ }));
    expect(onFinished).toHaveBeenCalledOnce();
    expect(store).toEqual({});
  });
});

describe('App welcome gate', () => {
  it('shows Welcome on first open, then the main panel after Skip', async () => {
    render(<App />);
    await screen.findByRole('button', { name: /Skip/ });
    expect(screen.queryByText('Open a YouTube video to start')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Skip/ }));
    await screen.findByText('Open a YouTube video to start');
    expect(store.onboardingDone).toBe(true);
  });
  it('shows Welcome (starting at नमस्ते) on every open, even once onboarding is done', async () => {
    store.onboardingDone = true;
    render(<App />);
    await screen.findByRole('button', { name: /Skip/ });
    expect(greeting()).toBe('नमस्ते');
    expect(screen.queryByText('Open a YouTube video to start')).toBeNull();
  });
  it('continue skips setup once onboarding is done', async () => {
    mockReducedMotion(true);
    store.onboardingDone = true;
    render(<App />);
    await screen.findByRole('button', { name: /Skip/ });
    fireEvent.click(continueBtn());
    await screen.findByText('Open a YouTube video to start');
    expect(screen.queryByText('What brings you here?')).toBeNull();
  });
  it('continue shows setup when onboarding was never done', async () => {
    mockReducedMotion(true);
    render(<App />);
    await screen.findByRole('button', { name: /Skip/ });
    fireEvent.click(continueBtn());
    await screen.findByText('What brings you here?');
  });
});
