import { computeCapacityWindows as c } from "./teamCapacity";
const a=[{personId:"1",nome:"A",tipo:"FERIAS",inicio:"2026-12-01",fim:"2026-12-10",pending:false},{personId:"2",nome:"B",tipo:"DAYOFF",inicio:"2026-12-05",fim:"2026-12-05",pending:true}];
const w=c(a,10,"2026-11-25","2026-12-31",2,70);
if(w.length!==1||w[0].start!=="2026-12-05"||!w[0].hasPending) throw new Error(JSON.stringify(w));
const w2=c([a[0]],2,"2026-11-25","2026-12-31",2,70);
if(w2.length!==1||!w2[0].lowCapacity||w2[0].overlap) throw new Error("low");
console.log("ok")
