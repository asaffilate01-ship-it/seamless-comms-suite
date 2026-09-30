export type IdentityMethod =
  | "password"
  | "magic_link"
  | "sms_otp"
  | "whatsapp_otp"
  | "google"
  | "apple"
  | "microsoft"
  | "passkey";

export type TenantIdentityPolicy={
  tenantId:string;
  tenantProductId?:string|null;
  enabledMethods:IdentityMethod[];
  primaryMethod:IdentityMethod;
  requireMfa:boolean;
  allowedMfaMethods:Array<"totp"|"sms_otp"|"whatsapp_otp"|"passkey">;
  sessionMinutes:number;
  rememberDeviceDays:number;
  allowedEmailDomains:string[];
  blockDisposableEmail:boolean;
  inviteOnly:boolean;
  config:Record<string,unknown>;
};

export type UserIdentityBinding={
  userId:string;
  tenantId:string;
  method:IdentityMethod;
  provider:string;
  providerSubjectRef?:string|null;
  verifiedAt?:string|null;
  lastUsedAt?:string|null;
  metadata:Record<string,unknown>;
};

export const IDENTITY_FEATURES={
  password:"identity.password",
  magicLink:"identity.magic_link",
  smsOtp:"identity.sms_otp",
  whatsappOtp:"identity.whatsapp_otp",
  google:"identity.google",
  apple:"identity.apple",
  microsoft:"identity.microsoft",
  passkeys:"identity.passkeys",
  mfa:"identity.mfa",
  sso:"identity.sso",
} as const;

export const IDENTITY_EVENT_TYPES={
  methodEnabled:"identity.method.enabled",
  signInSucceeded:"identity.sign_in.succeeded",
  signInFailed:"identity.sign_in.failed",
  mfaChallenged:"identity.mfa.challenged",
  passkeyRegistered:"identity.passkey.registered",
  invitationAccepted:"identity.invitation.accepted",
  accessRevoked:"identity.access.revoked",
} as const;
