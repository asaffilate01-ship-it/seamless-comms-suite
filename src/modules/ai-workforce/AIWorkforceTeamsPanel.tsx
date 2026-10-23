import {useEffect,useMemo,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {ArrowDown,ClipboardCheck,LockKeyhole,Plus,RefreshCcw,Save,ShieldCheck,Users,Workflow} from "lucide-react";
import {toast} from "sonner";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Badge} from "@/components/ui/badge";
import type {AiEmployee} from "./functions";
import {
 createAiWorkforceShadowTeam,getAiWorkforceShadowWorkspace,
 saveAiWorkforceShadowPlan,transitionAiWorkforceShadowTeam,previewAiWorkforceShadowTeam,
 type TeamStepInput,type WorkforceShadowPreview,type WorkforceShadowTeam,
} from "./teams.functions";

type Props={tenantId:string;productKey:string;employees:AiEmployee[];writable:boolean};
const newStep=(n:number,employeeId=""):TeamStepInput=>({
 employeeId,role:n===0?"lead":"analyst",
 instructions:n===0?"Create an evidence-based, reviewable work outline.":
  "Review the prior handoff and prepare a consistent written response.",
 expectedOutput:n===0?"A documented research plan and source checklist.":
  "A reviewed and documented handoff with gaps identified.",
});
const formatStatus=(status:string)=>status.replaceAll("_"," ");
const msg=(error:unknown)=>error instanceof Error?error.message:String(error);

export function AIWorkforceTeamsPanel({tenantId,productKey,employees,writable}:Props){
 const getFn=useServerFn(getAiWorkforceShadowWorkspace);
 const createFn=useServerFn(createAiWorkforceShadowTeam);
 const saveFn=useServerFn(saveAiWorkforceShadowPlan);
 const transitionFn=useServerFn(transitionAiWorkforceShadowTeam);
 const previewFn=useServerFn(previewAiWorkforceShadowTeam);
 const q=useQuery({
  queryKey:["ai-workforce-shadow-teams",tenantId,productKey],
  queryFn:()=>getFn({data:{tenantId,productKey}}),
  enabled:!!tenantId&&!!productKey,retry:false,
 });
 const [teamId,setTeamId]=useState<string|null>(null);
 const [teamName,setTeamName]=useState("");
 const [purpose,setPurpose]=useState("");
 const [draftSteps,setDraftSteps]=useState<TeamStepInput[]>([newStep(0),newStep(1)]);
 const [reviewNote,setReviewNote]=useState("");
 const [preview,setPreview]=useState<WorkforceShadowPreview|null>(null);
 const [dirty,setDirty]=useState(false);
 const [busy,setBusy]=useState(false);
 const teams=q.data?.teams??[];
 const team=teams.find(t=>t.id===teamId)??null;
 const approvedEmployees=useMemo(()=>employees.filter(e=>e.status==="approved_configuration"),[employees]);
 const available=new Set(approvedEmployees.map(e=>e.id));
 const validMembers=draftSteps.length>=2&&draftSteps.length<=8&&
  draftSteps[0]?.role==="lead"&&
  new Set(draftSteps.map(x=>x.employeeId)).size===draftSteps.length&&
  draftSteps.every(x=>available.has(x.employeeId)&&
   x.instructions.trim().length>=10&&x.instructions.trim().length<=1000&&
   x.expectedOutput.trim().length>=10&&x.expectedOutput.trim().length<=1000);
 const readyToSave=writable&&teamName.trim().length>=3&&teamName.trim().length<=120&&
  purpose.trim().length>=12&&purpose.trim().length<=1200&&validMembers&&
  team?.status!=="retired";
 useEffect(()=>{
  if(!teamId)return;
  if(teams.length&&teams.every(x=>x.id!==teamId))setTeamId(null);
 },[teamId,teams.map(t=>t.id).join("|")]);

 function startNew(){
  setTeamId(null);setTeamName("");setPurpose("");
  setDraftSteps([newStep(0),newStep(1)]);
  setReviewNote("");setPreview(null);setDirty(true);
 }
 function openTeam(selected:WorkforceShadowTeam){
  const old=(q.data?.steps??[]).filter(s=>s.team_id===selected.id)
   .sort((a,b)=>a.position-b.position);
  setTeamId(selected.id);setTeamName(selected.team_name);
  setPurpose(selected.mission_purpose);
  setDraftSteps(old.length?old.map(s=>({
   employeeId:s.employee_id,role:s.step_role,
   instructions:s.instructions,expectedOutput:s.expected_output,
  })):[newStep(0),newStep(1)]);
  setDirty(false);setReviewNote("");setPreview(null);
 }
 function editStep(i:number,part:Partial<TeamStepInput>){
  setDraftSteps(prev=>prev.map((s,n)=>n===i?{...s,...part}:s));
  setDirty(true);setPreview(null);
 }
 function addStep(){
  setDraftSteps(prev=>prev.length>=8?prev:[...prev,newStep(prev.length)]);
  setDirty(true);setPreview(null);
 }
 function removeStep(i:number){
  setDraftSteps(prev=>prev.length<=2?prev:prev.filter((_,n)=>n!==i)
   .map((s,n)=>({...s,role:n===0?"lead":s.role==="lead"?"analyst":s.role})));
  setDirty(true);setPreview(null);
 }
 async function withBusy(task:()=>Promise<void>){
  setBusy(true);
  try{await task();}
  catch(e){toast.error(msg(e));}
  finally{setBusy(false);}
 }
 async function savePlan(){
  if(!readyToSave||busy)return;
  await withBusy(async()=>{
   let id=teamId;
   if(!id){
    id=await createFn({data:{
     tenantId,productKey,teamName:teamName.trim(),missionPurpose:purpose.trim(),
    }});
    setTeamId(id);
   }else if(team&&(team.team_name!==teamName.trim()||
      team.mission_purpose!==purpose.trim())){
    // Existing team identity/purpose remain immutable in Phase 5A. A revised
    // mission is created as a new team rather than silently changing approvals.
    throw new Error("Team name and purpose are immutable. Create a new team for a new mission.");
   }
   await saveFn({data:{tenantId,productKey,teamId:id,steps:draftSteps.map(s=>({
     ...s,instructions:s.instructions.trim(),expectedOutput:s.expectedOutput.trim(),
   }))}});
   setDirty(false);setPreview(null);
   await q.refetch();toast.success("Shadow handoff plan saved. No model or app action executed.");
  });
 }
 async function transition(action:"submit"|"approve"|"return"|"pause"|"resume"|"retire"){
  if(!team||busy)return;
  await withBusy(async()=>{
   if(dirty)throw new Error("Save plan revisions before requesting a review.");
   await transitionFn({data:{
    tenantId,productKey,teamId:team.id,action,note:reviewNote.trim()||null,
   }});
   setReviewNote("");
   await q.refetch();
   toast.success(action==="approve"
    ?"Shadow plan approved. Autonomous execution remains disabled."
    :"Team plan status updated.");
  });
 }
 async function runPreview(){
  if(!team||busy)return;
  await withBusy(async()=>{
   if(dirty)throw new Error("Save the updated plan before reviewing it.");
   const result=await previewFn({data:{tenantId,productKey,teamId:team.id}});
   if(result.canExecute!==false)throw new Error("Unexpected live execution rights");
   setPreview(result);await q.refetch();
   toast.success("Zero-execution shadow handoff preview recorded.");
  });
 }
 const selectedEvents=(q.data?.events??[]).filter(e=>e.team_id===teamId).slice(0,8);
 return <Card><CardContent className="space-y-5 p-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <h2 className="flex items-center gap-2 text-xl font-semibold">
     <Users className="h-5 w-5"/> AI Workforce Team Studio
    </h2>
    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
     Plan how two to eight approved AI employees would collaborate, with clear handoffs
     and independent approval. Team plans are shadow-only and cannot launch AI tasks.
    </p>
   </div>
   <Button variant="outline" size="sm" onClick={()=>q.refetch()} disabled={q.isFetching}>
    <RefreshCcw className="mr-2 h-4 w-4"/> Refresh teams
   </Button>
  </div>
  <div className="flex flex-wrap gap-2">
   <Badge variant="outline"><LockKeyhole className="mr-1 h-3 w-3"/> Tenant-isolated</Badge>
   <Badge variant="outline"><ShieldCheck className="mr-1 h-3 w-3"/> Human-approved plans</Badge>
   <Badge variant="outline">0 model calls · 0 tool actions</Badge>
  </div>
  {q.isError&&<p className="rounded-lg border p-3 text-sm text-destructive">
   Team Studio unavailable. Verify Phase 5A migration, service entitlement and tenant role.
  </p>}
  {approvedEmployees.length<2&&<p className="rounded-lg bg-muted/50 p-3 text-sm">
   Create and independently approve at least two AI employees in this tenant and product
   before saving a team mission.
  </p>}
  <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
   <div className="space-y-3">
    <div className="flex items-center justify-between gap-2">
     <h3 className="font-semibold">Team plans</h3>
     <Button size="sm" onClick={startNew} disabled={!writable}>
      <Plus className="mr-1 h-4 w-4"/> New
     </Button>
    </div>
    {teams.map(t=><button type="button" key={t.id}
      onClick={()=>openTeam(t)}
      className={"w-full rounded-lg border p-3 text-left hover:bg-muted/60 "+
       (teamId===t.id?"border-primary bg-primary/5":"")}>
      <b className="block text-sm">{t.team_name}</b>
      <span className="mt-1 block text-xs text-muted-foreground">
       {formatStatus(t.status)} · revision {t.revision}
      </span>
    </button>)}
    {!teams.length&&<p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
     No shadow teams have been configured yet.
    </p>}
   </div>
   <div className="min-w-0 space-y-4">
    <div className="grid gap-3 md:grid-cols-2">
     <label className="space-y-1.5 text-sm font-medium">
      <span>Team name</span>
      <Input value={teamName} disabled={!!team||!writable} maxLength={120}
       onChange={e=>{setTeamName(e.target.value);setDirty(true);}}/>
     </label>
     <label className="space-y-1.5 text-sm font-medium">
      <span>Mission purpose</span>
      <Textarea value={purpose} disabled={!!team||!writable} rows={2} maxLength={1200}
       onChange={e=>{setPurpose(e.target.value);setDirty(true);}}/>
     </label>
    </div>
    <div className="space-y-3">
     <h3 className="flex items-center gap-2 font-semibold">
      <Workflow className="h-4 w-4"/> Planned sequential handoffs
     </h3>
     {draftSteps.map((step,i)=><div key={i} className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
       <b className="text-sm">Step {i+1} · {i===0?"Team lead":"Next handoff"}</b>
       {i>1&&<Button variant="outline" size="sm" disabled={!writable||team?.status==="retired"}
        onClick={()=>removeStep(i)}>Remove step</Button>}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
       <label className="space-y-1.5 text-sm font-medium">
        <span>Approved AI employee</span>
        <select value={step.employeeId}
         disabled={!writable||team?.status==="retired"}
         onChange={e=>editStep(i,{employeeId:e.target.value})}
         className="h-10 w-full rounded-md border bg-background px-2 text-sm">
         <option value="">Choose employee</option>
         {approvedEmployees.map(e=><option key={e.id} value={e.id}>
          {e.display_name} · {e.role_title}
         </option>)}
        </select>
       </label>
       <label className="space-y-1.5 text-sm font-medium">
        <span>Handoff role</span>
        <select value={step.role} disabled={i===0||!writable||team?.status==="retired"}
         onChange={e=>editStep(i,{role:e.target.value as TeamStepInput["role"]})}
         className="h-10 w-full rounded-md border bg-background px-2 text-sm">
         {(i===0?["lead"]:["analyst","researcher","reviewer","reporter"]).map(v=>
          <option key={v} value={v}>{v}</option>)}
        </select>
       </label>
      </div>
      <label className="mt-3 block space-y-1.5 text-sm font-medium">
       <span>Expected analysis or review instructions</span>
       <Textarea rows={2} value={step.instructions} maxLength={1000}
        disabled={!writable||team?.status==="retired"}
        onChange={e=>editStep(i,{instructions:e.target.value})}/>
      </label>
      <label className="mt-3 block space-y-1.5 text-sm font-medium">
       <span>Written deliverable for next reviewer</span>
       <Textarea rows={2} value={step.expectedOutput} maxLength={1000}
        disabled={!writable||team?.status==="retired"}
        onChange={e=>editStep(i,{expectedOutput:e.target.value})}/>
      </label>
      {i<draftSteps.length-1&&<p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
       <ArrowDown className="h-3 w-3"/> Proposed written handoff to step {i+2}, not an executable dependency
      </p>}
     </div>)}
     <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={!writable||draftSteps.length>=8||
       team?.status==="retired"} onClick={addStep}>
       <Plus className="mr-1 h-4 w-4"/> Add role
      </Button>
      <Button size="sm" disabled={!readyToSave||busy||q.isError} onClick={savePlan}>
       <Save className="mr-1 h-4 w-4"/> Save versioned plan
      </Button>
     </div>
    </div>
    {team&&<div className="space-y-3 rounded-lg border p-4">
     <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">Independent team approval</h3>
      <Badge variant="outline">{formatStatus(team.status)}</Badge>
     </div>
     <p className="text-xs text-muted-foreground">
      Approvals are for the written coordination plan only. This cannot start models,
      grant MCP tools, run scheduled jobs or send messages.
     </p>
     <Textarea rows={2} value={reviewNote} maxLength={1000}
      onChange={e=>setReviewNote(e.target.value)}
      placeholder="Document approvals, return-for-edit issues, or reason for pausing."/>
     <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={runPreview} disabled={busy||dirty||team.revision===0}>
       <ClipboardCheck className="mr-1 h-4 w-4"/> Preview handoffs
      </Button>
      {team.status==="draft"&&<Button size="sm" disabled={busy||dirty||team.revision===0}
       onClick={()=>transition("submit")}>Submit for review</Button>}
      {team.status==="pending_review"&&<>
       <Button size="sm" disabled={busy||dirty} onClick={()=>transition("approve")}>
        Approve plan
       </Button>
       <Button size="sm" variant="outline" disabled={busy||reviewNote.trim().length<12}
        onClick={()=>transition("return")}>Return for edits</Button>
      </>}
      {team.status==="approved_plan"&&<Button size="sm" variant="outline" disabled={busy}
       onClick={()=>transition("pause")}>Pause plan</Button>}
      {team.status==="paused"&&<Button size="sm" variant="outline" disabled={busy}
       onClick={()=>transition("resume")}>Resume approved plan</Button>}
      {team.status!=="retired"&&<Button size="sm" variant="outline" disabled={busy}
       onClick={()=>transition("retire")}>Retire</Button>}
     </div>
     {preview&&<div className="rounded-lg bg-muted/50 p-3">
      <b className="text-sm">Shadow preview · {preview.stepCount} sequential handoffs</b>
      <p className="mt-1 text-xs text-muted-foreground">
       Model calls 0 · Tools 0 · Customer actions 0 · Autonomous execution blocked
      </p>
      {preview.steps.map(s=><p key={s.position} className="mt-2 text-xs">
       {s.position}. {s.employeeName} ({s.role}): {s.expectedOutput}
      </p>)}
     </div>}
     {selectedEvents.length>0&&<div className="border-t pt-3 text-xs text-muted-foreground">
      {selectedEvents.map(e=><p key={e.id}>
       {formatStatus(e.event_key)} · v{e.revision} · {new Date(e.created_at).toLocaleString()}
      </p>)}
     </div>}
    </div>}
   </div>
  </div>
 </CardContent></Card>;
}
