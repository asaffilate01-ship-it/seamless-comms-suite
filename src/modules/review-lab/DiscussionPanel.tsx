import { useState } from 'react';
import type { parseTranscript } from './contract';

export function DiscussionPanel({ transcript }: { transcript: ReturnType<typeof parseTranscript> }) {
  const [agent, setAgent] = useState('all');
  const [round, setRound] = useState('all');
  const [query, setQuery] = useState('');
  const agents = [...new Set(transcript.messages.map(m => m.agentId))];
  const rounds = [...new Set(transcript.messages.map(m => m.round))];
  const messages = transcript.messages.filter(m => (agent === 'all' || agent === m.agentId)
    && (round === 'all' || Number(round) === m.round) && m.text.toLowerCase().includes(query.toLowerCase()));
  return <section className="space-y-3 rounded border p-4" aria-label="Imported agent discussion">
    <h3 className="font-semibold">Agent discussion — imported simulation</h3>
    <p className="text-sm">{transcript.coverage.suppliedTurns} of {transcript.coverage.plannedTurns} planned turns supplied. This is not a live chat or verified execution record.</p>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="text-sm">Persona<select className="block w-full rounded border bg-background p-2" value={agent} onChange={e => setAgent(e.target.value)}><option value="all">All personas</option>{agents.map(a => <option key={a}>{a}</option>)}</select></label>
      <label className="text-sm">Round<select className="block w-full rounded border bg-background p-2" value={round} onChange={e => setRound(e.target.value)}><option value="all">All rounds</option>{rounds.map(r => <option key={r}>{r}</option>)}</select></label>
      <label className="text-sm">Search discussion<input className="block w-full rounded border bg-background p-2" maxLength={200} value={query} onChange={e => setQuery(e.target.value)} /></label>
    </div>
    <p role="status" className="text-sm">{messages.length} messages shown</p>
    <div className="max-h-96 space-y-3 overflow-y-auto" tabIndex={0} aria-label="Discussion messages">
      {messages.map(m => <article className="rounded border p-3" key={m.id}><h4 className="font-medium">{m.agentId} · Round {m.round}</h4><p className="whitespace-pre-wrap break-words">{m.text}</p><p className="text-sm text-muted-foreground">Supplied references: {m.evidenceIds.join(', ') || 'None — simulated opinion'}</p></article>)}
      {!messages.length && <p>No messages match these filters.</p>}
    </div>
  </section>;
}
