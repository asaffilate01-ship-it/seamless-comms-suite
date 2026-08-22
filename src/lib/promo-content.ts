export type PromoLang = "de" | "en" | "tr" | "ar" | "uk";

export const promoLangs: { code: PromoLang; label: string; native: string }[] = [
  { code: "de", label: "DE", native: "Deutsch" },
  { code: "en", label: "EN", native: "English" },
  { code: "tr", label: "TR", native: "Türkçe" },
  { code: "ar", label: "AR", native: "العربية" },
  { code: "uk", label: "UK", native: "Українська" },
];

export type PromoContent = {
  nav: { features: string; screens: string; editions: string; faq: string; access: string };
  hero: {
    badge: string;
    titleA: string;
    titleB: string;
    sub: string;
    ctaPrimary: string;
    ctaSecondary: string;
    trust: string[];
  };
  stats: { value: string; label: string }[];
  features: { title: string; sub: string; items: { title: string; desc: string }[] };
  screens: {
    title: string;
    sub: string;
    webLabel: string;
    webCaption: string;
    mobileLabel: string;
    mobileCaption: string;
  };
  editions: { title: string; sub: string; items: { name: string; desc: string; points: string[] }[] };
  packs: { title: string; sub: string; items: { name: string; desc: string }[] };
  faq: { title: string; sub: string; items: { q: string; a: string }[] };
  cta: { title: string; sub: string; button: string; note: string };
  gate: { title: string; sub: string; placeholder: string; submit: string; error: string; back: string };
  cookies: {
    title: string;
    body: string;
    acceptAll: string;
    essentialOnly: string;
    settings: string;
    save: string;
    necessary: string;
    necessaryDesc: string;
    analytics: string;
    analyticsDesc: string;
    marketing: string;
    marketingDesc: string;
    policy: string;
  };
  footer: { trading: string; rights: string; cookieSettings: string; legal: string; contact: string };
  mock: {
    inbox: string;
    search: string;
    conversations: { name: string; preview: string; time: string }[];
    caseTitle: string;
    caseStatus: string;
    aiLabel: string;
    aiSuggestion: string;
    messages: { out: boolean; text: string }[];
    inputPlaceholder: string;
    kpis: { label: string; value: string }[];
    tabs: string[];
  };
};

const de: PromoContent = {
  nav: { features: "Funktionen", screens: "Einblicke", editions: "Editionen", faq: "FAQ", access: "Zugang" },
  hero: {
    badge: "Bald verfügbar · Made in Germany",
    titleA: "Alle Kunden. Alle Gespräche.",
    titleB: "Ein System.",
    sub: "OmniQora macht WhatsApp zum kontrollierten Geschäftsprozess: Anfrage, Qualifizierung, Angebot, Termin, Ausführung und Nachfassen – DSGVO-konform und in Frankfurt gehostet.",
    ctaPrimary: "Zugang anfordern",
    ctaSecondary: "Funktionen ansehen",
    trust: ["DSGVO & TTDSG", "Offizielle WhatsApp Cloud API", "EU-Hosting Frankfurt"],
  },
  stats: [
    { value: "1 Posteingang", label: "Team, Kanäle und Fälle vereint" },
    { value: "24/7", label: "Automatische Ersterfassung" },
    { value: "5 Sprachen", label: "Mehrsprachige Kundenkommunikation" },
    { value: "100 %", label: "Prüfbare Audit-Historie" },
  ],
  features: {
    title: "Was die Plattform leistet",
    sub: "Von der ersten Nachricht bis zur bezahlten Leistung – in einem System.",
    items: [
      { title: "Gemeinsamer WhatsApp-Posteingang", desc: "Ein Team-Postfach mit Zuweisung, internen Notizen, Echtzeit-Updates und vollständiger Verlaufshistorie." },
      { title: "Fälle & SLA-Steuerung", desc: "Aus jedem Gespräch wird ein Vorgang mit Status, Verantwortlichem, Fristen und Eskalation." },
      { title: "Workflow-Automatisierung", desc: "Regelbasierte Abläufe für Erfassung, Qualifizierung, Terminierung und Nachfassen." },
      { title: "KI-Assistent Aida", desc: "Triagiert, fasst zusammen und schlägt Antworten vor – Menschen entscheiden bei Geld und Risiko." },
      { title: "Kampagnen & Vorlagen", desc: "Meta-geprüfte Vorlagen, Opt-in-Verwaltung und Einhaltung des 24-Stunden-Fensters." },
      { title: "Rollen, Rechte & Audit", desc: "Inhaber, Admin, Agent, Betrachter und Partner – mit granularen Rechten und lückenlosem Protokoll." },
    ],
  },
  screens: {
    title: "Einblick in Web-App und Mobile-App",
    sub: "Dieselbe Oberfläche am Desktop und unterwegs – in Ihrer Sprache.",
    webLabel: "Web-Plattform",
    webCaption: "Posteingang, Fallakte und KI-Vorschlag in einer Ansicht.",
    mobileLabel: "Mobile App",
    mobileCaption: "Native Bedienung mit Bottom-Navigation und Push-Benachrichtigungen.",
  },
  editions: {
    title: "Drei Editionen",
    sub: "Eine Engine, drei Wege in den Markt.",
    items: [
      { name: "Eingebettetes Add-on", desc: "Als bezahltes Modul in bestehende Produkte integriert.", points: ["Nahtlose Einbettung", "Gemeinsames Abrechnungsmodell", "Sofort startklar"] },
      { name: "Standalone SaaS", desc: "Für KMU, die WhatsApp professionell betreiben wollen.", points: ["Eigene Marke", "Self-Service-Onboarding", "Monatlich kündbar"] },
      { name: "Partner / White-Label", desc: "Für Agenturen und Reseller mit eigenen Kunden.", points: ["Eigene Domain & Logo", "Mandantenverwaltung", "Umsatzbeteiligung"] },
    ],
  },
  packs: {
    title: "Branchen-Pakete",
    sub: "Vorkonfigurierte Abläufe statt leerer Baukasten.",
    items: [
      { name: "Beauty & Wellness", desc: "Termine, Erinnerungen, No-Show-Schutz." },
      { name: "Handwerk", desc: "Auftragserfassung, Fotos, Kostenvoranschlag." },
      { name: "Gesundheit", desc: "Sichere Portallinks statt sensibler Chat-Anhänge." },
      { name: "Gastronomie", desc: "Reservierungen, Bestellungen, Feedback." },
      { name: "Immobilien", desc: "Besichtigungen, Unterlagen, Interessentenpflege." },
      { name: "Einzelhandel", desc: "Verfügbarkeit, Abholung, Kundenservice." },
    ],
  },
  faq: {
    title: "Häufige Fragen",
    sub: "Alles Wichtige vor dem Start.",
    items: [
      { q: "Ist OmniQora DSGVO-konform?", a: "Ja. Verarbeitung in der EU (Frankfurt), AV-Vertrag, Löschkonzept, Einwilligungsverwaltung und vollständige Protokollierung." },
      { q: "Wie verbindet sich das System mit WhatsApp?", a: "Über die offizielle WhatsApp Business Platform (Cloud API) von Meta – kein inoffizieller Zugang, keine gesperrten Nummern." },
      { q: "Kann ich meine bestehende Nummer nutzen?", a: "Ja, eine bestehende Geschäftsnummer kann bei Meta migriert werden. Wir begleiten den Prozess." },
      { q: "Entscheidet die KI eigenständig?", a: "Nein. Aida triagiert und formuliert Entwürfe. Freigaben mit finanzieller oder rechtlicher Wirkung bleiben beim Menschen." },
      { q: "Was passiert mit sensiblen Daten?", a: "Sensible Unterlagen laufen über sichere Portallinks, nicht über Chat-Anhänge – wichtig u. a. für § 203 StGB." },
      { q: "Wann ist der Start?", a: "Die Plattform befindet sich in der Pilotphase. Über das Zugangsformular erhalten Sie eine frühe Einladung." },
    ],
  },
  cta: {
    title: "Bereit, WhatsApp professionell zu betreiben?",
    sub: "Fordern Sie Zugang zur Pilotphase an – wir melden uns innerhalb eines Werktages.",
    button: "Zugang anfordern",
    note: "Kein Spam. Jederzeit widerrufbar.",
  },
  gate: {
    title: "Geschützter Bereich",
    sub: "Die vollständige Plattform ist während der Pilotphase passwortgeschützt.",
    placeholder: "Passwort eingeben",
    submit: "Freischalten",
    error: "Passwort ist nicht korrekt.",
    back: "Zurück zur Startseite",
  },
  cookies: {
    title: "Wir respektieren Ihre Privatsphäre",
    body: "Wir verwenden notwendige Cookies für den Betrieb der Website. Optionale Cookies nur mit Ihrer Einwilligung (TTDSG § 25).",
    acceptAll: "Alle akzeptieren",
    essentialOnly: "Nur notwendige",
    settings: "Einstellungen",
    save: "Auswahl speichern",
    necessary: "Notwendig",
    necessaryDesc: "Erforderlich für Sicherheit, Sprachwahl und Sitzung. Immer aktiv.",
    analytics: "Statistik",
    analyticsDesc: "Anonyme Reichweitenmessung zur Verbesserung der Seite.",
    marketing: "Marketing",
    marketingDesc: "Messung von Kampagnen und Wiedererkennung über Dienste Dritter.",
    policy: "Cookie-Richtlinie",
  },
  footer: {
    trading: "OmniQora ist ein Handelsname der iTechLounge GmbH.",
    rights: "Alle Rechte vorbehalten.",
    cookieSettings: "Cookie-Einstellungen",
    legal: "Rechtliches",
    contact: "Kontakt",
  },
  mock: {
    inbox: "Posteingang",
    search: "Gespräche durchsuchen",
    conversations: [
      { name: "Lena Hoffmann", preview: "Haben Sie Freitag noch einen Termin?", time: "09:41" },
      { name: "Yusuf Demir", preview: "Foto vom Schaden ist angehängt.", time: "09:12" },
      { name: "Praxis Nordlicht", preview: "Bitte Unterlagen über den Portallink.", time: "gestern" },
    ],
    caseTitle: "Vorgang #2481 · Terminanfrage",
    caseStatus: "Offen",
    aiLabel: "Aida schlägt vor",
    aiSuggestion: "Freitag 14:00 anbieten und Erinnerung 24 h vorher senden.",
    messages: [
      { out: false, text: "Guten Morgen! Haben Sie Freitag noch einen Termin frei?" },
      { out: true, text: "Guten Morgen, Frau Hoffmann! Freitag 14:00 Uhr ist frei – passt das?" },
      { out: false, text: "Perfekt, bitte reservieren." },
    ],
    inputPlaceholder: "Nachricht schreiben …",
    kpis: [
      { label: "Offene Fälle", value: "18" },
      { label: "Antwortzeit", value: "2,4 Min" },
      { label: "Automatisiert", value: "63 %" },
    ],
    tabs: ["Start", "Chats", "Fälle", "Analytik", "Konto"],
  },
};

const en: PromoContent = {
  nav: { features: "Features", screens: "Product tour", editions: "Editions", faq: "FAQ", access: "Access" },
  hero: {
    badge: "Coming soon · Made in Germany",
    titleA: "Every customer. Every conversation.",
    titleB: "One system.",
    sub: "OmniQora turns WhatsApp into a controlled business process: intake, qualification, quote, scheduling, fulfilment and follow-up — GDPR-first and hosted in Frankfurt.",
    ctaPrimary: "Request access",
    ctaSecondary: "See features",
    trust: ["GDPR & TTDSG", "Official WhatsApp Cloud API", "EU hosting in Frankfurt"],
  },
  stats: [
    { value: "1 inbox", label: "Team, channels and cases unified" },
    { value: "24/7", label: "Automated first response" },
    { value: "5 languages", label: "Multilingual customer comms" },
    { value: "100%", label: "Auditable history" },
  ],
  features: {
    title: "What the platform does",
    sub: "From first message to paid work — in one system.",
    items: [
      { title: "Shared WhatsApp inbox", desc: "One team inbox with assignment, internal notes, realtime updates and full history." },
      { title: "Cases & SLA control", desc: "Every conversation becomes a case with status, owner, deadlines and escalation." },
      { title: "Workflow automation", desc: "Rule-based flows for intake, qualification, scheduling and follow-up." },
      { title: "Aida AI assistant", desc: "Triages, summarises and drafts replies — humans decide anything financial or risky." },
      { title: "Campaigns & templates", desc: "Meta-approved templates, opt-in management and 24-hour window enforcement." },
      { title: "Roles, permissions & audit", desc: "Owner, admin, agent, viewer and partner roles with granular rights and a full trail." },
    ],
  },
  screens: {
    title: "Inside the web app and mobile app",
    sub: "The same experience on desktop and on the go — in your language.",
    webLabel: "Web platform",
    webCaption: "Inbox, case file and AI suggestion in a single view.",
    mobileLabel: "Mobile app",
    mobileCaption: "Native feel with bottom navigation and push notifications.",
  },
  editions: {
    title: "Three editions",
    sub: "One engine, three routes to market.",
    items: [
      { name: "Embedded add-on", desc: "A paid module inside existing products.", points: ["Seamless embedding", "Shared billing", "Ready on day one"] },
      { name: "Standalone SaaS", desc: "For SMEs running WhatsApp professionally.", points: ["Your own brand", "Self-serve onboarding", "Cancel monthly"] },
      { name: "Partner / white-label", desc: "For agencies and resellers with their own clients.", points: ["Own domain & logo", "Multi-tenant control", "Revenue share"] },
    ],
  },
  packs: {
    title: "Vertical workflow packs",
    sub: "Pre-built flows instead of an empty builder.",
    items: [
      { name: "Beauty & wellness", desc: "Bookings, reminders, no-show protection." },
      { name: "Trades", desc: "Job intake, photos, quotes." },
      { name: "Healthcare", desc: "Secure portal links instead of chat attachments." },
      { name: "Hospitality", desc: "Reservations, orders, feedback." },
      { name: "Real estate", desc: "Viewings, documents, lead nurture." },
      { name: "Retail", desc: "Availability, click & collect, service." },
    ],
  },
  faq: {
    title: "Frequently asked questions",
    sub: "Everything you need before you start.",
    items: [
      { q: "Is OmniQora GDPR compliant?", a: "Yes. EU processing (Frankfurt), DPA, retention concept, consent management and complete logging." },
      { q: "How does it connect to WhatsApp?", a: "Through Meta's official WhatsApp Business Platform (Cloud API) — no unofficial access, no banned numbers." },
      { q: "Can I keep my existing number?", a: "Yes, an existing business number can be migrated to Meta. We guide you through it." },
      { q: "Does the AI decide on its own?", a: "No. Aida triages and drafts. Anything with financial or legal impact stays with a human." },
      { q: "What happens to sensitive data?", a: "Sensitive documents go through secure portal links, not chat attachments — important for § 203 StGB." },
      { q: "When do you launch?", a: "The platform is in pilot. Request access to receive an early invitation." },
    ],
  },
  cta: {
    title: "Ready to run WhatsApp professionally?",
    sub: "Request pilot access — we reply within one business day.",
    button: "Request access",
    note: "No spam. Withdraw at any time.",
  },
  gate: {
    title: "Protected area",
    sub: "The full platform is password protected during the pilot.",
    placeholder: "Enter password",
    submit: "Unlock",
    error: "That password is not correct.",
    back: "Back to home",
  },
  cookies: {
    title: "We respect your privacy",
    body: "We use necessary cookies to operate this site. Optional cookies only with your consent (TTDSG § 25).",
    acceptAll: "Accept all",
    essentialOnly: "Necessary only",
    settings: "Settings",
    save: "Save selection",
    necessary: "Necessary",
    necessaryDesc: "Required for security, language and session. Always active.",
    analytics: "Statistics",
    analyticsDesc: "Anonymous usage measurement to improve the site.",
    marketing: "Marketing",
    marketingDesc: "Campaign measurement and recognition via third-party services.",
    policy: "Cookie policy",
  },
  footer: {
    trading: "OmniQora is a trading name of iTechLounge GmbH.",
    rights: "All rights reserved.",
    cookieSettings: "Cookie settings",
    legal: "Legal",
    contact: "Contact",
  },
  mock: {
    inbox: "Inbox",
    search: "Search conversations",
    conversations: [
      { name: "Lena Hoffmann", preview: "Do you have a slot on Friday?", time: "09:41" },
      { name: "Yusuf Demir", preview: "Photo of the damage attached.", time: "09:12" },
      { name: "Nordlicht Clinic", preview: "Documents via the portal link please.", time: "yesterday" },
    ],
    caseTitle: "Case #2481 · Booking request",
    caseStatus: "Open",
    aiLabel: "Aida suggests",
    aiSuggestion: "Offer Friday 2:00 pm and send a reminder 24h before.",
    messages: [
      { out: false, text: "Good morning! Do you have a slot on Friday?" },
      { out: true, text: "Good morning, Ms Hoffmann! Friday 2:00 pm is free — does that work?" },
      { out: false, text: "Perfect, please reserve it." },
    ],
    inputPlaceholder: "Write a message …",
    kpis: [
      { label: "Open cases", value: "18" },
      { label: "Response time", value: "2.4 min" },
      { label: "Automated", value: "63%" },
    ],
    tabs: ["Home", "Chats", "Cases", "Analytics", "Account"],
  },
};

const tr: PromoContent = {
  nav: { features: "Özellikler", screens: "Ürün turu", editions: "Sürümler", faq: "SSS", access: "Erişim" },
  hero: {
    badge: "Çok yakında · Almanya'da geliştirildi",
    titleA: "Tüm müşteriler. Tüm görüşmeler.",
    titleB: "Tek sistem.",
    sub: "OmniQora, WhatsApp'ı kontrollü bir iş sürecine dönüştürür: talep, değerlendirme, teklif, randevu, uygulama ve takip — KVKK/GDPR uyumlu ve Frankfurt'ta barındırılır.",
    ctaPrimary: "Erişim talep et",
    ctaSecondary: "Özellikleri gör",
    trust: ["GDPR & TTDSG", "Resmî WhatsApp Cloud API", "AB barındırma, Frankfurt"],
  },
  stats: [
    { value: "1 gelen kutusu", label: "Ekip, kanallar ve dosyalar birlikte" },
    { value: "7/24", label: "Otomatik ilk yanıt" },
    { value: "5 dil", label: "Çok dilli müşteri iletişimi" },
    { value: "%100", label: "Denetlenebilir geçmiş" },
  ],
  features: {
    title: "Platform ne yapar",
    sub: "İlk mesajdan tahsilata kadar tek sistemde.",
    items: [
      { title: "Ortak WhatsApp gelen kutusu", desc: "Atama, dahili notlar, gerçek zamanlı güncellemeler ve tam geçmiş içeren ekip kutusu." },
      { title: "Dosyalar ve SLA kontrolü", desc: "Her görüşme; durum, sorumlu, süre ve eskalasyon içeren bir dosyaya dönüşür." },
      { title: "İş akışı otomasyonu", desc: "Talep alma, değerlendirme, randevu ve takip için kural tabanlı akışlar." },
      { title: "Aida yapay zekâ asistanı", desc: "Sınıflandırır, özetler ve yanıt taslağı yazar — parasal kararlar insanda kalır." },
      { title: "Kampanyalar ve şablonlar", desc: "Meta onaylı şablonlar, izin yönetimi ve 24 saat kuralı denetimi." },
      { title: "Roller, yetkiler ve denetim", desc: "Sahip, yönetici, temsilci, izleyici ve iş ortağı rolleri; ayrıntılı yetki ve kayıt." },
    ],
  },
  screens: {
    title: "Web ve mobil uygulamadan görünüm",
    sub: "Masaüstünde ve yolda aynı deneyim — kendi dilinizde.",
    webLabel: "Web platformu",
    webCaption: "Gelen kutusu, dosya ve yapay zekâ önerisi tek ekranda.",
    mobileLabel: "Mobil uygulama",
    mobileCaption: "Alt menü ve anlık bildirimlerle yerel uygulama hissi.",
  },
  editions: {
    title: "Üç sürüm",
    sub: "Tek motor, üç pazara çıkış yolu.",
    items: [
      { name: "Gömülü eklenti", desc: "Mevcut ürünlerin içinde ücretli modül.", points: ["Sorunsuz entegrasyon", "Ortak faturalama", "İlk günden hazır"] },
      { name: "Bağımsız SaaS", desc: "WhatsApp'ı profesyonel yöneten KOBİ'ler için.", points: ["Kendi markanız", "Self servis kurulum", "Aylık iptal"] },
      { name: "İş ortağı / beyaz etiket", desc: "Kendi müşterisi olan ajanslar ve bayiler için.", points: ["Kendi alan adı ve logo", "Çoklu müşteri yönetimi", "Gelir paylaşımı"] },
    ],
  },
  packs: {
    title: "Sektör paketleri",
    sub: "Boş bir kurgu değil, hazır akışlar.",
    items: [
      { name: "Güzellik & wellness", desc: "Randevu, hatırlatma, gelmeme koruması." },
      { name: "Zanaat & tesisat", desc: "İş alımı, fotoğraflar, teklif." },
      { name: "Sağlık", desc: "Sohbet eki yerine güvenli portal bağlantısı." },
      { name: "Restoran & otel", desc: "Rezervasyon, sipariş, geri bildirim." },
      { name: "Gayrimenkul", desc: "Görüntüleme, belgeler, aday takibi." },
      { name: "Perakende", desc: "Stok, gel-al, müşteri hizmeti." },
    ],
  },
  faq: {
    title: "Sık sorulan sorular",
    sub: "Başlamadan önce bilmeniz gerekenler.",
    items: [
      { q: "OmniQora GDPR uyumlu mu?", a: "Evet. AB'de işleme (Frankfurt), veri işleme sözleşmesi, saklama planı, izin yönetimi ve tam kayıt." },
      { q: "WhatsApp bağlantısı nasıl kurulur?", a: "Meta'nın resmî WhatsApp Business Platform (Cloud API) altyapısıyla — gayri resmî erişim yok." },
      { q: "Mevcut numaramı kullanabilir miyim?", a: "Evet, mevcut işletme numarası Meta'ya taşınabilir. Süreçte size eşlik ederiz." },
      { q: "Yapay zekâ tek başına karar verir mi?", a: "Hayır. Aida sınıflandırır ve taslak yazar; mali veya hukuki etkisi olan onaylar insanda kalır." },
      { q: "Hassas veriler ne olur?", a: "Hassas belgeler sohbet eki yerine güvenli portal bağlantısıyla iletilir (§ 203 StGB için önemli)." },
      { q: "Ne zaman yayında?", a: "Platform pilot aşamasında. Erişim talebiyle erken davetiye alırsınız." },
    ],
  },
  cta: {
    title: "WhatsApp'ı profesyonelce yönetmeye hazır mısınız?",
    sub: "Pilot erişimi talep edin — bir iş günü içinde dönüş yaparız.",
    button: "Erişim talep et",
    note: "Spam yok. İstediğiniz zaman vazgeçebilirsiniz.",
  },
  gate: {
    title: "Korumalı alan",
    sub: "Tam platform, pilot süresince parola korumalıdır.",
    placeholder: "Parolayı girin",
    submit: "Kilidi aç",
    error: "Parola doğru değil.",
    back: "Ana sayfaya dön",
  },
  cookies: {
    title: "Gizliliğinize saygı duyuyoruz",
    body: "Sitenin çalışması için gerekli çerezleri kullanırız. İsteğe bağlı çerezler yalnızca onayınızla (TTDSG § 25).",
    acceptAll: "Tümünü kabul et",
    essentialOnly: "Yalnızca gerekli",
    settings: "Ayarlar",
    save: "Seçimi kaydet",
    necessary: "Gerekli",
    necessaryDesc: "Güvenlik, dil ve oturum için zorunlu. Her zaman aktif.",
    analytics: "İstatistik",
    analyticsDesc: "Siteyi geliştirmek için anonim kullanım ölçümü.",
    marketing: "Pazarlama",
    marketingDesc: "Üçüncü taraf hizmetlerle kampanya ölçümü ve tanıma.",
    policy: "Çerez politikası",
  },
  footer: {
    trading: "OmniQora, iTechLounge GmbH'nin ticari adıdır.",
    rights: "Tüm hakları saklıdır.",
    cookieSettings: "Çerez ayarları",
    legal: "Yasal",
    contact: "İletişim",
  },
  mock: {
    inbox: "Gelen kutusu",
    search: "Görüşmelerde ara",
    conversations: [
      { name: "Lena Hoffmann", preview: "Cuma için yeriniz var mı?", time: "09:41" },
      { name: "Yusuf Demir", preview: "Hasarın fotoğrafı ekte.", time: "09:12" },
      { name: "Nordlicht Kliniği", preview: "Belgeleri portal bağlantısından iletin.", time: "dün" },
    ],
    caseTitle: "Dosya #2481 · Randevu talebi",
    caseStatus: "Açık",
    aiLabel: "Aida öneriyor",
    aiSuggestion: "Cuma 14:00 önerin ve 24 saat önce hatırlatma gönderin.",
    messages: [
      { out: false, text: "Günaydın! Cuma için boş yeriniz var mı?" },
      { out: true, text: "Günaydın Sayın Hoffmann! Cuma 14:00 uygun — olur mu?" },
      { out: false, text: "Harika, lütfen ayırın." },
    ],
    inputPlaceholder: "Mesaj yazın …",
    kpis: [
      { label: "Açık dosya", value: "18" },
      { label: "Yanıt süresi", value: "2,4 dk" },
      { label: "Otomatik", value: "%63" },
    ],
    tabs: ["Ana sayfa", "Sohbet", "Dosyalar", "Analiz", "Hesap"],
  },
};

const ar: PromoContent = {
  nav: { features: "المزايا", screens: "جولة المنتج", editions: "الإصدارات", faq: "الأسئلة", access: "الدخول" },
  hero: {
    badge: "قريباً · صُنع في ألمانيا",
    titleA: "كل العملاء. كل المحادثات.",
    titleB: "نظام واحد.",
    sub: "يحوّل OmniQora واتساب إلى عملية عمل منضبطة: الاستقبال، التأهيل، العرض، الموعد، التنفيذ والمتابعة — متوافق مع GDPR ومستضاف في فرانكفورت.",
    ctaPrimary: "اطلب الوصول",
    ctaSecondary: "استعرض المزايا",
    trust: ["GDPR و TTDSG", "واجهة واتساب السحابية الرسمية", "استضافة أوروبية في فرانكفورت"],
  },
  stats: [
    { value: "صندوق واحد", label: "الفريق والقنوات والملفات في مكان واحد" },
    { value: "٢٤/٧", label: "استقبال آلي على مدار الساعة" },
    { value: "٥ لغات", label: "تواصل متعدد اللغات مع العملاء" },
    { value: "١٠٠٪", label: "سجل قابل للتدقيق" },
  ],
  features: {
    title: "ماذا تقدّم المنصة",
    sub: "من أول رسالة حتى إتمام الخدمة — في نظام واحد.",
    items: [
      { title: "صندوق واتساب مشترك", desc: "صندوق للفريق مع الإسناد والملاحظات الداخلية والتحديث الفوري والسجل الكامل." },
      { title: "الملفات وإدارة SLA", desc: "كل محادثة تتحول إلى ملف بحالة ومسؤول ومواعيد نهائية وتصعيد." },
      { title: "أتمتة سير العمل", desc: "مسارات قائمة على القواعد للاستقبال والتأهيل والحجز والمتابعة." },
      { title: "المساعد الذكي Aida", desc: "يفرز ويلخّص ويقترح الردود — والقرارات المالية تبقى للإنسان." },
      { title: "الحملات والقوالب", desc: "قوالب معتمدة من Meta وإدارة الموافقات والالتزام بنافذة ٢٤ ساعة." },
      { title: "الأدوار والصلاحيات والتدقيق", desc: "مالك ومشرف وموظف ومشاهد وشريك، بصلاحيات دقيقة وسجل كامل." },
    ],
  },
  screens: {
    title: "من داخل تطبيق الويب والجوال",
    sub: "التجربة نفسها على المكتب وأثناء التنقل — بلغتك.",
    webLabel: "منصة الويب",
    webCaption: "الصندوق والملف واقتراح الذكاء الاصطناعي في شاشة واحدة.",
    mobileLabel: "تطبيق الجوال",
    mobileCaption: "إحساس أصلي مع شريط سفلي وإشعارات فورية.",
  },
  editions: {
    title: "ثلاثة إصدارات",
    sub: "محرك واحد وثلاث طرق للسوق.",
    items: [
      { name: "إضافة مدمجة", desc: "وحدة مدفوعة داخل المنتجات القائمة.", points: ["دمج سلس", "فوترة مشتركة", "جاهز من اليوم الأول"] },
      { name: "SaaS مستقل", desc: "للشركات الصغيرة والمتوسطة التي تدير واتساب باحتراف.", points: ["علامتك الخاصة", "تسجيل ذاتي", "إلغاء شهري"] },
      { name: "شريك / علامة بيضاء", desc: "للوكالات والموزعين وعملائهم.", points: ["نطاق وشعار خاص", "إدارة متعددة العملاء", "مشاركة الإيرادات"] },
    ],
  },
  packs: {
    title: "حزم القطاعات",
    sub: "مسارات جاهزة بدل صفحة فارغة.",
    items: [
      { name: "التجميل والعافية", desc: "المواعيد والتذكير ومنع التخلّف." },
      { name: "الحرف والصيانة", desc: "استلام الطلب والصور وعرض السعر." },
      { name: "الرعاية الصحية", desc: "روابط بوابة آمنة بدل مرفقات الدردشة." },
      { name: "الضيافة", desc: "الحجوزات والطلبات والتقييم." },
      { name: "العقارات", desc: "المعاينات والمستندات ومتابعة العملاء." },
      { name: "التجزئة", desc: "التوفر والاستلام وخدمة العملاء." },
    ],
  },
  faq: {
    title: "الأسئلة الشائعة",
    sub: "كل ما تحتاجه قبل البدء.",
    items: [
      { q: "هل OmniQora متوافق مع GDPR؟", a: "نعم. معالجة داخل الاتحاد الأوروبي (فرانكفورت)، عقد معالجة بيانات، سياسة حذف، إدارة موافقات وسجل كامل." },
      { q: "كيف يتصل النظام بواتساب؟", a: "عبر منصة واتساب للأعمال الرسمية (Cloud API) من Meta — بلا وصول غير رسمي." },
      { q: "هل أستخدم رقمي الحالي؟", a: "نعم، يمكن ترحيل رقم العمل الحالي إلى Meta ونرافقك في العملية." },
      { q: "هل يقرر الذكاء الاصطناعي وحده؟", a: "لا. Aida تفرز وتكتب مسودات، أما القرارات المالية أو القانونية فتبقى للإنسان." },
      { q: "ماذا عن البيانات الحساسة؟", a: "تمر المستندات الحساسة عبر روابط بوابة آمنة وليس كمرفقات دردشة." },
      { q: "متى الإطلاق؟", a: "المنصة في مرحلة تجريبية. اطلب الوصول للحصول على دعوة مبكرة." },
    ],
  },
  cta: {
    title: "جاهز لإدارة واتساب باحتراف؟",
    sub: "اطلب الوصول التجريبي — نرد خلال يوم عمل واحد.",
    button: "اطلب الوصول",
    note: "بلا رسائل مزعجة. يمكنك الإلغاء في أي وقت.",
  },
  gate: {
    title: "منطقة محمية",
    sub: "المنصة الكاملة محمية بكلمة مرور خلال المرحلة التجريبية.",
    placeholder: "أدخل كلمة المرور",
    submit: "فتح",
    error: "كلمة المرور غير صحيحة.",
    back: "العودة إلى الصفحة الرئيسية",
  },
  cookies: {
    title: "نحترم خصوصيتك",
    body: "نستخدم ملفات تعريف الارتباط الضرورية لتشغيل الموقع. الاختيارية بموافقتك فقط (TTDSG § 25).",
    acceptAll: "قبول الكل",
    essentialOnly: "الضروري فقط",
    settings: "الإعدادات",
    save: "حفظ الاختيار",
    necessary: "ضروري",
    necessaryDesc: "مطلوب للأمان واللغة والجلسة. مفعّل دائماً.",
    analytics: "إحصاءات",
    analyticsDesc: "قياس مجهول للاستخدام لتحسين الموقع.",
    marketing: "تسويق",
    marketingDesc: "قياس الحملات والتعرف عبر خدمات خارجية.",
    policy: "سياسة ملفات الارتباط",
  },
  footer: {
    trading: "OmniQora هو اسم تجاري لشركة iTechLounge GmbH.",
    rights: "جميع الحقوق محفوظة.",
    cookieSettings: "إعدادات الارتباط",
    legal: "قانوني",
    contact: "اتصل بنا",
  },
  mock: {
    inbox: "الوارد",
    search: "ابحث في المحادثات",
    conversations: [
      { name: "لينا هوفمان", preview: "هل لديكم موعد يوم الجمعة؟", time: "٠٩:٤١" },
      { name: "يوسف دمير", preview: "صورة الضرر مرفقة.", time: "٠٩:١٢" },
      { name: "عيادة نوردليشت", preview: "أرسلوا المستندات عبر رابط البوابة.", time: "أمس" },
    ],
    caseTitle: "ملف ‎#2481‎ · طلب موعد",
    caseStatus: "مفتوح",
    aiLabel: "اقتراح Aida",
    aiSuggestion: "اعرض الجمعة ١٤:٠٠ وأرسل تذكيراً قبل ٢٤ ساعة.",
    messages: [
      { out: false, text: "صباح الخير! هل لديكم موعد يوم الجمعة؟" },
      { out: true, text: "صباح النور! الجمعة الساعة ١٤:٠٠ متاحة — هل تناسبك؟" },
      { out: false, text: "ممتاز، احجزوها من فضلكم." },
    ],
    inputPlaceholder: "اكتب رسالة …",
    kpis: [
      { label: "ملفات مفتوحة", value: "١٨" },
      { label: "زمن الرد", value: "٢٫٤ د" },
      { label: "مؤتمت", value: "٦٣٪" },
    ],
    tabs: ["الرئيسية", "المحادثات", "الملفات", "التحليلات", "الحساب"],
  },
};

const uk: PromoContent = {
  nav: { features: "Можливості", screens: "Огляд", editions: "Видання", faq: "Питання", access: "Доступ" },
  hero: {
    badge: "Незабаром · Зроблено в Німеччині",
    titleA: "Усі клієнти. Усі розмови.",
    titleB: "Одна система.",
    sub: "OmniQora перетворює WhatsApp на керований бізнес-процес: запит, кваліфікація, пропозиція, запис, виконання та подальший супровід — відповідно до GDPR, хостинг у Франкфурті.",
    ctaPrimary: "Запросити доступ",
    ctaSecondary: "Переглянути можливості",
    trust: ["GDPR і TTDSG", "Офіційний WhatsApp Cloud API", "Хостинг у ЄС, Франкфурт"],
  },
  stats: [
    { value: "1 скринька", label: "Команда, канали та справи разом" },
    { value: "24/7", label: "Автоматичний перший контакт" },
    { value: "5 мов", label: "Багатомовна комунікація" },
    { value: "100 %", label: "Повний журнал аудиту" },
  ],
  features: {
    title: "Що вміє платформа",
    sub: "Від першого повідомлення до оплаченої роботи — в одній системі.",
    items: [
      { title: "Спільна скринька WhatsApp", desc: "Командна скринька з призначенням, нотатками, оновленнями в реальному часі та історією." },
      { title: "Справи та контроль SLA", desc: "Кожна розмова стає справою зі статусом, відповідальним, строками та ескалацією." },
      { title: "Автоматизація процесів", desc: "Правила для прийому, кваліфікації, запису та нагадувань." },
      { title: "ШІ-асистент Aida", desc: "Сортує, підсумовує та готує чернетки — фінансові рішення залишаються за людиною." },
      { title: "Кампанії та шаблони", desc: "Шаблони, схвалені Meta, керування згодами та контроль 24-годинного вікна." },
      { title: "Ролі, права та аудит", desc: "Власник, адмін, агент, глядач і партнер — з детальними правами та журналом." },
    ],
  },
  screens: {
    title: "Усередині вебзастосунку та мобільного застосунку",
    sub: "Той самий досвід на комп'ютері й у дорозі — вашою мовою.",
    webLabel: "Вебплатформа",
    webCaption: "Скринька, справа та підказка ШІ в одному вікні.",
    mobileLabel: "Мобільний застосунок",
    mobileCaption: "Нативне відчуття з нижньою навігацією та сповіщеннями.",
  },
  editions: {
    title: "Три видання",
    sub: "Один рушій, три шляхи на ринок.",
    items: [
      { name: "Вбудований модуль", desc: "Платний модуль усередині наявних продуктів.", points: ["Безшовна інтеграція", "Спільний біллінг", "Готово з першого дня"] },
      { name: "Окремий SaaS", desc: "Для МСП, які професійно працюють у WhatsApp.", points: ["Власний бренд", "Самостійне підключення", "Щомісячне скасування"] },
      { name: "Партнер / white-label", desc: "Для агенцій і реселерів із власними клієнтами.", points: ["Власний домен і логотип", "Керування клієнтами", "Розподіл доходу"] },
    ],
  },
  packs: {
    title: "Галузеві пакети",
    sub: "Готові сценарії замість порожнього конструктора.",
    items: [
      { name: "Краса та здоров'я", desc: "Записи, нагадування, захист від неявок." },
      { name: "Ремесла та сервіс", desc: "Прийом заявок, фото, кошторис." },
      { name: "Медицина", desc: "Безпечні портальні посилання замість вкладень." },
      { name: "Гостинність", desc: "Бронювання, замовлення, відгуки." },
      { name: "Нерухомість", desc: "Перегляди, документи, супровід клієнтів." },
      { name: "Роздріб", desc: "Наявність, самовивіз, сервіс." },
    ],
  },
  faq: {
    title: "Часті запитання",
    sub: "Усе важливе перед стартом.",
    items: [
      { q: "Чи відповідає OmniQora GDPR?", a: "Так. Обробка в ЄС (Франкфурт), договір обробки, політика зберігання, керування згодами та повне логування." },
      { q: "Як система під'єднується до WhatsApp?", a: "Через офіційну WhatsApp Business Platform (Cloud API) від Meta — без неофіційних шляхів." },
      { q: "Чи можу я лишити свій номер?", a: "Так, наявний бізнес-номер можна перенести до Meta. Ми супроводжуємо процес." },
      { q: "Чи вирішує ШІ самостійно?", a: "Ні. Aida сортує та готує чернетки; рішення з фінансовим чи правовим ефектом ухвалює людина." },
      { q: "Що з чутливими даними?", a: "Чутливі документи передаються через захищені портальні посилання, а не вкладення в чаті." },
      { q: "Коли запуск?", a: "Платформа в пілоті. Запросіть доступ, щоб отримати раннє запрошення." },
    ],
  },
  cta: {
    title: "Готові вести WhatsApp професійно?",
    sub: "Запросіть пілотний доступ — відповідаємо протягом одного робочого дня.",
    button: "Запросити доступ",
    note: "Без спаму. Скасування будь-коли.",
  },
  gate: {
    title: "Захищена зона",
    sub: "Повна платформа захищена паролем на час пілоту.",
    placeholder: "Введіть пароль",
    submit: "Розблокувати",
    error: "Пароль неправильний.",
    back: "На головну",
  },
  cookies: {
    title: "Ми поважаємо вашу приватність",
    body: "Ми використовуємо необхідні файли cookie для роботи сайту. Необов'язкові — лише за вашою згодою (TTDSG § 25).",
    acceptAll: "Прийняти всі",
    essentialOnly: "Лише необхідні",
    settings: "Налаштування",
    save: "Зберегти вибір",
    necessary: "Необхідні",
    necessaryDesc: "Потрібні для безпеки, мови та сесії. Завжди активні.",
    analytics: "Статистика",
    analyticsDesc: "Анонімне вимірювання використання для покращення сайту.",
    marketing: "Маркетинг",
    marketingDesc: "Вимірювання кампаній і впізнавання через сторонні сервіси.",
    policy: "Політика cookie",
  },
  footer: {
    trading: "OmniQora — торгова назва компанії iTechLounge GmbH.",
    rights: "Усі права захищено.",
    cookieSettings: "Налаштування cookie",
    legal: "Правова інформація",
    contact: "Контакти",
  },
  mock: {
    inbox: "Вхідні",
    search: "Пошук у розмовах",
    conversations: [
      { name: "Лена Гофман", preview: "Чи є вільне місце в п'ятницю?", time: "09:41" },
      { name: "Юсуф Демір", preview: "Фото пошкодження додано.", time: "09:12" },
      { name: "Клініка Нордліхт", preview: "Документи через портальне посилання.", time: "учора" },
    ],
    caseTitle: "Справа #2481 · Запит на запис",
    caseStatus: "Відкрито",
    aiLabel: "Aida пропонує",
    aiSuggestion: "Запропонувати п'ятницю 14:00 і нагадати за 24 години.",
    messages: [
      { out: false, text: "Доброго ранку! Чи є вільне місце в п'ятницю?" },
      { out: true, text: "Доброго ранку, пані Гофман! П'ятниця 14:00 вільна — підходить?" },
      { out: false, text: "Чудово, будь ласка, забронюйте." },
    ],
    inputPlaceholder: "Написати повідомлення …",
    kpis: [
      { label: "Відкриті справи", value: "18" },
      { label: "Час відповіді", value: "2,4 хв" },
      { label: "Автоматизовано", value: "63 %" },
    ],
    tabs: ["Головна", "Чати", "Справи", "Аналітика", "Профіль"],
  },
};

export const promoContent: Record<PromoLang, PromoContent> = { de, en, tr, ar, uk };
