import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../src/ui/index.css';
import {SchedulesPanel} from '../src/ui/features/scheduler/SchedulesPanel';

// Isolated UI fixture. No auth, real agents, server requests or schedule writes.
const calls: string[]=[];
const agents=[{id:'agent-fixture-andr',name:'AndrOptimus fixture'},{id:'agent-fixture-other',name:'Another fixture'}];
let shouldFail=new URLSearchParams(location.search).has('failure');
const record=(name:string)=>{calls.push(name);const output=document.getElementById('calls');if(output)output.textContent=calls.join(', ');};
(window as any).electron=new Proxy({
 schedulerList:async()=>{record('list-schedules');return[];},
 listLettaAgents:async(query='')=>{record('list-agents');if(shouldFail){shouldFail=false;throw Error('Synthetic list failure');}return agents.filter(agent=>agent.name.toLowerCase().includes(query.toLowerCase()));},
},{get(target,key){if(key in target)return target[key as keyof typeof target];return()=>{record('FORBIDDEN:'+String(key));throw Error('No fixture writes or other APIs permitted');};}});
function Fixture(){const[entry,setEntry]=useState('settings');return <><nav className="p-4 flex gap-4"><button onClick={()=>setEntry('settings')}>Settings entry</button><button onClick={()=>setEntry('standalone')}>Standalone entry</button><output id="calls" aria-label="Fixture calls"/></nav><SchedulesPanel key={entry}/></>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
