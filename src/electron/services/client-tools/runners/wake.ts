import { getVeraCoworkApiClient } from '../../../api/index.js';
import type { ClientToolDefinition } from '../types.js';

export const wakeTool: ClientToolDefinition = {
 name:'Wake',
 description:'Schedule a durable future turn for this current conversation through the existing Vera server scheduler. Cannot target another agent/account/computer. Create requires name/prompt and exactly one of after_seconds, RFC3339 scheduled_at with timezone, or hourly-or-slower UTC cron. List/cancel are self-bound. Timing resolution is up to 30 seconds; cancel prevents future dispatch, not a turn already running. Requires Vera login and write approval.',
 parameters:{type:'object',properties:{action:{type:'string',enum:['create','list','cancel']},name:{type:'string'},prompt:{type:'string'},after_seconds:{type:'integer',minimum:1,maximum:31536000},scheduled_at:{type:'string'},cron:{type:'string'},id:{type:'string'}},required:['action'],additionalProperties:false},
 run:async(args,ctx)=>{
  try {
   if(!ctx.agentId||!ctx.conversationId) throw new Error('Wake requires concrete runtime agent/conversation context.');
   const body={action:args.action,...(args.name!==undefined?{name:args.name}:{}),...(args.prompt!==undefined?{prompt:args.prompt}:{}),...(args.after_seconds!==undefined?{after_seconds:args.after_seconds}:{}),...(args.scheduled_at!==undefined?{scheduled_at:args.scheduled_at}:{}),...(args.cron!==undefined?{cron:args.cron}:{}),...(args.id!==undefined?{id:args.id}:{}),agentId:ctx.agentId,conversationId:ctx.conversationId,...(ctx.lettaConnectionId?{lettaConnectionId:ctx.lettaConnectionId}:{})};
   const client=getVeraCoworkApiClient();
   if(!client) throw new Error('Wake requires connected Vera user authentication.');
   ctx.signal.throwIfAborted();
   return {output:JSON.stringify(await client.scheduler.wake(body)),isError:false};
  }catch(error){return {output:error instanceof Error?error.message:String(error),isError:true};}
 }
};
