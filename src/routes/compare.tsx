import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Menu,
  X,
  Compass,
  Ruler,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Eye,
  ChevronUp,
  ChevronDown,
  Layers,
  FileSpreadsheet,
  Building2,
  Zap,
  Check,
  Minus,
  CheckCircle,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTranslation } from "react-i18next";
import { TENANT_PLANS } from "@/lib/tenant-plans";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "مقارنة نظام بيليكانون لإدارة الورش والمصانع — PeleCanon vs. Excel vs. Generic ERP" },
      {
        name: "description",
        content:
          "اكتشف كيف يساعد بيليكانون ورش ومصانع الأثاث والديكور في مصر على تجاوز فوضى الإكسيل والواتساب بدون تعقيدات أودو أو ساب.",
      },
    ],
  }),
  component: ComparePage,
});

function ComparePage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const matrixRows = [
    {
      title: t("compare.matrix.row1Title"),
      pelecanon: t("compare.matrix.row1Pele"),
      spreadsheets: t("compare.matrix.row1Excel"),
      genericErp: t("compare.matrix.row1Generic"),
    },
    {
      title: t("compare.matrix.row2Title"),
      pelecanon: t("compare.matrix.row2Pele"),
      spreadsheets: t("compare.matrix.row2Excel"),
      genericErp: t("compare.matrix.row2Generic"),
    },
    {
      title: t("compare.matrix.row3Title"),
      pelecanon: t("compare.matrix.row3Pele"),
      spreadsheets: t("compare.matrix.row3Excel"),
      genericErp: t("compare.matrix.row3Generic"),
    },
    {
      title: t("compare.matrix.row4Title"),
      pelecanon: t("compare.matrix.row4Pele"),
      spreadsheets: t("compare.matrix.row4Excel"),
      genericErp: t("compare.matrix.row4Generic"),
    },
    {
      title: t("compare.matrix.row5Title"),
      pelecanon: t("compare.matrix.row5Pele"),
      spreadsheets: t("compare.matrix.row5Excel"),
      genericErp: t("compare.matrix.row5Generic"),
    },
    {
      title: t("compare.matrix.row6Title"),
      pelecanon: t("compare.matrix.row6Pele"),
      spreadsheets: t("compare.matrix.row6Excel"),
      genericErp: t("compare.matrix.row6Generic"),
    },
    {
      title: t("compare.matrix.row7Title"),
      pelecanon: t("compare.matrix.row7Pele"),
      spreadsheets: t("compare.matrix.row7Excel"),
      genericErp: t("compare.matrix.row7Generic"),
    },
    {
      title: t("compare.matrix.row8Title"),
      pelecanon: t("compare.matrix.row8Pele"),
      spreadsheets: t("compare.matrix.row8Excel"),
      genericErp: t("compare.matrix.row8Generic"),
    },
    {
      title: t("compare.matrix.row9Title"),
      pelecanon: t("compare.matrix.row9Pele"),
      spreadsheets: t("compare.matrix.row9Excel"),
      genericErp: t("compare.matrix.row9Generic"),
    },
    {
      title: t("compare.matrix.row10Title"),
      pelecanon: t("compare.matrix.row10Pele"),
      spreadsheets: t("compare.matrix.row10Excel"),
      genericErp: t("compare.matrix.row10Generic"),
    },
  ];

  return (
    <div className="min-h-screen bg-pelecanon-offwhite text-pelecanon-charcoal dark:bg-pelecanon-charcoal-dark dark:text-pelecanon-offwhite font-sans selection:bg-pelecanon-teal/25 selection:text-inherit">
      {/* 1. TOP PRESTIGE BAR */}
      <div className="border-b border-pelecanon-teal/20 bg-pelecanon-charcoal-dark text-muted-foreground text-[11px] tracking-widest uppercase py-2 px-4">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-pelecanon-teal animate-pulse" />
            <span className="font-light text-pelecanon-offwhite/80">
              {t("compare.badge")}
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
            <Link
              to="/"
              hash="philosophy"
              className="hover:text-pelecanon-teal transition-colors py-1 relative after:absolute after:bottom-0 after:left-0 after:w-0 hover:after:w-full after:h-[1px] after:bg-pelecanon-teal after:transition-all"
            >
              {t("landing.nav.philosophy")}
            </Link>
            <Link
              to="/"
              hash="solutions"
              className="hover:text-pelecanon-teal transition-colors py-1 relative after:absolute after:bottom-0 after:left-0 after:w-0 hover:after:w-full after:h-[1px] after:bg-pelecanon-teal after:transition-all"
            >
              {t("landing.nav.solutions")}
            </Link>
            <Link
              to="/"
              hash="process"
              className="hover:text-pelecanon-teal transition-colors py-1 relative after:absolute after:bottom-0 after:left-0 after:w-0 hover:after:w-full after:h-[1px] after:bg-pelecanon-teal after:transition-all"
            >
              {t("landing.nav.process")}
            </Link>
            <Link
              to="/"
              hash="craftsmanship"
              className="hover:text-pelecanon-teal transition-colors py-1 relative after:absolute after:bottom-0 after:left-0 after:w-0 hover:after:w-full after:h-[1px] after:bg-pelecanon-teal after:transition-all"
            >
              {t("landing.nav.craftsmanship")}
            </Link>
            <Link
              to="/compare"
              className="text-pelecanon-teal font-semibold py-1 relative after:absolute after:bottom-0 after:left-0 after:w-full after:h-[2px] after:bg-pelecanon-teal"
            >
              {t("landing.nav.compare")}
            </Link>
          </nav>

          {/* Action CTAs */}
          <div className="hidden sm:flex items-center gap-3">
            <Link to="/track">
              <Button
                variant="outline"
                size="sm"
                className="border-pelecanon-teal/60 text-pelecanon-teal hover:bg-pelecanon-teal hover:text-white text-xs font-medium tracking-wide uppercase px-4 h-9 rounded-sm transition-all cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                {t("landing.nav.trackOrder")}
              </Button>
            </Link>
            <Link to="/auth" search={{ tab: "register" }}>
              <Button
                size="sm"
                className="bg-pelecanon-teal text-white hover:bg-pelecanon-teal-hover text-xs font-semibold tracking-wide uppercase px-4 h-9 rounded-sm border border-pelecanon-teal shadow-sm transition-all cursor-pointer"
              >
                {t("compare.hero.startFree")}
              </Button>
            </Link>
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
              <Link
                to="/"
                hash="philosophy"
                onClick={() => setMobileMenuOpen(false)}
                className="hover:text-pelecanon-teal py-1"
              >
                {t("landing.nav.philosophy")}
              </Link>
              <Link
                to="/"
                hash="solutions"
                onClick={() => setMobileMenuOpen(false)}
                className="hover:text-pelecanon-teal py-1"
              >
                {t("landing.nav.solutions")}
              </Link>
              <Link
                to="/"
                hash="process"
                onClick={() => setMobileMenuOpen(false)}
                className="hover:text-pelecanon-teal py-1"
              >
                {t("landing.nav.process")}
              </Link>
              <Link
                to="/"
                hash="craftsmanship"
                onClick={() => setMobileMenuOpen(false)}
                className="hover:text-pelecanon-teal py-1"
              >
                {t("landing.nav.craftsmanship")}
              </Link>
              <Link
                to="/compare"
                onClick={() => setMobileMenuOpen(false)}
                className="text-pelecanon-teal font-semibold py-1"
              >
                {t("landing.nav.compare")}
              </Link>
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
              <Link to="/auth" search={{ tab: "register" }} onClick={() => setMobileMenuOpen(false)}>
                <Button className="w-full bg-pelecanon-teal text-white hover:bg-pelecanon-teal-hover font-semibold rounded-sm justify-center text-xs tracking-wider uppercase">
                  {t("compare.hero.startFree")}
                </Button>
              </Link>
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
      <section className="relative py-20 sm:py-28 md:py-32 overflow-hidden bg-pelecanon-charcoal-dark text-pelecanon-offwhite">
        <div className="absolute inset-0 bg-gradient-to-t from-pelecanon-charcoal-dark via-pelecanon-charcoal-dark/80 to-pelecanon-charcoal-deep" />
        <div
          className="absolute inset-0 pointer-events-none opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 50% 30%, rgba(17,139,118,0.28) 0%, transparent 70%)",
          }}
        />

        <div className="container mx-auto relative z-10 px-4 text-center">
          {/* Eyebrow Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-pelecanon-teal/40 bg-pelecanon-charcoal-deep/70 backdrop-blur-md px-4 py-1.5 text-xs text-pelecanon-teal uppercase tracking-widest mb-6 shadow-lg">
            <Sparkles className="h-3.5 w-3.5 text-pelecanon-teal" />
            <span>{t("compare.hero.eyebrow")}</span>
          </div>

          {/* Main Headline */}
          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-normal tracking-tight max-w-4xl mx-auto leading-tight sm:leading-tight">
            {t("compare.hero.title")}
          </h1>

          {/* Subtitle */}
          <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed font-light mt-6">
            {t("compare.hero.subtitle")}
          </p>

          {/* Action CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/auth" search={{ tab: "register" }} className="w-full sm:w-auto">
              <Button className="w-full sm:w-auto bg-pelecanon-teal text-white hover:bg-pelecanon-teal-hover font-medium tracking-wide uppercase px-8 py-6 rounded-sm border border-pelecanon-teal shadow-xl shadow-pelecanon-teal/20 gap-3 text-sm transition-all cursor-pointer">
                <span>{t("compare.hero.startFree")}</span>
                {isRtl ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              </Button>
            </Link>
            <Link to="/track" className="w-full sm:w-auto">
              <Button
                variant="outline"
                className="w-full sm:w-auto border-pelecanon-teal/60 text-pelecanon-offwhite hover:bg-pelecanon-teal/15 hover:border-pelecanon-teal font-medium tracking-wide uppercase px-8 py-6 rounded-sm gap-3 text-sm backdrop-blur-sm transition-all cursor-pointer"
              >
                <Eye className="w-4 h-4 text-pelecanon-teal" />
                <span>{t("compare.hero.trackDemo")}</span>
              </Button>
            </Link>
            <a href="#matrix" className="w-full sm:w-auto">
              <Button
                variant="ghost"
                className="w-full sm:w-auto text-muted-foreground hover:text-pelecanon-teal text-xs tracking-wider uppercase gap-2 px-4 py-6"
              >
                <span>{t("compare.hero.viewMatrix")}</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </a>
          </div>

          {/* Workshop Trust Highlights */}
          <div className="max-w-3xl mx-auto mt-12 pt-8 border-t border-pelecanon-teal/20 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            <div className="space-y-1">
              <div className="font-serif text-xl sm:text-2xl font-bold text-pelecanon-teal">2 Min</div>
              <div className="text-xs text-muted-foreground">{t("compare.hero.trustPill1")}</div>
            </div>
            <div className="space-y-1">
              <div className="font-serif text-xl sm:text-2xl font-bold text-pelecanon-teal">100% Arabic</div>
              <div className="text-xs text-muted-foreground">{t("compare.hero.trustPill2")}</div>
            </div>
            <div className="space-y-1">
              <div className="font-serif text-xl sm:text-2xl font-bold text-pelecanon-teal">CAD & CSV</div>
              <div className="text-xs text-muted-foreground">{t("compare.hero.trustPill3")}</div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. 10-POINT WORKSHOP COMPARISON MATRIX */}
      <section id="matrix" className="py-20 sm:py-28 px-4 bg-background text-foreground scroll-mt-20">
        <div className="container mx-auto max-w-6xl">
          {/* Header */}
          <div className="text-center space-y-3 mb-14">
            <div className="inline-block text-xs font-semibold uppercase tracking-widest text-primary">
              {t("compare.badge")}
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold">
              {t("compare.matrix.title")}
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
              {t("compare.matrix.subtitle")}
            </p>
          </div>

          {/* Matrix Table */}
          <div className="overflow-x-auto rounded-xl border border-border shadow-xs bg-card">
            <table className="w-full text-left rtl:text-right border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider">
                  <th className="p-4 sm:p-5 w-1/4 font-semibold text-foreground">
                    {t("compare.matrix.colCapability")}
                  </th>
                  <th className="p-4 sm:p-5 w-1/3 bg-primary/10 border-x-2 border-t-2 border-primary/50 text-primary font-bold relative">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-sm">
                        <Zap className="w-4 h-4 text-primary fill-primary/20" />
                        {t("compare.matrix.colPelecanon")}
                      </span>
                      <Badge className="bg-primary text-primary-foreground text-[10px] uppercase font-semibold">
                        {t("compare.matrix.colPelecanonBadge")}
                      </Badge>
                    </div>
                  </th>
                  <th className="p-4 sm:p-5 w-1/5 font-medium text-muted-foreground">
                    <span className="flex items-center gap-1.5 text-xs">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-amber-500" />
                      {t("compare.matrix.colSpreadsheets")}
                    </span>
                  </th>
                  <th className="p-4 sm:p-5 w-1/5 font-medium text-muted-foreground">
                    <span className="flex items-center gap-1.5 text-xs">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                      {t("compare.matrix.colGenericErp")}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs sm:text-sm">
                {matrixRows.map((row, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-muted/20 transition-colors"
                  >
                    {/* Capability Title */}
                    <td className="p-4 sm:p-5 font-semibold text-foreground align-top">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-muted-foreground font-normal">
                          {idx + 1}.
                        </span>
                        <span>{row.title}</span>
                      </div>
                    </td>

                    {/* PeleCanon Column */}
                    <td className="p-4 sm:p-5 bg-primary/5 border-x-2 border-primary/40 align-top">
                      <div className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span className="text-foreground leading-relaxed font-medium">
                          {row.pelecanon}
                        </span>
                      </div>
                    </td>

                    {/* Spreadsheets Column */}
                    <td className="p-4 sm:p-5 text-muted-foreground align-top bg-background/50">
                      <div className="flex items-start gap-2">
                        <Minus className="w-4 h-4 text-amber-500/80 shrink-0 mt-0.5" />
                        <span className="leading-relaxed text-xs">
                          {row.spreadsheets}
                        </span>
                      </div>
                    </td>

                    {/* Generic ERP Column */}
                    <td className="p-4 sm:p-5 text-muted-foreground align-top bg-background/50">
                      <div className="flex items-start gap-2">
                        <X className="w-4 h-4 text-destructive/70 shrink-0 mt-0.5" />
                        <span className="leading-relaxed text-xs">
                          {row.genericErp}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 5. WORKFLOW HANDOFF CALLOUT ("Works With Your CAD Tools") */}
      <section className="py-16 sm:py-24 bg-pelecanon-charcoal-deep text-pelecanon-offwhite border-y border-pelecanon-teal/20">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center space-y-3 mb-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-pelecanon-teal/40 bg-pelecanon-charcoal-dark px-3 py-1 text-xs text-pelecanon-teal uppercase tracking-widest">
              <Compass className="w-3.5 h-3.5 text-pelecanon-teal" />
              <span>{t("compare.workflow.eyebrow")}</span>
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold">
              {t("compare.workflow.title")}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Step 1 */}
            <div className="p-6 rounded-lg border border-pelecanon-teal/25 bg-pelecanon-charcoal-dark/70 space-y-3 relative">
              <div className="w-10 h-10 rounded-md bg-pelecanon-teal/15 border border-pelecanon-teal/40 flex items-center justify-center text-pelecanon-teal font-serif font-bold text-lg">
                1
              </div>
              <h3 className="font-semibold text-base text-pelecanon-offwhite">
                {t("compare.workflow.step1Title")}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed font-light">
                {t("compare.workflow.step1Desc")}
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-6 rounded-lg border border-pelecanon-teal/25 bg-pelecanon-charcoal-dark/70 space-y-3 relative">
              <div className="w-10 h-10 rounded-md bg-pelecanon-teal/15 border border-pelecanon-teal/40 flex items-center justify-center text-pelecanon-teal font-serif font-bold text-lg">
                2
              </div>
              <h3 className="font-semibold text-base text-pelecanon-offwhite">
                {t("compare.workflow.step2Title")}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed font-light">
                {t("compare.workflow.step2Desc")}
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-6 rounded-lg border border-pelecanon-teal/50 bg-pelecanon-charcoal-dark/90 space-y-3 relative ring-1 ring-pelecanon-teal/30">
              <div className="w-10 h-10 rounded-md bg-pelecanon-teal text-white flex items-center justify-center font-serif font-bold text-lg shadow-md shadow-pelecanon-teal/20">
                3
              </div>
              <h3 className="font-semibold text-base text-pelecanon-teal">
                {t("compare.workflow.step3Title")}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed font-light">
                {t("compare.workflow.step3Desc")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. TRANSPARENT WORKSHOP PLANS (TENANT_PLANS) */}
      <section className="py-20 sm:py-28 px-4 bg-background text-foreground">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center space-y-3 mb-14">
            <div className="inline-block text-xs font-semibold uppercase tracking-widest text-primary">
              {t("compare.plans.eyebrow")}
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold">
              {t("compare.plans.title")}
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
              {t("compare.plans.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            {/* 1. STARTER PLAN */}
            <div className="p-7 rounded-xl border border-border bg-card flex flex-col justify-between shadow-xs">
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-serif text-xl font-bold text-foreground">
                    {t("compare.plans.starterTitle")}
                  </h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="font-serif text-3xl font-extrabold text-foreground">
                      {t("compare.plans.starterPrice")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("compare.plans.starterPeriod")}
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t border-border space-y-2.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>{t("compare.plans.starterFeature1")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>{t("compare.plans.starterFeature2")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>{t("compare.plans.starterFeature3")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>{t("compare.plans.starterFeature4")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>{t("compare.plans.starterFeature5")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>{t("compare.plans.starterFeature6")}</span>
                  </div>
                </div>
              </div>

              <div className="pt-8">
                <Link to="/auth" search={{ tab: "register" }} className="block">
                  <Button
                    variant="outline"
                    className="w-full border-primary/60 text-primary hover:bg-primary hover:text-primary-foreground font-semibold uppercase text-xs tracking-wider h-11"
                  >
                    {t("compare.plans.starterCta")}
                  </Button>
                </Link>
              </div>
            </div>

            {/* 2. PRO PLAN (Featured) */}
            <div className="p-7 rounded-xl border-2 border-primary bg-primary/5 flex flex-col justify-between shadow-xl relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground text-xs uppercase px-3 py-0.5 font-bold shadow-sm">
                  {t("compare.plans.proBadge")}
                </Badge>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-serif text-xl font-bold text-foreground">
                    {t("compare.plans.proTitle")}
                  </h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="font-serif text-3xl font-extrabold text-primary">
                      {t("compare.plans.proPrice")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("compare.plans.proPeriod")}
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t border-primary/20 space-y-2.5 text-xs text-foreground/90">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-medium">{t("compare.plans.proFeature1")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-medium">{t("compare.plans.proFeature2")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                    <span>{t("compare.plans.proFeature3")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                    <span>{t("compare.plans.proFeature4")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                    <span>{t("compare.plans.proFeature5")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                    <span>{t("compare.plans.proFeature6")}</span>
                  </div>
                </div>
              </div>

              <div className="pt-8">
                <Link to="/auth" search={{ tab: "register" }} className="block">
                  <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold uppercase text-xs tracking-wider h-11 shadow-md">
                    {t("compare.plans.proCta")}
                  </Button>
                </Link>
              </div>
            </div>

            {/* 3. ENTERPRISE PLAN */}
            <div className="p-7 rounded-xl border border-border bg-card flex flex-col justify-between shadow-xs">
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-serif text-xl font-bold text-foreground">
                    {t("compare.plans.enterpriseTitle")}
                  </h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="font-serif text-3xl font-extrabold text-foreground">
                      {t("compare.plans.enterprisePrice")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("compare.plans.enterprisePeriod")}
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t border-border space-y-2.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>{t("compare.plans.enterpriseFeature1")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>{t("compare.plans.enterpriseFeature2")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>{t("compare.plans.enterpriseFeature3")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>{t("compare.plans.enterpriseFeature4")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>{t("compare.plans.enterpriseFeature5")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>{t("compare.plans.enterpriseFeature6")}</span>
                  </div>
                </div>
              </div>

              <div className="pt-8">
                <Link to="/auth" search={{ tab: "register" }} className="block">
                  <Button
                    variant="outline"
                    className="w-full border-border hover:bg-muted font-semibold uppercase text-xs tracking-wider h-11"
                  >
                    {t("compare.plans.enterpriseCta")}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. BOTTOM CTA BANNER */}
      <section className="py-16 sm:py-20 bg-pelecanon-charcoal-dark text-pelecanon-offwhite border-t border-pelecanon-teal/20 text-center">
        <div className="container mx-auto px-4 max-w-3xl space-y-6">
          <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold">
            {t("compare.cta.title")}
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed font-light">
            {t("compare.cta.subtitle")}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link to="/auth" search={{ tab: "register" }} className="w-full sm:w-auto">
              <Button className="w-full sm:w-auto bg-pelecanon-teal text-white hover:bg-pelecanon-teal-hover font-semibold uppercase px-8 py-6 rounded-sm text-xs tracking-wider">
                {t("compare.cta.buttonRegister")}
              </Button>
            </Link>
            <Link to="/track" className="w-full sm:w-auto">
              <Button
                variant="outline"
                className="w-full sm:w-auto border-pelecanon-teal/60 text-pelecanon-offwhite hover:bg-pelecanon-teal/15 font-semibold uppercase px-8 py-6 rounded-sm text-xs tracking-wider"
              >
                {t("compare.cta.buttonDemo")}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* 8. ATELIER PRESTIGE FOOTER */}
      <footer className="bg-pelecanon-charcoal-deep text-pelecanon-offwhite border-t border-pelecanon-teal/20 py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            {/* Brand Column */}
            <div className="space-y-4 md:col-span-1">
              <Link to="/">
                <img
                  src="/images/brand-logo-dark.png"
                  alt="PeleCanon"
                  className="h-9 w-auto object-contain hover:opacity-90 transition-opacity"
                />
              </Link>
              <p className="text-xs text-muted-foreground leading-relaxed font-light">
                {t("landing.hero.description")}
              </p>
            </div>

            {/* Links: Experience */}
            <div className="space-y-3">
              <h4 className="font-serif text-sm font-semibold uppercase tracking-wider text-pelecanon-offwhite border-b border-pelecanon-teal/20 pb-2">
                {t("landing.footer.experienceTitle")}
              </h4>
              <ul className="space-y-2 text-muted-foreground/80 text-xs">
                <li>
                  <Link to="/" hash="philosophy" className="hover:text-pelecanon-teal transition-colors">
                    {t("landing.nav.philosophy")}
                  </Link>
                </li>
                <li>
                  <Link to="/" hash="solutions" className="hover:text-pelecanon-teal transition-colors">
                    {t("landing.nav.solutions")}
                  </Link>
                </li>
                <li>
                  <Link to="/" hash="process" className="hover:text-pelecanon-teal transition-colors">
                    {t("landing.nav.process")}
                  </Link>
                </li>
                <li>
                  <Link to="/" hash="craftsmanship" className="hover:text-pelecanon-teal transition-colors">
                    {t("landing.nav.craftsmanship")}
                  </Link>
                </li>
                <li>
                  <Link to="/compare" className="text-pelecanon-teal font-medium">
                    {t("landing.nav.compare")}
                  </Link>
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
                  <Link to="/auth" search={{ tab: "register" }} className="hover:text-pelecanon-teal transition-colors">
                    {t("compare.hero.startFree")}
                  </Link>
                </li>
              </ul>
            </div>

            {/* Links: Staff Portal */}
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
    </div>
  );
}
