import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

const env={ALLOWED_ORIGIN:'https://tester.github.io',ACCESS_TOKEN:'test-token',NAVER_CLIENT_ID:'id',NAVER_CLIENT_SECRET:'secret'};
const req=(path,token='test-token',origin='https://tester.github.io')=>new Request('https://worker.example'+path,{headers:{Origin:origin,Authorization:'Bearer '+token}});

test('잘못된 인증은 API 호출 이전에 차단',async()=>{
  const r=await worker.fetch(req('/api/search?keyword=AI','wrong'),env);
  assert.equal(r.status,401);
});
test('다른 사이트 출처는 차단',async()=>{
  const r=await worker.fetch(req('/api/search?keyword=AI','test-token','https://other.example'),env);
  assert.equal(r.status,403);
});
test('CORS 사전요청 헤더',async()=>{
  const r=await worker.fetch(new Request('https://worker.example/api/search',{method:'OPTIONS',headers:{Origin:env.ALLOWED_ORIGIN,'Access-Control-Request-Headers':'authorization'}}),env);
  assert.equal(r.status,204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'),env.ALLOWED_ORIGIN);
});
test('키워드 검색 API 결과 매핑',async()=>{
  const old=global.fetch;
  global.fetch=async(url,options)=>{
    assert.equal(new URL(url).searchParams.get('query'),'블로그');
    assert.equal(options.headers['X-Naver-Client-Id'],'id');
    return Response.json({total:100,items:[{title:'샘플 결과',link:'https://blog.naver.com/test/1',bloggername:'테스터',postdate:'20261111'}]});
  };
  try{const r=await worker.fetch(req('/api/search?keyword='+encodeURIComponent('블로그')),env);assert.equal(r.status,200);const body=await r.json();assert.equal(body.total,100);assert.equal(body.items[0].bloggername,'테스터');}finally{global.fetch=old;}
});
test('트렌드 API는 키워드 5개 이하로 요청',async()=>{
  const old=global.fetch;
  global.fetch=async(url,options)=>{const data=JSON.parse(options.body);assert.equal(data.keywordGroups.length,2);assert.equal(data.keywordGroups[1].groupName,'여행');assert.match(data.endDate,/^\d{4}-\d{2}-\d{2}$/);return Response.json({results:data.keywordGroups.map(x=>({title:x.groupName,data:[{period:'2026-11-01',ratio:50}]}))});};
  try{const r=await worker.fetch(req('/api/trend?keywords='+encodeURIComponent('AI,여행')),env);assert.equal(r.status,200);const body=await r.json();assert.equal(body.results.length,2);}finally{global.fetch=old;}
});
test('없는 API 경로와 잘못된 RSS ID 차단',async()=>{
  const r=await worker.fetch(req('/api/unknown'),env);assert.equal(r.status,404);
  const b=await worker.fetch(req('/api/blog?id='+encodeURIComponent('../x')),env);assert.equal(b.status,502);
});
