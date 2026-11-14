const c=require('./load.js'), {FE,PO,DXF,MD,RX,XL}=c; const fs=require('fs');
const p={fck:25,fy:500,fys:250,crack:true,pcCol:2,pcBeam:1,colSec:'400x400',beamSec:'300x450',braceSec:'ISA 75x75x6',tSlab:150,tWall:200,
 ff:1.5,ffRoof:2.5,ll:3,llRoof:1.5,wall:12,parapet:3,bDL:0,bLL:0,bLLr:0,eq:true,zone:'V',I:1.2,R:5,soil:'II',sys:'rc',wind:true,vb:39,vbp:'Srinagar',terrain:2,cf:1.3,trib:4,kcol:1.2,ppd:true};
async function run(name, g, pd, push, pp){
  const P=Object.assign({},p,pp||{}); const m=MD.make(g,P); const S={m,p:P};
  S.L=MD.cases(m,P); S.cb=MD.combos(S.L.cases,P.method); S.res=FE.linear(m,S.L.cases,S.cb,{pdelta:pd}); S.res.pd=pd; S.res.incMap={}; S.cb.forEach(c0=>S.res.incMap[c0.name]=c0.inc||1); S.des=MD.design(m,S.res,P); S.drift=MD.drift(m,S.res);
  if(push){ const top=m.nodes.map((n,i)=>i).filter(i=>m.nodes[i].z>Math.max(...m.nodes.map(n=>n.z))-0.01);
    S.po=PO.run(m,{gravity:{self:1,frameUDL:S.L.cases.DL.frameUDL,shellP:S.L.cases.DL.shellP},pattern:PO.pattern(m,S.L.W,0,'parabolic'),ctrl:top[0],dir:0,dmax:0.3,pdelta:true,maxEvents:40}); S.po.dir=0; S.po.H=Math.max(...m.nodes.map(n=>n.z)); }
  const wb=RX.build(S); const u8=await wb.bytesAsync(); fs.writeFileSync(__dirname+'/'+name,u8); console.log(name,(u8.length/1024).toFixed(0)+' kB', wb.sheets.map(s=>s.name+':'+s.rows.length).join(' '));
}
(async()=>{
  await run('w3d.xlsx', MD.generate({bx:'4,4,4',by:'5,5',hs:'3.5,3.2,3.2',slabs:true,walls:true,mesh:1}), false, false, {method:'wsm'});
  await run('wst.xlsx', MD.generate({bx:'6,6',by:'5',hs:'4,4',slabs:false,brace:true,mesh:1}), false, false, {method:'wsm',colSec:'ISMB 300',beamSec:'ISMB 250',sys:'steel',bDL:15,bLL:8});
  await run('x3d.xlsx', MD.generate({bx:'4,4,4',by:'5,5',hs:'3.5,3.2,3.2',slabs:true,walls:true,mesh:1}), false, false);
  await run('x2d.xlsx', MD.generate({bx:'5,4',by:'',hs:'3.5,3.2',twoD:true,mesh:1}), true, true, {bDL:20,bLL:10});
  await run('xsteel.xlsx', MD.generate({bx:'6,6',by:'5',hs:'4,4',slabs:false,brace:true,mesh:1}), false, false, {colSec:'ISMB 300',beamSec:'ISMB 250',sys:'steel',bDL:15,bLL:8});
  // module report
  const r=c.RCC.beam? null:null;
})();
