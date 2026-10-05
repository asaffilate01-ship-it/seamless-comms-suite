export type BookingResourceKind="person"|"room"|"table"|"vehicle"|"equipment"|"capacity_pool"|"virtual";

export type BookingService={
  id:string;tenantId:string;tenantProductId:string;externalRef?:string|null;
  name:string;durationMinutes:number;bufferBeforeMinutes:number;bufferAfterMinutes:number;
  capacity:number;currency?:string|null;priceMinor?:number|null;active:boolean;metadata:Record<string,unknown>;
};

export type BookingResource={
  id:string;tenantId:string;tenantProductId:string;locationId?:string|null;
  externalRef?:string|null;name:string;kind:BookingResourceKind;capacity:number;
  skills:string[];active:boolean;metadata:Record<string,unknown>;
};

export type AvailabilityRule={
  id:string;tenantId:string;resourceId:string;
  weekday:number;startTime:string;endTime:string;timezone:string;
  validFrom?:string|null;validUntil?:string|null;capacity?:number|null;
};

export type Booking={
  id:string;tenantId:string;tenantProductId:string;serviceId:string;
  resourceId?:string|null;locationId?:string|null;customerRef?:string|null;
  startsAt:string;endsAt:string;timezone:string;partySize:number;
  status:"hold"|"confirmed"|"checked_in"|"completed"|"cancelled"|"no_show"|"expired";
  channel:"web"|"app"|"whatsapp"|"phone"|"staff"|"marketplace"|"api";
  sourceRef?:string|null;idempotencyKey:string;metadata:Record<string,unknown>;
};

export const BOOKING_FEATURES={
  services:"bookings.services",resources:"bookings.resources",availability:"bookings.availability",
  holds:"bookings.holds",appointments:"bookings.appointments",capacity:"bookings.capacity",
  reminders:"bookings.reminders",waitlist:"bookings.waitlist",
} as const;

export const BOOKING_EVENT_TYPES={
  holdCreated:"booking.hold.created",confirmed:"booking.confirmed",cancelled:"booking.cancelled",
  checkedIn:"booking.checked_in",completed:"booking.completed",noShow:"booking.no_show",
} as const;
