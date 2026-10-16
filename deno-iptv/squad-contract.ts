const objectSchema = (properties: Record<string, unknown>) => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const str = {type:'string'};
export const PLAN_SCHEMA = objectSchema({
  summary:str,nextMove:str,
  tasks:{type:'array',minItems:1,maxItems:8,items:objectSchema({title:str,priority:{type:'string',enum:['Alta','Média','Baixa']},daysFromNow:{type:'integer',minimum:0,maximum:30},why:str})},
});
export const LEAD_SCHEMA = objectSchema({leads:{type:'array',maxItems:10,items:objectSchema({
  EMPRESA:str,CIDADE:str,SITE:str,STATUS_SITE:{type:'string',enum:['SEM_SITE','SITE_FRACO','COM_SITE','NAO_CONFIRMADO']},EVIDENCIA_SITE:str,GOOGLE_NOTA:str,GOOGLE_AVALIACOES:str,REDES_ATIVAS:{type:'string',enum:['SIM','NAO','NAO_CONFIRMADO']},REDE_SOCIAL:str,CONTATO:str,NECESSIDADE:str,MOTIVO:str,FONTE:str,
})}});
export function validateStructured(data:any,kind:string){
  if(kind==='planner'){
    if(!data||typeof data.summary!=='string'||!data.summary.trim()||typeof data.nextMove!=='string'||!Array.isArray(data.tasks)||data.tasks.length<1||data.tasks.length>8)throw Error('OPENAI_INVALID_PLAN');
    for(const task of data.tasks)if(!task||typeof task.title!=='string'||!task.title.trim()||!['Alta','Média','Baixa'].includes(task.priority)||!Number.isInteger(task.daysFromNow)||task.daysFromNow<0||task.daysFromNow>30||typeof task.why!=='string')throw Error('OPENAI_INVALID_TASK');
  }else{
    if(!data||!Array.isArray(data.leads)||data.leads.length>10)throw Error('OPENAI_INVALID_LEADS');
    const properties:any=(LEAD_SCHEMA.properties.leads as any).items.properties;
    for(const lead of data.leads){
      if(!lead||Object.keys(properties).some(k=>typeof lead[k]!=='string')||!lead.EMPRESA.trim())throw Error('OPENAI_INVALID_LEAD');
      if(!properties.STATUS_SITE.enum.includes(lead.STATUS_SITE)||!properties.REDES_ATIVAS.enum.includes(lead.REDES_ATIVAS))throw Error('OPENAI_INVALID_LEAD_STATUS');
      if(lead.STATUS_SITE==='SEM_SITE'&&/^https?:\/\//i.test(lead.SITE))throw Error('OPENAI_CONFLICTING_SITE_EVIDENCE');
    }
  }
  return data;
}
export function responseEvidence(payload:any){
  const output=Array.isArray(payload?.output)?payload.output:[],sources=new Map<string,{url:string;title:string}>();
  const add=(item:any)=>{try{const url=new URL(item?.url);if(['https:','http:'].includes(url.protocol))sources.set(url.href,{url:url.href,title:String(item?.title||url.hostname).slice(0,200)});}catch{/* ignore non-public links */}};
  const web=output.filter((x:any)=>x.type==='web_search_call'&&x.status!=='failed');
  for(const item of output){for(const part of item.content||[])for(const citation of part.annotations||[])if(citation.type==='url_citation')add(citation);for(const source of item.action?.sources||[])add(source);}
  return {usedWeb:web.length>0,webSearchCalls:web.length,sources:[...sources.values()].slice(0,100)};
}
