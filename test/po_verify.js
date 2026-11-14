const c=require('./load.js'), FE=c.FE, PO=c.PO; let pass=0,fail=0;
function near(n,g,e,t){const ok=Math.abs(g-e)<=t*Math.abs(e);ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+': got '+(+g).toPrecision(5)+' expected '+(+e).toPrecision(5));}
const E=2e8, Mp=100;
const sec={A:0.01,Iz:2e-5,Iy:1e-5,J:3e-5,E,G:E/2.6,gamma:0,kind:'steel',Mpz0:Mp,Mpz:()=>Mp,Mpy:()=>Mp,Pc:1e9,Pt:1e9};
function fix(){return[1,1,1,1,1,1];}
// fixed-base portal, sway mechanism: H = 4Mp/h
let h=4, m={nodes:[{x:0,y:0,z:0},{x:0,y:0,z:h},{x:6,y:0,z:h},{x:6,y:0,z:0}],sup:{0:fix(),3:fix()},frames:[{n1:0,n2:1,type:'column',sec},{n1:1,n2:2,type:'beam',sec},{n1:2,n2:3,type:'column',sec}],shells:[],twoD:true};
let r=PO.run(m,{gravity:{},pattern:[{n:1,f:[1,0,0,0,0,0]}],ctrl:1,dir:0,dmax:0.5});
near('Portal sway collapse 4Mp/h',r.Vmax,4*Mp/h,1e-6); console.log('  stop:',r.stop,'hinges',r.hinges.length);
// propped cantilever beam point load at mid: Pc = 6Mp/L
let L=6; m={nodes:[0,1,2].map(i=>({x:i*L/2,y:0,z:0})),sup:{0:fix(),2:[1,1,1,1,0,1]},frames:[{n1:0,n2:1,type:'beam',sec},{n1:1,n2:2,type:'beam',sec}],shells:[],twoD:true};
r=PO.run(m,{gravity:{},pattern:[{n:1,f:[0,0,1,0,0,0]}],ctrl:1,dir:2,dmax:0.5});
near('Propped cantilever collapse 6Mp/L',r.Vmax,6*Mp/L,1e-6);
// P-Delta reduces portal capacity: with gravity P on each column, mechanism load ~ (4Mp - 2P*delta)/h -> lower than 4Mp/h and negative slope after
m={nodes:[{x:0,y:0,z:0},{x:0,y:0,z:h},{x:6,y:0,z:h},{x:6,y:0,z:0}],sup:{0:fix(),3:fix()},frames:[{n1:0,n2:1,type:'column',sec},{n1:1,n2:2,type:'beam',sec},{n1:2,n2:3,type:'column',sec}],shells:[],twoD:true};
r=PO.run(m,{gravity:{nodal:[{n:1,f:[0,0,-400,0,0,0]},{n:2,f:[0,0,-400,0,0,0]}]},pattern:[{n:1,f:[1,0,0,0,0,0]}],ctrl:1,dir:0,dmax:0.5,pdelta:true});
{const V=r.curve[r.curve.length-1][1], Ms=Math.abs(r.F[0][5])+Math.abs(r.F[0][11])+Math.abs(r.F[2][5])+Math.abs(r.F[2][11]);
near('P-Delta equilibrium V*h + sum(P*delta) = sum column end moments',V*h+800*r.du,Ms,0.002);
const ok=V<0.7*4*Mp/h; ok?pass++:fail++; console.log((ok?'PASS ':'FAIL ')+'P-Delta: frame goes unstable after base hinges (V='+V.toFixed(1)+' kN < 4Mp/h, '+r.stop+')');}
// RCC-type P-M interaction: Mp drops with axial load
const sec2=Object.assign({},sec,{Mpz:N=>Math.max(1,Mp*(1-Math.pow(N/2000,2)))});
m.frames[0].sec=sec2; m.frames[2].sec=sec2;
r=PO.run(m,{gravity:{nodal:[{n:1,f:[0,0,-800,0,0,0]},{n:2,f:[0,0,-800,0,0,0]}]},pattern:[{n:1,f:[1,0,0,0,0,0]}],ctrl:1,dir:0,dmax:0.5});
const exp=4*Mp*(1-0.16)/h; near('Sway mechanism with P-M reduced column Mp (0.84Mp)',r.Vmax,exp,0.03);
console.log(r.hinges.map(h=>`m${h.k+1}${h.end} rot=${h.rot.toFixed(4)} ${h.state}`).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
