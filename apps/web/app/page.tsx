import Navbar from '../components/landing/Navbar';
import Hero from '../components/landing/Hero';
import BeforeAfterSection from '../components/landing/BeforeAfterSection';
import TrustSection from '../components/landing/TrustSection';
import ChallengesSection from '../components/landing/ChallengesSection';
import HowItWorks from '../components/landing/HowItWorks';
import ExecutionFlowSection from '../components/landing/ExecutionFlowSection';
import DynamicDashboardSection from '../components/landing/DynamicDashboardSection';
import OrganizationGallery from '../components/landing/OrganizationGallery';
import PlaybooksSection from '../components/landing/PlaybooksSection';
import OutcomesSection from '../components/landing/OutcomesSection';
import TrustGovernanceSection from '../components/landing/TrustGovernanceSection';
import Testimonials from '../components/landing/Testimonials';
import FAQ from '../components/landing/FAQ';
import CTA from '../components/landing/CTA';
import Footer from '../components/landing/Footer';

export default function Home(): React.ReactElement {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <BeforeAfterSection />
        <TrustSection />
        <ChallengesSection />
        <HowItWorks />
        <ExecutionFlowSection />
        <DynamicDashboardSection />
        <OrganizationGallery />
        <PlaybooksSection />
        <OutcomesSection />
        <TrustGovernanceSection />
        <Testimonials />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
