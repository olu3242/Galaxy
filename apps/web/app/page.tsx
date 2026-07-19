'use client';
import { useEffect, useRef, useState } from 'react';

const faqs = [
  {
    q: 'Do my members need to download a new app?',
    a: "No — and that's the point. Your team keeps communicating exactly as they do now. Galaxy works behind the scenes to bring structure and accountability to those conversations. The only people who access a dedicated dashboard are administrators and leaders.",
  },
  {
    q: 'How long does setup take?',
    a: 'Most organizations are fully operational within 24-48 hours. Galaxy is configured around your organization type with pre-built templates for churches, NGOs, schools, cooperatives, and associations. Our team provides hands-on onboarding for every early access organization at no extra cost.',
  },
  {
    q: 'Is Galaxy secure?',
    a: "Yes. Each organization's data is completely isolated — no other organization can see your information. All data is encrypted in transit and at rest. We take data security seriously, particularly for organizations working with sensitive member, beneficiary, and financial information.",
  },
  {
    q: 'What types of organizations use Galaxy?',
    a: 'Galaxy is purpose-built for churches and faith communities, NGOs and field organizations, schools and academic institutions, cooperatives and savings groups, professional associations, community networks, and civic organizations. We have dedicated templates and workflows for each.',
  },
  {
    q: 'Can we start small and grow?',
    a: 'Absolutely. Many organizations start with one department or team before rolling out organization-wide. Galaxy is designed to scale with you — from 50 members to 50,000. Pricing and features grow with your needs, not the other way around.',
  },
  {
    q: 'Does Galaxy work internationally?',
    a: 'Yes. Galaxy is built for global organizations and is particularly focused on organizations across Africa, the Caribbean, Latin America, and South and Southeast Asia. Multiple languages and regional configurations are supported.',
  },
];

function Counter({ target }: { target: number }): React.ReactElement {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !started.current) {
            started.current = true;
            const duration = 2000;
            const startTime = performance.now();
            const update = (now: number): void => {
              const elapsed = now - startTime;
              const progress = Math.min(elapsed / duration, 1);
              const ease = 1 - Math.pow(1 - progress, 3);
              setValue(Math.round(ease * target));
              if (progress < 1) requestAnimationFrame(update);
            };
            requestAnimationFrame(update);
            obs.unobserve(el);
          }
        });
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
    };
  }, [target]);

  return <span ref={ref}>{value}</span>;
}

function FaqItem({
  q,
  a,
  open,
  onToggle,
}: {
  q: string;
  a: string;
  open: boolean;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <div className={`faq-item${open ? ' open' : ''}`}>
      <button className="faq-q" onClick={onToggle}>
        <span className="faq-q-text">{q}</span>
        <div className="faq-icon">+</div>
      </button>
      <div className="faq-a">
        <div className="faq-a-text">{a}</div>
      </div>
    </div>
  );
}

export default function GalaxyPage(): React.ReactElement {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [ctaEmail, setCtaEmail] = useState('');
  const [ctaMsg, setCtaMsg] = useState<{ text: string; color: string } | null>(null);

  useEffect(() => {
    const onScroll = (): void => {
      setScrolled(window.scrollY > 60);
    };
    window.addEventListener('scroll', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [mobileOpen]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('visible');
        });
      },
      { threshold: 0.08 },
    );
    document.querySelectorAll('.reveal').forEach((el) => {
      obs.observe(el);
    });
    return () => {
      obs.disconnect();
    };
  }, []);

  const handleCtaSubmit = (): void => {
    if (!ctaEmail.includes('@')) {
      setCtaMsg({ text: 'Please enter a valid email address.', color: '#f87171' });
      return;
    }
    setCtaMsg({ text: "✓ You're on the waitlist. We'll be in touch very soon.", color: '#22C7A9' });
    setCtaEmail('');
  };

  const scrollToWaitlist = (e: React.MouseEvent): void => {
    e.preventDefault();
    document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      {/* NAV */}
      <nav className={scrolled ? 'scrolled' : ''}>
        <a href="#" className="logo">
          <div className="logo-mark">G</div>
          <span className="logo-name">Galaxy</span>
        </a>
        <div className="nav-links">
          <a href="#solutions" className="nav-link">
            Solutions
          </a>
          <a href="#customers" className="nav-link">
            Customers
          </a>
          <a href="#testimonials" className="nav-link">
            Testimonials
          </a>
          <a href="#faq" className="nav-link">
            FAQ
          </a>
          <a href="mailto:hello@galaxyos.co" className="nav-link">
            Contact
          </a>
        </div>
        <div className="nav-ctas">
          <a href="#waitlist" className="btn-ghost">
            Join Waitlist
          </a>
          <a href="mailto:hello@galaxyos.co" className="btn-primary">
            Book a Demo
          </a>
        </div>
        <div
          className="mobile-toggle"
          onClick={() => {
            setMobileOpen(true);
          }}
        >
          <span></span>
          <span></span>
          <span></span>
        </div>
      </nav>

      {/* MOBILE MENU */}
      <div className={`mobile-menu${mobileOpen ? ' open' : ''}`}>
        <button
          className="mobile-close"
          onClick={() => {
            setMobileOpen(false);
          }}
        >
          ✕
        </button>
        <a
          href="#solutions"
          className="nav-link"
          onClick={() => {
            setMobileOpen(false);
          }}
        >
          Solutions
        </a>
        <a
          href="#customers"
          className="nav-link"
          onClick={() => {
            setMobileOpen(false);
          }}
        >
          Customers
        </a>
        <a
          href="#testimonials"
          className="nav-link"
          onClick={() => {
            setMobileOpen(false);
          }}
        >
          Testimonials
        </a>
        <a
          href="#faq"
          className="nav-link"
          onClick={() => {
            setMobileOpen(false);
          }}
        >
          FAQ
        </a>
        <a href="mailto:hello@galaxyos.co" className="nav-link">
          Contact
        </a>
        <a
          href="#waitlist"
          className="btn-hero-primary"
          onClick={() => {
            setMobileOpen(false);
          }}
        >
          Join Waitlist
        </a>
        <a href="mailto:hello@galaxyos.co" className="btn-hero-primary">
          Book a Demo
        </a>
      </div>

      {/* HERO */}
      <section className="hero">
        <div className="hero-left">
          <div className="hero-badge reveal">
            <span className="hero-badge-dot"></span>
            <span className="hero-badge-text">Now in Private Beta · Limited Access</span>
          </div>
          <h1 className="hero-h1 reveal reveal-delay-1">
            Run Your Organization
            <br />
            From <span className="accent">Where Your Team</span>
            <br />
            Already Works.
          </h1>
          <p className="hero-sub reveal reveal-delay-2">
            Galaxy helps churches, NGOs, schools, associations, cooperatives, and communities stay
            organized, accountable, and productive — without changing how people communicate.
          </p>
          <div className="hero-actions reveal reveal-delay-3">
            <a href="mailto:hello@galaxyos.co" className="btn-hero-primary">
              Book a Demo
            </a>
            <a href="#waitlist" className="btn-hero-ghost">
              Join Waitlist
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M1 7H13M8 2L13 7L8 12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </div>
          <div className="hero-social-proof reveal reveal-delay-4">
            <div className="proof-avatars">
              <div className="proof-avatar">EA</div>
              <div className="proof-avatar">MO</div>
              <div className="proof-avatar">TC</div>
              <div className="proof-avatar">+</div>
            </div>
            <p className="proof-text">
              <strong>400+ organizations</strong> on the waitlist
            </p>
          </div>
        </div>

        <div className="hero-right">
          <div className="mission-control">
            <div className="mc-orbit"></div>
            <div className="mc-orbit mc-orbit-2"></div>
            <div className="mc-ring">
              <div className="mc-ring-inner">G</div>
            </div>
            <div className="mc-card card-tasks">
              <div className="mc-card-label">Tasks Completed</div>
              <div className="mc-card-row">
                <div className="mc-card-value">247</div>
                <div className="mc-card-pill pill-green">↑ 18%</div>
              </div>
              <div className="mc-card-bar">
                <div className="mc-card-bar-fill" style={{ width: '78%' }}></div>
              </div>
              <div className="mc-card-sub">This month · 78% completion rate</div>
            </div>
            <div className="mc-card card-attend">
              <div className="mc-card-label">Attendance Tracked</div>
              <div className="mc-card-row">
                <div className="mc-card-value">
                  94<span style={{ fontSize: '16px', color: 'var(--gm)' }}>%</span>
                </div>
                <div className="mc-card-pill pill-blue">Live</div>
              </div>
              <div className="mc-dots">
                <div className="mc-dot">EM</div>
                <div className="mc-dot">AO</div>
                <div className="mc-dot">BT</div>
              </div>
            </div>
            <div className="mc-card card-approval">
              <div className="mc-card-label">Pending Approvals</div>
              <div className="mc-card-value">3</div>
              <div className="mc-card-sub" style={{ color: 'var(--gteal)' }}>
                ↓ 12 cleared today
              </div>
            </div>
            <div className="mc-card card-activity">
              <div className="mc-card-label">Team Activity</div>
              <div className="activity-line">
                <div className="act-dot v"></div>
                <div className="act-text">Budget approved</div>
                <div className="act-time">2m</div>
              </div>
              <div className="activity-line">
                <div className="act-dot t"></div>
                <div className="act-text">Report submitted</div>
                <div className="act-time">11m</div>
              </div>
              <div className="activity-line">
                <div className="act-dot b"></div>
                <div className="act-text">Meeting scheduled</div>
                <div className="act-time">1h</div>
              </div>
            </div>
            <div className="mc-card card-report">
              <div className="mc-card-label">Monthly Report</div>
              <div className="mc-card-row">
                <div className="mc-card-value" style={{ fontSize: '18px' }}>
                  Ready
                </div>
                <div className="mc-card-pill pill-green">Auto</div>
              </div>
              <div className="mc-card-sub">Generated · 2 mins ago</div>
            </div>
          </div>
        </div>
      </section>

      {/* BEFORE / AFTER */}
      <section className="before-after-section">
        <div className="section-header centered reveal">
          <div className="section-chip">The Shift</div>
          <h2 className="section-h2">
            Before Galaxy.
            <br />
            After Galaxy.
          </h2>
          <p className="section-sub" style={{ textAlign: 'center' }}>
            The difference isn&apos;t just efficiency — it&apos;s the confidence that comes from
            knowing your organization is actually running.
          </p>
        </div>
        <div className="ba-grid reveal">
          <div className="ba-card before">
            <div className="ba-label">
              <span className="ba-label-dot"></span>Before Galaxy
            </div>
            <ul className="ba-items">
              <li className="ba-item">
                <span className="ba-item-icon">✗</span>Decisions buried in group chat — forgotten by
                morning
              </li>
              <li className="ba-item">
                <span className="ba-item-icon">✗</span>Tasks assigned verbally with no record or
                follow-up
              </li>
              <li className="ba-item">
                <span className="ba-item-icon">✗</span>Monthly reports take days to compile manually
              </li>
              <li className="ba-item">
                <span className="ba-item-icon">✗</span>Leaders flying blind without real-time
                visibility
              </li>
              <li className="ba-item">
                <span className="ba-item-icon">✗</span>Coordination collapses as the organization
                grows
              </li>
            </ul>
          </div>
          <div className="ba-card after">
            <div className="ba-label">
              <span className="ba-label-dot"></span>After Galaxy
            </div>
            <ul className="ba-items">
              <li className="ba-item">
                <span className="ba-item-icon">✓</span>Every decision is logged, timestamped, and
                searchable
              </li>
              <li className="ba-item">
                <span className="ba-item-icon">✓</span>Tasks have owners, deadlines, and automatic
                reminders
              </li>
              <li className="ba-item">
                <span className="ba-item-icon">✓</span>Reports generate themselves — ready in
                minutes
              </li>
              <li className="ba-item">
                <span className="ba-item-icon">✓</span>Real-time dashboards keep leaders fully
                informed
              </li>
              <li className="ba-item">
                <span className="ba-item-icon">✓</span>Structure scales automatically with your
                growth
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* TRUST SECTION */}
      <section className="trust-section" id="customers">
        <div className="trust-label-row reveal">
          <div className="section-chip">Trusted By</div>
          <h2 className="trust-h2">Organizations That Coordinate At Scale</h2>
          <p className="trust-sub">From 50-member community groups to 10,000-member institutions</p>
        </div>
        <div className="trust-metrics reveal">
          <div className="trust-metric">
            <div className="metric-value">
              <Counter target={120} />
              K+
            </div>
            <div className="metric-label">Members Coordinated</div>
          </div>
          <div className="trust-metric">
            <div className="metric-value">
              <Counter target={48} />
              K+
            </div>
            <div className="metric-label">Activities Managed</div>
          </div>
          <div className="trust-metric">
            <div className="metric-value">
              <Counter target={400} />+
            </div>
            <div className="metric-label">Organizations Supported</div>
          </div>
        </div>
        <div className="trust-marquee-wrap">
          <div className="trust-marquee">
            <div className="trust-org-chip">
              <span className="org-icon">⛪</span> Churches &amp; Faith Communities
            </div>
            <div className="trust-org-chip">
              <span className="org-icon">🌍</span> International NGOs
            </div>
            <div className="trust-org-chip">
              <span className="org-icon">🏫</span> Schools &amp; Universities
            </div>
            <div className="trust-org-chip">
              <span className="org-icon">🤝</span> Cooperative Societies
            </div>
            <div className="trust-org-chip">
              <span className="org-icon">🏛️</span> Professional Associations
            </div>
            <div className="trust-org-chip">
              <span className="org-icon">🌐</span> Community Networks
            </div>
            <div className="trust-org-chip">
              <span className="org-icon">🏥</span> Health Organizations
            </div>
            <div className="trust-org-chip">
              <span className="org-icon">✊</span> Civic Organizations
            </div>
            <div className="trust-org-chip">
              <span className="org-icon">⛪</span> Churches &amp; Faith Communities
            </div>
            <div className="trust-org-chip">
              <span className="org-icon">🌍</span> International NGOs
            </div>
            <div className="trust-org-chip">
              <span className="org-icon">🏫</span> Schools &amp; Universities
            </div>
            <div className="trust-org-chip">
              <span className="org-icon">🤝</span> Cooperative Societies
            </div>
            <div className="trust-org-chip">
              <span className="org-icon">🏛️</span> Professional Associations
            </div>
            <div className="trust-org-chip">
              <span className="org-icon">🌐</span> Community Networks
            </div>
            <div className="trust-org-chip">
              <span className="org-icon">🏥</span> Health Organizations
            </div>
            <div className="trust-org-chip">
              <span className="org-icon">✊</span> Civic Organizations
            </div>
          </div>
        </div>
      </section>

      {/* PROBLEM SECTION */}
      <section className="problem-section" id="solutions">
        <div className="section-header reveal">
          <div className="section-chip">The Problem</div>
          <h2 className="section-h2">
            Running An Organization
            <br />
            Shouldn&apos;t Feel This Hard.
          </h2>
          <p className="section-sub">
            Most organizations are managing complex operations with tools built for casual
            conversations.
          </p>
        </div>
        <div className="problem-grid">
          <div className="problem-card reveal">
            <div className="problem-icon pi-red">🔕</div>
            <div className="problem-title">Decisions disappear in group chats</div>
            <div className="problem-desc">
              Important agreements, approvals, and directives get buried under hundreds of unrelated
              messages. By tomorrow, no one remembers who decided what.
            </div>
          </div>
          <div className="problem-card reveal reveal-delay-1">
            <div className="problem-icon pi-amber">⏰</div>
            <div className="problem-title">Follow-ups fall through the cracks</div>
            <div className="problem-desc">
              Tasks get assigned in conversation and then forgotten. No system tracks who committed
              to what, or whether it was ever done.
            </div>
          </div>
          <div className="problem-card reveal reveal-delay-2">
            <div className="problem-icon pi-violet">📊</div>
            <div className="problem-title">Reporting takes too much time</div>
            <div className="problem-desc">
              Creating reports means chasing multiple people for updates, compiling scattered
              information, and hoping nothing was missed.
            </div>
          </div>
          <div className="problem-card reveal reveal-delay-1">
            <div className="problem-icon pi-red">👁️</div>
            <div className="problem-title">Leaders lack visibility</div>
            <div className="problem-desc">
              Senior leaders have no real-time view of what&apos;s happening across teams. Oversight
              requires manual check-ins and status meetings.
            </div>
          </div>
          <div className="problem-card reveal reveal-delay-2">
            <div className="problem-icon pi-amber">📂</div>
            <div className="problem-title">Records are impossible to find</div>
            <div className="problem-desc">
              When you need to reference a past decision, payment, or approval, you&apos;re
              scrolling through months of messages hoping to find it.
            </div>
          </div>
          <div className="problem-card reveal reveal-delay-3">
            <div className="problem-icon pi-violet">🔗</div>
            <div className="problem-title">Coordination breaks at scale</div>
            <div className="problem-desc">
              What works for 20 people collapses at 200. As organizations grow, informal systems
              become liabilities instead of assets.
            </div>
          </div>
        </div>
      </section>

      {/* HOW GALAXY HELPS */}
      <section className="how-section">
        <div className="how-inner">
          <div className="section-header centered reveal">
            <div className="section-chip">How Galaxy Helps</div>
            <h2 className="section-h2">
              Three Steps.
              <br />
              Complete Transformation.
            </h2>
          </div>
          <div className="how-steps reveal">
            <div className="how-step">
              <div className="step-num">
                <div className="step-num-circle">1</div>
                Step One
              </div>
              <div className="step-title">Keep Using The Tools Your Team Already Knows</div>
              <div className="step-desc">
                No new apps. No retraining. No change in behavior. Galaxy works inside the
                communication channels your team is already using every day. The only thing that
                changes is what&apos;s possible.
              </div>
            </div>
            <div className="how-step">
              <div className="step-num">
                <div className="step-num-circle">2</div>
                Step Two
              </div>
              <div className="step-title">Bring Structure To Everyday Operations</div>
              <div className="step-desc">
                Every message becomes a tracked action. Every approval is logged. Every task has an
                owner, a deadline, and a status. Accountability builds itself into the fabric of
                your organization.
              </div>
            </div>
            <div className="how-step">
              <div className="step-num">
                <div className="step-num-circle">3</div>
                Step Three
              </div>
              <div className="step-title">Get Visibility Across Your Organization</div>
              <div className="step-desc">
                Leaders see everything in real time. Automated reports. Instant dashboards. Complete
                records. You always know what&apos;s happening, what&apos;s overdue, and what needs
                your attention.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* EXECUTION FLOW */}
      <section className="execution-flow-section">
        <div className="section-header centered reveal">
          <div className="section-chip">How It Works In Practice</div>
          <h2 className="section-h2">From Conversation To Outcome</h2>
          <p className="section-sub" style={{ textAlign: 'center' }}>
            Every operation in your organization follows a simple, traceable path.
          </p>
        </div>
        <div className="flow-steps reveal">
          <div className="flow-step">
            <div className="flow-step-num">1</div>
            <div className="flow-step-title">Conversation</div>
            <div className="flow-step-desc">
              Your team communicates exactly as they do now — via WhatsApp. No new apps required.
            </div>
          </div>
          <div className="flow-connector"></div>
          <div className="flow-step">
            <div className="flow-step-num">2</div>
            <div className="flow-step-title">Action</div>
            <div className="flow-step-desc">
              Galaxy captures the intent — a task, approval, report, or decision — and structures it
              automatically.
            </div>
          </div>
          <div className="flow-connector"></div>
          <div className="flow-step">
            <div className="flow-step-num">3</div>
            <div className="flow-step-title">Ownership</div>
            <div className="flow-step-desc">
              Every action is assigned to a named owner with a clear deadline and a tracked status.
            </div>
          </div>
          <div className="flow-connector"></div>
          <div className="flow-step">
            <div className="flow-step-num">4</div>
            <div className="flow-step-title">Tracking</div>
            <div className="flow-step-desc">
              Reminders go out automatically. Overdue items are escalated. Nothing falls through the
              cracks.
            </div>
          </div>
          <div className="flow-connector"></div>
          <div className="flow-step">
            <div className="flow-step-num">5</div>
            <div className="flow-step-title">Outcome</div>
            <div className="flow-step-desc">
              Completion is logged with a timestamp and owner. Your audit trail builds itself.
            </div>
          </div>
        </div>
      </section>

      {/* BENTO GALLERY */}
      <section className="bento-section">
        <div className="section-header centered reveal">
          <div className="section-chip">Built For Your Organization</div>
          <h2 className="section-h2">
            Purpose-Built For
            <br />
            Every Organization Type
          </h2>
          <p className="section-sub" style={{ textAlign: 'center' }}>
            Galaxy adapts to the unique rhythms, governance needs, and coordination patterns of your
            organization.
          </p>
        </div>
        <div className="bento-grid reveal">
          <div className="bento-card span3 large">
            <div className="bento-card-bg">⛪</div>
            <div className="bento-tag">Churches</div>
            <div className="bento-title">Coordinate Every Ministry With Confidence</div>
            <div className="bento-desc">
              Manage your congregation, track contributions, coordinate ministries, follow up with
              new members, and run pastoral operations — all with full visibility and
              accountability.
            </div>
          </div>
          <div className="bento-card span3 large">
            <div className="bento-card-bg">🌍</div>
            <div className="bento-tag">NGOs</div>
            <div className="bento-title">Keep Field Teams Connected And Accountable</div>
            <div className="bento-desc">
              Coordinate distributed field operations, manage grant workflows, track beneficiary
              data, and report on impact without switching platforms or losing field staff
              productivity.
            </div>
          </div>
          <div className="bento-card span2">
            <div className="bento-card-bg" style={{ fontSize: '80px' }}>
              🏫
            </div>
            <div className="bento-tag">Schools</div>
            <div className="bento-title">Bring Staff, Parents &amp; Administration Together</div>
            <div className="bento-desc">
              Streamline communications between teachers, parents, and administration with
              structured workflows and accountable records.
            </div>
          </div>
          <div className="bento-card span2">
            <div className="bento-card-bg" style={{ fontSize: '80px' }}>
              🤝
            </div>
            <div className="bento-tag">Associations</div>
            <div className="bento-title">Manage Members Without The Administrative Burden</div>
            <div className="bento-desc">
              Handle dues, member records, meeting governance, and committee coordination with zero
              manual overhead.
            </div>
          </div>
          <div className="bento-card span2">
            <div className="bento-card-bg" style={{ fontSize: '80px' }}>
              🌐
            </div>
            <div className="bento-tag">Communities</div>
            <div className="bento-title">Turn Engagement Into Organized Action</div>
            <div className="bento-desc">
              Transform passive community members into active, coordinated participants with
              structured engagement and real accountability.
            </div>
          </div>
          <div className="bento-card span3">
            <div className="bento-card-bg" style={{ fontSize: '80px' }}>
              🏦
            </div>
            <div className="bento-tag">Cooperatives</div>
            <div className="bento-title">Track Participation, Approvals, And Activities</div>
            <div className="bento-desc">
              Member savings, loan approvals, dues tracking, and governance — structured, auditable,
              and accessible from any device. Full financial and operational accountability in one
              place.
            </div>
          </div>
        </div>
      </section>

      {/* PLAYBOOKS */}
      <section className="playbooks-section">
        <div className="section-header centered reveal">
          <div className="section-chip">What Galaxy Manages</div>
          <h2 className="section-h2">
            Ready-To-Run Playbooks
            <br />
            For Every Team
          </h2>
          <p className="section-sub" style={{ textAlign: 'center' }}>
            Galaxy comes pre-configured with the operational patterns your organization type already
            runs — no setup from scratch.
          </p>
        </div>
        <div className="playbooks-grid reveal">
          <div className="playbook-item">
            <div className="playbook-icon">📋</div>
            <div className="playbook-title">Member Onboarding</div>
            <div className="playbook-desc">
              Capture new member details, assign follow-up owners, and track completion from
              introduction to active status.
            </div>
            <span className="playbook-tag">Churches · Associations · NGOs</span>
          </div>
          <div className="playbook-item">
            <div className="playbook-icon">✅</div>
            <div className="playbook-title">Approval Workflows</div>
            <div className="playbook-desc">
              Route requests to the right approver, capture the decision, and log the outcome with
              full audit trail.
            </div>
            <span className="playbook-tag">All Organizations</span>
          </div>
          <div className="playbook-item">
            <div className="playbook-icon">📊</div>
            <div className="playbook-title">Periodic Reporting</div>
            <div className="playbook-desc">
              Collect status updates from teams on schedule and compile them into a structured
              report automatically.
            </div>
            <span className="playbook-tag">NGOs · Schools · Cooperatives</span>
          </div>
          <div className="playbook-item">
            <div className="playbook-icon">📅</div>
            <div className="playbook-title">Event Coordination</div>
            <div className="playbook-desc">
              Assign roles, track preparation tasks, manage RSVPs, and capture attendance — all from
              WhatsApp.
            </div>
            <span className="playbook-tag">Churches · Communities</span>
          </div>
          <div className="playbook-item">
            <div className="playbook-icon">💰</div>
            <div className="playbook-title">Dues &amp; Contribution Tracking</div>
            <div className="playbook-desc">
              Record payments, send reminders to members in arrears, and generate collection
              summaries without a spreadsheet.
            </div>
            <span className="playbook-tag">Cooperatives · Churches · Associations</span>
          </div>
          <div className="playbook-item">
            <div className="playbook-icon">📌</div>
            <div className="playbook-title">Field Operations</div>
            <div className="playbook-desc">
              Coordinate distributed teams, collect field data, and surface issues to headquarters
              in real time.
            </div>
            <span className="playbook-tag">NGOs · Health Orgs</span>
          </div>
          <div className="playbook-item">
            <div className="playbook-icon">🏫</div>
            <div className="playbook-title">Academic Administration</div>
            <div className="playbook-desc">
              Manage teacher–parent communication, track attendance, and coordinate between
              departments without friction.
            </div>
            <span className="playbook-tag">Schools</span>
          </div>
          <div className="playbook-item">
            <div className="playbook-icon">📂</div>
            <div className="playbook-title">Governance &amp; Compliance</div>
            <div className="playbook-desc">
              Record decisions from board or leadership meetings with full attribution, timestamps,
              and searchable history.
            </div>
            <span className="playbook-tag">All Organizations</span>
          </div>
        </div>
      </section>

      {/* OUTCOMES SECTION */}
      <section className="outcomes-section">
        <div className="outcomes-inner">
          <div className="section-header centered reveal">
            <div className="section-chip">What Changes</div>
            <h2 className="section-h2">What Changes With Galaxy?</h2>
            <p className="section-sub" style={{ textAlign: 'center', margin: '0 auto' }}>
              The transformation happens immediately. Here&apos;s what organizations experience
              within the first 30 days.
            </p>
          </div>
          <div className="outcomes-grid reveal">
            <div className="outcome-item">
              <div className="outcome-icon">📉</div>
              <div className="outcome-title">Reduce Manual Follow-Up</div>
              <div className="outcome-desc">
                Galaxy automatically tracks commitments, sends reminders, and escalates overdue
                items. You stop chasing.
              </div>
            </div>
            <div className="outcome-item">
              <div className="outcome-icon">🎯</div>
              <div className="outcome-title">Improve Accountability</div>
              <div className="outcome-desc">
                Every action is logged with a timestamp, owner, and outcome. Nothing disappears.
                Everyone is responsible.
              </div>
            </div>
            <div className="outcome-item">
              <div className="outcome-icon">👁️</div>
              <div className="outcome-title">Increase Visibility</div>
              <div className="outcome-desc">
                Leaders get real-time dashboards showing the health of their entire operation at a
                glance.
              </div>
            </div>
            <div className="outcome-item">
              <div className="outcome-icon">⚡</div>
              <div className="outcome-title">Coordinate Faster</div>
              <div className="outcome-desc">
                Structured workflows replace ad-hoc coordination. Teams move faster because everyone
                knows their role.
              </div>
            </div>
            <div className="outcome-item">
              <div className="outcome-icon">🗄️</div>
              <div className="outcome-title">Keep Records Organized</div>
              <div className="outcome-desc">
                Every decision, approval, and activity is automatically documented and instantly
                searchable.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST & GOVERNANCE */}
      <section className="trust-gov-section">
        <div className="section-header centered reveal">
          <div className="section-chip">Built-In Accountability</div>
          <h2 className="section-h2">Your Organization&apos;s Integrity, Protected</h2>
          <p className="section-sub" style={{ textAlign: 'center' }}>
            Galaxy isn&apos;t just an operations tool — it&apos;s the accountability layer your
            organization has always needed.
          </p>
        </div>
        <div className="trust-gov-grid reveal">
          <div className="tg-card">
            <div className="tg-icon">🔒</div>
            <div className="tg-title">Security &amp; Isolation</div>
            <div className="tg-tagline">Your data stays yours</div>
            <ul className="tg-points">
              <li className="tg-point">Each organization&apos;s data is completely isolated</li>
              <li className="tg-point">End-to-end encryption in transit and at rest</li>
              <li className="tg-point">Role-based access — members only see what they need</li>
            </ul>
          </div>
          <div className="tg-card">
            <div className="tg-icon">📋</div>
            <div className="tg-title">Accountability</div>
            <div className="tg-tagline">Every action has an owner</div>
            <ul className="tg-points">
              <li className="tg-point">Named ownership on every task, decision, and approval</li>
              <li className="tg-point">
                Automatic reminders and escalation when items are overdue
              </li>
              <li className="tg-point">
                No more &ldquo;I didn&apos;t know it was my responsibility&rdquo;
              </li>
            </ul>
          </div>
          <div className="tg-card">
            <div className="tg-icon">👁️</div>
            <div className="tg-title">Visibility</div>
            <div className="tg-tagline">Leaders always know</div>
            <ul className="tg-points">
              <li className="tg-point">Real-time dashboards for senior leadership</li>
              <li className="tg-point">Cross-team status at a glance — no manual check-ins</li>
              <li className="tg-point">Instant access to historical records and decisions</li>
            </ul>
          </div>
          <div className="tg-card">
            <div className="tg-icon">⚖️</div>
            <div className="tg-title">Oversight</div>
            <div className="tg-tagline">Built-in governance by default</div>
            <ul className="tg-points">
              <li className="tg-point">Immutable audit log for every operation</li>
              <li className="tg-point">Approval chains enforced automatically</li>
              <li className="tg-point">Full documentation for boards, donors, and regulators</li>
            </ul>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="testimonials-section" id="testimonials">
        <div className="section-header centered reveal">
          <div className="section-chip">Customer Stories</div>
          <h2 className="section-h2">
            Heard From The Organizations
            <br />
            That Use Galaxy
          </h2>
        </div>
        <div className="testimonials-grid">
          <div className="testi-card featured reveal">
            <span className="testi-quote-mark">&ldquo;</span>
            <p className="testi-text">
              We were managing 800 members across 12 different groups. Galaxy gave us one place
              where everything actually happens — and a level of accountability we never had before.
            </p>
            <div className="testi-author">
              <div className="testi-avatar">EA</div>
              <div>
                <div className="testi-name">Pastor Emmanuel Adeyinka</div>
                <div className="testi-role">Senior Pastor · Covenant Chapel Lagos</div>
                <div className="testi-meta">Church · 800 members · Lagos, Nigeria</div>
              </div>
              <span className="testi-org-badge">Church</span>
            </div>
            <div className="testi-outcome">
              <span className="testi-outcome-stat">↓ 80%</span> time spent chasing follow-ups
            </div>
          </div>
          <div className="testi-card reveal reveal-delay-1">
            <span className="testi-quote-mark">&ldquo;</span>
            <p className="testi-text">
              Our field teams are spread across three countries. For the first time, I know exactly
              what&apos;s happening on the ground without being there. The visibility is
              unprecedented.
            </p>
            <div className="testi-author">
              <div
                className="testi-avatar"
                style={{ background: 'linear-gradient(135deg,var(--gblue),var(--gteal))' }}
              >
                MO
              </div>
              <div>
                <div className="testi-name">Mary Okonkwo</div>
                <div className="testi-role">Country Director · Greenfields Foundation</div>
                <div className="testi-meta">NGO · 3 countries · 120 field staff</div>
              </div>
              <span className="testi-org-badge">NGO</span>
            </div>
            <div className="testi-outcome">
              <span className="testi-outcome-stat">100%</span> field visibility from headquarters
            </div>
          </div>
          <div className="testi-card reveal reveal-delay-2">
            <span className="testi-quote-mark">&ldquo;</span>
            <p className="testi-text">
              Reporting that used to take two days now takes twenty minutes. Our donors get
              accurate, timely updates and our board has complete confidence in our operations.
            </p>
            <div className="testi-author">
              <div
                className="testi-avatar"
                style={{ background: 'linear-gradient(135deg,var(--gteal),var(--gblue))' }}
              >
                TC
              </div>
              <div>
                <div className="testi-name">Thomas Chen</div>
                <div className="testi-role">Executive Director · Community First Network</div>
                <div className="testi-meta">Association · 400 members · Regional network</div>
              </div>
              <span className="testi-org-badge">Association</span>
            </div>
            <div className="testi-outcome">
              <span className="testi-outcome-stat">↓ 90%</span> reporting time — 2 days to 20 mins
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="faq-section" id="faq">
        <div className="faq-inner">
          <div className="reveal">
            <div className="section-chip">Common Questions</div>
            <h3 className="faq-sidebar-title">
              Your Questions,
              <br />
              <em style={{ fontStyle: 'italic', color: 'var(--gv2)' }}>Answered.</em>
            </h3>
            <p className="faq-sidebar-sub">
              Still have something we haven&apos;t covered? We&apos;d love to hear from you
              directly.
            </p>
            <a href="mailto:hello@galaxyos.co" className="faq-contact-link">
              Talk to our team →
            </a>
          </div>
          <div className="faq-list reveal">
            {faqs.map((f, i) => (
              <FaqItem
                key={i}
                q={f.q}
                a={f.a}
                open={openFaq === i}
                onToggle={() => {
                  setOpenFaq(openFaq === i ? null : i);
                }}
              />
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="cta-section" id="waitlist">
        <div className="cta-bg"></div>
        <div className="cta-bg-grid"></div>
        <div className="cta-inner reveal">
          <div className="section-chip" style={{ margin: '0 auto 28px', display: 'inline-flex' }}>
            Early Access · Limited Spots
          </div>
          <h2 className="cta-h2">
            Get Started In Minutes.
            <br />
            <span className="accent">No Disruption. No Learning Curve.</span>
          </h2>
          <p className="cta-sub">
            Your team keeps communicating exactly as they do today. Galaxy layers structure,
            accountability, and visibility on top — without asking anyone to change their behavior.
          </p>
          <div className="cta-trust-strip">
            <div className="cta-trust-item">
              <span>✓</span> Get started in minutes
            </div>
            <div className="cta-trust-item">
              <span>✓</span> No software installation for members
            </div>
            <div className="cta-trust-item">
              <span>✓</span> Works with the tools your team already uses
            </div>
            <div className="cta-trust-item">
              <span>✓</span> Hands-on onboarding included
            </div>
          </div>
          <div className="cta-actions">
            <a href="mailto:hello@galaxyos.co" className="btn-hero-primary">
              Book a Demo
            </a>
            <a href="#" onClick={scrollToWaitlist} className="btn-hero-ghost">
              Join Waitlist
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M1 7H13M8 2L13 7L8 12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </div>
          <div className="cta-form-group" style={{ marginTop: '40px' }}>
            <input
              type="email"
              className="cta-input"
              placeholder="your@organization.com"
              value={ctaEmail}
              onChange={(e) => {
                setCtaEmail(e.target.value);
              }}
            />
            <button
              className="btn-primary"
              style={{ padding: '14px 28px', borderRadius: '100px', fontSize: '14px' }}
              onClick={handleCtaSubmit}
            >
              Get Early Access
            </button>
          </div>
          {ctaMsg && (
            <div
              style={{
                fontSize: '13px',
                marginTop: '12px',
                minHeight: '20px',
                color: ctaMsg.color,
              }}
            >
              {ctaMsg.text}
            </div>
          )}
          <p className="cta-note">No credit card required. No software installs for your team.</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-main">
          <div className="footer-brand">
            <a href="#" className="logo">
              <div className="logo-mark">G</div>
              <span className="logo-name">Galaxy</span>
            </a>
            <p className="footer-brand-desc" style={{ marginTop: '16px' }}>
              The Operating System For Organizations. Built for churches, NGOs, schools,
              cooperatives, and communities.
            </p>
            <div className="footer-social">
              <a href="#" className="footer-social-btn" title="LinkedIn">
                in
              </a>
              <a href="#" className="footer-social-btn" title="X/Twitter">
                𝕏
              </a>
              <a href="mailto:hello@galaxyos.co" className="footer-social-btn" title="Email">
                @
              </a>
            </div>
          </div>
          <div>
            <div className="footer-col-title">Product</div>
            <div className="footer-links">
              <a href="#" className="footer-link">
                Solutions
              </a>
              <a href="#" className="footer-link">
                Features
              </a>
              <a href="#" className="footer-link">
                Customer Stories
              </a>
              <a href="#" className="footer-link">
                Pricing
              </a>
              <a href="#" className="footer-link">
                FAQ
              </a>
            </div>
          </div>
          <div>
            <div className="footer-col-title">Organization Types</div>
            <div className="footer-links">
              <a href="#" className="footer-link">
                Churches
              </a>
              <a href="#" className="footer-link">
                NGOs
              </a>
              <a href="#" className="footer-link">
                Schools
              </a>
              <a href="#" className="footer-link">
                Associations
              </a>
              <a href="#" className="footer-link">
                Cooperatives
              </a>
              <a href="#" className="footer-link">
                Communities
              </a>
            </div>
          </div>
          <div>
            <div className="footer-col-title">Company</div>
            <div className="footer-links">
              <a href="#" className="footer-link">
                About Galaxy
              </a>
              <a href="mailto:hello@galaxyos.co" className="footer-link">
                Contact
              </a>
              <a href="#" className="footer-link">
                Careers
              </a>
              <a href="#" className="footer-link">
                Partners
              </a>
            </div>
          </div>
          <div>
            <div className="footer-col-title">Resources</div>
            <div className="footer-links">
              <a href="#" className="footer-link">
                Blog
              </a>
              <a href="#" className="footer-link">
                Guides
              </a>
              <a href="#" className="footer-link">
                Help Center
              </a>
              <a href="#" className="footer-link">
                Privacy Policy
              </a>
              <a href="#" className="footer-link">
                Terms of Service
              </a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-bottom-left">
            © Galaxy 2026. All rights reserved. ·{' '}
            <a
              href="mailto:hello@galaxyos.co"
              style={{ color: 'var(--gm)', textDecoration: 'none' }}
            >
              hello@galaxyos.co
            </a>
          </div>
          <div className="footer-tagline">The Operating System For Organizations.</div>
        </div>
      </footer>
    </>
  );
}
