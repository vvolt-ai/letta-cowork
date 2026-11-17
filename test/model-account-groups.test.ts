import {expect, test} from 'bun:test';
import {groupModelsByAccount, modelAccountIdentity} from '../src/ui/features/chat/components/PromptInput/model-account-groups';
const model=(name:string, provider_name?:string, provider_category:'base'|'byok'='byok')=>({name,provider_name,provider_type:'openai',provider_category});
test('separately named accounts using the same provider and model stay separate',()=>{
 const groups=groupModelsByAccount([model('EngineeringChatGPT/gpt-sol','EngineeringChatGPT'),model('chatgpt-plus-pro/gpt-sol','chatgpt-plus-pro')]);
 expect(groups.length).toBe(2);expect(groups.map(g=>g.label)).toEqual(['chatgpt-plus-pro','EngineeringChatGPT']);
 expect(groups[0].models[0].name).toBe('chatgpt-plus-pro/gpt-sol');expect(groups[1].models[0].name).toBe('EngineeringChatGPT/gpt-sol');
});
test('multiple models in one configured account share a group',()=>{
 const groups=groupModelsByAccount([model('EngineeringChatGPT/fast','EngineeringChatGPT'),model('EngineeringChatGPT/sol','EngineeringChatGPT')]);expect(groups.length).toBe(1);expect(groups[0].models.length).toBe(2);
});
test('qualified handle namespaces identify accounts when provider names are absent',()=>{
 const groups=groupModelsByAccount([model('personal/sol'),model('engineering/sol')]);expect(groups.map(g=>g.label)).toEqual(['engineering','personal']);
});
test('generic provider labels do not merge or obscure distinct namespaces',()=>{
 const groups=groupModelsByAccount([model('personal/sol','OpenAI'),model('engineering/sol','OpenAI')]);expect(groups.map(g=>g.label)).toEqual(['engineering','personal']);expect(groups[0].key).not.toBe(groups[1].key);
});
test('hosted and BYOK routes are never merged solely by a shared display label',()=>{
 const groups=groupModelsByAccount([model('openai/sol','OpenAI','base'),model('openai/sol','OpenAI','byok')]);expect(groups.length).toBe(2);
});
test('unnamed/bare handles retain a truthful provider fallback, not an invented account',()=>{
 expect(modelAccountIdentity(model('sol')).label).toBe('openai');expect(modelAccountIdentity({name:'sol',provider_type:''}).label).toBe('Other');expect(groupModelsByAccount([])).toEqual([]);
});
test('grouping preserves original handles, model order and input data',()=>{
 const values=[model('engineering/sol',' Engineering '),model('engineering/fast',' Engineering ')];const before=JSON.stringify(values);const groups=groupModelsByAccount(values);expect(groups[0].label).toBe('Engineering');expect(groups[0].models.map(m=>m.name)).toEqual(['engineering/sol','engineering/fast']);expect(JSON.stringify(values)).toBe(before);
});
