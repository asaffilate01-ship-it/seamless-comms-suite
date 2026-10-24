import {useEffect,useState,type ReactNode} from 'react';
import {workspaceTabs,workspaceForHash,adjacentWorkspace,type WorkspaceKey} from './workspaces';
export function AegisWorkspace({panels}:{panels:Record<WorkspaceKey,ReactNode>}){
 const [active,setActive]=useState<WorkspaceKey>('command'),[visited,setVisited]=useState<WorkspaceKey[]>(['command']);
 function activate(key:WorkspaceKey){setVisited(v=>v.includes(key)?v:[...v,key]);setActive(key)}
 useEffect(()=>{
  function navigate(){const key=workspaceForHash(window.location.hash);if(!key)return;setVisited(v=>v.includes(key)?v:[...v,key]);setActive(key);requestAnimationFrame(()=>document.getElementById(window.location.hash.slice(1))?.scrollIntoView({block:'start'}));}
  navigate();window.addEventListener('hashchange',navigate);return()=>window.removeEventListener('hashchange',navigate);
 },[]);
 return <div className="my-6"><div role="tablist" aria-label="Aegis workspaces" className="sticky top-0 z-10 flex gap-1 overflow-x-auto rounded-xl border bg-background p-2 shadow-sm">{workspaceTabs.map(t=><button key={t.key} type="button" role="tab" id={'aegis-tab-'+t.key} aria-controls={'aegis-panel-'+t.key} aria-selected={active===t.key} tabIndex={active===t.key?0:-1} onClick={()=>activate(t.key)} onKeyDown={e=>{const direction=e.key==='ArrowRight'?'next':e.key==='ArrowLeft'?'previous':e.key==='Home'?'first':e.key==='End'?'last':null;if(direction){e.preventDefault();const key=adjacentWorkspace(t.key,direction);activate(key);document.getElementById('aegis-tab-'+key)?.focus()}}} className={'shrink-0 rounded-lg px-4 py-3 text-sm font-medium transition-colors '+(active===t.key?'bg-slate-950 text-white':'text-muted-foreground hover:bg-muted')}>{t.label}</button>)}</div><p className="mt-3 text-xs text-muted-foreground">Workspaces open as needed. Draft forms stay mounted after opening; changing tenant or leaving the page resets local drafts.</p>{workspaceTabs.map(t=><div key={t.key} role="tabpanel" id={'aegis-panel-'+t.key} aria-labelledby={'aegis-tab-'+t.key} hidden={active!==t.key} tabIndex={0}>{visited.includes(t.key)?panels[t.key]:null}</div>)}</div>;
}
