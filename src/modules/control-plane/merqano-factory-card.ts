import { ShoppingBag, Sparkles, ShieldCheck, Store } from "lucide-react";
export const merqanoFactoryCard={
 productKey:"merqano",
 title:"Merqano",
 subtitle:"Multi-shop commerce landlord",
 description:"Provision isolated branded commerce tenants through Omniqora SaaS Factory, then operate their shop lifecycle inside Merqano.",
 icon:Store,
 badges:["Landlord SaaS","External product","Tenant factory"],
 services:[
  {key:"merqano.marketing",label:"Marketing",icon:Sparkles},
  {key:"merqano.marktpass",label:"MarktPass",icon:ShieldCheck},
  {key:"merqano.merqora",label:"Merqora",icon:ShoppingBag},
  {key:"merqano.omniqora_ai",label:"Omniqora AI",icon:Sparkles},
 ],
 initialTenants:["Alstero","Kalëthon","Dulcis","Meyzaar"],
} as const;
