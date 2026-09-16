export function receptionConnections(aiConfigured:boolean,receipts:Record<string,any>){return {
 liveCalls:{state:'coming_soon',label:'Live phone answering',detail:'No phone provider, number route or voice-session handler is connected in this pilot.'},
 ai:{state:aiConfigured?'configured':'not_configured',label:'AI service',detail:aiConfigured?'A server key is configured. This does not verify model access or live call handling.':'No OpenAI key is configured for this pilot.'},
 orders:{state:receipts.orders?'receipt_recorded':'awaiting_receipt',label:'Order system',detail:receipts.orders?'An accepted order receipt has been recorded from the authorised source adapter.':'No accepted order receipt has been recorded.',lastAt:receipts.last_order||null},
 bookings:{state:receipts.bookings?'receipt_recorded':'awaiting_receipt',label:'Booking system',detail:receipts.bookings?'A reservation receipt has been recorded from the authorised source adapter.':'No successful reservation receipt has been recorded.',lastAt:receipts.last_booking||null},
 kds:{state:receipts.kds?'receipt_recorded':'awaiting_receipt',label:'Kitchen display',detail:receipts.kds?'A KDS acknowledgment has been recorded. This does not mean the meal was fulfilled.':'No KDS acknowledgment has been recorded.',lastAt:receipts.last_kds||null}
};}
