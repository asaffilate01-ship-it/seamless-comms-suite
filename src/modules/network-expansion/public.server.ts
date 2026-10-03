import { z } from "zod";

const application=z.object({
  programmeKey:z.string().min(3).max(100).default("mealdeck-england-wales"),
  territoryCode:z.string().max(40).nullish(),
  name:z.string().trim().min(2).max(200),
  email:z.string().trim().email().max(320),
  phone:z.string().trim().max(40).nullish(),
  preferredArea:z.string().trim().min(2).max(200),
  existingKitchen:z.boolean().default(false),
  existingBusiness:z.string().trim().max(300).nullish(),
  availableCapitalMinor:z.number().int().nonnegative().nullish(),
  launchTiming:z.string().trim().max(100).nullish(),
  multiUnitInterest:z.boolean().default(false),
  source:z.string().trim().max(100).nullish(),
  utm:z.record(z.string(),z.unknown()).default({}),
  answers:z.record(z.string(),z.unknown()).default({}),
  consent:z.literal(true),
  website:z.string().max(200).optional().default(""),
});

async function context(programmeKey:string){
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const db=supabaseAdmin as any;
  const tenant=await db.from("tenants").select("id,name,slug").eq("slug","mealdeck").maybeSingle();
  if(tenant.error)throw new Error(tenant.error.message);
  if(!tenant.data)throw new Error("MealDeck network is not configured");
  let programme=await db.from("network_programmes").select("*").eq("tenant_id",tenant.data.id).eq("programme_key",programmeKey).maybeSingle();
  if(programme.error)throw new Error(programme.error.message);
  if(!programme.data&&programmeKey==="mealdeck-england-wales"){
    // Service-role bootstrap for the public funnel if a deployment predates the migration seed.
    const template=await db.from("network_territory_templates").select("*").eq("template_key","mealdeck-england-wales").order("ordinal");
    if(template.error)throw new Error(template.error.message);
    const created=await db.from("network_programmes").insert({
      tenant_id:tenant.data.id,product_key:"mealdeck",programme_key:"mealdeck-england-wales",name:"MealDeck England & Wales",
      model_type:"franchise",status:"active",currency:"GBP",fee_min_minor:750000,fee_max_minor:2500000,
      royalty_bps:550,marketing_bps:150,tech_fee_minor_per_order:25,supply_markup_bps:1000,
      offer:{brands:"15+ and growing",featuredMarkets:[
        {name:"Luton",status:"coming_soon"},{name:"St Albans",status:"coming_soon"},
        {name:"Bedford",status:"taken"},{name:"Milton Keynes",status:"taken"},
        {name:"Islington / Camden",status:"available",note:"Priority London territory near Caledonian Road"}
      ]}
    }).select("*").single();
    if(created.error)throw new Error(created.error.message);
    programme=created;
    if(template.data?.length){
      const rows=template.data.map((t:any)=>({
        tenant_id:tenant.data.id,programme_id:created.data.id,territory_code:t.territory_code,name:t.name,region:t.region,
        status:t.metadata?.publicStatus??"available",fee_minor:t.fee_minor,currency:t.currency??"GBP",
        is_sellable:t.metadata?.isSellable??true,public_note:t.metadata?.publicNote??null,metadata:t.metadata??{}
      }));
      const seeded=await db.from("network_territories").insert(rows);
      if(seeded.error)throw new Error(seeded.error.message);
    }
  }
  if(!programme.data||programme.data.status!=="active")throw new Error("Franchise programme is not active");
  return{db,tenant:tenant.data,programme:programme.data};
}

const safeTerritory=(t:any)=>({
  code:t.territory_code,name:t.name,region:t.region,status:t.status,
  fee:Number(t.fee_minor??0)/100,currency:t.currency??"GBP",
  isSellable:!!t.is_sellable,note:t.public_note??null,score:t.territory_score??null,
});

function score(input:z.infer<typeof application>){
  let n=10;
  if(input.existingKitchen)n+=30;
  if(input.existingBusiness)n+=15;
  if((input.availableCapitalMinor??0)>=2500000)n+=15;
  if((input.availableCapitalMinor??0)>=5000000)n+=10;
  if(input.multiUnitInterest)n+=10;
  if(/now|immediate|0-3|3 month/i.test(input.launchTiming??""))n+=10;
  return Math.min(100,n);
}

export async function servePublicNetworkExpansion(request:Request){
  try{
    if(request.method==="GET"){
      const url=new URL(request.url);
      const programmeKey=url.searchParams.get("programme")||"mealdeck-england-wales";
      const q=(url.searchParams.get("q")||"").trim();
      const status=(url.searchParams.get("status")||"").trim();
      const{db,programme}=await context(programmeKey);
      let query=db.from("network_territories")
        .select("territory_code,name,region,status,fee_minor,currency,is_sellable,public_note,territory_score")
        .eq("programme_id",programme.id).eq("is_public",true).order("region").order("name").limit(200);
      if(q)query=query.or(`name.ilike.%${q.replaceAll("%","")}%,region.ilike.%${q.replaceAll("%","")}%`);
      if(status)query=query.eq("status",status);
      const territories=await query;
      if(territories.error)throw new Error(territories.error.message);
      return Response.json({
        programme:{
          key:programme.programme_key,name:programme.name,currency:programme.currency,
          feeMin:Number(programme.fee_min_minor)/100,feeMax:Number(programme.fee_max_minor)/100,
          royaltyPercent:Number(programme.royalty_bps)/100,marketingPercent:Number(programme.marketing_bps)/100,
          techFeePerOrder:Number(programme.tech_fee_minor_per_order)/100,supplyMarkupPercent:Number(programme.supply_markup_bps)/100,
          offer:programme.offer??{}
        },
        territories:(territories.data??[]).map(safeTerritory)
      },{headers:{"Cache-Control":"public, max-age=60, stale-while-revalidate=300"}});
    }
    if(request.method==="POST"){
      const parsed=application.parse(await request.json());
      if(parsed.website)return Response.json({ok:true});
      const{db,tenant,programme}=await context(parsed.programmeKey);
      const email=parsed.email.toLowerCase();
      let territory:any=null;
      if(parsed.territoryCode){
        const tr=await db.from("network_territories").select("*").eq("programme_id",programme.id).eq("territory_code",parsed.territoryCode).maybeSingle();
        if(tr.error)throw new Error(tr.error.message);territory=tr.data;
      }
      if(territory&&!territory.is_sellable&&territory.status!=="coming_soon"){
        return Response.json({ok:false,error:"That territory is not currently available. You can still ask about another area."},{status:409});
      }
      let person=await db.from("crm_people").select("*").eq("tenant_id",tenant.id).ilike("email",email).maybeSingle();
      if(person.error)throw new Error(person.error.message);
      if(!person.data){
        person=await db.from("crm_people").insert({
          tenant_id:tenant.id,display_name:parsed.name,email,phone_e164:parsed.phone||null,lifecycle_stage:"lead",
          marketing_consent:parsed.consent,source_product_key:"mealdeck",tags:["franchise-prospect"],
          metadata:{preferredArea:parsed.preferredArea,existingKitchen:parsed.existingKitchen,multiUnitInterest:parsed.multiUnitInterest}
        }).select("*").single();
        if(person.error)throw new Error(person.error.message);
      }
      const leadScore=score(parsed);
      const lead=await db.from("crm_leads").insert({
        tenant_id:tenant.id,person_id:person.data.id,title:`MealDeck franchise — ${parsed.preferredArea}`,
        source:parsed.source||"mealdeck-franchise-page",status:"new",score:leadScore,source_product_key:"mealdeck",
        metadata:{programmeKey:programme.programme_key,territoryCode:territory?.territory_code??null,utm:parsed.utm}
      }).select("*").single();
      if(lead.error)throw new Error(lead.error.message);
      const app=await db.from("network_applications").insert({
        tenant_id:tenant.id,programme_id:programme.id,territory_id:territory?.id??null,crm_person_id:person.data.id,crm_lead_id:lead.data.id,
        applicant_name:parsed.name,email,phone_e164:parsed.phone||null,preferred_area:parsed.preferredArea,
        existing_kitchen:parsed.existingKitchen,existing_business:parsed.existingBusiness||null,available_capital_minor:parsed.availableCapitalMinor??null,
        launch_timing:parsed.launchTiming||null,multi_unit_interest:parsed.multiUnitInterest,stage:"new",score:leadScore,
        source:parsed.source||"mealdeck-franchise-page",utm:parsed.utm,answers:parsed.answers,consent:true
      }).select("*").single();
      if(app.error)throw new Error(app.error.message);
      await Promise.all([
        db.from("network_application_events").insert({tenant_id:tenant.id,application_id:app.data.id,event_type:"submitted",detail:{source:parsed.source,score:leadScore}}),
        db.from("crm_activities").insert({tenant_id:tenant.id,activity_type:"lead_event",summary:"Franchise application submitted",person_id:person.data.id,lead_id:lead.data.id,source_product_key:"mealdeck",metadata:{applicationId:app.data.id,territory:territory?.name??parsed.preferredArea}}),
        db.from("growth_attribution_events").insert({tenant_id:tenant.id,product_key:"mealdeck",programme_id:programme.id,territory_id:territory?.id??null,application_id:app.data.id,event_type:"application",channel_key:null,utm:parsed.utm,metadata:{source:parsed.source||"mealdeck-franchise-page"}})
      ]);
      return Response.json({ok:true,applicationId:app.data.id,territory:territory?safeTerritory(territory):null,score:leadScore},{status:201});
    }
    return new Response("Method not allowed",{status:405,headers:{Allow:"GET, POST"}});
  }catch(error){
    console.error("[network-expansion-public]",error);
    const message=error instanceof z.ZodError?"Please check the application details.":error instanceof Error?error.message:"Request failed";
    return Response.json({ok:false,error:message},{status:error instanceof z.ZodError?400:500});
  }
}
