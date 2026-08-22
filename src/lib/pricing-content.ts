import type { PromoLang } from "./promo-content";
import type { AddonKey, PlanKey } from "./pricing-data";

export type PricingCopy = {
  nav: string;
  title: string;
  sub: string;
  perMonth: string;
  users: string;
  channels: string;
  unlimited: string;
  custom: string;
  most: string;
  cta: string;
  ctaEnterprise: string;
  plans: Record<PlanKey, { name: string; fit: string; features: string[] }>;
  addonsTitle: string;
  addonsSub: string;
  addons: Record<AddonKey, { name: string; desc: string }>;
  fromLabel: string;
  onRequest: string;
  rulesTitle: string;
  rules: string[];
  note: string;
};

const de: PricingCopy = {
  nav: "Preise",
  title: "Ein Abo, klare Durchleitung, modulare Erweiterung",
  sub: "Wählen Sie einen Plan nach Team- und Kanalgröße und erweitern Sie ihn mit Modulen. Kanal-, Modell- und Zahlungsgebühren Dritter werden transparent getrennt ausgewiesen.",
  perMonth: "/ Monat",
  users: "Nutzer",
  channels: "Kanäle",
  unlimited: "individuell",
  custom: "Auf Anfrage",
  most: "Beliebteste",
  cta: "Zugang anfordern",
  ctaEnterprise: "Vertrieb kontaktieren",
  plans: {
    starter: {
      name: "Starter",
      fit: "Inhabergeführt",
      features: ["Gemeinsamer Posteingang", "Kontakte & Fälle", "Basis-Automatisierung", "KI-Zusammenfassungen (Kontingent)"],
      },
    growth: {
      name: "Growth",
      fit: "Kleine Teams",
      features: ["Workflows & SLAs", "Web-Chat-Widget", "KI-Antwortentwürfe", "Analytics & Berichte"],
    },
    pro: {
      name: "Pro",
      fit: "Mehrere Marken & Verkäufer",
      features: ["Seller-Hub & Bestellkontext", "Rollen, Freigaben, Audit", "Zahlungs-Links (Anbieter)", "Priorisierte Warteschlangen"],
    },
    scale: {
      name: "Scale",
      fit: "Regionale Gruppen",
      features: ["Mandanten-Gruppen", "SSO & erweitertes Audit", "API, Webhooks, Kontingent-Pools", "Priority-Support"],
    },
    enterprise: {
      name: "Enterprise",
      fit: "Hohes Volumen & Einbettung",
      features: ["Eingebettete & White-Label-Nutzung", "Individuelle Verträge & AVV", "Dedizierte Kapazität", "Benannter Ansprechpartner"],
    },
  },
  addonsTitle: "Module & Durchleitung",
  addonsSub: "Nur bezahlen, was Sie einschalten. Nutzung wird mit Kontingenten, Warnungen und harten Obergrenzen gemessen.",
  addons: {
    webchat: { name: "Web-Chat & Widget", desc: "Website-Chat mit Auto-Antworten, Übergabe und Analytics." },
    commerce: { name: "Commerce & Seller-Hub", desc: "Katalog-Kontext, Bestellzuordnung und Verkäufer-Warteschlangen." },
    ai: { name: "KI-Paket", desc: "Zusätzliche KI-Aktionen, Wissensabruf und Auswertungen." },
    payments: { name: "Zahlungs-Aktionen", desc: "Gehostete Zahlungslinks, Abgleich und Fallverknüpfung." },
    email: { name: "Business-E-Mail", desc: "Geschäftspostfächer als Warteschlangen im selben System." },
    voice: { name: "Voice & Rückrufe", desc: "Anrufprotokolle, Rückrufaufgaben und Gesprächsnotizen." },
    partner: { name: "Partner / White-Label", desc: "Eigene Domain, Marke, Mandantenkonsole und Umsatzbeteiligung." },
    embedded: { name: "Eingebettetes Add-on", desc: "Als bezahltes Modul in bestehende Produkte integriert." },
    onboarding: { name: "Onboarding & Migration", desc: "Datenübernahme, Workflow-Aufbau und Schulung." },
    residency: { name: "Datenresidenz & Compliance", desc: "Regionale Residenz, erweiterte Aufbewahrung und Nachweise." },
  },
  fromLabel: "ab",
  onRequest: "Auf Anfrage",
  rulesTitle: "Kaufmännische Regeln",
  rules: [
    "Abo getrennt von Kanal-, Modell-, Marktplatz- und Zahlungsgebühren Dritter.",
    "Teure Nutzung mit Kontingenten, Warnungen und harten Obergrenzen gemessen.",
    "Onboarding und Migration werden separat berechnet.",
    "Für B2B2C: Plattform-Minimum, Gebühr je aktivem Mandanten und vertraglicher Support.",
  ],
  note: "Listenpreise, exkl. USt. Regionale Verfügbarkeit von Kanälen und Zahlungsanbietern kann abweichen.",
};

const en: PricingCopy = {
  nav: "Pricing",
  title: "One subscription, transparent pass-through, modular expansion",
  sub: "Pick a plan by team and channel size, then switch on the modules you need. Third-party channel, model and payment charges stay separate and visible.",
  perMonth: "/ month",
  users: "users",
  channels: "channels",
  unlimited: "custom",
  custom: "Custom",
  most: "Most popular",
  cta: "Request access",
  ctaEnterprise: "Talk to sales",
  plans: {
    starter: { name: "Starter", fit: "Owner-led", features: ["Shared inbox", "Contacts & cases", "Basic automation", "AI summaries (allowance)"] },
    growth: { name: "Growth", fit: "Small teams", features: ["Workflows & SLAs", "Web chat widget", "AI reply drafts", "Analytics & reports"] },
    pro: { name: "Pro", fit: "Multi-brand / seller", features: ["Seller hub & order context", "Roles, approvals, audit", "Payment links (provider-hosted)", "Prioritised queues"] },
    scale: { name: "Scale", fit: "Regional groups", features: ["Tenant groups", "SSO & extended audit", "API, webhooks, pooled allowances", "Priority support"] },
    enterprise: { name: "Enterprise", fit: "High-volume / embedded", features: ["Embedded & white-label use", "Custom contracts & DPA", "Dedicated capacity", "Named success contact"] },
  },
  addonsTitle: "Modules & pass-through",
  addonsSub: "Pay only for what you switch on. Usage is metered with allowances, alerts and hard customer-controlled caps.",
  addons: {
    webchat: { name: "Web chat & widget", desc: "Website chat with auto-responses, handover and analytics." },
    commerce: { name: "Commerce & seller hub", desc: "Catalogue context, order attribution and seller queues." },
    ai: { name: "AI pack", desc: "Extra AI actions, knowledge retrieval and evaluations." },
    payments: { name: "Payment actions", desc: "Hosted payment links, reconciliation and case linking." },
    email: { name: "Business email", desc: "Bring business mailboxes into governed queues." },
    voice: { name: "Voice & callbacks", desc: "Call logs, callback tasks and conversation notes." },
    partner: { name: "Partner / white-label", desc: "Own domain, brand, tenant console and revenue share." },
    embedded: { name: "Embedded add-on", desc: "Ships as a paid module inside existing products." },
    onboarding: { name: "Onboarding & migration", desc: "Data migration, workflow build-out and training." },
    residency: { name: "Residency & compliance", desc: "Regional residency, extended retention and evidence packs." },
  },
  fromLabel: "from",
  onRequest: "On request",
  rulesTitle: "Commercial rules",
  rules: [
    "Subscription separate from channel, model, marketplace and payment provider charges.",
    "Expensive usage metered with allowances, alerts and hard caps you control.",
    "Onboarding and migration charged separately when implementation is needed.",
    "For B2B2C: platform minimum, active-tenant charge and contracted support.",
  ],
  note: "List prices, excluding tax. Channel and payment provider availability varies by region.",
};

const tr: PricingCopy = {
  nav: "Fiyatlar",
  title: "Tek abonelik, şeffaf aktarım, modüler genişleme",
  sub: "Ekip ve kanal büyüklüğüne göre bir plan seçin, ardından ihtiyacınız olan modülleri açın. Üçüncü taraf kanal, model ve ödeme ücretleri ayrı gösterilir.",
  perMonth: "/ ay",
  users: "kullanıcı",
  channels: "kanal",
  unlimited: "özel",
  custom: "Talebe göre",
  most: "En popüler",
  cta: "Erişim talep et",
  ctaEnterprise: "Satışla görüşün",
  plans: {
    starter: { name: "Starter", fit: "Tek kişilik işletme", features: ["Ortak gelen kutusu", "Kişiler ve vakalar", "Temel otomasyon", "AI özetleri (kota)"] },
    growth: { name: "Growth", fit: "Küçük ekipler", features: ["İş akışları ve SLA", "Web sohbet aracı", "AI yanıt önerileri", "Analitik ve raporlar"] },
    pro: { name: "Pro", fit: "Çok markalı / satıcı", features: ["Satıcı merkezi ve sipariş bağlamı", "Roller, onaylar, denetim", "Ödeme bağlantıları", "Öncelikli kuyruklar"] },
    scale: { name: "Scale", fit: "Bölgesel gruplar", features: ["Kiracı grupları", "SSO ve geniş denetim", "API, webhook, havuzlanmış kota", "Öncelikli destek"] },
    enterprise: { name: "Enterprise", fit: "Yüksek hacim / gömülü", features: ["Gömülü ve beyaz etiket kullanım", "Özel sözleşme ve DPA", "Ayrılmış kapasite", "Adlandırılmış temsilci"] },
  },
  addonsTitle: "Modüller ve aktarım",
  addonsSub: "Yalnızca açtığınız kadar ödersiniz. Kullanım kota, uyarı ve sizin belirlediğiniz sabit üst sınırlarla ölçülür.",
  addons: {
    webchat: { name: "Web sohbet ve widget", desc: "Otomatik yanıt, devretme ve analitik ile site sohbeti." },
    commerce: { name: "Ticaret ve satıcı merkezi", desc: "Katalog bağlamı, sipariş ilişkilendirme ve satıcı kuyrukları." },
    ai: { name: "AI paketi", desc: "Ek AI işlemleri, bilgi erişimi ve değerlendirmeler." },
    payments: { name: "Ödeme işlemleri", desc: "Barındırılan ödeme bağlantıları, mutabakat ve vaka bağlantısı." },
    email: { name: "Kurumsal e-posta", desc: "Kurumsal posta kutularını yönetilen kuyruklara taşıyın." },
    voice: { name: "Sesli görüşme ve geri arama", desc: "Çağrı kayıtları, geri arama görevleri ve notlar." },
    partner: { name: "Partner / beyaz etiket", desc: "Kendi alan adı, marka, kiracı konsolu ve gelir paylaşımı." },
    embedded: { name: "Gömülü eklenti", desc: "Mevcut ürünlerin içinde ücretli modül olarak sunulur." },
    onboarding: { name: "Kurulum ve göç", desc: "Veri taşıma, iş akışı kurulumu ve eğitim." },
    residency: { name: "Veri yerleşimi ve uyum", desc: "Bölgesel yerleşim, uzatılmış saklama ve kanıt paketleri." },
  },
  fromLabel: "başlangıç",
  onRequest: "Talebe göre",
  rulesTitle: "Ticari kurallar",
  rules: [
    "Abonelik; kanal, model, pazar yeri ve ödeme sağlayıcı ücretlerinden ayrıdır.",
    "Maliyetli kullanım kota, uyarı ve sabit üst sınırlarla ölçülür.",
    "Kurulum ve göç, uygulama gerektiğinde ayrı ücretlendirilir.",
    "B2B2C için: platform tabanı, aktif kiracı ücreti ve sözleşmeli destek.",
  ],
  note: "Liste fiyatları, vergiler hariç. Kanal ve ödeme sağlayıcı kullanılabilirliği bölgeye göre değişir.",
};

const ar: PricingCopy = {
  nav: "الأسعار",
  title: "اشتراك واحد، تمرير شفاف للتكاليف، توسّع معياري",
  sub: "اختر خطة بحسب حجم الفريق والقنوات، ثم شغّل الوحدات التي تحتاجها. تظل رسوم القنوات والنماذج ومزوّدي الدفع منفصلة وواضحة.",
  perMonth: "/ شهرياً",
  users: "مستخدمين",
  channels: "قنوات",
  unlimited: "مخصص",
  custom: "حسب الطلب",
  most: "الأكثر اختياراً",
  cta: "اطلب الوصول",
  ctaEnterprise: "تحدّث مع المبيعات",
  plans: {
    starter: { name: "Starter", fit: "أعمال فردية", features: ["صندوق وارد مشترك", "جهات الاتصال والحالات", "أتمتة أساسية", "ملخصات ذكاء اصطناعي (حصة)"] },
    growth: { name: "Growth", fit: "فرق صغيرة", features: ["مسارات عمل واتفاقيات خدمة", "أداة محادثة للموقع", "مسودات ردود بالذكاء الاصطناعي", "تحليلات وتقارير"] },
    pro: { name: "Pro", fit: "علامات متعددة / بائعون", features: ["مركز البائع وسياق الطلب", "الأدوار والموافقات والتدقيق", "روابط دفع مُستضافة", "طوابير ذات أولوية"] },
    scale: { name: "Scale", fit: "مجموعات إقليمية", features: ["مجموعات مستأجرين", "دخول موحّد وتدقيق موسّع", "واجهات API وحصص مشتركة", "دعم بأولوية"] },
    enterprise: { name: "Enterprise", fit: "حجم كبير / مدمج", features: ["استخدام مدمج وبعلامة بيضاء", "عقود واتفاقية معالجة مخصصة", "سعة مخصصة", "مسؤول حساب معيّن"] },
  },
  addonsTitle: "الوحدات والتكاليف الممرّرة",
  addonsSub: "تدفع فقط مقابل ما تشغّله. يُقاس الاستخدام بحصص وتنبيهات وحدود قصوى تتحكم بها.",
  addons: {
    webchat: { name: "محادثة الموقع", desc: "محادثة على موقعك مع ردود تلقائية وتحويل وتحليلات." },
    commerce: { name: "التجارة ومركز البائع", desc: "سياق الكتالوج وربط الطلبات وطوابير البائعين." },
    ai: { name: "حزمة الذكاء الاصطناعي", desc: "عمليات إضافية واسترجاع معرفة وتقييمات." },
    payments: { name: "إجراءات الدفع", desc: "روابط دفع مُستضافة وتسوية وربط بالحالة." },
    email: { name: "البريد المؤسسي", desc: "إدارة صناديق البريد المؤسسية داخل النظام." },
    voice: { name: "المكالمات وإعادة الاتصال", desc: "سجلات المكالمات ومهام إعادة الاتصال والملاحظات." },
    partner: { name: "شريك / علامة بيضاء", desc: "نطاق وعلامة خاصة ولوحة مستأجرين ومشاركة إيرادات." },
    embedded: { name: "إضافة مدمجة", desc: "تُقدَّم كوحدة مدفوعة داخل منتجات قائمة." },
    onboarding: { name: "التهيئة والترحيل", desc: "ترحيل البيانات وبناء المسارات والتدريب." },
    residency: { name: "موقع البيانات والامتثال", desc: "موقع إقليمي واحتفاظ ممتد وحِزم أدلة." },
  },
  fromLabel: "من",
  onRequest: "حسب الطلب",
  rulesTitle: "قواعد تجارية",
  rules: [
    "الاشتراك منفصل عن رسوم القنوات والنماذج والأسواق ومزوّدي الدفع.",
    "الاستخدام المكلف يُقاس بحصص وتنبيهات وحدود قصوى تتحكم بها.",
    "التهيئة والترحيل تُحتسب بشكل منفصل عند الحاجة للتنفيذ.",
    "لنماذج B2B2C: حد أدنى للمنصة ورسوم لكل مستأجر نشط ودعم تعاقدي.",
  ],
  note: "أسعار قائمة بدون ضرائب. يختلف توفّر القنوات ومزوّدي الدفع حسب المنطقة.",
};

const fr: PricingCopy = {
  nav: "Tarifs",
  title: "Un abonnement, des coûts répercutés clairs, des modules à la carte",
  sub: "Choisissez un plan selon la taille de votre équipe et le nombre de canaux, puis activez les modules utiles. Les frais des canaux, des modèles et des prestataires de paiement sont affichés séparément.",
  perMonth: "/ mois",
  users: "utilisateurs",
  channels: "canaux",
  unlimited: "sur mesure",
  custom: "Sur demande",
  most: "Le plus choisi",
  cta: "Demander un accès",
  ctaEnterprise: "Contacter le service commercial",
  plans: {
    starter: { name: "Starter", fit: "Indépendants", features: ["Boîte partagée", "Contacts et dossiers", "Automatisations de base", "Résumés IA (quota)"] },
    growth: { name: "Growth", fit: "Petites équipes", features: ["Processus et SLA", "Widget de chat web", "Brouillons de réponse IA", "Analyses et rapports"] },
    pro: { name: "Pro", fit: "Multi-marques / vendeurs", features: ["Hub vendeur et contexte commandes", "Rôles, validations, audit", "Liens de paiement", "Files prioritaires"] },
    scale: { name: "Scale", fit: "Groupes régionaux", features: ["Groupes de locataires", "SSO et audit avancé", "API, webhooks, quotas partagés", "Support prioritaire"] },
    enterprise: { name: "Enterprise", fit: "Gros volumes / intégré", features: ["Usage intégré et marque blanche", "Contrats et DPA sur mesure", "Capacité dédiée", "Interlocuteur dédié"] },
  },
  addonsTitle: "Modules et coûts répercutés",
  addonsSub: "Vous ne payez que ce que vous activez. L'usage est encadré par des quotas, des alertes et des plafonds stricts.",
  addons: {
    webchat: { name: "Chat web et widget", desc: "Chat sur votre site avec réponses automatiques, transfert et analyses." },
    commerce: { name: "Commerce et hub vendeur", desc: "Contexte catalogue, liaison des commandes, files vendeurs." },
    ai: { name: "Pack IA", desc: "Actions IA supplémentaires, recherche documentaire et évaluation." },
    payments: { name: "Actions de paiement", desc: "Liens de paiement hébergés, rapprochement et lien au dossier." },
    email: { name: "E-mail professionnel", desc: "Boîtes métier dans des files gérées." },
    voice: { name: "Voix et rappels", desc: "Journaux d'appels, tâches de rappel et notes." },
    partner: { name: "Partenaire / marque blanche", desc: "Domaine propre, image de marque, console clients et partage des revenus." },
    embedded: { name: "Module intégré", desc: "Livré comme module payant dans des produits existants." },
    onboarding: { name: "Mise en place et migration", desc: "Reprise des données, création des processus et formation." },
    residency: { name: "Résidence et conformité", desc: "Résidence régionale, conservation prolongée, dossiers de preuve." },
  },
  fromLabel: "à partir de",
  onRequest: "Sur demande",
  rulesTitle: "Règles commerciales",
  rules: [
    "L'abonnement est distinct des frais de canaux, de modèles, de places de marché et de paiement.",
    "Les usages coûteux sont encadrés par des quotas, des alertes et des plafonds stricts.",
    "La mise en place et la migration sont facturées séparément.",
    "En B2B2C : minimum plateforme, tarif par locataire actif et support contractuel.",
  ],
  note: "Prix hors taxes. La disponibilité des canaux et des prestataires de paiement varie selon la région.",
};

export const pricingContent: Record<PromoLang, PricingCopy> = { de, en, tr, ar, fr };
