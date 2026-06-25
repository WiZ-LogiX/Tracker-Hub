-- Seed ALL missing notification templates with tenant_id.
-- The original migration used company_id which was dropped, losing all rows.
-- Only quote_created was re-seeded. This migration adds the rest.
-- Uses INSERT ... SELECT FROM tenants to resolve tenant_id for each slug.

-- ──────────────────────────────────────────────────────────────
-- stage_changed (ar, en, fr)
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.notification_templates (tenant_id, event, channel, language, subject, body, active)
SELECT t.id, 'stage_changed', 'whatsapp', 'ar',
  'تحديث الإنتاج — {{reference}}',
  'مرحباً {{customer_name}}،

تم تحديث مرحلة إنتاج طلبكم {{reference}}:
📋 المرحلة الحالية: {{stage}}

تابعوا تقدم الإنتاج من خلال الرابط:
{{link}}

مع تحياتنا،
فريق بيل كانون',
  true
FROM public.tenants t
WHERE t.slug = 'pelecanon'
ON CONFLICT (tenant_id, event, channel, language) DO NOTHING;

INSERT INTO public.notification_templates (tenant_id, event, channel, language, subject, body, active)
SELECT t.id, 'stage_changed', 'whatsapp', 'en',
  'Production update — {{reference}}',
  'Hi {{customer_name}},

Your order {{reference}} has moved to a new stage:
📋 Current stage: {{stage}}

Track your order progress here:
{{link}}

Best regards,
PeleCanon Team',
  true
FROM public.tenants t
WHERE t.slug = 'pelecanon'
ON CONFLICT (tenant_id, event, channel, language) DO NOTHING;

INSERT INTO public.notification_templates (tenant_id, event, channel, language, subject, body, active)
SELECT t.id, 'stage_changed', 'whatsapp', 'fr',
  'Mise à jour production — {{reference}}',
  'Bonjour {{customer_name}},

Votre commande {{reference}} a avancé à une nouvelle étape :
📋 Étape actuelle : {{stage}}

Suivez l''avancement ici :
{{link}}

Cordialement,
Équipe PeleCanon',
  true
FROM public.tenants t
WHERE t.slug = 'pelecanon'
ON CONFLICT (tenant_id, event, channel, language) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- order_opened (ar, en, fr)
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.notification_templates (tenant_id, event, channel, language, subject, body, active)
SELECT t.id, 'order_opened', 'whatsapp', 'ar',
  'تأكيد الطلب — {{reference}}',
  'مرحباً {{customer_name}}،

تم تأكيد طلبكم رقم {{reference}} ودخوله مرحلة الإنتاج.
📱 تتبع الطلب: {{link}}

سيتم إبلاغكم بأي تحديثات قادمة.

مع تحياتنا،
فريق بيل كانون',
  true
FROM public.tenants t
WHERE t.slug = 'pelecanon'
ON CONFLICT (tenant_id, event, channel, language) DO NOTHING;

INSERT INTO public.notification_templates (tenant_id, event, channel, language, subject, body, active)
SELECT t.id, 'order_opened', 'whatsapp', 'en',
  'Order confirmed — {{reference}}',
  'Hello {{customer_name}},

Your order {{reference}} is confirmed and entering production.
📱 Track your order: {{link}}

We''ll keep you updated on progress.

Best regards,
PeleCanon Team',
  true
FROM public.tenants t
WHERE t.slug = 'pelecanon'
ON CONFLICT (tenant_id, event, channel, language) DO NOTHING;

INSERT INTO public.notification_templates (tenant_id, event, channel, language, subject, body, active)
SELECT t.id, 'order_opened', 'whatsapp', 'fr',
  'Commande confirmée — {{reference}}',
  'Bonjour {{customer_name}},

Votre commande {{reference}} est confirmée et entre en production.
📱 Suivez votre commande : {{link}}

Nous vous tiendrons informé de l''avancement.

Cordialement,
Équipe PeleCanon',
  true
FROM public.tenants t
WHERE t.slug = 'pelecanon'
ON CONFLICT (tenant_id, event, channel, language) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- quote_sent (ar, en, fr)
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.notification_templates (tenant_id, event, channel, language, subject, body, active)
SELECT t.id, 'quote_sent', 'whatsapp', 'ar',
  'عرض سعر جاهز — {{reference}}',
  'مرحباً {{customer_name}}،

عرض سعركم {{reference}} جاهز للمراجعة:
💰 الإجمالي: {{total}} ج.م

اطلعوا على التفاصيل هنا:
{{link}}

في انتظار ردكم.

مع تحياتنا،
فريق بيل كانون',
  true
FROM public.tenants t
WHERE t.slug = 'pelecanon'
ON CONFLICT (tenant_id, event, channel, language) DO NOTHING;

INSERT INTO public.notification_templates (tenant_id, event, channel, language, subject, body, active)
SELECT t.id, 'quote_sent', 'whatsapp', 'en',
  'Your quote is ready — {{reference}}',
  'Hi {{customer_name}},

Your quote {{reference}} is ready for review:
💰 Total: EGP {{total}}

View the details here:
{{link}}

We look forward to hearing from you.

Best regards,
PeleCanon Team',
  true
FROM public.tenants t
WHERE t.slug = 'pelecanon'
ON CONFLICT (tenant_id, event, channel, language) DO NOTHING;

INSERT INTO public.notification_templates (tenant_id, event, channel, language, subject, body, active)
SELECT t.id, 'quote_sent', 'whatsapp', 'fr',
  'Votre devis est prêt — {{reference}}',
  'Bonjour {{customer_name}},

Votre devis {{reference}} est prêt pour consultation :
💰 Total : {{total}} EGP

Consultez les détails ici :
{{link}}

Dans l''attente de votre retour.

Cordialement,
Équipe PeleCanon',
  true
FROM public.tenants t
WHERE t.slug = 'pelecanon'
ON CONFLICT (tenant_id, event, channel, language) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- delivery_scheduled (ar, en, fr)
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.notification_templates (tenant_id, event, channel, language, subject, body, active)
SELECT t.id, 'delivery_scheduled', 'whatsapp', 'ar',
  'جاهز للاستلام — {{reference}}',
  'مرحباً {{customer_name}}،

طلبكم {{reference}} جاهز للاستلام!
📅 موعد التسليم: {{date}}

تابعوا التفاصيل هنا:
{{link}}

مع تحياتنا،
فريق بيل كانون',
  true
FROM public.tenants t
WHERE t.slug = 'pelecanon'
ON CONFLICT (tenant_id, event, channel, language) DO NOTHING;

INSERT INTO public.notification_templates (tenant_id, event, channel, language, subject, body, active)
SELECT t.id, 'delivery_scheduled', 'whatsapp', 'en',
  'Ready for pickup — {{reference}}',
  'Hi {{customer_name}},

Great news! Your order {{reference}} is ready for pickup.
📅 Delivery date: {{date}}

Track details here:
{{link}}

Best regards,
PeleCanon Team',
  true
FROM public.tenants t
WHERE t.slug = 'pelecanon'
ON CONFLICT (tenant_id, event, channel, language) DO NOTHING;

INSERT INTO public.notification_templates (tenant_id, event, channel, language, subject, body, active)
SELECT t.id, 'delivery_scheduled', 'whatsapp', 'fr',
  'Prêt pour retrait — {{reference}}',
  'Bonjour {{customer_name}},

Bonne nouvelle ! Votre commande {{reference}} est prête pour retrait.
📅 Date de livraison : {{date}}

Détails ici :
{{link}}

Cordialement,
Équipe PeleCanon',
  true
FROM public.tenants t
WHERE t.slug = 'pelecanon'
ON CONFLICT (tenant_id, event, channel, language) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- delivered (ar, en, fr)
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.notification_templates (tenant_id, event, channel, language, subject, body, active)
SELECT t.id, 'delivered', 'whatsapp', 'ar',
  'تم التسليم — {{reference}}',
  'مرحباً {{customer_name}}،

تم التسليم بنجاح لطلبكم {{reference}} 🎉

شكراً لاختياركم بيل كانون. نتمنى لكم يوماً سعيداً.

مع تحياتنا،
فريق بيل كانون',
  true
FROM public.tenants t
WHERE t.slug = 'pelecanon'
ON CONFLICT (tenant_id, event, channel, language) DO NOTHING;

INSERT INTO public.notification_templates (tenant_id, event, channel, language, subject, body, active)
SELECT t.id, 'delivered', 'whatsapp', 'en',
  'Delivered — {{reference}}',
  'Hi {{customer_name}},

Your order {{reference}} has been delivered successfully! 🎉

Thank you for choosing PeleCanon. We hope you love your new furniture.

Best regards,
PeleCanon Team',
  true
FROM public.tenants t
WHERE t.slug = 'pelecanon'
ON CONFLICT (tenant_id, event, channel, language) DO NOTHING;

INSERT INTO public.notification_templates (tenant_id, event, channel, language, subject, body, active)
SELECT t.id, 'delivered', 'whatsapp', 'fr',
  'Livrée — {{reference}}',
  'Bonjour {{customer_name}},

Votre commande {{reference}} a été livrée avec succès ! 🎉

Merci d''avoir choisi PeleCanon. Nous espérons que vous apprécierez votre nouveau mobilier.

Cordialement,
Équipe PeleCanon',
  true
FROM public.tenants t
WHERE t.slug = 'pelecanon'
ON CONFLICT (tenant_id, event, channel, language) DO NOTHING;
