'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

const contexts = {
  church: { label: 'Faith community', unit: 'ministries', headline: 'Sunday readiness', score: 88, members: '1,248', accent: '#6D5DFC' },
  nonprofit: { label: 'Nonprofit', unit: 'programs', headline: 'Program delivery', score: 94, members: '8,420', accent: '#22C7A9' },
  school: { label: 'School', unit: 'departments', headline: 'Term operations', score: 81, members: '1,806', accent: '#4D7CFE' },
};

const roles = {
  leader: {
    label: 'Leader view',
    intro: 'Signal over noise',
    description: 'A concise view of health, bottlenecks, and decisions requiring leadership attention.',
    cards: ['Operational health', 'Decisions waiting', 'Teams at risk'],
  },
  manager: {
    label: 'Manager view',
    intro: 'Every workflow in motion',
    description: 'Owners, deadlines, and dependencies arranged around the work you coordinate every day.',
    cards: ['Work in progress', 'Due this week', 'Team capacity'],
  },
  member: {
    label: 'Member view',
    intro: 'Just what needs you',
    description: 'A focused action list that removes complexity and makes the next step unmistakable.',
    cards: ['My actions', 'Awaiting response', 'Recently completed'],
  },
};

type ContextKey = keyof typeof contexts;
type RoleKey = keyof typeof roles;

const activity = [
  ['Budget review approved', 'Finance committee', '2m'],
  ['Monthly report submitted', 'Outreach team', '12m'],
  ['Volunteer roster updated', 'People operations', '28m'],
];

export default function DynamicDashboardSection(): React.ReactElement {
  const [context, setContext] = useState<ContextKey>('nonprofit');
  const [role, setRole] = useState<RoleKey>('leader');
  const org = contexts[context];
  const view = roles[role];

  return (
    <section id="dynamic-dashboard" className="py-24 bg-galaxy-navy/20 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-[0.68fr_1.32fr] gap-12 items-center">
          <div>
            <p className="text-xs font-medium text-galaxy-teal uppercase tracking-widest mb-3">Dynamic by design</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-galaxy-white leading-tight">One Galaxy.<br /><span className="gradient-text">Your exact view.</span></h2>
            <p className="mt-5 text-lg leading-relaxed text-galaxy-muted">The dashboard reshapes itself around your organization and role, so every person sees the clearest path to action.</p>

            <div className="mt-8">
              <p className="text-xs text-galaxy-muted uppercase tracking-wider mb-3">Choose an organization</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(contexts) as ContextKey[]).map((key) => <button key={key} type="button" onClick={() => setContext(key)} aria-pressed={context === key} className={`rounded-lg px-3.5 py-2 text-sm border transition-all ${context === key ? 'bg-white text-galaxy-black border-white' : 'bg-white/5 text-galaxy-muted border-white/10 hover:text-white hover:border-white/25'}`}>{contexts[key].label}</button>)}
              </div>
            </div>

            <div className="mt-6">
              <p className="text-xs text-galaxy-muted uppercase tracking-wider mb-3">Choose a perspective</p>
              <div className="space-y-2">
                {(Object.keys(roles) as RoleKey[]).map((key) => <button key={key} type="button" onClick={() => setRole(key)} aria-pressed={role === key} className={`w-full text-left rounded-xl border px-4 py-3 transition-all flex items-center justify-between ${role === key ? 'bg-galaxy-violet/10 border-galaxy-violet/40 text-white' : 'border-white/5 text-galaxy-muted hover:bg-white/[0.03]'}`}><span className="text-sm font-medium">{roles[key].label}</span><span className={role === key ? 'text-galaxy-violet' : 'text-white/15'}>→</span></button>)}
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-8 bg-galaxy-violet/10 blur-3xl rounded-full" />
            <div className="relative rounded-3xl border border-white/10 bg-[#0b111e] shadow-2xl shadow-black/50 overflow-hidden">
              <div className="border-b border-white/5 px-5 py-4 flex items-center justify-between"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl gradient-violet grid place-items-center text-white font-bold text-xs">G</div><div><p className="text-sm font-semibold text-white">Mission Control</p><p className="text-xs text-galaxy-muted">{org.label} workspace</p></div></div><div className="flex items-center gap-2 text-xs text-galaxy-teal bg-galaxy-teal/10 px-3 py-1.5 rounded-full"><span className="w-1.5 h-1.5 bg-galaxy-teal rounded-full animate-pulse" /> Live</div></div>

              <AnimatePresence mode="wait">
                <motion.div key={`${context}-${role}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }} className="p-5 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5"><div><p className="text-xs font-medium uppercase tracking-wider" style={{ color: org.accent }}>{view.intro}</p><h3 className="mt-1 text-xl font-semibold text-white">{org.headline}</h3></div><p className="text-xs text-galaxy-muted max-w-xs sm:text-right">{view.description}</p></div>

                  <div className="grid sm:grid-cols-3 gap-3 mb-4">
                    {view.cards.map((card, index) => <div key={card} className="rounded-xl bg-white/[0.035] border border-white/5 p-4"><p className="text-xs text-galaxy-muted">{card}</p><div className="mt-3 flex items-end justify-between"><p className="text-2xl font-bold text-white">{index === 0 ? `${org.score}%` : index === 1 ? role === 'member' ? '3' : '8' : index === 2 ? '2' : '14'}</p><span className={`text-[10px] ${index === 2 ? 'text-amber-300' : 'text-galaxy-teal'}`}>{index === 2 ? 'Needs focus' : '↗ 12%'}</span></div></div>)}
                  </div>

                  <div className="grid sm:grid-cols-[1.25fr_0.75fr] gap-4">
                    <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-5"><div className="flex justify-between items-center mb-5"><div><p className="text-sm font-medium text-white">Operational pulse</p><p className="text-xs text-galaxy-muted mt-0.5">Across 8 active {org.unit}</p></div><span className="text-xs text-galaxy-teal">Healthy</span></div><div className="h-32 flex items-end gap-2">{[46, 64, 52, 78, 68, org.score, 74, 86].map((height, index) => <motion.div key={index} initial={{ height: 0 }} animate={{ height: `${height}%` }} transition={{ delay: index * 0.04 }} className="flex-1 rounded-t-sm bg-gradient-to-t from-galaxy-violet/35 to-galaxy-violet" />)}</div><div className="mt-3 flex justify-between text-[10px] text-galaxy-muted"><span>MON</span><span>NOW</span></div></div>
                    <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-5"><p className="text-sm font-medium text-white mb-4">Live activity</p><div className="space-y-4">{activity.map(([title, team, time]) => <div key={title} className="flex gap-3"><div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-galaxy-teal flex-shrink-0" /><div className="min-w-0 flex-1"><p className="text-xs text-galaxy-slate truncate">{title}</p><p className="text-[10px] text-galaxy-muted mt-0.5">{team}</p></div><span className="text-[10px] text-galaxy-muted">{time}</span></div>)}</div></div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-galaxy-muted"><span><strong className="text-white">{org.members}</strong> people connected</span><span><strong className="text-white">24</strong> updates today</span><span><strong className="text-white">99.9%</strong> records complete</span></div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
