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

const uk: PricingCopy = {
  nav: "Ціни",
  title: "Одна підписка, прозорі транзитні витрати, модульне розширення",
  sub: "Виберіть план за розміром команди та кількістю каналів, а потім увімкніть потрібні модулі. Плата каналів, моделей і платіжних провайдерів показується окремо.",
  perMonth: "/ місяць",
  users: "користувачів",
  channels: "каналів",
  unlimited: "індивідуально",
  custom: "За запитом",
  most: "Найпопулярніше",
  cta: "Запросити доступ",
  ctaEnterprise: "Звʼязатися з відділом продажів",
  plans: {
    starter: { name: "Starter", fit: "Власник-оператор", features: ["Спільна вхідна скринька", "Контакти та справи", "Базова автоматизація", "AI-резюме (квота)"] },
    growth: { name: "Growth", fit: "Невеликі команди", features: ["Процеси та SLA", "Віджет вебчату", "AI-чернетки відповідей", "Аналітика та звіти"] },
    pro: { name: "Pro", fit: "Кілька брендів / продавці", features: ["Хаб продавця та контекст замовлень", "Ролі, погодження, аудит", "Платіжні посилання", "Пріоритетні черги"] },
    scale: { name: "Scale", fit: "Регіональні групи", features: ["Групи орендарів", "SSO та розширений аудит", "API, вебхуки, спільні квоти", "Пріоритетна підтримка"] },
    enterprise: { name: "Enterprise", fit: "Великі обсяги / вбудовано", features: ["Вбудоване та white-label використання", "Індивідуальні договори та DPA", "Виділена потужність", "Персональний менеджер"] },
  },
  addonsTitle: "Модулі та транзитні витрати",
  addonsSub: "Платіть лише за те, що увімкнули. Використання вимірюється квотами, попередженнями та жорсткими лімітами.",
  addons: {
    webchat: { name: "Вебчат і віджет", desc: "Чат на сайті з автовідповідями, передачею та аналітикою." },
    commerce: { name: "Комерція та хаб продавця", desc: "Контекст каталогу, звʼязок із замовленнями, черги продавців." },
    ai: { name: "AI-пакет", desc: "Додаткові AI-дії, пошук знань та оцінювання." },
    payments: { name: "Платіжні дії", desc: "Хостовані платіжні посилання, звірка та звʼязок зі справою." },
    email: { name: "Бізнес-пошта", desc: "Робочі скриньки у керованих чергах." },
    voice: { name: "Голос і зворотні дзвінки", desc: "Журнали дзвінків, завдання на дзвінок та нотатки." },
    partner: { name: "Партнер / white-label", desc: "Власний домен, бренд, консоль орендарів і частка доходу." },
    embedded: { name: "Вбудований модуль", desc: "Постачається як платний модуль у наявних продуктах." },
    onboarding: { name: "Впровадження та міграція", desc: "Перенесення даних, побудова процесів і навчання." },
    residency: { name: "Резидентність і комплаєнс", desc: "Регіональна резидентність, довше зберігання, доказові пакети." },
  },
  fromLabel: "від",
  onRequest: "За запитом",
  rulesTitle: "Комерційні правила",
  rules: [
    "Підписка окремо від плати каналів, моделей, маркетплейсів і платіжних провайдерів.",
    "Дороге використання вимірюється квотами, попередженнями та жорсткими лімітами.",
    "Впровадження та міграція оплачуються окремо.",
    "Для B2B2C: мінімум платформи, плата за активного орендаря та контрактна підтримка.",
  ],
  note: "Наведені ціни без податків. Доступність каналів і платіжних провайдерів залежить від регіону.",
};

export const pricingContent: Record<PromoLang, PricingCopy> = { de, en, tr, ar, uk };
