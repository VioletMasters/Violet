import React from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, CheckCircle2, Store, Terminal, BarChart3, Users,
  Download, Server, Wifi, ShieldCheck, Package, Monitor
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="container mx-auto px-4 h-20 flex items-center justify-between border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-white" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">Violet Enterprise</span>
        </div>
        <div className="flex gap-4 items-center">
          <a href="#self-host" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
            Self-Host
          </a>
          <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Log in
          </Link>
          <Link href="/register">
            <Button>Start your business</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="py-24 md:py-32 container mx-auto px-4 text-center max-w-4xl">
          <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-8">
            Precision point-of-sale for serious operators
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8">
            Run your store like a <span className="text-primary">cockpit.</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            Violet Enterprise is fast, dense, and unmistakably professional. Stop improvising with consumer apps and start operating with precision.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="h-14 px-8 text-base w-full sm:w-auto">
                Create Account <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
            <a href="#self-host">
              <Button variant="outline" size="lg" className="h-14 px-8 text-base w-full sm:w-auto">
                <Download className="mr-2 w-4 h-4" /> Self-Host on Your LAN
              </Button>
            </a>
          </div>
        </section>

        {/* Features */}
        <section className="py-24 bg-card border-y border-border/50">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="p-6 rounded-2xl bg-background border border-border/50">
                <Terminal className="w-10 h-10 text-primary mb-4" />
                <h3 className="text-xl font-bold mb-2">Lightning POS</h3>
                <p className="text-muted-foreground">Keyboard-friendly, zero-latency checkout designed for high-volume environments.</p>
              </div>
              <div className="p-6 rounded-2xl bg-background border border-border/50">
                <Store className="w-10 h-10 text-primary mb-4" />
                <h3 className="text-xl font-bold mb-2">Inventory Sync</h3>
                <p className="text-muted-foreground">Real-time stock tracking with low-stock alerts and granular adjustment logging.</p>
              </div>
              <div className="p-6 rounded-2xl bg-background border border-border/50">
                <BarChart3 className="w-10 h-10 text-primary mb-4" />
                <h3 className="text-xl font-bold mb-2">Deep Analytics</h3>
                <p className="text-muted-foreground">Understand your margins, track employee performance, and find your best sellers.</p>
              </div>
              <div className="p-6 rounded-2xl bg-background border border-border/50">
                <Users className="w-10 h-10 text-primary mb-4" />
                <h3 className="text-xl font-bold mb-2">Customer CRM</h3>
                <p className="text-muted-foreground">Build loyalty with profiles, purchase history, and unified store credit balances.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="py-24 container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-4xl font-bold mb-4">Transparent Pricing</h2>
            <p className="text-lg text-muted-foreground">Whether you're opening your first shop or managing a chain, we have a plan for you.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Free Tier */}
            <div className="rounded-3xl border border-border/50 p-8 bg-card flex flex-col">
              <h3 className="text-2xl font-bold mb-2">Free Forever</h3>
              <div className="text-4xl font-bold mb-2">$0 <span className="text-lg text-muted-foreground font-normal">/ month</span></div>
              <p className="text-sm text-primary font-medium mb-6">Buy once, own forever. No monthly fees.</p>
              <ul className="space-y-4 mb-8 flex-1">
                {["1 register, 1 branch", "2 users", "Up to 250 products", "Basic POS (cash & card)", "Basic inventory tracking", "Violet branding"].map(f => (
                  <li key={f} className="flex gap-3 text-muted-foreground">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link href="/register?plan=free">
                <Button variant="outline" className="w-full">Get Started</Button>
              </Link>
            </div>

            {/* Starter Tier */}
            <div className="rounded-3xl border border-primary p-8 bg-primary/5 flex flex-col relative">
              <div className="absolute top-0 right-8 -translate-y-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Most Popular</div>
              <h3 className="text-2xl font-bold mb-2">Starter</h3>
              <div className="text-4xl font-bold mb-6">$49 <span className="text-lg text-muted-foreground font-normal">/ month</span></div>
              <ul className="space-y-4 mb-8 flex-1">
                {["2 registers, 1 branch", "5 users", "Up to 2,000 products", "Advanced inventory", "Employee management", "Supplier management", "Detailed reports"].map(f => (
                  <li key={f} className="flex gap-3 text-muted-foreground">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link href="/register?plan=starter">
                <Button className="w-full">Start Free Trial</Button>
              </Link>
            </div>

            {/* Pro Tier */}
            <div className="rounded-3xl border border-border/50 p-8 bg-card flex flex-col">
              <h3 className="text-2xl font-bold mb-2">Professional</h3>
              <div className="text-4xl font-bold mb-6">$129 <span className="text-lg text-muted-foreground font-normal">/ month</span></div>
              <ul className="space-y-4 mb-8 flex-1">
                {["Unlimited registers", "3 branches, 20 users", "Unlimited products", "Multi-branch support", "Advanced analytics", "White-label ready", "Priority support"].map(f => (
                  <li key={f} className="flex gap-3 text-muted-foreground">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link href="/register?plan=professional">
                <Button variant="outline" className="w-full">Start Free Trial</Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Self-Host Section */}
        <section id="self-host" className="py-24 bg-card border-y border-border/50">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-6">
                No internet required
              </div>
              <h2 className="text-4xl font-bold mb-4">Run it on your own network</h2>
              <p className="text-lg text-muted-foreground">
                Own your data completely. Install Violet Enterprise on any computer and every device
                on your Wi-Fi — phones, tablets, PCs — connects through the browser. No cloud subscription needed.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto mb-14">
              <div className="text-center p-6">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Server className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-bold text-lg mb-2">One command to start</h3>
                <p className="text-muted-foreground text-sm">Install Docker Desktop, fill in a config file, run <code className="bg-muted px-1 rounded text-xs">docker compose up</code>. Done.</p>
              </div>
              <div className="text-center p-6">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Wifi className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-bold text-lg mb-2">Any device on your LAN</h3>
                <p className="text-muted-foreground text-sm">Cashiers open a browser on any phone or tablet connected to your Wi-Fi. No app install needed.</p>
              </div>
              <div className="text-center p-6">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-bold text-lg mb-2">Your data stays yours</h3>
                <p className="text-muted-foreground text-sm">All data is stored on your own machine. Nothing leaves your network unless you choose to expose it.</p>
              </div>
            </div>

            {/* Download options — two cards side by side on md+ */}
            <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6">

              {/* Docker bundle */}
              <div className="bg-background rounded-2xl border border-border p-8 flex flex-col">
                <h3 className="font-bold text-xl mb-3 flex items-center gap-2">
                  <Package className="w-5 h-5 text-primary" /> Docker Bundle
                </h3>
                <p className="text-sm text-muted-foreground mb-6 flex-1">
                  Run the full Violet stack (API + web UI + database) on any machine that has Docker Desktop installed — Windows, macOS, or Linux.
                </p>
                <ul className="space-y-3 text-muted-foreground mb-8 text-sm">
                  <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" /><span><strong className="text-foreground">Any modern computer</strong> — Windows 10/11, macOS 12+, or Linux.</span></li>
                  <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" /><span><strong className="text-foreground">Docker Desktop</strong> — free to download at docker.com.</span></li>
                  <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" /><span><strong className="text-foreground">One-time internet</strong> — only needed for the initial download.</span></li>
                </ul>
                <p className="text-xs text-muted-foreground mb-4">
                  Full setup guide, backup instructions, and HTTPS config included in <code className="bg-muted px-1 rounded">README-local.md</code>.
                </p>
                <a href="/api/download">
                  <Button size="lg" className="w-full">
                    <Download className="mr-2 w-4 h-4" /> Download Docker Bundle
                  </Button>
                </a>
                <p className="text-xs text-muted-foreground text-center mt-3">Includes all subscription tiers · Full admin panel · Docker Compose</p>
              </div>

              {/* Desktop Apps */}
              <div className="bg-background rounded-2xl border border-border p-8 flex flex-col">
                <h3 className="font-bold text-xl mb-3 flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-primary" /> Desktop Apps
                </h3>
                <p className="text-sm text-muted-foreground mb-6 flex-1">
                  Prefer a native desktop experience? Violet Enterprise connects to your self-hosted or cloud Violet server without requiring a browser.
                </p>
                <ul className="space-y-3 text-muted-foreground mb-8 text-sm">
                  <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" /><span><strong className="text-foreground">Windows and macOS installers</strong> — built for Windows, Intel Macs, and Apple Silicon Macs.</span></li>
                  <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" /><span><strong className="text-foreground">Works with any server</strong> — point it at your LAN Docker instance or cloud URL.</span></li>
                  <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" /><span><strong className="text-foreground">Remembers your server</strong> — opens straight to your Violet instance every time.</span></li>
                </ul>
                <p className="text-xs text-muted-foreground mb-4">
                  Installer downloads will appear after the first verified public release. You need a running Violet server to connect to.
                </p>
                <Button size="lg" variant="outline" className="w-full" disabled>
                  <Download className="mr-2 w-4 h-4" /> Desktop Installer Coming Soon
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-3">Windows 10 / 11 · macOS Intel and Apple Silicon</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-12 border-t border-border/50 bg-card text-center text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Violet Enterprise. All rights reserved.</p>
      </footer>
    </div>
  );
}
