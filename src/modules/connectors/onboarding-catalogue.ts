/**
 * Operator-facing external setup directory.
 * Listing a provider is NOT evidence of a deployed adapter, configured secrets,
 * active entitlement, a successful API probe or a production connection.
 */
export type ConnectorSetup = {
  key: string;
  family: "AI and agents" | "Communications" | "Payments" | "Geo and delivery" | "Business data" | "Media and knowledge" | "Infrastructure" | "Travel suppliers";
  name: string;
  url: string;
  priority: "pilot" | "next" | "optional";
  required: string;
};

export const connectorSetupCatalogue: readonly ConnectorSetup[] = [
  {key:"supabase",family:"Infrastructure",name:"Supabase",url:"https://supabase.com/dashboard",priority:"pilot",required:"Project environment, public URL/key, service-role key and migration access"},
  {key:"github",family:"Infrastructure",name:"GitHub Actions",url:"https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions",priority:"pilot",required:"Production environment, worker secrets and controlled deployment permissions"},
  {key:"lovable",family:"Infrastructure",name:"Lovable",url:"https://lovable.dev/",priority:"pilot",required:"Project sync, server secrets, deployed app origin and publication"},
  {key:"openai",family:"AI and agents",name:"OpenAI API",url:"https://platform.openai.com/api-keys",priority:"pilot",required:"API project/key, model, budgets and scoped tenant agent policies"},
  {key:"anthropic",family:"AI and agents",name:"Claude API",url:"https://platform.claude.com/docs/en/get-started",priority:"next",required:"Claude Console key and approved model"},
  {key:"gemini",family:"AI and agents",name:"Google Gemini",url:"https://ai.google.dev/gemini-api/docs/api-key",priority:"next",required:"Gemini API key, Cloud project and model"},
  {key:"azure-openai",family:"AI and agents",name:"Microsoft Foundry / Azure OpenAI",url:"https://learn.microsoft.com/en-us/azure/cognitive-services/openai/how-to/create-resource/",priority:"optional",required:"Azure subscription, resource endpoint, deployment and scoped credential"},
  {key:"bedrock",family:"AI and agents",name:"Amazon Bedrock",url:"https://docs.aws.amazon.com/bedrock/latest/userguide/getting-started.html",priority:"optional",required:"IAM role, AWS region and permitted foundation model"},
  {key:"ollama",family:"AI and agents",name:"Ollama (private models)",url:"https://docs.ollama.com/",priority:"optional",required:"Privately hosted model service and network-isolated endpoint"},
  {key:"twilio",family:"Communications",name:"Twilio Console",url:"https://console.twilio.com/",priority:"pilot",required:"Account SID, API key/secret, server-only auth token and voice/SMS numbers"},
  {key:"twilio-whatsapp",family:"Communications",name:"Twilio WhatsApp",url:"https://www.twilio.com/docs/whatsapp/self-sign-up",priority:"pilot",required:"Meta Business Portfolio, approved WABA/sender, Messaging Service and webhook"},
  {key:"twilio-proxy",family:"Communications",name:"Twilio Proxy / masking",url:"https://www.twilio.com/docs/proxy",priority:"next",required:"Voice-capable number pool, masked session controls and consent policy (public beta)"},
  {key:"twilio-voice",family:"Communications",name:"Twilio Programmable Voice",url:"https://www.twilio.com/docs/voice/twiml/dial",priority:"pilot",required:"Voice number, signed inbound callback, approved caller ID and call forwarding"},
  {key:"meta-cloud",family:"Communications",name:"Meta WhatsApp Cloud API alternative",url:"https://developers.facebook.com/docs/whatsapp/cloud-api/",priority:"optional",required:"Meta app, WABA, permanent token, phone ID and app secret"},
  {key:"sendgrid",family:"Communications",name:"Twilio SendGrid",url:"https://www.twilio.com/docs/sendgrid",priority:"next",required:"Email API key, verified sending domain, SPF/DKIM and bounce webhooks"},
  {key:"fcm",family:"Communications",name:"Firebase Cloud Messaging",url:"https://firebase.google.com/docs/cloud-messaging",priority:"next",required:"Firebase project, server identity and app push credentials"},
  {key:"adyen",family:"Payments",name:"Adyen",url:"https://docs.adyen.com/development-resources/api-credentials",priority:"pilot",required:"Merchant account, test API key, webhooks and platform split-payout approval"},
  {key:"stripe",family:"Payments",name:"Stripe",url:"https://docs.stripe.com/keys",priority:"next",required:"Separate test/live keys, webhook signing secrets, Connect onboarding if applicable"},
  {key:"sumup",family:"Payments",name:"SumUp",url:"https://developer.sumup.com/tools/authorization",priority:"next",required:"Merchant API credentials or OAuth; affiliate key for supported terminals"},
  {key:"routes",family:"Geo and delivery",name:"Google Routes API",url:"https://developers.google.com/maps/documentation/routes/get-api-key",priority:"pilot",required:"Google Cloud project, server-restricted route key, quotas and billing"},
  {key:"geocode",family:"Geo and delivery",name:"Google Geocoding API",url:"https://developers.google.com/maps/documentation/geocoding/",priority:"pilot",required:"Geocoding-enabled Cloud project, server-restricted key and quotas"},
  {key:"uber-direct",family:"Geo and delivery",name:"Uber Direct",url:"https://developer.uber.com/docs/deliveries/get-started",priority:"pilot",required:"Customer ID, OAuth client ID/secret, test credentials, production approval"},
  {key:"jet-go",family:"Geo and delivery",name:"Just Eat Go",url:"https://developers.just-eat.com/documentation/jet-go/getting-started",priority:"pilot",required:"Partner approval, test credentials, certification and store-specific credentials"},
  {key:"deliveroo-express",family:"Geo and delivery",name:"Deliveroo Express",url:"https://developers.deliveroo.com/",priority:"pilot",required:"Developer portal sandbox, Express/Signature partner access, approved contract and production credentials"},
  {key:"stuart",family:"Geo and delivery",name:"Stuart",url:"https://api-docs.stuart.com/",priority:"next",required:"Carrier account, sandbox credentials, service area and webhook agreements"},
  {key:"graph",family:"Business data",name:"Microsoft Graph",url:"https://learn.microsoft.com/en-us/graph/auth/auth-concepts",priority:"next",required:"Entra app registration, tenant consent and least-privilege Graph scopes"},
  {key:"hmrc",family:"Business data",name:"HMRC Developer Hub",url:"https://developer.service.hmrc.gov.uk/api-documentation",priority:"next",required:"Registered app, sandbox, OAuth scopes, approvals and production credentials"},
  {key:"companies-house",family:"Business data",name:"Companies House API",url:"https://developer.company-information.service.gov.uk/",priority:"next",required:"Developer application, API key and permitted submission workflow"},
  {key:"powerbi",family:"Business data",name:"Microsoft Power BI REST API",url:"https://learn.microsoft.com/en-us/rest/api/power-bi/",priority:"optional",required:"Entra service principal, workspace permissions and delegated read-only pilot"},
  {key:"neo4j",family:"Media and knowledge",name:"Neo4j Aura",url:"https://neo4j.com/docs/aura/",priority:"next",required:"Aura database, URI, credentials and indexed retrieval tests"},
  {key:"elevenlabs",family:"Media and knowledge",name:"ElevenLabs Voice",url:"https://elevenlabs.io/docs",priority:"next",required:"API key, voice permissions, consent and audio retention"},
  {key:"fal",family:"Media and knowledge",name:"fal.ai Media",url:"https://docs.fal.ai/",priority:"optional",required:"API key, approved model, callback and storage"},
  {key:"runway",family:"Media and knowledge",name:"Runway API",url:"https://docs.dev.runwayml.com/",priority:"optional",required:"API credentials, approved generation use and usage limits"},
  {key:"docusign",family:"Business data",name:"DocuSign eSignature",url:"https://developers.docusign.com/docs/esign-rest-api/",priority:"optional",required:"Developer account, OAuth app, redirect URI and signer consent"},
  {key:"travel-travelpayouts",family:"Travel suppliers",name:"Travelpayouts",url:"https://support.travelpayouts.com/",priority:"pilot",required:"Travelpayouts partner account, campaign/marker ID, approved API or affiliate access, server-side token and attribution settings"},
  {key:"travel-skyscanner",family:"Travel suppliers",name:"Skyscanner Travel APIs",url:"https://developers.skyscanner.net/docs/intro",priority:"next",required:"Approved Skyscanner partner/API agreement, API key, use-case and traffic approval, allowed markets and rate quotas"},
  {key:"travel-duffel",family:"Travel suppliers",name:"Duffel Flights API",url:"https://duffel.com/docs/api",priority:"next",required:"Duffel business account, test/live access token, commercial onboarding, approved order flow and webhooks"},
  {key:"travel-amadeus",family:"Travel suppliers",name:"Amadeus for Developers",url:"https://developers.amadeus.com/",priority:"next",required:"Amadeus application credentials, selected APIs, test/live approval and permitted booking role"},
  {key:"travel-travelfusion",family:"Travel suppliers",name:"Travelfusion / tfNDC",url:"https://www.travelfusion.com/",priority:"optional",required:"Supplier/aggregator contract, commercial approval, authentication and environment-specific integration documents"},
  {key:"travel-booking-demand",family:"Travel suppliers",name:"Booking.com Demand API",url:"https://developers.booking.com/demand/docs",priority:"next",required:"Demand API partner approval, affiliate ID, API token, selected content/redirect/booking flow and sandbox"},
  {key:"travel-hotelbeds",family:"Travel suppliers",name:"Hotelbeds API",url:"https://developer.hotelbeds.com/",priority:"optional",required:"Hotelbeds distribution contract, approved API account, API key/secret, sandbox and permitted markets"},
  {key:"travel-ratehawk",family:"Travel suppliers",name:"RateHawk API",url:"https://docs.ratehawk.com/",priority:"optional",required:"RateHawk trade partner/API agreement, credentials, test environment, billing and booking terms"},
  {key:"travel-viator",family:"Travel suppliers",name:"Viator Partnerships",url:"https://partnerresources.viator.com/",priority:"optional",required:"Viator travel partner account, permitted affiliate/API access, tracking and approved content use"},
  {key:"travel-getyourguide",family:"Travel suppliers",name:"GetYourGuide Partners",url:"https://partner.getyourguide.com/",priority:"optional",required:"GetYourGuide partner account, affiliate/API approval, commercial tracking and brand asset permissions"},
  {key:"travel-discovercars",family:"Travel suppliers",name:"Discover Cars Affiliate",url:"https://www.discovercars.com/",priority:"optional",required:"Discover Cars affiliate approval, tracking ID or permitted integration access and referral terms"},
  {key:"travel-welcome-pickups",family:"Travel suppliers",name:"Welcome Pickups Partners",url:"https://www.welcomepickups.com/",priority:"optional",required:"Welcome Pickups partner agreement, integration method, market coverage, lead handling and commission terms"},
  {key:"travel-airalo",family:"Travel suppliers",name:"Airalo Partners",url:"https://partners.airalo.com/",priority:"optional",required:"Airalo partner approval, approved referral/API scope, credential, tracking and customer-fulfilment terms"},
  {key:"omio-uk",family:"Travel suppliers",name:"Omio UK Rail & Coach Partners",url:"https://www.omio.com/corporate/omio-b2b/",priority:"pilot",required:"Approved Omio B2B/affiliate account, partner/API entitlement, agreed search/booking/redirect scope, attribution and rate quota"},
  {key:"rdg-rail-retailing",family:"Travel suppliers",name:"Rail Delivery Group Retail Licence",url:"https://www.raildeliverygroup.com/our-services/retail-commercial/how-to-become-a-retailer/third-party-licences.html",priority:"optional",required:"Retailing licence, appropriate system accreditation or accredited ticketing partner, settlement arrangements and sales/refunds terms"},
  {key:"uk-transfer-operators",family:"Travel suppliers",name:"UK Licensed Private Hire and Airport Transfer Operators",url:"https://www.gov.uk/operator-licence-private-hire-vehicle",priority:"pilot",required:"Supplier/operator licence and vehicle/driver verification, legal responsibility for bookings, commercial agreement, insurance, airport permissions, API or dispatch connector and refunds"},
  {key:"travel-market-payments",family:"Payments",name:"Adyen Local Methods for UK-Inbound Travel",url:"https://docs.adyen.com/payment-methods/",priority:"next",required:"UK merchant/payment eligibility review per market: KR local wallets only if approved, JP JCB/PayPay eligibility, CN Alipay/WeChat/UnionPay, US cards and Apple/Google Pay; settlement currency, refunds and FX terms"},
] as const;
