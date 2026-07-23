export type CaseStatus = "new" | "qualifying" | "quoted" | "scheduled" | "in_progress" | "waiting_customer" | "waiting_partner" | "completed" | "closed";
export type Priority = "low" | "normal" | "high" | "urgent";
export type Channel = "whatsapp" | "email" | "portal";

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  city: string;
  consent: "granted" | "pending" | "withdrawn";
  tags: string[];
  lastSeen: string;
}

export interface Message {
  id: string;
  from: "customer" | "agent" | "ai" | "system";
  text: string;
  time: string;
  attachment?: { kind: "portal_link" | "document" | "quote" | "payment"; label: string };
}

export interface Conversation {
  id: string;
  contactId: string;
  channel: Channel;
  purpose: string;
  status: CaseStatus;
  priority: Priority;
  assignee?: string;
  unread: number;
  slaMinutes: number;
  updatedAt: string;
  preview: string;
  aiOwned: boolean;
  messages: Message[];
}

export const contacts: Contact[] = [
  { id: "c1", name: "Anna Weber", phone: "+49 151 2233 4455", email: "anna.weber@example.de", city: "München", consent: "granted", tags: ["Neukundin", "Beauty"], lastSeen: "2m" },
  { id: "c2", name: "Markus Klein", phone: "+49 172 8899 1122", city: "Berlin", consent: "granted", tags: ["Bestandskunde", "Handwerk"], lastSeen: "18m" },
  { id: "c3", name: "Dr. Sophie Braun", phone: "+49 176 4433 2211", email: "s.braun@praxis-br.de", city: "Hamburg", consent: "granted", tags: ["Praxis", "Follow-up"], lastSeen: "1h" },
  { id: "c4", name: "Yusuf Demir", phone: "+49 152 5566 7788", city: "Köln", consent: "pending", tags: ["Anfrage"], lastSeen: "3h" },
  { id: "c5", name: "Familie Schneider", phone: "+49 179 9911 2233", city: "Stuttgart", consent: "granted", tags: ["Immobilie", "Besichtigung"], lastSeen: "6h" },
  { id: "c6", name: "Elena Rossi", phone: "+49 163 7788 9900", email: "elena@rossi-cafe.de", city: "Frankfurt", consent: "granted", tags: ["Gastronomie"], lastSeen: "1d" },
  { id: "c7", name: "Jonas Fischer", phone: "+49 157 1122 3344", city: "Leipzig", consent: "withdrawn", tags: ["Abgemeldet"], lastSeen: "2d" },
];

export const conversations: Conversation[] = [
  {
    id: "cv1", contactId: "c1", channel: "whatsapp", purpose: "Terminanfrage · Beauty",
    status: "qualifying", priority: "high", assignee: "Lea M.", unread: 2, slaMinutes: 6,
    updatedAt: "2m", preview: "Hätten Sie am Donnerstag noch etwas frei?",
    aiOwned: false,
    messages: [
      { id: "m1", from: "customer", text: "Guten Tag, ich hätte gern einen Termin für eine Hautanalyse.", time: "10:12" },
      { id: "m2", from: "ai", text: "Hallo Anna 👋 Gern. Darf ich Sie kurz nach Behandlungsart und Wunschzeit fragen?", time: "10:12" },
      { id: "m3", from: "customer", text: "Hautanalyse + Reinigung. Donnerstag Nachmittag?", time: "10:14" },
      { id: "m4", from: "agent", text: "Perfekt — 15:30 oder 16:15 wäre frei. Welche Zeit passt Ihnen?", time: "10:15" },
      { id: "m5", from: "customer", text: "Hätten Sie am Donnerstag noch etwas frei?", time: "10:22" },
    ],
  },
  {
    id: "cv2", contactId: "c2", channel: "whatsapp", purpose: "Angebot · Sanitär-Notfall",
    status: "quoted", priority: "urgent", assignee: "Tim R.", unread: 0, slaMinutes: 22,
    updatedAt: "18m", preview: "Kostenvoranschlag als PDF gesendet.",
    aiOwned: false,
    messages: [
      { id: "m1", from: "customer", text: "Wasserschaden Küche, kommen Sie heute noch?", time: "08:41" },
      { id: "m2", from: "agent", text: "Wir schicken Ihnen sofort einen Notdienst. Bitte Fotos über diesen sicheren Link:", time: "08:44", attachment: { kind: "portal_link", label: "Sicherer Upload · gültig 30 Min." } },
      { id: "m3", from: "customer", text: "Fotos hochgeladen.", time: "08:52" },
      { id: "m4", from: "agent", text: "Danke — hier ist Ihr Kostenvoranschlag:", time: "09:10", attachment: { kind: "quote", label: "Angebot #A-2481 · €340,00" } },
    ],
  },
  {
    id: "cv3", contactId: "c3", channel: "whatsapp", purpose: "Rezept-Nachbestellung",
    status: "waiting_customer", priority: "normal", assignee: "AI · Aida", unread: 0, slaMinutes: 0,
    updatedAt: "1h", preview: "Bitte bestätigen Sie Ihre Versicherungsdaten.",
    aiOwned: true,
    messages: [
      { id: "m1", from: "customer", text: "Ich brauche mein Rezept nachbestellt.", time: "09:02" },
      { id: "m2", from: "ai", text: "Selbstverständlich, Frau Dr. Braun. Für die Freigabe durch das Team benötigen wir kurz eine Bestätigung.", time: "09:02", attachment: { kind: "portal_link", label: "Sichere Bestätigung öffnen" } },
    ],
  },
  {
    id: "cv4", contactId: "c4", channel: "whatsapp", purpose: "Erstanfrage · Beratung",
    status: "new", priority: "normal", unread: 3, slaMinutes: 2,
    updatedAt: "3h", preview: "Guten Tag, ich habe eine Frage zu Ihrem Angebot.",
    aiOwned: true,
    messages: [
      { id: "m1", from: "customer", text: "Guten Tag, ich habe eine Frage zu Ihrem Angebot.", time: "07:18" },
    ],
  },
  {
    id: "cv5", contactId: "c5", channel: "whatsapp", purpose: "Besichtigungstermin",
    status: "scheduled", priority: "normal", assignee: "Jonas P.", unread: 0, slaMinutes: 0,
    updatedAt: "6h", preview: "Termin bestätigt: Fr. 26.07. um 14:00.",
    aiOwned: false,
    messages: [
      { id: "m1", from: "customer", text: "Wir würden die Wohnung gern besichtigen.", time: "Mo 14:20" },
      { id: "m2", from: "agent", text: "Sehr gerne — hier stehen 3 Termine zur Auswahl:", time: "Mo 14:32" },
      { id: "m3", from: "customer", text: "Freitag 14 Uhr, danke.", time: "Mo 15:01" },
      { id: "m4", from: "system", text: "Termin bestätigt: Fr. 26.07. um 14:00.", time: "Mo 15:01" },
    ],
  },
  {
    id: "cv6", contactId: "c6", channel: "whatsapp", purpose: "Reservierung · Team-Event",
    status: "in_progress", priority: "normal", assignee: "Lea M.", unread: 1, slaMinutes: 12,
    updatedAt: "1d", preview: "Wie viele Personen dürfen es sein?",
    aiOwned: false,
    messages: [
      { id: "m1", from: "customer", text: "Wir würden gern für 22 Personen reservieren.", time: "Di 17:05" },
      { id: "m2", from: "agent", text: "Danke! Ich prüfe kurz die Verfügbarkeit.", time: "Di 17:07" },
    ],
  },
];

export interface WorkflowStep {
  id: string; name: string; owner: "AI" | "Staff" | "Manager" | "Third-party" | "Customer";
}
export interface Workflow {
  id: string; name: string; vertical: string; status: "live" | "draft" | "review";
  runs30d: number; conversion: number; avgHandleMinutes: number;
  steps: WorkflowStep[];
}

export const workflows: Workflow[] = [
  {
    id: "wf1", name: "Terminbuchung · Beauty & Wellness", vertical: "LoungeBeauty",
    status: "live", runs30d: 342, conversion: 71, avgHandleMinutes: 3.4,
    steps: [
      { id: "s1", name: "Erstkontakt & Absicht", owner: "AI" },
      { id: "s2", name: "Behandlung wählen", owner: "AI" },
      { id: "s3", name: "Freien Slot vorschlagen", owner: "AI" },
      { id: "s4", name: "Bestätigung durch Team", owner: "Staff" },
      { id: "s5", name: "Erinnerung 24h", owner: "AI" },
      { id: "s6", name: "Nachbereitung & Bewertung", owner: "AI" },
    ],
  },
  {
    id: "wf2", name: "Notdienst · Handwerk", vertical: "LoungeTrades",
    status: "live", runs30d: 128, conversion: 58, avgHandleMinutes: 14.8,
    steps: [
      { id: "s1", name: "Notfall triagieren", owner: "AI" },
      { id: "s2", name: "Sicherer Foto-Upload", owner: "Customer" },
      { id: "s3", name: "Techniker disponieren", owner: "Manager" },
      { id: "s4", name: "Kostenvoranschlag", owner: "Staff" },
      { id: "s5", name: "Freigabe & Anfahrt", owner: "Customer" },
      { id: "s6", name: "Rechnung & Zahlung", owner: "Staff" },
    ],
  },
  {
    id: "wf3", name: "Rezept-Nachbestellung", vertical: "LoungeCare",
    status: "review", runs30d: 76, conversion: 92, avgHandleMinutes: 2.1,
    steps: [
      { id: "s1", name: "Identitäts- & Versichertenprüfung", owner: "AI" },
      { id: "s2", name: "Ärztliche Freigabe", owner: "Manager" },
      { id: "s3", name: "Apotheken-Übergabe", owner: "Third-party" },
      { id: "s4", name: "Zustellungsstatus", owner: "AI" },
    ],
  },
  {
    id: "wf4", name: "Besichtigung · Immobilien", vertical: "LoungeEstate",
    status: "live", runs30d: 54, conversion: 44, avgHandleMinutes: 5.7,
    steps: [
      { id: "s1", name: "Interessentenprofil", owner: "AI" },
      { id: "s2", name: "Bonitätsformular", owner: "Customer" },
      { id: "s3", name: "Terminvorschläge", owner: "AI" },
      { id: "s4", name: "Objektübergabe & Feedback", owner: "Staff" },
    ],
  },
  {
    id: "wf5", name: "Reservierungen · Gastronomie", vertical: "LoungeHosp",
    status: "draft", runs30d: 0, conversion: 0, avgHandleMinutes: 0,
    steps: [
      { id: "s1", name: "Anfrage aufnehmen", owner: "AI" },
      { id: "s2", name: "Verfügbarkeit prüfen", owner: "Staff" },
      { id: "s3", name: "Deposit einziehen", owner: "AI" },
    ],
  },
];

export const kpis = {
  activeCases: 84,
  todayResolved: 27,
  avgFirstResponseMin: 1.8,
  automationRate: 62,
  csat: 4.7,
  slaBreaches7d: 3,
};

export const inboxVolume = [
  { day: "Mo", ai: 62, staff: 44 }, { day: "Di", ai: 71, staff: 39 },
  { day: "Mi", ai: 58, staff: 41 }, { day: "Do", ai: 80, staff: 52 },
  { day: "Fr", ai: 74, staff: 48 }, { day: "Sa", ai: 33, staff: 12 },
  { day: "So", ai: 21, staff: 8 },
];

export const partners = [
  { id: "p1", name: "Notdienst24 GmbH", type: "Handwerk-Netzwerk", tenants: 14, activeAssignments: 6, sla: 96 },
  { id: "p2", name: "Apotheke am Markt", type: "Apotheken-Partner", tenants: 1, activeAssignments: 3, sla: 100 },
  { id: "p3", name: "Weber Immobilien-Service", type: "Objektbetreuung", tenants: 2, activeAssignments: 1, sla: 92 },
  { id: "p4", name: "Rossi Catering", type: "Gastro-Zulieferer", tenants: 1, activeAssignments: 0, sla: 88 },
];

export const campaigns = [
  { id: "cp1", name: "Frühjahrs-Aktion Beauty", template: "promo_spring_de", status: "sent", sent: 1240, delivered: 1218, read: 987, replies: 214, cost: "€38,64" },
  { id: "cp2", name: "Wartungserinnerung Handwerk", template: "reminder_maintenance", status: "scheduled", sent: 0, delivered: 0, read: 0, replies: 0, cost: "€0,00" },
  { id: "cp3", name: "Reaktivierung inaktive Kunden", template: "reactivation_de", status: "draft", sent: 0, delivered: 0, read: 0, replies: 0, cost: "€0,00" },
];

export const roleMatrix = [
  { role: "Owner", inbox: "Alles", cases: "Alles", finance: "Alles", workflows: "Alles", admin: "Alles" },
  { role: "Admin", inbox: "Alles", cases: "Alles", finance: "Ansehen", workflows: "Alles", admin: "Konfig" },
  { role: "Manager", inbox: "Team", cases: "Team", finance: "Team", workflows: "Ansehen", admin: "—" },
  { role: "Agent", inbox: "Zugewiesen", cases: "Zugewiesen", finance: "—", workflows: "Ausführen", admin: "—" },
  { role: "Finance", inbox: "—", cases: "Ansehen", finance: "Alles", workflows: "—", admin: "—" },
  { role: "Compliance", inbox: "Audit", cases: "Audit", finance: "Audit", workflows: "Audit", admin: "Audit" },
  { role: "Partner", inbox: "Auftrag", cases: "Auftrag", finance: "Auszahlung", workflows: "—", admin: "—" },
];
