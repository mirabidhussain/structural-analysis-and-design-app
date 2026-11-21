const c=require('./load.js'), FE=c.FE; let pass=0, fail=0;
function near(name, got, exp, tol){ const ok=Math.abs(got-exp)<=tol*Math.abs(exp)+1e-12; ok?pass++:fail++; console.log((ok?'PASS ':'FAIL ')+name+': got '+(+got).toPrecision(5)+' expected '+(+exp).toPrecision(5)); }
const E=2e8, sec={A:0.01,Iz:2e-5,Iy:1e-5,J:3e-5,E:E,G:E/2.6,gamma:78.5};
function fix(){return [1,1,1,1,1,1];}
// 1 cantilever along X, tip load -Z (bending about local z? local y is up for horizontal member -> Iz)
let m={nodes:[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:2,y:0,z:0},{x:3,y:0,z:0}],sup:{0:fix()},frames:[0,1,2].map(i=>({n1:i,n2:i+1,type:'beam',sec})),shells:[]};
let r=FE.linear(m,{P:{nodal:[{n:3,f:[0,0,-10,0,0,0]}]}},[{name:'P',f:{P:1}}]);
near('Cantilever tip deflection PL^3/3EI', -r.combos[0].U[6*3+2], 10*27/(3*E*2e-5), 1e-6);
near('Cantilever fixed-end moment (reaction My)', Math.abs(r.combos[0].reac[0][4]), 30, 1e-6);
near('Cantilever vertical reaction', r.combos[0].reac[0][2], 10, 1e-9);
// lateral load in Y bends about local z? -> horizontal member along X: local y=Z, local z=-Y -> uses Iy
r=FE.linear(m,{P:{nodal:[{n:3,f:[0,5,0,0,0,0]}]}},[{name:'P',f:{P:1}}]);
near('Cantilever weak-axis deflection PL^3/3EIy', r.combos[0].U[6*3+1], 5*27/(3*E*1e-5), 1e-6);
// 2 fixed-fixed beam UDL: end moment wL^2/12, mid deflection wL^4/384EI
m={nodes:[0,1,2,3,4].map(i=>({x:i*1.5,y:0,z:0})),sup:{0:fix(),4:fix()},frames:[0,1,2,3].map(i=>({n1:i,n2:i+1,type:'beam',sec})),shells:[]};
r=FE.linear(m,{W:{frameUDL:[0,1,2,3].map(e=>({e,w:[0,0,-12]}))}},[{name:'W',f:{W:1}}]);
let ff=r.combos[0].fr[0]; near('Fixed beam end moment wL^2/12', Math.abs(ff.f[5]), 12*36/12, 1e-6);
near('Fixed beam mid deflection wL^4/384EI', -r.combos[0].U[6*2+2], 12*Math.pow(6,4)/(384*E*2e-5), 1e-6);
let dg=FE.frameDiagram(r.combos[0].fr[1],10); near('Mid-span moment wL^2/24 (diagram)', dg[10].Mz, 12*36/24, 1e-6);
// 3 portal: rigid beam, fixed columns, sway = P h^3/(24 E I)
const big={A:1,Iz:1e3,Iy:1e3,J:1e3,E:E,G:E/2.6,gamma:0};
m={nodes:[{x:0,y:0,z:0},{x:0,y:0,z:4},{x:6,y:0,z:4},{x:6,y:0,z:0}],sup:{0:fix(),3:fix()},frames:[{n1:0,n2:1,type:'column',sec},{n1:1,n2:2,type:'beam',sec:big},{n1:2,n2:3,type:'column',sec}],shells:[],twoD:true};
r=FE.linear(m,{H:{nodal:[{n:1,f:[20,0,0,0,0,0]}]}},[{name:'H',f:{H:1}}]);
// column vertical: local y = global X -> bending about local z uses Iz
near('Portal sway Ph^3/(24EI)', r.combos[0].U[6*1], 20*64/(24*E*2e-5), 1e-3);
near('Portal base shear sum', -(r.combos[0].reac[0][0]+r.combos[0].reac[3][0]), 20, 1e-6);
// 4 P-Delta: cantilever column, axial P and lateral H, amplification 1/(1-P/Pcr)
const L=5, EI=E*2e-5, Pcr=Math.PI*Math.PI*EI/(4*L*L), P=0.3*Pcr;
m={nodes:[0,1,2,3,4,5,6,7,8,9,10].map(i=>({x:0,y:0,z:i*L/10})),sup:{0:fix()},frames:Array.from({length:10},(_,i)=>({n1:i,n2:i+1,type:'column',sec})),shells:[],twoD:true};
r=FE.linear(m,{G:{nodal:[{n:10,f:[0,0,-P,0,0,0]}]},H:{nodal:[{n:10,f:[1,0,0,0,0,0]}]}},[{name:'C',f:{G:1,H:1}}],{pdelta:true});
let d1=1*L*L*L/(3*EI); near('P-Delta amplification ~ 1/(1-P/Pcr)', r.combos[0].U[6*10]/d1, 1/(1-0.3), 0.03);
// 5 Simply supported square plate, UDL: wmax = 0.00406 q a^4 / D
function plate(n, a, t, Em, nu, clamped){
  const nodes=[], shells=[], sup={}; for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){nodes.push({x:i*a/n,y:j*a/n,z:0});}
  const id=(i,j)=>j*(n+1)+i;
  for(let j=0;j<n;j++)for(let i=0;i<n;i++)shells.push({n:[id(i,j),id(i+1,j),id(i+1,j+1),id(i,j+1)],t,mat:{E:Em,nu,gamma:0}});
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){ if(i==0||j==0||i==n||j==n) sup[id(i,j)]= clamped?[1,1,1,1,1,1]:[1,1,1,0,0,0]; }
  sup[id(n>>1,n>>1)] = sup[id(n>>1,n>>1)] || [0,0,0,0,0,1];
  return {nodes,shells,sup,frames:[],id};
}
const a=4, t=0.04, Ep=2.5e7, nu=0.3, Dp=Ep*t*t*t/(12*(1-nu*nu)), q=5;
let pm=plate(16,a,t,Ep,nu,false); r=FE.linear(pm,{Q:{shellP:pm.shells.map((s,e)=>({e,q:[0,0,-q]}))}},[{name:'Q',f:{Q:1}}]);
near('SS plate centre deflection 0.00406qa^4/D', -r.combos[0].U[6*pm.id(8,8)+2], 0.00406*q*Math.pow(a,4)/Dp, 0.02);
let ec=r.combos[0].sh[pm.id(7,7)-7]; // element near centre
let mid=r.combos[0].sh.reduce((b,s,k)=>{const cx=(pm.nodes[pm.shells[k].n[0]].x+pm.nodes[pm.shells[k].n[2]].x)/2, cy=(pm.nodes[pm.shells[k].n[0]].y+pm.nodes[pm.shells[k].n[2]].y)/2; return (Math.hypot(cx-2,cy-2)<0.2)?s:b;},null);
near('SS plate centre moment 0.0479qa^2 (|Mx| near centre)', Math.abs(mid.Mx), 0.0479*q*a*a, 0.06);
pm=plate(16,a,t,Ep,nu,true); r=FE.linear(pm,{Q:{shellP:pm.shells.map((s,e)=>({e,q:[0,0,-q]}))}},[{name:'Q',f:{Q:1}}]);
near('Clamped plate centre deflection 0.00126qa^4/D', -r.combos[0].U[6*pm.id(8,8)+2], 0.00126*q*Math.pow(a,4)/Dp, 0.03);
// 6 shear wall in XZ plane, cantilever, tip shear: d = PH^3/3EI + PH/(kGA)
const H=6, B=1.5, tw=0.2, Ew=2.5e7, nuw=0.2, nx=4, nz=16, nodes=[], sh=[], sup={};
for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++)nodes.push({x:i*B/nx,y:0,z:j*H/nz});
const wid=(i,j)=>j*(nx+1)+i;
for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)sh.push({n:[wid(i,j),wid(i+1,j),wid(i+1,j+1),wid(i,j+1)],t:tw,mat:{E:Ew,nu:nuw,gamma:0}});
for(let i=0;i<=nx;i++)sup[wid(i,0)]=fix();
const wm={nodes,shells:sh,sup,frames:[]}, Ptip=100;
r=FE.linear(wm,{P:{nodal:Array.from({length:nx+1},(_,i)=>({n:wid(i,nz),f:[Ptip/(nx+1),0,0,0,0,0]}))}},[{name:'P',f:{P:1}}]);
const Iw=tw*B*B*B/12, Gw=Ew/(2*(1+nuw));
near('Shear wall top drift PH^3/3EI + PH/(5/6 G A)', r.combos[0].U[6*wid(2,nz)], Ptip*H*H*H/(3*Ew*Iw)+Ptip*H/(5/6*Gw*tw*B), 0.03);
// 7 Truss (pinned brace) triangle: statics
const tsec={A:0.002,Iz:1e-6,Iy:1e-6,J:1e-6,E:E,G:E/2.6,gamma:0};
m={nodes:[{x:0,y:0,z:0},{x:4,y:0,z:0},{x:2,y:0,z:2}],sup:{0:[1,1,1,0,0,0],1:[0,1,1,0,0,0]},frames:[{n1:0,n2:1,type:'brace',pinned:true,sec:tsec},{n1:0,n2:2,type:'brace',pinned:true,sec:tsec},{n1:2,n2:1,type:'brace',pinned:true,sec:tsec}],shells:[],twoD:true};
r=FE.linear(m,{P:{nodal:[{n:2,f:[0,0,-10,0,0,0]}]}},[{name:'P',f:{P:1}}]);
near('Truss bottom chord tension = 5 kN', -r.combos[0].fr[0].f[0], 5, 1e-6);
near('Truss rafter compression = 7.071 kN', r.combos[0].fr[1].f[0], 5*Math.SQRT2, 1e-6);
// 8 Timoshenko shear deformation (Avy): cantilever tip deflection PL^3/3EI + PL/(G Av), and fixed beam UDL mid deflection wL^4/384EI + wL^2/(8 G Av)
const tsh=Object.assign({},sec,{Avy:0.004,Avz:0.004});
m={nodes:[0,1,2,3].map(i=>({x:i,y:0,z:0})),sup:{0:fix()},frames:[0,1,2].map(i=>({n1:i,n2:i+1,type:'beam',sec:tsh})),shells:[]};
r=FE.linear(m,{P:{nodal:[{n:3,f:[0,0,-10,0,0,0]}]}},[{name:'P',f:{P:1}}]);
near('Timoshenko cantilever tip PL^3/3EI + PL/GAv', -r.combos[0].U[6*3+2], 10*27/(3*E*2e-5)+10*3/(E/2.6*0.004), 1e-6);
m={nodes:[0,1,2,3,4].map(i=>({x:i*1.5,y:0,z:0})),sup:{0:fix(),4:fix()},frames:[0,1,2,3].map(i=>({n1:i,n2:i+1,type:'beam',sec:tsh})),shells:[]};
r=FE.linear(m,{W:{frameUDL:[0,1,2,3].map(e=>({e,w:[0,0,-12]}))}},[{name:'W',f:{W:1}}]);
near('Timoshenko fixed beam end moment still wL^2/12', Math.abs(r.combos[0].fr[0].f[5]), 36, 1e-6);
near('Timoshenko fixed beam mid deflection', -r.combos[0].U[6*2+2], 12*Math.pow(6,4)/(384*E*2e-5)+12*36/(8*E/2.6*0.004), 1e-6);
// 9 member point / partial / triangular loads (frameLoads): fixed beam L=6, P=30 at a=2 -> M1 = Pab^2/L^2, M2 = Pa^2b/L^2
m={nodes:[{x:0,y:0,z:0},{x:6,y:0,z:0}],sup:{0:fix(),1:fix()},frames:[{n1:0,n2:1,type:'beam',sec}],shells:[]};
r=FE.linear(m,{P:{frameLoads:[{e:0,k:'p',P:[0,0,-30],a:2}]}},[{name:'P',f:{P:1}}]);
near('Fixed beam point load M1 = Pab^2/L^2', Math.abs(r.combos[0].fr[0].f[5]), 30*2*16/36, 1e-9);
near('Fixed beam point load R1 = Pb^2(3a+b)/L^3', r.combos[0].reac[0][2], 30*16*(6+4)/216, 1e-9);
dg=FE.frameDiagram(r.combos[0].fr[0],6); near('Moment under the load (diagram) = 2Pa^2b^2/L^3', dg[2].Mz, 2*30*4*16/216, 1e-9);
// same load through a node: cantilever-free comparison with a split model
let m2={nodes:[{x:0,y:0,z:0},{x:2,y:0,z:0},{x:6,y:0,z:0}],sup:{0:fix(),2:fix()},frames:[{n1:0,n2:1,type:'beam',sec},{n1:1,n2:2,type:'beam',sec}],shells:[]};
let r2=FE.linear(m2,{P:{nodal:[{n:1,f:[0,0,-30,0,0,0]}]}},[{name:'P',f:{P:1}}]);
near('Member point load = nodal load on split beam (deflection under load)', FE.frameDiagram(r.combos[0].fr[0],6)[2].Mz, FE.frameDiagram(r2.combos[0].fr[0],1)[1].Mz, 1e-9);
// SS beam, triangular load 0 -> 12 kN/m over L=6: Mmax = wL^2/(9 sqrt 3) at x = L/sqrt3
m={nodes:[{x:0,y:0,z:0},{x:6,y:0,z:0}],sup:{0:[1,1,1,1,0,0],1:[0,1,1,0,0,0]},frames:[{n1:0,n2:1,type:'beam',sec}],shells:[]};
r=FE.linear(m,{T:{frameLoads:[{e:0,k:'d',w1:[0,0,0],w2:[0,0,-12],a:0,b:6}]}},[{name:'T',f:{T:1}}]);
dg=FE.frameDiagram(r.combos[0].fr[0],600); near('SS triangular load Mmax = wL^2/(9 sqrt3)', Math.max.apply(null,dg.map(q=>q.Mz)), 12*36/(9*Math.sqrt(3)), 1e-4);
near('SS triangular load reaction at heavy end = wL/3', r.combos[0].reac[1][2], 12*6/3, 1e-9);
// partial UDL on SS beam: w=10 from 1 to 4 on L=6 -> R1 = w*3*(6-2.5)/6
r=FE.linear(m,{U:{frameLoads:[{e:0,k:'d',w1:[0,0,-10],w2:[0,0,-10],a:1,b:4}]}},[{name:'U',f:{U:1}}]);
near('SS partial UDL reaction R1', r.combos[0].reac[0][2], 10*3*3.5/6, 1e-9);
console.log(`\n${pass} passed, ${fail} failed`);
