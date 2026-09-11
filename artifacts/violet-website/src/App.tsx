import { useEffect, useState } from "react";
import { ArrowRight, BarChart3, Check, CheckCircle2, Download, Menu, Package, ShieldCheck, Store, Users, Wifi, X, Zap } from "lucide-react";
import { Link, Route, Switch, useLocation } from "wouter";

type Currency = "JMD" | "USD";

const appUrl = (import.meta.env.VITE_APP_URL || "/").replace(/\/$/, "");

type PublicPlan = {
  id: string;
  tier: string;
  name: string;
  description: string;
  price: number;
  annualPrice: number | null;
  billingType: string;
  currency: string;
  checkoutPrice: number;
  checkoutCurrency: string;
  features: string[];
  isPopular: boolean;
  trialDays: number;
};

const tierOrder = ["free", "starter", "professional", "enterprise"];

const features = [
  { icon: Zap, title: "Checkout at the speed of thought", text: "Keyboard-first POS flows keep every line moving when the store gets busy." },
  { icon: Package, title: "Inventory you can trust", text: "Know what is on the shelf, what is running low, and what is actually selling." },
  { icon: BarChart3, title: "Decisions with context", text: "Turn sales, staff, and product data into a clearer next move." },
  { icon: Users, title: "One customer record", text: "Keep purchase history and relationships close to the transaction." },
];

function money(amount: number, currency: Currency) {
  return new Intl.NumberFormat(currency === "JMD" ? "en-JM" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function featureLabel(feature: string) {
  return feature
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatPlanPrice(plan: PublicPlan, currency: Currency) {
  if (plan.currency === currency) {
    return { amount: plan.price, currency };
  }
  if (plan.checkoutCurrency === currency) {
    return { amount: plan.checkoutPrice, currency };
  }
  return null;
}

function localPriceNote(plan: PublicPlan, currency: Currency) {
  if (plan.currency === currency || plan.currency === plan.checkoutCurrency) return null;
  if (plan.currency !== "JMD" && plan.currency !== "USD") return null;
  return `Local price: ${money(plan.price, plan.currency as Currency)}`;
}

function billingLabel(plan: PublicPlan) {
  if (plan.tier === "free" || plan.billingType === "one_time") return "one time";
  if (plan.billingType === "annual") return " / year";
  if (plan.billingType === "enterprise") return "";
  return " / month";
}

function PlanEyebrow({ plan }: { plan: PublicPlan }) {
  if (plan.isPopular) return <div className="popular-label">Most chosen</div>;
  return null;
}

function CheckoutButton({ plan, className = "" }: { plan: PublicPlan; className?: string }) {
  function startCheckout() {
    window.location.href = `${appUrl}/register?plan=${encodeURIComponent(plan.tier)}`;
  }

  return (
    <div className={`checkout-action ${className}`}>
      <button className="button button-primary button-wide" onClick={startCheckout}>
        {plan.tier === "free" ? "Create free account" : "Create account for " + plan.name}
        <ArrowRight size={16} />
      </button>
    </div>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a className="brand" href="#top" onClick={() => setOpen(false)}>
          <span className="brand-mark"><span /></span>
          <span>Violet <strong>Enterprise</strong></span>
        </a>
        <nav className={`desktop-nav ${open ? "is-open" : ""}`}>
          <a href="#product" onClick={() => setOpen(false)}>Product</a>
          <a href="#pricing" onClick={() => setOpen(false)}>Pricing</a>
          <a href="#self-host" onClick={() => setOpen(false)}>Self-host</a>
          <a href={`${appUrl}/login`} className="nav-login">Log in</a>
          <a href={`${appUrl}/register`} className="button button-dark">Start free <ArrowRight size={15} /></a>
        </nav>
        <button className="mobile-menu" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
          {open ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>
    </header>
  );
}

function Home() {
  const [currency, setCurrency] = useState<Currency>("JMD");
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [location] = useLocation();

  useEffect(() => {
    let cancelled = false;

    fetch("/api/plans", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Pricing request failed with status ${response.status}.`);
        }
        const payload = await response.json();
        if (!Array.isArray(payload)) {
          throw new Error("Pricing response was not a plan list.");
        }
        return payload as PublicPlan[];
      })
      .then((nextPlans) => {
        if (cancelled) return;
        const sortedPlans = [...nextPlans].sort((a, b) => {
          const aIndex = tierOrder.indexOf(a.tier);
          const bIndex = tierOrder.indexOf(b.tier);
          if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name);
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        });
        setPlans(sortedPlans);
        setPlansError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setPlansError(error instanceof Error ? error.message : "Unable to load current pricing.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="website-shell" id="top">
      <Header />
      {location.includes("checkout=complete") && (
        <div className="checkout-banner"><CheckCircle2 size={17} /> Your payment was sent to Whop. Sign in to Violet to finish activating your workspace.</div>
      )}
      <main>
        <section className="hero container">
          <div className="hero-copy">
            <div className="kicker"><span className="kicker-dot" /> Precision tools for independent retail</div>
            <h1>Run your store with <em>clarity.</em></h1>
            <p className="hero-lede">Violet Enterprise puts your point of sale, inventory, customers, and decisions in one calm, capable workspace.</p>
            <div className="hero-actions">
              <a href="#pricing" className="button button-primary button-large">See plans <ArrowRight size={17} /></a>
              <a href="#self-host" className="text-link">Explore self-hosting <ArrowRight size={15} /></a>
            </div>
            <div className="hero-proof"><span><Check size={14} /> No card for Free</span><span><Check size={14} /> Works offline on your LAN</span><span><Check size={14} /> Built for busy counters</span></div>
          </div>
          <div className="hero-visual" aria-label="Violet dashboard preview">
            <div className="visual-glow" />
            <div className="dashboard-window">
              <div className="window-bar"><span className="window-dots"><i /><i /><i /></span><span className="window-title">Violet / Today</span><span className="window-status">Live</span></div>
              <div className="dashboard-body">
                <aside><div className="mini-logo">V</div><span className="active-line" /><span /><span /><span /><span /></aside>
                <div className="dashboard-main">
                  <div className="dash-heading"><div><small>Thursday, August 27</small><strong>Good morning, Amelia.</strong></div><div className="avatar">AM</div></div>
                  <div className="metric-grid"><div><small>Today’s sales</small><strong>JMD 184,260</strong><span className="positive">↑ 12.8%</span></div><div><small>Orders</small><strong>184</strong><span className="muted">Across 2 registers</span></div><div><small>Low stock</small><strong>08</strong><span className="warning">Needs attention</span></div></div>
                  <div className="chart-card"><div className="chart-label"><strong>Sales overview</strong><span>Last 7 days⌄</span></div><svg viewBox="0 0 440 130" role="img" aria-label="Sales trend rising over seven days"><path d="M0 108 C38 96 48 104 78 79 S125 83 150 62 S194 78 220 54 S267 66 296 33 S350 54 378 24 S408 34 440 10" fill="none" stroke="#b99cff" strokeWidth="4" /><path d="M0 108 C38 96 48 104 78 79 S125 83 150 62 S194 78 220 54 S267 66 296 33 S350 54 378 24 S408 34 440 10 L440 130 L0 130Z" fill="url(#area)" opacity=".28" /><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#9b7aff" /><stop offset="1" stopColor="#9b7aff" stopOpacity="0" /></linearGradient></defs></svg><div className="chart-days"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="logo-strip"><div className="container"><span>Everything your counter needs</span><div><strong>POS</strong><strong>INVENTORY</strong><strong>REPORTS</strong><strong>CUSTOMERS</strong><strong>TEAM</strong></div></div></section>

        <section className="section container" id="product">
          <div className="section-heading"><div><div className="eyebrow">One operating picture</div><h2>The work gets lighter<br />when the system is <em>right.</em></h2></div><p>Stop stitching together tools that were never designed to work together. Violet gives your team a single source of truth from the first scan to the last report.</p></div>
          <div className="feature-grid">{features.map(({ icon: Icon, title, text }) => <article className="feature-card" key={title}><div className="feature-icon"><Icon size={21} /></div><h3>{title}</h3><p>{text}</p><a href="#pricing">Learn more <ArrowRight size={14} /></a></article>)}</div>
        </section>

        <section className="operator-section"><div className="container operator-grid"><div><div className="eyebrow light">Made for the moments that matter</div><h2>A better day at the counter starts <em>here.</em></h2><p>Fast enough for a queue. Detailed enough for a board meeting. Violet keeps the front of house moving while giving owners the confidence behind every number.</p><a href="#pricing" className="button button-light">Find your plan <ArrowRight size={16} /></a></div><div className="operator-list"><div><span>01</span><strong>Sell without slowing down</strong><p>Quick product lookup, scanner-ready workflows, and clean receipts.</p></div><div><span>02</span><strong>See what needs your attention</strong><p>Low-stock signals and live performance data, without the noise.</p></div><div><span>03</span><strong>Keep control of your data</strong><p>Use Violet in the cloud or keep it on your own network.</p></div></div></div></section>

        <section className="pricing-section section container" id="pricing">
          <div className="pricing-top"><div><div className="eyebrow">Plans that scale with you</div><h2>Choose your <em>pace.</em></h2><p>Start free, then add more capacity when the business earns it.</p><small className="pricing-note">Hosted checkout is currently billed in USD.</small></div><div className="currency-toggle" role="group" aria-label="Display currency"><button className={currency === "JMD" ? "selected" : ""} onClick={() => setCurrency("JMD")}>JMD</button><button className={currency === "USD" ? "selected" : ""} onClick={() => setCurrency("USD")}>USD</button></div></div>
           {plansError ? (
             <div className="pricing-load-state">We could not load the current plans. Please refresh and try again.</div>
           ) : plans === null ? (
             <div className="pricing-load-state">Loading current plans…</div>
           ) : plans.length === 0 ? (
             <div className="pricing-load-state">No active plans are currently available.</div>
           ) : (
             <div className="pricing-grid">{plans.map((plan) => {
               const displayPrice = formatPlanPrice(plan, currency);
               return (
                 <article className={`price-card ${plan.isPopular ? "popular" : ""}`} key={plan.id}>
                   <PlanEyebrow plan={plan} />
                   <div className="price-eyebrow">{plan.tier === "free" ? "Start with the essentials" : plan.name}</div>
                   <h3>{plan.name}</h3>
                   <p className="price-description">{plan.description}</p>
                   <div className="price">
                     {displayPrice ? money(displayPrice.amount, displayPrice.currency as Currency) : "Contact us"}
                     <small>{displayPrice ? billingLabel(plan) : ""}</small>
                   </div>
                   {displayPrice && localPriceNote(plan, currency) && (
                     <div className="price-local-note">{localPriceNote(plan, currency)}</div>
                   )}
                   <div className="price-divider" />
                   <ul>{plan.features.map((feature) => <li key={feature}><CheckCircle2 size={16} />{featureLabel(feature)}</li>)}</ul>
                   <CheckoutButton plan={plan} />
                 </article>
               );
             })}</div>
           )}
        </section>

        <section className="self-host-section" id="self-host"><div className="container self-host-grid"><div className="self-host-copy"><div className="eyebrow">Your network. Your data.</div><h2>Operate even when the internet <em>doesn’t.</em></h2><p>Run Violet on a computer in your shop and connect every register, tablet, and phone over your local network. Cloud when you want it. Local when you need it.</p><div className="self-host-actions"><a href="/api/download" className="button button-primary"><Download size={16} /> Download Docker bundle</a><span>Windows · macOS · Linux</span></div></div><div className="self-host-cards"><div><ServerIcon /><strong>One command to start</strong><p>Docker Compose gets your full stack online in minutes.</p></div><div><Wifi size={22} /><strong>Every device on your LAN</strong><p>Cashiers use a browser. No extra installs required.</p></div><div><ShieldCheck size={22} /><strong>Private by design</strong><p>Your data stays on the machine you choose.</p></div></div></div></section>
      </main>
      <footer><div className="container footer-inner"><a className="brand" href="#top"><span className="brand-mark"><span /></span><span>Violet <strong>Enterprise</strong></span></a><div><a href="#product">Product</a><a href="#pricing">Pricing</a><a href={`${appUrl}/login`}>Log in</a></div><small>© {new Date().getFullYear()} Violet Enterprise. Built for better business.</small></div></footer>
    </div>
  );
}

function ServerIcon() {
  return <span className="server-icon"><span /><span /><span /></span>;
}

function App() {
  return <Switch><Route path="/" component={Home} /><Route path="/pricing" component={Home} /><Route><Home /></Route></Switch>;
}

export default App;