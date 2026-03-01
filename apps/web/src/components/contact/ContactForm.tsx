'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';

import { Card } from '@/components/Card';

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitState({ status: 'submitting' });

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, message, website }),
      });

      const result = (await response.json()) as { ok: boolean; message: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.message || 'Unable to submit your message right now.');
      }

      setSubmitState({ status: 'success', message: result.message });
      setName('');
      setEmail('');
      setMessage('');
      setWebsite('');
    } catch (error) {
      const fallback = 'Unable to submit your message right now. Please try again in a moment.';
      setSubmitState({
        status: 'error',
        message: error instanceof Error ? error.message : fallback,
      });
    }
  };

  return (
    <Card className="space-y-4">
      <h2 className="text-xl font-semibold">Project Inquiry</h2>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="text-slate-300">Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300"
              autoComplete="name"
              required
              minLength={2}
              maxLength={80}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-slate-300">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300"
              autoComplete="email"
              required
              maxLength={120}
            />
          </label>
        </div>

        <label className="sr-only" htmlFor="website">
          Website
        </label>
        <input
          id="website"
          name="website"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
          autoComplete="off"
          tabIndex={-1}
          className="hidden"
        />

        <label className="space-y-2 text-sm">
          <span className="text-slate-300">Message</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="min-h-[180px] w-full rounded-xl border border-white/15 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300"
            required
            minLength={20}
            maxLength={2000}
          />
        </label>

        <button
          type="submit"
          className="inline-flex items-center rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitState.status === 'submitting'}
        >
          {submitState.status === 'submitting' ? 'Sending...' : 'Send Message'}
        </button>
      </form>

      {submitState.status === 'success' ? (
        <p className="rounded-xl border border-emerald-400/35 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
          {submitState.message}
        </p>
      ) : null}

      {submitState.status === 'error' ? (
        <p className="rounded-xl border border-rose-400/35 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
          {submitState.message}
        </p>
      ) : null}
    </Card>
  );
}
