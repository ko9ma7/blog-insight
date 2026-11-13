/* 블로그 인사이트: GitHub Pages용 순수 브라우저 프런트엔드.
 * API 키/비밀번호는 소스코드에 작성하지 않습니다. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const css = ['#4c95ff','#19cb80','#ffb84b','#b084ff','#ff627c'];
  const defaults = ['AI 활용','챗GPT','블로그 수익화','여행 추천','노트북 추천'];
  const load = (k, fallback) => { try { return JSON.parse(localStorage.getItem('bi_' + k)) ?? fallback; } catch { return fallback; } };
  const save = (k, data) => { try { localStorage.setItem('bi_' + k, JSON.stringify(data)); } catch {} };
  const state = { url: load('workerUrl',''), token: (() => { try { return sessionStorage.getItem('bi_token') || ''; } catch { return ''; } })(), watch: load('watch', defaults), recent: load('recent',['AI','여행','블로그']), blogId:load('blogId',''), keyword:'AI', lastAnalysis:null, compareData:null, risingData:null };
  const isLive = () => Boolean(state.url && state.token);
  const escapeHtml = (val) => String(val ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cleanText = (text) => String(text || '').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"');
  const number = (n) => n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('ko-KR');
  const date = (d) => d.toISOString().slice(0,10);
  const minusDays = (days) => { const d = new Date(); d.setDate(d.getDate()-days); return d; };
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const splitTerms = (v,max=5) => [...new Set(String(v||'').split(',').map(t=>t.trim()).filter(Boolean))].slice(0,max);
  const notice = (message, type='info') => { const n=$('notice'); n.hidden=!message; n.className='notice '+type; n.textContent=message || ''; };
  const loading = (target,text='데이터를 불러오는 중입니다…') => { $(target).innerHTML = `<div class="empty-state"><span class="loader"></span>${escapeHtml(text)}</div>`; };
  const showEmpty = (id,text) => { $(id).innerHTML=`<div class="empty-state">${escapeHtml(text)}</div>`; };
  function syncMode(){const b=$('modeBadge');b.className='state-pill '+(isLive()?'live':'sample');b.textContent=isLive()?'API 연결 모드':'샘플 모드';}
  async function api(path,params={}) {
    const query = new URLSearchParams(params).toString();
    if(!isLive()) throw new Error('API 연결 설정이 필요합니다.');
    const url=state.url.replace(/\/+$/,'') + '/api/' + path + (query?'?'+query:'');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),18000);
    try {
      const response=await fetch(url,{headers:{Authorization:'Bearer '+state.token,Accept:'application/json'},signal:controller.signal});
      let result;try{result=await response.json();}catch{throw new Error('서버가 JSON을 반환하지 않았습니다.');}
      if(!response.ok || result.error) throw new Error(result.error || 'HTTP '+response.status);
      return result;
    } catch(err){if(err.name==='AbortError') throw new Error('요청 제한 시간을 초과했습니다.'); throw err;}
    finally{clearTimeout(timer);}
  }
  function demoHash(s){let h=177;for(const ch of s) h=(h*31+ch.charCodeAt(0))>>>0;return h;}
  function demoTrend(word,days=30){const seed=demoHash(word), data=[];for(let i=days-1;i>=0;i--){const p=days-1-i, wave=11*Math.sin(p*.44+seed%9)+7*Math.sin(p*.16+seed%5), rise=(seed%8-3)*p/6, jitter=((seed*(p+1)*17)%23-11)/1.7;data.push({period:date(minusDays(i)),ratio:Math.round(clamp(40+wave+rise+jitter,4,100)*10)/10});}return data;}
  const demoBlogNames=['기록하는 하루','오늘의 정보노트','테크생활 연구소','작은 발견','다음 여행을 위해','알쓸 기록장','오늘의 픽','소소한 선택','인사이트 메모','새로운 일상'];
  function demoSearch(word){const seed=demoHash(word);const total=1800+(seed%24000);return {query:word,total,items:Array.from({length:10},(_,i)=>({bloggername:demoBlogNames[i],title:`${word} ${['초보자 가이드와 시작 방법','활용법 총정리','핵심 포인트 7가지','직접 써본 후기','처음 시작할 때 알아야 할 점','장단점 비교','입문자 추천 팁','핵심 기능 알아보기','실전 체크리스트','올해 업데이트 정리'][i]}`,link:'https://search.naver.com/search.naver?where=blog&query='+encodeURIComponent(word),postdate:date(minusDays((seed+i*9)%240)).replaceAll('-',''),bloggerlink:'https://blog.naver.com/example'+i})),sample:true};}
  function parseDate(x){ if(!x) return null; const clean=String(x).replace(/[^0-9]/g,'');if(clean.length<8)return null;const y=+clean.slice(0,4), m=+clean.slice(4,6), d=+clean.slice(6,8);const r=new Date(y,m-1,d);return isNaN(+r)?null:r; }
  function briefDate(x){const d=parseDate(x);return d?`${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`:'—';}
  function changeRates(points){const series=(points||[]).map(x=>Number(x.ratio)||0); if(series.length<14)return {current:null,previous:null,change:null};const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;const current=avg(series.slice(-7)),previous=avg(series.slice(-14,-7));return {current,previous,change: previous>0.01?((current-previous)/previous)*100:null};}
  function fmtPct(p){return p==null?'비교 불가':(p>=0?'+':'')+p.toFixed(1)+'%';}
  function smoothSvg(points,{height=155,color=css[0],fill=true,labels=false}={}){
    const w=640,h=height,left=labels?34:4,top=9,bottom=labels?26:9,right=8, cw=w-left-right,ch=h-top-bottom;
    const values=(points||[]).map(p=>Number(p.ratio) || 0);
    if(!values.length)return '<div class="empty-state">추세 데이터가 없습니다.</div>';
    const maxi=Math.max(100,...values);const pts=values.map((v,i)=>[left+(values.length===1?0:cw*i/(values.length-1)),top+ch-(v/maxi)*ch]);
    const path=pts.map((v,i)=>(i?'L':'M')+v.map(n=>n.toFixed(1)).join(' ')).join(' ');
    const area=`${path} L ${left+cw} ${top+ch} L ${left} ${top+ch} Z`;
    let marks='';if(labels){for(let i=0;i<=4;i++){const y=top+ch*i/4;marks+=`<line x1="${left}" x2="${w-right}" y1="${y}" y2="${y}" stroke="#272d35" stroke-width="1"/><text x="3" y="${y+4}">${Math.round(maxi*(1-i/4))}</text>`;}if(points.length>1){for(let i=0;i<3;i++){let ix=Math.round(i*(points.length-1)/2); marks+=`<text x="${pts[ix][0]}" y="${h-4}" text-anchor="middle">${escapeHtml(points[ix].period?.slice(5) || '')}</text>`;}}}
    const gid='grad'+Math.round(Math.random()*1e8);
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="검색 관심도 변화 선 그래프"><defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>${marks}${fill?`<path d="${area}" fill="url(#${gid})"/>`:''}<path d="${path}" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" fill="none" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function multiSvg(results){const items=(results||[]).filter(v=>v.data?.length);if(!items.length)return '<div class="empty-state">표시할 데이터가 없습니다.</div>';
    const w=780,h=255,left=33,right=12,top=15,bottom=28,cw=w-left-right,ch=h-top-bottom;
    let html='';for(let i=0;i<=4;i++){const y=top+ch*i/4;html+=`<line x1="${left}" x2="${w-right}" y1="${y}" y2="${y}" stroke="#272d35"/><text x="0" y="${y+4}">${100-i*25}</text>`;}
    for(let j=0;j<items.length;j++){const v=items[j], coords=v.data.map((p,i)=>[left+(v.data.length>1?i*cw/(v.data.length-1):0),top+ch-(Number(p.ratio)||0)/100*ch]);const path=coords.map((p,i)=>(i?'L':'M')+p.join(' ')).join(' ');html+=`<path d="${path}" stroke="${css[j%css.length]}" stroke-width="2.5" fill="none" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;}
    const data=items[0].data;for(let i=0;i<3;i++){const ix=Math.round((data.length-1)*i/2);html+=`<text x="${left+cw*i/2}" y="${h-4}" text-anchor="middle">${escapeHtml(data[ix]?.period?.slice(5)||'')}</text>`;}
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="키워드별 검색 관심도 비교 그래프">${html}</svg>`;
  }
  function keywordItems(){const terms=state.watch.filter(x=>x && x.length<=80).slice(0,20);return [...new Set(terms)];}
  function updateFavorite(){ $('favoriteKeywordBtn').textContent=state.watch.includes(state.keyword)?'★':'☆';$('favoriteKeywordBtn').classList.toggle('favorited',state.watch.includes(state.keyword)); }
  function renderRecents(){ $('recentKeywords').innerHTML=state.recent.slice(0,6).map(t=>`<button class="tag" type="button" data-recent="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join(''); }
  function renderWatch(){const terms=keywordItems();$('watchCount').textContent=terms.length+'개';$('watchChips').innerHTML=terms.map(t=>`<span class="tag">${escapeHtml(t)}<button class="remove" data-remove="${escapeHtml(t)}" title="키워드 삭제">×</button></span>`).join('')||'<span class="subtle">관심 키워드를 추가해 주세요.</span>';updateFavorite();}
  function addWatch(t){t=String(t||'').trim().slice(0,80);if(!t)return;if(state.watch.includes(t))return; if(state.watch.length>=20){notice('관심 키워드는 20개까지 저장할 수 있습니다.','error');return;}state.watch.push(t);save('watch',state.watch);renderWatch();}
  function tab(t){ if(!['analysis','custom','trend','rising','myblog'].includes(t))t='analysis';document.querySelectorAll('.tab').forEach(el=>{const active=el.dataset.tab===t;el.classList.toggle('active',active);el.setAttribute('aria-selected',String(active));});document.querySelectorAll('.panel').forEach(el=>{el.hidden=el.id!=='panel-'+t;el.classList.toggle('active',el.id==='panel-'+t);});notice('');if(t==='custom')renderWatch();if(t==='myblog')$('blogInput').value=state.blogId; }
  function goTab(t){location.hash=t;tab(t);}
  function cardsFromSearch(res){const items=res?.items||[];const cutoff=minusDays(30);const unique=new Set(items.map(x=>cleanText(x.bloggerlink||x.bloggername))).size;const recent=items.filter(x=>{const d=parseDate(x.postdate);return d && d>=cutoff;}).length;
    $('blogTotal').textContent=number(res?.total);$('sampleResults').textContent=number(items.length);$('uniqueBlogs').textContent=number(unique);$('recentPosts').textContent=number(recent);$('resultCount').textContent=items.length+'개 표시';
    const now=new Date(), counts=[];for(let n=5;n>=0;n--){const d=new Date(now.getFullYear(),now.getMonth()-n,1),count=items.filter(it=>{const p=parseDate(it.postdate);return p&&p.getFullYear()===d.getFullYear()&&p.getMonth()===d.getMonth();}).length;counts.push({label:`${d.getMonth()+1}월`,count});}const max=Math.max(1,...counts.map(x=>x.count));$('publishBars').innerHTML=counts.map(x=>`<div class="bar-item"><strong>${x.count}</strong><div class="bar" style="height:${Math.max(3,x.count/max*66)}px"></div><small>${x.label}</small></div>`).join('');
    const rows=items.slice(0,20).map((it,i)=>{let link='';try{const u=new URL(it.link);if(['https:','http:'].includes(u.protocol))link=u.href;}catch{};return `<tr><td><span class="rankbox">${i+1}</span></td><td>${escapeHtml(cleanText(it.bloggername)||'—')}</td><td><a href="${escapeHtml(link||'https://search.naver.com')}" target="_blank" rel="noopener noreferrer" title="원본 보기">${escapeHtml(cleanText(it.title))}</a></td><td>${briefDate(it.postdate)}</td></tr>`}).join('');$('resultsBody').innerHTML=rows||'<tr><td colspan="4">검색 결과가 없습니다.</td></tr>';
    return {unique,recent};
  }
  function summary(res,trend){const n=Number(res?.total),rates=changeRates(trend||[]);const score=Number.isFinite(n)?(n<5000?'상대적으로 적음':n<25000?'보통':'많음'):'분석 불가';const val= rates.change==null?'변화 계산 불가':rates.change>=15?'관심도 상승':rates.change<=-15?'관심도 하락':'관심도 유지';$('summaryChips').innerHTML=`<span class="chip blue">검색 결과 ${number(res?.total)}건</span><span class="chip">경쟁 문서 ${escapeHtml(score)}</span><span class="chip ${rates.change>=15?'green':'orange'}">${val}</span>${!isLive()?'<span class="chip orange">데모 데이터</span>':''}`;}
  async function analyze(word){ word=String(word||'').trim();if(!word)return;state.keyword=word;$('keywordInput').value=word;$('keywordTitle').textContent=word;$('analysisTime').textContent='분석 시각: '+new Date().toLocaleString('ko-KR');state.recent=[word,...state.recent.filter(x=>x!==word)].slice(0,7);save('recent',state.recent);renderRecents();updateFavorite();notice('');$('blogTotal').textContent='…';$('trendChart').innerHTML='';$('resultsBody').innerHTML='<tr><td colspan="4">불러오는 중…</td></tr>';
    let result=null, trend=null, errors=[];
    if(isLive()){
      const [a,b]=await Promise.allSettled([api('search',{keyword:word,limit:20}),api('trend',{keywords:word,days:30})]);if(a.status==='fulfilled')result=a.value;else errors.push('블로그 검색: '+a.reason.message);if(b.status==='fulfilled')trend=b.value.results?.[0]?.data||[];else errors.push('트렌드: '+b.reason.message);
    } else {result=demoSearch(word);trend=demoTrend(word);}
    if(result)cardsFromSearch(result); else { $('blogTotal').textContent='—'; $('sampleResults').textContent='—';$('uniqueBlogs').textContent='—';$('recentPosts').textContent='—';$('publishBars').innerHTML='';$('resultsBody').innerHTML='<tr><td colspan="4">검색 결과를 읽지 못했습니다.</td></tr>';}
    if(trend){$('trendChart').innerHTML=smoothSvg(trend,{labels:true});const r=changeRates(trend);$('trendDelta').innerHTML=`<span>최근 7일 평균 관심도 ${r.current==null?'—':r.current.toFixed(1)}</span><span>직전 7일 대비 ${fmtPct(r.change)}</span>`;}
    else {showEmpty('trendChart','트렌드 데이터를 불러오지 못했습니다.');$('trendDelta').textContent='';}
    summary(result,trend);state.lastAnalysis={keyword:word,result,trend};if(errors.length)notice(errors.join(' / '),'error');
    else if(!isLive())notice('현재 표시된 숫자와 그래프는 실제 네이버 데이터가 아닌 샘플입니다. 우측 상단 ⚙에서 Worker를 연결하세요.');
  }
  function avg(xs){return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;}
  function scoreCompare(items){const totals=items.filter(v=>Number.isFinite(+v.total)).map(v=>+v.total);const min=Math.min(...totals),max=Math.max(...totals);return items.map(it=>{const rates=changeRates(it.data),current=rates.current||0,competition=(Number.isFinite(+it.total))?(max===min?50:100*(max-Number(it.total))/(max-min)):0;const momentum=clamp(50+(rates.change||0)/2,0,100);const score=Math.round(current*.45+competition*.4+momentum*.15);return {...it,score,trendCurrent:current,momentum:rates.change};}).sort((a,b)=>b.score-a.score);}
  async function compare(){const terms=keywordItems().slice(0,5);if(!terms.length){notice('비교할 관심 키워드가 없습니다.','error');return;}$('compareBtn').disabled=true;loading('compareChart');$('compareTable').innerHTML='';notice('');try{
    let data;
    if(isLive()){data=await api('compare',{keywords:terms.join(',')});}else{data={items:terms.map(t=>({keyword:t,total:demoSearch(t).total,data:demoTrend(t)}))};}
    const items=scoreCompare(data.items||[]);state.compareData=items;$('compareChart').innerHTML=multiSvg(items.map(i=>({title:i.keyword,data:i.data})));$('compareTable').innerHTML=`<table><thead><tr><th>추천</th><th>키워드</th><th>참고점수</th><th>검색 결과 수</th><th>7일 변화</th><th></th></tr></thead><tbody>${items.map((it,i)=>`<tr><td><span class="rankbox">${i+1}</span></td><td>${escapeHtml(it.keyword)}</td><td class="score">${it.score}</td><td>${number(it.total)}</td><td>${fmtPct(it.momentum)}</td><td><button class="outline" data-analyze="${escapeHtml(it.keyword)}">분석</button></td></tr>`).join('')}</tbody></table>`;
    if(!isLive())notice('샘플 데이터로 추천 점수를 계산했습니다. 실제 결과가 아닙니다.');
  }catch(e){showEmpty('compareChart',e.message);notice(e.message,'error');}finally{$('compareBtn').disabled=false;}}
  async function showTrend(terms){terms=terms.slice(0,5);if(!terms.length)return;loading('multiTrendChart');$('trendCards').innerHTML='';$('trendSeriesLegend').innerHTML='';notice('');try{
    const data=isLive()?await api('trend',{keywords:terms.join(','),days:30}):{results:terms.map(t=>({title:t,data:demoTrend(t)}))};const results=data.results||[];
    $('multiTrendChart').innerHTML=multiSvg(results);$('trendSeriesLegend').innerHTML=results.map((x,i)=>`<span><i class="legend-dot" style="background:${css[i%css.length]}"></i>${escapeHtml(x.title)}</span>`).join('');$('trendCards').innerHTML=results.map((it,i)=>{const r=changeRates(it.data);return `<article class="trend-card"><h3><span class="legend-dot" style="background:${css[i%css.length]}"></span>${escapeHtml(it.title)}</h3><div class="value">${r.current==null?'—':r.current.toFixed(1)}</div><p class="subtle">최근 7일 평균 상대지수</p><div class="${r.change>=0?'up':'down'}">직전 7일 대비 ${fmtPct(r.change)}</div></article>`}).join('');
    if(!isLive())notice('이 그래프는 샘플입니다. 실제 검색 트렌드는 Worker 연결 후 표시됩니다.');
  }catch(e){showEmpty('multiTrendChart',e.message);notice(e.message,'error');}}
  async function showRising(){const terms=splitTerms($('risingTerms').value,15);if(!terms.length)return;loading('risingGrid');$('refreshRising').disabled=true;notice('');try{
    let results=[];
    if(isLive()){for(let i=0;i<terms.length;i+=5){const data=await api('trend',{keywords:terms.slice(i,i+5).join(','),days:30});results.push(...(data.results||[]));}}
    else results=terms.map(t=>({title:t,data:demoTrend(t)}));
    // 여러 배치로 얻은 검색 관심도 절대 수준은 서로 비교할 수 없으므로 증가율만 사용합니다.
    const items=results.map(r=>({...r,...changeRates(r.data)})).sort((a,b)=>(b.change??-Infinity)-(a.change??-Infinity));state.risingData=items;
    $('risingGrid').innerHTML=items.map((it,i)=>`<article class="rising-item"><div class="rank">후보 ${i+1} · ${escapeHtml(it.title)}</div><h3>${escapeHtml(it.title)}</h3><div class="${it.change==null?'none':it.change>=0?'rise':'fall'}">${fmtPct(it.change)}</div><p>최근 7일 / 이전 7일 상대지수 평균</p><div class="spark">${smoothSvg(it.data,{height:38,color:it.change>=0?css[1]:css[4]})}</div><button data-analyze="${escapeHtml(it.title)}" class="outline">분석하기</button></article>`).join('');
    if(!isLive())notice('순위는 샘플입니다. 실제 키워드 자동 수집이 아닌 입력한 후보들의 상승률 비교입니다.');
  }catch(e){showEmpty('risingGrid',e.message);notice(e.message,'error');}finally{$('refreshRising').disabled=false;}}
  function validBlogId(id){return /^[A-Za-z0-9_-]{2,40}$/.test(id);}
  async function showBlog(){const id=$('blogInput').value.trim();if(!validBlogId(id)){notice('블로그 ID는 영문·숫자·_·- 조합의 2~40자여야 합니다.','error');return;}state.blogId=id;save('blogId',id);$('customBlogId').value=id;notice('');loading('blogOutput');try{
    let result;
    if(isLive())result=await api('blog',{id});
    else result={id,title:'나의 샘플 블로그',posts:[{title:'블로그를 시작하며 꼭 알아야 할 팁',link:'https://blog.naver.com',pubDate:date(minusDays(2))},{title:'AI 도구 활용과 생산성 높이기',link:'https://blog.naver.com',pubDate:date(minusDays(5))},{title:'여행 준비 체크리스트 정리',link:'https://blog.naver.com',pubDate:date(minusDays(7))},{title:'AI 글쓰기 도구 소개',link:'https://blog.naver.com',pubDate:date(minusDays(10))}],sample:true};
    const posts=result.posts||[];const stop=new Set(['그리고','방법','정리','이야기','소개','활용','대해서','이렇게','여러분','오늘','블로그','시작','알아보기','직접','어떻게','좋은']);const terms=new Map();for(const p of posts)for(const t of cleanText(p.title).replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(x=>x.length>=2&&!stop.has(x))){terms.set(t,(terms.get(t)||0)+1);}const top=[...terms].sort((a,b)=>b[1]-a[1]).slice(0,12);
    $('blogOutput').innerHTML=`<article class="metric-card top-terms"><div class="card-label">◉ ${escapeHtml(result.title||id)}</div><p class="subtle">${escapeHtml(id)} · RSS 공개 글 ${posts.length}개${result.sample?' · 샘플':''}</p><div class="mini-divider"></div><div class="card-label">자주 쓴 제목 키워드</div>${top.map(x=>`<div class="term-row"><span>${escapeHtml(x[0])}</span><b>${x[1]}회</b></div>`).join('')||'<p class="subtle">분석할 제목이 없습니다.</p>'}</article><article class="metric-card posts-card"><div class="card-label">▤ RSS 최근 게시글</div><ul class="posts-list">${posts.map(p=>{let url='https://blog.naver.com';try{const u=new URL(p.link);if(u.protocol==='https:'||u.protocol==='http:')url=u.href;}catch{}return `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(cleanText(p.title))}</a><span>${escapeHtml(p.pubDate||'')}</span></li>`;}).join('')||'<li>최근 공개 글이 없습니다.</li>'}</ul></article>`;
    $('blogQuickStats').textContent=`${result.title||id} · RSS 공개 글 ${posts.length}개`;if(!isLive())notice('이 블로그 분석 내용은 샘플 데이터입니다.');
  }catch(e){showEmpty('blogOutput',e.message);notice(e.message,'error');}}
  function connect(){const url=$('workerUrl').value.trim().replace(/\/+$/,'');const token=$('accessToken').value.trim();if(!url&&!token){state.url='';state.token='';}else{if(!/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[^?#]*)?$/i.test(url)){ $('settingsStatus').textContent='HTTPS Worker 주소를 입력해 주세요.';return;}if(!token){$('settingsStatus').textContent='Worker 접근 토큰을 입력해 주세요.';return;}state.url=url;state.token=token;}save('workerUrl',state.url);try{sessionStorage.setItem('bi_token',state.token);}catch{}syncMode();$('settingsDialog').close();analyze(state.keyword);}
  function init(){syncMode();$('keywordInput').value=state.keyword;$('customBlogId').value=state.blogId;$('blogInput').value=state.blogId;$('workerUrl').value=state.url;$('accessToken').value=state.token;renderRecents();renderWatch();tab((location.hash||'#analysis').slice(1));
    document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>goTab(b.dataset.tab)));
    document.querySelectorAll('.global-nav a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const t=a.hash.slice(1);goTab(t);document.querySelectorAll('.global-nav a').forEach(x=>x.classList.toggle('nav-active',x===a));}));
    window.addEventListener('hashchange',()=>tab((location.hash||'#analysis').slice(1)));
    $('settingsBtn').addEventListener('click',()=>{$('settingsStatus').textContent='';$('settingsDialog').showModal();});$('helpBtn').addEventListener('click',()=>$('helpDialog').showModal());$('connectBtn').addEventListener('click',connect);
    $('demoBtn').addEventListener('click',()=>{$('workerUrl').value='';$('accessToken').value='';connect();});
    $('searchForm').addEventListener('submit',e=>{e.preventDefault();analyze($('keywordInput').value);});
    $('recentKeywords').addEventListener('click',e=>{const b=e.target.closest('[data-recent]');if(b)analyze(b.dataset.recent);});
    $('favoriteKeywordBtn').addEventListener('click',()=>{if(state.watch.includes(state.keyword))state.watch=state.watch.filter(x=>x!==state.keyword);else addWatch(state.keyword);save('watch',state.watch);renderWatch();});
    $('watchChips').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(b){state.watch=state.watch.filter(x=>x!==b.dataset.remove);save('watch',state.watch);renderWatch();}});
    const addUserTerm=()=>{addWatch($('watchInput').value);$('watchInput').value='';};$('addWatchBtn').addEventListener('click',addUserTerm);$('watchInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addUserTerm();}});
    $('saveBlogBtn').addEventListener('click',()=>{const id=$('customBlogId').value.trim();if(!validBlogId(id)){notice('올바른 블로그 ID를 입력해 주세요.','error');return;}state.blogId=id;save('blogId',id);$('blogInput').value=id;$('blogQuickStats').textContent=`${id} 저장됨 · 내 블로그 탭에서 RSS 분석 가능`;notice('블로그 ID를 저장했습니다.');});
    $('compareBtn').addEventListener('click',compare);$('trendForm').addEventListener('submit',e=>{e.preventDefault();showTrend(splitTerms($('trendTerms').value));});$('refreshRising').addEventListener('click',showRising);$('loadBlogBtn').addEventListener('click',showBlog);
    document.body.addEventListener('click',e=>{const b=e.target.closest('button[data-analyze]');if(b){goTab('analysis');analyze(b.dataset.analyze);}});
    analyze(state.keyword);showTrend(splitTerms($('trendTerms').value));
  }
  document.addEventListener('DOMContentLoaded',init);
})();
