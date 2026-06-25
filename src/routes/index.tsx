import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles, Shield, Layers, ClipboardList } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-md gradient-emerald flex items-center justify-center text-gold font-serif font-bold">P</div>
            <div>
              <div className="font-serif text-2xl font-bold">PeleCanon</div>
              <div className="text-[10px] text-muted-foreground">{t("landing.subtitle")}</div>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <Link to="/track"><Button variant="ghost" size="sm">{t("landing.trackOrder")}</Button></Link>
            <Link to="/admin"><Button variant="ghost" size="sm">{t("landing.adminPanel")}</Button></Link>
            <LanguageSwitcher />
            <ThemeToggle />
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-emerald opacity-95" />
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(201,168,76,0.4) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(201,168,76,0.2) 0%, transparent 50%)'
        }} />
        <div className="container mx-auto relative px-4 py-24 md:py-32 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-black/20 px-4 py-1.5 text-xs text-gold mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            {t("landing.badge")}
          </div>
          <h1 className="font-serif text-4xl md:text-6xl font-bold text-background mb-6 leading-tight">
            {t("landing.headline1")}<br/>
            <span className="text-gold">{t("landing.headline2")}</span>
          </h1>
          <p className="text-lg text-background/80 max-w-2xl mx-auto mb-10">{t("landing.heroDesc")}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/admin">
              <Button size="lg" className="bg-gold text-gold-foreground hover:bg-gold/90 gap-2 px-8">
                {t("landing.adminPanel")} <ArrowLeft className="h-4 w-4 rtl-flip" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-20">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Layers, titleKey: 'landing.featureCatalog.title', descKey: 'landing.featureCatalog.desc' },
            { icon: Shield, titleKey: 'landing.featureQuality.title', descKey: 'landing.featureQuality.desc' },
            { icon: ClipboardList, titleKey: 'landing.featureTracking.title', descKey: 'landing.featureTracking.desc' },
          ].map((f, i) => (
            <div key={i} className="rounded-2xl border bg-card p-8 hover:border-secondary transition">
              <div className="h-12 w-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="font-serif text-xl font-bold mb-2">{t(f.titleKey)}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{t(f.descKey)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 pb-20">
        <div className="rounded-3xl gradient-emerald p-12 text-center">
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-background mb-4">
            {t("landing.ctaTitle")}
          </h2>
          <p className="text-background/80 mb-8 max-w-xl mx-auto">
            {t("landing.ctaDesc")}
          </p>
          <Link to="/admin">
            <Button size="lg" className="bg-gold text-gold-foreground hover:bg-gold/90 gap-2 px-8">
              {t("landing.adminPanel")} <ArrowLeft className="h-4 w-4 rtl-flip" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t bg-card">
        <div className="container mx-auto px-4 py-8 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} PeleCanon. {t("landing.copyright")}
        </div>
      </footer>
    </div>
  );
}