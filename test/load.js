const fs=require('fs'), vm=require('vm');
const ctx={console, Math, Object, Array, Number, isNaN, isFinite, Infinity, CompressionStream, Response, Blob, TextEncoder, Promise, btoa};
vm.createContext(ctx);
['data','core','rcc','steel','loads','truss','fem','pushover','dxf','model','se','dt','mat','fdn','reg','pipe','boq','auto','pdb','cad','rpt','pro','wsm','calc','xlsx','report'].forEach(f=>vm.runInContext((process.env.STRICT?'"use strict";':'')+fs.readFileSync(__dirname+'/../www/js/'+f+'.js','utf8').replace(/if \(typeof module[^\n]*\n?/g,''),ctx,{filename:f}));
module.exports=ctx;
