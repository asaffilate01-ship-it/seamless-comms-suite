import type { PromoLang } from "@/lib/promo-content";

export type CapabilityGroup = {
  key: string;
  title: string;
  intro: string;
  items: { name: string; text: string }[];
};

export type CapabilitiesCopy = {
  eyebrow: string;
  title: string;
  sub: string;
  note: string;
  nav: string;
  groups: CapabilityGroup[];
};

export const capabilitiesContent: Record<PromoLang, CapabilitiesCopy> = {
  de: {
    nav: "Fähigkeiten",
    eyebrow: "VOLLES LEISTUNGSSPEKTRUM",
    title: "Alles, was OmniQora abdeckt.",
    sub: "Von Business Intelligence und KI über Transformation und Governance bis zu Beschaffungsreife und Branchen-Add-ons.",
    note: "Verfügbarkeit, Umfang und Freigaben werden je Organisation vereinbart. Zertifizierungen, Prüfungen und regulatorische Entscheidungen bleiben Aufgabe der zuständigen Stellen.",
    groups: [
      {
        key: "intelligence",
        title: "Intelligence & Business360",
        intro: "Ein verlässliches Bild von Leistung, Finanzen und Prioritäten.",
        items: [
          { name: "Business360", text: "Verbundene Sicht auf Kunden, Leistung und Chancen." },
          { name: "Finanzplanung", text: "Planung, Szenarien und Kennzahlen für fundierte Entscheidungen." },
          { name: "Analytics & Dashboards", text: "Kennzahlen für Teams, Standorte und Leistungsbereiche." },
          { name: "Prioritäten & Signale", text: "Klare Hinweise, worauf sich das Team zuerst konzentrieren sollte." },
        ],
      },
      {
        key: "genai",
        title: "Generative KI",
        intro: "Praktische Unterstützung auf Basis freigegebener Unternehmensinhalte.",
        items: [
          { name: "Aida Assistent", text: "Vorschläge, Zusammenfassungen und Entwürfe für Ihr Team." },
          { name: "Fundiertes Wissen", text: "Antworten aus geprüften, freigegebenen Quellen." },
          { name: "Inhalte & Kampagnen", text: "Texte und Kundenkommunikation in mehreren Sprachen." },
          { name: "Mensch entscheidet", text: "Vorschläge werden vor dem Versand geprüft und freigegeben." },
        ],
      },
      {
        key: "agentic",
        title: "Agentische KI",
        intro: "Assistenz, die Aufgaben übernimmt – innerhalb klarer Grenzen.",
        items: [
          { name: "Aufgaben-Agenten", text: "Wiederkehrende Aufgaben mit definierten Berechtigungen." },
          { name: "Enterprise-AI-Steuerung", text: "Zentrale Kontrolle über Modelle, Richtlinien und Nutzung." },
          { name: "Freigabe-Schranken", text: "Sensible Aktionen erfordern menschliche Bestätigung." },
          { name: "Produkt-Brücken", text: "Sichere Verbindungen zu Ihren bestehenden Anwendungen." },
        ],
      },
      {
        key: "reception",
        title: "KI-Rezeption & Contact Center",
        intro: "Professionelle Erreichbarkeit rund um die Uhr.",
        items: [
          { name: "KI-Rezeption", text: "Nimmt Anfragen an und beantwortet Standardfragen – 24/7." },
          { name: "Sprache & Anrufe", text: "Anrufannahme, Notizen und Weiterleitung an das richtige Team." },
          { name: "Omnichannel-Center", text: "WhatsApp, Instagram, Messenger, SMS, E-Mail, Web-Chat, Telegram." },
          { name: "Termine & Rückrufe", text: "Erfassung von Terminen und Rückrufwünschen ohne Wartezeit." },
        ],
      },
      {
        key: "transformation",
        title: "Transformation, M&A & Carve-out",
        intro: "Struktur und Übersicht für weitreichende Veränderungen.",
        items: [
          { name: "Transformationsprogramme", text: "Überblick über Vorhaben, Verantwortliche und Fortschritt." },
          { name: "M&A-Vorbereitung", text: "Strukturierte Vorbereitung auf Transaktionen und Prüfungen." },
          { name: "Carve-out-Planung", text: "Planung von Ausgliederungen und getrennten Einheiten." },
          { name: "Beratung & Lernen", text: "Begleitende Unterstützung und Wissensaufbau im Team." },
        ],
      },
      {
        key: "governance",
        title: "Governance, Audit & Compliance",
        intro: "Nachvollziehbarkeit als Grundlage, nicht als Nachgedanke.",
        items: [
          { name: "Audit & Nachweise", text: "Nachvollziehbare Aufzeichnungen zu Änderungen und Freigaben." },
          { name: "Compliance-Reife", text: "Vorbereitung auf DSGVO, TTDSG und branchenspezifische Anforderungen." },
          { name: "Rollen & Zugriff", text: "Feingranulare Rechte je Organisation, Team und Person." },
          { name: "Hosting & Daten", text: "Betrieb in mehreren Rechenzentren mit klaren Zuständigkeiten." },
        ],
      },
      {
        key: "procurement",
        title: "Beschaffungs- & Partnerreife",
        intro: "Vorbereitung auf anspruchsvolle Einkaufsorganisationen.",
        items: [
          { name: "Aramco CCC+ (Priorität)", text: "Vorbereiteter Weg zur Cybersecurity-Anforderung von Saudi Aramco." },
          { name: "Aramco Lieferantenregistrierung", text: "Strukturierte Vorbereitung der Lieferantenaufnahme." },
          { name: "UK- & US-Beschaffung", text: "Vorbereitung für öffentliche Auftraggeber in Großbritannien und den USA." },
          { name: "Bank-Onboarding", text: "Vorbereitung auf Lieferantenprüfungen von Investmentbanken." },
        ],
      },
      {
        key: "ecosystem",
        title: "Add-ons & Ökosystem",
        intro: "Branchenlösungen, die auf demselben Kern aufbauen.",
        items: [
          { name: "Lawquo", text: "Add-on für Kanzleien und juristische Abläufe." },
          { name: "Haccora", text: "Add-on für Lebensmittelsicherheit und Betriebshygiene." },
          { name: "TaxNuvia", text: "Add-on für Steuer- und Buchhaltungsdienstleistungen." },
          { name: "SparesGrid", text: "Add-on für Ersatzteile, Anfragen und technische Auskunft." },
          { name: "Veyumo", text: "Add-on für Mobilfunk-Onboarding und Kundenbetreuung." },
          { name: "Craftvaro", text: "Add-on für Handwerk, Aufträge und Projektabwicklung." },
          { name: "Insure360", text: "Add-on für Versicherungsanfragen und Erneuerungen." },
          { name: "Zoryn Pay & Rewards", text: "Add-ons für Zahlungsabgleich und Kundenbindung." },
          { name: "XpertJobs", text: "Add-on für Stellenanzeigen und Bewerberkoordination." },
          { name: "RegulaOS & Tendryva", text: "Regulatorische Pflichten sowie Tender- und Angebotsarbeit." },
          { name: "Recovrable", text: "Add-on für Forderungsmanagement und Rückholung." },
          { name: "Handel & Gastronomie", text: "Kassensysteme und Gastronomie-Anbindung als Erweiterung." },

        ],
      },
    ],
  },
  en: {
    nav: "Capabilities",
    eyebrow: "THE FULL RANGE",
    title: "Everything OmniQora covers.",
    sub: "Business intelligence and AI through to transformation, governance, procurement readiness and industry add-ons.",
    note: "Availability, scope and approvals are agreed per organisation. Certifications, assessments and regulatory decisions remain with the responsible bodies.",
    groups: [
      {
        key: "intelligence",
        title: "Intelligence & Business360",
        intro: "A dependable picture of performance, finances and priorities.",
        items: [
          { name: "Business360", text: "A connected view of customers, performance and opportunity." },
          { name: "Financial planning", text: "Planning, scenarios and measures that support real decisions." },
          { name: "Analytics & dashboards", text: "Measures for teams, locations and service lines." },
          { name: "Priorities & signals", text: "Clear pointers to what deserves attention first." },
        ],
      },
      {
        key: "genai",
        title: "Generative AI",
        intro: "Practical assistance grounded in approved business content.",
        items: [
          { name: "Aida assistant", text: "Suggestions, summaries and drafts for your team." },
          { name: "Grounded knowledge", text: "Answers drawn from reviewed, approved sources." },
          { name: "Content & campaigns", text: "Customer communication and copy in multiple languages." },
          { name: "People decide", text: "Suggestions are reviewed and approved before anything is sent." },
        ],
      },
      {
        key: "agentic",
        title: "Agentic AI",
        intro: "Assistance that takes work off your hands, within clear limits.",
        items: [
          { name: "Task agents", text: "Recurring work handled under defined permissions." },
          { name: "Enterprise AI control", text: "Central control of models, policy and usage." },
          { name: "Approval gates", text: "Sensitive actions require a human confirmation." },
          { name: "Product bridges", text: "Secure connections to the applications you already run." },
        ],
      },
      {
        key: "reception",
        title: "AI reception & contact centre",
        intro: "Professional availability around the clock.",
        items: [
          { name: "AI receptionist", text: "Takes enquiries and answers routine questions, 24/7." },
          { name: "Voice & calls", text: "Call answering, notes and routing to the right team." },
          { name: "Omnichannel centre", text: "WhatsApp, Instagram, Messenger, SMS, email, web chat, Telegram." },
          { name: "Bookings & callbacks", text: "Appointments and callback requests captured without waiting." },
        ],
      },
      {
        key: "transformation",
        title: "Transformation, M&A & carve-out",
        intro: "Structure and oversight for far-reaching change.",
        items: [
          { name: "Transformation programmes", text: "Oversight of initiatives, owners and progress." },
          { name: "M&A readiness", text: "Structured preparation for transactions and scrutiny." },
          { name: "Carve-out planning", text: "Planning for separations and standalone entities." },
          { name: "Advisory & learning", text: "Guided support and capability building for your team." },
        ],
      },
      {
        key: "governance",
        title: "Governance, audit & compliance",
        intro: "Traceability built in, not added afterwards.",
        items: [
          { name: "Audit & evidence", text: "Traceable records of changes, approvals and access." },
          { name: "Compliance readiness", text: "Preparation for GDPR, TTDSG and sector requirements." },
          { name: "Roles & access", text: "Granular permissions per organisation, team and person." },
          { name: "Hosting & data", text: "Operated across multiple data centres with clear responsibility." },
        ],
      },
      {
        key: "procurement",
        title: "Procurement & partner readiness",
        intro: "Preparation for demanding buying organisations.",
        items: [
          { name: "Aramco CCC+ (priority)", text: "A prepared pathway for Saudi Aramco's cybersecurity requirement." },
          { name: "Aramco supplier registration", text: "Structured preparation for supplier onboarding." },
          { name: "UK & US procurement", text: "Readiness for public sector buyers in the UK and US." },
          { name: "Bank onboarding", text: "Preparation for investment-bank supplier reviews." },
        ],
      },
      {
        key: "ecosystem",
        title: "Add-ons & ecosystem",
        intro: "Industry solutions built on the same core.",
        items: [
          { name: "Lawquo", text: "Add-on for law firms and legal service delivery." },
          { name: "Haccora", text: "Add-on for food safety and operational hygiene." },
          { name: "TaxNuvia", text: "Add-on for tax and accounting services." },
          { name: "SparesGrid", text: "Add-on for spare parts, enquiries and technical answers." },
          { name: "Veyumo", text: "Add-on for mobile network onboarding and customer care." },
          { name: "Craftvaro", text: "Add-on for trades, jobs and project delivery." },
          { name: "Insure360", text: "Add-on for insurance enquiries, documents and renewals." },
          { name: "Zoryn Pay & Rewards", text: "Add-ons for payment reconciliation and loyalty." },
          { name: "XpertJobs", text: "Add-on for job listings and applicant coordination." },
          { name: "RegulaOS & Tendryva", text: "Regulatory obligations plus tender and bid work." },
          { name: "Recovrable", text: "Add-on for collections referral and recovery tracking." },
          { name: "Retail & hospitality", text: "Point-of-sale and hospitality connectivity as an extension." },

        ],
      },
    ],
  },
  tr: {
    nav: "Yetenekler",
    eyebrow: "TÜM KAPSAM",
    title: "OmniQora'nın kapsadığı her şey.",
    sub: "İş zekâsı ve yapay zekâdan dönüşüme, yönetişime, satın alma hazırlığına ve sektör eklentilerine kadar.",
    note: "Kullanılabilirlik, kapsam ve onaylar her kuruma göre belirlenir. Sertifikalar, denetimler ve düzenleyici kararlar yetkili kurumlara aittir.",
    groups: [
      {
        key: "intelligence",
        title: "İş Zekâsı & Business360",
        intro: "Performans, finans ve öncelikler için güvenilir bir tablo.",
        items: [
          { name: "Business360", text: "Müşteriler, performans ve fırsatlara bağlantılı bakış." },
          { name: "Finansal planlama", text: "Kararları destekleyen planlama, senaryolar ve ölçütler." },
          { name: "Analitik & panolar", text: "Ekipler, lokasyonlar ve hizmet hatları için ölçütler." },
          { name: "Öncelikler & sinyaller", text: "Önce neye odaklanılacağına dair net işaretler." },
        ],
      },
      {
        key: "genai",
        title: "Üretken Yapay Zekâ",
        intro: "Onaylı kurumsal içeriğe dayalı pratik destek.",
        items: [
          { name: "Aida asistanı", text: "Ekibiniz için öneriler, özetler ve taslaklar." },
          { name: "Güvenilir bilgi", text: "İncelenmiş ve onaylanmış kaynaklardan yanıtlar." },
          { name: "İçerik & kampanyalar", text: "Birden çok dilde müşteri iletişimi ve metin." },
          { name: "Kararı insan verir", text: "Öneriler gönderilmeden önce incelenir ve onaylanır." },
        ],
      },
      {
        key: "agentic",
        title: "Etmen Tabanlı Yapay Zekâ",
        intro: "Net sınırlar içinde iş üstlenen yapay zekâ.",
        items: [
          { name: "Görev etmenleri", text: "Tanımlı izinlerle yürütülen tekrarlayan işler." },
          { name: "Kurumsal YZ kontrolü", text: "Modeller, politika ve kullanımın merkezî kontrolü." },
          { name: "Onay kapıları", text: "Hassas işlemler insan onayı gerektirir." },
          { name: "Ürün köprüleri", text: "Mevcut uygulamalarınıza güvenli bağlantılar." },
        ],
      },
      {
        key: "reception",
        title: "YZ Resepsiyon & Çağrı Merkezi",
        intro: "Günün her saati profesyonel erişilebilirlik.",
        items: [
          { name: "YZ resepsiyonist", text: "Talepleri alır, rutin soruları 7/24 yanıtlar." },
          { name: "Ses & çağrılar", text: "Çağrı karşılama, notlar ve doğru ekibe yönlendirme." },
          { name: "Çok kanallı merkez", text: "WhatsApp, Instagram, Messenger, SMS, e-posta, web sohbeti, Telegram." },
          { name: "Randevu & geri arama", text: "Randevu ve geri arama talepleri beklemeden alınır." },
        ],
      },
      {
        key: "transformation",
        title: "Dönüşüm, M&A & Ayrıştırma",
        intro: "Kapsamlı değişim için yapı ve gözetim.",
        items: [
          { name: "Dönüşüm programları", text: "Girişimler, sorumlular ve ilerlemenin gözetimi." },
          { name: "M&A hazırlığı", text: "İşlemler ve incelemeler için yapılandırılmış hazırlık." },
          { name: "Carve-out planlaması", text: "Ayrıştırma ve bağımsız birimler için planlama." },
          { name: "Danışmanlık & öğrenme", text: "Rehberli destek ve ekip yetkinliği geliştirme." },
        ],
      },
      {
        key: "governance",
        title: "Yönetişim, Denetim & Uyum",
        intro: "İzlenebilirlik sonradan değil, temelden.",
        items: [
          { name: "Denetim & kanıt", text: "Değişiklik, onay ve erişimin izlenebilir kayıtları." },
          { name: "Uyum hazırlığı", text: "KVKK/GDPR, TTDSG ve sektör gereklilikleri için hazırlık." },
          { name: "Roller & erişim", text: "Kurum, ekip ve kişi bazında ayrıntılı izinler." },
          { name: "Barındırma & veri", text: "Net sorumlulukla birden fazla veri merkezinde işletilir." },
        ],
      },
      {
        key: "procurement",
        title: "Satın Alma & Partner Hazırlığı",
        intro: "Zorlu satın alma kuruluşlarına hazırlık.",
        items: [
          { name: "Aramco CCC+ (öncelik)", text: "Saudi Aramco siber güvenlik gereksinimi için hazırlanmış yol." },
          { name: "Aramco tedarikçi kaydı", text: "Tedarikçi kabulü için yapılandırılmış hazırlık." },
          { name: "UK & ABD satın alma", text: "Birleşik Krallık ve ABD kamu alıcıları için hazırlık." },
          { name: "Banka onboarding", text: "Yatırım bankası tedarikçi incelemelerine hazırlık." },
        ],
      },
      {
        key: "ecosystem",
        title: "Eklentiler & Ekosistem",
        intro: "Aynı çekirdek üzerine kurulu sektör çözümleri.",
        items: [
          { name: "Lawquo", text: "Hukuk büroları ve hukuki hizmetler için eklenti." },
          { name: "Haccora", text: "Gıda güvenliği ve işletme hijyeni için eklenti." },
          { name: "TaxNuvia", text: "Vergi ve muhasebe hizmetleri için eklenti." },
          { name: "SparesGrid", text: "Yedek parça, talep ve teknik yanıtlar için eklenti." },
          { name: "Veyumo", text: "Mobil operatör başlangıcı ve müşteri desteği için eklenti." },
          { name: "Craftvaro", text: "Esnaf işleri, projeler ve saha teslimi için eklenti." },
          { name: "Insure360", text: "Sigorta talepleri ve yenilemeler için eklenti." },
          { name: "Zoryn Pay & Rewards", text: "Ödeme mutabakatı ve müşteri bağlılığı eklentileri." },
          { name: "XpertJobs", text: "İş ilanları ve aday koordinasyonu için eklenti." },
          { name: "RegulaOS & Tendryva", text: "Mevzuat yükümlülükleri ile ihale ve teklif çalışmaları." },
          { name: "Recovrable", text: "Alacak takibi ve tahsilat için eklenti." },
          { name: "Perakende & gastronomi", text: "Satış noktası ve gastronomi bağlantısı eklentisi." },

        ],
      },
    ],
  },
  ar: {
    nav: "القدرات",
    eyebrow: "النطاق الكامل",
    title: "كل ما تغطيه OmniQora.",
    sub: "من ذكاء الأعمال والذكاء الاصطناعي إلى التحول والحوكمة وجاهزية المشتريات وإضافات القطاعات.",
    note: "يُتفق على التوافر والنطاق والموافقات لكل مؤسسة. تبقى الشهادات والتقييمات والقرارات التنظيمية من مسؤولية الجهات المختصة.",
    groups: [
      {
        key: "intelligence",
        title: "الذكاء و Business360",
        intro: "صورة موثوقة للأداء والمالية والأولويات.",
        items: [
          { name: "Business360", text: "رؤية مترابطة للعملاء والأداء والفرص." },
          { name: "التخطيط المالي", text: "تخطيط وسيناريوهات ومؤشرات تدعم القرارات الفعلية." },
          { name: "التحليلات واللوحات", text: "مؤشرات للفرق والمواقع وخطوط الخدمة." },
          { name: "الأولويات والإشارات", text: "مؤشرات واضحة لما يستحق الاهتمام أولاً." },
        ],
      },
      {
        key: "genai",
        title: "الذكاء الاصطناعي التوليدي",
        intro: "مساعدة عملية مبنية على محتوى أعمال معتمد.",
        items: [
          { name: "مساعد Aida", text: "اقتراحات وملخصات ومسودات لفريقك." },
          { name: "معرفة موثوقة", text: "إجابات من مصادر مُراجعة ومعتمدة." },
          { name: "المحتوى والحملات", text: "تواصل مع العملاء ونصوص بعدة لغات." },
          { name: "القرار للإنسان", text: "تُراجع الاقتراحات وتُعتمد قبل أي إرسال." },
        ],
      },
      {
        key: "agentic",
        title: "الذكاء الاصطناعي الوكيل",
        intro: "مساعدة تنجز المهام داخل حدود واضحة.",
        items: [
          { name: "وكلاء المهام", text: "أعمال متكررة تُنفذ وفق أذونات محددة." },
          { name: "التحكم المؤسسي بالذكاء الاصطناعي", text: "تحكم مركزي في النماذج والسياسات والاستخدام." },
          { name: "بوابات الموافقة", text: "الإجراءات الحساسة تتطلب تأكيداً بشرياً." },
          { name: "جسور المنتجات", text: "اتصالات آمنة بالتطبيقات التي تستخدمها بالفعل." },
        ],
      },
      {
        key: "reception",
        title: "استقبال ومركز اتصال بالذكاء الاصطناعي",
        intro: "توفر احترافي على مدار الساعة.",
        items: [
          { name: "موظف استقبال ذكي", text: "يستقبل الطلبات ويجيب الأسئلة المعتادة على مدار الساعة." },
          { name: "الصوت والمكالمات", text: "الرد على المكالمات وتدوين الملاحظات والتحويل للفريق المناسب." },
          { name: "مركز متعدد القنوات", text: "واتساب وإنستغرام وماسنجر والرسائل والبريد والدردشة وتيليجرام." },
          { name: "المواعيد والاتصال لاحقاً", text: "تسجيل المواعيد وطلبات الاتصال دون انتظار." },
        ],
      },
      {
        key: "transformation",
        title: "التحول والاندماج والفصل",
        intro: "هيكل وإشراف للتغيير الواسع.",
        items: [
          { name: "برامج التحول", text: "إشراف على المبادرات والمسؤولين والتقدم." },
          { name: "جاهزية الاندماج والاستحواذ", text: "تحضير منظم للمعاملات والتدقيق." },
          { name: "تخطيط الفصل (Carve-out)", text: "تخطيط لعمليات الفصل والكيانات المستقلة." },
          { name: "الاستشارة والتعلم", text: "دعم موجّه وبناء قدرات الفريق." },
        ],
      },
      {
        key: "governance",
        title: "الحوكمة والتدقيق والامتثال",
        intro: "قابلية التتبع مدمجة من الأساس.",
        items: [
          { name: "التدقيق والأدلة", text: "سجلات قابلة للتتبع للتغييرات والموافقات والوصول." },
          { name: "جاهزية الامتثال", text: "تحضير لمتطلبات GDPR و TTDSG ومتطلبات القطاع." },
          { name: "الأدوار والوصول", text: "أذونات دقيقة لكل مؤسسة وفريق وشخص." },
          { name: "الاستضافة والبيانات", text: "تشغيل في عدة مراكز بيانات بمسؤولية واضحة." },
        ],
      },
      {
        key: "procurement",
        title: "جاهزية المشتريات والشراكات",
        intro: "تحضير لمؤسسات الشراء الصعبة.",
        items: [
          { name: "أرامكو CCC+ (أولوية)", text: "مسار مُعد لمتطلب الأمن السيبراني لأرامكو السعودية." },
          { name: "تسجيل موردي أرامكو", text: "تحضير منظم لقبول الموردين." },
          { name: "مشتريات المملكة المتحدة والولايات المتحدة", text: "جاهزية للمشترين الحكوميين في البلدين." },
          { name: "قبول البنوك", text: "تحضير لمراجعات موردي بنوك الاستثمار." },
        ],
      },
      {
        key: "ecosystem",
        title: "الإضافات والمنظومة",
        intro: "حلول قطاعية مبنية على النواة نفسها.",
        items: [
          { name: "Lawquo", text: "إضافة لمكاتب المحاماة والخدمات القانونية." },
          { name: "Haccora", text: "إضافة لسلامة الغذاء ونظافة التشغيل." },
          { name: "TaxNuvia", text: "إضافة لخدمات الضرائب والمحاسبة." },
          { name: "SparesGrid", text: "إضافة لقطع الغيار والطلبات والإجابات الفنية." },
          { name: "Veyumo", text: "إضافة لتفعيل خدمات الاتصال ودعم العملاء." },
          { name: "Craftvaro", text: "إضافة لأعمال الحِرف والمشاريع والتنفيذ." },
          { name: "Insure360", text: "إضافة لطلبات التأمين والمستندات والتجديد." },
          { name: "Zoryn Pay & Rewards", text: "إضافات لمطابقة المدفوعات وبرامج الولاء." },
          { name: "XpertJobs", text: "إضافة لإعلانات الوظائف وتنسيق المتقدمين." },
          { name: "RegulaOS و Tendryva", text: "الالتزامات التنظيمية وأعمال المناقصات والعطاءات." },
          { name: "Recovrable", text: "إضافة لتحصيل المستحقات ومتابعة الاسترداد." },
          { name: "التجزئة والضيافة", text: "ربط نقاط البيع والضيافة كتوسعة." },

        ],
      },
    ],
  },
  fr: {
    nav: "Capacités",
    eyebrow: "L’ÉTENDUE COMPLÈTE",
    title: "Tout ce que couvre OmniQora.",
    sub: "De l’intelligence d’entreprise et l’IA à la transformation, la gouvernance, la préparation aux achats et les extensions sectorielles.",
    note: "Disponibilité, périmètre et validations sont convenus par organisation. Certifications, évaluations et décisions réglementaires restent du ressort des autorités compétentes.",
    groups: [
      {
        key: "intelligence",
        title: "Intelligence & Business360",
        intro: "Une image fiable de la performance, des finances et des priorités.",
        items: [
          { name: "Business360", text: "Une vue connectée des clients, de la performance et des opportunités." },
          { name: "Planification financière", text: "Planification, scénarios et indicateurs au service des décisions." },
          { name: "Analytique & tableaux de bord", text: "Indicateurs par équipe, site et ligne de service." },
          { name: "Priorités & signaux", text: "Des repères clairs sur ce qui mérite l’attention en premier." },
        ],
      },
      {
        key: "genai",
        title: "IA générative",
        intro: "Une assistance pratique fondée sur des contenus approuvés.",
        items: [
          { name: "Assistant Aida", text: "Suggestions, synthèses et brouillons pour vos équipes." },
          { name: "Connaissance fiable", text: "Réponses issues de sources revues et approuvées." },
          { name: "Contenus & campagnes", text: "Communication client et rédaction en plusieurs langues." },
          { name: "L’humain décide", text: "Les suggestions sont revues et validées avant tout envoi." },
        ],
      },
      {
        key: "agentic",
        title: "IA agentique",
        intro: "Une assistance qui prend en charge des tâches, dans des limites claires.",
        items: [
          { name: "Agents de tâches", text: "Travaux récurrents exécutés selon des autorisations définies." },
          { name: "Contrôle IA d’entreprise", text: "Contrôle central des modèles, des règles et des usages." },
          { name: "Points de validation", text: "Les actions sensibles exigent une confirmation humaine." },
          { name: "Passerelles produits", text: "Connexions sécurisées aux applications que vous utilisez déjà." },
        ],
      },
      {
        key: "reception",
        title: "Accueil IA & centre de contact",
        intro: "Une disponibilité professionnelle en continu.",
        items: [
          { name: "Réceptionniste IA", text: "Prend les demandes et répond aux questions courantes, 24/7." },
          { name: "Voix & appels", text: "Prise d’appels, notes et orientation vers la bonne équipe." },
          { name: "Centre omnicanal", text: "WhatsApp, Instagram, Messenger, SMS, e-mail, chat web, Telegram." },
          { name: "Rendez-vous & rappels", text: "Rendez-vous et demandes de rappel enregistrés sans attente." },
        ],
      },
      {
        key: "transformation",
        title: "Transformation, M&A & carve-out",
        intro: "Structure et pilotage pour des changements majeurs.",
        items: [
          { name: "Programmes de transformation", text: "Pilotage des initiatives, des responsables et de l’avancement." },
          { name: "Préparation M&A", text: "Préparation structurée aux transactions et aux examens." },
          { name: "Planification de carve-out", text: "Préparation des séparations et entités autonomes." },
          { name: "Conseil & montée en compétences", text: "Accompagnement et développement des équipes." },
        ],
      },
      {
        key: "governance",
        title: "Gouvernance, audit & conformité",
        intro: "La traçabilité intégrée dès le départ.",
        items: [
          { name: "Audit & preuves", text: "Traces des modifications, validations et accès." },
          { name: "Préparation à la conformité", text: "Préparation au RGPD, au TTDSG et aux exigences sectorielles." },
          { name: "Rôles & accès", text: "Autorisations fines par organisation, équipe et personne." },
          { name: "Hébergement & données", text: "Exploité dans plusieurs centres de données, responsabilités claires." },
        ],
      },
      {
        key: "procurement",
        title: "Préparation achats & partenaires",
        intro: "Préparation aux organisations d’achat exigeantes.",
        items: [
          { name: "Aramco CCC+ (priorité)", text: "Un parcours préparé pour l’exigence cybersécurité de Saudi Aramco." },
          { name: "Référencement fournisseur Aramco", text: "Préparation structurée à l’enregistrement fournisseur." },
          { name: "Achats UK & US", text: "Préparation pour les acheteurs publics britanniques et américains." },
          { name: "Référencement bancaire", text: "Préparation aux revues fournisseurs des banques d’investissement." },
        ],
      },
      {
        key: "ecosystem",
        title: "Extensions & écosystème",
        intro: "Des solutions sectorielles bâties sur le même noyau.",
        items: [
          { name: "Lawquo", text: "Extension pour cabinets d’avocats et services juridiques." },
          { name: "Haccora", text: "Extension pour la sécurité alimentaire et l’hygiène." },
          { name: "TaxNuvia", text: "Extension pour les services fiscaux et comptables." },
          { name: "SparesGrid", text: "Extension pour pièces de rechange, demandes et réponses techniques." },
          { name: "Veyumo", text: "Extension pour l’activation mobile et le service client." },
          { name: "Craftvaro", text: "Extension pour les métiers, chantiers et projets." },
          { name: "Insure360", text: "Extension pour demandes d’assurance et renouvellements." },
          { name: "Zoryn Pay & Rewards", text: "Extensions pour rapprochement des paiements et fidélité." },
          { name: "XpertJobs", text: "Extension pour offres d’emploi et suivi des candidatures." },
          { name: "RegulaOS & Tendryva", text: "Obligations réglementaires, appels d’offres et propositions." },
          { name: "Recovrable", text: "Extension pour recouvrement et suivi des créances." },
          { name: "Commerce & hôtellerie", text: "Connexion des caisses et de l’hôtellerie en extension." },

        ],
      },
    ],
  },
};
