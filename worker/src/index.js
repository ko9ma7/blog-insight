/**
 * Blog Insight Worker (Cloudflare Workers module syntax)
 * 네이버 Client ID / Client Secret / API 접근 토큰은 Workers Secret으로만 저장합니다.
 */
const navBase='https://openapi.naver.com';
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
const err=(message,status=400)=>json({error:message},status);
function cors(origin,allowed){return {'Access-Control-Allow-Origin':origin && allowed===origin ? origin : 'null','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'};}
function constantEqual(a,b){const x=String(a||''),y=String(b||'');let diff=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++) diff|=(x.charCodeAt(i)||0)^(y.charCodeAt(i)||0);return diff===0;}
function terms(v,max=5){const a=[...new Set(String(v||'').split(',').map(x=>x.trim()).filter(Boolean))];if(a.length<1||a.length>max||a.some(x=>x.length>80))throw new Error(`키워드는 1~${max}개, 각 80자 이하로 입력해 주세요.`);return a;}
function ymdInSeoul(date){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
async function naver(env,url,body){const headers={'X-Naver-Client-Id':env.NAVER_CLIENT_ID,'X-Naver-Client-Secret':env.NAVER_CLIENT_SECRET,'Accept':'application/json'};if(body)headers['Content-Type']='application/json';const response=await fetch(url,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});let data;try{data=await response.json();}catch{throw new Error(`네이버 응답 해석 실패 (${response.status})`);}if(!response.ok){const code=String(data.errorCode||data.error||response.status);throw new Error(`네이버 API 오류 ${code} (${response.status}): 권한·할당량·키워드를 확인하세요.`);}return data;}
async function search(env,keyword,limit=20){const u=new URL(navBase+'/v1/search/blog.json');u.searchParams.set('query',keyword);u.searchParams.set('display',String(Math.max(1,Math.min(100,Number(limit)||20))));u.searchParams.set('sort','sim');const data=await naver(env,u.toString());return {query:keyword,total:Number(data.total)||0,items:(data.items||[]).map(x=>({title:x.title,link:x.link,description:x.description,bloggername:x.bloggername,bloggerlink:x.bloggerlink,postdate:x.postdate}))};}
async function trends(env,keywords,days=30){const now=new Date();const end=new Date(now.getTime()-86400000);const start=new Date(end.getTime()-(Math.min(365,Math.max(14,Number(days)||30))-1)*86400000);const body={startDate:ymdInSeoul(start),endDate:ymdInSeoul(end),timeUnit:'date',keywordGroups:keywords.map(k=>({groupName:k,keywords:[k]}))};const data=await naver(env,navBase+'/v1/datalab/search',body);return {startDate:body.startDate,endDate:body.endDate,results:(data.results||[]).map(r=>({title:r.title,data:(r.data||[]).map(p=>({period:p.period,ratio:Number(p.ratio)}))}))};}
function decodeXml(s){return String(s||'').replace(/^<!\[CDATA\[|\]\]>$/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");}
function tag(xml,name){const match=xml.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'));return decodeXml(match?.[1]?.trim()||'');}
async function blogRss(id){const url=`https://rss.blog.naver.com/${encodeURIComponent(id)}.xml`;const r=await fetch(url,{headers:{'Accept':'application/rss+xml, application/xml, text/xml','User-Agent':'BlogInsightPersonalDashboard/1.0'}});if(!r.ok)throw new Error(`블로그 RSS 접근 실패 (${r.status}): RSS 공개 설정과 블로그 ID를 확인하세요.`);const xml=await r.text();if(!xml.includes('<rss')&&!xml.includes('<channel'))throw new Error('네이버에서 RSS 형식이 아닌 내용을 반환했습니다.');const channel=xml.split(/<item\b/i)[0]||xml;const title=tag(channel,'title');const matches=xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi)||[];const posts=matches.slice(0,30).map(it=>({title:tag(it,'title').replace(/<[^>]+>/g,''),link:tag(it,'link'),pubDate:tag(it,'pubDate')}));return {id,title,posts,source:'public-rss'};}
export default {
  async fetch(request,env){
    const reqUrl=new URL(request.url);
    const origin=request.headers.get('Origin') || '';
    const allowed=(env.ALLOWED_ORIGIN||'').trim().replace(/\/$/,'');
    const ch=cors(origin,allowed);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:ch});
    if(reqUrl.pathname==='/health')return json({ok:true,service:'blog-insight-worker'},200,ch);
    if(!allowed)return err('Worker에 ALLOWED_ORIGIN 설정이 필요합니다.',503);
    if(origin && origin!==allowed)return err('허용되지 않은 Origin입니다.',403);
    if(request.method!=='GET')return json({error:'GET 요청만 지원합니다.'},405,ch);
    if(!env.ACCESS_TOKEN || !env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET)return json({error:'Worker의 Secret 설정이 완료되지 않았습니다.'},503,ch);
    const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
    if(!constantEqual(token,env.ACCESS_TOKEN))return json({error:'인증 토큰이 올바르지 않습니다.'},401,ch);
    let result;
    try {
      if(reqUrl.pathname==='/api/search'){const keywords=terms(reqUrl.searchParams.get('keyword'),1);result=await search(env,keywords[0],reqUrl.searchParams.get('limit'));}
      else if(reqUrl.pathname==='/api/trend'){const keywords=terms(reqUrl.searchParams.get('keywords'),5);result=await trends(env,keywords,reqUrl.searchParams.get('days'));}
      else if(reqUrl.pathname==='/api/compare'){
        const keywords=terms(reqUrl.searchParams.get('keywords'),5);
        const [t,s]=await Promise.all([trends(env,keywords,30),Promise.all(keywords.map(k=>search(env,k,10)))]);
        result={items:keywords.map((keyword,i)=>({keyword,total:s[i].total,data:t.results.find(x=>x.title===keyword)?.data||[]}))};
      } else if(reqUrl.pathname==='/api/blog'){
        const id=reqUrl.searchParams.get('id')||'';
        if(!/^[A-Za-z0-9_-]{2,40}$/.test(id))throw new Error('올바른 블로그 ID를 입력해 주세요.');
        result=await blogRss(id);
      }else return json({error:'지원하지 않는 경로입니다.'},404,ch);
      return json(result,200,ch);
    }catch(e){return json({error:e.message||'데이터 조회 중 오류가 발생했습니다.'},502,ch);}
  }
};
