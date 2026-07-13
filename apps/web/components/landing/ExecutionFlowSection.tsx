'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

const flow = [
  {
    step: '01',
    phase: 'A request appears',
    title: 'The work starts in a familiar place',
    description: 'A team member shares a need in the group. Everyone can see it, but ownership is still unclear.',
    messages: [
      { person: 'Maya', text: 'Can we approve $1,800 for the youth outreach?', time: '9:41 AM', own: false },
      { person: 'David', text: 'Looks good to me. Who needs to sign off?', time: '9:43 AM', own: true },
    ],
    refinement: 'Galaxy captures the request, amount, requester, and supporting context in one structured record.',
    galaxyLabel: 'Request captured',
    galaxyMeta: '$1,800 · Youth outreach',
  },
  {
    step: '02',
    phase: 'Ownership is assigned',
    title: 'No more wondering who has the ball',
    description: 'The conversation identifies a decision-maker. Galaxy makes that responsibility explicit and trackable.',
    messages: [
      { person: 'Maya', text: '@Amina, could you review this before Friday?', time: '9:46 AM', own: false },
      { person: 'Amina', text: 'Yes — I will review it this afternoon.', time: '9:47 AM', own: false },
    ],
    refinement: 'Galaxy assigns the request to Amina, adds the deadline, and keeps the team aligned without repeated follow-ups.',
    galaxyLabel: 'Owner assigned',
    galaxyMeta: 'Amina · Due Friday',
  },
  {
    step: '03',
    phase: 'Context is gathered',
    title: 'The decision gets everything it needs',
    description: 'Files and questions arrive naturally in chat. Galaxy keeps them attached to the work—not buried in the thread.',
    messages: [
      { person: 'Amina', text: 'Please share the cost breakdown and attendance estimate.', time: '1:08 PM', own: false },
      { person: 'Maya', text: 'Attached both. We expect 120 young people.', time: '1:15 PM', own: true },
    ],
    refinement: 'Galaxy organizes the evidence into a clean review view and flags anything still missing before approval.',
    galaxyLabel: 'Review ready',
    galaxyMeta: '2 files · All details complete',
  },
  {
    step: '04',
    phase: 'A decision is made',
    title: 'Approval becomes clear and accountable',
    description: 'A quick reply moves the team forward. Galaxy turns that moment into a reliable decision record.',
    messages: [
      { person: 'Amina', text: 'Approved ✅ Please proceed with the outreach.', time: '2:32 PM', own: false },
      { person: 'Maya', text: 'Thank you! I will confirm the vendors today.', time: '2:34 PM', own: true },
    ],
    refinement: 'Galaxy records who approved, when it happened, and what comes next—creating an audit trail automatically.',
    galaxyLabel: 'Approved',
    galaxyMeta: 'Amina · Today at 2:32 PM',
  },
  {
    step: '05',
    phase: 'The outcome continues',
    title: 'The next action never gets lost',
    description: 'The chat can move on. Galaxy quietly carries the decision into execution and keeps progress visible.',
    messages: [
      { person: 'Galaxy update', text: 'Vendor confirmation completed. Outreach is now on schedule.', time: '4:18 PM', own: false, system: true },
      { person: 'Amina', text: 'Perfect. Leadership dashboard updated.', time: '4:20 PM', own: true },
    ],
    refinement: 'Galaxy triggers the next task, updates leadership visibility, and preserves the complete request-to-outcome story.',
    galaxyLabel: 'Outcome on track',
    galaxyMeta: 'Next milestone · June 28',
  },
];

export default function ExecutionFlowSection(): React.ReactElement {
  const [active, setActive] = useState(0);
  const item = flow[active]!;

  const move = (direction: number) => {
    setActive((current) => (current + direction + flow.length) % flow.length);
  };

  return (
    <section id="operations-flow" className="py-24 overflow-hidden" aria-labelledby="operations-flow-title">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div initial={false} animate={{ opacity: 1, y: 0 }} className="text-center mb-14">
          <p className="text-xs font-medium text-galaxy-violet uppercase tracking-widest mb-3">How operations flow</p>
          <h2 id="operations-flow-title" className="text-3xl sm:text-4xl font-bold text-galaxy-white mb-4">From WhatsApp conversation to accountable outcome</h2>
          <p className="text-galaxy-muted max-w-2xl mx-auto text-lg">Your team can communicate naturally. Galaxy refines every important moment into clear ownership, decisions, and follow-through.</p>
        </motion.div>

        <div className="grid lg:grid-cols-[0.82fr_1.18fr] gap-8 lg:gap-12 items-center">
          <div className="mx-auto w-full max-w-[350px]">
            <div className="rounded-[2.2rem] border-[7px] border-[#18212a] bg-[#0b141a] shadow-2xl shadow-black/40 overflow-hidden">
              <div className="h-6 bg-[#18212a] flex justify-center"><div className="w-20 h-4 rounded-b-xl bg-[#05080b]" /></div>
              <div className="bg-[#202c33] px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#00a884] flex items-center justify-center text-white font-bold text-xs">OT</div>
                <div className="flex-1"><p className="text-sm text-white font-medium">Operations Team</p><p className="text-[11px] text-[#8696a0]">8 members</p></div>
                <div className="flex gap-3 text-[#aebac1]" aria-hidden="true"><span>⌕</span><span>⋮</span></div>
              </div>

              <div className="relative min-h-[400px] px-3 py-5 whatsapp-chat-bg">
                <div className="mx-auto mb-5 w-max rounded-md bg-[#182229] px-3 py-1 text-[10px] text-[#8696a0] shadow">TODAY</div>
                <AnimatePresence mode="wait">
                  <motion.div key={active} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }} className="space-y-3">
                    {item.messages.map((message, index) => (
                      <motion.div key={`${message.person}-${message.time}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.12 }} className={`flex ${message.own ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[88%] rounded-lg px-3 py-2 shadow-sm ${message.system ? 'border border-[#00a884]/30 bg-[#16372f]' : message.own ? 'bg-[#005c4b]' : 'bg-[#202c33]'}`}>
                          {!message.own && <p className={`mb-0.5 text-[11px] font-semibold ${message.system ? 'text-[#53bdeb]' : 'text-[#d8a85f]'}`}>{message.person}</p>}
                          <p className="text-[13px] leading-[1.45] text-[#e9edef]">{message.text}</p>
                          <p className="mt-1 text-right text-[9px] text-[#8696a0]">{message.time} {message.own && <span className="text-[#53bdeb]">✓✓</span>}</p>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className="bg-[#202c33] p-2 flex gap-2"><div className="flex-1 rounded-full bg-[#2a3942] px-4 py-2 text-xs text-[#8696a0]">Message</div><div className="w-8 h-8 rounded-full bg-[#00a884] grid place-items-center text-white text-xs">➤</div></div>
            </div>
            <p className="mt-4 text-center text-xs text-galaxy-muted">A familiar conversation your team already understands</p>
          </div>

          <div>
            <AnimatePresence mode="wait">
              <motion.div key={active} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
                <div className="flex items-center gap-3 mb-5"><span className="text-xs font-bold text-galaxy-violet bg-galaxy-violet/10 border border-galaxy-violet/20 rounded-full px-3 py-1.5">STEP {item.step}</span><span className="text-sm text-galaxy-teal">{item.phase}</span></div>
                <h3 className="text-3xl sm:text-4xl font-bold text-galaxy-white leading-tight max-w-xl">{item.title}</h3>
                <p className="mt-4 text-lg text-galaxy-muted leading-relaxed max-w-xl">{item.description}</p>

                <div className="mt-8 rounded-2xl glass p-5 sm:p-6 border-galaxy-violet/20">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl gradient-violet grid place-items-center flex-shrink-0 text-sm font-bold text-white">G</div>
                    <div className="flex-1"><p className="text-xs font-semibold uppercase tracking-wider text-galaxy-violet mb-1">How Galaxy refines the process</p><p className="text-sm sm:text-base text-galaxy-slate leading-relaxed">{item.refinement}</p></div>
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-white/5 border border-white/5 px-4 py-3"><div><p className="text-sm font-medium text-galaxy-white">{item.galaxyLabel}</p><p className="text-xs text-galaxy-muted mt-0.5">{item.galaxyMeta}</p></div><div className="w-7 h-7 rounded-full bg-galaxy-teal/15 grid place-items-center text-galaxy-teal text-sm">✓</div></div>
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="mt-8 flex items-center justify-between gap-4">
              <div className="flex gap-2" role="tablist" aria-label="Operations flow steps">
                {flow.map((slide, index) => <button key={slide.step} type="button" role="tab" aria-selected={active === index} aria-label={`View step ${index + 1}: ${slide.phase}`} onClick={() => setActive(index)} className={`h-2 rounded-full transition-all ${active === index ? 'w-8 bg-galaxy-violet' : 'w-2 bg-white/15 hover:bg-white/30'}`} />)}
              </div>
              <div className="flex gap-2"><button type="button" onClick={() => move(-1)} aria-label="Previous step" className="w-11 h-11 rounded-xl border border-white/10 text-galaxy-slate hover:text-white hover:border-white/25 transition-colors">←</button><button type="button" onClick={() => move(1)} aria-label="Next step" className="w-11 h-11 rounded-xl bg-galaxy-violet text-white hover:bg-galaxy-blue transition-colors">→</button></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
