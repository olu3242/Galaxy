'use client';

import { motion } from 'framer-motion';

const links = {
  Product: ['How it works', 'Organizations', 'Outcomes', 'Security'],
  Company: ['About', 'Blog', 'Careers', 'Contact'],
  Support: ['Help center', 'Community', 'Status', 'Privacy policy'],
};

export default function Footer(): React.ReactElement {
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="border-t border-white/5 py-16"
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          <div className="col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg gradient-violet flex items-center justify-center">
                <span className="text-white font-bold text-sm">G</span>
              </div>
              <span className="font-semibold text-galaxy-white">Galaxy</span>
            </div>
            <p className="text-sm text-galaxy-muted leading-relaxed max-w-xs">
              The operating system for organizations that want to run with clarity and
              accountability.
            </p>
          </div>

          {Object.entries(links).map(([category, items]) => (
            <div key={category}>
              <p className="text-xs font-semibold text-galaxy-white uppercase tracking-wider mb-4">
                {category}
              </p>
              <ul className="space-y-3">
                {items.map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="text-sm text-galaxy-muted hover:text-galaxy-white transition-colors"
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between pt-8 border-t border-white/5 gap-4">
          <p className="text-xs text-galaxy-muted">
            &copy; {new Date().getFullYear()} Galaxy. All rights reserved.
          </p>
          <p className="text-xs text-galaxy-muted">Built for organizations that mean business.</p>
        </div>
      </div>
    </motion.footer>
  );
}
