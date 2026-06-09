'use client';

import { motion } from 'framer-motion';

const challenges = [
  {
    icon: '💬',
    title: 'Decisions disappear',
    body: 'Agreements made in meetings vanish. Nobody can trace who decided what — or when.',
  },
  {
    icon: '🔁',
    title: 'Follow-ups fall through',
    body: 'Tasks are assigned in conversations and forgotten. Nothing gets a clear owner or deadline.',
  },
  {
    icon: '📊',
    title: 'Reporting takes all week',
    body: 'Leaders spend days chasing updates that should take minutes to compile.',
  },
  {
    icon: '🔍',
    title: 'Leaders lack visibility',
    body: "No clear picture of what's happening across the organization — until it's too late.",
  },
  {
    icon: '🗂️',
    title: 'Records are impossible to find',
    body: 'Meeting notes, attendance records, and approvals are scattered across chats and files.',
  },
  {
    icon: '⚡',
    title: 'Scale breaks coordination',
    body: 'The informal systems that worked for 10 people collapse when the team reaches 100.',
  },
];

export default function ChallengesSection(): React.ReactElement {
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
          <h2 className="text-3xl sm:text-4xl font-bold text-galaxy-white mb-4">
            Every organization faces the same friction
          </h2>
          <p className="text-galaxy-muted max-w-xl mx-auto text-lg">
            The tools weren&apos;t built for how real organizations actually work. Galaxy was.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {challenges.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.07 }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="glass rounded-2xl p-6 cursor-default"
            >
              <span className="text-2xl mb-3 block">{item.icon}</span>
              <h3 className="text-base font-semibold text-galaxy-white mb-2">{item.title}</h3>
              <p className="text-sm text-galaxy-muted leading-relaxed">{item.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
