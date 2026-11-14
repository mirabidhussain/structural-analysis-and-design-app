const c=require('./load.js'), {FE,PO,DXF,MD}=c; let pass=0,fail=0;
function chk(n,ok,info){ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(info?': '+info:''));}
const p={fck:25,fy:500,fys:250,crack:true,pcCol:2,pcBeam:1,colSec:'400x400',beamSec:'300x450',braceSec:'ISA 75x75x6',tSlab:150,tWall:200,
 ff:1.5,ffRoof:2.5,ll:3,llRoof:1.5,wall:12,parapet:3,bDL:0,bLL:0,bLLr:0,eq:true,zone:'V',I:1.2,R:5,soil:'II',sys:'rc',wind:true,vb:39,terrain:2,cf:1.3,trib:4,kcol:1.2};
let t0=Date.now();
const g=MD.generate({bx:'4,4,4',by:'5,5',hs:'3.5,3.2,3.2',slabs:true,mesh:1});
const m=MD.make(g,p); console.log('nodes',m.nodes.length,'frames',m.frames.length,'shells',m.shells.length,'warn',m.warn);
const L=MD.cases(m,p); const cb=MD.combos(L.cases);
console.log('EQ',JSON.stringify(L.eq.EQX), 'W', L.Wt.toFixed(0));
const res=FE.linear(m,L.cases,cb,{}); console.log('neq',res.info.neq,'sky',res.info.size,'t',Date.now()-t0,'ms');
// equilibrium: total vertical reaction = total vertical load for 1.5(DL+LL)
let Rz=0; Object.values(res.combos[0].reac).forEach(r=>Rz+=r[2]);
const Fz=-1.5*(Array.from(res.cases.DL.lv.Ffull).filter((v,i)=>i%6==2).reduce((a,b)=>a+b,0)+Array.from(res.cases.LL.lv.Ffull).filter((v,i)=>i%6==2).reduce((a,b)=>a+b,0));
chk('Gravity equilibrium sum Rz = applied',Math.abs(Rz-Fz)<1e-6*Fz,Rz.toFixed(2)+' vs '+Fz.toFixed(2));
let Rx=0; const eqc=res.combos.find(c=>c.name.startsWith('1.5(DL+EQX')); Object.values(eqc.reac).forEach(r=>Rx+=r[0]);
chk('Base shear reaction = -1.5Vb',Math.abs(Rx+1.5*L.eq.EQX.Vb)<1e-6*L.eq.EQX.Vb,Rx.toFixed(2)+' vs '+(-1.5*L.eq.EQX.Vb).toFixed(2));
const des=MD.design(m,res,p); console.log('fails',des.fails,'beams',des.beams.length,'cols',des.cols.length,'slabs',des.slabs.length);
console.log(des.beams.slice(0,2).map(b=>JSON.stringify({Ms:b.Ms.toFixed(1),Mh:b.Mh.toFixed(1),V:b.V.toFixed(1),Ab:b.Ab|0,At:b.At|0,sv:b.sv,ok:b.ok,msg:b.msg})).join('\n'));
console.log(des.cols.slice(0,2).map(b=>JSON.stringify({Pu:b.Pu.toFixed(0),need:b.need&&b.need.pc,bars:b.bars,msg:b.msg})).join('\n'));
const smax=des.slabs.reduce((a,s)=>Math.max(a,s.bx,s.by),0); console.log('slab max sagging WA moment',smax.toFixed(2));
console.log(MD.drift(m,res).slice(0,3));
t0=Date.now();
// pushover on same model in X
const po=PO.run(m,{gravity:{self:1,frameUDL:L.cases.DL.frameUDL,shellP:L.cases.DL.shellP.concat(L.cases.LL.shellP.map(q=>({e:q.e,q:q.q.map(v=>v*0.25)})))},pattern:PO.pattern(m,L.W,0,'parabolic'),ctrl:m.nodes.findIndex(n=>n.z>9.8&&n.x==0&&n.y==0),dir:0,dmax:0.4,pdelta:true,maxEvents:80});
console.log('pushover',po.stop,'Vmax',po.Vmax.toFixed(0),'events',po.events.length,'du',po.du.toFixed(3),'t',Date.now()-t0,'ms','Vb design',L.eq.EQX.Vb.toFixed(0));
chk('Pushover capacity exceeds design base shear',po.Vmax>L.eq.EQX.Vb);
// DXF round trip
const txt=DXF.write(m); const dx=DXF.parse(txt); const g2=DXF.build(dx,{mode:'3d',scale:1,roles:{},mesh:1});
chk('DXF round-trip nodes/frames/shells',g2.nodes.length===m.nodes.length&&g2.frames.length===m.frames.length&&g2.shells.length===m.shells.length,g2.nodes.length+'/'+g2.frames.length+'/'+g2.shells.length);
// 2D DXF with LWPOLYLINE, mm units, support points
const d2=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES',
'0','LWPOLYLINE','8','COL_300x450','90','3','70','0','10','0','20','0','10','0','20','3500','10','0','20','7000',
'0','LWPOLYLINE','8','COL_300x450','90','3','70','0','10','6000','20','0','10','6000','20','3500','10','6000','20','7000',
'0','LINE','8','BEAM 300x500','10','0','20','3500','30','0','11','6000','21','3500','31','0',
'0','LINE','8','BEAM 300x500','10','0','20','7000','30','0','11','6000','21','7000','31','0',
'0','POINT','8','SUPPORT','10','0','20','0','30','0','0','POINT','8','SUPPORT','10','6000','20','0','30','0','0','TEXT','8','0','0','ENDSEC','0','EOF'].join('\n');
const dd=DXF.parse(d2); const g3=DXF.build(dd,{mode:'2d',scale:DXF.UNITS[dd.units],roles:{},mesh:1});
chk('2D DXF: 6 nodes, 6 members, 2 supports',g3.nodes.length===6&&g3.frames.length===6&&Object.keys(g3.sup).length===2,JSON.stringify([g3.nodes.length,g3.frames.length,dd.warn]));
const m3=MD.make(g3,Object.assign({},p,{bDL:20,bLL:10})); chk('Layer section hints used',m3.frames.find(f=>f.type==='beam').sec.name==='300x500'&&m3.frames.find(f=>f.type==='column').sec.name==='300x450');
const L3=MD.cases(m3,Object.assign({},p,{bDL:20,bLL:10})); const r3=FE.linear(m3,L3.cases,MD.combos(L3.cases),{pdelta:true});
chk('2D frame P-Delta analysed',r3.combos.length===13,'amp '+r3.combos[1].pdAmp.toFixed(3));
console.log(`\n${pass} passed, ${fail} failed`);
