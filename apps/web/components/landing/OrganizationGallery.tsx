'use client';

import { motion } from 'framer-motion';

const orgTypes = [
  {
    icon: '⛪',
    title: 'Faith communities',
    description:
      'Coordinate ministries, track attendance, manage volunteers, and communicate with your congregation.',
    count: '180+ churches',
  },
  {
    icon: '🌍',
    title: 'NGOs & nonprofits',
    description:
      'Report on programs, manage donor commitments, and keep your board fully informed.',
    count: '90+ organizations',
  },
  {
    icon: '🎓',
    title: 'Schools & PTAs',
    description:
      'Manage parent engagement, staff coordination, and event planning without the email chaos.',
    count: '50+ institutions',
  },
  {
    icon: '🤝',
    title: 'Associations',
    description: 'Run governance, manage membership dues, and keep your chapters aligned.',
    count: '40+ associations',
  },
  {
    icon: '🏘️',
    title: 'Community groups',
    description:
      'Coordinate local initiatives, track contributions, and report progress to stakeholders.',
    count: '60+ communities',
  },
  {
    icon: '🌾',
    title: 'Cooperatives',
    description:
      'Manage savings, loans, and governance across hundreds of members with full transparency.',
    count: '30+ cooperatives',
  },
];

export default function OrganizationGallery(): React.ReactElement {
  return (
    <section id="organizations" className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <p className="text-xs font-medium text-galaxy-violet uppercase tracking-widest mb-3">
            Built for every organization
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-galaxy-white mb-4">
            Whatever your mission, Galaxy fits
          </h2>
          <p className="text-galaxy-muted max-w-xl mx-auto text-lg">
            From 20-person community groups to 10,000-member federations — Galaxy scales with you.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {orgTypes.map((org, i) => (
            <motion.div
              key={org.title}
              initial={{ opacity: 0, scale: 0.96 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
              className="glass rounded-2xl p-6 flex flex-col gap-3"
            >
              <span className="text-3xl">{org.icon}</span>
              <div>
                <h3 className="text-base font-semibold text-galaxy-white mb-1">{org.title}</h3>
                <p className="text-sm text-galaxy-muted leading-relaxed">{org.description}</p>
              </div>
              <p className="text-xs font-medium text-galaxy-teal mt-auto">{org.count}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
