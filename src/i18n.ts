import zh from './zh.json';
export type Language='en'|'zh';
export function initialLanguage():Language{
 const requested=new URLSearchParams(location.search).get('lang');
 if(requested==='zh'||requested==='en')return requested;
 try{const saved=localStorage.getItem('field-atlas-language');if(saved==='en'||saved==='zh')return saved;}catch{}
 return navigator.language.startsWith('zh')?'zh':'en';
}
export function translator(language:Language){
 return (value:unknown):string=>{
  const text=String(value??'');if(language==='en')return text;
  const key=text.trim();const translated=(zh as Record<string,string>)[key];
  if(translated)return text.replace(key,translated);
  const references=key.match(/^(\d+) records excluded\. (\d+) records shown as reference points and (\d+) as reference lines; these do not define licence areas\. (\d+) polygon records have incomplete parts\. Area overlap coverage remains incomplete\.$/);
  if(references)return `${references[1]} 条记录被排除；${references[2]} 条显示为参考点，${references[3]} 条显示为参考线（不代表矿权面积）。${references[4]} 条多边形仍有不完整部分，面积重叠检查覆盖不完整。`;
  const repaired=key.match(/^(\d+) source records remain excluded\. (\d+) polygon records recovered; (\d+) have incomplete parts\. Overlap covers known valid areas only\.$/);
  if(repaired)return `${repaired[1]} 条源记录仍被排除；已恢复 ${repaired[2]} 条多边形记录，其中 ${repaired[3]} 条仍有不完整部分。重叠计算仅覆盖已知有效区域。`;
  const excluded=key.match(/^(\d+) source records have invalid polygon geometry and are excluded\. Overlap coverage is incomplete\.$/);
  if(excluded)return excluded[1]+' 条源记录的多边形无效，已被排除。重叠检查覆盖不完整。';
  if(key.startsWith('Cannot read coordinate row: '))return '无法读取此坐标行：'+key.slice('Cannot read coordinate row: '.length);
  if(key.startsWith('Overlap analysis unavailable: '))return '暂时无法进行重叠分析：'+key.slice('Overlap analysis unavailable: '.length);
  if(key.startsWith('Update rejected:'))return '更新未通过验证，已保留上次有效数据。请联系管理员检查源数据。';
  if(key.startsWith('MME HTTP '))return 'MME 数据源请求失败：'+key.slice(9);
  return text;
 };
}
