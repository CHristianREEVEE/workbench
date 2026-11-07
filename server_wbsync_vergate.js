// 工作台云同步后端：单文件 Node + JSON
const http = require('http');
const fs = require('fs');
const DB = '/opt/wbsync/data.json';   // 轻量 JSON 存储（键值对）
const PORT = 3210;
const PASS = '04aaf059e163090a20326ad431957248'; // 强随机串（2026-10-19 换：原 wb_sync_2026 可从前端 JS 扒到）
const VER_KEY = '_ver';               // 数据版本号（2026-11-07 版本闸）：每次成功写入 +1

function load(){ try { return JSON.parse(fs.readFileSync(DB,'utf8')); } catch { return {}; } }
function save(d){ fs.writeFileSync(DB, JSON.stringify(d)); }
function getVersion(d){ return (d && typeof d[VER_KEY]==='number') ? d[VER_KEY] : 0; }
function body(req){
  return new Promise(res=>{
    let b=''; req.on('data',c=>b+=c); req.on('end',()=>{ try{res(JSON.parse(b))}catch{res(null)} });
  });
}

http.createServer(async (req,res)=>{
  const u = new URL(req.url, 'http://x');
  const auth = (u.searchParams.get('k')||req.headers['x-sync-key']||'') === PASS;
  const json = (code,obj)=>{ res.writeHead(code, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,X-Sync-Key'}); res.end(JSON.stringify(obj)); };
  if (req.method==='OPTIONS') return json(200,{ok:1});
  if (!auth) return json(401, {ok:0, err:'unauthorized'});

  if (req.method==='GET'  && u.pathname==='/api/all') {
    const d = load();
    const t = Object.keys(d).length;
    return json(200, {ok:1, keys:t, data:d, ver:getVersion(d)});
  }
  if (req.method==='POST' && u.pathname==='/api/sync') {
    const b = await body(req);
    if (!b || typeof b!=='object') return json(400,{ok:0,err:'bad json'});
    const d = load();
    const cur = getVersion(d);
    // ===== 版本闸（2026-11-07 多端覆盖事故）=====
    // 客户端必须带 bv（=自己 pull 时的版本）：落后于当前版本 → 409 拒绝，防旧设备全量覆盖云端新数据；
    // 不带 bv（旧版前端）→ 一律 409，旧客户端在升级到带版本号的新代码前无法写入云端。
    const bvRaw = u.searchParams.get('bv');
    const bv = bvRaw === null ? NaN : parseInt(bvRaw, 10);
    if (!Number.isInteger(bv) || bv !== cur) return json(409, {ok:0, err:'stale', ver:cur});
    // ==========================================
    let merged=0;
    const replace = u.searchParams.get('mode')==='replace';  // replace 模式：客户端用户操作的最新状态，数组直接替换（让删除/取消生效）
    // 合并策略：数字/数组取更大/更长者；字符串非空覆盖空；对象递归合并（数值取大）；replace 模式下数组直接替换
    for (const k in b){
      if (k === VER_KEY) continue;  // 版本号只由服务端维护
      const nv = b[k], ov = d[k];
      if (ov===undefined) { d[k]=nv; merged++; continue; }
      if (replace && Array.isArray(nv)) { d[k]=nv; merged++; continue; }
      if (typeof nv==='number' && typeof ov==='number') { d[k]=Math.max(ov,nv); merged++; }
      else if (Array.isArray(nv) && Array.isArray(ov)) { const seen=new Set(); const out=[]; for (const x of [...ov,...nv]) { const s=JSON.stringify(x); if(!seen.has(s)){seen.add(s); out.push(x);} } d[k]=out; merged++; }
      else if (typeof nv==='object' && typeof ov==='object') { for(const k2 in nv){ if(k2===VER_KEY) continue; const a=ov[k2],b2=nv[k2]; ov[k2]= (typeof a==='number'&&typeof b2==='number')?Math.max(a,b2):(b2!==undefined?b2:a); } merged++; }
      else if (nv) { d[k]=nv; merged++; }
    }
    d[VER_KEY] = cur + 1;
    save(d);
    return json(200, {ok:1, merged, ver: cur+1, keys:Object.keys(d).length});
  }
  if (req.method==='GET' && u.pathname==='/api/ping') return json(200,{ok:1,ts:Date.now()});
  return json(404,{ok:0,err:'not found'});
}).listen(PORT, ()=>console.log('wbsync on', PORT));
