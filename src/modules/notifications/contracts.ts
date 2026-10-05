export type NotificationPriority="low"|"normal"|"high"|"urgent";

export type Notification={
  id:string;tenantId:string;userId:string;tenantProductId?:string|null;
  type:string;title:string;body?:string|null;priority:NotificationPriority;
  entityType?:string|null;entityId?:string|null;actionUrl?:string|null;
  readAt?:string|null;dismissedAt?:string|null;expiresAt?:string|null;
  metadata:Record<string,unknown>;createdAt:string;
};

export type NotificationPreference={
  tenantId:string;userId:string;notificationType:string;
  inApp:boolean;email:boolean;sms:boolean;whatsapp:boolean;push:boolean;
  quietHours?:{start:string;end:string;timezone:string}|null;
};

export const NOTIFICATION_FEATURES={
  inbox:"notifications.inbox",preferences:"notifications.preferences",
  inApp:"notifications.in_app",email:"notifications.email",sms:"notifications.sms",
  whatsapp:"notifications.whatsapp",push:"notifications.push",digest:"notifications.digest",
} as const;

export const NOTIFICATION_EVENT_TYPES={
  created:"notification.created",read:"notification.read",dismissed:"notification.dismissed",
  deliveryRequested:"notification.delivery.requested",delivered:"notification.delivered",
} as const;
