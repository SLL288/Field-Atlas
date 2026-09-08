import '../server/env';
import {ActivityStore} from '../server/activity-store';
const args=process.argv.slice(2);
const option=(name:string)=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const store=new ActivityStore();
try{
 if(args.includes('--help')){
  console.log('npm run activity:logs -- [--date YYYY-MM-DD] [--limit 50] [--offset 0] [--json]\nnpm run activity:logs -- --id EVENT_UUID\nArchive folder: '+store.directory);
 }else if(option('--id')){
  console.log(JSON.stringify(await store.get(option('--id')!),null,2));
 }else{
  const result=await store.list(option('--date')||new Date().toISOString().slice(0,10),Number(option('--offset')||0),Number(option('--limit')||50));
  if(args.includes('--json'))console.log(JSON.stringify(result,null,2));
  else{
   console.log('Archive folder: '+store.directory+'\nDate (UTC): '+result.date+' · '+result.total+' records');
   for(const r of result.records)console.log([r.received_at,r.action,r.format||r.geometry_types.join(','),r.context.project_name||r.filename||r.context.source,r.feature_count+' features',r.event_id].join(' | '));
   if(result.next_offset!==null)console.log('Next page: --offset '+result.next_offset);
  }
 }
}catch(e){console.error((e as Error).message);process.exitCode=1;}
