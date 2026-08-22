import type { PromoLang } from "./promo-content";

export type LegalDoc = {
  title: string;
  subtitle: string;
  sections: { h: string; body: string }[];
  note: string;
};

export type LegalPack = {
  imprint: LegalDoc;
  privacy: LegalDoc;
  terms: LegalDoc;
  cookiesInactive: string;
  yourSelection: string;
  noSelection: string;
  withdraw: string;
};

const ADDRESSES =
  "iTechLounge GmbH\nMusterstraße 1\n10115 Berlin\n\niTechLounge Ltd\n1 Example Street\nLondon EC1A 1AA";

const de: LegalPack = {
  imprint: {
    title: "Impressum",
    subtitle: "Angaben gemäß § 5 DDG (vormals § 5 TMG).",
    sections: [
      {
        h: "Anbieter",
        body: `OmniQora ist eine Handelsmarke der iTechLounge Ltd (Vereinigtes Königreich) und der iTechLounge GmbH (Deutschland). OmniQora wird international angeboten.\n\n${ADDRESSES}`,
      },
      { h: "Kontakt", body: "E-Mail: hallo@omniqora.com\nTelefon: +49 30 000000-0" },
      { h: "Vertretungsberechtigte", body: "Geschäftsführung: N. N." },
      {
        h: "Register und Steuern",
        body: "Handelsregister: Amtsgericht Berlin-Charlottenburg, HRB 000000 B\nUmsatzsteuer-ID gemäß § 27a UStG: DE000000000\nCompanies House (UK): 00000000",
      },
      { h: "Verantwortlich für redaktionelle Inhalte", body: "N. N., Adresse wie oben." },
      {
        h: "Streitschlichtung",
        body: "Wir sind nicht verpflichtet und nicht bereit, an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen. OmniQora richtet sich ausschließlich an Unternehmen (B2B).",
      },
    ],
    note: "Hinweis: Diese Angaben sind Platzhalter und müssen vor dem Livegang durch die echten Unternehmensdaten ersetzt werden.",
  },
  privacy: {
    title: "Datenschutzerklärung",
    subtitle: "Informationen zur Verarbeitung personenbezogener Daten nach DSGVO und UK GDPR.",
    sections: [
      { h: "1. Verantwortlicher", body: "iTechLounge GmbH, Musterstraße 1, 10115 Berlin und iTechLounge Ltd (UK), hallo@omniqora.com. Datenschutzbeauftragter: dsb@omniqora.com." },
      { h: "2. Zwecke und Rechtsgrundlagen", body: "Bereitstellung der Plattform, Vertragsdurchführung und Support: Art. 6 Abs. 1 lit. b DSGVO. Betrieb, Sicherheit, Missbrauchserkennung und Protokollierung: Art. 6 Abs. 1 lit. f DSGVO. Marketing-Nachrichten nur mit ausdrücklicher Einwilligung: Art. 6 Abs. 1 lit. a DSGVO, jederzeit widerruflich." },
      { h: "3. Kategorien von Daten", body: "Kontostammdaten (Name, E-Mail, Rolle), Kommunikationsdaten aus Kundengesprächen über die von Ihnen genutzten Kanäle (Kennung, Inhalte, Zeitstempel, Zustellstatus), Fall- und Workflow-Daten, Protokoll- und Auditdaten, technische Metadaten." },
      { h: "4. Auftragsverarbeitung", body: "Für Kundenunternehmen ist OmniQora Auftragsverarbeiter nach Art. 28 DSGVO; der Kunde bleibt Verantwortlicher für die Inhalte seiner Konversationen. Ein AV-Vertrag inklusive Subunternehmerliste wird bereitgestellt." },
      { h: "5. Empfänger und Drittlandtransfer", body: "Zur Zustellung von Nachrichten werden die Betreiber der jeweils genutzten Kanäle eingebunden. Transfers in Drittländer erfolgen auf Basis von Standardvertragsklauseln und geeigneten Garantien. Hosting und Datenbank werden in mehreren Rechenzentren betrieben." },
      { h: "6. Sensible Daten", body: "Gesundheits-, Finanz- und andere besonders schützenswerte Daten werden nicht über Chat-Anhänge erhoben. Stattdessen werden gesicherte Portal-Links verwendet. Berufsgeheimnisträger (§ 203 StGB) werden vertraglich und technisch eingebunden." },
      { h: "7. Speicherdauer", body: "Konversations- und Falldaten werden für die Dauer der Geschäftsbeziehung und anschließend gemäß gesetzlichen Aufbewahrungsfristen (§ 147 AO, § 257 HGB) gespeichert. Konfigurierbare Löschfristen pro Mandant, standardmäßig 24 Monate für Chatinhalte." },
      { h: "8. Cookies und lokale Speicherung", body: "Notwendige Cookies und Local-Storage-Einträge (Sitzung, Spracheinstellung) nach § 25 Abs. 2 TTDSG. Optionale Cookies nur nach Ihrer Einwilligung. Kein Tracking ohne Einwilligung." },
      { h: "9. Betroffenenrechte", body: "Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20), Widerspruch (Art. 21) sowie Beschwerde bei einer Aufsichtsbehörde (Art. 77). Anfragen an dsb@omniqora.com." },
      { h: "10. Sicherheit", body: "Verschlüsselung in Transit und at rest, mandantenstrenge Zugriffskontrolle, rollenbasierte Berechtigungen, revisionssichere Audit-Logs und Signaturprüfung eingehender Ereignisse." },
    ],
    note: "Hinweis: Vorlage — vor dem Livegang juristisch prüfen lassen.",
  },
  terms: {
    title: "Allgemeine Geschäftsbedingungen",
    subtitle: "Für Unternehmenskunden (B2B).",
    sections: [
      { h: "1. Geltungsbereich", body: "Diese Bedingungen gelten für alle Verträge zwischen iTechLounge (OmniQora) und Unternehmen im Sinne des § 14 BGB über die Nutzung der OmniQora-Plattform (SaaS), der eingebetteten Add-on-Variante und der Partner-Edition." },
      { h: "2. Leistungsgegenstand", body: "OmniQora stellt eine mandantenfähige Software zur Steuerung von Kundenkommunikation über mehrere Kanäle bereit, inklusive Postfach, Fällen, Workflows, KI-Unterstützung mit menschlicher Freigabe, Rollen und Audit-Protokollen." },
      { h: "3. Vertragsschluss und Testphase", body: "Der Vertrag kommt mit Freischaltung des Arbeitsbereichs zustande. Testphasen enden automatisch und gehen nur nach ausdrücklicher Bestellung in ein kostenpflichtiges Abonnement über." },
      { h: "4. Preise und Zahlung", body: "Es gilt die zum Bestellzeitpunkt gültige Preisliste, monatlich oder jährlich im Voraus. Nutzungsabhängige Bestandteile werden nachschüssig abgerechnet. Alle Preise netto zzgl. USt." },
      { h: "5. Pflichten des Kunden", body: "Der Kunde verantwortet Inhalte, Einwilligungen der Endkunden, die Einhaltung der Richtlinien der genutzten Kanäle sowie die Verwaltung seiner Nutzer und Rollen. Zugangsdaten sind vertraulich zu behandeln." },
      { h: "6. Verfügbarkeit", body: "Zielverfügbarkeit 99,5 % im Monatsmittel, ausgenommen angekündigte Wartungsfenster und Störungen bei Drittanbietern." },
      { h: "7. Auftragsverarbeitung", body: "Ergänzend gilt der Auftragsverarbeitungsvertrag nach Art. 28 DSGVO, der Bestandteil dieses Vertrags ist." },
      { h: "8. Laufzeit und Kündigung", body: "Monatsabonnements sind zum Monatsende kündbar, Jahresabonnements mit 30 Tagen Frist zum Laufzeitende. Nach Vertragsende werden Daten auf Wunsch exportiert und anschließend fristgerecht gelöscht." },
      { h: "9. Haftung", body: "Haftung unbeschränkt bei Vorsatz, grober Fahrlässigkeit, Personenschäden und nach Produkthaftungsgesetz; im Übrigen beschränkt auf den typischen vorhersehbaren Schaden, höchstens die in zwölf Monaten gezahlten Entgelte." },
      { h: "10. Schlussbestimmungen", body: "Für Kunden mit Sitz in Deutschland gilt deutsches Recht, Gerichtsstand Berlin; für Kunden mit Sitz im Vereinigten Königreich englisches Recht, Gerichtsstand London. Änderungen werden mindestens 30 Tage vorher mitgeteilt." },
    ],
    note: "Hinweis: Vorlage — vor dem Livegang juristisch prüfen lassen.",
  },
  cookiesInactive: "Derzeit nicht aktiv – wird erst nach Einwilligung geladen.",
  yourSelection: "Ihre Auswahl",
  noSelection: "Es liegt noch keine Auswahl vor.",
  withdraw: "Einwilligung widerrufen",
};

const en: LegalPack = {
  imprint: {
    title: "Legal notice",
    subtitle: "Provider information under § 5 DDG (German Digital Services Act).",
    sections: [
      {
        h: "Provider",
        body: `OmniQora is a trading brand of iTechLounge Ltd (United Kingdom) and iTechLounge GmbH (Germany). OmniQora is offered internationally.\n\n${ADDRESSES}`,
      },
      { h: "Contact", body: "Email: hallo@omniqora.com\nPhone: +49 30 000000-0" },
      { h: "Managing directors", body: "Management: N. N." },
      {
        h: "Register and tax",
        body: "Commercial register: Amtsgericht Berlin-Charlottenburg, HRB 000000 B\nVAT ID under § 27a UStG: DE000000000\nCompanies House (UK): 00000000",
      },
      { h: "Responsible for editorial content", body: "N. N., address as above." },
      {
        h: "Dispute resolution",
        body: "We are not obliged and not willing to take part in consumer dispute resolution proceedings. OmniQora is a business-to-business service.",
      },
    ],
    note: "Note: these details are placeholders and must be replaced with real company data before going live.",
  },
  privacy: {
    title: "Privacy policy",
    subtitle: "How we process personal data under the GDPR and UK GDPR.",
    sections: [
      { h: "1. Controller", body: "iTechLounge GmbH, Musterstraße 1, 10115 Berlin, Germany and iTechLounge Ltd (UK), hallo@omniqora.com. Data protection officer: dsb@omniqora.com." },
      { h: "2. Purposes and legal bases", body: "Providing the platform, performing the contract and support: Art. 6(1)(b) GDPR. Operations, security, abuse detection and logging: Art. 6(1)(f) GDPR. Marketing messages only with explicit consent: Art. 6(1)(a) GDPR, revocable at any time." },
      { h: "3. Categories of data", body: "Account data (name, email, role), communication data from customer conversations on the channels you use (identifier, content, timestamps, delivery status), case and workflow data, log and audit data, technical metadata." },
      { h: "4. Processing on behalf of customers", body: "For business customers OmniQora acts as processor under Art. 28 GDPR; the customer remains controller for conversation content. A DPA including the sub-processor list is provided." },
      { h: "5. Recipients and international transfers", body: "The operators of the channels you use are involved in delivering messages. Transfers to third countries rely on Standard Contractual Clauses and appropriate safeguards. Hosting and database run across multiple data centres." },
      { h: "6. Sensitive data", body: "Health, financial and other special-category data is never collected through chat attachments. Secure portal links are used instead. Professionals bound by secrecy (§ 203 StGB) are onboarded with contractual and technical safeguards." },
      { h: "7. Retention", body: "Conversation and case data is retained for the duration of the business relationship and afterwards per statutory retention periods (§ 147 AO, § 257 HGB). Per-tenant configurable deletion, default 24 months for chat content." },
      { h: "8. Cookies and local storage", body: "Strictly necessary cookies and local storage entries (session, language choice) under § 25(2) TTDSG. Optional cookies only after your consent. No tracking without consent." },
      { h: "9. Your rights", body: "Access (Art. 15), rectification (Art. 16), erasure (Art. 17), restriction (Art. 18), portability (Art. 20), objection (Art. 21) and the right to lodge a complaint with a supervisory authority (Art. 77). Requests to dsb@omniqora.com." },
      { h: "10. Security", body: "Encryption in transit and at rest, strict tenant isolation, role-based permissions, tamper-evident audit logs and signature verification of inbound events." },
    ],
    note: "Note: template — have counsel review before going live.",
  },
  terms: {
    title: "Terms of service",
    subtitle: "For business customers (B2B).",
    sections: [
      { h: "1. Scope", body: "These terms apply to all contracts between iTechLounge (OmniQora) and business customers (§ 14 BGB) for the OmniQora platform (SaaS), the embedded add-on and the partner edition." },
      { h: "2. Services", body: "OmniQora provides multi-tenant software to run customer communication across multiple channels, including inbox, cases, workflows, AI assistance with human approval, roles and audit logs." },
      { h: "3. Formation and trials", body: "The contract is concluded when the workspace is activated. Trials end automatically and only convert to a paid subscription upon an explicit order." },
      { h: "4. Prices and payment", body: "The price list valid at the time of order applies, billed monthly or annually in advance. Usage-based components are billed in arrears. All prices are net plus VAT." },
      { h: "5. Customer obligations", body: "The customer is responsible for content, end-customer consent, compliance with the policies of the channels used and the management of its users and roles. Credentials must be kept confidential." },
      { h: "6. Availability", body: "Target availability is 99.5% monthly average, excluding announced maintenance windows and third-party incidents." },
      { h: "7. Data processing", body: "The Art. 28 GDPR data processing agreement applies in addition and forms part of this contract." },
      { h: "8. Term and termination", body: "Monthly subscriptions may be cancelled at the end of the month, annual subscriptions with 30 days' notice to the end of the term. On termination data is exported on request and then deleted within the agreed period." },
      { h: "9. Liability", body: "Unlimited liability for intent, gross negligence, personal injury and under product liability law; otherwise limited to typical foreseeable damage, capped at the fees paid in the preceding twelve months." },
      { h: "10. Final provisions", body: "German law and the courts of Berlin apply to customers based in Germany; English law and the courts of London apply to customers based in the United Kingdom. Changes are announced at least 30 days in advance." },
    ],
    note: "Note: template — have counsel review before going live.",
  },
  cookiesInactive: "Not active yet – loaded only after consent.",
  yourSelection: "Your selection",
  noSelection: "No selection stored yet.",
  withdraw: "Withdraw consent",
};

const tr: LegalPack = {
  imprint: {
    title: "Künye",
    subtitle: "Sağlayıcı bilgileri (§ 5 DDG, Almanya).",
    sections: [
      {
        h: "Sağlayıcı",
        body: `OmniQora, iTechLounge Ltd (Birleşik Krallık) ve iTechLounge GmbH (Almanya) şirketlerinin ticari markasıdır. OmniQora uluslararası olarak sunulmaktadır.\n\n${ADDRESSES}`,
      },
      { h: "İletişim", body: "E-posta: hallo@omniqora.com\nTelefon: +49 30 000000-0" },
      { h: "Yetkili temsilciler", body: "Yönetim: N. N." },
      {
        h: "Sicil ve vergi",
        body: "Ticaret sicili: Amtsgericht Berlin-Charlottenburg, HRB 000000 B\nKDV numarası (§ 27a UStG): DE000000000\nCompanies House (BK): 00000000",
      },
      { h: "Editoryal içerikten sorumlu", body: "N. N., adres yukarıdaki gibidir." },
      {
        h: "Uyuşmazlık çözümü",
        body: "Tüketici tahkim kurulu önünde uyuşmazlık çözüm sürecine katılma yükümlülüğümüz ve isteğimiz bulunmamaktadır. OmniQora yalnızca kurumsal müşterilere (B2B) yöneliktir.",
      },
    ],
    note: "Not: Bu bilgiler örnektir ve yayına almadan önce gerçek şirket bilgileriyle değiştirilmelidir.",
  },
  privacy: {
    title: "Gizlilik politikası",
    subtitle: "GDPR ve UK GDPR kapsamında kişisel verilerin işlenmesi hakkında bilgilendirme.",
    sections: [
      { h: "1. Veri sorumlusu", body: "iTechLounge GmbH, Musterstraße 1, 10115 Berlin (Almanya) ve iTechLounge Ltd (BK), hallo@omniqora.com. Veri koruma görevlisi: dsb@omniqora.com." },
      { h: "2. Amaçlar ve hukuki dayanaklar", body: "Platformun sunulması, sözleşmenin ifası ve destek: Md. 6(1)(b) GDPR. İşletim, güvenlik, kötüye kullanım tespiti ve kayıt tutma: Md. 6(1)(f) GDPR. Pazarlama mesajları yalnızca açık rıza ile: Md. 6(1)(a) GDPR; rıza her zaman geri alınabilir." },
      { h: "3. Veri kategorileri", body: "Hesap verileri (ad, e-posta, rol), kullandığınız kanallardaki müşteri görüşmelerine ait iletişim verileri (tanımlayıcı, içerik, zaman damgası, teslim durumu), vaka ve iş akışı verileri, günlük ve denetim kayıtları, teknik meta veriler." },
      { h: "4. Veri işleyen sıfatı", body: "Kurumsal müşteriler için OmniQora, Md. 28 GDPR uyarınca veri işleyendir; görüşme içeriklerinin sorumlusu müşteridir. Alt işleyen listesini içeren bir veri işleme sözleşmesi sağlanır." },
      { h: "5. Alıcılar ve yurt dışı aktarım", body: "Mesajların iletilmesi için kullandığınız kanalların işletmecileri devreye girer. Üçüncü ülkelere aktarımlar Standart Sözleşme Maddeleri ve uygun güvencelere dayanır. Barındırma ve veritabanı birden fazla veri merkezinde çalışır." },
      { h: "6. Hassas veriler", body: "Sağlık, finans ve diğer özel nitelikli veriler sohbet ekleriyle toplanmaz; bunun yerine güvenli portal bağlantıları kullanılır. Meslek sırrıyla yükümlü kişiler için sözleşmesel ve teknik güvenceler uygulanır." },
      { h: "7. Saklama süresi", body: "Görüşme ve vaka verileri iş ilişkisi süresince ve sonrasında yasal saklama sürelerine göre saklanır. Kiracı bazında yapılandırılabilir silme, sohbet içeriği için varsayılan 24 ay." },
      { h: "8. Çerezler ve yerel depolama", body: "Yalnızca zorunlu çerezler ve yerel depolama kayıtları (oturum, dil tercihi). İsteğe bağlı çerezler yalnızca rızanızla. Rıza olmadan izleme yapılmaz." },
      { h: "9. İlgili kişi hakları", body: "Erişim (Md. 15), düzeltme (Md. 16), silme (Md. 17), kısıtlama (Md. 18), taşınabilirlik (Md. 20), itiraz (Md. 21) ve denetim makamına şikâyet (Md. 77). Talepler: dsb@omniqora.com." },
      { h: "10. Güvenlik", body: "Aktarımda ve beklemede şifreleme, katı kiracı izolasyonu, rol tabanlı yetkilendirme, değiştirilemez denetim kayıtları ve gelen olayların imza doğrulaması." },
    ],
    note: "Not: Şablondur — yayına almadan önce hukuki inceleme yaptırın.",
  },
  terms: {
    title: "Kullanım koşulları",
    subtitle: "Kurumsal müşteriler için (B2B).",
    sections: [
      { h: "1. Kapsam", body: "Bu koşullar, iTechLounge (OmniQora) ile kurumsal müşteriler arasındaki OmniQora platformu (SaaS), gömülü eklenti ve iş ortağı sürümü kullanımına ilişkin tüm sözleşmeler için geçerlidir." },
      { h: "2. Hizmetin konusu", body: "OmniQora; gelen kutusu, vakalar, iş akışları, insan onaylı yapay zekâ desteği, roller ve denetim kayıtlarını içeren çok kiracılı bir çok kanallı müşteri iletişimi yazılımı sunar." },
      { h: "3. Sözleşmenin kurulması ve deneme", body: "Sözleşme, çalışma alanının etkinleştirilmesiyle kurulur. Deneme süreleri otomatik sona erer ve yalnızca açık sipariş üzerine ücretli aboneliğe dönüşür." },
      { h: "4. Fiyatlar ve ödeme", body: "Sipariş anında geçerli fiyat listesi uygulanır; aylık veya yıllık peşin faturalanır. Kullanıma bağlı bileşenler dönem sonunda faturalanır. Tüm fiyatlar KDV hariçtir." },
      { h: "5. Müşterinin yükümlülükleri", body: "İçerik, son müşteri rızaları, kullanılan kanalların politikalarına uyum ve kendi kullanıcı/rol yönetimi müşterinin sorumluluğundadır. Erişim bilgileri gizli tutulmalıdır." },
      { h: "6. Erişilebilirlik", body: "Aylık ortalama %99,5 hedef erişilebilirlik; duyurulan bakım pencereleri ve üçüncü taraf kesintileri hariçtir." },
      { h: "7. Veri işleme", body: "Md. 28 GDPR uyarınca veri işleme sözleşmesi ek olarak geçerlidir ve bu sözleşmenin parçasıdır." },
      { h: "8. Süre ve fesih", body: "Aylık abonelikler ay sonunda, yıllık abonelikler dönem sonuna 30 gün kala feshedilebilir. Sözleşme sonunda veriler talep üzerine dışa aktarılır ve ardından süresinde silinir." },
      { h: "9. Sorumluluk", body: "Kast, ağır ihmal, bedensel zararlar ve ürün sorumluluğu hukuku kapsamında sınırsız sorumluluk; bunun dışında öngörülebilir tipik zararla ve son on iki ayda ödenen ücretlerle sınırlıdır." },
      { h: "10. Son hükümler", body: "Almanya'da yerleşik müşteriler için Alman hukuku ve Berlin mahkemeleri; Birleşik Krallık'ta yerleşik müşteriler için İngiliz hukuku ve Londra mahkemeleri geçerlidir. Değişiklikler en az 30 gün önce bildirilir." },
    ],
    note: "Not: Şablondur — yayına almadan önce hukuki inceleme yaptırın.",
  },
  cookiesInactive: "Şu anda etkin değil – yalnızca rızadan sonra yüklenir.",
  yourSelection: "Seçiminiz",
  noSelection: "Henüz bir seçim kaydedilmedi.",
  withdraw: "Rızayı geri al",
};

const ar: LegalPack = {
  imprint: {
    title: "بيانات الناشر",
    subtitle: "بيانات مقدّم الخدمة وفقاً للمادة 5 من قانون الخدمات الرقمية الألماني.",
    sections: [
      {
        h: "مقدّم الخدمة",
        body: `OmniQora علامة تجارية تابعة لشركة iTechLounge Ltd (المملكة المتحدة) وشركة iTechLounge GmbH (ألمانيا)، وتُقدَّم الخدمة دولياً.\n\n${ADDRESSES}`,
      },
      { h: "التواصل", body: "البريد الإلكتروني: hallo@omniqora.com\nالهاتف: +49 30 000000-0" },
      { h: "الممثلون القانونيون", body: "الإدارة: غير محدد." },
      {
        h: "السجل والضرائب",
        body: "السجل التجاري: محكمة برلين-شارلوتنبورغ، HRB 000000 B\nرقم ضريبة القيمة المضافة: DE000000000\nسجل الشركات (المملكة المتحدة): 00000000",
      },
      { h: "المسؤول عن المحتوى التحريري", body: "غير محدد، العنوان كما هو أعلاه." },
      {
        h: "تسوية النزاعات",
        body: "لسنا ملزمين ولا راغبين في المشاركة في إجراءات تسوية النزاعات أمام هيئات تحكيم المستهلك. تقتصر خدمة OmniQora على الشركات (B2B).",
      },
    ],
    note: "ملاحظة: هذه البيانات نموذجية ويجب استبدالها ببيانات الشركة الفعلية قبل الإطلاق.",
  },
  privacy: {
    title: "سياسة الخصوصية",
    subtitle: "معلومات عن معالجة البيانات الشخصية وفق اللائحة الأوروبية العامة لحماية البيانات ونظيرتها البريطانية.",
    sections: [
      { h: "1. المتحكم بالبيانات", body: "iTechLounge GmbH، برلين، ألمانيا وiTechLounge Ltd (المملكة المتحدة)، hallo@omniqora.com. مسؤول حماية البيانات: dsb@omniqora.com." },
      { h: "2. الأغراض والأسس القانونية", body: "تقديم المنصة وتنفيذ العقد والدعم: المادة 6(1)(ب). التشغيل والأمن وكشف إساءة الاستخدام والتسجيل: المادة 6(1)(و). الرسائل التسويقية بموافقة صريحة فقط: المادة 6(1)(أ)، ويمكن سحبها في أي وقت." },
      { h: "3. فئات البيانات", body: "بيانات الحساب (الاسم، البريد، الدور)، بيانات المحادثات عبر القنوات التي تستخدمها (المعرّف، المحتوى، الطوابع الزمنية، حالة التسليم)، بيانات الحالات وسير العمل، سجلات التدقيق، البيانات التقنية." },
      { h: "4. المعالجة بالنيابة", body: "بالنسبة للعملاء من الشركات تعمل OmniQora كمعالج وفق المادة 28، ويبقى العميل متحكماً في محتوى المحادثات. يتم توفير اتفاقية معالجة بيانات تتضمن قائمة المعالجين الفرعيين." },
      { h: "5. المستلمون والنقل الدولي", body: "يشارك مشغّلو القنوات التي تستخدمها في تسليم الرسائل. تعتمد عمليات النقل إلى دول ثالثة على البنود التعاقدية القياسية وضمانات مناسبة. تعمل الاستضافة وقاعدة البيانات في عدة مراكز بيانات." },
      { h: "6. البيانات الحساسة", body: "لا تُجمع البيانات الصحية أو المالية أو غيرها من الفئات الخاصة عبر مرفقات المحادثات، بل تُستخدم روابط بوابة آمنة. ويُدمج أصحاب المهن الملتزمون بالسرية بضمانات تعاقدية وتقنية." },
      { h: "7. مدة الاحتفاظ", body: "تُحفظ بيانات المحادثات والحالات طوال مدة العلاقة التجارية وبعدها وفق فترات الاحتفاظ القانونية. مدد حذف قابلة للضبط لكل عميل، والافتراضي 24 شهراً لمحتوى المحادثات." },
      { h: "8. ملفات تعريف الارتباط", body: "تُستخدم ملفات ضرورية فقط وتخزين محلي (الجلسة، اختيار اللغة). الملفات الاختيارية بعد موافقتك فقط، ولا يوجد تتبّع بدون موافقة." },
      { h: "9. حقوق أصحاب البيانات", body: "الوصول والتصحيح والمحو والتقييد وقابلية النقل والاعتراض وتقديم شكوى إلى الجهة الرقابية. تُرسل الطلبات إلى dsb@omniqora.com." },
      { h: "10. الأمان", body: "تشفير أثناء النقل وفي التخزين، عزل صارم بين العملاء، صلاحيات حسب الأدوار، سجلات تدقيق غير قابلة للتلاعب، والتحقق من توقيع الأحداث الواردة." },
    ],
    note: "ملاحظة: نموذج — يُرجى مراجعته قانونياً قبل الإطلاق.",
  },
  terms: {
    title: "الشروط والأحكام",
    subtitle: "لعملاء الشركات (B2B).",
    sections: [
      { h: "1. النطاق", body: "تسري هذه الشروط على جميع العقود بين iTechLounge (OmniQora) وعملاء الشركات بشأن استخدام منصة OmniQora (SaaS) والإضافة المدمجة وإصدار الشركاء." },
      { h: "2. موضوع الخدمة", body: "توفّر OmniQora برمجية متعددة المستأجرين لإدارة تواصل العملاء عبر قنوات متعددة، تشمل صندوق الوارد والحالات وسير العمل ودعم الذكاء الاصطناعي بموافقة بشرية والأدوار وسجلات التدقيق." },
      { h: "3. إبرام العقد والتجربة", body: "يُبرم العقد عند تفعيل مساحة العمل. تنتهي الفترات التجريبية تلقائياً ولا تتحول إلى اشتراك مدفوع إلا بطلب صريح." },
      { h: "4. الأسعار والدفع", body: "تُطبق قائمة الأسعار السارية وقت الطلب، وتُفوتر شهرياً أو سنوياً مقدماً. تُفوتر المكونات المرتبطة بالاستخدام لاحقاً. جميع الأسعار صافية بدون ضريبة." },
      { h: "5. التزامات العميل", body: "يتحمل العميل مسؤولية المحتوى وموافقات عملائه والامتثال لسياسات القنوات المستخدمة وإدارة مستخدميه وأدواره. يجب الحفاظ على سرية بيانات الدخول." },
      { h: "6. التوافرية", body: "التوافرية المستهدفة 99.5% كمتوسط شهري، باستثناء نوافذ الصيانة المعلنة وأعطال أطراف ثالثة." },
      { h: "7. معالجة البيانات", body: "تسري إضافةً إلى ذلك اتفاقية معالجة البيانات وفق المادة 28، وتُعد جزءاً من هذا العقد." },
      { h: "8. المدة والإنهاء", body: "يمكن إنهاء الاشتراكات الشهرية في نهاية الشهر، والسنوية بإشعار 30 يوماً قبل نهاية المدة. عند الإنهاء تُصدَّر البيانات عند الطلب ثم تُحذف في المواعيد المتفق عليها." },
      { h: "9. المسؤولية", body: "مسؤولية غير محدودة في حالات العمد والإهمال الجسيم والأضرار الجسدية ووفق قانون مسؤولية المنتج؛ وفيما عدا ذلك تقتصر على الضرر المتوقع المعتاد وبحد أقصى الرسوم المدفوعة خلال اثني عشر شهراً." },
      { h: "10. أحكام ختامية", body: "يسري القانون الألماني ومحاكم برلين على العملاء في ألمانيا، والقانون الإنجليزي ومحاكم لندن على العملاء في المملكة المتحدة. يتم الإخطار بالتعديلات قبل 30 يوماً على الأقل." },
    ],
    note: "ملاحظة: نموذج — يُرجى مراجعته قانونياً قبل الإطلاق.",
  },
  cookiesInactive: "غير مفعّل حالياً – يُحمَّل بعد الموافقة فقط.",
  yourSelection: "اختيارك",
  noSelection: "لم يتم حفظ أي اختيار بعد.",
  withdraw: "سحب الموافقة",
};

const uk: LegalPack = {
  imprint: {
    title: "Вихідні дані",
    subtitle: "Інформація про постачальника згідно з § 5 DDG (Німеччина).",
    sections: [
      {
        h: "Постачальник",
        body: `OmniQora — торгова марка компаній iTechLounge Ltd (Велика Британія) та iTechLounge GmbH (Німеччина). Сервіс надається міжнародно.\n\n${ADDRESSES}`,
      },
      { h: "Контакти", body: "Email: hallo@omniqora.com\nТелефон: +49 30 000000-0" },
      { h: "Уповноважені представники", body: "Керівництво: не вказано." },
      {
        h: "Реєстр і податки",
        body: "Торговий реєстр: Amtsgericht Berlin-Charlottenburg, HRB 000000 B\nПДВ-номер (§ 27a UStG): DE000000000\nCompanies House (Велика Британія): 00000000",
      },
      { h: "Відповідальний за редакційний контент", body: "Не вказано, адреса як вище." },
      {
        h: "Вирішення спорів",
        body: "Ми не зобов'язані й не готові брати участь у процедурах вирішення споживчих спорів. OmniQora орієнтована виключно на бізнес-клієнтів (B2B).",
      },
    ],
    note: "Примітка: ці дані є прикладом і мають бути замінені реальними даними компанії перед запуском.",
  },
  privacy: {
    title: "Політика конфіденційності",
    subtitle: "Інформація про обробку персональних даних згідно з GDPR та UK GDPR.",
    sections: [
      { h: "1. Контролер", body: "iTechLounge GmbH, Берлін, Німеччина та iTechLounge Ltd (Велика Британія), hallo@omniqora.com. Відповідальний за захист даних: dsb@omniqora.com." },
      { h: "2. Цілі та правові підстави", body: "Надання платформи, виконання договору та підтримка: ст. 6(1)(b) GDPR. Експлуатація, безпека, виявлення зловживань і журналювання: ст. 6(1)(f) GDPR. Маркетингові повідомлення лише за явною згодою: ст. 6(1)(a) GDPR, згоду можна відкликати будь-коли." },
      { h: "3. Категорії даних", body: "Дані облікового запису (ім'я, email, роль), дані спілкування з клієнтами в каналах, які ви використовуєте (ідентифікатор, зміст, час, статус доставки), дані справ і робочих процесів, журнали та аудит, технічні метадані." },
      { h: "4. Обробка за дорученням", body: "Для бізнес-клієнтів OmniQora є обробником згідно зі ст. 28 GDPR; контролером змісту розмов залишається клієнт. Надається договір про обробку даних із переліком субобробників." },
      { h: "5. Одержувачі та міжнародна передача", body: "До доставки повідомлень залучаються оператори каналів, які ви використовуєте. Передача до третіх країн ґрунтується на стандартних договірних положеннях і належних гарантіях. Хостинг і база даних працюють у кількох центрах обробки даних." },
      { h: "6. Чутливі дані", body: "Медичні, фінансові та інші дані особливих категорій не збираються через вкладення в чатах — натомість використовуються захищені посилання на портал. Для осіб, зобов'язаних зберігати професійну таємницю, діють договірні й технічні гарантії." },
      { h: "7. Строки зберігання", body: "Дані розмов і справ зберігаються протягом ділових відносин та після них згідно із законодавчими строками. Налаштовувані строки видалення для кожного орендаря, за замовчуванням 24 місяці для вмісту чатів." },
      { h: "8. Файли cookie та локальне сховище", body: "Лише необхідні cookie та записи локального сховища (сесія, вибір мови). Необов'язкові cookie — лише після вашої згоди. Жодного відстеження без згоди." },
      { h: "9. Права суб'єктів даних", body: "Доступ, виправлення, видалення, обмеження, перенесення, заперечення та скарга до наглядового органу. Запити надсилайте на dsb@omniqora.com." },
      { h: "10. Безпека", body: "Шифрування під час передавання та зберігання, сувора ізоляція орендарів, рольові дозволи, захищені журнали аудиту та перевірка підписів вхідних подій." },
    ],
    note: "Примітка: шаблон — перед запуском отримайте юридичну перевірку.",
  },
  terms: {
    title: "Умови використання",
    subtitle: "Для бізнес-клієнтів (B2B).",
    sections: [
      { h: "1. Сфера дії", body: "Ці умови застосовуються до всіх договорів між iTechLounge (OmniQora) і бізнес-клієнтами щодо використання платформи OmniQora (SaaS), вбудованого додатка та партнерської редакції." },
      { h: "2. Предмет послуг", body: "OmniQora надає багатоорендне програмне забезпечення для керування комунікацією з клієнтами в кількох каналах: спільна скринька, справи, робочі процеси, ШІ-підтримка з людським підтвердженням, ролі та журнали аудиту." },
      { h: "3. Укладення договору та пробний період", body: "Договір укладається з активацією робочого простору. Пробні періоди завершуються автоматично й переходять у платну підписку лише за явним замовленням." },
      { h: "4. Ціни та оплата", body: "Діє прайс-лист, чинний на момент замовлення; оплата щомісяця або щороку авансом. Компоненти, що залежать від використання, виставляються за фактом. Усі ціни без ПДВ." },
      { h: "5. Обов'язки клієнта", body: "Клієнт відповідає за контент, згоди кінцевих клієнтів, дотримання політик використовуваних каналів і керування своїми користувачами та ролями. Дані доступу мають зберігатися конфіденційно." },
      { h: "6. Доступність", body: "Цільова доступність 99,5 % у середньому за місяць, крім оголошених технічних робіт і збоїв у сторонніх постачальників." },
      { h: "7. Обробка даних", body: "Додатково діє договір про обробку даних згідно зі ст. 28 GDPR, який є частиною цього договору." },
      { h: "8. Строк і розірвання", body: "Місячні підписки можна скасувати наприкінці місяця, річні — за 30 днів до кінця строку. Після завершення договору дані експортуються на запит і потім видаляються у визначені строки." },
      { h: "9. Відповідальність", body: "Необмежена відповідальність за умисел, грубу необережність, шкоду життю та здоров'ю і згідно із законом про відповідальність за продукцію; в іншому — обмежена типовою передбачуваною шкодою, максимум сумою платежів за дванадцять місяців." },
      { h: "10. Прикінцеві положення", body: "Для клієнтів із Німеччини діє німецьке право та суди Берліна; для клієнтів із Великої Британії — англійське право та суди Лондона. Про зміни повідомляється щонайменше за 30 днів." },
    ],
    note: "Примітка: шаблон — перед запуском отримайте юридичну перевірку.",
  },
  cookiesInactive: "Наразі не активно – завантажується лише після згоди.",
  yourSelection: "Ваш вибір",
  noSelection: "Вибір ще не збережено.",
  withdraw: "Відкликати згоду",
};

export const legalContent: Record<PromoLang, LegalPack> = { de, en, tr, ar, uk };
