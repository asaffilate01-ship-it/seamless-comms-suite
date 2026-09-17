export type PromoLang = "de" | "en" | "tr" | "ar" | "fr";

export const promoLangs: { code: PromoLang; label: string; native: string }[] = [
  { code: "de", label: "DE", native: "Deutsch" },
  { code: "en", label: "EN", native: "English" },
  { code: "tr", label: "TR", native: "Türkçe" },
  { code: "ar", label: "AR", native: "العربية" },
  { code: "fr", label: "FR", native: "Français" },
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
  channels: { title: string; sub: string; items: string[]; note: string };
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
    badge: "",
    titleA: "Ihr Unternehmen,",
    titleB: "als ein Ganzes.",
    sub: "OmniQora verbindet Kundenkommunikation, Teamarbeit und intelligente Unterstützung in einer sicheren Plattform – für klareren Service und bessere Entscheidungen.",
    ctaPrimary: "Zugang anfordern",
    ctaSecondary: "Funktionen ansehen",
    trust: ["DSGVO & TTDSG", "Alle Kanäle in einem Posteingang", "EU- & UK-Hosting"],
  },
  stats: [
    { value: "1 Posteingang", label: "Team, Kanäle und Fälle vereint" },
    { value: "24/7", label: "Automatische Ersterfassung" },
    { value: "5 Sprachen", label: "Mehrsprachige Kundenkommunikation" },
    { value: "100 %", label: "Prüfbare Audit-Historie" },
  ],  channels: { title: "Ein Posteingang für jeden Kanal", sub: "Kundengespräche kommen von überall. OmniQora bündelt sie – und verbindet Kalender, CRM, Zahlungen und Ihre Fachsysteme.", items: ["WhatsApp", "Instagram", "Facebook Messenger", "SMS", "E-Mail", "Web-Chat", "Telegram", "Telefonie & VoIP", "Rufnummern-Mitnahme", "Kalender", "CRM", "Payments", "API & Webhooks"], note: "Weitere Kanäle und Systeme auf Anfrage." },

  features: {
    title: "Was die Plattform leistet",
    sub: "Von der ersten Nachricht bis zur bezahlten Leistung – in einem System.",
    items: [
      { title: "Omnichannel-Posteingang", desc: "WhatsApp, Instagram, Messenger, SMS, E-Mail, Web-Chat und Anrufe in einem Team-Postfach mit Zuweisung, Notizen und Echtzeit-Updates." },
      { title: "Fälle & SLA-Steuerung", desc: "Aus jedem Gespräch wird ein Vorgang mit Status, Verantwortlichem, Fristen und Eskalation." },
      { title: "Workflow-Automatisierung", desc: "Regelbasierte Abläufe für Erfassung, Qualifizierung, Terminierung und Nachfassen." },
      { title: "KI-Assistent Aida", desc: "Triagiert, fasst zusammen und schlägt Antworten vor – Menschen entscheiden bei Geld und Risiko." },
      { title: "KI-Empfang rund um die Uhr", desc: "Nimmt Anrufe, Chats und Nachrichten auch außerhalb der Öffnungszeiten an, qualifiziert Anliegen, bucht Termine und übergibt saubere Fälle an Ihr Team." },
      { title: "Kampagnen & Vorlagen", desc: "Geprüfte Nachrichtenvorlagen, Opt-in-Verwaltung und automatische Einhaltung der Kanalregeln." },
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
      { q: "Ist OmniQora DSGVO-konform?", a: "Ja. Verarbeitung in der EU, AV-Vertrag, Löschkonzept, Einwilligungsverwaltung und vollständige Protokollierung." },
      { q: "Welche Kanäle sind abgedeckt?", a: "WhatsApp, Instagram, Facebook Messenger, SMS, E-Mail, Web-Chat, Telefon sowie Kalender-, CRM- und Zahlungsanbindungen – alles in einem Posteingang." },
      { q: "Kann ich meine bestehenden Nummern und Postfächer nutzen?", a: "Ja. Bestehende Geschäftsnummern und Adressen werden übernommen. Die technische Einrichtung übernehmen wir im Onboarding." },
      { q: "Entscheidet die KI eigenständig?", a: "Nein. Aida triagiert und formuliert Entwürfe. Freigaben mit finanzieller oder rechtlicher Wirkung bleiben beim Menschen." },
      { q: "Was passiert mit sensiblen Daten?", a: "Sensible Unterlagen laufen über sichere Portallinks, nicht über Chat-Anhänge – wichtig u. a. für § 203 StGB." },
      { q: "Wann ist der Start?", a: "Die Plattform befindet sich in der Pilotphase. Über das Zugangsformular erhalten Sie eine frühe Einladung." },
    ],
  },
  cta: {
    title: "Bereit, alle Kundenkanäle professionell zu betreiben?",
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
    trading: "OmniQora ist eine Handelsmarke der iTechLounge Ltd (UK) und der iTechLounge GmbH (Deutschland). Internationaler Service.",
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
    badge: "",
    titleA: "Your business,",
    titleB: "working as one.",
    sub: "OmniQora connects customer communication, teamwork and intelligent assistance in one secure platform—for clearer service and better decisions.",
    ctaPrimary: "Request access",
    ctaSecondary: "See features",
    trust: ["GDPR & UK GDPR", "Every channel in one inbox", "EU & UK hosting"],
  },
  stats: [
    { value: "1 inbox", label: "Team, channels and cases unified" },
    { value: "24/7", label: "Automated first response" },
    { value: "5 languages", label: "Multilingual customer comms" },
    { value: "100%", label: "Auditable history" },
  ],  channels: { title: "One inbox for every channel", sub: "Customers reach you everywhere. OmniQora unifies it all — and connects calendars, CRM, payments and your line-of-business systems.", items: ["WhatsApp", "Instagram", "Facebook Messenger", "SMS", "Email", "Web chat", "Telegram", "Telephony & VoIP", "Number porting", "Calendar", "CRM", "Payments", "API & webhooks"], note: "Further channels and systems on request." },

  features: {
    title: "What the platform does",
    sub: "From first message to paid work — in one system.",
    items: [
      { title: "Omnichannel shared inbox", desc: "WhatsApp, Instagram, Messenger, SMS, email, web chat and calls in one team inbox with assignment, notes and realtime updates." },
      { title: "Cases & SLA control", desc: "Every conversation becomes a case with status, owner, deadlines and escalation." },
      { title: "Workflow automation", desc: "Rule-based flows for intake, qualification, scheduling and follow-up." },
      { title: "Aida AI assistant", desc: "Triages, summarises and drafts replies — humans decide anything financial or risky." },
      { title: "AI receptionist, 24/7", desc: "Answers calls, chats and messages outside opening hours, qualifies the request, books appointments and hands a clean case to your team." },
      { title: "Campaigns & templates", desc: "Approved message templates, opt-in management and automatic channel-rule enforcement." },
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
      { q: "Is OmniQora GDPR compliant?", a: "Yes. EU processing, DPA, retention concept, consent management and complete logging." },
      { q: "Which channels are covered?", a: "WhatsApp, Instagram, Facebook Messenger, SMS, email, web chat, voice, plus calendar, CRM and payment connections — all in one inbox." },
      { q: "Can I keep my existing numbers and mailboxes?", a: "Yes. Existing business numbers and addresses carry over. We handle the technical setup during onboarding." },
      { q: "Does the AI decide on its own?", a: "No. Aida triages and drafts. Anything with financial or legal impact stays with a human." },
      { q: "What happens to sensitive data?", a: "Sensitive documents go through secure portal links, not chat attachments — important for § 203 StGB." },
      { q: "When do you launch?", a: "The platform is in pilot. Request access to receive an early invitation." },
    ],
  },
  cta: {
    title: "Ready to run every customer channel professionally?",
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
    trading: "OmniQora is a trading brand of iTechLounge Ltd in the UK and iTechLounge GmbH in Germany. An international service.",
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
    badge: "",
    titleA: "İşletmeniz,",
    titleB: "tek bir bütün olarak.",
    sub: "OmniQora müşteri iletişimini, ekip çalışmasını ve akıllı desteği güvenli tek bir platformda birleştirir; daha net hizmet ve daha iyi kararlar sağlar.",
    ctaPrimary: "Erişim talep et",
    ctaSecondary: "Özellikleri gör",
    trust: ["GDPR & KVKK", "Tüm kanallar tek kutuda", "AB & UK barındırma"],
  },
  stats: [
    { value: "1 gelen kutusu", label: "Ekip, kanallar ve dosyalar birlikte" },
    { value: "7/24", label: "Otomatik ilk yanıt" },
    { value: "5 dil", label: "Çok dilli müşteri iletişimi" },
    { value: "%100", label: "Denetlenebilir geçmiş" },
  ],  channels: { title: "Her kanal için tek gelen kutusu", sub: "Müşteriler her yerden yazıyor. OmniQora hepsini birleştirir; takvim, CRM, ödeme ve iş sistemlerinizle bağlar.", items: ["WhatsApp", "Instagram", "Facebook Messenger", "SMS", "E-posta", "Web sohbeti", "Telegram", "Telefon & VoIP", "Numara taşıma", "Takvim", "CRM", "Ödemeler", "API & webhook"], note: "Diğer kanallar ve sistemler talep üzerine." },

  features: {
    title: "Platform ne yapar",
    sub: "İlk mesajdan tahsilata kadar tek sistemde.",
    items: [
      { title: "Çok kanallı gelen kutusu", desc: "WhatsApp, Instagram, Messenger, SMS, e-posta, web sohbeti ve çağrılar tek ekip kutusunda; atama, not ve canlı güncelleme." },
      { title: "Dosyalar ve SLA kontrolü", desc: "Her görüşme; durum, sorumlu, süre ve eskalasyon içeren bir dosyaya dönüşür." },
      { title: "İş akışı otomasyonu", desc: "Talep alma, değerlendirme, randevu ve takip için kural tabanlı akışlar." },
      { title: "Aida yapay zekâ asistanı", desc: "Sınıflandırır, özetler ve yanıt taslağı yazar — parasal kararlar insanda kalır." },
      { title: "7/24 yapay zekâ resepsiyon", desc: "Çalışma saatleri dışında da aramaları, sohbetleri ve mesajları yanıtlar; talebi sınıflandırır, randevu oluşturur ve ekibinize düzenli bir kayıt devreder." },
      { title: "Kampanyalar ve şablonlar", desc: "Onaylı mesaj şablonları, izin yönetimi ve kanal kurallarının otomatik denetimi." },
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
      { q: "OmniQora GDPR uyumlu mu?", a: "Evet. AB'de işleme , veri işleme sözleşmesi, saklama planı, izin yönetimi ve tam kayıt." },
      { q: "Hangi kanallar destekliyor?", a: "WhatsApp, Instagram, Facebook Messenger, SMS, e-posta, web sohbeti, telefon ve ayrıca takvim, CRM, ödeme bağlantıları — hepsi tek kutuda." },
      { q: "Mevcut numara ve e-postalarımı kullanabilir miyim?", a: "Evet. Mevcut işletme numaralarınız ve adresleriniz taşınır. Teknik kurulumu biz yaparız." },
      { q: "Yapay zekâ tek başına karar verir mi?", a: "Hayır. Aida sınıflandırır ve taslak yazar; mali veya hukuki etkisi olan onaylar insanda kalır." },
      { q: "Hassas veriler ne olur?", a: "Hassas belgeler sohbet eki yerine güvenli portal bağlantısıyla iletilir (§ 203 StGB için önemli)." },
      { q: "Ne zaman yayında?", a: "Platform pilot aşamasında. Erişim talebiyle erken davetiye alırsınız." },
    ],
  },
  cta: {
    title: "Tüm müşteri kanallarını profesyonelce yönetmeye hazır mısınız?",
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
    trading: "OmniQora, Birleşik Krallık'ta iTechLounge Ltd ve Almanya'da iTechLounge GmbH'nin ticari markasıdır. Uluslararası bir hizmet.",
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
    badge: "",
    titleA: "أعمالك،",
    titleB: "تعمل كوحدة واحدة.",
    sub: "يجمع OmniQora تواصل العملاء وتعاون الفريق والمساعدة الذكية في منصة آمنة واحدة لخدمة أوضح وقرارات أفضل.",
    ctaPrimary: "اطلب الوصول",
    ctaSecondary: "استعرض المزايا",
    trust: ["GDPR و TTDSG", "كل القنوات في صندوق واحد", "استضافة في الاتحاد الأوروبي والمملكة المتحدة"],
  },
  stats: [
    { value: "صندوق واحد", label: "الفريق والقنوات والملفات في مكان واحد" },
    { value: "٢٤/٧", label: "استقبال آلي على مدار الساعة" },
    { value: "٥ لغات", label: "تواصل متعدد اللغات مع العملاء" },
    { value: "١٠٠٪", label: "سجل قابل للتدقيق" },
  ],  channels: { title: "صندوق واحد لكل قناة", sub: "يصلك العملاء من كل مكان. يوحّد OmniQora كل ذلك ويربط التقويم وCRM والمدفوعات وأنظمة عملك.", items: ["WhatsApp", "Instagram", "Facebook Messenger", "SMS", "البريد الإلكتروني", "الدردشة على الويب", "Telegram", "الهاتف وVoIP", "نقل الأرقام", "التقويم", "CRM", "المدفوعات", "API وWebhooks"], note: "قنوات وأنظمة إضافية عند الطلب." },

  features: {
    title: "ماذا تقدّم المنصة",
    sub: "من أول رسالة حتى إتمام الخدمة — في نظام واحد.",
    items: [
      { title: "صندوق موحّد لكل القنوات", desc: "واتساب وإنستغرام وماسنجر والرسائل القصيرة والبريد والدردشة والمكالمات في صندوق واحد مع الإسناد والملاحظات والتحديث الفوري." },
      { title: "الملفات وإدارة SLA", desc: "كل محادثة تتحول إلى ملف بحالة ومسؤول ومواعيد نهائية وتصعيد." },
      { title: "أتمتة سير العمل", desc: "مسارات قائمة على القواعد للاستقبال والتأهيل والحجز والمتابعة." },
      { title: "المساعد الذكي Aida", desc: "يفرز ويلخّص ويقترح الردود — والقرارات المالية تبقى للإنسان." },
      { title: "موظف استقبال ذكي على مدار الساعة", desc: "يرد على المكالمات والمحادثات والرسائل خارج ساعات العمل، ويؤهّل الطلب، ويحجز المواعيد، ويسلّم ملفًا مرتبًا لفريقك." },
      { title: "الحملات والقوالب", desc: "قوالب رسائل معتمدة وإدارة الموافقات والالتزام التلقائي بقواعد كل قناة." },
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
      { q: "ما القنوات المدعومة؟", a: "واتساب وإنستغرام وفيسبوك ماسنجر والرسائل القصيرة والبريد الإلكتروني والدردشة والهاتف، مع ربط التقويم وCRM والمدفوعات — في صندوق واحد." },
      { q: "هل أستخدم أرقامي وبريدي الحالي؟", a: "نعم، تُنقل أرقام وعناوين عملك الحالية، ونتولى الإعداد التقني خلال التهيئة." },
      { q: "هل يقرر الذكاء الاصطناعي وحده؟", a: "لا. Aida تفرز وتكتب مسودات، أما القرارات المالية أو القانونية فتبقى للإنسان." },
      { q: "ماذا عن البيانات الحساسة؟", a: "تمر المستندات الحساسة عبر روابط بوابة آمنة وليس كمرفقات دردشة." },
      { q: "متى الإطلاق؟", a: "المنصة في مرحلة تجريبية. اطلب الوصول للحصول على دعوة مبكرة." },
    ],
  },
  cta: {
    title: "جاهز لإدارة كل قنوات العملاء باحتراف؟",
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
    trading: "OmniQora علامة تجارية لشركة iTechLounge Ltd في المملكة المتحدة وشركة iTechLounge GmbH في ألمانيا. خدمة دولية.",
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

const fr: PromoContent = {
  nav: { features: "Fonctions", screens: "Aperçu", editions: "Éditions", faq: "FAQ", access: "Accès" },
  hero: {
    badge: "",
    titleA: "Votre entreprise,",
    titleB: "qui fonctionne comme un tout.",
    sub: "OmniQora réunit communication client, collaboration et assistance intelligente dans une plateforme sécurisée, pour un service plus clair et de meilleures décisions.",
    ctaPrimary: "Demander un accès",
    ctaSecondary: "Voir les fonctions",
    trust: ["RGPD & UK GDPR", "Tous les canaux dans une boîte", "Hébergement UE et Royaume-Uni"],
  },
  stats: [
    { value: "1 boîte", label: "Équipe, canaux et dossiers réunis" },
    { value: "24/7", label: "Premier contact automatisé" },
    { value: "5 langues", label: "Communication client multilingue" },
    { value: "100 %", label: "Historique d'audit vérifiable" },
  ],  channels: { title: "Une boîte de réception pour chaque canal", sub: "Les clients écrivent de partout. OmniQora rassemble tout — et se connecte aux agendas, au CRM, aux paiements et à vos outils métier.", items: ["WhatsApp", "Instagram", "Facebook Messenger", "SMS", "E-mail", "Chat web", "Telegram", "Téléphonie & VoIP", "Portabilité des numéros", "Agenda", "CRM", "Paiements", "API & webhooks"], note: "Autres canaux et systèmes sur demande." },

  features: {
    title: "Ce que la plateforme apporte",
    sub: "Du premier message à la prestation payée — dans un seul système.",
    items: [
      { title: "Boîte omnicanale", desc: "WhatsApp, Instagram, Messenger, SMS, e-mail, chat web et appels dans une boîte d'équipe, avec attribution, notes et mises à jour en temps réel." },
      { title: "Dossiers et suivi des SLA", desc: "Chaque conversation devient un dossier avec statut, responsable, échéances et escalade." },
      { title: "Automatisation des processus", desc: "Des règles pour la prise en charge, la qualification, la prise de rendez-vous et les rappels." },
      { title: "Assistant IA Aida", desc: "Trie, résume et prépare des réponses — les décisions à impact financier restent humaines." },
      { title: "Réceptionniste IA 24/7", desc: "Répond aux appels, chats et messages en dehors des horaires, qualifie la demande, planifie les rendez-vous et transmet un dossier propre à votre équipe." },
      { title: "Campagnes et modèles", desc: "Modèles de messages approuvés, gestion des consentements et respect automatique des règles de chaque canal." },
      { title: "Rôles, droits et audit", desc: "Propriétaire, administrateur, agent, observateur et partenaire — droits fins et journal complet." },
    ],
  },
  screens: {
    title: "À l'intérieur de l'application web et mobile",
    sub: "La même expérience au bureau et en déplacement — dans votre langue.",
    webLabel: "Plateforme web",
    webCaption: "Boîte, dossier et suggestion IA dans une seule vue.",
    mobileLabel: "Application mobile",
    mobileCaption: "Sensation native avec navigation basse et notifications.",
  },
  editions: {
    title: "Trois éditions",
    sub: "Un moteur, trois façons d'aller sur le marché.",
    items: [
      { name: "Module intégré", desc: "Module payant au cœur de produits existants.", points: ["Intégration transparente", "Facturation commune", "Prêt dès le premier jour"] },
      { name: "SaaS autonome", desc: "Pour les PME qui gèrent leurs canaux clients de façon professionnelle.", points: ["Votre marque", "Mise en route autonome", "Résiliable chaque mois"] },
      { name: "Partenaire / marque blanche", desc: "Pour les agences et revendeurs avec leurs propres clients.", points: ["Domaine et logo propres", "Gestion des clients", "Partage des revenus"] },
    ],
  },
  packs: {
    title: "Packs métiers",
    sub: "Des scénarios prêts à l'emploi plutôt qu'un éditeur vide.",
    items: [
      { name: "Beauté et bien-être", desc: "Rendez-vous, rappels, protection contre les absences." },
      { name: "Artisanat et services", desc: "Prise de demande, photos, estimation." },
      { name: "Santé", desc: "Liens de portail sécurisés au lieu de pièces jointes." },
      { name: "Hôtellerie-restauration", desc: "Réservations, commandes, avis." },
      { name: "Immobilier", desc: "Visites, documents, suivi des prospects." },
      { name: "Commerce de détail", desc: "Disponibilité, retrait en magasin, service." },
    ],
  },
  faq: {
    title: "Questions fréquentes",
    sub: "L'essentiel avant de démarrer.",
    items: [
      { q: "OmniQora est-il conforme au RGPD ?", a: "Oui. Traitement dans l'UE, contrat de sous-traitance, règles de conservation, gestion des consentements et journalisation complète." },
      { q: "Quels canaux sont pris en charge ?", a: "WhatsApp, Instagram, Facebook Messenger, SMS, e-mail, chat web, téléphonie, ainsi qu'agendas, CRM et paiements — le tout dans une seule boîte." },
      { q: "Puis-je conserver mes numéros et adresses actuels ?", a: "Oui. Vos numéros et adresses professionnels sont repris ; nous prenons en charge la mise en place technique pendant l'intégration." },
      { q: "L'IA décide-t-elle seule ?", a: "Non. Aida trie et prépare des propositions ; toute décision à portée financière ou juridique reste humaine." },
      { q: "Et les données sensibles ?", a: "Les documents sensibles passent par des liens de portail sécurisés, jamais par des pièces jointes dans le chat." },
      { q: "Quand est le lancement ?", a: "La plateforme est en pilote. Demandez un accès pour recevoir une invitation anticipée." },
    ],
  },
  cta: {
    title: "Prêt à piloter tous vos canaux clients de façon professionnelle ?",
    sub: "Demandez un accès pilote — réponse en un jour ouvré.",
    button: "Demander un accès",
    note: "Pas de spam. Résiliable à tout moment.",
  },
  gate: {
    title: "Zone protégée",
    sub: "La plateforme complète est protégée par mot de passe pendant le pilote.",
    placeholder: "Saisir le mot de passe",
    submit: "Déverrouiller",
    error: "Mot de passe incorrect.",
    back: "Retour à l'accueil",
  },
  cookies: {
    title: "Nous respectons votre vie privée",
    body: "Nous utilisons des cookies nécessaires au fonctionnement du site. Les cookies optionnels ne sont activés qu'avec votre consentement.",
    acceptAll: "Tout accepter",
    essentialOnly: "Nécessaires uniquement",
    settings: "Paramètres",
    save: "Enregistrer la sélection",
    necessary: "Nécessaires",
    necessaryDesc: "Requis pour la sécurité, la langue et la session. Toujours actifs.",
    analytics: "Statistiques",
    analyticsDesc: "Mesure anonyme de l'audience pour améliorer le site.",
    marketing: "Marketing",
    marketingDesc: "Mesure des campagnes et reconnaissance via des services tiers.",
    policy: "Politique de cookies",
  },
  footer: {
    trading: "OmniQora est une marque commerciale d'iTechLounge Ltd (Royaume-Uni) et d'iTechLounge GmbH (Allemagne). Service international.",
    rights: "Tous droits réservés.",
    cookieSettings: "Paramètres des cookies",
    legal: "Mentions légales",
    contact: "Contact",
  },
  mock: {
    inbox: "Boîte de réception",
    search: "Rechercher dans les conversations",
    conversations: [
      { name: "Lena Hoffmann", preview: "Avez-vous encore un créneau vendredi ?", time: "09:41" },
      { name: "Yusuf Demir", preview: "La photo du dommage est jointe.", time: "09:12" },
      { name: "Cabinet Nordlicht", preview: "Documents via le lien du portail.", time: "hier" },
    ],
    caseTitle: "Dossier n° 2481 · Demande de rendez-vous",
    caseStatus: "Ouvert",
    aiLabel: "Aida propose",
    aiSuggestion: "Proposer vendredi 14 h et envoyer un rappel 24 h avant.",
    messages: [
      { out: false, text: "Bonjour ! Avez-vous encore un créneau vendredi ?" },
      { out: true, text: "Bonjour Madame Hoffmann ! Vendredi 14 h est libre — cela vous convient ?" },
      { out: false, text: "Parfait, réservez s'il vous plaît." },
    ],
    inputPlaceholder: "Écrire un message …",
    kpis: [
      { label: "Dossiers ouverts", value: "18" },
      { label: "Temps de réponse", value: "2,4 min" },
      { label: "Automatisé", value: "63 %" },
    ],
    tabs: ["Accueil", "Chats", "Dossiers", "Analytique", "Compte"],
  },
};

export const promoContent: Record<PromoLang, PromoContent> = { de, en, tr, ar, fr };
