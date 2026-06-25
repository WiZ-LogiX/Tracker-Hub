-- Default notification template for quote_created event (WhatsApp)
-- Template variables: {{customer_name}}, {{reference}}, {{total}}, {{link}}

INSERT INTO public.notification_templates (tenant_id, event, channel, language, subject, body, active)
SELECT t.id, 'quote_created', 'whatsapp', 'ar',
  'عرض سعر جديد — {{reference}}',
  'مرحباً {{customer_name}}،

تم إنشاء عرض سعر جديد:

🔢 رقم العرض: {{reference}}
💰 الإجمالي: {{total}} ج.م

يمكنك الاطلاع على تفاصيل العرض من خلال الرابط التالي:
{{link}}

مع تحياتنا،
فريق بيل كانون',
  true
FROM public.tenants t
WHERE t.slug = 'pelecanon'
ON CONFLICT (tenant_id, event, channel, language) DO NOTHING;

INSERT INTO public.notification_templates (tenant_id, event, channel, language, subject, body, active)
SELECT t.id, 'quote_created', 'whatsapp', 'en',
  'New Quote — {{reference}}',
  'Hello {{customer_name}},

A new quote has been created for you:

🔢 Quote #: {{reference}}
💰 Total: EGP {{total}}

View the quote details here:
{{link}}

Best regards,
PeleCanon Team',
  true
FROM public.tenants t
WHERE t.slug = 'pelecanon'
ON CONFLICT (tenant_id, event, channel, language) DO NOTHING;

INSERT INTO public.notification_templates (tenant_id, event, channel, language, subject, body, active)
SELECT t.id, 'quote_created', 'whatsapp', 'fr',
  'Nouveau devis — {{reference}}',
  'Bonjour {{customer_name}},

Un nouveau devis a été créé pour vous :

🔢 N° devis : {{reference}}
💰 Total : {{total}} EGP

Consultez les détails du devis via le lien ci-dessous :
{{link}}

Cordialement,
Équipe PeleCanon',
  true
FROM public.tenants t
WHERE t.slug = 'pelecanon'
ON CONFLICT (tenant_id, event, channel, language) DO NOTHING;
