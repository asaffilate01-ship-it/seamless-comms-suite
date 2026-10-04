import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const file=process.argv[2];
if(!file)throw new Error("Usage: bun scripts/import-territory-demographics.mjs <normalized.csv|json|jsonl>");
const url=process.env.SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const text=await readFile(file,"utf8");

function parseCsv(input){
  const rows=[];let row=[],field="",quote=false;
  for(let i=0;i<input.length;i++){
    const ch=input[i],next=input[i+1];
    if(ch==='"'&&quote&&next==='"'){field+='"';i++;continue;}
    if(ch==='"'){quote=!quote;continue;}
    if(ch===","&&!quote){row.push(field);field="";continue;}
    if((ch==="\n"||ch==="\r")&&!quote){
      if(ch==="\r"&&next==="\n")i++;
      row.push(field);field="";if(row.some(x=>x!==""))rows.push(row);row=[];continue;
    }
    field+=ch;
  }
  if(field||row.length){row.push(field);rows.push(row);}
  if(!rows.length)return[];
  const headers=rows[0].map(x=>x.trim());
  return rows.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??""])));
}
function first(row,names){for(const n of names)if(row[n]!==undefined&&row[n]!=="")return row[n];return null}
function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
function normalise(row){
  const geographyCode=first(row,["geography_code","LSOA21CD","lsoa21cd","code"]);
  const lat=num(first(row,["centroid_lat","latitude","lat"])),lng=num(first(row,["centroid_lng","longitude","lng","lon"]));
  if(!geographyCode||lat===null||lng===null)throw new Error("Every row requires geography_code/LSOA21CD and centroid latitude/longitude");
  return{
    geography_code:String(geographyCode),geography_type:String(first(row,["geography_type"])||"LSOA21"),
    name:first(row,["name","LSOA21NM","lsoa21nm"])||null,centroid_lat:lat,centroid_lng:lng,
    population:Math.max(0,Math.round(num(first(row,["population","population_estimate","population_2025"]))??0)),
    households:Math.max(0,Math.round(num(first(row,["households","households_2021"]))??0)),
    daytime_population:num(first(row,["daytime_population"])),students:num(first(row,["students"])),
    population_source:first(row,["population_source"])||"ONS small-area population estimates",
    household_source:first(row,["household_source"])||"Census 2021 / ONS households",
    source_year:num(first(row,["source_year","population_year"])),
    metadata:{import_file:file}
  };
}
let raw;
const ext=extname(file).toLowerCase();
if(ext===".json")raw=JSON.parse(text);
else if(ext===".jsonl")raw=text.split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x));
else raw=parseCsv(text);
if(!Array.isArray(raw))throw new Error("Input must contain an array/rows");
const rows=raw.map(normalise);
let imported=0;
for(let i=0;i<rows.length;i+=1000){
  const batch=rows.slice(i,i+1000);
  const r=await db.from("geo_demographic_cells").upsert(batch,{onConflict:"geography_code"});
  if(r.error)throw new Error(r.error.message);
  imported+=batch.length;console.log("Imported "+imported+"/"+rows.length);
}
console.log("Territory demographic import complete: "+imported+" cells");