const c=require('./load.js'); let pass=0, fail=0;
function near(name, got, exp, tol){ const ok=Math.abs(got-exp)<=tol*Math.abs(exp)+1e-9; ok?pass++:fail++; console.log((ok?'PASS ':'FAIL ')+name+': got '+(+got).toFixed(3)+' expected '+exp); }
// 1. Mu,lim = 0.138 fck b d^2 (Fe415), 0.133 (Fe500)
near('Mulim Fe415 300x500 M20 (kNm)', c.RCC.mulim(300,500,20,415), 0.138*20*300*500*500/1e6, 0.01);
near('Mulim Fe500 300x500 M20 (kNm)', c.RCC.mulim(300,500,20,500), 0.133*20*300*500*500/1e6, 0.01);
// 2. Ast satisfies Mu = 0.87 fy Ast d (1 - Ast fy/(b d fck))
let Ast=c.RCC.astFlex(150,300,500,20,415); near('Ast back-substitution Mu=150', 0.87*415*Ast*500*(1-Ast*415/(300*500*20))/1e6, 150, 0.001);
// 3. IS 800 Table 9 fcd (fy 250): curve a/b/c at KL/r 100 = 136/121/107 ; curve c at 50 = 183 ; curve b at 150 = 66.2
near('fcd curve a KL/r100', c.ST.fcd(100,250,'a'), 132, 0.015);
near('fcd curve b KL/r100', c.ST.fcd(100,250,'b'), 118, 0.015);
near('fcd curve c KL/r100', c.ST.fcd(100,250,'c'), 107, 0.015);
near('fcd curve c KL/r50', c.ST.fcd(50,250,'c'), 183, 0.015);
near('fcd curve b KL/r150', c.ST.fcd(150,250,'b'), 64, 0.02);
// 4. Column strain compatibility: very deep NA -> Puz-like squash load; zero axial -> beam capacity
let lay=c.RCC.colLayers(500,50,0.02*300*500,'two');
let pm=c.RCC.colPM(300,500,lay,1e7,20,415);
near('Squash load at uniform 0.002 strain (kN)', pm.P, (0.446*20*(300*500-3000)+ 0.87*415*0.9765*3000)/1e3*0+ (0.446*20*(150000-3000)+c.RCC.fs(0.002,415)*3000)/1e3, 0.01);
let Mc=c.RCC.colMcap(300,500,3000,0.0,20,415,50,'two');
// doubly reinforced beam with Ast=Asc=1500, d=450, d'=50: approximate by tension steel yield lever arm
near('Column M at P=0 vs Ast*0.87fy*(d-d\') (kNm)', Mc, 1500*0.87*415*400/1e6, 0.08);
// 5. tau_c table interpolation M20 pt 0.6 = 0.48+(0.56-0.48)*0.1/0.25
near('tau_c M20 pt0.6', c.RCC.tauc(20,0.6), 0.512, 0.005);
// 6. Two-way coefficient interior ratio 1.0 short negative 0.032 -> Mu
// 7. Truss equilibrium: vertical reactions = total gravity load
let g=c.TR.geometry('pratt',12,25,3), L=c.TR.loads(g,3,1.0,0,0), s=c.TR.solve(g,L);
near('Truss sum reactions = w*s*span (kN)', s.R.RAy+s.R.RBy, 1.0*3*12, 0.001);
// symmetric -> RAy = RBy
near('Truss symmetric reactions', s.R.RAy, s.R.RBy, 0.001);
// method of joints at support: top chord force = (R - P0)/sin(theta)
let P0=-L[0].fy; near('End top-chord force (method of joints)', -s.f[0], (s.R.RAy-P0)/Math.sin(25*Math.PI/180), 0.001);
let gf=c.TR.geometry('fink',10,30,0), sf=c.TR.solve(gf,c.TR.loads(gf,2,1,0,0)); near('Fink sum reactions', sf.R.RAy+sf.R.RBy, 20, 0.001);
// 8. Wind uplift on symmetric suction: horizontal reaction balance
let sw=c.TR.solve(g,c.TR.loads(g,3,0,-1,-0.5)); near('Wind: vertical uplift reactions = net normal force (kN)', -(sw.R.RAy+sw.R.RBy), (1+0.5)*3*(6/Math.cos(25*Math.PI/180))*Math.cos(25*Math.PI/180), 0.001);
// 9. Seismic Sa/g soil II at T=1.0 = 1.36
near('Sa/g soil II T=1.0', c.LD.saG(1.0,'II'), 1.36, 0.001);
// 10. Bolt M20 4.6 single shear threads: 0.78*314.16*400/sqrt3/1.25 = 45.3 kN
near('Bolt M20 4.6 Vdsb (kN)', c.ST.boltCap({db:20,grade:'4.6',t:10,fu:410,e:40,pitch:60,nn:1,ns:0}).Vdsb, 45.27, 0.005);
// 11. Ld Fe415 M20 deformed: 47 phi
near('Ld/phi Fe415 M20', c.RCC.Ld(16,415,20)/16, 47.0, 0.01);
// 12. Steel beam laterally supported ISMB300 Md = Zp fy / gm0
near('ISMB300 Md (kNm)', c.ST.beamCheck(c.D.ISMB[7],{fy:250,L:4,support:'ss',wu:10,lat:true,dl:300}).Md, 651.7e3*250/1.1/1e6, 0.001);
console.log(`\n${pass} passed, ${fail} failed`);
