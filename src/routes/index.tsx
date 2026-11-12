import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  ArrowRight,
  Menu,
  X,
  Compass,
  Ruler,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Search,
  Eye,
  ChevronUp,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isRtl = i18n.dir() === "rtl";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [trackingInput, setTrackingInput] = useState("");
  const [consultationModalOpen, setConsultationModalOpen] = useState(false);

  const handleTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (trackingInput.trim()) {
      navigate({ to: "/track", search: { ref: trackingInput.trim() } });
    } else {
      navigate({ to: "/track" });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-pelecanon-offwhite text-pelecanon-charcoal dark:bg-pelecanon-charcoal-dark dark:text-pelecanon-offwhite font-sans selection:bg-pelecanon-teal/25 selection:text-inherit">
      {/* 1. TOP PRESTIGE BAR */}
      <div className="border-b border-pelecanon-teal/20 bg-pelecanon-charcoal-dark text-muted-foreground text-[11px] tracking-widest uppercase py-2 px-4">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-pelecanon-teal animate-pulse" />
            <span className="font-light text-pelecanon-offwhite/80">
              {t("landing.hero.eyebrow")}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/admin"
              className="hidden sm:inline-block text-muted-foreground/70 hover:text-pelecanon-teal transition-colors text-[10px]"
            >
              {t("landing.nav.staffPortal")}
            </Link>
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>

      {/* 2. STICKY ATELIER NAVIGATION */}
      <header className="sticky top-0 z-40 bg-pelecanon-charcoal-deep/95 backdrop-blur-md border-b border-pelecanon-teal/20 text-pelecanon-offwhite shadow-md transition-all">
        <div className="container mx-auto flex items-center justify-between px-4 py-3.5 sm:py-4">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center group py-0.5">
            <img
              src="/images/brand-logo-dark.png"
              alt="PeleCanon"
              className="h-9 sm:h-10 w-auto object-contain hover:opacity-90 transition-opacity"
            />
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-8 text-xs uppercase tracking-widest text-pelecanon-offwhite/80 font-medium">
            <a
              href="#philosophy"
              className="hover:text-pelecanon-teal transition-colors py-1 relative after:absolute after:bottom-0 after:left-0 after:w-0 hover:after:w-full after:h-[1px] after:bg-pelecanon-teal after:transition-all"
            >
              {t("landing.nav.philosophy")}
            </a>
            <a
              href="#solutions"
              className="hover:text-pelecanon-teal transition-colors py-1 relative after:absolute after:bottom-0 after:left-0 after:w-0 hover:after:w-full after:h-[1px] after:bg-pelecanon-teal after:transition-all"
            >
              {t("landing.nav.solutions")}
            </a>
            <a
              href="#process"
              className="hover:text-pelecanon-teal transition-colors py-1 relative after:absolute after:bottom-0 after:left-0 after:w-0 hover:after:w-full after:h-[1px] after:bg-pelecanon-teal after:transition-all"
            >
              {t("landing.nav.process")}
            </a>
            <a
              href="#craftsmanship"
              className="hover:text-pelecanon-teal transition-colors py-1 relative after:absolute after:bottom-0 after:left-0 after:w-0 hover:after:w-full after:h-[1px] after:bg-pelecanon-teal after:transition-all"
            >
              {t("landing.nav.craftsmanship")}
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="hidden sm:flex items-center gap-3">
            <Link to="/track">
              <Button
                variant="outline"
                size="sm"
                className="border-pelecanon-teal/60 text-pelecanon-teal hover:bg-pelecanon-teal hover:text-white text-xs font-medium tracking-wide uppercase px-4 h-9 rounded-sm transition-all"
              >
                <Eye className="w-3.5 h-3.5" />
                {t("landing.nav.trackOrder")}
              </Button>
            </Link>
            <a href="#cta">
              <Button
                size="sm"
                className="bg-pelecanon-teal text-white hover:bg-pelecanon-teal-hover text-xs font-semibold tracking-wide uppercase px-4 h-9 rounded-sm border border-pelecanon-teal shadow-sm transition-all"
              >
                {t("landing.nav.consultation")}
              </Button>
            </a>
          </div>

          {/* Mobile Hamburger Button */}
          <div className="flex sm:hidden items-center gap-2">
            <Link to="/track">
              <Button
                variant="outline"
                size="sm"
                className="border-pelecanon-teal/60 text-pelecanon-teal text-xs h-8 px-2.5 rounded-sm"
              >
                <Eye className="w-3.5 h-3.5" />
              </Button>
            </Link>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-pelecanon-offwhite hover:text-pelecanon-teal rounded-sm border border-pelecanon-teal/30 transition-colors"
              aria-label="Toggle navigation"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-pelecanon-teal/20 bg-pelecanon-charcoal-deep/98 px-6 py-6 space-y-4 animate-in slide-in-from-top duration-200">
            <nav className="flex flex-col space-y-3 text-sm uppercase tracking-wider text-pelecanon-offwhite/90">
              <a
                href="#philosophy"
                onClick={() => setMobileMenuOpen(false)}
                className="hover:text-pelecanon-teal py-1"
              >
                {t("landing.nav.philosophy")}
              </a>
              <a
                href="#solutions"
                onClick={() => setMobileMenuOpen(false)}
                className="hover:text-pelecanon-teal py-1"
              >
                {t("landing.nav.solutions")}
              </a>
              <a
                href="#process"
                onClick={() => setMobileMenuOpen(false)}
                className="hover:text-pelecanon-teal py-1"
              >
                {t("landing.nav.process")}
              </a>
              <a
                href="#craftsmanship"
                onClick={() => setMobileMenuOpen(false)}
                className="hover:text-pelecanon-teal py-1"
              >
                {t("landing.nav.craftsmanship")}
              </a>
            </nav>
            <div className="pt-4 border-t border-pelecanon-teal/20 flex flex-col gap-2.5">
              <Link to="/track" onClick={() => setMobileMenuOpen(false)}>
                <Button
                  variant="outline"
                  className="w-full border-pelecanon-teal text-pelecanon-teal hover:bg-pelecanon-teal hover:text-white rounded-sm justify-center text-xs tracking-wider uppercase"
                >
                  <Eye className="w-4 h-4" />
                  {t("landing.nav.trackOrder")}
                </Button>
              </Link>
              <a
                href="#cta"
                onClick={() => setMobileMenuOpen(false)}
                className="block"
              >
                <Button className="w-full bg-pelecanon-teal text-white hover:bg-pelecanon-teal-hover font-semibold rounded-sm justify-center text-xs tracking-wider uppercase">
                  {t("landing.nav.consultation")}
                </Button>
              </a>
              <Link
                to="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="text-center text-xs text-muted-foreground hover:text-pelecanon-teal py-2"
              >
                {t("landing.nav.staffPortal")}
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* 3. HERO EXPERIENCE */}
      <section className="relative min-h-[90vh] md:min-h-screen flex items-center justify-center overflow-hidden bg-pelecanon-charcoal-dark text-pelecanon-offwhite">
        {/* Full-bleed Luxury Photography */}
        <img
          src="/images/hero-atelier.jpg"
          alt="PeleCanon Architectural Interior"
          className="absolute inset-0 w-full h-full object-cover object-center filter brightness-[0.78]"
        />

        {/* Sophisticated Emerald & Dark Vignette Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-pelecanon-charcoal-dark via-pelecanon-charcoal-dark/70 to-pelecanon-charcoal-dark/40" />
        <div
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 50% 40%, rgba(17,139,118,0.22) 0%, transparent 65%)",
          }}
        />

        <div className="container mx-auto relative z-10 px-4 py-20 sm:py-28 md:py-36 text-center">
          {/* Eyebrow Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-pelecanon-teal/40 bg-pelecanon-charcoal-deep/70 backdrop-blur-md px-4 py-1.5 text-xs text-pelecanon-teal uppercase tracking-widest mb-8 shadow-lg">
            <Sparkles className="h-3.5 w-3.5 text-pelecanon-teal" />
            <span>{t("landing.hero.eyebrow")}</span>
          </div>

          {/* Editorial Headline */}
          <h1 className="font-serif text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold text-pelecanon-offwhite mb-6 leading-[1.12] tracking-tight max-w-5xl mx-auto">
            {t("landing.hero.headline1")}
            <br />
            <span className="text-pelecanon-teal italic font-light">
              {t("landing.hero.headline2")}
            </span>
          </h1>

          {/* Subtitle Description */}
          <p className="text-base sm:text-lg md:text-xl text-pelecanon-offwhite/85 max-w-3xl mx-auto mb-12 font-light leading-relaxed">
            {t("landing.hero.description")}
          </p>

          {/* Dual Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <a href="#cta" className="w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full sm:w-auto bg-pelecanon-teal text-white hover:bg-pelecanon-teal-hover font-medium tracking-wide uppercase px-8 py-6 rounded-sm border border-pelecanon-teal shadow-xl shadow-pelecanon-teal/20 gap-3 text-sm transition-all"
              >
                <span>{t("landing.hero.startProject")}</span>
                <ArrowRight className="w-4 h-4 rtl-flip" />
              </Button>
            </a>
            <Link to="/track" className="w-full sm:w-auto">
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto border-pelecanon-teal/60 text-pelecanon-offwhite hover:bg-pelecanon-teal/15 hover:border-pelecanon-teal font-medium tracking-wide uppercase px-8 py-6 rounded-sm gap-3 text-sm backdrop-blur-sm transition-all"
              >
                <Eye className="w-4 h-4 text-pelecanon-teal" />
                <span>{t("landing.hero.trackOrder")}</span>
              </Button>
            </Link>
          </div>

          {/* Provenance & Metrics Bar */}
          <div className="max-w-4xl mx-auto pt-8 border-t border-pelecanon-teal/25 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            <div className="space-y-1">
              <div className="font-serif text-2xl sm:text-3xl font-bold text-pelecanon-teal">
                {t("landing.hero.stat1Value")}
              </div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("landing.hero.stat1Label")}
              </div>
            </div>
            <div className="space-y-1 sm:border-x border-pelecanon-teal/20">
              <div className="font-serif text-2xl sm:text-3xl font-bold text-pelecanon-teal">
                {t("landing.hero.stat2Value")}
              </div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("landing.hero.stat2Label")}
              </div>
            </div>
            <div className="space-y-1">
              <div className="font-serif text-2xl sm:text-3xl font-bold text-pelecanon-teal">
                {t("landing.hero.stat3Value")}
              </div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("landing.hero.stat3Label")}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. BRAND PHILOSOPHY SECTION */}
      <section
        id="philosophy"
        className="py-24 sm:py-32 bg-pelecanon-offwhite text-pelecanon-charcoal dark:bg-pelecanon-charcoal-dark dark:text-pelecanon-offwhite border-b border-border/20"
      >
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center mb-20">
            {/* Left Column: Manifesto & Narrative */}
            <div className="lg:col-span-7 space-y-6">
              <div className="text-xs uppercase tracking-widest text-pelecanon-teal font-semibold flex items-center gap-2">
                <span className="w-6 h-[1px] bg-pelecanon-teal" />
                {t("landing.philosophy.eyebrow")}
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-pelecanon-charcoal dark:text-pelecanon-offwhite dark:text-pelecanon-offwhite leading-tight">
                {t("landing.philosophy.title")}
              </h2>

              <blockquote className="font-serif text-xl sm:text-2xl italic text-pelecanon-charcoal/90 dark:text-pelecanon-offwhite/95 pl-6 border-l-2 border-pelecanon-teal rtl:border-l-0 rtl:border-r-2 rtl:pl-0 rtl:pr-6 my-6 leading-relaxed">
                "{t("landing.philosophy.quote")}"
              </blockquote>

              <p className="text-pelecanon-charcoal/80 dark:text-muted-foreground text-base sm:text-lg leading-relaxed font-light">
                {t("landing.philosophy.p1")}
              </p>

              <p className="text-pelecanon-charcoal/80 dark:text-muted-foreground text-base sm:text-lg leading-relaxed font-light">
                {t("landing.philosophy.p2")}
              </p>
            </div>

            {/* Right Column: Architectural Image */}
            <div className="lg:col-span-5">
              <div className="relative group rounded-sm overflow-hidden shadow-2xl border border-pelecanon-teal/30">
                <img
                  src="/images/philosophy-atelier.jpg"
                  alt="Atelier Craftsmanship"
                  className="w-full h-[420px] object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-pelecanon-charcoal-deep/80 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 text-pelecanon-offwhite text-xs tracking-wider uppercase flex items-center justify-between border-t border-pelecanon-teal/40 pt-2">
                  <span>{t("landing.hero.provenance")}</span>
                  <span className="text-pelecanon-teal font-serif">
                    {t("landing.hero.stat1Value")} {t("landing.hero.stat1Label")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Architectural Pillars Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-10 border-t border-border/20">
            <div className="rounded-sm border border-pelecanon-teal/20 bg-card p-6 hover:border-pelecanon-teal transition-colors space-y-3">
              <div className="h-10 w-10 rounded bg-pelecanon-teal/15 text-pelecanon-teal flex items-center justify-center">
                <Compass className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-lg font-bold text-pelecanon-charcoal dark:text-pelecanon-offwhite dark:text-pelecanon-offwhite">
                {t("landing.philosophy.pillar1Title")}
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {t("landing.philosophy.pillar1Desc")}
              </p>
            </div>

            <div className="rounded-sm border border-pelecanon-teal/20 bg-card p-6 hover:border-pelecanon-teal transition-colors space-y-3">
              <div className="h-10 w-10 rounded bg-pelecanon-teal/15 text-pelecanon-teal flex items-center justify-center">
                <Ruler className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-lg font-bold text-pelecanon-charcoal dark:text-pelecanon-offwhite dark:text-pelecanon-offwhite">
                {t("landing.philosophy.pillar2Title")}
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {t("landing.philosophy.pillar2Desc")}
              </p>
            </div>

            <div className="rounded-sm border border-pelecanon-teal/20 bg-card p-6 hover:border-pelecanon-teal transition-colors space-y-3">
              <div className="h-10 w-10 rounded bg-pelecanon-teal/15 text-pelecanon-teal flex items-center justify-center">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-lg font-bold text-pelecanon-charcoal dark:text-pelecanon-offwhite dark:text-pelecanon-offwhite">
                {t("landing.philosophy.pillar3Title")}
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {t("landing.philosophy.pillar3Desc")}
              </p>
            </div>

            <div className="rounded-sm border border-pelecanon-teal/20 bg-card p-6 hover:border-pelecanon-teal transition-colors space-y-3">
              <div className="h-10 w-10 rounded bg-pelecanon-teal/15 text-pelecanon-teal flex items-center justify-center">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-lg font-bold text-pelecanon-charcoal dark:text-pelecanon-offwhite dark:text-pelecanon-offwhite">
                {t("landing.philosophy.pillar4Title")}
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {t("landing.philosophy.pillar4Desc")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. SOLUTIONS & CAPABILITIES SECTION */}
      <section
        id="solutions"
        className="py-24 sm:py-32 bg-pelecanon-offwhite text-pelecanon-charcoal dark:bg-background dark:text-pelecanon-offwhite border-b border-border/20"
      >
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <div className="text-xs uppercase tracking-widest text-pelecanon-teal font-semibold inline-flex items-center gap-2">
              <span className="w-6 h-[1px] bg-pelecanon-teal" />
              {t("landing.solutions.eyebrow")}
              <span className="w-6 h-[1px] bg-pelecanon-teal" />
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-pelecanon-charcoal dark:text-pelecanon-offwhite dark:text-pelecanon-offwhite">
              {t("landing.solutions.title")}
            </h2>
            <p className="text-pelecanon-charcoal/70 dark:text-muted-foreground text-sm sm:text-base leading-relaxed">
              {t("landing.solutions.subtitle")}
            </p>
          </div>

          {/* 4 Showcase Domains Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-10">
            {/* Domain 1: Kitchens */}
            <div className="group rounded-sm border border-pelecanon-teal/25 bg-card overflow-hidden shadow-lg hover:border-pelecanon-teal transition-all duration-300">
              <div className="relative h-72 sm:h-80 overflow-hidden">
                <img
                  src="/images/solution-kitchen.jpg"
                  alt="Bespoke Kitchens & Islands"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute top-4 left-4 rtl:left-auto rtl:right-4 bg-pelecanon-charcoal-deep/85 backdrop-blur-sm text-pelecanon-teal text-[10px] tracking-widest uppercase px-3 py-1 rounded-sm border border-pelecanon-teal/40">
                  {t("landing.solutions.kitchenTag")}
                </div>
              </div>
              <div className="p-8 space-y-4">
                <h3 className="font-serif text-2xl font-bold text-pelecanon-charcoal dark:text-pelecanon-offwhite dark:text-pelecanon-offwhite">
                  {t("landing.solutions.kitchenTitle")}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed font-light">
                  {t("landing.solutions.kitchenDesc")}
                </p>
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
                  <span className="px-2.5 py-1 rounded bg-muted">
                    {t("landing.solutions.kitchenFeat1")}
                  </span>
                  <span className="px-2.5 py-1 rounded bg-muted">
                    {t("landing.solutions.kitchenFeat2")}
                  </span>
                  <span className="px-2.5 py-1 rounded bg-muted">
                    {t("landing.solutions.kitchenFeat3")}
                  </span>
                </div>
              </div>
            </div>

            {/* Domain 2: Dressing Rooms */}
            <div className="group rounded-sm border border-pelecanon-teal/25 bg-card overflow-hidden shadow-lg hover:border-pelecanon-teal transition-all duration-300">
              <div className="relative h-72 sm:h-80 overflow-hidden">
                <img
                  src="/images/solution-dressing.jpg"
                  alt="Luxury Dressing Rooms"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute top-4 left-4 rtl:left-auto rtl:right-4 bg-pelecanon-charcoal-deep/85 backdrop-blur-sm text-pelecanon-teal text-[10px] tracking-widest uppercase px-3 py-1 rounded-sm border border-pelecanon-teal/40">
                  {t("landing.solutions.dressingTag")}
                </div>
              </div>
              <div className="p-8 space-y-4">
                <h3 className="font-serif text-2xl font-bold text-pelecanon-charcoal dark:text-pelecanon-offwhite dark:text-pelecanon-offwhite">
                  {t("landing.solutions.dressingTitle")}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed font-light">
                  {t("landing.solutions.dressingDesc")}
                </p>
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
                  <span className="px-2.5 py-1 rounded bg-muted">
                    {t("landing.solutions.dressingFeat1")}
                  </span>
                  <span className="px-2.5 py-1 rounded bg-muted">
                    {t("landing.solutions.dressingFeat2")}
                  </span>
                  <span className="px-2.5 py-1 rounded bg-muted">
                    {t("landing.solutions.dressingFeat3")}
                  </span>
                </div>
              </div>
            </div>

            {/* Domain 3: Doors */}
            <div className="group rounded-sm border border-pelecanon-teal/25 bg-card overflow-hidden shadow-lg hover:border-pelecanon-teal transition-all duration-300">
              <div className="relative h-72 sm:h-80 overflow-hidden">
                <img
                  src="/images/solution-doors.jpg"
                  alt="Architectural Interior & Pivot Doors"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute top-4 left-4 rtl:left-auto rtl:right-4 bg-pelecanon-charcoal-deep/85 backdrop-blur-sm text-pelecanon-teal text-[10px] tracking-widest uppercase px-3 py-1 rounded-sm border border-pelecanon-teal/40">
                  {t("landing.solutions.doorsTag")}
                </div>
              </div>
              <div className="p-8 space-y-4">
                <h3 className="font-serif text-2xl font-bold text-pelecanon-charcoal dark:text-pelecanon-offwhite dark:text-pelecanon-offwhite">
                  {t("landing.solutions.doorsTitle")}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed font-light">
                  {t("landing.solutions.doorsDesc")}
                </p>
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
                  <span className="px-2.5 py-1 rounded bg-muted">
                    {t("landing.solutions.doorsFeat1")}
                  </span>
                  <span className="px-2.5 py-1 rounded bg-muted">
                    {t("landing.solutions.doorsFeat2")}
                  </span>
                  <span className="px-2.5 py-1 rounded bg-muted">
                    {t("landing.solutions.doorsFeat3")}
                  </span>
                </div>
              </div>
            </div>

            {/* Domain 4: Millwork & Living */}
            <div className="group rounded-sm border border-pelecanon-teal/25 bg-card overflow-hidden shadow-lg hover:border-pelecanon-teal transition-all duration-300">
              <div className="relative h-72 sm:h-80 overflow-hidden">
                <img
                  src="/images/solution-living.jpg"
                  alt="Custom Millwork & Living Accents"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute top-4 left-4 rtl:left-auto rtl:right-4 bg-pelecanon-charcoal-deep/85 backdrop-blur-sm text-pelecanon-teal text-[10px] tracking-widest uppercase px-3 py-1 rounded-sm border border-pelecanon-teal/40">
                  {t("landing.solutions.millworkTag")}
                </div>
              </div>
              <div className="p-8 space-y-4">
                <h3 className="font-serif text-2xl font-bold text-pelecanon-charcoal dark:text-pelecanon-offwhite dark:text-pelecanon-offwhite">
                  {t("landing.solutions.millworkTitle")}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed font-light">
                  {t("landing.solutions.millworkDesc")}
                </p>
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
                  <span className="px-2.5 py-1 rounded bg-muted">
                    {t("landing.solutions.millworkFeat1")}
                  </span>
                  <span className="px-2.5 py-1 rounded bg-muted">
                    {t("landing.solutions.millworkFeat2")}
                  </span>
                  <span className="px-2.5 py-1 rounded bg-muted">
                    {t("landing.solutions.millworkFeat3")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. OUR PROCESS SECTION */}
      <section
        id="process"
        className="py-24 sm:py-32 bg-pelecanon-offwhite text-pelecanon-charcoal dark:bg-pelecanon-charcoal-dark dark:text-pelecanon-offwhite border-b border-border/20"
      >
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-20 space-y-4">
            <div className="text-xs uppercase tracking-widest text-pelecanon-teal font-semibold inline-flex items-center gap-2">
              <span className="w-6 h-[1px] bg-pelecanon-teal" />
              {t("landing.process.eyebrow")}
              <span className="w-6 h-[1px] bg-pelecanon-teal" />
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-pelecanon-charcoal dark:text-pelecanon-offwhite dark:text-pelecanon-offwhite">
              {t("landing.process.title")}
            </h2>
            <p className="text-pelecanon-charcoal/70 dark:text-muted-foreground text-sm sm:text-base leading-relaxed">
              {t("landing.process.subtitle")}
            </p>
          </div>

          {/* 5-Step Architectural Timeline */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 relative">
            {/* Step 1 */}
            <div className="relative rounded-sm border border-pelecanon-teal/20 bg-card p-6 flex flex-col justify-between hover:border-pelecanon-teal transition-colors">
              <div>
                <div className="font-serif text-3xl font-bold text-pelecanon-teal mb-3">
                  {t("landing.process.step1Num")}
                </div>
                <h3 className="font-serif text-lg font-bold text-pelecanon-charcoal dark:text-pelecanon-offwhite dark:text-pelecanon-offwhite mb-2">
                  {t("landing.process.step1Title")}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("landing.process.step1Desc")}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border/50 text-[10px] text-pelecanon-teal uppercase tracking-wider font-medium">
                Milestone 01
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative rounded-sm border border-pelecanon-teal/20 bg-card p-6 flex flex-col justify-between hover:border-pelecanon-teal transition-colors">
              <div>
                <div className="font-serif text-3xl font-bold text-pelecanon-teal mb-3">
                  {t("landing.process.step2Num")}
                </div>
                <h3 className="font-serif text-lg font-bold text-pelecanon-charcoal dark:text-pelecanon-offwhite dark:text-pelecanon-offwhite mb-2">
                  {t("landing.process.step2Title")}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("landing.process.step2Desc")}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border/50 text-[10px] text-pelecanon-teal uppercase tracking-wider font-medium">
                Milestone 02
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative rounded-sm border border-pelecanon-teal/20 bg-card p-6 flex flex-col justify-between hover:border-pelecanon-teal transition-colors">
              <div>
                <div className="font-serif text-3xl font-bold text-pelecanon-teal mb-3">
                  {t("landing.process.step3Num")}
                </div>
                <h3 className="font-serif text-lg font-bold text-pelecanon-charcoal dark:text-pelecanon-offwhite dark:text-pelecanon-offwhite mb-2">
                  {t("landing.process.step3Title")}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("landing.process.step3Desc")}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border/50 text-[10px] text-pelecanon-teal uppercase tracking-wider font-medium">
                Milestone 03
              </div>
            </div>

            {/* Step 4 */}
            <div className="relative rounded-sm border border-pelecanon-teal/20 bg-card p-6 flex flex-col justify-between hover:border-pelecanon-teal transition-colors">
              <div>
                <div className="font-serif text-3xl font-bold text-pelecanon-teal mb-3">
                  {t("landing.process.step4Num")}
                </div>
                <h3 className="font-serif text-lg font-bold text-pelecanon-charcoal dark:text-pelecanon-offwhite dark:text-pelecanon-offwhite mb-2">
                  {t("landing.process.step4Title")}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("landing.process.step4Desc")}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border/50 text-[10px] text-pelecanon-teal uppercase tracking-wider font-medium">
                Milestone 04
              </div>
            </div>

            {/* Step 5 */}
            <div className="relative rounded-sm border border-pelecanon-teal/20 bg-card p-6 flex flex-col justify-between hover:border-pelecanon-teal transition-colors">
              <div>
                <div className="font-serif text-3xl font-bold text-pelecanon-teal mb-3">
                  {t("landing.process.step5Num")}
                </div>
                <h3 className="font-serif text-lg font-bold text-pelecanon-charcoal dark:text-pelecanon-offwhite dark:text-pelecanon-offwhite mb-2">
                  {t("landing.process.step5Title")}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("landing.process.step5Desc")}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border/50 text-[10px] text-pelecanon-teal uppercase tracking-wider font-medium">
                Milestone 05
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. CRAFTSMANSHIP & MATERIAL INTEGRITY */}
      <section
        id="craftsmanship"
        className="py-24 sm:py-32 bg-pelecanon-offwhite text-pelecanon-charcoal dark:bg-background dark:text-pelecanon-offwhite border-b border-border/20"
      >
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <div className="text-xs uppercase tracking-widest text-pelecanon-teal font-semibold inline-flex items-center gap-2">
              <span className="w-6 h-[1px] bg-pelecanon-teal" />
              {t("landing.craftsmanship.eyebrow")}
              <span className="w-6 h-[1px] bg-pelecanon-teal" />
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-pelecanon-charcoal dark:text-pelecanon-offwhite dark:text-pelecanon-offwhite">
              {t("landing.craftsmanship.title")}
            </h2>
            <p className="text-pelecanon-charcoal/70 dark:text-muted-foreground text-sm sm:text-base leading-relaxed">
              {t("landing.craftsmanship.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Card 1: Woods & Veneers */}
            <div className="rounded-sm border border-pelecanon-teal/25 bg-card overflow-hidden shadow hover:border-pelecanon-teal transition-all duration-300">
              <div className="h-60 overflow-hidden">
                <img
                  src="/images/craft-materials.jpg"
                  alt="Selected Woods & Veneers"
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
                />
              </div>
              <div className="p-6 space-y-3">
                <span className="text-[10px] uppercase tracking-widest text-pelecanon-teal font-semibold">
                  {t("landing.craftsmanship.card1Tag")}
                </span>
                <h3 className="font-serif text-xl font-bold text-pelecanon-charcoal dark:text-pelecanon-offwhite dark:text-pelecanon-offwhite">
                  {t("landing.craftsmanship.card1Title")}
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {t("landing.craftsmanship.card1Desc")}
                </p>
              </div>
            </div>

            {/* Card 2: Joinery */}
            <div className="rounded-sm border border-pelecanon-teal/25 bg-card overflow-hidden shadow hover:border-pelecanon-teal transition-all duration-300">
              <div className="h-60 overflow-hidden">
                <img
                  src="/images/craft-joinery.jpg"
                  alt="Precision Joinery"
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
                />
              </div>
              <div className="p-6 space-y-3">
                <span className="text-[10px] uppercase tracking-widest text-pelecanon-teal font-semibold">
                  {t("landing.craftsmanship.card2Tag")}
                </span>
                <h3 className="font-serif text-xl font-bold text-pelecanon-charcoal dark:text-pelecanon-offwhite dark:text-pelecanon-offwhite">
                  {t("landing.craftsmanship.card2Title")}
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {t("landing.craftsmanship.card2Desc")}
                </p>
              </div>
            </div>

            {/* Card 3: Finishing */}
            <div className="rounded-sm border border-pelecanon-teal/25 bg-card overflow-hidden shadow hover:border-pelecanon-teal transition-all duration-300">
              <div className="h-60 overflow-hidden">
                <img
                  src="/images/craft-finishing.jpg"
                  alt="Tactile Finishing"
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
                />
              </div>
              <div className="p-6 space-y-3">
                <span className="text-[10px] uppercase tracking-widest text-pelecanon-teal font-semibold">
                  {t("landing.craftsmanship.card3Tag")}
                </span>
                <h3 className="font-serif text-xl font-bold text-pelecanon-charcoal dark:text-pelecanon-offwhite dark:text-pelecanon-offwhite">
                  {t("landing.craftsmanship.card3Title")}
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {t("landing.craftsmanship.card3Desc")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. CLIENT PRODUCTION TRACKING EXPERIENCE */}
      <section className="py-24 bg-pelecanon-charcoal-dark text-pelecanon-offwhite border-y border-pelecanon-teal/30 relative overflow-hidden">
        {/* Ambient Subtle Radial Glow */}
        <div
          className="absolute inset-0 pointer-events-none opacity-25"
          style={{
            backgroundImage:
              "radial-gradient(circle at 80% 50%, rgba(17,139,118,0.20) 0%, transparent 60%)",
          }}
        />

        <div className="container mx-auto px-4 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            {/* Left Column: Tracking Intro & Quick Lookup */}
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-pelecanon-teal/40 bg-pelecanon-teal/25 px-3.5 py-1 text-xs text-pelecanon-teal uppercase tracking-wider">
                <Eye className="w-3.5 h-3.5" />
                <span>{t("landing.tracking.eyebrow")}</span>
              </div>

              <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-pelecanon-offwhite leading-tight">
                {t("landing.tracking.title")}
              </h2>

              <p className="text-muted-foreground text-base leading-relaxed font-light">
                {t("landing.tracking.subtitle")}
              </p>

              {/* Quick Lookup Form */}
              <form
                onSubmit={handleTrackSubmit}
                className="bg-black/30 p-2 sm:p-2.5 rounded-sm border border-pelecanon-teal/30 flex flex-col sm:flex-row gap-2 max-w-lg shadow-xl"
              >
                <div className="relative flex-1">
                  <Input
                    type="text"
                    value={trackingInput}
                    onChange={(e) => setTrackingInput(e.target.value)}
                    placeholder={t("landing.tracking.orderNumberPlaceholder")}
                    className="bg-transparent border-0 text-pelecanon-offwhite placeholder:text-muted-foreground/60 focus-visible:ring-0 text-sm h-11"
                  />
                </div>
                <Button
                  type="submit"
                  className="bg-pelecanon-teal text-white hover:bg-pelecanon-teal-hover font-semibold tracking-wide uppercase px-6 h-11 rounded-sm gap-2 whitespace-nowrap"
                >
                  <Search className="w-4 h-4" />
                  <span>{t("landing.tracking.trackButton")}</span>
                </Button>
              </form>

              <div className="flex items-center gap-2 text-xs text-muted-foreground/80 font-light">
                <Lock className="w-3.5 h-3.5 text-pelecanon-teal" />
                <span>{t("landing.tracking.secureNote")}</span>
              </div>
            </div>

            {/* Right Column: 9-Stage Milestone Stepper Preview */}
            <div className="lg:col-span-6">
              <div className="rounded-sm border border-pelecanon-teal/30 bg-pelecanon-charcoal-deep/90 p-6 sm:p-8 backdrop-blur shadow-2xl">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-pelecanon-teal/20">
                  <div className="text-xs uppercase tracking-widest text-pelecanon-teal font-medium">
                    {t("landing.tracking.stagesTitle")}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Digital Portal
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center gap-2.5 p-2 rounded bg-white/5 border border-white/5">
                    <CheckCircle2 className="w-4 h-4 text-pelecanon-teal shrink-0" />
                    <span className="text-pelecanon-offwhite font-light">
                      {t("landing.tracking.stage1")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 p-2 rounded bg-white/5 border border-white/5">
                    <CheckCircle2 className="w-4 h-4 text-pelecanon-teal shrink-0" />
                    <span className="text-pelecanon-offwhite font-light">
                      {t("landing.tracking.stage2")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 p-2 rounded bg-white/5 border border-white/5">
                    <CheckCircle2 className="w-4 h-4 text-pelecanon-teal shrink-0" />
                    <span className="text-pelecanon-offwhite font-light">
                      {t("landing.tracking.stage3")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 p-2 rounded bg-white/5 border border-white/5">
                    <CheckCircle2 className="w-4 h-4 text-pelecanon-teal shrink-0" />
                    <span className="text-pelecanon-offwhite font-light">
                      {t("landing.tracking.stage4")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 p-2 rounded bg-white/5 border border-white/5">
                    <CheckCircle2 className="w-4 h-4 text-pelecanon-teal shrink-0" />
                    <span className="text-pelecanon-offwhite font-light">
                      {t("landing.tracking.stage5")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 p-2 rounded bg-white/5 border border-white/5">
                    <CheckCircle2 className="w-4 h-4 text-pelecanon-teal shrink-0" />
                    <span className="text-pelecanon-offwhite font-light">
                      {t("landing.tracking.stage6")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 p-2 rounded bg-white/5 border border-white/5">
                    <CheckCircle2 className="w-4 h-4 text-pelecanon-teal shrink-0" />
                    <span className="text-pelecanon-offwhite font-light">
                      {t("landing.tracking.stage7")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 p-2 rounded bg-white/5 border border-white/5">
                    <CheckCircle2 className="w-4 h-4 text-pelecanon-teal shrink-0" />
                    <span className="text-pelecanon-offwhite font-light">
                      {t("landing.tracking.stage8")}
                    </span>
                  </div>
                  <div className="sm:col-span-2 flex items-center gap-2.5 p-2 rounded bg-pelecanon-teal/15 border border-pelecanon-teal/40">
                    <Sparkles className="w-4 h-4 text-pelecanon-teal shrink-0" />
                    <span className="text-pelecanon-teal font-medium">
                      {t("landing.tracking.stage9")}
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-pelecanon-teal/20 text-center">
                  <Link to="/track">
                    <Button
                      variant="link"
                      className="text-pelecanon-teal hover:text-pelecanon-offwhite text-xs uppercase tracking-widest gap-2"
                    >
                      <span>{t("landing.tracking.trackCta")}</span>
                      <ArrowRight className="w-3.5 h-3.5 rtl-flip" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 9. FINAL CALL TO ACTION SECTION */}
      <section
        id="cta"
        className="py-24 sm:py-32 bg-pelecanon-offwhite dark:bg-pelecanon-charcoal-dark text-center relative overflow-hidden"
      >
        <div className="container mx-auto px-4 max-w-4xl relative z-10 space-y-6">
          <div className="text-xs uppercase tracking-widest text-pelecanon-teal font-semibold inline-flex items-center gap-2">
            <span className="w-6 h-[1px] bg-pelecanon-teal" />
            {t("landing.cta.eyebrow")}
            <span className="w-6 h-[1px] bg-pelecanon-teal" />
          </div>

          <h2 className="font-serif text-3xl sm:text-4xl md:text-6xl font-bold text-pelecanon-charcoal dark:text-pelecanon-offwhite dark:text-pelecanon-offwhite leading-tight">
            {t("landing.cta.title")}
          </h2>

          <p className="text-pelecanon-charcoal/80 dark:text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto leading-relaxed font-light">
            {t("landing.cta.subtitle")}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
            <Button
              onClick={() => setConsultationModalOpen(true)}
              size="lg"
              className="w-full sm:w-auto bg-pelecanon-teal text-white hover:bg-pelecanon-teal-hover font-semibold tracking-wide uppercase px-8 py-6 rounded-sm border border-pelecanon-teal shadow-lg shadow-pelecanon-teal/20 text-sm"
            >
              {t("landing.cta.startCta")}
            </Button>
            <Link to="/track" className="w-full sm:w-auto">
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto border-pelecanon-teal/60 text-pelecanon-charcoal dark:text-pelecanon-offwhite hover:bg-pelecanon-teal/15 font-medium tracking-wide uppercase px-8 py-6 rounded-sm text-sm"
              >
                {t("landing.cta.trackCta")}
              </Button>
            </Link>
          </div>

          <p className="text-xs text-muted-foreground pt-4">
            {t("landing.cta.locationNote")}
          </p>
        </div>
      </section>

      {/* 10. LUXURY ATELIER FOOTER */}
      <footer className="border-t border-pelecanon-teal/25 bg-pelecanon-charcoal-dark text-muted-foreground text-xs">
        <div className="container mx-auto px-4 py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
            {/* Brand Column */}
            <div className="lg:col-span-2 space-y-4">
              <Link to="/" className="inline-block py-0.5">
                <img
                  src="/images/brand-logo-dark.png"
                  alt="PeleCanon"
                  className="h-10 sm:h-11 w-auto object-contain hover:opacity-90 transition-opacity"
                />
              </Link>
              <p className="text-muted-foreground/80 leading-relaxed font-light text-xs max-w-sm">
                {t("landing.footer.brandDesc")}
              </p>
              <div className="text-[11px] text-pelecanon-teal/80 italic font-serif">
                {t("landing.footer.madeWithCare")}
              </div>
            </div>

            {/* Links: Explore */}
            <div className="space-y-3">
              <h4 className="font-serif text-sm font-semibold uppercase tracking-wider text-pelecanon-offwhite border-b border-pelecanon-teal/20 pb-2">
                {t("landing.footer.exploreTitle")}
              </h4>
              <ul className="space-y-2 text-muted-foreground/80 text-xs">
                <li>
                  <a href="#philosophy" className="hover:text-pelecanon-teal transition-colors">
                    {t("landing.nav.philosophy")}
                  </a>
                </li>
                <li>
                  <a href="#solutions" className="hover:text-pelecanon-teal transition-colors">
                    {t("landing.nav.solutions")}
                  </a>
                </li>
                <li>
                  <a href="#process" className="hover:text-pelecanon-teal transition-colors">
                    {t("landing.nav.process")}
                  </a>
                </li>
                <li>
                  <a href="#craftsmanship" className="hover:text-pelecanon-teal transition-colors">
                    {t("landing.nav.craftsmanship")}
                  </a>
                </li>
              </ul>
            </div>

            {/* Links: Client Services */}
            <div className="space-y-3">
              <h4 className="font-serif text-sm font-semibold uppercase tracking-wider text-pelecanon-offwhite border-b border-pelecanon-teal/20 pb-2">
                {t("landing.footer.servicesTitle")}
              </h4>
              <ul className="space-y-2 text-muted-foreground/80 text-xs">
                <li>
                  <Link to="/track" className="hover:text-pelecanon-teal transition-colors">
                    {t("landing.nav.trackOrder")}
                  </Link>
                </li>
                <li>
                  <a href="#cta" className="hover:text-pelecanon-teal transition-colors">
                    {t("landing.nav.consultation")}
                  </a>
                </li>
                <li>
                  <a href="#craftsmanship" className="hover:text-pelecanon-teal transition-colors">
                    {t("landing.craftsmanship.title")}
                  </a>
                </li>
              </ul>
            </div>

            {/* Links: Production Hub & Staff Portal */}
            <div className="space-y-3">
              <h4 className="font-serif text-sm font-semibold uppercase tracking-wider text-pelecanon-offwhite border-b border-pelecanon-teal/20 pb-2">
                {t("landing.footer.hubTitle")}
              </h4>
              <ul className="space-y-2 text-muted-foreground/80 text-xs">
                <li>
                  <Link
                    to="/admin"
                    className="hover:text-pelecanon-teal transition-colors inline-flex items-center gap-1.5"
                  >
                    <Lock className="w-3 h-3 text-pelecanon-teal" />
                    <span>{t("landing.footer.staffPortal")}</span>
                  </Link>
                </li>
                <li className="text-[11px] text-muted-foreground/60">
                  {t("landing.hero.provenance")}
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="mt-12 pt-8 border-t border-pelecanon-teal/20 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground/70">
            <div>
              © {new Date().getFullYear()} PeleCanon Atelier. {t("landing.footer.rights")}
            </div>
            <button
              onClick={scrollToTop}
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-pelecanon-teal transition-colors cursor-pointer"
            >
              <span>{t("common.top")}</span>
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </footer>

      {/* Consultation Quick Request Dialog */}
      {consultationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md rounded-sm border border-pelecanon-teal/50 bg-pelecanon-charcoal-dark p-6 sm:p-8 text-pelecanon-offwhite shadow-2xl space-y-5">
            <button
              onClick={() => setConsultationModalOpen(false)}
              className="absolute top-4 right-4 rtl:right-auto rtl:left-4 text-muted-foreground hover:text-pelecanon-teal"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-2 text-center">
              <div className="text-[10px] uppercase tracking-widest text-pelecanon-teal font-semibold">
                {t("landing.cta.eyebrow")}
              </div>
              <h3 className="font-serif text-2xl font-bold text-pelecanon-offwhite">
                {t("landing.cta.startCta")}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed font-light">
                {t("landing.cta.subtitle")}
              </p>
            </div>

            <div className="p-4 rounded border border-pelecanon-teal/25 bg-black/40 text-center space-y-3">
              <div className="text-xs text-pelecanon-offwhite/90 font-medium">
                PeleCanon Atelier Client Advisory
              </div>
              <div className="text-sm font-serif text-pelecanon-teal tracking-wider" dir="ltr">
                +20 100 000 0000
              </div>
              <div className="text-xs text-muted-foreground">
                advisory@pelecanon.com
              </div>
            </div>

            <div className="flex gap-3">
              <Link to="/track" className="flex-1" onClick={() => setConsultationModalOpen(false)}>
                <Button
                  variant="outline"
                  className="w-full border-pelecanon-teal/40 text-pelecanon-offwhite text-xs uppercase"
                >
                  {t("landing.nav.trackOrder")}
                </Button>
              </Link>
              <Button
                onClick={() => setConsultationModalOpen(false)}
                className="flex-1 bg-pelecanon-teal text-white hover:bg-pelecanon-teal-hover text-xs font-semibold uppercase"
              >
                {t("landing.nav.close")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
