'use client';

import { motion } from 'framer-motion';

const playbooks = [
  {
    emoji: '⛪',
    title: 'Church Operations',
    description: 'Weekly services, offerings, ministry coordination',
  },
  {
    emoji: '🏫',
    title: 'School Administration',
    description: 'Attendance, parent communication, staff reporting',
  },
  {
    emoji: '🤝',
    title: 'Volunteer Coordination',
    description: 'Scheduling, task assignment, contribution tracking',
  },
  {
    emoji: '🎪',
    title: 'Event Planning',
    description: 'Committee management, budget tracking, task lists',
  },
  {
    emoji: '🛒',
    title: 'Procurement Requests',
    description: 'Purchase approvals, vendor coordination, budget control',
  },
  {
    emoji: '👥',
    title: 'Membership Management',
    description: 'Renewals, dues tracking, member communications',
  },
  {
    emoji: '🏛️',
    title: 'Board Approvals',
    description: 'Resolution tracking, voting records, governance logs',
  },
  {
    emoji: '🌍',
    title: 'Community Programs',
    description: 'Participant tracking, reports, impact measurement',
  },
];

export default function PlaybooksSection(): React.ReactElement {
  return (
    <section className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <p className="text-xs font-medium text-galaxy-violet uppercase tracking-widest mb-3">
            Operational playbooks
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-galaxy-white mb-4">
            Ready-made operational playbooks
          </h2>
          <p className="text-galaxy-muted max-w-2xl mx-auto text-lg">
            Start running structured operations on day one. Galaxy includes proven operational
            patterns for every type of organization.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {playbooks.map((playbook, i) => (
            <motion.div
              key={playbook.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.07 }}
              className="glass rounded-2xl p-6 flex flex-col gap-3 hover:border-galaxy-violet/30 hover:bg-galaxy-violet/5 transition-all duration-200 cursor-default group"
            >
              <span className="text-3xl" role="img" aria-label={playbook.title}>
                {playbook.emoji}
              </span>
              <h3 className="text-sm font-semibold text-galaxy-white group-hover:text-galaxy-violet transition-colors">
                {playbook.title}
              </h3>
              <p className="text-xs text-galaxy-muted leading-relaxed">{playbook.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
