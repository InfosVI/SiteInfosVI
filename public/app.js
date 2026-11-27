const SITE=Object.assign({nom:'Mon site VI',sousTitre:'',dons:null,hebergeur:null,hebergement:null},window.SITE||{});

const CURRENT_MONTH = new Date().toISOString().slice(0,7);
let PROV = { fx: null, from: '1er', to: '' };   // moyenne provisoire du mois en cours (cours quotidiens BCE), fixée au chargement
// Villes pour lesquelles Statistique Canada publie un indice, par zone d'indemnité (la 1re est l'indice par défaut)
const CPI_CITIES = {
  'CANADA (AUTRES VILLES)': ['Montréal','Québec'],
  'CANADA (OTTAWA, MONCTON)': ['Ottawa-Gatineau (partie ontarienne)','Saint John (N.-B., le plus proche de Moncton)','Nouveau-Brunswick (province)'],
  'CANADA (TORONTO)': ['Toronto','Calgary','Edmonton','Winnipeg','Halifax','Regina','Saskatoon','Victoria','St. John\'s','Thunder Bay','Whitehorse','Yellowknife','Iqaluit'],
  'CANADA (VANCOUVER)': ['Vancouver']
};
// Villes regroupées dans chaque zone d'indemnité (même montant, prix différents)
const ZONE_MULTI = {
  'CANADA (AUTRES VILLES)': 'Montréal, Québec, Sherbrooke et les autres villes francophones',
  'CANADA (OTTAWA, MONCTON)': 'Ottawa, Moncton',
  'CANADA (TORONTO)': 'Toronto, Calgary, Edmonton, Winnipeg, Halifax et les autres villes anglophones'
};
const MONTHS_FR = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
const st = { zone:'CANADA (AUTRES VILLES)', mode:'vie', alert:false, fail:false, histYear:'2026', drawer:null, sinceMonth:null, proposals:null, admin:false };
let D = null;

const $ = (s,el=document)=>el.querySelector(s);
const fmt = (n,d=2)=> n==null?'—':n.toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d});
const pct = (r,d=2)=> r==null||!isFinite(r)?'—':(r>0?'+':r<0?'−':'')+Math.abs(r*100).toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d})+' %';
const cls = (r,inv=false)=> r==null||!isFinite(r)||Math.abs(r)<1e-9?'':((r>0)!==inv?'up':'down');
// La flèche suit toujours le sens réel (▲ hausse, ▼ baisse) ; la couleur dit si c'est bon (vert) ou mauvais (rouge)
const arrow = (r,inv=false)=> r==null||!isFinite(r)||Math.abs(r)<1e-9?'':(r>0?'▲':'▼');
// Mois : en lettres + numéro à côté du mois (« nov. (11) 2026 ») ; date complète : en chiffres (« 01/10/2026 »)
const mlabel = m=>{const [y,mm]=m.split('-');return MONTHS_FR[+mm-1]+' ('+mm+') '+y};
const d1 = m=>{const [y,mm]=m.split('-');return '01/'+mm+'/'+y};
const provRange = ()=>{ const [y,m,d]=H.prov.to.split('-'); return 'du 01/'+m+' au '+d+'/'+m+'/'+y; };
const toast = t=>{const e=document.createElement('div');e.className='toast';e.textContent=t;document.body.appendChild(e);setTimeout(()=>e.remove(),3200)};
const esc = s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const titleCase = z=>z.toLowerCase().replace(/(^|[\s(,-])([^\s(,-])/g,(m,a,b)=>a+b.toUpperCase());

/* ---------- Données ---------- */
function canadaSeries(z){
  const s = D.canada[z]?.series; if(!s) return null;
  return s.map(r=>{
    const geo = st.mode==='vie'?r.vie:r.via;
    // Démonstration de panne en novembre : cours de change du mois en cours et indice des prix d'oct. (publié mi-nov.) non récupérés
    const fxFail = st.fail && r.m===CURRENT_MONTH, fail = st.fail && r.m==='2026-10';
    const prov = r.m===CURRENT_MONTH && r.fx==null;          // mois en cours : moyenne depuis le 1er
    const fx = fxFail?null:(prov?PROV.fx:r.fx);
    const vieSt = /identique VIA/.test(r.vieSt||'') ? r.viaSt : r.vieSt;   // VIE = VIA : même fiabilité que la valeur VIA
    return {...r, fxProv: prov, cpi: fail?null:r.cpi, geo, total: geo==null?null:+(r.fixe+geo).toFixed(2), fx, statut: st.mode==='vie'?vieSt:r.viaSt, srcId: st.mode==='vie'?r.vieSrc:r.viaSrc};
  });
}
function withCpi(rows){ let last=null; return rows.map(r=>{ const cpi=r.cpi??last; const est=r.cpi==null&&last!=null; if(r.cpi!=null) last=r.cpi; return {...r,cpiUsed:cpi,cpiEst:est}; }); }

/* Toutes les zones : indemnité (trimestrielle) + taux de change (mensuel), coût de la vie quand il existe */
let CURRENT_PERIOD = '';   // dernier trimestre connu, fixé au chargement
let FIXE=[['2013-01',715.38],['2016-07',719.67],['2017-02',723.99],['2022-07',749.33],['2023-07',760.57],['2024-01',772.87]];
const fixeAt=m=>{let v=null; for(const [d,x] of FIXE) if(d<=m) v=x; return v;};
// Sources de la part fixe (articles Légifrance en vigueur à chaque période) : formule, grille des indices, barème des traitements
let FIXE_SRC=[['2013-01','LEGIARTI000026928467','LEGIARTI000022450756'],['2016-07','LEGIARTI000026928467','LEGIARTI000032586956'],
  ['2017-02','LEGIARTI000034061028','LEGIARTI000034079407'],['2022-07','LEGIARTI000043341340','LEGIARTI000046027416'],
  ['2023-07','LEGIARTI000047751782','LEGIARTI000047751785'],['2024-01','LEGIARTI000047780477','LEGIARTI000047781415']];
const LFA = id => `https://www.legifrance.gouv.fr/loda/article_lc/${id}`;
function fixeLinks(m, short=false){
  let s=FIXE_SRC[0]; for(const r of FIXE_SRC) if(r[0]<=m) s=r;
  const a=(id,t,title)=>`<a href="${LFA(id)}" target="_blank" rel="noopener" title="${title}">${t}</a>`;
  return short ? `${a('LEGIARTI000043238842','décret, art. 18','Décret 2000-1159, art. 18 — formule : 50 % du traitement de l\'indice brut 244')} · ${a(s[1],'indices','Décret 82-1105 : correspondance indice brut 244 → indice majoré')} · ${a(s[2],'traitements','Décret 85-1148 : traitement annuel par indice majoré')}`
    : `${a('LEGIARTI000043238842','décret 2000-1159, art. 18','Formule : 50 % du traitement de l\'indice brut 244')} · ${a(s[1],'grille des indices','Décret 82-1105 : correspondance indice brut 244 → indice majoré')} · ${a(s[2],'barème des traitements','Décret 85-1148 : traitement annuel par indice majoré')}`;
}
const fixePill = `<span class="pill ok">Calculé</span>`;
const EURO_SWITCH={HRK:'2023-01',LTL:'2015-01',BGN:'2026-01'};
const CODE_ST={A:'saisie admin',O:'base officielle',V:'verifie',C:'calcule',R:'reconstitue',B:'bareme VIE',D:'derogatoire (montant officiel)',d:'derogatoire (calcule)',I:'identique VIA',X:'deduit',M:''};
let H = null;
let JL = null;   // journal réel d'un passage de collecte (journal.json)
const curLabel = d => d==='CAD'?'$ CA':d==='USD'?'$ US':d==='EUR'?'€':(d||'—');
function seriesFor(z){
  let rows;
  if(D.canada[z]) rows=canadaSeries(z).map(r=>({...r,dev:'CAD'}));
  else {
    const Z=H.zones[z]; if(!Z) return null;
    rows=H.months.map((m,i)=>{
      const qi=Math.floor(i/3), geo=(st.mode==='vie'?Z.vie:Z.via)[qi];
      let code=(st.mode==='vie'?Z.vs:Z.as)[qi]; if(code==='I') code=Z.as[qi];
      const srcMap=st.mode==='vie'?Z.sv:Z.sa; let src=null; for(const q of Object.keys(srcMap)) if(q<=m) src=srcMap[q];
      let d=Z.d; if(d && EURO_SWITCH[d] && m>=EURO_SWITCH[d]) d='EUR';
      const fx = d==='EUR'?1:(st.fail&&m===CURRENT_MONTH)?null:(d&&H.fx[d]?H.fx[d][i]:null), fixe=fixeAt(m);   // panne simulée : cours du mois en cours non récupérés
      return {m,fixe,geo,total:geo==null?null:+(fixe+geo).toFixed(2),fx,fxProv:m===CURRENT_MONTH&&fx!=null&&d!=='EUR',cpi:null,statut:CODE_ST[code],srcId:src,dev:d};
    });
  }
  return withCpi(applyCommunity(z,rows));
}
/* Arrêté pas encore publié : on prend la proposition la plus votée validée par un admin (démonstration sur Montréal) */
function topValidated(z,period){ initProposals(); return st.proposals.filter(p=>p.type!=='fixe'&&p.z===z&&p.eff===period&&p.s==='Validée par un admin').sort((a,b)=>(b.up-b.down)-(a.up-a.down))[0]; }
function applyCommunity(z,rows){
  if(!st.noJO) return rows;   // arrêté du trimestre pas encore publié : toutes les zones, VIE et VIA (identiques depuis 2021)
  const p=topValidated(z,CURRENT_PERIOD);
  return rows.map(r=> r.m<CURRENT_PERIOD ? r : (p
    ? {...r, geo:p.geo, total:+(r.fixe+p.geo).toFixed(2), statut:'communaute', srcId:null, community:true}
    : {...r, geo:null, total:null, statut:'', srcId:null}));
}
function pa(r){ return r.total==null||r.fx==null||r.cpiUsed==null?null:r.total*r.fx/r.cpiUsed; }
function paRaw(r){ return r.total==null||r.fx==null||r.cpi==null?null:r.total*r.fx/r.cpi; }  // historique : jamais de valeur reprise
/* Pouvoir d'achat entre deux mois, avec les dernières valeurs connues si une donnée manque (taux, indice des prix, indemnité) */
function cpiKind(m){ const prev=H.months.at(-2); return (m<prev||(m===prev&&new Date().getDate()>=20))?'miss':'notyet'; }   // indice du mois précédent attendu vers le 20
function lastKnown(rows,i,k){ for(let j=i;j>=0;j--) if(rows[j][k]!=null) return {v:rows[j][k],j,m:rows[j].m,carried:j!==i}; return null; }
// Pouvoir d'achat du mois de départ (données complètes) au mois d'arrivée.
// Au mois d'arrivée, chaque donnée prend sa dernière valeur disponible, et le site dit laquelle :
// taux = moyenne du mois en cours depuis le 1er ; indice des prix = dernier publié (celui du mois n'est publié que le mois suivant).
// Infobulle cliquable : bouton « i » qui affiche/masque son texte
const tip=(html,label='Plus d\'informations')=>`<span class="tipw"><button type="button" class="tip" aria-expanded="false" aria-label="${label}">i</button><span class="tipbox" hidden>${html}</span></span>`;
// « sur les 3 derniers mois (août → nov. 2026) » : nombre de mois et période en abrégé
const perLabel=(m1,m2,recent=true)=>{ const n=(+m2.slice(0,4)-+m1.slice(0,4))*12+(+m2.slice(5)-+m1.slice(5)); const p=m1.slice(0,4)===m2.slice(0,4)?`${MONTHS_FR[+m1.slice(5)-1]} (${m1.slice(5)}) → ${mlabel(m2)}`:`${mlabel(m1)} → ${mlabel(m2)}`; return `sur ${recent?(n===1?'le dernier mois':'les '+n+' derniers mois'):n+' mois'} (${p})`; };
const paOk = r => r && r.total!=null && r.fx!=null && r.cpi!=null;
function paCalc(rows,a,b){
  const A=rows[a]; if(!paOk(A)||b<=a) return null;
  const T=lastKnown(rows,b,'total'), F=lastKnown(rows,b,'fx'), C=lastKnown(rows,b,'cpi');
  if(!T||!F||!C||T.j<a||F.j<a||C.j<a) return null;
  // Aucun indice des prix après le mois de départ : l'évolution des prix est inconnue (jamais 0 %), pas de résultat
  const noCpi = C.j===a;
  const di=T.v/A.total-1, df=F.v/A.fx-1, dl=(1+di)*(1+df)-1, dc=noCpi?null:C.v/A.cpi-1, g=noCpi?null:(1+dl)/(1+dc)-1;
  const fr=rows[F.j], notes=[];
  const cpiWhy = rows.slice(a+1,b+1).filter(r=>r.cpi==null).map(r=>`indice ${deM(r.m)} ${cpiKind(r.m)==='miss'?'non récupéré':'pas encore publié'}`).join(', ');
  if(T.carried) notes.push({w:true,t:`Indemnité ${deM(rows[b].m)} non connue : montant ${deM(T.m)} utilisé`});
  if(F.carried) notes.push({w:true,t:`Cours de change ${deM(rows[b].m)} non récupérés : taux ${deM(F.m)} utilisé`});
  if(noCpi) notes.push({w:cpiWhy.includes('non récupéré'),t:`Évolution des prix inconnue après ${mlabel(A.m)} (${cpiWhy}) : pouvoir d'achat non calculable`});
  else if(C.carried){ const lost=rows.slice(C.j+1,b+1).filter(r=>r.cpi==null&&cpiKind(r.m)==='miss');
    notes.push(lost.length?{w:true,t:`Indice des prix ${lost.map(r=>deM(r.m)).join(', ')} non récupéré : prix mesurés jusqu'à ${mlabel(C.m)}`}
      :{w:false,t:`Prix mesurés jusqu'à ${mlabel(C.m)} : l'indice ${deM(rows[b].m)} n'est publié que le mois suivant`}); }
  const fxLab = fr.fxProv ? `moyenne ${provRange()}` : `moyenne ${deM(F.m)}`;
  return {A,T,F,C,di,df,dl,dc,g,notes,fxLab,warn:notes.some(n=>n.w),noCpi,cpiWhy};
}
// Mois de départ par défaut : 3 mois avant le mois en cours (ou le mois complet le plus proche avant)
function paStart(rows,want){ let a=Math.min(want,rows.length-2); while(a>=0&&!paOk(rows[a])) a--; return a; }
const lkClose=`<button type="button" class="btn" data-close style="justify-self:end">Fermer</button>`;
function lkHTML(){
  const z=st.zone, rows=seriesFor(z), dev=rows.at(-1).dev, cl=curLabel(dev), city=(CPI_CITIES[z]||['—'])[0], n=rows.length;
  const okI=rows.map((r,i)=>paOk(r)?i:-1).filter(i=>i>=0); if(!okI.length) return `<p class="muted">Pas assez de données.</p>`+lkClose;
  let b=Number.isInteger(st.lkB)&&st.lkB<n?st.lkB:n-1; let a=okI.includes(st.lkA)&&st.lkA<b?st.lkA:[...okI].reverse().find(i=>i<b);
  if(a==null) return `<p class="muted">Pas assez de données.</p>`+lkClose;
  const R=paCalc(rows,a,b), mA=mlabel(rows[a].m), mB=mlabel(rows[b].m);
  const optA=okI.filter(i=>i<n-1).map(i=>`<option value="${i}" ${i===a?'selected':''}>${mlabel(rows[i].m)}</option>`).reverse().join('');
  const optB=rows.map((r,i)=>i>a?`<option value="${i}" ${i===b?'selected':''}>${mlabel(r.m)}${r.m===CURRENT_MONTH?' (mois en cours)':''}</option>`:'').reverse().join('');
  const chip=(d,inv)=>`<span class="chip ${cls(d,inv)||'flat'} num">${arrow(d,inv)} ${pct(d,1)}</span>`;
  const step=(k,t,body)=>`<div class="lkstep"><span class="lkn">${k}</span><div><strong>${t}</strong><div class="small" style="margin-top:2px;line-height:1.7">${body}</div></div></div>`;
  let h=`<div class="lkhead"><h3 id="lkT">Détail du calcul</h3><button type="button" class="btn ghost" data-close aria-label="Fermer">✕</button></div>
  <p class="small muted" style="margin:0">Pouvoir d'achat à partir des euros · ${esc(zoneLabel(z))} · ${st.mode.toUpperCase()} : ce que l'indemnité, versée en euros, permet d'acheter sur place.</p>
  <div style="display:flex;gap:10px;flex-wrap:wrap"><div class="field"><label for="lkA">Comparer du</label><select id="lkA">${optA}</select></div><div class="field"><label for="lkB">au</label><select id="lkB">${optB}</select></div></div>`;
  if(!R) return h+`<p class="muted">Pas assez de données pour ces dates.</p>`+lkClose;
  if(R.notes.length) h+=`<div class="${R.warn?'alert':'note'} small" style="display:block"><strong>${R.warn?'⚠ Données non récupérées':'À savoir'}</strong><ul style="margin:4px 0 0;padding-left:18px">${R.notes.map(x=>`<li>${x.t}</li>`).join('')}</ul></div>`;
  h+=`<p style="margin:0"><strong>${R.noCpi?'Comparaison':'Calculé'} ${perLabel(rows[a].m,rows[b].m,b===n-1)}</strong></p>`;
  h+=step(1,'Votre indemnité en euros',`${fmt(R.A.total)} € en ${mA} → ${fmt(R.T.v)} € en ${mlabel(R.T.m)} ${chip(R.di)}`);
  h+=step(2,`Convertie en ${cl}`,`1 € = ${fmt(R.A.fx,4)} ${cl} (moyenne ${deM(rows[a].m)}) → ${fmt(R.F.v,4)} ${cl} (${R.fxLab}) ${chip(R.df)}<br>Votre indemnité vaut ${fmt(R.A.total*R.A.fx)} ${cl} → ${fmt(R.T.v*R.F.v)} ${cl} ${chip(R.dl)}`);
  h+=step(3,`L'indice des prix à ${esc(city)}`,R.noCpi?`<span class="${R.warn?'down':'muted'}">${R.warn?'⚠ ':''}Pas d'indice des prix après ${mA} : ${R.cpiWhy}.</span><br><span class="muted">L'évolution des prix n'est pas connue : choisissez un mois de départ plus ancien.</span>`
    :`Indice des prix : ${fmt(R.A.cpi,1)} (${mA}) → ${fmt(R.C.v,1)} (${mlabel(R.C.m)}${R.C.carried?', dernier indice publié':''}) ${chip(R.dc,true)}<br>Entre ces deux mois, les prix ont ${Math.abs(R.dc)<5e-4?'très peu changé':R.dc>0?'augmenté':'baissé'}.<br><span class="muted">Quand les prix augmentent, la même somme permet d'acheter moins.</span>`);
  if(R.noCpi) return h+`<div class="lkres"><span class="small muted">Résultat</span><div class="big num muted">non calculable</div><div class="small">Sans évolution des prix, le pouvoir d'achat ne peut pas être calculé.</div></div>`+lkClose;
  h+=`<div class="lkres"><span class="small muted">Résultat</span><div class="big num ${cls(R.g)}">${arrow(R.g)} ${pct(R.g,1)}</div>
    <div class="small">Avec votre indemnité, vous pouvez acheter <strong>${fmt(Math.abs(R.g)*100,1)} % ${R.g>=0?'de plus':'de moins'}</strong> sur place en ${mB} qu'en ${mA}.</div>
    <div class="small muted num">Calcul : ${fmt(1+R.dl,4)} (indemnité en ${esc(dev)}) ÷ ${fmt(1+R.dc,4)} (prix) − 1 = ${pct(R.g,1)}</div></div>
  <p class="src" style="margin:0">Sources : arrêtés du Journal officiel · taux de référence de la BCE · adapté de Statistique Canada (indice des prix, ${esc(city)}).</p>`;
  return h+lkClose;
}
function lastChangeIndex(rows){ for(let i=rows.length-1;i>0;i--){ if(rows[i].total!==rows[i-1].total && rows[i].total!=null) return i; } return 0; }
function fiab(statut){
  if(!statut) return ['manquant',''];
  if(statut==='communaute') return ['Communauté · validée par un admin','mid'];
  if(/saisie admin/.test(statut)) return ['Saisie admin','mid'];
  if(/deduit/.test(statut)) return ['Déduit','mid'];   // ville créée en cours de route : valeur tirée de son ancienne zone
  if(/officiel|base officielle|bareme VIE/.test(statut)) return ['Officiel','ok'];   // montant publié en € dans un arrêté
  if(/reconstitue/.test(statut)) return ['Reconstitué','mid'];                        // avant 2023, non vérifiable
  return ['Calculé','ok'];                                                             // % officiel appliqué au dernier montant officiel
}
const isCanada = z=>!!D.canada[z];

/* ---------- Sélecteur de zone ---------- */
function zoneSelector(id){
  const z = D.zones.find(x=>x.z===st.zone);
  return `<div class="field"><label for="${id}">Zone d'indemnité</label>
  <div class="zsel"><button type="button" id="${id}" aria-haspopup="listbox" aria-expanded="false">${esc(titleCase(st.zone))} ${icons(st.zone)}</button></div></div>`;
}
function icons(z){
  const zz = D.zones.find(x=>x.z===z); const dev = zz?.dev; const okFx = dev && (dev==='CAD' || H?.fx[dev]);
  const fx = dev==='EUR' ? '<span title="Zone euro : pas de conversion">€</span>' : `<span class="${okFx?'':'off'}" title="${okFx?'Taux de change suivi ('+dev+')':'Taux de change non disponible'}">💱</span>`;
  const col = `<span class="${isCanada(z)?'':'off'}" title="${isCanada(z)?'Coût de la vie suivi (Statistique Canada)':'Coût de la vie non disponible pour cette zone'}">📊</span>`;
  return `<span class="ic">${fx}${col}</span>`;
}
function openZonePanel(btn){
  closeZonePanel();
  btn.setAttribute('aria-expanded','true');
  const p=document.createElement('div'); p.className='zpanel'; p.id='zpanel';
  p.innerHTML=`<input type="text" id="zsearch" placeholder="Rechercher un pays ou une ville…" aria-label="Rechercher une zone"><div class="zlist" role="listbox" id="zlist"></div>
  <div class="legend"><span>💱 taux de change suivi</span><span>📊 coût de la vie suivi</span><span>€ zone euro</span><span style="opacity:.4">💱📊 grisé : non disponible</span></div>`;
  btn.parentElement.appendChild(p);
  const draw=q=>{
    const n=q.normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase();
    const groups={}; D.zones.filter(x=>!n||x.z.includes(n)).forEach(x=>{(groups[x.pays]??=[]).push(x)});
    const keys=Object.keys(groups).sort((a,b)=>a==='CANADA'?-1:b==='CANADA'?1:a.localeCompare(b,'fr'));
    $('#zlist',p).innerHTML = keys.length? keys.map(k=>`<div class="zgroup">${esc(k)}</div>`+groups[k].map(x=>{
      const city=(x.z.match(/\((.*)\)/)||[,'Tout le pays'])[1];
      return `<button type="button" class="zopt" role="option" data-z="${esc(x.z)}" aria-selected="${x.z===st.zone}"><span>${esc(titleCase(city))}</span>${icons(x.z)}</button>`}).join('')).join('')
      : '<p class="muted small" style="padding:8px">Aucune zone ne correspond.</p>';
  };
  draw(''); const s=$('#zsearch',p); s.focus(); s.addEventListener('input',()=>draw(s.value));
  p.addEventListener('click',e=>{const o=e.target.closest('.zopt'); if(o){st.zone=o.dataset.z; trackEvent('Choix de zone',{zone:o.dataset.z}); st.drawer=null; st.sinceMonth=null; closeZonePanel(); render();}});
}
function closeZonePanel(){ const p=$('#zpanel'); if(p){ p.previousElementSibling?.setAttribute('aria-expanded','false'); p.remove(); } }
document.addEventListener('click',e=>{ const b=e.target.closest('.zsel>button'); if(b){ $('#zpanel')?closeZonePanel():openZonePanel(b); return; } if(!e.target.closest('.zpanel')) closeZonePanel(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeZonePanel(); });

const modeToggle = ()=>`<div class="field"><label>Mode</label><div class="seg" role="group" aria-label="Barème">
  <button type="button" data-mode="vie" aria-pressed="${st.mode==='vie'}">VIE</button><button type="button" data-mode="via" aria-pressed="${st.mode==='via'}">VIA</button></div></div>`;
document.addEventListener('click',e=>{ const b=e.target.closest('[data-mode]'); if(b){ st.mode=b.dataset.mode; trackEvent('Changement de mode',{mode:st.mode.toUpperCase()}); render(); } });

/* ---------- Petit graphique SVG ---------- */
function spark(points,{w=520,h=150,inv=false,label='',suffix='',markers=[]}={}){
  const pts=points.filter(p=>p.v!=null); if(pts.length<2) return '<p class="muted small">Pas assez de données.</p>';
  const vs=pts.map(p=>p.v), mn=Math.min(...vs), mx=Math.max(...vs), pad=(mx-mn)*0.1||1;
  const lo=mn-pad, hi=mx+pad, L=44, R=12, T=10, B=24;
  const x=i=>L+(w-L-R)*i/(pts.length-1), y=v=>T+(h-T-B)*(1-(v-lo)/(hi-lo));
  const d=pts.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(p.v).toFixed(1)).join(' ');
  const area=d+` L${x(pts.length-1).toFixed(1)} ${h-B} L${L} ${h-B} Z`;
  const ticks=[lo+ (hi-lo)*0.15, (lo+hi)/2, hi-(hi-lo)*0.15];
  const last=pts[pts.length-1], first=pts[0], up=(last.v>=first.v)!==inv;
  const col=up?'var(--up)':'var(--down)';
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${esc(label)}">
    ${ticks.map(t=>`<line x1="${L}" x2="${w-R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" stroke-width="1"/><text x="${L-6}" y="${y(t)+4}" text-anchor="end">${fmt(t,suffix?((hi-lo)<8?1:0):(t>100?1:4))}${suffix}</text>`).join('')}
    ${markers.map(mk=>{ const i=pts.findIndex(p=>p.m>=mk.m); if(i<=0) return ''; const xm=x(i).toFixed(1), right=i>pts.length*0.7;
      return `<line x1="${xm}" x2="${xm}" y1="${T}" y2="${h-B}" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="4 3"/>
        <text x="${right?+xm-6:+xm+6}" y="${T+12}" text-anchor="${right?'end':'start'}" style="fill:var(--accent);font-weight:700">${esc(mk.label)}</text>`}).join('')}
    <path d="${area}" fill="${col}" opacity=".10"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2"/>
    ${pts.map((p,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${pts.length>80?1.5:pts.length>30?2:2.6}" fill="var(--surface)" stroke="${col}" stroke-width="1.1" opacity=".85"><title>${mlabel(p.m)} : ${fmt(p.v,suffix?1:(p.v>100?1:4))}${suffix}</title></circle>`).join('')}
    <circle cx="${x(pts.length-1)}" cy="${y(last.v)}" r="4" fill="${col}"/>
    <text x="${L}" y="${h-6}">${mlabel(first.m)}</text><text x="${w-R}" y="${h-6}" text-anchor="end">${mlabel(last.m)}</text></svg>`;
}

/* ---------- Vues ---------- */
const V = {};
V.accueil = ()=>`
  <section class="hero view"><h1>Le guide pratique des volontaires internationaux</h1>
  <p class="muted" style="margin:0;max-width:70ch">Indemnité VIE et VIA (volontariat international en entreprise et en administration) : montant dans chaque pays, évolution depuis 2014 et pouvoir d’achat sur place, d’après les arrêtés du Journal officiel, la Banque centrale européenne et les instituts statistiques. Gratuit, sans compte.</p>
</section>
  <section class="cards" aria-label="Modules">
    <a class="mod on" href="/pouvoir-achat"><h3>Pouvoir d’achat VI</h3><span class="muted small">Indemnité actuelle, pouvoir d'achat, historique, grille des indemnités.</span></a>
    ${['Épargne en VI','Fiscalité du VI','Logement en VI et remboursement par l\'entreprise','Remboursement des frais de bagages et transports en VI','Témoignages de VI','Assurance santé April en VI','Fin de VI','Carte du monde des VI'].map(t=>
      `<div class="mod off" aria-disabled="true"><span class="badge">🚧 Bientôt disponible</span><h3>${t}</h3></div>`).join('')}
  </section>
  <section class="grid2" aria-label="Nouveautés et prochaines fonctionnalités">
    <div class="panel"><h2>Dernières nouveautés</h2><ul style="margin:0;padding-left:18px;display:grid;gap:8px">${newsList(3)}</ul></div>
    <div class="panel"><h2>Prochaines fonctionnalités</h2><ol style="margin:0;padding-left:22px;display:grid;gap:6px">${roadmapFlat().slice(0,4).map(r=>`<li><strong>${r.t}</strong><br><span class="small muted">${r.d}</span></li>`).join('')}</ol>
      <div style="border-top:1px solid var(--line);padding-top:10px;margin-top:auto"><a class="btn ghost" href="/nouveautes" style="font-size:.85rem">Voir la feuille de route complète →</a></div></div>
  </section>`;


/* ===== Nouveautés (une entrée par version mise en ligne) et feuille de route (par ordre de priorité) ===== */
const NEWS=[
  {v:'1.9.0', d:'', items:['Comparaison entre pays : la carte et le classement s’affichent de nouveau à l’ouverture de la page']},
  {v:'1.8.1', d:'', items:['Espace admin : les boutons « Supprimer » et « Actualiser » du module Messages fonctionnent de nouveau']},
  {v:'1.8.0', d:'', items:['Propositions et votes ouverts : proposez une valeur d’indemnité pas encore publiée et votez pour celles des autres (sans compte, avec vérification anti-robot) ; la valeur retenue est validée par l’administrateur']},
  {v:'1.7.1', d:'', items:['Accueil : présentation plus claire de ce que propose le site']},
  {v:'1.7.0', d:'', items:['Chaque page a désormais sa propre adresse (par ex. /historique ou /grille-indemnites) : plus facile à partager et à retrouver dans les moteurs de recherche, avec un aperçu soigné quand on partage un lien']},
  {v:'1.6.0', d:'', items:['Sécurité renforcée : la carte, le PDF et la vérification anti-robot sont servis par le site lui-même (plus aucun service tiers), protections supplémentaires de l’espace admin et du serveur']},
  {v:'1.5.0', d:'', items:['Page « Dons pour l’hébergement » : coûts affichés tels qu’ils ont été payés, en $ CA et en $ US (sans conversion), augmentant chaque mois']},
  {v:'1.4.0', d:'', items:['Formulaire de contact ouvert : protégé par une vérification anti-robot (ALTCHA, hébergée sur le serveur du site), un message toutes les 12 heures, messages effacés après 60 jours','Mentions légales : coordonnées de l’hébergeur complétées','Statistiques de visite plus fiables : les robots sont mieux distingués des visiteurs (temps passé sur la page et interactions) ; page Confidentialité précisée (seul le réseau d’origine est gardé, tronqué)']},
  {v:'1.3.0', d:'', items:['Vous pouvez désormais soutenir le site par un don, entièrement facultatif, via Liberapay : nouvelle page « Dons pour l’hébergement » (lien en bas de page), avec les coûts réels d’hébergement depuis le début du site']},
  {v:'1.2.0', d:'', items:['Date du jour affichée en temps universel (UTC), avec la date de votre appareil quand elle diffère','Espace admin : les boutons d’imports lancent réellement la collecte']},
  {v:'1.1.0', d:'', items:['Page Confidentialité : la mesure d’audience n’utilise aucun cookie (identifiant anonyme renouvelé chaque mois) ; statistiques effacées après 25 mois']},
  {v:'1.0.0', d:'', items:['Première version officielle du site : Pouvoir d’achat VI (vue d’ensemble, historique avec PDF récapitulatif, grille des indemnités, comparaison entre pays, méthodologie)','Statistiques de visite : mesure d’audience installée sur le serveur du site, refusable à tout moment dans la page Confidentialité']},
];
const ROADMAP=[
  {t:'Contenu pratique', items:[
    ['Pages pratiques','Avertissements, checklists à cocher, FAQ, impression ou enregistrement en PDF, source et date de mise à jour.'],
    ['Module Fin de VI','Droits au retour, démarches administratives, conseils pour la recherche d’emploi.'],
    ['Module Assurance santé April en VI','Garanties en clair, guides pour se faire rembourser, questions fréquentes.'],
    ['Module Fiscalité du VI','Statut fiscal du VIE, démarches en France et dans le pays d’accueil, calendrier des échéances, FAQ.']]},
  {t:'Outils et simulateurs', items:[
    ['Quiz « Où dois-je déclarer ? »','Quelques questions pour trouver la bonne démarche fiscale.'],
    ['Simulateur « Ce qu’il me reste »','Épargne possible chaque mois et sur toute la durée du VIE, selon la ville et vos dépenses.'],
    ['Logement : conseils et pièges à éviter','Bail, dépôt, colocation, arnaques courantes.'],
    ['Comparaison entre pays : comparer à ma zone','Chaque pays affiché en écart par rapport à votre zone (ex. « +12 % de plus qu’à Montréal »), sur la carte, dans le classement et dans le graphique.'],
    ['Comparaison entre pays : export du graphique','Un bouton pour enregistrer le graphique « Évolution dans le temps » en image ou en PDF.']]},
  {t:'Contributions de la communauté', items:[
    ['Contributions pour tous les modules','Le système de propositions et de votes étendu à d’autres données.'],
    ['Modérateurs','Des volontaires peuvent aider à valider les données de leur pays.'],
    ['Couverture des données par pays','Pourcentage de données disponibles et liste de celles qui manquent.']]},
  {t:'Données de la communauté', items:[
    ['Loyers indicatifs par ville','Loyer médian et fourchette selon le type de logement.'],
    ['Comparateur d’épargne entre pays','Quel pays permet de mettre le plus d’argent de côté ?'],
    ['Délais de remboursement April','Délais constatés par type de soin et par pays.'],
    ['Pratiques des entreprises pour le logement','Logement fourni, prime, remboursement : la répartition par pays et par secteur.'],
    ['FAQ fiscale communautaire','Questions et réponses entre volontaires.']]},
  {t:'Témoignages et avis', items:[
    ['Témoignages structurés','Expériences de mission, notes et conseils, publiés de façon anonyme.'],
    ['Filtres et recherche','Par pays, ville, secteur et note.'],
    ['Notes par ville','Coût de la vie ressenti, logement, ambiance, intégration.']]},
  {t:'Carte du monde', items:[
    ['Carte interactive','Indemnité, coût de la vie, pouvoir d’achat et épargne, pays par pays.'],
    ['Couverture des données sur la carte','Les pays où il manque des données.'],
    ['Mini-cartes dans les modules','Une carte réduite là où elle aide.']]},
];
const ROADMAP_IDEAS=['Page « Contributeurs » pour remercier les personnes qui ajoutent des données'];
const roadmapFlat=()=>ROADMAP.flatMap((ph,pi)=>ph.items.map(([t,d])=>({ph:ph.t,pi,t,d})));
const newsList=n=>NEWS.slice(0,n).map(x=>`<li><strong class="num">Version ${x.v}</strong>${x.d?` <span class="muted small">· ${fmtDay(x.d)}</span>`:''}<ul style="margin:2px 0 0;padding-left:18px">${x.items.map(i=>`<li>${i}</li>`).join('')}</ul></li>`).join('');
V.roadmap = ()=>{ let k=0; return `<section class="view"><h1>Nouveautés et feuille de route</h1>
  <div class="panel"><h2>Prochaines fonctionnalités, par ordre de priorité</h2>
    ${ROADMAP.map((ph,pi)=>`<h3 style="margin:8px 0 0">Étape ${pi+1} · ${ph.t}</h3><ol start="${k+1}" style="margin:0;padding-left:26px;display:grid;gap:4px">${ph.items.map(([t,d])=>{k++; return `<li><strong>${t}</strong> <span class="muted">— ${d}</span></li>`;}).join('')}</ol>`).join('')}
    <h3 style="margin:8px 0 0">Idées en attente</h3><ul style="margin:0;padding-left:18px">${ROADMAP_IDEAS.map(i=>`<li class="muted">${i}</li>`).join('')}</ul>
    <p class="small muted" style="margin:0">L’ordre peut évoluer. Une idée ? Écrivez-nous via le <a href="/mentions-legales">formulaire de contact</a>.</p></div>
  <div class="panel"><h2>Nouveautés</h2><ul style="margin:0;padding-left:18px;display:grid;gap:8px">${newsList(NEWS.length)}</ul></div></section>`; };
/* ===== Vue d'ensemble et historique : toutes les zones ===== */
const zoneLabel = z => D.canada[z]?.label || titleCase(z);
const deM = m => (/^[aeiouéh]/i.test(mlabel(m))?"d'":'de ')+mlabel(m);   // « d'oct. 2026 », « de nov. 2026 »
const fxLabelOf = r => r.fxProv ? `taux moyen ${provRange()}` : `taux moyen ${deM(r.m)}`;
const communityNote = `<a href="/proposer">voir les votes</a>`;

V.remuneration = ()=>{
  const z=st.zone, rows=seriesFor(z);
  const dev0=rows?rows.at(-1).dev:null;
  // Devise d'affichage : la monnaie locale, ou une devise très utilisée (USD, GBP, CAD) ; même choix que dans l'historique
  const cChoices=[[dev0, dev0==='EUR'?'Zone euro (pas de conversion)':`€ → ${dev0} (devise locale)`],
    ...['USD','GBP','CAD'].filter(c=>c!==dev0).map(c=>[c,`€ → ${c} (${{USD:'dollar américain',GBP:'livre sterling',CAD:'dollar canadien'}[c]})`])];
  const cdev=(cChoices.find(c=>c[0]===st.hcur)||cChoices[0])[0];
  const head=`<div class="toolbar">${zoneSelector('zbtn')}${modeToggle()}<div class="field"><label for="cur">Devise d'affichage</label><select id="cur">${cChoices.map(c=>`<option value="${c[0]}" ${c[0]===cdev?'selected':''}>${c[1]}</option>`).join('')}</select></div></div>`;
  if(!rows) return `<section class="view"><h1>Pouvoir d’achat VI</h1>${head}<p class="muted">Aucune donnée pour cette zone.</p></section>`;
  const dev=dev0, cl=curLabel(dev), euro=dev==='EUR', hasCpi=rows.some(r=>r.cpi!=null);
  const valid=[...rows].reverse().find(r=>r.total!=null);          // dernière indemnité valide
  const cur=valid;
  const lastFx=[...rows].reverse().find(r=>r.fx!=null);
  const lastCpi=[...rows].reverse().find(r=>r.cpi!=null);
  const pc=[...rows].reverse().find(r=>pa(r)!=null);
  // Dernier arrêté = début du trimestre de la dernière valeur, même si sa variation est de 0 %
  const ci=rows.map(r=>r.m).lastIndexOf(quarterStart(cur.m)), chg=rows[ci], prevQ=rows[ci-3]||rows[0];
  const varEur=cur.total-prevQ.total, varPct=cur.total/prevQ.total-1;
  const sinceIdx = st.sinceMonth? rows.findIndex(r=>r.m===st.sinceMonth) : ci;
  const loge=Math.round(cur.geo*20)/100;
  const [fl,fc]=fiab(cur.statut);
  const missingNow = rows.at(-1).total==null;
  const alert = (st.alert||missingNow) ? `<div class="alert" role="status"><strong>⚠</strong><span>${st.noJO?`L'arrêté du ${d1(CURRENT_PERIOD)} n'est pas encore publié au Journal officiel : le montant du ${d1(chg.m)} est affiché. Vous connaissez la nouvelle valeur ?`:'La variation d\'indemnité du trimestre en cours n\'a pas encore été récupérée. Vous la connaissez ?'}</span><a class="btn" href="/proposer">Proposez-la !</a></div>`:'';
  const srcLine = cur.community
    ? `<span>· Source : <strong>communauté</strong> (valeur la plus votée, validée par un admin) — ${communityNote}</span>`
    : `<span>· Source : ${cur.srcId?`<a href="https://www.legifrance.gouv.fr/jorf/id/${cur.srcId}" target="_blank" rel="noopener">arrêté du JO</a>`:'arrêté du JO'}</span>`;
  // Taux de la devise d'affichage : celui de la zone si devise locale, sinon dernière moyenne € → devise choisie
  const cFx = cdev===dev ? lastFx : (()=>{ for(let i=H.months.length-1;i>=0;i--){ const v=H.fx[cdev]?.[i]; if(v!=null) return {m:H.months[i], fx:v, fxProv:H.months[i]===CURRENT_MONTH}; } return null; })();
  const ccl=curLabel(cdev);
  const conv = cdev==='EUR' ? `<div class="small muted">Zone euro : pas de conversion.</div>`
    : cFx ? `<div class="num" style="font-size:1.25rem;font-weight:700">≈ ${fmt(cur.total*cFx.fx)} ${ccl} <span class="muted small" style="font-weight:400">au ${fxLabelOf(cFx)} : 1 € = ${fmt(cFx.fx,4)} ${ccl}</span></div>
       ${cFx.m<CURRENT_MONTH?`<p class="small muted" style="margin:0">Moyenne de ${mlabel(CURRENT_MONTH)} pas encore disponible : dernière moyenne valide affichée.</p>`:''}
       ${cdev!==dev?`<p class="small muted" style="margin:0">Le pouvoir d'achat reste calculé en devise locale (${esc(dev)}), car les prix sont locaux.</p>`:''}`
    : `<div class="small muted">Taux de change non disponible pour cette devise.</div>`;
  const usd = '';
  const card = `<div class="panel"><span class="eyebrow">Indemnité actuelle (valable depuis le ${d1(chg.m)}) · ${esc(zoneLabel(z))}</span>
      <div class="big num">${fmt(cur.total)} €<span class="muted small"> / mois</span></div>${conv}${usd}
      <dl class="kv num"><dt>Part fixe</dt><dd>${fmt(cur.fixe)} €</dd><dt>Part géographique</dt><dd>${fmt(cur.geo)} €</dd>
      ${hasCpi?(()=>{const i=rows.indexOf(lastCpi), y=rows[i-12]; const d=y?.cpi?lastCpi.cpi/y.cpi-1:null; return `<dt>Hausse des prix sur 12 mois (inflation) · <strong style="color:var(--fg)">${mlabel(lastCpi.m)}</strong>${y?`<br><span class="small muted" style="font-weight:400">prix en ${mlabel(lastCpi.m)} comparés à ${mlabel(y.m)}</span>`:''}</dt><dd class="${cls(d,true)}">${pct(d,1)}</dd>`})()
        :`<dt>Hausse des prix sur 12 mois (inflation) ${tip(`<strong>Indice du coût de la vie non disponible pour cette zone.</strong><br>Le site n'utilise que des données publiques et fiables, mises à jour régulièrement. Pour cette zone, nous n'en avons pas (encore) :<ul style="margin:4px 0;padding-left:16px"><li>dans beaucoup de pays, l'indice des prix n'est publié que pour le pays entier, pas pour la ville de la mission ;</li><li>il peut être publié avec beaucoup de retard, irrégulièrement, ou sans accès ouvert ;</li><li>dans les pays en crise, en conflit ou à très forte inflation, les chiffres officiels peuvent être interrompus ou peu fiables.</li></ul>Sans cet indice, le pouvoir d'achat ne peut pas être calculé : fiez-vous au montant en devise locale et aux prix sur place. <a href="/methodologie">En savoir plus</a>`,'Pourquoi pas de valeur ?')}</dt><dd class="muted">non disponible</dd>`}</dl>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="small muted">Dernier ajustement (${d1(chg.m)}) :</span>
        <span class="chip ${cls(varPct)||'flat'} num">${arrow(varPct)} ${varEur>0?'+':''}${fmt(varEur)} € · ${pct(varPct)}</span>
        ${tip(`<strong>Ajustement du ${d1(chg.m)}</strong> : c'est le dernier changement de l'indemnité, fixé par le dernier arrêté (<a href="https://www.legifrance.gouv.fr/jorf/id/${lastArrete().id}" target="_blank" rel="noopener">voir l'arrêté</a>).<br>Indemnité du ${d1(prevQ.m)} : ${fmt(prevQ.total)} € → du ${d1(chg.m)} : ${fmt(cur.total)} €, soit ${varEur>0?'+':''}${fmt(varEur)} € (${pct(varPct)}).<br>L'indemnité est ajustée tous les 3 mois ; les détails ne sont pas toujours publiés ailleurs, c'est pourquoi les visiteurs peuvent aussi <a href="/proposer">proposer une valeur</a>.`,'Que représente ce montant ?')}</div>
      <div class="src" style="display:grid;gap:4px">
        <span>Part géographique : <span class="pill ${fc}">${fl}</span> ${srcLine.replace('· Source : ','')}</span>
        <span>Part fixe : ${fixePill} ${fixeLinks(cur.m)}</span></div>
      <ul class="small muted" style="margin:0;padding-left:18px;display:grid;gap:4px">
        <li><strong>Montant brut = montant net</strong> : l'indemnité est exonérée d'impôt sur le revenu et de cotisations sociales (<a href="https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000038586519" target="_blank" rel="noopener">art. L122-12 du Code du service national</a>).</li>
        <li>Si votre entreprise prend en charge votre logement, une retenue de <strong>20 % de la part géographique</strong> peut s'appliquer : ${fmt(loge)} € ici, soit ${fmt(cur.total-loge)} € versés.</li>
      </ul>
      ${(()=>{ // Zones du même pays : boutons pour passer de l'une à l'autre (ex. les 4 zones du Canada)
        const pays=(D.zones.find(x=>x.z===z)||{}).pays, sib=D.zones.filter(x=>x.pays===pays); if(sib.length<2) return '';
        return `<div style="padding-top:12px;border-top:1px solid var(--line);display:grid;gap:6px"><span class="eyebrow">Zones d'indemnité · ${esc(titleCase(pays||''))}</span>
          <div class="zones4">${sib.map(x=>{const s=seriesFor(x.z), v=s&&[...s].reverse().find(r=>r.total!=null); return `<button type="button" data-zone="${esc(x.z)}" aria-pressed="${x.z===z}"><span>${esc(zoneLabel(x.z))}</span><span class="num">${v?fmt(v.total)+' €':'—'}</span></button>`}).join('')}</div></div>`; })()}</div>`;
  let right;
  // Période du calcul (modifiable, mise en couleur) : par défaut de 3 mois avant le mois en cours jusqu'au mois en cours
  const iEnd = st.paEnd ? Math.max(1,rows.findIndex(r=>r.m===st.paEnd)) : rows.length-1;
  const periodBox = (okStart)=>{
    const want = st.sinceMonth ? rows.findIndex(r=>r.m===st.sinceMonth) : rows.length-4;
    const iS = Math.min(want, iEnd-1);
    return `<div class="period"><span class="eyebrow" style="grid-column:1/-1">Période du calcul</span>
      <div class="field"><label for="since">Du</label><select id="since">${rows.slice(0,iEnd).map((r,i)=>okStart(r)?`<option value="${r.m}" ${i===iS?'selected':''}>${mlabel(r.m)}</option>`:'').reverse().join('')}</select></div>
      <div class="field"><label for="paEnd">au</label><select id="paEnd">${rows.map((r,i)=>i>iS?`<option value="${r.m}" ${i===iEnd?'selected':''}>${mlabel(r.m)}${r.m===CURRENT_MONTH?' · en cours':''}</option>`:'').reverse().join('')}</select></div></div>`;
  };
  const mini=(lab,d,inv,sub='')=>`<div class="mini"><span class="small muted">${lab}</span><span class="num ${cls(d,inv)}"><strong>${d==null?'—':arrow(d,inv)+' '+pct(d,1)}</strong></span>${sub?`<span class="small muted">${sub}</span>`:''}</div>`;
  const ptab=(mA,mB,lines,res)=>`<table class="list ptab"><thead><tr><th></th><th class="r">${mA}</th><th class="r">${mB}</th><th class="r">Variation</th></tr></thead><tbody>
    ${lines.map(([lab,a,b,d,inv,note])=>`<tr><th scope="row">${lab}</th><td class="r num">${a}</td><td class="r num">${b}${note?`<span class="small muted">${note}</span>`:''}</td><td class="r num ${cls(d,inv)}">${d==null?'—':arrow(d,inv)+' '+pct(d,1)}</td></tr>`).join('')}
    ${res?`<tr class="pares"><th scope="row">${res[0]}</th><td></td><td></td><td class="r num ${cls(res[1])}"><strong>${res[1]==null?'—':arrow(res[1])+' '+pct(res[1],1)}</strong></td></tr>`:''}</tbody></table>`;
  if(hasCpi && pc){
    const want = st.sinceMonth ? rows.findIndex(r=>r.m===st.sinceMonth) : rows.length-4;
    const iA=paStart(rows,Math.min(want,iEnd-1)), iB=iEnd, R=iA>=0?paCalc(rows,iA,iB):null;
    const g=R?.g, city=(CPI_CITIES[z]||['—'])[0];
    const sentence = !R?'Pas assez de données pour calculer.'
      : g==null?`Les prix ${R.warn?'n\'ont pas été récupérés':'ne sont pas encore publiés'} après ${mlabel(rows[iA].m)} : le pouvoir d'achat n'est pas calculable. Choisissez un mois de départ plus ancien.`
      : `Avec votre indemnité, vous pouvez acheter <strong>${fmt(Math.abs(g)*100,1)} % ${g>=0?'de plus':'de moins'}</strong> sur place${iB===rows.length-1?'':' en '+mlabel(rows[iB].m)} qu'en ${mlabel(rows[iA].m)}.`;
    right=`<div class="panel">
      <div class="phead"><span class="eyebrow">Pouvoir d'achat à partir des euros</span>${tip(`Ce que votre indemnité, <strong>versée en euros</strong>, permet d'acheter sur place après conversion en ${esc(dev)}.<br>Il combine 3 éléments : l'indemnité, le taux de change et les prix à ${esc(city)}.`)}</div>
      <div class="huge num ${cls(g)}">${R&&g!=null?arrow(g)+' '+pct(g,1):'<span class="muted" style="font-size:1.4rem">non calculable</span>'}</div>
      <p style="margin:0">${sentence}</p>
      ${R?`<p class="small muted" style="margin:0">Calculé ${perLabel(rows[iA].m,rows[iB].m,iB===rows.length-1)}</p>`:''}
      ${periodBox(paOk)}
      ${R?(()=>{ const cl=curLabel(dev), fxNote=rows[R.F.j].fxProv?'moy. '+provRange().replace(/\/\d{4}$/,''):'';
        return ptab(mlabel(rows[iA].m), mlabel(rows[iB].m), [
          ['Indemnité en €', fmt(R.A.total)+' €', fmt(R.T.v)+' €', R.di],
          [`Taux € → ${cl}`, fmt(R.A.fx,4), fmt(R.F.v,4), R.df, false, fxNote||(R.F.carried?'taux '+deM(R.F.m):'')],
          [`Indemnité en ${cl}`, fmt(R.A.total*R.A.fx), fmt(R.T.v*R.F.v), R.dl],
          [`Indice des prix · ${esc(city)} ${tip(`Indice du coût de la vie utilisé : <strong>${esc(city)}</strong> (Statistique Canada).<br>Une zone d'indemnité peut regrouper plusieurs villes et leurs banlieues : leurs prix peuvent évoluer différemment.<br><a href="/villes-cout-de-la-vie">Villes utilisées par zone</a>`,'Quel indice ?')}`, fmt(R.A.cpi,1), R.noCpi?'<span class="muted">'+(R.warn?'non récupéré':'pas encore publié')+'</span>':fmt(R.C.v,1), R.dc, true, !R.noCpi&&R.C.carried?'publié : '+mlabel(R.C.m):'']
        ], ['= Pouvoir d\'achat', g]); })():''}
      ${R?.warn?`<p class="small late" style="margin:0">⚠ Certaines données n'ont pas été récupérées : voir le détail.</p>`:''}
      <button type="button" class="lkbtn ${R?.warn?'warn':''}" id="lkBtn" data-a="${iA}" data-b="${iB}" aria-haspopup="dialog">Voir le détail du calcul</button>
      <dialog id="lkDlg" class="dlg" aria-labelledby="lkT"></dialog>
      </div>`;
  } else {
    // Même règle et même période que le pouvoir d'achat ; sans coût de la vie, on suit l'indemnité en devise locale
    const want = st.sinceMonth ? rows.findIndex(r=>r.m===st.sinceMonth) : rows.length-4;
    let iA=Math.min(want,iEnd-1); while(iA>0&&(rows[iA].total==null||rows[iA].fx==null)) iA--;
    const r0=rows[iA], F=lastKnown(rows,iEnd,'fx'), T=lastKnown(rows,iEnd,'total'), rl=rows[iEnd];
    const di=T&&r0.total?T.v/r0.total-1:null, df=F&&r0.fx?F.v/r0.fx-1:null, dl=di!=null&&df!=null?(1+di)*(1+df)-1:null, res=euro?di:dl;
    const fxLab = F ? (rows[F.j].fxProv?'moy. '+provRange():'moy. '+deM(F.m)) : '';
    right=`<div class="panel">
      <div class="phead"><span class="eyebrow">Indemnité en ${euro?'euros':'devise locale ('+esc(dev)+')'}</span>${tip(`<strong>Coût de la vie non disponible</strong> pour cette zone : le pouvoir d'achat ne peut pas être calculé (ces données ne sont pas publiques ou fiables partout).<br>Fiez-vous au montant ${euro?'':'en devise locale '}et à votre connaissance des prix sur place (loyer, courses, transports). <a href="/methodologie">En savoir plus</a>`)}</div>
      <div class="huge num ${cls(res)}">${arrow(res)} ${pct(res,1)}</div>
      <p style="margin:0">${res==null?'Pas assez de données.':`Votre indemnité vaut <strong>${fmt(Math.abs(res)*100,1)} % ${res>=0?'de plus':'de moins'}</strong> en ${euro?'euros':esc(dev)} qu'en ${mlabel(r0.m)}.`}</p>
      <p class="small muted" style="margin:0">Calculé ${perLabel(r0.m,rl.m,iEnd===rows.length-1)}</p>
      ${periodBox(r=>r.total!=null&&r.fx!=null)}
      ${ptab(mlabel(r0.m), mlabel(rl.m), [['Indemnité en €', fmt(r0.total)+' €', T?fmt(T.v)+' €':'—', di], ...(euro?[]:[[`Taux € → ${curLabel(dev)}`, fmt(r0.fx,4), F?fmt(F.v,4):'—', df, false, F&&rows[F.j].fxProv?fxLab:'']])], euro?null:[`= Indemnité en ${curLabel(dev)}`, dl])}
      ${F?.carried&&!euro?`<p class="small late" style="margin:0">⚠ Cours de change ${deM(rl.m)} non récupérés : taux ${deM(F.m)} utilisé.</p>`:''}</div>`;
  }
  // Détail des 4 derniers mois : indemnité, taux, coût de la vie, puis le résultat (colonne distincte)
  const months = rows.slice(-4).reverse().map(r=>{
    const p=rows[rows.indexOf(r)-1];
    const dfx=r.fx!=null&&p.fx!=null?r.fx/p.fx-1:null, dcpi=r.cpi!=null&&p.cpi!=null?r.cpi/p.cpi-1:null;
    const dpa=paRaw(r)!=null&&paRaw(p)!=null?paRaw(r)/paRaw(p)-1:null;
    const dloc=r.total!=null&&p.total!=null&&r.fx!=null&&p.fx!=null?(r.total*r.fx)/(p.total*p.fx)-1:null;
    const dind=r.total!=null&&p.total!=null?r.total/p.total-1:null, arr=/-(01|04|07|10)$/.test(r.m)||(dind!=null&&Math.abs(dind)>1e-9);
    const res = hasCpi?dpa:(euro?dind:dloc);
    // Tableau : en-têtes de colonnes une seule fois ; chaque case reste cliquable (ouvre la fenêtre de détail)
    const cellBtn=(k,html,extra='')=>`<button type="button" class="mcell ${extra}" data-drawer="${k}">${html}</button>`;
    return `<tr><th scope="row">${mlabel(r.m)}</th>
      <td>${cellBtn('ind',`${r.total==null?'<span class="muted">pas encore publiée</span>':arr?`<span class="num ${cls(dind)}">${arrow(dind)} ${pct(dind)}</span> <span class="small muted">arrêté</span>`:'<span class="muted">inchangée</span>'}<br><span class="small muted num">${r.total==null?'':fmt(r.total)+' €'}</span>`)}</td>
      ${euro?'':`<td>${cellBtn('fx',`<span class="num ${cls(dfx)}">${r.fx==null?'<span class="muted">non récupéré</span>':arrow(dfx)+' '+pct(dfx)}</span><br><span class="small muted num">${r.fx==null?'':fmt(r.fx,4)+(r.fxProv?' ('+provRange()+')':'')}</span>`)}</td>`}
      <td>${hasCpi?cellBtn('cpi',`<span class="num ${cls(dcpi,true)}">${r.cpi==null?`<span class="muted">${cpiKind(r.m)==='miss'?'non récupéré':'pas encore publié'}</span>`:arrow(dcpi,true)+' '+pct(dcpi)}</span>${r.cpi==null?'':`<br><span class="small muted num">${fmt(r.cpi,1)}</span>`}`):'<span class="muted">non disponible</span>'}</td>
      <td class="pacol">${cellBtn('pa',`<span class="num ${cls(res)}"><strong>${res==null?'<span class="muted">en attente</span>':arrow(res)+' '+pct(res)}</strong></span>`)}</td></tr>`}).join('');
  const monthsHead = `<tr><th>Mois</th><th>Indemnité</th>${euro?'':`<th>Taux € → ${curLabel(dev)}</th>`}<th>Coût de la vie${hasCpi?'<br><span class="small muted" style="font-weight:400">'+esc((CPI_CITIES[z]||[''])[0])+'</span>':''}</th><th class="pacol">= Variation<br><span class="small muted" style="font-weight:400">${hasCpi?'pouvoir d\'achat':'indemnité en '+(euro?'€':esc(dev))}, sur 1 mois</span></th></tr>`;
  // Une seule fenêtre de détail pour les 4 cases : le graphique suit la case cliquée, le tableau est toujours le même
  const drawer = st.drawer ? (()=>{
    const RANGES=[['12','12 derniers mois',13],['24','2 ans',25],['60','5 ans',61],['120','10 ans',121],['all','Depuis 2014',rows.length]];
    const rg=RANGES.find(r=>r[0]===(st.drange||'24'));
    const last=rows.slice(-rg[2]), k=st.drawer;
    const rangeSel=`<div class="field"><label for="drange">Période</label><select id="drange">${RANGES.map(r=>`<option value="${r[0]}" ${r===rg?'selected':''}>${r[1]}</option>`).join('')}</select></div>`;
    const city=(CPI_CITIES[z]||[zoneLabel(z)])[0], rel=(a,b)=>a!=null&&b!=null?a/b-1:null;
    // Résultat : pouvoir d'achat (avec coût de la vie) ou indemnité en devise locale (sans)
    const val = r => hasCpi ? paRaw(r) : (r.total!=null&&r.fx!=null ? r.total*r.fx : null);
    const p0 = last.find(r=>val(r)!=null), c0=last.find(r=>r.cpi!=null);
    const resName = hasCpi ? 'Pouvoir d\'achat' : `Indemnité en ${euro?'€':esc(dev)}`;
    const TITLES={ind:'Indemnité en €', fx:`Taux de change € → ${esc(dev)}`, cpi:`Indice du coût de la vie — ${esc(city)}`, pa:hasCpi?'Pouvoir d\'achat à partir des euros':resName};
    const chart = k==='ind' ? spark(last.map(r=>({m:r.m,v:r.total})),{label:TITLES.ind,markers:[{m:'2021-06',label:'VIE = VIA'}]})
      : k==='fx' ? spark(last.map(r=>({m:r.m,v:r.fx})),{label:TITLES.fx})
      : k==='cpi' ? (c0?spark(last.map(r=>({m:r.m,v:r.cpi!=null?r.cpi/c0.cpi*100:null})),{inv:true,suffix:' %',label:TITLES.cpi})+`<p class="small muted" style="margin:0">100 % = niveau des prix en ${mlabel(c0.m)}.</p>`:'')
      : (p0?spark(last.map(r=>({m:r.m,v:val(r)!=null?val(r)/val(p0)*100:null})),{suffix:' %',label:TITLES.pa,markers:[{m:'2021-06',label:'VIE = VIA'}]})+`<p class="small muted" style="margin:0">100 % = ${mlabel(p0.m)}.</p>`:'');
    const sub=t=>`<br><span class="small muted" style="font-weight:400">${t}</span>`;
    const head=`<tr><th>Mois</th><th class="r">Indemnité en €${sub('variation à l\'arrêté')}</th>${euro?'':`<th class="r">Taux € → ${curLabel(dev)}${sub('moyenne du mois')}</th>`}${hasCpi?`<th class="r">Indice coût de la vie${sub(esc(city)+' (2002 = 100)')}</th>`:''}<th class="r pacol">Variation ${resName.toLowerCase()}${sub('depuis '+(p0?mlabel(p0.m):'—'))}</th><th class="r pacol">Variation${sub('sur 1 mois')}</th></tr>`;
    const body=last.slice().reverse().map(r=>{ const p=rows[rows.indexOf(r)-1];
      const di1=rel(r.total,p?.total), eff=/-(01|04|07|10)$/.test(r.m)||(di1!=null&&Math.abs(di1)>1e-9);
      const g=p0&&val(r)!=null?val(r)/val(p0)-1:null, d1=rel(val(r),p?val(p):null);
      const cpiCell=r.cpi==null?(cpiKind(r.m)==='miss'?'<span class="down">⚠ non récupéré</span>':'<span class="muted">pas encore publié</span>'):`${fmt(r.cpi,1)}${sub(pct(rel(r.cpi,p?.cpi)))}`;
      return `<tr><td>${mlabel(r.m)}${r===p0?' <span class="small muted">(référence)</span>':''}</td>
        <td class="r num">${r.total==null?'—':fmt(r.total)+' €'}${eff&&di1!=null?`<br><span class="small ${cls(di1)}">${pct(di1)}</span>`:''}</td>
        ${euro?'':`<td class="r num">${r.fx==null?'<span class="down">⚠ non récupéré</span>':fmt(r.fx,4)+(r.fxProv?sub(provRange()):'')}</td>`}
        ${hasCpi?`<td class="r num">${cpiCell}</td>`:''}
        <td class="r num pacol ${cls(g)}"><strong>${g==null?'—':arrow(g)+' '+pct(g,1)}</strong></td><td class="r num pacol ${cls(d1)}">${d1==null?'—':pct(d1)}</td></tr>`; }).join('');
    return `<div class="drawer"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><h3>${TITLES[k]||TITLES.pa}${k==='cpi'?'':' — '+esc(zoneLabel(z))} · ${st.mode.toUpperCase()}</h3><div style="display:flex;gap:10px;align-items:end">${rangeSel}<button class="btn ghost" type="button" data-drawer="">Fermer</button></div></div>
      ${chart}
      <div class="tscroll" style="max-height:360px;overflow-y:auto"><table class="list dtab"><thead>${head}</thead><tbody>${body}</tbody></table></div>
      <ul class="small muted" style="margin:0;padding-left:18px;display:grid;gap:2px">
        <li><strong>Indemnité</strong> : montant du mois ; la variation n'apparaît que le mois où l'arrêté prend effet (y compris 0,00 %).</li>
        ${hasCpi?'<li><strong>Indice du coût de la vie</strong> : valeur publiée et variation sur 1 mois.</li>':''}
        <li><strong>${resName}</strong> (colonnes mises en évidence) : résultat des autres colonnes, depuis le début de la période (${p0?mlabel(p0.m):'—'}) et sur 1 mois.</li></ul>
      <p class="src">Sources : arrêtés du Journal officiel${euro?'':' · '+(dev==='CAD'||H.fxSrc[dev]==='BCE'?'taux de référence de la BCE':'Frankfurter (banques centrales)')}${hasCpi?' · adapté de Statistique Canada, tableau 18-10-0004-01 (ne constitue pas une approbation par Statistique Canada)':''} · <a href="/historique">Historique complet</a></p></div>`})():'';
  return `<section class="view"><h1>Pouvoir d’achat VI</h1>${head}${alert}<div class="grid2">${card}${right}</div>
  <div class="panel"><h2>Détail des 4 derniers mois</h2><div class="tscroll"><table class="list mtab"><thead>${monthsHead}</thead><tbody>${months}</tbody></table></div>
    <p class="small muted" style="margin:0">${euro?'Zone euro : pas de taux de change.':'Cliquez sur une case (indemnité, taux de change'+(hasCpi?', coût de la vie, pouvoir d\'achat':'')+') pour voir son évolution. La dernière colonne est le résultat des trois autres.'}</p></div>${drawer}</section>`;
};

/* Historique : période choisie par mois de début et de fin (par défaut : janvier de l'année en cours → mois en cours) */
function histRange(){ let a=st.hA||CURRENT_MONTH.slice(0,4)+'-01', b=st.hB||CURRENT_MONTH; if(a>b) [a,b]=[b,a]; return [a,b]; }
function histPeriod(){ const [a,b]=histRange(), ms=H.months.filter(m=>m<=CURRENT_MONTH);
  return `<div class="period"><span class="eyebrow" style="grid-column:1/-1">Période affichée</span>
    <div class="field"><label for="hA">Du</label><select id="hA">${ms.filter(m=>m<=b).map(m=>`<option value="${m}" ${m===a?'selected':''}>${mlabel(m)}</option>`).reverse().join('')}</select></div>
    <div class="field"><label for="hB">au</label><select id="hB">${ms.filter(m=>m>=a).map(m=>`<option value="${m}" ${m===b?'selected':''}>${mlabel(m)}${m===CURRENT_MONTH?' · en cours':''}</option>`).reverse().join('')}</select></div></div>`; }
/* ---------- Historique : « Graph recap » en PDF (paysage, 1 graphique par page) ---------- */
let jsPDFLoading=null;
/* ===== Captcha ALTCHA (hébergé sur le serveur du site ; la maquette n'a pas de serveur : mode test) ===== */
const ALTCHA_JS='/lib/altcha.js', ALTCHA_CHALLENGE='/api/altcha';
let altchaLoading=null;
const postJson=(u,b,method='POST')=>fetch(u,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(b),credentials:'same-origin'}).then(r=>r.json());
function loadAltcha(){ if(customElements.get('altcha-widget')) return; altchaLoading ??= (()=>{ const sc=document.createElement('script'); sc.type='module'; sc.src=ALTCHA_JS; document.head.appendChild(sc); return true; })(); }
const captcha=id=>{ loadAltcha(); const conf=ALTCHA_CHALLENGE?{challenge:ALTCHA_CHALLENGE,hideFooter:true,language:'fr'}:{test:true,hideFooter:true,language:'fr'};
  return `<altcha-widget id="${id}" language="fr" configuration='${JSON.stringify(conf)}'></altcha-widget>`; };
const captchaOk=id=>{ const w=document.getElementById(id); return !!w && (w.getState?.()==='verified'); };
const captchaVal=id=>document.querySelector(`#${id} input[name="altcha"]`)?.value||'';
const captchaReset=id=>{ try{ document.getElementById(id)?.reset?.(); }catch(e){} };
function loadJsPDF(){
  if(window.jspdf) return Promise.resolve(window.jspdf.jsPDF);
  return jsPDFLoading ??= new Promise((ok,ko)=>{ const s=document.createElement('script');
    s.src='/lib/jspdf.umd.min.js'; s.onload=()=>ok(window.jspdf.jsPDF); s.onerror=()=>{ jsPDFLoading=null; ko(new Error('jsPDF')); }; document.head.appendChild(s); });
}
// Texte compatible avec les polices standard du PDF (espaces insécables, signes non latins)
const pdfTxt=s=>String(s).replace(/[  ]/g,' ').replace(/→/g,'->').replace(/≈/g,'~').replace(/−/g,'-').replace(/·/g,'-');
async function saveFile(filename, blob){
  const dl = window.claude?.use ? await window.claude.use('downloads') : null;
  if(dl){ try{ await dl.save({filename, data:blob}); return 'saved'; } catch(e){ return e?.code==='declined'?'declined':'error'; } }
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),5000); return 'saved';
}
/* Un graphique : points reliés, 4 dates équidistantes en abscisse, 7 valeurs équidistantes en ordonnée, fond quadrillé */
function pdfChart(doc, pts, o){
  const X0=28, X1=282, Y0=38, Y1=158, W=X1-X0, Hh=Y1-Y0, n=pts.length;
  const vals=pts.map(p=>p.v).filter(v=>v!=null); if(!vals.length) return;
  let lo=Math.min(...vals), hi=Math.max(...vals); if(hi-lo<1e-9){ lo-=Math.abs(lo)*0.01||1; hi+=Math.abs(hi)*0.01||1; }
  const pad=(hi-lo)*0.08; lo-=pad; hi+=pad;
  const xAt=i=>n<2?X0+W/2:X0+W*i/(n-1), yAt=v=>Y1-(v-lo)/(hi-lo)*Hh;
  // Fond quadrillé : 6 intervalles (7 valeurs) en ordonnée, quadrillage fin en abscisse
  doc.setFillColor(250,251,253); doc.rect(X0,Y0,W,Hh,'F');
  doc.setDrawColor(228,232,238); doc.setLineWidth(0.15);
  for(let k=0;k<=24;k++){ const x=X0+W*k/24; doc.line(x,Y0,x,Y1); }
  for(let k=0;k<=12;k++){ const y=Y0+Hh*k/12; doc.line(X0,y,X1,y); }
  doc.setDrawColor(200,206,214); doc.setLineWidth(0.3);
  // 7 valeurs équidistantes en ordonnée
  const step=(hi-lo)/6, dec=o.dec??(step<0.01?4:step<0.1?3:step<1?2:step<10?1:0);
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(90,98,110);
  for(let k=0;k<=6;k++){ const v=lo+step*k, y=yAt(v); doc.line(X0,y,X1,y); doc.text(pdfTxt(fmt(v,dec)), X0-2, y+1, {align:'right'}); }
  // 4 dates équidistantes en abscisse (toutes si 4 mois ou moins)
  const idx=n<=4?pts.map((_,i)=>i):[0,1,2,3].map(k=>Math.round(k*(n-1)/3));
  for(const i of idx){ const x=xAt(i); doc.line(x,Y0,x,Y1); doc.text(pdfTxt(mlabel(pts[i].m)), x, Y1+6, {align: i===0&&n>1?'left':i===n-1&&n>1?'right':'center'}); }
  doc.setDrawColor(120,128,140); doc.setLineWidth(0.4); doc.rect(X0,Y0,W,Hh,'S');
  if(o.ref!=null && o.ref>lo && o.ref<hi){ doc.setDrawColor(150,150,150); doc.setLineDashPattern([1.5,1.5],0); doc.line(X0,yAt(o.ref),X1,yAt(o.ref)); doc.setLineDashPattern([],0); }
  // Courbe : points reliés (interrompue si une valeur manque)
  const [r,g,b]=o.color; doc.setDrawColor(r,g,b); doc.setLineWidth(0.7);
  for(let i=1;i<n;i++) if(pts[i].v!=null&&pts[i-1].v!=null) doc.line(xAt(i-1),yAt(pts[i-1].v),xAt(i),yAt(pts[i].v));
  doc.setFillColor(r,g,b); const rad=n>60?0.45:n>24?0.7:1;
  pts.forEach((p,i)=>{ if(p.v!=null) doc.circle(xAt(i),yAt(p.v),rad,'F'); });
  doc.setFontSize(8.5); doc.setTextColor(90,98,110); doc.text(pdfTxt(o.unit), X0, Y0-3);
}
async function pdfRecap(){
  const z=st.zone, series=seriesFor(z); if(!series){ toast('Aucune donnée pour cette zone.'); return; }
  const [hA,hB]=histRange(), rows=series.filter(r=>r.m>=hA&&r.m<=hB); if(!rows.length){ toast('Aucune donnée sur cette période.'); return; }
  const dev=rows.at(-1).dev, mode=st.mode.toUpperCase(), zl=zoneLabel(z), city=(CPI_CITIES[z]||[''])[0];
  const charts=[];
  const paB=rows.find(r=>paRaw(r)!=null);
  if(paB) charts.push({ title:"Évolution du pouvoir d'achat à partir des euros", unit:`indice, 100 = ${mlabel(paB.m)}`, ref:100, dec:1, color:[36,87,197],
    pts:rows.map(r=>({m:r.m, v:paRaw(r)!=null?paRaw(r)/paRaw(paB)*100:null})),
    cap:[`Ce que l'indemnité versée en euros permet d'acheter sur place (${dev}), base 100 en ${mlabel(paB.m)}.`, `Calcul : indemnité totale (€) × taux de change moyen du mois ÷ indice des prix à la consommation de ${city}.`, 'Au-dessus de 100 : le pouvoir d\'achat a augmenté depuis le début de la période ; en dessous : il a baissé.'] });
  if(rows.some(r=>r.cpi!=null)) charts.push({ title:`Évolution du coût de la vie · ${city}`, unit:'indice des prix à la consommation (2002 = 100)', dec:1, color:[196,54,47],
    pts:rows.map(r=>({m:r.m, v:r.cpi})), cap:[`Indice des prix à la consommation de ${city}, tous produits, non désaisonnalisé (2002 = 100).`, 'Une hausse signifie que les prix sur place augmentent.', 'Source : Statistique Canada, tableau 18-10-0004-01.'] });
  if(dev&&dev!=='EUR'&&rows.some(r=>r.fx!=null)) charts.push({ title:`Évolution du taux de change € -> ${dev}`, unit:`1 € = … ${dev}`, color:[31,138,76],
    pts:rows.map(r=>({m:r.m, v:r.fx})), cap:[`Nombre de ${dev} obtenus pour 1 €, moyenne mensuelle${rows.some(r=>r.fxProv)?' (mois en cours : moyenne provisoire depuis le 1er)':''}.`, 'Une hausse est favorable : chaque euro de l\'indemnité vaut plus en monnaie locale.', `Source : ${dev==='CAD'||H.fxSrc[dev]==='BCE'?'Banque centrale européenne':'Frankfurter'}.`] });
  charts.push({ title:`Évolution de l'indemnité en euros (${mode})`, unit:'€ par mois (part fixe + part géographique, brut)', color:[168,106,0],
    pts:rows.map(r=>({m:r.m, v:r.total})), cap:['Indemnité mensuelle brute en euros : part fixe (commune à toutes les zones) + part géographique de la zone.', 'La part géographique change chaque trimestre, par arrêté publié au Journal officiel.', 'Source : Journal officiel (open data DILA) et Légifrance.'] });
  toast('Préparation du PDF…');
  let JsPDF; try{ JsPDF=await loadJsPDF(); } catch(e){ toast('Impossible de préparer le PDF (connexion).'); return; }
  const doc=new JsPDF({orientation:'landscape', unit:'mm', format:'a4'}), today=new Date().toISOString().slice(0,10);
  charts.forEach((c,i)=>{
    if(i) doc.addPage();
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(36,87,197); doc.text(SITE.nom.toUpperCase()+' · GRAPH RECAP', 15, 12);
    doc.setFont('helvetica','normal'); doc.setTextColor(90,98,110); doc.text(pdfTxt(`${zl} · ${mode} · ${mlabel(hA)} -> ${mlabel(hB)}`), 282, 12, {align:'right'});
    doc.setDrawColor(221,225,231); doc.setLineWidth(0.3); doc.line(15,15,282,15);
    doc.setFont('helvetica','bold'); doc.setFontSize(15); doc.setTextColor(20,24,31); doc.text(pdfTxt(c.title), 15, 25);
    pdfChart(doc, c.pts, c);
    doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(40,46,56);
    let y=176; for(const l of c.cap){ doc.text(pdfTxt('• '+l), 15, y, {maxWidth:267}); y+=5.5; }
    doc.setFontSize(7.5); doc.setTextColor(120,128,140);
    doc.text(pdfTxt(`Données publiques uniquement. Généré le ${fmtDay(today)}. Seuls les textes publiés au Journal officiel font foi.`), 15, 203);
    doc.text(`${i+1} / ${charts.length}`, 282, 203, {align:'right'});
  });
  const slug=z.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const res=await saveFile(`graph-recap-${slug}-${st.mode}-${hA}_${hB}.pdf`, doc.output('blob'));
  toast(res==='saved'?`PDF prêt : ${charts.length} graphique${charts.length>1?'s':''}.`:res==='declined'?'Téléchargement annulé.':'Téléchargement impossible ici.');
}
const cmpAddM=(m,k)=>{ const [y,mm]=m.split('-').map(Number), t=y*12+mm-1+k; return `${Math.floor(t/12)}-${String(t%12+1).padStart(2,'0')}`; };
/* ===== Comparaison entre pays : carte du monde, tableau classé, graphique dans le temps ===== */
const PAYS_ISO={"AFGHANISTAN":"004","AFRIQUE DU SUD":"710","ALBANIE":"008","ALGERIE":"012","ALLEMAGNE":"276","ANDORRE":"020","ANGOLA":"024","ANTIGUA-ET-BARBUDA":"028","ARABIE SAOUDITE":"682","ARGENTINE":"032","ARMENIE":"051","AUSTRALIE":"036","AUTRICHE":"040","AZERBAIDJAN":"031","BAHAMAS":"044","BAHREIN":"048","BANGLADESH":"050","BARBADE":"052","BELGIQUE":"056","BELIZE":"084","BENIN":"204","BHOUTAN":"064","BIELORUSSIE":"112","BIRMANIE":"104","BOLIVIE":"068","BOSNIE-HERZEGOVINE":"070","BOTSWANA":"072","BRESIL":"076","BRUNEI":"096","BULGARIE":"100","BURKINA FASO":"854","BURUNDI":"108","CAMBODGE":"116","CAMEROUN":"120","CANADA":"124","CHILI":"152","CHINE":"156","CHYPRE":"196","COLOMBIE":"170","COMORES":"174","CONGO":"178","COREE DU NORD":"408","COREE DU SUD":"410","COSTA RICA":"188","COTE D'IVOIRE":"384","CROATIE":"191","CUBA":"192","DANEMARK":"208","DJIBOUTI":"262","DOMINIQUE":"212","EGYPTE":"818","EMIRATS ARABES UNIS":"784","EQUATEUR":"218","ERYTHREE":"232","ESPAGNE":"724","ESTONIE":"233","ESWATINI":"748","ETATS-UNIS":"840","ETHIOPIE":"231","FIDJI":"242","FINLANDE":"246","GABON":"266","GAMBIE":"270","GEORGIE":"268","GHANA":"288","GRECE":"300","GRENADE":"308","GUATEMALA":"320","GUINEE":"324","GUINEE EQUATORIALE":"226","GUYANA":"328","HAITI":"332","HONDURAS":"340","HONGRIE":"348","INDE":"356","INDONESIE":"360","IRAK":"368","IRAN":"364","IRLANDE":"372","ISLANDE":"352","ISRAEL":"376","ITALIE":"380","JAMAIQUE":"388","JAPON":"392","JORDANIE":"400","KAZAKHSTAN":"398","KENYA":"404","KOWEIT":"414","LAOS":"418","LESOTHO":"426","LETTONIE":"428","LIBAN":"422","LIBERIA":"430","LIBYE":"434","LITUANIE":"440","LUXEMBOURG":"442","MACAO":"446","MACEDOINE DU NORD":"807","MADAGASCAR":"450","MALAISIE":"458","MALAWI":"454","MALDIVES":"462","MALI":"466","MALTE":"470","MAROC":"504","MAURITANIE":"478","MEXIQUE":"484","MOLDAVIE":"498","MONACO":"492","MONGOLIE":"496","MONTENEGRO":"499","MOZAMBIQUE":"508","NAMIBIE":"516","NEPAL":"524","NICARAGUA":"558","NIGER":"562","NIGERIA":"566","NORVEGE":"578","NOUVELLE-ZELANDE":"554","OMAN":"512","OUGANDA":"800","OUZBEKISTAN":"860","PAKISTAN":"586","PANAMA":"591","PAPOUASIE-NOUVELLE-GUINEE":"598","PARAGUAY":"600","PAYS-BAS":"528","PEROU":"604","PHILIPPINES":"608","POLOGNE":"616","PORTUGAL":"620","QATAR":"634","REPUBLIQUE CENTRAFRICAINE":"140","REPUBLIQUE DOMINICAINE":"214","REPUBLIQUE TCHEQUE":"203","ROUMANIE":"642","ROYAUME-UNI":"826","RUSSIE":"643","RWANDA":"646","SAINT-CHRISTOPHE-ET-NIEVES":"659","SAINT-VINCENT-ET-LES GRENADINES":"670","SAINTE-LUCIE":"662","SALVADOR":"222","SAMOA":"882","SAO TOME ET PRINCIPE":"678","SAO TOME-ET-PRINCIPE":"678","SENEGAL":"686","SERBIE":"688","SEYCHELLES":"690","SIERRA LEONE":"694","SINGAPOUR":"702","SLOVAQUIE":"703","SLOVENIE":"705","SOMALIE":"706","SOUDAN":"729","SOUDAN DU SUD":"728","SRI LANKA":"144","SUEDE":"752","SUISSE":"756","SURINAME":"740","SYRIE":"760","TADJIKISTAN":"762","TANZANIE":"834","TCHAD":"148","THAILANDE":"764","TIMOR ORIENTAL":"626","TOGO":"768","TRINITE-ET-TOBAGO":"780","TUNISIE":"788","TURKMENISTAN":"795","TURQUIE":"792","UKRAINE":"804","URUGUAY":"858","VANUATU":"548","VENEZUELA":"862","VIETNAM":"704","YEMEN":"887","ZAMBIE":"894","ZIMBABWE":"716","CAP-VERT":"132","CONGO RDC":"180","GUINEE-BISSAO":"624","KIRGHIZSTAN":"417","MAURICE":"480","SAINT-SIEGE":"336","TAIPEI":"158"};   // pays (nom du barème) → code ISO 3166 numérique (forme sur la carte)
const CMP_VALS={
  eur:{l:'Indemnité en euros', short:'Indemnité', dec:2, at:r=>r.total, help:'Montant mensuel brut en euros (part fixe + part géographique) du mois choisi.'},
  fx: {l:'Taux de change (1 € → monnaie locale)', short:'1 € =', dec:4, log:true, base100:true, skipEur:true, at:r=>r.dev==='EUR'?null:r.fx, help:'Taux de change moyen du mois choisi : nombre d’unités de monnaie locale obtenues pour 1 €. Classement et couleurs suivent cette valeur.'},
  cpi:{l:'Indice du coût de la vie', short:'Indice (2002 = 100)', dec:1, base100:true, at:r=>r.cpi, help:'Indice des prix à la consommation du mois choisi (base 100 en 2002).'},
  pa: {l:'Pouvoir d’achat', short:'Pouvoir d’achat', dec:2, base100:true, at:r=>paRaw(r), help:'Pouvoir d’achat du mois choisi : indemnité convertie en monnaie locale ÷ indice des prix. Comparable seulement entre zones de même monnaie.'},
};
const CMP_PAL=['#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b','#e377c2','#7f7f7f','#bcbd22','#17becf','#393b79','#e6550d','#31a354','#843c39','#7b4173','#3182bd','#fd8d3c','#74c476','#ad494a','#a55194'];
let cmpLibs=null, cmpTopo=null;
function loadScript(src){ return new Promise((ok,ko)=>{ const s=document.createElement('script'); s.src=src; s.onload=ok; s.onerror=ko; document.head.appendChild(s); }); }
function cmpLoad(){ return cmpLibs ??= Promise.all([
  window.d3?null:loadScript('/lib/d3.min.js'),
  ]).then(()=>window.topojson?null:loadScript('/lib/topojson.min.js'))
    .then(()=>fetch(CMP_MAP_URL).then(r=>r.json())).then(t=>{ cmpTopo=t; }); }
const CMP_MAP_URL='countries-50m.json';
// Toutes les séries mensuelles, par zone (mises en cache par mode VIE / VIA)
function cmpData(){
  const key=st.mode; if(st.cmpCache&&st.cmpCache.key===key) return st.cmpCache;
  const zones=Object.keys(H.zones).map(z=>{ const rows=seriesFor(z)||[]; const by={}; rows.forEach(r=>by[r.m]=r); return {z, pays:H.zones[z].p, dev:rows.length?rows.at(-1).dev:H.zones[z].d, by}; });
  return st.cmpCache={key, zones};
}
const cmpMonths=()=>H.months.filter(m=>m<=CURRENT_MONTH);
// Valeur d'une zone à un mois : brute (euros) ou évolution sur N mois (autres valeurs)
function cmpMetric(z,vk,m){ const V=CMP_VALS[vk], r=z.by[m]; if(!r) return null; const v=V.at(r); if(v==null) return null; if(V.skipEur&&z.dev==='EUR') return null; return {v, raw:v}; }
function cmpDefaultMonth(vk){ const D2=cmpData(), ms=cmpMonths(), cnt=m=>D2.zones.filter(z=>{ const r=z.by[m]; return r&&CMP_VALS[vk].at(r)!=null; }).length;
  const mx=Math.max(...ms.slice(-6).map(cnt)); return [...ms].reverse().find(m=>cnt(m)>=Math.max(1,mx*0.5))||ms.at(-1); }
const cmpFmt=(vk,x,dev)=>vk==='eur'?fmt(x,2)+' €':vk==='fx'?fmt(x,x>=1000?0:x>=100?2:4)+(dev?' '+dev:''):fmt(x,CMP_VALS[vk].dec);
function cmpColor(min,max,log){ const lo=d3.rgb('#fbe8b8'), mid=d3.rgb('#41b6c4'), hi=d3.rgb('#0c2c84'), f=log?(x=>Math.log10(Math.max(x,1e-9))):(x=>x);
  return v=>{ if(v==null) return null; const t=f(max)>f(min)?Math.max(0,Math.min(1,(f(v)-f(min))/(f(max)-f(min)))):0.5; return t<0.5?d3.interpolateRgb(lo,mid)(t*2):d3.interpolateRgb(mid,hi)((t-0.5)*2); }; }
const cmpInk=c=>{ const x=d3.rgb(c); return (0.299*x.r+0.587*x.g+0.114*x.b)>150?'#14181f':'#fff'; };

V.comparaison = ()=>{
  const vk=CMP_VALS[st.cmpV]?st.cmpV:'eur', V=CMP_VALS[vk], ms=cmpMonths(), m=ms.includes(st.cmpM)?st.cmpM:cmpDefaultMonth(vk);
  const end=ms.includes(st.cmpB)?st.cmpB:ms.at(-1), start=ms.includes(st.cmpA)?st.cmpA:(ms[Math.max(0,ms.indexOf(end)-23)]);
  const opt=(arr,v)=>arr.map(([k,l])=>`<option value="${esc(k)}" ${k===v?'selected':''}>${esc(l)}</option>`).join('');
  const monthsOpt=v=>[...ms].reverse().map(x=>`<option value="${x}" ${x===v?'selected':''}>${mlabel(x)}${x===CURRENT_MONTH?' · en cours':''}</option>`).join('');
  return `<section class="view"><h1>Comparaison entre pays</h1>
  <div class="toolbar cmpbar">
    <div class="field"><label for="cmpV">Valeur comparée</label><select id="cmpV">${opt(Object.entries(CMP_VALS).map(([k,x])=>[k,x.l]),vk)}</select></div>
    <div class="field"><label for="cmpM">Date</label><select id="cmpM">${monthsOpt(m)}</select></div>
    ${modeToggle()}</div>
  <p class="small muted" style="margin:0">${esc(V.help)}</p>
  <div class="panel cmpmap"><div class="phead" style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><h2 style="margin:0">${esc(V.l)} · ${mlabel(m)} · ${st.mode.toUpperCase()}</h2>
    <span class="small muted">Molette ou boutons pour zoomer · glisser pour se déplacer</span></div>
    <div id="cmpMap" class="mapbox"><p class="muted" style="margin:0;padding:20px">Chargement de la carte…</p></div><div id="cmpLegend" class="maplegend"></div></div>
  <div class="panel"><div id="cmpTable"></div></div>
  <div class="panel"><div class="phead" style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:flex-end"><h2 style="margin:0">Évolution dans le temps · ${esc(V.l)}</h2>
    <div class="toolbar" style="margin:0">
      <div class="field"><label for="cmpA">Du</label><select id="cmpA">${monthsOpt(start)}</select></div>
      <div class="field"><label for="cmpB">Au</label><select id="cmpB">${monthsOpt(end)}</select></div>
      <div class="field"><label>Pays affichés</label><div class="cmppick"><button type="button" id="cmpPickBtn" class="btn ghost" aria-expanded="${!!st.cmpPickOpen}">Choisir (<span id="cmpPickN">…</span>) ▾</button><div id="cmpPick" class="cmppickbox" ${st.cmpPickOpen?'':'hidden'}></div></div></div>
    </div></div>
    <div id="cmpChart" class="cmpchart"></div><div id="cmpChartLegend" class="cmplegend"></div>
    <div id="cmpNote"></div>
    ${vk==='fx'?`<p class="small muted" style="margin:0">Points reliés ; un mois sans valeur n’est pas tracé. Par défaut : les 20 plus grandes valeurs (réelles, sans base 100) au dernier mois de la période ; votre zone, si vous la cochez, apparaît en trait épais.</p>`:`<p class="small muted" style="margin:0">${V.base100?`Base 100 = ${mlabel(start)} pour chaque pays : la courbe montre l’évolution, comparable d’un pays à l’autre. Échelle logarithmique : un doublement a toujours la même hauteur, pour qu’une très forte hausse n’écrase pas les autres courbes.`:'Montants en euros.'} Points reliés ; un mois sans valeur n’est pas tracé. Par défaut : les 20 plus grandes valeurs (réelles, sans base 100) au dernier mois de la période ; votre zone, si vous la cochez, apparaît en trait épais.</p>`}</div>
  </section>`;
};

async function mountComparaison(){
  try{ await cmpLoad(); } catch(e){ $('#cmpMap').innerHTML='<p class="muted" style="padding:20px;margin:0">Carte indisponible (connexion).</p>'; return; }
  if(vueCourante()!=='comparaison') return;
  const vk=CMP_VALS[st.cmpV]?st.cmpV:'eur', V=CMP_VALS[vk], ms=cmpMonths(), m=ms.includes(st.cmpM)?st.cmpM:cmpDefaultMonth(vk), D2=cmpData();
  // Valeurs à la date choisie
  const vals=D2.zones.map(z=>({z, x:cmpMetric(z,vk,m)})).filter(o=>o.x).sort((a,b)=>b.x.v-a.x.v);
  const xs=vals.map(o=>o.x.v).sort((a,b)=>a-b), q=p=>xs.length?xs[Math.min(xs.length-1,Math.max(0,Math.round(p*(xs.length-1))))]:0;
  const color=V.log?cmpColor(xs[0],xs.at(-1),true):cmpColor(q(0.03),q(0.97));
  // ----- Carte -----
  const byPays={}; vals.forEach(o=>(byPays[o.z.pays]??=[]).push(o));
  const iso={}; Object.entries(byPays).forEach(([p,arr])=>{ const id=PAYS_ISO[p]; if(!id) return; const s=arr.map(o=>o.x.v).sort((a,b)=>a-b); iso[id]={p, v:s[Math.floor((s.length-1)/2)], arr, dev:arr[0].z.dev}; });
  const box=$('#cmpMap'); box.innerHTML=''; const W=box.clientWidth||900, Hh=Math.round(W*0.5);
  const svg=d3.select(box).append('svg').attr('viewBox',`0 0 ${W} ${Hh}`).attr('class','mapsvg');
  const feats=topojson.feature(cmpTopo,cmpTopo.objects.countries).features.filter(f=>f.properties.name!=='Antarctica');
  const proj=d3.geoNaturalEarth1().fitSize([W,Hh],{type:'FeatureCollection',features:feats}), path=d3.geoPath(proj);
  const g=svg.append('g'); const tip=d3.select(box).append('div').attr('class','maptip').style('display','none');
  g.selectAll('path').data(feats).join('path').attr('d',path)
    .attr('fill',f=>iso[f.id]?color(iso[f.id].v):'var(--maprest)').attr('stroke','var(--mapline)').attr('stroke-width',0.4).attr('vector-effect','non-scaling-stroke')
    .on('mousemove',(ev,f)=>{ const d=iso[f.id], [mx,my]=d3.pointer(ev,box);
      tip.style('display','block').style('left',Math.min(mx+14,W-230)+'px').style('top',(my+12)+'px')
        .html(d?`<strong>${esc(titleCase(d.p))}</strong><br>${d.arr.length>1?'Médiane : ':''}<strong>${cmpFmt(vk,d.v,d.dev)}</strong>${d.arr.length>1?'<br>'+d.arr.slice(0,6).map(o=>`<span class="small">${esc(zoneLabel(o.z.z))} : ${cmpFmt(vk,o.x.v,o.z.dev)}</span>`).join('<br>')+(d.arr.length>6?`<br><span class="small muted">+ ${d.arr.length-6} autre(s)</span>`:''):''}`:`<strong>${esc(f.properties.name)}</strong><br><span class="small muted">Pas de valeur</span>`); })
    .on('mouseleave',()=>tip.style('display','none'));
  const zoom=d3.zoom().scaleExtent([1,12]).translateExtent([[0,0],[W,Hh]]).on('zoom',ev=>g.attr('transform',ev.transform));
  svg.call(zoom);
  const zb=d3.select(box).append('div').attr('class','mapzoom');
  zb.append('button').attr('type','button').text('+').attr('aria-label','Zoomer').on('click',()=>svg.transition().call(zoom.scaleBy,1.6));
  zb.append('button').attr('type','button').text('−').attr('aria-label','Dézoomer').on('click',()=>svg.transition().call(zoom.scaleBy,1/1.6));
  zb.append('button').attr('type','button').text('⟲').attr('aria-label','Toute la planète').on('click',()=>svg.transition().call(zoom.transform,d3.zoomIdentity));
  const l0=V.log?xs[0]:q(0.03), l1=V.log?xs.at(-1):q(0.97), stops=[0,.25,.5,.75,1].map(t=>color(V.log?Math.pow(10,Math.log10(l0)+(Math.log10(l1)-Math.log10(l0))*t):l0+(l1-l0)*t));
  $('#cmpLegend').innerHTML=`<span class="small muted">${cmpFmt(vk,l0)}</span><span class="ramp" style="background:linear-gradient(90deg,${stops.join(',')})"></span><span class="small muted">${cmpFmt(vk,l1)}</span><span class="small muted">· gris : pas de valeur · pays à plusieurs zones : médiane${V.log?' · échelle logarithmique (les monnaies vont de moins de 1 à plus d’un million pour 1 €)':''}</span>`;
  // ----- Tableau -----
  $('#cmpTable').innerHTML=`<div class="phead" style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h2 style="margin:0">Classement · ${esc(V.l)} · ${mlabel(m)}</h2>
      <button type="button" class="linkbtn small" id="cmpCsv" title="Télécharger ce tableau en CSV">⬇ CSV</button></div>
    <div class="tscroll cmptab"><table class="list"><thead><tr><th class="r">#</th><th>Zone</th><th>Pays</th><th class="r">${esc(V.short)}</th></tr></thead><tbody>
      ${vals.map((o,i)=>{ const c=color(o.x.v); return `<tr><td class="r num muted">${i+1}</td><td><a href="/pouvoir-achat" data-zone="${esc(o.z.z)}">${esc(zoneLabel(o.z.z))}</a></td><td class="small">${esc(titleCase(o.z.pays))}</td>
        <td class="r"><span class="vchip num" style="background:${c};color:${cmpInk(c)}">${cmpFmt(vk,o.x.v,o.z.dev)}</span></td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="small muted" style="margin:0">${vals.length} zone(s) avec une valeur ; les zones sans valeur à cette date ne sont pas listées. Plus grande valeur en haut.</p>`;
  $('#cmpCsv').onclick=async()=>{ trackEvent('Téléchargement CSV (comparaison)',{valeur:vk}); const out=[`zone;pays;mois;mode;valeur;${vk==='eur'?'indemnite_eur':vk==='fx'?'devise;eur_vers_devise':vk==='cpi'?'indice_2002_100':'pouvoir_achat'}`];
    vals.forEach(o=>out.push([o.z.z,o.z.pays,m,st.mode.toUpperCase(),vk,...(vk==='fx'?[o.z.dev||'']:[]),String(+o.x.v.toFixed(6)).replace('.',',')].join(';')));
    const r=await saveFile(`comparaison-${vk}-${st.mode}-${m}.csv`, new Blob(['﻿'+out.join('\r\n')],{type:'text/csv;charset=utf-8'}));
    toast(r==='saved'?`CSV enregistré : ${vals.length} lignes.`:r==='declined'?'Téléchargement annulé.':'Téléchargement impossible ici.'); };
  cmpDrawChart();
}

function cmpDrawChart(rebuildPick=true){
  const vk=CMP_VALS[st.cmpV]?st.cmpV:'eur', V=CMP_VALS[vk], ms=cmpMonths(), D2=cmpData();
  const end=ms.includes(st.cmpB)?st.cmpB:ms.at(-1); let start=ms.includes(st.cmpA)?st.cmpA:ms[Math.max(0,ms.indexOf(end)-23)]; if(start>end) start=end;
  const months=ms.filter(x=>x>=start&&x<=end);
  const series=D2.zones.map(z=>{ const raw=months.map(m=>{ const r=z.by[m]; const v=r?V.at(r):null; return V.skipEur&&z.dev==='EUR'?null:v; });
    const b=V.base100?raw.find(v=>v!=null&&v!==0):null; const pts=months.map((m,i)=>({m, v:raw[i]==null?null:(V.base100?raw[i]/b*100:raw[i])}));
    const last=[...pts].reverse().find(p=>p.v!=null), lastRaw=[...raw].reverse().find(v=>v!=null); return {z, pts, last:last?last.v:null, lastRaw:lastRaw??null}; }).filter(s=>s.last!=null);
  const key=`${vk}|${st.mode}|${start}|${end}`;
  if(!st.cmpSel||st.cmpSelKey!==key&&!st.cmpSelManual){ st.cmpSel=[...series].sort((a,b)=>b.lastRaw-a.lastRaw).slice(0,20).map(s=>s.z.z); st.cmpSelKey=key; }
  const sel=new Set(st.cmpSel);
  const shown=series.filter(s=>sel.has(s.z.z)).sort((a,b)=>b.lastRaw-a.lastRaw);
  // Liste déroulante de choix des pays
  $('#cmpPickN').textContent=shown.length;
  const q=(st.cmpQ||'').toLowerCase();
  const pickList=$('#cmpPick .cmppicklist'), keepTop=pickList?pickList.scrollTop:0;
  if(rebuildPick){ $('#cmpPick').innerHTML=`<input type="search" id="cmpQ" placeholder="Rechercher…" value="${esc(st.cmpQ||'')}" aria-label="Rechercher un pays ou une zone">
    <div class="small" style="display:flex;gap:10px"><button type="button" class="linkbtn" data-cmpsel="top">20 plus grandes</button><button type="button" class="linkbtn" data-cmpsel="none">Tout décocher</button></div>
    <div class="cmppicklist">${[...series].sort((a,b)=>b.lastRaw-a.lastRaw).filter(s=>!q||(zoneLabel(s.z.z)+' '+s.z.pays).toLowerCase().includes(q)).map(s=>`<label><input type="checkbox" data-cmpz="${esc(s.z.z)}" ${sel.has(s.z.z)?'checked':''}><span class="pn">${esc(zoneLabel(s.z.z))}</span><span class="pv num">${cmpFmt(vk,s.lastRaw,s.z.dev)}</span></label>`).join('')}</div>`;
    const nl=$('#cmpPick .cmppicklist'); if(nl) nl.scrollTop=keepTop; }
  // Graphique
  const box=$('#cmpChart'); box.innerHTML=''; const W=box.clientWidth||900, Hh=440, M={l:58,r:16,t:14,b:34};
  if(!shown.length){ box.innerHTML=`<div class="cmpempty" style="height:${Hh}px"><span class="small muted">Aucun pays sélectionné</span></div>`; $('#cmpChartLegend').innerHTML=''; $('#cmpNote').innerHTML=''; return; }
  const svg=d3.select(box).append('svg').attr('viewBox',`0 0 ${W} ${Hh}`).attr('class','chartsvg');
  const all=shown.flatMap(s=>s.pts.filter(p=>p.v!=null).map(p=>p.v)); let lo=Math.min(...all), hi=Math.max(...all); const LOG=!!V.base100&&lo>0;   // évolutions (base 100) : échelle logarithmique, chaque doublement a la même hauteur
  if(LOG){ const f=Math.pow(hi/lo,0.05)||1.05; lo/=f; hi*=f; } else { const pad=(hi-lo||Math.abs(hi)||1)*0.06, allPos=lo>=0; lo-=pad; hi+=pad; if(allPos&&lo<0) lo=0; }
  const x=d3.scalePoint().domain(months).range([M.l,W-M.r]), y=(LOG?d3.scaleLog():d3.scaleLinear()).domain([lo,hi]).range([Hh-M.b,M.t]);
  const yt=d3.range(7).map(k=>LOG?Math.exp(Math.log(lo)+(Math.log(hi)-Math.log(lo))*k/6):lo+(hi-lo)*k/6);
  svg.append('g').selectAll('line').data(yt).join('line').attr('x1',M.l).attr('x2',W-M.r).attr('y1',d=>y(d)).attr('y2',d=>y(d)).attr('class','grid');
  const xi=months.length<=6?months:d3.range(6).map(k=>months[Math.round(k*(months.length-1)/5)]);
  svg.append('g').selectAll('line').data(xi).join('line').attr('x1',d=>x(d)).attr('x2',d=>x(d)).attr('y1',M.t).attr('y2',Hh-M.b).attr('class','grid');
  svg.append('g').selectAll('text').data(yt).join('text').attr('x',M.l-6).attr('y',d=>y(d)+4).attr('text-anchor','end').attr('class','axis').text(d=>fmt(d,V.base100?(d>=1000?0:1):0));
  svg.append('g').selectAll('text').data(xi).join('text').attr('x',d=>x(d)).attr('y',Hh-M.b+18).attr('text-anchor',(d,i)=>xi.length>1&&i===0?'start':xi.length>1&&i===xi.length-1?'end':'middle').attr('class','axis').text(d=>mlabel(d));
  if(V.base100&&100>lo&&100<hi) svg.append('line').attr('x1',M.l).attr('x2',W-M.r).attr('y1',y(100)).attr('y2',y(100)).attr('class','ref');
  const col=new Map(shown.map((s,i)=>[s.z.z, s.z.z===st.zone?'var(--fg)':CMP_PAL[i%CMP_PAL.length]]));
  const line=d3.line().defined(p=>p.v!=null&&(!LOG||p.v>0)).x(p=>x(p.m)).y(p=>y(p.v));
  const gs=svg.append('g').selectAll('g').data(shown).join('g').attr('class','ser').attr('data-z',s=>s.z.z);
  gs.append('path').attr('d',s=>line(s.pts)).attr('fill','none').attr('stroke',s=>col.get(s.z.z)).attr('stroke-width',s=>s.z.z===st.zone?3:1.8);
  gs.selectAll('circle').data(s=>s.pts.filter(p=>p.v!=null&&(!LOG||p.v>0)).map(p=>({...p,z:s.z.z}))).join('circle').attr('cx',p=>x(p.m)).attr('cy',p=>y(p.v)).attr('r',months.length>36?1.6:2.6).attr('fill',p=>col.get(p.z));
  // Survol : valeurs de tous les pays affichés pour le mois pointé
  const hover=svg.append('line').attr('class','hoverline').attr('y1',M.t).attr('y2',Hh-M.b).style('display','none');
  const tip=d3.select(box).append('div').attr('class','maptip').style('display','none');
  svg.append('rect').attr('x',M.l).attr('y',M.t).attr('width',W-M.l-M.r).attr('height',Hh-M.t-M.b).attr('fill','transparent')
    .on('mousemove',ev=>{ const [mx,my]=d3.pointer(ev); const i=Math.max(0,Math.min(months.length-1,Math.round((mx-M.l)/((W-M.l-M.r)/Math.max(1,months.length-1))))), mm=months[i];
      hover.style('display',null).attr('x1',x(mm)).attr('x2',x(mm));
      const rows=shown.map(s=>({s,v:s.pts[i].v})).filter(o=>o.v!=null).sort((a,b)=>b.v-a.v);
      const bx=box.getBoundingClientRect(), px=(x(mm)/W)*bx.width;
      tip.style('display','block').style('left',(px>bx.width/2?px-250:px+14)+'px').style('top','8px')
        .html(`<strong>${mlabel(mm)}</strong><br>${rows.slice(0,14).map(o=>`<span class="dot" style="background:${col.get(o.s.z.z)}"></span>${esc(zoneLabel(o.s.z.z))} : <strong>${V.base100?fmt(o.v,1):fmt(o.v,2)+' €'}</strong>`).join('<br>')}${rows.length>14?`<br><span class="small muted">+ ${rows.length-14} autre(s)</span>`:''}`); })
    .on('mouseleave',()=>{ hover.style('display','none'); tip.style('display','none'); });
  // Note propre au taux de change
  const top=[...shown].sort((a,b)=>b.last-a.last)[0];
  $('#cmpNote').innerHTML=vk!=='fx'?'':`<div class="note small" style="display:grid;gap:4px"><strong>À propos du taux de change</strong>
    <span>• La courbe montre combien de monnaie locale vaut 1 €, en base 100 au début de la période (${mlabel(start)}). Au-dessus de 100 : la monnaie locale a perdu de la valeur face à l’euro, ce qui est <strong>favorable</strong> au volontaire payé en euros ; en dessous : défavorable.</span>
    <span>• L’échelle est logarithmique : un doublement a toujours la même hauteur.</span>
    ${top&&top.last>=200?`<span>• ${esc(zoneLabel(top.z.z))} : 1 € vaut ${fmt(top.last/100,top.last>=1000?0:1)} fois plus de monnaie locale qu’au début de la période ; sa courbe reste donc tout en haut. Décochez-la dans « Pays affichés » pour mieux voir les autres pays.</span>`:''}
    <span>• Une très forte hausse vient souvent d’une forte inflation ou d’une dévaluation ; elle ne se traduit pas forcément par un meilleur pouvoir d’achat, car les prix locaux montent aussi.</span></div>`;
  // Légende : survol = mise en avant de la courbe
  $('#cmpChartLegend').innerHTML=shown.map(s=>`<span class="lg" data-lgz="${esc(s.z.z)}"><span class="dot" style="background:${col.get(s.z.z)}"></span>${esc(zoneLabel(s.z.z))}</span>`).join('');
  $('#cmpChartLegend').onmouseover=e=>{ const t=e.target.closest('[data-lgz]'); if(!t) return; svg.selectAll('.ser').style('opacity',function(){ return this.dataset.z===t.dataset.lgz?1:0.12; }); };
  $('#cmpChartLegend').onmouseout=()=>svg.selectAll('.ser').style('opacity',1);
}
V.historique = ()=>{
  const z=st.zone, series0=seriesFor(z);
  const zz=D.zones.find(x=>x.z===z);
  const localDev=series0?series0.at(-1).dev:zz?.dev;
  // Devises proposées : la monnaie locale, puis seulement le dollar américain et la livre sterling
  const choices=[[localDev, localDev==='EUR'?'Zone euro (pas de conversion)':`€ → ${localDev} (devise locale)`],
    ...['USD','GBP','CAD'].filter(c=>c!==localDev).map(c=>[c,`€ → ${c} (${{USD:'dollar américain',GBP:'livre sterling',CAD:'dollar canadien'}[c]})`])];
  const dev=(choices.find(c=>c[0]===st.hcur)||choices[0])[0], euro=dev==='EUR', foreign=dev!==localDev;
  // Autre devise que la locale : taux € → devise du mois ; le pouvoir d'achat (prix locaux) n'a alors pas de sens
  const rowsAll = !series0 ? null : !foreign ? series0 : series0.map(r=>{ const i=H.months.indexOf(r.m); const fx = dev==='EUR'?1:(H.fx[dev]?.[i]??null); return {...r, dev, fx, fxProv: r.m===CURRENT_MONTH && fx!=null && dev!=='EUR', cpi:null, cpiUsed:null}; });
  const head=`<div class="toolbar">${zoneSelector('zbtn2')}<div class="field"><label for="cur">Taux de change</label><select id="cur">
    ${choices.map(c=>`<option value="${c[0]}" ${c[0]===dev?'selected':''}>${c[1]}</option>`).join('')}</select></div>
    ${modeToggle()}${histPeriod()}</div>`;
  if(!rowsAll) return `<section class="view"><h1>Historique</h1>${head}<p class="muted">Aucune donnée pour cette zone.</p></section>`;
  const hasCpi=rowsAll.some(r=>r.cpi!=null);
  const all=rowsAll, [hA,hB]=histRange(); const rows = all.filter(r=>r.m>=hA&&r.m<=hB);
  const prev=r=>all[all.indexOf(r)-1];
  const cell=(r,v,p,d=2,inv=false,suffix='')=>{const ch=v!=null&&p!=null&&Math.abs(v-p)>1e-9?(v>p?1:-1):0; const c=ch? ((ch>0)!==inv?'up':'down'):''; return `<td class="num ${c}">${v==null?'<span class="muted" title="Donnée pas encore publiée ou non récupérée">—</span>':fmt(v,d)+suffix}${ch?' '+(ch>0?'▲':'▼'):''}</td>`};
  const loc=r=>r.total!=null&&r.fx!=null?r.total*r.fx:null;
  const L=[
    ['Part fixe (€)', r=>cell(r,r.fixe,prev(r)?.fixe)],
    ['Part géographique (€)', r=>cell(r,r.geo,prev(r)?.geo)],
    ['Total (€)', r=>cell(r,r.total,prev(r)?.total)],
    // Mois d'arrêté (janv., avr., juil., oct.) : la variation est toujours affichée, y compris 0,00 % ; les autres mois n'ont pas d'arrêté
    ['Variation indemnité', r=>{const p=prev(r); const d=p&&r.total!=null&&p.total!=null?r.total/p.total-1:null; const q=/-(01|04|07|10)$/.test(r.m);
      return `<td class="num ${cls(d)}">${d==null?'<span class="muted">—</span>':(q?pct(d):(Math.abs(d)<1e-9?'<span class="muted" title="Pas d\'arrêté ce mois-ci">·</span>':pct(d)))}</td>`}],
    ...(euro?[]:[
      [`Taux moyen du mois € → ${dev}`, r=>cell(r,r.fx,prev(r)?.fx,4,false,r.fxProv?' prov.':'')],
      [`Total (${dev})`, r=>cell(r,loc(r),prev(r)?loc(prev(r)):null)]]),
    ...(hasCpi?[[`Indice coût de la vie — ${esc((CPI_CITIES[z]||[''])[0])} (2002 = 100)`, r=>cell(r,r.cpi,prev(r)?.cpi,1,true)]]:[]),
    [hasCpi?'Indice coût de la vie : variation sur 1 mois':(foreign?'Coût de la vie (en devise locale seulement)':'Coût de la vie (non disponible)'), r=>{const p=prev(r); const d=r.cpi!=null&&p?.cpi!=null?r.cpi/p.cpi-1:null; return `<td class="num ${cls(d,true)}">${d==null?'<span class="muted">—</span>':arrow(d,true)+' '+pct(d)}</td>`}],
    ['Pouvoir d\'achat à partir des euros (vs mois préc.)', r=>{const p=prev(r); const a=paRaw(r), b=p?paRaw(p):null; const d=a!=null&&b!=null?a/b-1:null; return `<td class="num ${cls(d)}">${d==null?'<span class="muted">—</span>':arrow(d)+' '+pct(d)}</td>`}],
  ];
  const isChg=r=>{const p=prev(r); return p && p.total!==r.total;};
  const base=rows.find(r=>(hasCpi?paRaw(r):(euro?r.total:loc(r)))!=null);
  const val=r=>hasCpi?paRaw(r):(euro?r.total:loc(r)), b0=base?val(base):null;
  const chartTitle = hasCpi?'Pouvoir d\'achat à partir des euros':(euro?'Indemnité en €':`Indemnité en ${dev}`);
  // Repère : alignement de l'indemnité VIE sur celle des VIA (arrêté du 4 mai 2021, effet le 23/05/2021 ; 1er mois complet : juin)
  const chart = spark(rows.map(r=>({m:r.m,v:val(r)!=null&&b0?val(r)/b0*100:null})),{w:900,h:170,label:chartTitle,suffix:' %',
    markers:[{m:'2021-06',label:'VIE = VIA depuis le 23/05/2021'}]});
  const fxSrc = euro?'':(dev==='CAD'||H.fxSrc[dev]==='BCE'?'BCE':'Frankfurter');
  return `<section class="view"><h1>Historique</h1>${head}
  <div class="panel"><h2>${chartTitle} (100 % = ${base?mlabel(base.m):'—'}) · ${esc(zoneLabel(z))} · ${st.mode.toUpperCase()}</h2>${chart}
    ${hasCpi?'':`<p class="small muted" style="margin:0">${foreign?`Conversion en ${esc(dev)} : le pouvoir d'achat n'est calculé qu'en devise locale (${esc(localDev)}), car les prix sont locaux. Le graphique montre l'indemnité convertie en ${esc(dev)}.`:`Coût de la vie non disponible pour cette zone : le graphique montre l'indemnité ${euro?'en euros':'convertie en '+esc(dev)}, pas le pouvoir d'achat.`}</p>`}</div>
  <div class="tscroll"><table class="hist"><thead><tr><th>Mois</th>${rows.map(r=>`<th class="${isChg(r)?'chg':''}">${mlabel(r.m)}</th>`).join('')}</tr></thead><tbody>
    ${L.map(([lab,fn])=>`<tr><td>${lab}</td>${rows.map(fn).join('')}</tr>`).join('')}
    <tr><td>Source &amp; fiabilité</td>${rows.map(r=>{const [fl,fc]=fiab(r.statut); return `<td class="sub">Géo : <span class="pill ${fc}">${fl}</span> ${r.community?`communauté (${communityNote})`:(r.srcId?`<a href="https://www.legifrance.gouv.fr/jorf/id/${r.srcId}" target="_blank" rel="noopener">arrêté JO</a>`:'—')}<br>Fixe : ${fixePill} ${fixeLinks(r.m,true)}${fxSrc?'<br>Taux de change : '+fxSrc:''}${hasCpi?'<br>Prix : '+(r.cpi!=null?'Statistique Canada':'pas encore publié'):''}</td>`}).join('')}</tr>
  </tbody></table></div>
  <div class="toolbar" style="margin:0;align-items:center"><button class="btn" type="button" id="pdfRecap">📄 Télécharger Graph recap en PDF</button>
    <span class="small muted">PDF paysage · ${esc(zoneLabel(z))} · ${st.mode.toUpperCase()} · ${mlabel(hA)} → ${mlabel(hB)} · un graphique par page</span></div>
  <div class="toolbar" style="margin:0;align-items:center"><span class="small"><strong>Télécharger les données brutes (CSV)</strong> <span class="muted">· tous les mois depuis 2014, VIE et VIA</span></span>
    <button class="btn ghost" type="button" data-dl="zone">⬇ Cette zone</button><button class="btn ghost" type="button" data-dl="all">⬇ Toutes les zones</button></div>
  <ul class="small muted" style="margin:0;padding-left:18px;display:grid;gap:4px">
    <li><strong>« — »</strong> : donnée pas encore publiée ou non récupérée. La case se remplit automatiquement dès que la donnée arrive.</li>
    <li><strong>Variation de l'indemnité</strong> : affichée chaque mois d'arrêté (janv., avr., juil., oct.), y compris <strong>0,00 %</strong> quand l'arrêté ne change pas la valeur. Une zone absente de l'arrêté est à 0 % (vérifié : les montants retombent exactement sur les bases officielles). « · » : pas d'arrêté ce mois-là.</li>
    <li><strong>Taux de change</strong> : moyenne du mois. Pour le mois en cours, moyenne provisoire depuis le 1er (marquée « prov. »).</li>
    <li><strong>Ligne « Source &amp; fiabilité »</strong> : une étiquette par composante, « Géo » pour la part géographique et « Fixe » pour la part fixe. La part fixe est toujours <span class="pill ok">Calculé</span> : formule du décret n° 2000-1159 (50 % du traitement de l'indice brut 244) appliquée à la grille des indices et au barème des traitements de la fonction publique.</li>
    <li><strong>Étiquettes de la part géographique</strong> :
      <ul style="margin:4px 0 0;padding-left:18px;display:grid;gap:2px">
        <li><span class="pill ok">Officiel</span> montant en euros publié tel quel dans un arrêté du Journal officiel.</li>
        <li><span class="pill ok">Calculé</span> l'arrêté ne publie qu'un pourcentage : le site l'applique au dernier montant officiel (méthode vérifiée avec les montants publics de janv. 2026).</li>
        <li><span class="pill mid">Reconstitué</span> avant 2023 : calculé de la même façon, mais aucun montant officiel ne permet de le vérifier.</li>
        <li><span class="pill mid">Déduit</span> ville créée en cours de route par un arrêté (un % sans montant de départ) : avant sa création, elle prend la valeur de l'ancienne zone qui la couvrait ; ensuite, ses propres % sont appliqués à cette valeur. Méthode vérifiée : les 5 villes créées entre 2023 et 2025 retombent au centime près sur les montants publiés au JO le 1er janv. 2026.</li>
        <li><span class="pill mid">Communauté · validée par un admin</span> l'arrêté n'est pas encore publié : valeur la plus votée et validée par un admin (lien vers les votes).</li>
      </ul></li>
    <li><strong>Colonnes surlignées</strong> : mois de changement de l'indemnité.</li>
    <li><strong>Vert / rouge</strong> : effet sur le pouvoir d'achat (un coût de la vie en hausse est en rouge).</li>
    <li><strong>Avant mai 2021</strong> : en mode VIE, barème VIE annuel (aucun ajustement trimestriel publié).</li>
  </ul></section>`;
};

/* Documents (arrêtés du JO) qui permettent de calculer la valeur d'une zone à un trimestre donné */
function srcAt(M,q){ let id=null; for(const k of Object.keys(M)) if(k<=q) id=M[k]; return id; }
function srcDocs(Z,qi){
  let C=st.mode==='vie'?Z.vs:Z.as, M=st.mode==='vie'?Z.sv:Z.sa;
  if(C[qi]==='I'){ C=Z.as; M=Z.sa; }
  const qs=H.quarters; let b=qi; while(b>=0 && !'ODB'.includes(C[b])) b--;
  const docs=[];
  if(b>=0) docs.push({kind:'base', m:qs[b], id:srcAt(M,qs[b])});
  for(let k=b+1;k<=qi;k++) if(M[qs[k]]) docs.push({kind:'var', m:qs[k], id:M[qs[k]]});
  return docs.filter(d=>d.id);
}
const LF = id => `https://www.legifrance.gouv.fr/jorf/id/${id}`;
const docLinks = docs => {
  const base=docs.find(d=>d.kind==='base'), vars=docs.filter(d=>d.kind==='var');
  const b = base?`<a href="${LF(base.id)}" target="_blank" rel="noopener" title="Arrêté : montant officiel en euros">Montant officiel ${mlabel(base.m)}</a>`:'';
  const v = vars.length?`Variations ${vars.map((d,i)=>`<a href="${LF(d.id)}" target="_blank" rel="noopener" title="Arrêté : variation en % du ${d1(d.m)}">${i===vars.length-1?mlabel(d.m):MONTHS_FR[+d.m.slice(5)-1]}</a>`).join(' · ')}`:'';
  return [b,v].filter(Boolean).join('<br>');
};
const CODE_FIAB = c => c==='O'||c==='D'||c==='B' ? 'base officielle' : c==='R' ? 'reconstitue' : c==='X' ? 'deduit' : c==='M'||!c ? '' : 'calcule';
V.pays = ()=>{
  const q=(st.pq||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase();
  const sort=st.ps||'pays';
  const qi=H.quarters.indexOf(CURRENT_PERIOD), fixe=fixeAt(CURRENT_PERIOD);
  // Arrêté du trimestre pas encore publié : montant du trimestre précédent, ou valeur communautaire validée par un admin
  let list=D.zones.map(x=>{ const Z=H.zones[x.z]; if(!Z) return null;
    const cp=st.noJO?topValidated(x.z,CURRENT_PERIOD):null, k=st.noJO&&!cp?qi-1:qi;
    const geo=cp?cp.geo:(st.mode==='vie'?Z.vie:Z.via)[k]; let c=(st.mode==='vie'?Z.vs:Z.as)[k]; if(c==='I') c=Z.as[k];
    return geo==null?null:{z:x.z, geo, st:cp?'communaute':CODE_FIAB(c), docs:cp?null:srcDocs(Z,k), comm:!!cp, old:st.noJO&&!cp}; }).filter(Boolean).filter(x=>!q||x.z.includes(q));
  list.sort((a,b)=> sort==='montant'? b.geo-a.geo : sort==='montant-asc'? a.geo-b.geo : a.z.localeCompare(b.z,'fr'));
  return `<section class="view"><h1>Grille des indemnités</h1>
  <p class="muted" style="margin:0">Montant en vigueur au ${d1(CURRENT_PERIOD)}.</p>
  ${st.noJO?`<div class="alert" role="status"><strong>⚠</strong><span>L'arrêté du ${d1(CURRENT_PERIOD)} n'est pas encore publié. Montants affichés : <strong>valeur communautaire validée</strong> quand elle existe, sinon <strong>montant du ${d1(lastArrete().effet.slice(0,7))}</strong> (marqué « ancien »).</span><a class="btn" href="/proposer">Proposer une valeur</a></div>`:''}
  <div class="toolbar"><div class="field"><label for="pq">Rechercher</label><input type="text" id="pq" value="${esc(st.pq||'')}" placeholder="ex. Japon, Berlin…"></div>
  <div class="field"><label for="ps">Trier par</label><select id="ps"><option value="pays" ${sort==='pays'?'selected':''}>Pays</option><option value="montant" ${sort==='montant'?'selected':''}>Montant décroissant</option><option value="montant-asc" ${sort==='montant-asc'?'selected':''}>Montant croissant</option></select></div>
  ${modeToggle()}<span class="small muted" style="padding-bottom:8px">${list.length} zones</span></div>
  <div class="legend small muted" aria-label="Légende des logos" style="display:flex;flex-wrap:wrap;gap:6px 16px"><strong style="color:var(--fg)">Légende :</strong><span>💱 taux de change suivi</span><span>📊 coût de la vie suivi (pouvoir d'achat calculé)</span><span>€ zone euro (pas de conversion)</span><span><span style="opacity:.4">💱📊</span> grisé : non disponible</span></div>
  <table class="list fit"><thead><tr><th>Pays / ville</th><th class="r hide-sm">Part fixe</th><th class="r">Part géo.</th><th class="r">Total</th><th class="hide-sm">Mode de calcul</th><th class="hide-sm srccol">Sources</th></tr></thead><tbody>
  ${list.map(x=>{const [fl,fc]=fiab(x.st);
    const modes=`<span class="small muted">Fixe</span> ${fixePill}<br><span class="small muted">Géo</span> <span class="pill ${fc}">${fl}</span>`;
    const srcs=`<span class="muted">Fixe :</span> ${fixeLinks(CURRENT_MONTH,true)}<br><span class="muted">Géo :</span> ${x.comm?`communauté (${communityNote})`:docLinks(x.docs)}${x.old?`<br><span class="pill mid">ancien</span> montant du ${d1(lastArrete().effet.slice(0,7))}`:''}`;
    return `<tr><td><span class="zname">${esc(titleCase(x.z))}</span> ${icons(x.z)}
      <span class="show-sm"><br><span class="small muted">Part fixe ${fmt(fixe)} €</span><br>${modes}<br><span class="small">${srcs}</span></span></td>
    <td class="r num hide-sm">${fmt(fixe)} €</td><td class="r num">${fmt(x.geo)} €</td><td class="r num"><strong>${fmt(fixe+x.geo)} €</strong></td>
    <td class="hide-sm" style="white-space:nowrap">${modes}</td><td class="hide-sm small">${srcs}</td></tr>`}).join('')}
  </tbody></table>
  <div class="note small"><strong>Mode de calcul</strong>
    <ul style="margin:6px 0 0;padding-left:18px;display:grid;gap:4px">
      <li><span class="pill ok">Officiel</span> : montant en euros publié tel quel dans un arrêté du Journal officiel.</li>
      <li><span class="pill ok">Calculé</span> : l'arrêté du trimestre ne publie qu'un pourcentage de variation par zone ; le site l'applique au dernier montant officiel (arrondi au centime inférieur).</li>
      <li><span class="pill mid">Déduit</span> : ville créée en cours de route (un % sans montant de départ) ; sa valeur part de l'ancienne zone qui la couvrait. Méthode vérifiée sur les 5 villes créées entre 2023 et 2025 (exactes au centime en janv. 2026).</li>
      <li>La colonne <strong>Sources</strong> donne les arrêtés nécessaires : le dernier montant officiel, puis chaque variation appliquée.</li>
      <li>Méthode vérifiée avec des données publiques : appliquée de 2023 à 2025, elle retrouve au centime près les montants republiés au Journal officiel le 01/01/2026 pour 196 zones sur 228 (les autres ont reçu une hausse forfaitaire).</li>
      <li>Au ${d1(CURRENT_PERIOD)}, la plupart des zones sont « Calculé » : le dernier montant officiel en euros date du 1er janv. 2026.</li>
      <li><strong>Part fixe</strong> <span class="pill ok">Calculé</span> : identique pour toutes les zones, 50 % du traitement de l'indice brut 244 de la fonction publique. Sources : ${fixeLinks(CURRENT_MONTH)}.</li>
    </ul></div></section>`;
};

const truncPct=(base,p)=>Math.trunc(base*(1+p/100)*100)/100;
function initProposals(){ st.proposals ??= []; st.quota ??= {up:0, down:0}; }
function appliquerPropositions(d){ if(d&&Array.isArray(d.propositions)){ st.proposals=d.propositions; st.quota=d.quota||st.quota; } }
async function loadPropositions(){ appliquerPropositions(await getJson('/api/propositions')); }
function propLine(p,short=false){
  const eur = p.input==='eur';
  const U = 'text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:2px';
  const vEur = eur ? `<span style="${U}" title="Valeur saisie">${fmt(p.geo)} €</span>` : `${fmt(p.geo)} €`;
  const vPct = eur ? `<span class="${cls(p.pct)}">${pct(p.pct/100)}</span>` : `<span class="${cls(p.pct)}" style="${U}" title="Valeur saisie">${pct(p.pct/100)}</span>`;
  return `<span class="num">${vEur} · ${vPct} <span class="muted">par rapport à la valeur du ${d1(p.ref)} (${fmt(p.refGeo)} €)</span></span>${p.at?`<br><span class="small muted">proposée le ${fmtDay(p.at)}</span>`:''}
${short?'':`<br><span class="small muted">Valable à partir du ${d1(p.eff)} · ${p.type==='fixe'?'Part fixe, toutes les zones':'Part géographique · '+esc(D.canada[p.z]?.label||p.z)}</span>`}`;
}
V.proposer = ()=>{
  initProposals();
  const fixe = st.ptype==='fixe';
  const z=st.pz||'CANADA (AUTRES VILLES)';
  // Mois proposables : les 6 mois précédents, le mois en cours et les 3 mois suivants
  const addM=(m,k)=>{ const [y,mm]=m.split('-').map(Number), t=y*12+mm-1+k; return `${Math.floor(t/12)}-${String(t%12+1).padStart(2,'0')}`; };
  const months=Array.from({length:10},(_,k)=>addM(CURRENT_MONTH,k-6));
  const sel=months.includes(st.pmo)?st.pmo:(fixe?CURRENT_MONTH:CURRENT_PERIOD);
  // Valeur de référence : la dernière valeur connue avant le mois choisi (part géo de la zone, ou part fixe)
  const sr=canadaSeries(z), before=m=>[...sr].reverse().find(r=>r.m<m&&r.geo!=null&&!r.community);
  const ref = fixe ? (()=>{ const f=[...FIXE].reverse().find(f=>f[0]<sel)||FIXE[0]; return {geo:f[1], m:f[0]}; })() : (()=>{ const r=before(sel); return {geo:r.geo, m:quarterStart(r.m)}; })();
  const official=m=>!fixe && sr.some(r=>r.m===m&&r.geo!=null&&!r.community&&r.srcId) && /-(01|04|07|10)$/.test(m);
  const cur=st.proposals.map((p,i)=>({...p,i})).filter(p=> fixe ? p.type==='fixe' && p.eff===sel : p.type!=='fixe' && p.eff===sel && p.z===z);
  const byQ={[sel]:cur}; const qs=[sel];
  const label = fixe ? 'Part fixe' : 'Part géographique';
  return `<section class="view"><h1>Proposer une valeur d'indemnité</h1>
  <p class="muted" style="margin:0">Les détails des arrêtés du Journal officiel ne sont pas toujours repris ailleurs : proposez une valeur, la plus votée est validée par l'administrateur.</p>
  <form class="panel" id="pform" novalidate><h2>Votre proposition</h2>
    <div class="pgrid">
    <div class="field"><label>Type de valeur</label><div class="seg" role="group" aria-label="Type de valeur">
      <button type="button" data-pt="geo" aria-pressed="${!fixe}">Part géographique</button><button type="button" data-pt="fixe" aria-pressed="${fixe}">Part fixe</button></div></div>
    <div class="field"><label>Je connais</label><div class="seg" role="group"><button type="button" data-pm="eur" aria-pressed="${(st.pm||'eur')==='eur'}">Le montant en €</button><button type="button" data-pm="pct" aria-pressed="${st.pm==='pct'}">La variation en %</button></div></div>
    ${fixe?'<div class="field"><label>Zone</label><div class="pbox muted">Toutes les zones (part fixe identique partout)</div></div>':`<div class="field"><label for="pzone">Zone</label><select id="pzone">${Object.entries(D.canada).map(([k,v])=>`<option value="${esc(k)}" ${k===z?'selected':''}>${esc(v.label)}</option>`).join('')}</select></div>`}
    <div class="field"><label for="pmonth">Valable à partir du 1er</label><select id="pmonth">${months.slice().reverse().map(m=>`<option value="${m}" ${m===sel?'selected':''}>${mlabel(m)}${m===CURRENT_MONTH?' · mois en cours':m>CURRENT_MONTH?' · à venir':''}${!fixe&&/-(01|04|07|10)$/.test(m)?' · début de trimestre':''}${official(m)?' · arrêté publié':''}</option>`).join('')}</select></div>
    <p class="note small pfull" style="margin:0">Valeur précédente : <strong class="num">${fmt(ref.geo)} €</strong> de ${label.toLowerCase()}${fixe?' (identique pour toutes les zones)':''}, valable depuis le <strong>${d1(ref.m)}</strong>. Une variation en % se calcule toujours par rapport à cette valeur datée.${fixe?' La part fixe change rarement, à n\'importe quelle date.':''}</p>
    <div class="field"><label for="pval">${st.pm==='pct'?'Variation (%) par rapport au '+d1(ref.m):label+' (€)'}</label><input type="number" id="pval" step="0.01" placeholder="${st.pm==='pct'?(fixe?'ex. 1,50':'ex. 0,71'):(fixe?'ex. 784,46':'ex. 1889,73')}" data-ref="${ref.geo}" data-refm="${ref.m}"></div>
    <div class="field"><label>Calculé automatiquement</label><output id="pcalc" class="num pbox">—</output></div>
    <div class="field"><label for="psrc">Source ou justificatif (facultatif)</label><input type="text" id="psrc" maxlength="300" placeholder="Lien vers l'arrêté, bulletin, commentaire…"></div>
    <div class="field"><label>Vérification anti-robot</label>${captcha('pcap')}</div>
    <div class="pfull" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><button class="btn" type="submit">Envoyer la proposition</button><span class="small muted">Une proposition toutes les 12 heures par visiteur. Aucun compte nécessaire.</span></div>
    </div>
  </form>
  <div class="panel"><h2>Valeurs proposées</h2>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between">
      <p class="small" style="margin:0">Il vous reste <strong>${st.quota.up} vote${st.quota.up>1?'s':''} positif${st.quota.up>1?'s':''}</strong> ▲ et <strong>${st.quota.down} vote${st.quota.down>1?'s':''} négatif${st.quota.down>1?'s':''}</strong> ▼ (renouvelés toutes les 24 heures, un seul vote par valeur).<br><span class="muted">Cliquez à nouveau sur votre vote pour l'annuler et le placer ailleurs.</span></p>
      <button class="btn ghost" type="button" id="resetVotes" ${st.proposals.some(p=>p.my)?'':'disabled'}>Réinitialiser mes votes</button></div>
    <div class="field" style="max-width:360px"><label>Vérification anti-robot avant de voter</label>${captcha('vcap')}</div>
    ${(()=>{ const vf=st.vf||{}, P=st.proposals.map((p,i)=>({...p,i})), uniq=a=>[...new Set(a)];
      const zLab=z=>z==='TOUTES'?'Toutes les zones':(D.canada[z]?.label||zoneLabel(z));
      const selF=(id,label,opts,v)=>`<div class="field"><label for="${id}">${label}</label><select id="${id}"><option value="">Tous</option>${opts.map(([val,lab])=>`<option value="${esc(val)}" ${v===val?'selected':''}>${esc(lab)}</option>`).join('')}</select></div>`;
      const filters=`<div class="pgrid3">
        ${selF('vfType','Partie',[['geo','Part géographique'],['fixe','Part fixe']],vf.type)}
        ${selF('vfZone','Zone',uniq(P.map(p=>p.z)).map(z=>[z,zLab(z)]),vf.z)}
        ${selF('vfEff','Valable à partir du',uniq(P.map(p=>p.eff)).sort().reverse().map(m=>[m,d1(m)]),vf.eff)}</div>`;
      const shown=P.filter(p=>(!vf.type||(p.type==='fixe'?'fixe':'geo')===vf.type)&&(!vf.z||p.z===vf.z)&&(!vf.eff||p.eff===vf.eff));
      const groups={}; shown.forEach(p=>{ (groups[groupKey(p)]??=[]).push(p); });
      const keys=Object.keys(groups).sort((a,b)=>b.split('|')[2].localeCompare(a.split('|')[2])||a.localeCompare(b));
      return filters + (keys.length?'':'<p class="muted small">Aucune proposition pour ces filtres. Soyez le premier !</p>') + keys.map(k=>{ const [t,zz,eff]=k.split('|');
        return `<h3 style="margin-top:6px">${t==='fixe'?'Part fixe':'Part géographique'} · ${esc(zLab(zz))} · valable à partir du ${d1(eff)} <span class="small muted" style="font-weight:400">— ${groups[k].length} proposition(s)</span></h3>`
        + groups[k].sort((a,b)=>(b.up-b.down)-(a.up-a.down)).map(p=>{const open=p.s==='En attente';
      return `<div class="prop"><span>${propLine(p,true)}</span>
      <span class="pill ${p.s==='Validée par un admin'?'ok':p.s==='Rejetée'?'':'mid'}">${p.s}</span>
      <span style="display:flex;gap:6px;align-items:center">
        <button class="btn ${p.my===1?'':'ghost'}" type="button" data-up="${p.i}" aria-pressed="${p.my===1}" title="${p.my===1?'Annuler mon vote':'Vote positif'}" ${!open||(p.my!==1&&(p.my===-1||!st.quota.up))?'disabled':''}>▲ ${p.up}</button>
        <button class="btn ${p.my===-1?'no':'ghost'}" type="button" data-down="${p.i}" aria-pressed="${p.my===-1}" title="${p.my===-1?'Annuler mon vote':'Vote négatif'}" ${!open||(p.my!==-1&&(p.my===1||!st.quota.down))?'disabled':''}>▼ ${p.down}</button>
        <span class="num small muted" title="Score = votes positifs − votes négatifs">score ${p.up-p.down}</span></span></div>`}).join(''); }).join(''); })()}
    <div class="note small" style="margin-top:8px"><strong>À savoir</strong>
      <ul style="margin:6px 0 0;padding-left:18px;display:grid;gap:4px">
        <li>La valeur <span style="text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:2px">soulignée</span> est celle saisie par le visiteur.</li>
        <li>L'autre valeur est calculée automatiquement par le site.</li>
        <li>Chaque jour, seules les ${MAX_PROPS} propositions les plus populaires sont gardées par mois, partie et zone. Les propositions rejetées sont retirées après 3 mois, celles en attente après 6 mois.</li>
      </ul></div></div></section>`;
};

/* Admin : propositions filtrables (partie, zone, date, statut), regroupées par partie + zone + date.
   Une seule valeur validée par groupe : valider rejette automatiquement les autres ; dévalider les remet en attente. */
const VAL='Validée par un admin';
/* Garde-fou anti-abus : 7 propositions maximum par mois + partie + zone. Au-delà, on supprime la moins bien notée ;
   à score égal, celle la plus éloignée de la dernière valeur connue. La valeur validée par l'admin n'est jamais supprimée.
   Le nettoyage n'a pas lieu à l'envoi (une nouvelle proposition a forcément 0) : il est fait par la tâche quotidienne,
   en même temps que la récupération des données (16 h 37 UTC). */
const TODAY=new Date().toISOString().slice(0,10);
const monthsAgo=k=>{ const d=new Date(TODAY+'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth()-k); return d.toISOString().slice(0,10); };
// Nettoyage par ancienneté : rejetées proposées il y a plus de 3 mois, en attente depuis plus de 6 mois
function ageClean(){
  const c3=monthsAgo(3), c6=monthsAgo(6);
  const out=st.proposals.filter(p=>p.s!==VAL&&p.at&&((p.s==='Rejetée'&&p.at<c3)||(p.s==='En attente'&&p.at<c6)));
  st.proposals=st.proposals.filter(p=>!out.includes(p));
  (st.capLog??=[]).unshift(...out.map(p=>({at:nowStr(), k:groupKey(p), v:p.geo, score:p.up-p.down, why:p.s==='Rejetée'?'rejetée, proposée il y a plus de 3 mois':'en attente, proposée il y a plus de 6 mois'})));
  return out;
}
function capAll(){ return [...ageClean(), ...[...new Set(st.proposals.map(groupKey))].flatMap(capGroup)]; }
const MAX_PROPS=7;
function capGroup(k){
  const g=st.proposals.filter(p=>groupKey(p)===k); if(g.length<=MAX_PROPS) return [];
  const dist=p=>Math.abs(p.geo-p.refGeo);
  const ranked=g.slice().sort((a,b)=>(a.s===VAL)-(b.s===VAL) || (a.up-a.down)-(b.up-b.down) || dist(b)-dist(a));
  const out=ranked.slice(0,g.length-MAX_PROPS);
  st.proposals=st.proposals.filter(p=>!out.includes(p));
  (st.capLog??=[]).unshift(...out.map(p=>({at:nowStr(), k, v:p.geo, score:p.up-p.down, why:`hors des ${MAX_PROPS} plus populaires`})));
  return out;
}
const groupKey=p=>`${p.type}|${p.z}|${p.eff}`;
function adminValidate(i){ const p=st.proposals[i], k=groupKey(p), prev=st.proposals.find(q=>q!==p&&groupKey(q)===k&&q.s===VAL);
  histAdd({orig:'val', t:p.type==='fixe'?'fixe':'geo', z:p.z, m:p.eff, old:prev?prev.geo:null, nw:p.geo, src:`proposition communautaire (▲ ${p.up} · ▼ ${p.down})`});
  st.proposals.forEach(q=>{ if(q!==p && groupKey(q)===k && q.s!=='Rejetée'){ q.s='Rejetée'; q.auto=true; } });
  p.s=VAL; p.auto=false; }
function adminUnvalidate(i){ const p=st.proposals[i], k=groupKey(p);
  histAdd({orig:'unval', t:p.type==='fixe'?'fixe':'geo', z:p.z, m:p.eff, old:p.geo, nw:null, src:'valeur communautaire retirée'});
  p.s='En attente'; st.proposals.forEach(q=>{ if(groupKey(q)===k && q.auto){ q.s='En attente'; q.auto=false; } }); }
function adminProposals(){
  const P=st.proposals.map((p,i)=>({...p,i})), af=st.af||{};
  const partLab=t=>t==='fixe'?'Part fixe':'Part géographique', zLab=z=>z==='TOUTES'?'Toutes les zones':zoneLabel(z);
  const uniq=a=>[...new Set(a)];
  const sel=(id,label,opts,v)=>`<div class="field"><label for="${id}">${label}</label><select id="${id}"><option value="">Tous</option>${opts.map(([val,lab])=>`<option value="${esc(val)}" ${v===val?'selected':''}>${esc(lab)}</option>`).join('')}</select></div>`;
  const filters=`<div class="toolbar" style="margin:0">
    ${sel('afType','Partie',[['geo','Part géographique'],['fixe','Part fixe']],af.type)}
    ${sel('afZone','Zone',uniq(P.map(p=>p.z)).map(z=>[z,zLab(z)]),af.z)}
    ${sel('afEff','Valable à partir du',uniq(P.map(p=>p.eff)).sort().reverse().map(m=>[m,d1(m)]),af.eff)}
    ${sel('afSt','Statut',[['En attente','En attente'],[VAL,'Validée'],['Rejetée','Rejetée']],af.s)}</div>`;
  const shown=P.filter(p=>(!af.type||p.type===af.type)&&(!af.z||p.z===af.z)&&(!af.eff||p.eff===af.eff)&&(!af.s||p.s===af.s));
  const groups={}; shown.forEach(p=>{ (groups[groupKey(p)]??=[]).push(p); });
  const keys=Object.keys(groups).sort((a,b)=>b.split('|')[2].localeCompare(a.split('|')[2])||a.localeCompare(b));
  const pill=p=>p.s===VAL?'<span class="pill ok">Validée</span>':p.s==='Rejetée'?`<span class="pill">${p.auto?'Rejetée (auto)':'Rejetée'}</span>`:'<span class="pill mid">En attente</span>';
  const act=p=>p.s===VAL?`<button class="btn ghost" type="button" data-unval="${p.i}">Dévalider</button>`
    :p.s==='En attente'?`<button class="btn ok" type="button" data-val="${p.i}">Valider</button><button class="btn no" type="button" data-rej="${p.i}">Rejeter</button>`
    :`<button class="btn ghost" type="button" data-reopen="${p.i}">Remettre en attente</button>`;
  const body=keys.map(k=>{ const g=groups[k].sort((a,b)=>(b.up-b.down)-(a.up-a.down)), [t,z,eff]=k.split('|'), hasVal=st.proposals.some(q=>groupKey(q)===k&&q.s===VAL);
    return `<tr class="ghead"><th colspan="5"><strong>${partLab(t)}</strong> · ${esc(zLab(z))} · valable à partir du <strong>${d1(eff)}</strong>
        <span class="small muted" style="font-weight:400"> — ${g.length} proposition(s)${hasVal?' · une valeur validée':''} · valeur de référence : ${fmt(g[0].refGeo)} € (${d1(g[0].ref)})</span></th></tr>`
      +g.map(p=>`<tr class="${p.s===VAL?'cur':''}"><td class="num">${propLine(p,true)}</td><td class="r num">▲ ${p.up} · ▼ ${p.down}<br><span class="small muted">score ${p.up-p.down}</span></td><td>${pill(p)}</td><td><span style="display:flex;gap:6px;flex-wrap:wrap">${act(p)}</span></td></tr>`).join(''); }).join('');
  return `<div class="panel"><h2>Propositions de la communauté</h2>
    ${filters}
    <ul class="small muted" style="margin:0;padding-left:18px"><li>Une seule valeur peut être validée par partie, zone et date : valider rejette automatiquement les autres (« Rejetée (auto) »).</li><li>« Dévalider » remet la valeur en attente, ainsi que celles rejetées automatiquement.</li></ul>
    <div class="tscroll"><table class="list atab"><thead><tr><th>Valeur proposée</th><th class="r">Votes</th><th>Statut</th><th>Action</th></tr></thead><tbody>${body||'<tr><td colspan="4" class="muted">Aucune proposition pour ces filtres.</td></tr>'}</tbody></table></div></div>`;
}
/* Admin : historique des modifications de valeurs (import JO, validation communautaire, saisie admin, rétablissement).
   Chaque entrée garde l'ancienne et la nouvelle valeur ; une saisie admin peut être rétablie (nouvelle entrée, rien n'est effacé). */
const hKey=(t,z,m)=>t==='fixe'?`fixe|TOUTES|${m}`:`geo|${z}|${quarterStart(m)}`;
const nowStr=()=>{ const d=new Date(), p=n=>String(n).padStart(2,'0'); return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
/* Contrôle du type et du format de chaque valeur, avant tout enregistrement */
const CHK_RULE={fx:{dec:6,min:0,max:1e6,per:'jour (AAAA-MM-JJ)'},cpi:{dec:1,min:50,max:500,per:'mois (AAAA-MM)'},geo:{dec:2,min:-50,max:50,per:'date d’effet (AAAA-MM-01)'},geoEur:{dec:2,min:0,max:20000,per:'mois (AAAA-MM)'},fixe:{dec:2,min:500,max:1500,per:'mois (AAAA-MM)'}};
function checkVal(type,raw,perGot,perOk){
  const R=CHK_RULE[type], s=String(raw), isNum=/^-?\d+(\.\d+)?$/.test(s), dec=(s.split('.')[1]||'').length, n=Number(s);
  return [
    {c:'Type',exp:'nombre',got:isNum?'nombre':'texte « '+s+' »',ok:isNum},
    {c:'Format',exp:'point décimal, '+(type==='cpi'?'1 décimale':'≤ '+R.dec+' décimales'),got:isNum?dec+' décimale(s)':'—',ok:isNum&&(type==='cpi'?dec===1:dec<=R.dec)},
    {c:'Plage',exp:type==='fx'?'supérieur à 0':'entre '+fmt(R.min,0)+' et '+fmt(R.max,0),got:isNum?s:'—',ok:isNum&&n>R.min&&n<R.max},
    {c:'Date',exp:R.per,got:perGot,ok:perOk}];
}
const hSortKey=a=>{ const m=/^(\d\d)\/(\d\d)\/(\d{4})(?: (\d\d:\d\d))?/.exec(a)||[]; return (m[3]||'')+(m[2]||'')+(m[1]||'')+(m[4]||'00:00'); };
function initHist(){ if(!st.hist) st.hist=[]; st.ovr=st.ovr||{}; }   // l'historique vient du serveur (/api/admin/historique)
function histAdd(e){ initHist(); st.hist.unshift({at:atFr(new Date().toISOString().slice(0,16).replace('T',' ')), who:'admin', ...e}); }
function adminHistory(){
  initHist();
  const hf=st.hf||{}, N=hf.n||'30';
  const ORIG={jo:'Import Journal officiel',bce:'Collecte BCE',statcan:'Statistique Canada',val:'Validation (communauté)',unval:'Dévalidation',man:'Saisie admin',rest:'Rétablissement'};
  const TL={geo:'Part géographique',fixe:'Part fixe',fx:'Taux de change',cpi:'Indice du coût de la vie'};
  const zLab=(t,z)=>z==='TOUTES'?'Toutes les zones':t==='fx'?z:zoneLabel(z), uniq=a=>[...new Set(a)];
  const sel=(id,label,opts,v,all='Tous')=>`<div class="field"><label for="${id}">${label}</label><select id="${id}">${all?`<option value="">${all}</option>`:''}${opts.map(([val,lab])=>`<option value="${esc(val)}" ${v===val?'selected':''}>${esc(lab)}</option>`).join('')}</select></div>`;
  const chkOf=h=>h.chk||(h.nw==null?null:checkVal(h.t==='fixe'?'fixe':'geoEur',String(h.nw),h.m,true));
  const isKo=h=>{ const c=chkOf(h); return !!(c&&c.some(x=>!x.ok)); };
  const all=st.hist.map((h,i)=>({...h,i}));
  const shown=all.filter(h=>(!hf.t||h.t===hf.t)&&(!hf.z||h.z===hf.z)&&(!hf.o||h.orig===hf.o)&&(!hf.c||(hf.c==='ko')===isKo(h)));
  const lim=N==='all'?shown.length:+N, nKo=all.filter(isKo).length;
  const latest={}; all.forEach(h=>{ const k=hKey(h.t,h.z,h.m); if(!(k in latest)) latest[k]=h.i; });
  const val=(h,v)=>v==null?'<span class="muted">aucune</span>':fmt(v,h.dec||2)+(h.t==='geo'||h.t==='fixe'?' €':'');
  const what=h=>h.t==='geo'||h.t==='fixe'?`valable à partir du ${d1(h.t==='fixe'?h.m:quarterStart(h.m))}`:h.t==='fx'?`moyenne provisoire de ${mlabel(h.m)}`:`indice de ${mlabel(h.m)}`;
  const hd=st.hDet||(st.hDet={});
  const rows=shown.slice(0,lim).map(h=>{ const base=h.old!=null?h.old:h.prev, d=base!=null&&h.nw!=null?h.nw-base:null, c=chkOf(h), ko=isKo(h);
    const canRest=(h.orig==='man'||h.orig==='rest')&&!ko&&latest[hKey(h.t,h.z,h.m)]===h.i;
    const tip=c?c.map(x=>`${x.ok?'✓':'✗'} ${x.c} : ${x.got} (attendu : ${x.exp})`).join('\n'):'';
    return `<tr${ko?' class="apifail"':''}><td class="num">${esc(h.at)}<br><span class="small muted">${esc(h.who)}</span></td>
      <td><strong>${TL[h.t]}</strong> · ${esc(zLab(h.t,h.z))}<br><span class="small muted">${what(h)}</span></td>
      <td class="r num">${h.old==null&&h.prev!=null?'<span class="small muted">nouveau mois</span>':val(h,h.old)}</td><td class="r num"><strong>${ko?'<span class="down">'+esc(h.raw||'—')+'</span>':val(h,h.nw)}</strong></td>
      <td class="r num">${d==null?'—':(d>=0?'+':'')+fmt(d,h.dec||2)+(h.t==='geo'||h.t==='fixe'?' €':'')+'<br><span class="small muted">'+pct(h.nw/base-1)+(h.old==null&&h.prev!=null?' / mois préc.':'')+'</span>'}</td>
      <td>${c?`<button class="chkbtn ${ko?'down':'up'}" type="button" data-hchk="${h.i}" aria-expanded="${!!hd[h.i]}">${ko?'✗ refusée':'✓ conforme'} <span class="small">${hd[h.i]?'▾':'▸'}</span></button><br><span class="small ${ko?'down':'muted'}">${ko?esc(c.filter(x=>!x.ok).map(x=>x.c).join(', '))+' · non enregistrée':'enregistrée'}</span>`:'<span class="small muted">—</span>'}</td>
      <td><span class="pill ${h.orig==='jo'||h.orig==='bce'||h.orig==='statcan'?'ok':h.orig==='man'||h.orig==='rest'?'mid':''}">${ORIG[h.orig]}</span></td>
      <td class="small">${h.src||'—'}</td>
      <td>${canRest?`<button class="btn ghost" type="button" data-hrest="${h.i}">Rétablir ${h.old==null?'(supprimer)':fmt(h.old)+' €'}</button>`:''}</td></tr>${c&&hd[h.i]?`<tr class="apidet"><td colspan="9"><div class="apibox">
        <div class="small"><strong>Valeur contrôlée</strong> : <code>${esc(h.raw||h.chkOn||String(h.nw))}</code>${h.chkOn&&h.raw==null?'':''} · ${ko?'<strong class="down">refusée : rien n’a été enregistré, la valeur précédente reste en place</strong>':'<span class="up">conforme : enregistrée</span>'}</div>
        <table class="list chktab"><thead><tr><th>Contrôle</th><th>Attendu</th><th>Reçu</th><th>Résultat</th></tr></thead><tbody>${c.map(x=>`<tr${x.ok?'':' class="apifail"'}><td><strong>${esc(x.c)}</strong></td><td>${esc(x.exp)}</td><td><code>${esc(x.got)}</code></td><td class="${x.ok?'up':'down'}">${x.ok?'✓ OK':'✗ Échec'}</td></tr>`).join('')}</tbody></table></div></td></tr>`:''}`; }).join('');
  return `<div class="panel"><div class="phead" style="justify-content:space-between"><h2 style="margin:0">Historique des modifications</h2>${nKo?`<span class="pill bad">${nKo} valeur${nKo>1?'s':''} refusée${nKo>1?'s':''}</span>`:''}</div>
    <div class="hgrid">
      ${sel('hfType','Donnée',Object.entries(TL),hf.t)}
      ${sel('hfZone','Zone ou devise',uniq(all.filter(h=>!hf.t||h.t===hf.t).map(h=>h.z)).map(z=>[z,zLab(all.find(h=>h.z===z).t,z)]).sort((a,b)=>a[1].localeCompare(b[1],'fr')),hf.z,'Toutes')}
      ${sel('hfOrig','Origine',Object.entries(ORIG),hf.o)}
      ${sel('hfChk','Contrôle type / format',[['ok','✓ Conforme (enregistrée)'],['ko','✗ Refusée (non enregistrée)']],hf.c)}
      ${sel('hfN','Afficher',[['30','30 dernières'],['100','100 dernières'],['all','Toutes ('+shown.length+')']],N,'')}</div>
    <ul class="small muted" style="margin:0;padding-left:18px"><li>Chaque nouvelle valeur (indemnité, taux de change, indice des prix) est contrôlée avant d’être enregistrée : type, format, plage, date. Cliquer sur « ✓ conforme » ou « ✗ refusée » pour voir le détail des 4 contrôles.</li><li><strong class="down">En rouge</strong> : valeur refusée, non enregistrée (la valeur précédente reste en place).</li><li>Rien n’est effacé : « Rétablir » ajoute une nouvelle ligne avec l’ancienne valeur. Heures en UTC.</li></ul>
    <div class="tscroll"><table class="list atab"><thead><tr><th>Date · auteur</th><th>Valeur modifiée</th><th class="r">Avant</th><th class="r">Après</th><th class="r">Écart</th><th>Contrôle</th><th>Origine</th><th>Source</th><th>Action</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="9" class="muted">Aucune modification pour ces filtres.</td></tr>'}</tbody></table></div>
    <p class="small muted" style="margin:0">${Math.min(lim,shown.length)} ligne(s) affichée(s) sur ${shown.length}.</p></div>`;
}
/* Admin : saisir ou corriger une valeur (part géographique d'une zone, ou part fixe), avec la valeur existante et sa source */
function adminCurrent(t,z,m){
  const ov=st.ovr&&st.ovr[hKey(t,z,m)];
  if(ov) return ov.v==null?null:{v:ov.v, tag:'<span class="pill mid">Saisie admin</span>', src:esc(ov.src), q:t==='fixe'?m:quarterStart(m)};
  if(t==='fixe'){ const v=fixeAt(m); return v==null?null:{v, tag:fixePill, src:fixeLinks(m,true)}; }
  const s=seriesFor(z), r=s&&s.find(x=>x.m===m); if(!r||r.geo==null) return null;
  const [fl,fc]=fiab(r.statut);
  return {v:r.geo, tag:`<span class="pill ${fc}">${fl}</span>`, src:r.community?`communauté (<a href="/proposer">voir les votes</a>)`:(r.srcId?`<a href="${LF(r.srcId)}" target="_blank" rel="noopener">arrêté du Journal officiel</a>`:'—'), q:quarterStart(m)};
}
function adminManual(){
  const mf=st.mf||(st.mf={t:'geo',z:st.zone,m:CURRENT_PERIOD}), fixe=mf.t==='fixe';
  const cur=adminCurrent(mf.t,mf.z,mf.m);
  const zones=[...D.zones].sort((a,b)=>zoneLabel(a.z).localeCompare(zoneLabel(b.z),'fr'));
  return `<form class="panel card" id="manual" novalidate><h2>Saisir ou corriger une valeur</h2>
    <div class="field"><label>Partie de l'indemnité</label><div class="seg" role="group"><button type="button" data-mt="geo" aria-pressed="${!fixe}">Part géographique</button><button type="button" data-mt="fixe" aria-pressed="${fixe}">Part fixe</button></div></div>
    <div class="row">${fixe?'<div class="field"><label>Zone</label><span class="muted" style="padding:8px 0">Toutes les zones (part fixe identique partout)</span></div>'
      :`<div class="field"><label for="mzone">Zone</label><select id="mzone">${zones.map(x=>`<option value="${esc(x.z)}" ${x.z===mf.z?'selected':''}>${esc(zoneLabel(x.z))}</option>`).join('')}</select></div>`}
      <div class="field"><label for="mmonth">Mois</label><input type="month" id="mmonth" value="${mf.m}" min="2014-01" max="${CURRENT_MONTH}"></div></div>
    <div class="note small" style="display:grid;gap:4px">${cur
      ? `<span><strong>Valeur actuelle</strong> (${fixe?'part fixe':'part géographique · '+esc(zoneLabel(mf.z))}, ${mlabel(mf.m)}) : <strong class="num">${fmt(cur.v)} €</strong> ${cur.tag}</span><span>Source : ${cur.src}</span>${!fixe&&cur.q!==mf.m?`<span class="muted">La part géographique change par trimestre : cette valeur s'applique depuis le ${d1(cur.q)}.</span>`:''}<span class="muted">Une nouvelle saisie la remplacera (l'ancienne valeur reste dans l'historique des modifications).</span>`
      : `<span><strong>Aucune valeur</strong> pour ${fixe?'la part fixe':esc(zoneLabel(mf.z))} en ${mlabel(mf.m)} : la saisie créera la valeur.</span>`}</div>
    <div class="row"><div class="field"><label for="mval">Nouveau montant (€) ou variation (%)</label><input type="text" id="mval" placeholder="${cur?fmt(cur.v):'1889,73'} ou +0,71 %"></div>
      <div class="field"><label for="msrc">Source (lien ou référence)</label><input type="text" id="msrc" placeholder="ex. lien Légifrance de l'arrêté"></div></div>
    <div><button class="btn" type="submit">Enregistrer</button></div></form>`;
}
/* ---------- Admin : journal des requêtes (données RÉELLES d'un passage de collecte, fichier journal.json) ---------- */
const API_TYPES={geo:'Part géographique',fixe:'Part fixe',fx:'Taux de change',cpi:'Coût de la vie'};
const API_ST={ok:['Valeur enregistrée','ok'],none:['Rien de nouveau',''],retry:['Réussi après réessai','mid'],check:['À vérifier','mid'],fail:['Échec','bad']};
const AF_KEY='apiLogFilters';
function apiFilters(){ if(!st.apf){ st.apf={}; try{ st.apf=JSON.parse(localStorage.getItem(AF_KEY)||'{}')||{}; }catch(e){} } return st.apf; }
function apiSave(){ try{ localStorage.setItem(AF_KEY, JSON.stringify(st.apf)); }catch(e){} }
const dfr=d=>d?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'—';
const atFr=a=>dfr(a)+' '+a.slice(11,16);
const allZ=()=>[...Object.keys(D.canada),...Object.keys(H.zones||{})].filter((z,i,a)=>a.indexOf(z)===i);
function curUsers(){ if(st.curU) return st.curU; const u={}; allZ().forEach(z=>{ const s=seriesFor(z), d=s&&s.length?s[s.length-1].dev:null; if(d&&d!=='EUR') (u[d]=u[d]||[]).push(zoneLabel(z)); }); return st.curU=u; }
/* Une ligne = une valeur récupérée, ou une requête sans valeur (rien de nouveau, échec) */
function apiRows(){
  if(st.apiRowsC) return st.apiRowsC; const R=[], U=curUsers();
  for(const e of (JL?JL.entries:[])){
    const day=(e.concerne&&e.concerne.length>=10?e.concerne:e.at).slice(0,10);
    if(e.values.length) e.values.forEach((v,i)=>{ const isCur=e.type==='fx', u=isCur?(U[v.key]||[]):[];
      R.push({e,v,i,day,status:v.checks.some(c=>!c.ok)?'check':e.status,
        zone:isCur?v.key:(zoneLabel(v.key)||v.key), zsub:isCur?(u.length?u.slice(0,3).join(', ')+(u.length>3?` + ${u.length-3}`:''):'aucune zone suivie'):'',
        find:(isCur?v.key+' '+u.join(' '):zoneLabel(v.key)).toLowerCase()}); });
    else R.push({e,v:null,day,status:e.status,zone:'Toutes les zones',zsub:'',find:'toutes les zones'});
  }
  R.sort((a,b)=>b.day.localeCompare(a.day)||b.e.at.localeCompare(a.e.at));
  return st.apiRowsC=R;
}
function importLog(){
  if(!JL) return '<li>Aucun passage de collecte enregistré.</li>';
  const E=JL.entries, jo=E.filter(e=>e.type==='geo'&&e.title.startsWith('Fichier')), bce=E.find(e=>e.type==='fx'), ipc=E.find(e=>e.type==='cpi'), pis=E.find(e=>e.src.startsWith('Légifrance'));
  const L=[];
  if(bce) L.push(`${atFr(bce.at)} — BCE : ${bce.values.length} devises, dernier cours du ${dfr(bce.concerne)}`);
  if(ipc&&ipc.values[0]) L.push(`${atFr(ipc.at)} — Statistique Canada : ${esc(ipc.values[0].label)} = ${fmt(ipc.values[0].v,1)}`);
  if(jo.length) L.push(`${atFr(jo[jo.length-1].at)} — Journal officiel : ${jo.length} fichiers lus (${dfr(jo[0].concerne)} → ${dfr(jo[jo.length-1].concerne)}), aucun nouvel arrêté`);
  const lf=E.filter(e=>e.src.startsWith('Légifrance')), lfBad=lf.find(e=>e.status==='fail'), pfc=lf.find(e=>e.title==='Calcul de la part fixe');
  if(lf.length) L.push(lfBad?`<span class="down">${atFr(lfBad.at)} — Légifrance : échec, ${esc(lfBad.err)}</span>`:`${atFr(lf[0].at)} — Légifrance : ${lf.length-2} textes de la part fixe lus${pfc&&pfc.values[0]?`, part fixe recalculée = ${fmt(pfc.values[0].v)} € (identique)`:''}`);
  return L.map(x=>`<li>${x} <span class="small">(heures UTC)</span></li>`).join('');
}
function adminApiLog(){
  if(!JL) return `<div class="panel"><h2>Journal des requêtes</h2><p class="muted" style="margin:0">Journal non chargé.</p></div>`;
  const f=apiFilters(), g=f.g||'type', q=(f.q||'').trim().toLowerCase(), dd=st.apiDet||(st.apiDet={}), more=st.apiMore||(st.apiMore={});
  const all=apiRows(), bad=r=>r.status==='fail'||r.status==='check';
  const rows=all.filter(r=>(!f.type||r.e.type===f.type)&&(!q||r.find.includes(q))&&(!f.fail||bad(r)));
  const fails=[...new Map(all.filter(bad).map(r=>[r.e.id,r])).values()];
  const pill=s=>`<span class="pill ${API_ST[s][1]}">${API_ST[s][0]}</span>`;
  const val=r=>r.v?`<strong class="num">${fmt(r.v.v,r.v.dec)}</strong> <span class="small muted">${esc(r.v.label)}</span>`:`<span class="small">${esc(r.e.title)}${r.e.concerne&&r.e.type==='geo'?' du '+dfr(r.e.concerne):''}</span>`;
  const det=r=>{ const e=r.e, cks=r.v?[r.v]:[]; return `<tr class="apidet"><td colspan="4"><div class="apibox">
      ${e.err?`<div class="apierr"><strong>Cause</strong> : ${esc(e.err)}</div>`:''}${e.todo?`<div class="apitodo"><strong>Que faire</strong> : ${esc(e.todo)}</div>`:''}
      <div class="small muted">${esc(e.method)} <code>${esc(e.url)}</code><br>${e.http?'HTTP '+e.http:(e.method==='calcul'?'traitement local':'aucune réponse')}${e.ms!=null?' · '+fmt(e.ms/1000,1)+' s':''}${e.size?' · '+(e.size>1e5?fmt(e.size/1e6,1)+' Mo':e.size+' octets'):''} · requête du ${atFr(e.at)} UTC</div>
      ${cks.length?`<table class="list chktab"><thead><tr><th>Valeur reçue</th>${cks[0].checks.map(c=>`<th>${c.c}<br><span class="small muted" style="font-weight:400">${esc(c.exp)}</span></th>`).join('')}</tr></thead><tbody>${cks.map(v=>`<tr${v.checks.some(c=>!c.ok)?' class="apifail"':''}><td><code>${esc(v.raw)}</code></td>${v.checks.map(c=>`<td class="${c.ok?'up':'down'}">${c.ok?'✓':'✗'} <span class="small">${esc(c.got)}</span></td>`).join('')}</tr>`).join('')}</tbody></table>`:''}
      ${r.v&&r.v.avg!=null?`<div class="small">Moyenne provisoire de novembre : <strong class="num">${fmt(r.v.avg,4)}</strong> (${r.v.n} cours)</div>`:''}
      <pre class="apilogs">${e.logs.map(([t,l,m])=>`<span class="lv ${l}">${t.slice(11,19)}</span> ${esc(m)}`).join('\n')}</pre></div></td></tr>`; };
  const key=r=>g==='type'?API_TYPES[r.e.type]:g==='zone'?r.zone:dfr(r.day);
  const groups=new Map(); rows.forEach(r=>{ const k=key(r); if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(r); });
  let keys=[...groups.keys()];
  if(g==='date') keys.sort((a,b)=>b.split('/').reverse().join().localeCompare(a.split('/').reverse().join()));
  else if(g==='zone') keys.sort((a,b)=>(a==='Toutes les zones'?-1:b==='Toutes les zones'?1:a.localeCompare(b,'fr')));
  else keys.sort((a,b)=>Object.values(API_TYPES).indexOf(a)-Object.values(API_TYPES).indexOf(b));
  const glim=more['g'+g]?keys.length:20;
  const ghtml=keys.slice(0,glim).map(k=>{ const rs=groups.get(k), nb=new Set(rs.filter(bad).map(r=>r.e.id)).size, gk=g+'|'+k, open=st.apiOpen&&st.apiOpen[gk]!=null?st.apiOpen[gk]:(nb>0||keys.length<=4||!!q), lim=more[gk]?rs.length:10;
    const sub=g==='zone'&&rs[0].zsub?` <span class="small muted">· ${esc(rs[0].zsub)}</span>`:'';
    return `<details class="apizone" data-ak="${esc(gk)}" ${open?'open':''}><summary><strong>${esc(k)}</strong>${sub} <span class="small muted">· ${rs.length} ligne${rs.length>1?'s':''}</span> ${nb?`<span class="pill bad">${nb} échec${nb>1?'s':''}</span>`:''}</summary>
      <div class="tscroll"><table class="list apitab"><tbody>${rs.slice(0,lim).map(r=>{ const id=r.e.id+'.'+(r.v?r.i:'x'); return `<tr class="apirow${bad(r)?' apifail':''}" data-apid="${id}"><td class="num small">${dd[id]?'▾':'▸'} ${g==='date'?r.e.at.slice(11,16):dfr(r.day)}</td><td class="small">${g==='type'?esc(r.zone):esc(API_TYPES[r.e.type])}${g!=='type'&&g!=='zone'?' · '+esc(r.zone):''}</td><td>${r.e.status==='fail'?'<strong class="down">Non récupérée</strong>':val(r)}</td><td>${pill(r.status)}</td></tr>${dd[id]?det(r):''}`; }).join('')}</tbody></table></div>
      ${rs.length>10?`<button class="linkbtn small" type="button" data-apmore="${esc(gk)}">${more[gk]?'Réduire':'Afficher les '+(rs.length-10)+' autres'}</button>`:''}</details>`; }).join('');
  return `<div class="panel"><div class="phead" style="justify-content:space-between"><h2 style="margin:0">Journal des requêtes</h2><span class="small muted">Passage réel du ${atFr(JL.run.start)} UTC · ${esc(JL.run.from)}</span></div>
    ${fails.length?`<div class="apialert"><div><strong>${fails.length} problème${fails.length>1?'s':''} à traiter</strong><ul style="margin:4px 0 0;padding-left:18px">${fails.map(r=>`<li>${esc(r.e.src)} · ${esc(r.e.title)} : ${esc(r.e.err||API_ST[r.status][0])}${r.e.todo?`<br><span class="small"><strong>Que faire</strong> : ${esc(r.e.todo)}</span>`:''}</li>`).join('')}</ul></div></div>`:'<p class="up small" style="margin:0">✓ Aucun échec.</p>'}
    <div class="apifil">
      <div class="seg" role="group" aria-label="Grouper par"><span class="small muted" style="align-self:center;padding:0 6px">Grouper par</span>${[['type','Type'],['zone','Zone / devise'],['date','Date']].map(([k,l])=>`<button type="button" data-apg="${k}" aria-pressed="${g===k}">${l}</button>`).join('')}</div>
      <select id="apType" aria-label="Type"><option value="">Tous les types</option>${Object.entries(API_TYPES).map(([k,l])=>`<option value="${k}" ${f.type===k?'selected':''}>${l}</option>`).join('')}</select>
      <input id="apQ" type="search" value="${esc(f.q||'')}" placeholder="Zone ou devise (ex. Montréal, CAD)…" aria-label="Rechercher une zone ou une devise">
      <label class="small apichk"><input type="checkbox" id="apFail" ${f.fail?'checked':''}> Échecs seulement</label></div>
    <p class="small muted" style="margin:0">${rows.length} ligne(s) · une ligne par valeur récupérée (ou par requête sans valeur) · cliquer pour le détail, les contrôles de type et de format et le journal pas à pas.</p>
    ${ghtml||'<p class="muted" style="margin:0">Aucun résultat.</p>'}
    ${keys.length>20?`<button class="linkbtn small" type="button" data-apmore="g${g}">${more['g'+g]?'Réduire':'Afficher les '+(keys.length-20)+' autres groupes'}</button>`:''}</div>`;
}
/* ---------- Espace administrateur : hub des modules, puis un espace par module ---------- */
const adminLogin = ()=>`<section class="view"><h1>Espace administrateur</h1>
  <form class="panel card" id="login" novalidate><div class="field"><label for="aemail">Email</label><input type="email" id="aemail" autocomplete="username" value=""></div>
  <div class="field"><label for="apass">Mot de passe</label><input type="password" id="apass" autocomplete="current-password" value=""></div>
  <p class="small muted" style="margin:0">Blocage temporaire après plusieurs tentatives échouées.</p><div><button class="btn" type="submit">Se connecter</button></div></form></section>`;
// Modules administrables (même liste que l'accueil). Pour l'instant, un admin a accès à tous les modules.
const ADMIN_MODULES=[
  {id:'admin-pouvoir', t:'Pouvoir d’achat VI', d:'Valeurs de l’indemnité, propositions de la communauté, journal des requêtes, historique des modifications, données collectées.'},
  ...['Épargne en VI','Fiscalité du VI','Logement en VI et remboursement par l\'entreprise','Remboursement des frais de bagages et transports en VI','Témoignages de VI','Assurance santé April en VI','Fin de VI','Carte du monde des VI'].map(t=>({t}))];
const adminHead=(title,back)=>`<div class="toolbar" style="justify-content:space-between;align-items:flex-end"><div>${back?'<a href="/#admin" class="small">← Tous les modules (administration)</a>':''}<h1 style="margin:${back?'4px':'0'} 0 0">${title}</h1></div><button class="btn ghost" type="button" id="logout">Se déconnecter</button></div>`;
V.admin = ()=>{
  if(!st.admin) return adminLogin();
  initProposals(); initHist();
  const nFail=JL?new Set(JL.entries.filter(e=>e.status==='fail'||(e.rej&&e.rej.length)).map(e=>e.id)).size:0;
  const nRef=(st.hist||[]).filter(x=>x.chk&&x.chk.some(c=>!c.ok)).length;
  const nProp=(st.proposals||[]).filter(p=>p.s==='En attente').length;
  const badge=(n,l,c)=>n?`<span class="pill ${c}">${n} ${l}</span>`:'';
  return `<section class="view">${adminHead('Espace administrateur',false)}
  <p class="muted" style="margin:0">Choisissez le module à administrer. Accès actuel : <strong>tous les modules</strong> (administrateur principal).</p>
  <section aria-label="Module global" style="display:grid;gap:8px">
    <span class="eyebrow">Général · tout le site</span>
    <a class="mod on modglobal" href="#admin-stats"><span class="gbadge">🌐 Module global</span><h3>Statistiques</h3>
      <span class="muted small">Fréquentation de tout le site : visiteurs, pages et modules les plus utilisés, actions (téléchargements…). Concerne tous les modules.</span></a>
    <a class="mod on modglobal" href="#admin-messages"><span class="gbadge">🌐 Module global</span><h3>Messages</h3>
      <span class="muted small">Messages reçus par le formulaire de contact (page Mentions légales &amp; contact). Effacés automatiquement après 60 jours.</span></a>
  </section>
  <span class="eyebrow">Modules du site</span>
  <section class="cards" aria-label="Modules à administrer">
    ${ADMIN_MODULES.map(m=>m.id?`<a class="mod on" href="#${m.id}"><h3>${m.t}</h3><span class="muted small">${m.d}</span>
      <span style="display:flex;gap:6px;flex-wrap:wrap">${badge(nFail,'requête(s) en échec','bad')}${badge(nRef,'valeur(s) refusée(s)','bad')}${badge(nProp,'proposition(s) en attente','mid')}${!nFail&&!nRef&&!nProp?'<span class="pill ok">✓ rien à traiter</span>':''}</span></a>`
      :`<div class="mod off" aria-disabled="true"><span class="badge">🚧 Bientôt disponible</span><h3>${m.t}</h3></div>`).join('')}
  </section>
  <ul class="small muted" style="margin:0;padding-left:18px"><li>Chaque module a son propre espace d’administration.</li><li>Plus tard : des comptes limités à certains modules (ex. un modérateur pour un seul module).</li></ul></section>`;
};

/* ---------- Administration · Statistiques (module global : tout le site) ---------- */
const STATS_PERIODS=[['today','Aujourd’hui'],['7d','7 derniers jours'],['30d','30 derniers jours'],['90day','3 derniers mois'],['12month','12 derniers mois']];
function loadStats(p){
  st.statsData=st.statsData||{};
  if(st.statsData[p]!==undefined) return;
  st.statsData[p]=null;   // en cours
  fetch('/api/admin/stats?period='+encodeURIComponent(p),{credentials:'same-origin'})
    .then(r=>r.ok?r.json():Promise.reject(r.status)).then(d=>{ st.statsData[p]=d; if(location.hash==='#admin-stats') render(); })
    .catch(()=>{ st.statsData[p]={indisponible:true}; if(location.hash==='#admin-stats') render(); });
}
const statsDur=s=>{ if(s==null||!isFinite(s)) return '—'; const m=Math.floor(s/60), r=Math.round(s%60); return m?`${m} min ${String(r).padStart(2,'0')} s`:`${r} s`; };
function statsTable(rows,head,emptyMsg){
  if(!rows||!rows.length) return `<p class="small muted" style="margin:0">${emptyMsg||'Aucune donnée pour cette période.'}</p>`;
  const max=Math.max(...rows.map(r=>r.y));
  return `<table class="list stab"><thead><tr><th>${head[0]}</th><th class="r">${head[1]}</th></tr></thead><tbody>${rows.map(r=>`<tr><td><span class="sbar" style="width:${Math.max(2,Math.round(r.y/max*100))}%"></span><span class="slab">${esc(r.x||'(inconnu)')}</span></td><td class="r num">${r.y.toLocaleString('fr-FR')}</td></tr>`).join('')}</tbody></table>`;
}
V['admin-stats'] = ()=>{
  if(!st.admin) return adminLogin();
  const p=STATS_PERIODS.some(x=>x[0]===st.stP)?st.stP:'30d'; loadStats(p);
  const d=st.statsData[p], ok=d&&!d.indisponible, s=ok?d.stats:null, v=k=>s?s[k]:null;
  const kpi=(l,val,sub)=>`<div class="kpi"><span class="small muted">${l}</span><strong class="num" style="font-size:1.6rem">${val}</strong>${sub?`<span class="small muted">${sub}</span>`:''}</div>`;
  const n=x=>x==null?'—':x.toLocaleString('fr-FR');
  const cmp=k=>{ if(!s||!s.comparison||!s.comparison[k]) return ''; const r=s[k]/s.comparison[k]-1; return `<span class="${r>=0?'up':'down'}">${pct(r,0)}</span> vs période précédente`; };
  return `<section class="view">${adminHead('Administration · Statistiques',true)}
  <div class="note small" style="display:grid;gap:4px"><strong>🌐 Module global</strong><span>Ces statistiques concernent <strong>tout le site</strong> (accueil et tous les modules), pas un module en particulier.</span></div>
  <div class="toolbar" style="justify-content:space-between;align-items:flex-end">
    <div class="field"><label for="stP">Période</label><select id="stP">${STATS_PERIODS.map(([k,l])=>`<option value="${k}" ${k===p?'selected':''}>${l}</option>`).join('')}</select></div>
    <a class="btn" href="${esc(window.SITE_STATS?.url||'')}" target="_blank" rel="noopener">Ouvrir Umami (détail complet) ↗</a></div>
  ${d===null?'<p class="muted">Chargement des statistiques…</p>':''}
  ${d&&d.indisponible?'<div class="note small">Statistiques indisponibles ici : les chiffres réels s’affichent sur le site en ligne, une fois la mesure d’audience installée (Umami). La présentation ci-dessous montre ce qui sera affiché.</div>':''}
  <div class="panel"><h2>Vue d’ensemble</h2><div class="kpis">
    ${kpi('Visiteurs',n(v('visitors')),cmp('visitors'))}${kpi('Visites',n(v('visits')),cmp('visits'))}${kpi('Pages vues',n(v('pageviews')),cmp('pageviews'))}
    ${kpi('Pages par visite',s&&s.visits?fmt(s.pageviews/s.visits,1):'—')}${kpi('Durée moyenne d’une visite',s&&s.visits?statsDur(s.totaltime/s.visits):'—')}${kpi('Visites d’une seule page',s&&s.visits?pct(s.bounces/s.visits,0).replace('+',''):'—','« taux de rebond »')}
    ${kpi('Visites par visiteur',s&&s.visitors?fmt(s.visits/s.visitors,2):'—','fidélité : plus c’est haut, plus les visiteurs reviennent')}</div></div>
  <div class="grid2">
    <div class="panel"><h2>Utilisation des modules</h2>${statsTable(ok?d.modules:null,['Module','Pages vues'])}</div>
    <div class="panel"><h2>Pages les plus vues</h2>${statsTable(ok?d.pages:null,['Page','Pages vues'])}</div>
    <div class="panel"><h2>Actions</h2>${statsTable(ok?d.events:null,['Action','Nombre'],'Aucune action enregistrée (téléchargements, changements de zone ou de mode…).')}</div>
    <div class="panel"><h2>Pages d’arrivée</h2>${statsTable(ok?d.entries:null,['Page','Visites'])}</div>
    <div class="panel"><h2>Pays</h2>${statsTable(ok?d.countries:null,['Pays','Visiteurs'])}</div>
    <div class="panel"><h2>Appareils</h2>${statsTable(ok?d.devices:null,['Appareil','Visiteurs'])}</div>
    <div class="panel"><h2>Sites d’origine</h2>${statsTable(ok?d.referrers:null,['Site','Visites'],'Aucun site d’origine (accès direct ou moteurs de recherche sans information).')}</div>
    <div class="panel"><h2>Navigateurs</h2>${statsTable(ok?d.browsers:null,['Navigateur','Visiteurs'])}</div>
  </div>
  <ul class="small muted" style="margin:0;padding-left:18px">
    <li>Mesure d’audience installée sur le serveur du site (Umami) : aucune donnée envoyée à un tiers, aucune publicité.</li>
    <li>Les visiteurs qui ont refusé la mesure d’audience ne sont pas comptés. Ils peuvent la refuser à tout moment dans la page <a href="/confidentialite">Confidentialité</a>.</li>
    <li>L’espace administrateur n’est jamais compté.</li></ul></section>`;
};
/* ===== Messages du formulaire de contact (module global) ===== */
function loadMsgs(force){ if(st.msgs!==undefined && !force) return; st.msgs=null;
  fetch('/api/admin/messages',{credentials:'same-origin'}).then(r=>r.ok?r.json():Promise.reject(r.status))
    .then(d=>{ st.msgs=d; if(location.hash==='#admin-messages') render(); })
    .catch(()=>{ st.msgs={indisponible:true}; if(location.hash==='#admin-messages') render(); }); }
V['admin-messages'] = ()=>{
  if(!st.admin) return adminLogin();
  loadMsgs(); const d=st.msgs, list=Array.isArray(d)?d:[];
  const quand=iso=>{ const x=new Date(iso), p=n=>String(n).padStart(2,'0'); return `${p(x.getUTCDate())}/${p(x.getUTCMonth()+1)}/${x.getUTCFullYear()} ${p(x.getUTCHours())}:${p(x.getUTCMinutes())} UTC`; };
  const reste=iso=>Math.max(0,60-Math.floor((Date.now()-new Date(iso))/86400000));
  return `<section class="view">${adminHead('Administration · Messages',true)}
  <div class="note small" style="display:grid;gap:4px"><strong>🌐 Module global</strong><span>Messages envoyés depuis le formulaire de contact de <strong>tout le site</strong>. Un message est effacé automatiquement <strong>60 jours</strong> après sa réception.</span></div>
  <div class="toolbar" style="justify-content:space-between"><span class="muted">${d===null?'Chargement…':d&&d.indisponible?'':`${list.length} message${list.length>1?'s':''}`}</span><button class="btn ghost" type="button" id="msgReload">Actualiser</button></div>
  ${d&&d.indisponible?'<div class="note small">Messages indisponibles ici : ils s’affichent sur le site en ligne (la maquette n’a pas de serveur).</div>':''}
  ${Array.isArray(d)&&!list.length?'<p class="muted">Aucun message pour l’instant.</p>':''}
  ${list.map(m=>`<article class="panel" style="gap:8px">
    <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:space-between;align-items:center">
      <span><strong>${quand(m.at)}</strong> · ${m.email?`<a href="mailto:${encodeURIComponent(m.email)}">${esc(m.email)}</a>`:'<span class="muted">sans email (pas de réponse possible)</span>'}</span>
      <span style="display:flex;gap:8px;align-items:center"><span class="small muted">effacé dans ${reste(m.at)} j</span><button class="btn ghost" type="button" data-delmsg="${Number(m.id)}">Supprimer</button></span></div>
    <div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(m.texte)}</div></article>`).join('')}
  </section>`;
};
V['admin-pouvoir'] = ()=>{
  if(!st.admin) return adminLogin();
  initProposals();
  return `<section class="view">${adminHead('Administration · Pouvoir d’achat VI',true)}
  ${adminProposals()}
  <div class="grid2">${adminManual()}
  <div class="panel"><h2>Imports</h2><button class="btn ghost" type="button" data-imp="jo">Importer depuis le Journal officiel</button><button class="btn ghost" type="button" data-imp="eco">Mettre à jour taux de change et coût de la vie</button><button class="btn ghost" type="button" id="capRun">Nettoyer les propositions</button>
    <ul class="small muted" style="margin:0;padding-left:18px"><li>Fait automatiquement chaque jour avec la récupération des données (16 h 37 UTC).</li><li>Supprime : les rejetées proposées il y a plus de 3 mois, celles en attente depuis plus de 6 mois, puis tout ce qui dépasse les ${MAX_PROPS} plus populaires par mois, partie et zone.</li></ul>
    <h3>Journal</h3><ul class="small muted" style="margin:0;padding-left:18px">${(st.capLog||[]).map(c=>{const [t,z,eff]=c.k.split('|'); return `<li>${c.at} — Nettoyage : ${fmt(c.v)} € retirée (${c.why}, score ${c.score}) · ${t==='fixe'?'part fixe':'part géo · '+esc(zoneLabel(z))} · ${d1(eff)}</li>`;}).join('')}${importLog()}</ul></div></div>
  ${adminApiLog()}
  ${adminHistory()}
  ${adminData()}</section>`;
};
/* Export CSV des données brutes : mois par mois, VIE et VIA, indemnité (fixe, géo, total, fiabilité, source),
   taux € → devise (moyenne du mois, partielle pour le mois en cours) et indice du coût de la vie quand il existe */
async function downloadCSV(all){
  const n=v=>v==null?'':String(v).replace('.',',');
  const zones=all?D.zones.map(x=>x.z):[st.zone], keep=st.mode, out=['zone;pays;mois;mode;part_fixe_eur;part_geo_eur;total_eur;fiabilite;source_arrete;devise;taux_eur_devise;taux_moyenne_partielle;indice_cout_vie_2002_100;ville_indice'];
  for(const z of zones){ const pays=(D.zones.find(x=>x.z===z)||{}).pays||'';
    for(const mode of ['vie','via']){ st.mode=mode; const rows=seriesFor(z); if(!rows) continue;
      for(const r of rows) out.push([z,pays,r.m,mode.toUpperCase(),n(r.fixe),n(r.geo),n(r.total),r.community?'communaute':(r.statut||''),r.srcId?'https://www.legifrance.gouv.fr/jorf/id/'+r.srcId:'',r.dev||'',n(r.fx==null?null:+r.fx.toFixed(6)),r.fxProv?'oui':'',n(r.cpi),r.cpi!=null?(CPI_CITIES[z]||[''])[0]:''].map(s=>/[;"\n]/.test(s)?'"'+String(s).replace(/"/g,'""')+'"':s).join(';')); } }
  st.mode=keep;
  const blob=new Blob(['﻿'+out.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const filename=all?'indemnite-toutes-zones.csv':`indemnite-${st.zone.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}.csv`;
  // Dans claude.ai : enregistrement via la capacité « downloads » (le visiteur confirme) ; sinon lien de téléchargement classique
  const dl = window.claude?.use ? await window.claude.use('downloads') : null;
  if(dl){ try{ await dl.save({filename, data:blob}); toast(`CSV enregistré : ${out.length-1} lignes.`); }
    catch(e){ toast(e?.code==='declined'?'Téléchargement annulé.':'Téléchargement impossible ici.'); } return; }
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),5000);
  toast(`CSV généré : ${out.length-1} lignes${all?' (toutes les zones)':''}.`);
}
/* Données collectées et stockées (consultables par l'admin uniquement, pas publiées aux visiteurs) */
function adminData(){
  const Dd=H.daily||{dates:[],rates:{}}, curs=Object.keys(Dd.rates);
  const cur=curs.includes(st.admCur)?st.admCur:(curs.includes('CAD')?'CAD':curs[0]);
  const vals=Dd.rates[cur]||[]; let sum=0,n=0;
  const fxRows=Dd.dates.map((d,i)=>{ const v=vals[i]; if(v!=null){sum+=v;n++;} return `<tr><td>${fmtDay(d)}</td><td class="r num">${v==null?'—':fmt(v,4)}</td><td class="r num">${n?fmt(sum/n,4):'—'}</td><td class="r small muted">${n} cours</td></tr>`; }).reverse().join('');
  const cpiN=st.cpiN||'4', cs=D.canada['CANADA (AUTRES VILLES)'].series.filter(r=>r.cpi!=null), cpiAll=cs.map((r,i)=>({m:r.m,v:r.cpi,m1:i>0?r.cpi/cs[i-1].cpi-1:null,m12:i>=12?r.cpi/cs[i-12].cpi-1:null}));
  const cpiRows=(cpiN==='all'?cpiAll:cpiAll.slice(-cpiN)).reverse().map(r=>`<tr><td>${mlabel(r.m)}</td><td class="r num"><strong>${fmt(r.v,1)}</strong></td><td class="r num ${cls(r.m1,true)}">${pct(r.m1)}</td><td class="r num ${cls(r.m12,true)}">${pct(r.m12)}</td></tr>`).join('');
  const fixeRows=[...FIXE].reverse().map(([m,v],i,arr)=>`<tr><td>${d1(m)}</td><td class="r num"><strong>${fmt(v)} €</strong>${i<arr.length-1?`<br><span class="small muted">${pct(v/arr[i+1][1]-1)}</span>`:''}</td><td class="small">${fixeLinks(m,true)}</td></tr>`).join('');
  const LF=id=>`https://www.legifrance.gouv.fr/jorf/id/${id}`;
  return `<div class="panel"><h2>Données collectées (stockées, visibles par l'admin seulement)</h2>
    <ul class="small muted" style="margin:0;padding-left:18px;display:grid;gap:2px">
      <li><strong>Taux de change</strong> : chaque jour ouvré, la tâche ne demande que le <strong>cours du jour</strong> de chaque devise et l'ajoute à la base ; la moyenne du mois en cours est recalculée à partir des cours déjà stockés (aucune requête pour les jours précédents).</li>
      <li><strong>Indice du coût de la vie et arrêtés</strong> : publiés une fois par mois / trimestre ; la tâche vérifie chaque jour si une nouvelle valeur existe et la stocke dès sa parution.</li>
      <li>Les visiteurs ne voient que les moyennes mensuelles ; l'historique jour par jour reste ici.</li></ul>
    <div class="grid2">
      <div><div class="phead" style="justify-content:space-between"><h3 style="margin:0">Cours quotidiens · ${mlabel(H.prov.month)}</h3><select id="admCur" aria-label="Devise">${curs.map(c=>`<option ${c===cur?'selected':''}>${c}</option>`).join('')}</select></div>
        <div class="tscroll" style="max-height:300px;overflow-y:auto"><table class="list"><thead><tr><th>Jour</th><th class="r">1 € = ${cur}</th><th class="r">Moyenne du mois<br><span class="small muted" style="font-weight:400">depuis le 01/${H.prov.month.slice(5)}</span></th><th class="r">Base</th></tr></thead><tbody>${fxRows}</tbody></table></div>
        <p class="src">Source : BCE, cours de référence quotidiens (${curs.length} devises ; les autres via Frankfurter). Pas de cours le week-end ni les jours fériés TARGET.</p></div>
      <div><div class="phead" style="justify-content:space-between"><h3 style="margin:0">Indice du coût de la vie · Montréal</h3><select id="admCpiN" aria-label="Nombre de mois">${[['4','4 derniers mois'],['12','12 derniers mois'],['24','24 derniers mois'],['all','Tout ('+cpiAll.length+' mois)']].map(([v,l])=>`<option value="${v}" ${cpiN===v?'selected':''}>${l}</option>`).join('')}</select></div>
        <div class="tscroll" style="max-height:300px;overflow-y:auto"><table class="list"><thead><tr><th>Mois</th><th class="r">Indice<br><span class="small muted" style="font-weight:400">2002 = 100</span></th><th class="r">Sur 1 mois</th><th class="r">Sur 12 mois</th></tr></thead><tbody>${cpiRows}</tbody></table></div>
        <p class="src">Source : Statistique Canada, tableau 18-10-0004-01 (Montréal seulement pour l’instant).</p>
        <h3 style="margin:10px 0 0">Part géographique · arrêtés importés (derniers)</h3>
        <table class="list"><thead><tr><th>Arrêté</th><th>Publié le</th><th>En vigueur le</th></tr></thead><tbody>
          ${[ARRETES.cur,ARRETES.prev].filter(a=>!(st.noJO&&a===ARRETES.cur)).map(a=>`<tr><td><a href="${LF(a.id)}" target="_blank" rel="noopener">arrêté du ${fmtDay(a.signe)}</a></td><td>${fmtDay(a.publi)}</td><td>${fmtDay(a.effet)}</td></tr>`).join('')}</tbody></table>
        <p class="src">Arrêtés trimestriels « fixant par pays et par groupe les taux » : un % par zone. Vérification quotidienne du Journal officiel (open data DILA).</p>
        <h3 style="margin:10px 0 0">Part fixe · textes en vigueur</h3>
        <table class="list"><thead><tr><th>En vigueur depuis</th><th class="r">Part fixe</th><th>Textes (Légifrance)</th></tr></thead><tbody>${fixeRows}</tbody></table>
        <p class="src">Commune à toutes les zones : 50 % du traitement de l’indice brut 244 (formule, grille des indices, barème des traitements). Changement repéré dans le Journal officiel ou par l’API Légifrance.</p></div></div></div>`;
}

V.methodo = ()=>`<section class="view method"><h1>Méthodologie et sources</h1>
  <div class="panel"><h2>L'indemnité</h2>
  <p style="margin:0">Indemnité = <strong>part fixe</strong> + <strong>part géographique</strong> (montant brut, sans retenue logement ni avance).</p>
  <ul style="margin:0"><li><strong>Part fixe</strong> : identique dans tous les pays, égale à 50 % du traitement de l'indice brut 244 de la fonction publique (décret n° 2000-1159, art. 18). 772,87 € depuis janvier 2024.</li>
  <li><strong>Part géographique</strong> : chaque trimestre, un arrêté publié au Journal officiel fixe une variation en % par zone. Nouveau montant = ancien × (1 + %), arrondi au centime inférieur. Avant le 23/05/2021, les VIE avaient leur propre barème annuel.</li>
  <li><strong>Zones renommées</strong> (ex. Swaziland → Eswatini, Taiwan → Taipei, « Boston » → « Boston et autres villes du Massachusetts ») : c'est la même zone, son historique est regroupé sous le nom actuel. Vérifié : l'ancien et le nouveau nom n'apparaissent jamais dans un même arrêté.</li>
  <li><strong>Villes créées en cours de route</strong> (ex. Berlin, Mexico, Cracovie, Canton) : l'arrêté ne donne qu'un %, sans montant de départ. Avant sa création, la ville prend la valeur de l'ancienne zone qui la couvrait, puis ses propres % s'appliquent. Étiquette <span class="pill mid">Déduit</span>.</li>
  <li><strong>États-Unis en mode VIE</strong> : les zones VIE ne suivent pas le découpage VIA par ville (groupes d'États depuis 2023). Pour une ville, le site affiche la zone VIE qui la couvre à chaque période.</li>
  <li><strong>Cases vides</strong> : quand aucun arrêté ne permet de connaître la valeur (ex. San Diego avant 2023, Samoa avant 2026 en VIA), la case reste vide plutôt que d'être inventée.</li></ul>
  <h3>Comment l'indemnité est censée être ajustée</h3>
  <ul style="margin:0;padding-left:18px;display:grid;gap:4px">
    <li>Selon Business France (plaquette « Les indemnités des missions »), la part géographique est revue chaque trimestre selon un mécanisme dit « change-prix ».</li>
    <li><strong>Effet prix</strong> : écart d'inflation entre la France et le pays, sur 2 trimestres, avec un décalage d'environ 5 mois.</li>
    <li><strong>Effet change</strong> : variation de la monnaie locale face à l'euro, sur 2 trimestres, avec un décalage d'environ 2 mois.</li>
    <li>Ce site ne peut pas garantir que les ajustements suivent réellement ce mécanisme.</li>
    <li>Il existe justement pour le <strong>vérifier</strong> et suivre l'évolution du pouvoir d'achat dans le temps.</li>
  </ul></div>

  <div class="panel"><h2>Le taux de change : questions fréquentes</h2>
  <dl class="faq">
    <dt>D'où vient le taux ?</dt>
    <dd>Des taux de référence de la Banque centrale européenne (≈ 30 devises). Pour les autres devises, de Frankfurter, qui regroupe les taux officiels de 112 banques centrales.</dd>
    <dt>Quel taux est utilisé pour un mois ?</dt>
    <dd>La moyenne de tous les cours publiés dans le mois. Pour le mois en cours, une moyenne provisoire depuis le 1er, mise à jour chaque jour, puis définitive à la fin du mois.</dd>
    <dt>Pourquoi ce n'est pas le taux de ma banque ?</dt>
    <dd>Ce sont des taux de référence, sans frais ni marge. Votre banque ou votre service de transfert applique en général une marge de 0,5 à 3 % : vous recevez donc un peu moins.</dd>
    <dt>Je suis dans la zone euro.</dt>
    <dd>Pas de conversion : l'indemnité est versée et dépensée en euros. Seul le coût de la vie joue sur le pouvoir d'achat.</dd>
    <dt>Mon pays est passé à l'euro.</dt>
    <dd>Lituanie (01/01/2015), Croatie (01/01/2023), Bulgarie (01/01/2026) : l'ancienne monnaie est utilisée jusqu'à la date de passage, puis plus aucune conversion.</dd>
    <dt>Mon pays a changé de monnaie (redénomination).</dt>
    <dd>Biélorussie (2016, 10 000 BYR = 1 BYN), Mauritanie (2018, 10 MRO = 1 MRU), São Tomé-et-Principe (2018, 1 000 STD = 1 STN), Sierra Leone (2022, 1 000 SLL = 1 SLE). Sur le site, les mois d'avant sont convertis dans la nouvelle unité pour que l'historique reste comparable.</dd>
    <dt>Mon pays utilise le dollar américain.</dt>
    <dd>Équateur, Salvador, Panama, Timor oriental : la conversion se fait en dollars US.</dd>
    <dt>Pourquoi le taux ne bouge jamais ?</dt>
    <dd>Franc CFA (XOF, XAF), franc comorien, mark convertible de Bosnie… ont une parité fixe avec l'euro (ex. 1 € = 655,957 XOF). C'est normal : seul le coût de la vie fait varier le pouvoir d'achat.</dd>
    <dt>Le taux de mon pays semble faux.</dt>
    <dd>Venezuela, Zimbabwe, Liban, Argentine… ont des devises instables ou plusieurs taux (officiel, parallèle). Le site affiche le taux officiel, qui peut être très éloigné de celui que vous obtenez réellement : à interpréter avec prudence.</dd>
    <dt>Le logo 💱 est grisé.</dt>
    <dd>Aucune source fiable et gratuite ne publie le taux de cette devise : seul le montant en euros est affiché.</dd>
  </dl></div>

  <div class="panel"><h2>Le coût de la vie : d'où viennent les chiffres</h2>
  <p style="margin:0">On utilise l'<strong>indice des prix à la consommation</strong> (IPC) publié par l'institut statistique officiel du pays, pour une ville précise. Il mesure l'évolution du prix d'un panier de biens et services (logement, alimentation, transport…). On compare son évolution d'un mois à l'autre, pas son niveau.</p>
  <p style="margin:0">Une zone d'indemnité regroupe souvent plusieurs villes qui touchent la même indemnité, alors que leurs prix n'évoluent pas pareil. Le site utilise <strong>l'indice de la ville principale de la zone</strong>, indiqué dans le tableau ci-dessous. Si vous vivez dans une autre ville de la zone, l'évolution réelle de vos prix peut être un peu différente.</p>
  <a class="btn ghost" href="/villes-cout-de-la-vie" style="justify-self:start;text-decoration:none">Voir la ville utilisée pour chaque zone</a>
  <p class="small muted" style="margin:0">Source : Statistique Canada, IPC mensuel non désaisonnalisé, tableau 18-10-0004-01, publié environ 3 semaines après la fin du mois. Tant que l'indice du mois n'est pas publié, le dernier connu est utilisé (signalé par *).</p></div>

  <div class="panel"><h2>Quand le coût de la vie n'est pas disponible</h2>
  <p style="margin:0">L'indice du coût de la vie est difficile à obtenir pour beaucoup de pays. Il est public et gratuit au Canada aujourd'hui, mais ce n'est pas le cas partout : certains pays ne le publient pas par ville, d'autres pas du tout, ou avec des retards importants. Pour certaines zones, il est impossible à récupérer de façon fiable.</p>
  <p class="note" style="margin:0"><strong>Faites preuve de bon sens.</strong> Quand le logo 📊 est grisé, appuyez-vous sur le montant de l'indemnité en devise locale et sur votre connaissance des prix sur place (loyer, courses, transports) pour estimer votre pouvoir d'achat.</p></div>

  <div class="panel"><h2>Le pouvoir d'achat à partir des euros</h2>
  <p style="margin:0">Il mesure l'évolution de ce que permet d'acheter sur place une indemnité <strong>versée en euros</strong> et dépensée en devise locale.</p>
  <p style="margin:0">Pour chaque mois : <strong>pouvoir d'achat = indemnité en € × taux € → devise locale ÷ indice du coût de la vie local</strong>.</p>
  <p style="margin:0">La variation compare deux mois : pouvoir d'achat du mois ÷ pouvoir d'achat du mois de référence − 1. C'est exactement le produit de toutes les variations mensuelles entre les deux dates, donc toutes les valeurs intermédiaires sont prises en compte. Le site affiche la décomposition (indemnité, taux de change, coût de la vie) pour que chacun puisse vérifier.</p>
  <p class="note small" style="margin:0">Exemple, VIE à Montréal, janv. 2014 → oct. 2026 : indemnité en € +34,9 %, taux € → CAD +6,4 %, donc indemnité en CAD +43,5 % ; coût de la vie +41,2 %. Pouvoir d'achat : 1,435 ÷ 1,412 − 1 = <strong>+1,6 %</strong>. En mode VIA, sur la même période : −7,9 %.</p>
  <p style="margin:0">Ce calcul mesure le pouvoir d'achat ressenti, mois par mois, avec les données les plus récentes.</p></div>

  <div class="panel"><h2>Sources</h2>
  <ul style="margin:0;padding-left:18px;display:grid;gap:10px">
    <li><strong>Données publiques</strong> : toutes les données affichées et calculées sur ce site proviennent de sources <strong style="text-decoration:underline;text-underline-offset:3px">PUBLIQUES</strong>, gratuites et accessibles à tous.</li>
    <li><strong>Indemnité et part fixe</strong> : arrêtés publiés au Journal officiel et décrets de la fonction publique, via l'open data de la DILA (Licence Ouverte).</li>
    <li><strong>Taux de change</strong> : statistiques de la BCE ; Frankfurter (112 banques centrales) pour les devises que la BCE ne publie pas.</li>
    <li><strong>Coût de la vie</strong> : adapté de Statistique Canada, tableau 18-10-0004-01. Ceci ne constitue pas une approbation de ce produit par Statistique Canada.</li>
    <li><strong>Mises à jour automatiques</strong> : une tâche planifiée interroge chaque jour ces sources. En cas d'échec, une seule nouvelle tentative par jour, et seulement pendant la période où la donnée est attendue : aucune valeur n'est jamais forcée.
      <ul style="margin:6px 0 0;padding-left:18px;display:grid;gap:4px">
        <li>Arrêtés du Journal officiel (indemnité), chaque jour : <a href="https://echanges.dila.gouv.fr/OPENDATA/JORF/" target="_blank" rel="noopener">open data DILA — JORF</a></li>
        <li>Décrets consolidés (part fixe), chaque jour : <a href="https://echanges.dila.gouv.fr/OPENDATA/LEGI/" target="_blank" rel="noopener">open data DILA — LEGI</a></li>
        <li>Taux de change, moyennes mensuelles officielles : <a href="https://data-api.ecb.europa.eu/service/data/EXR/M..EUR.SP00.A?format=csvdata&amp;lastNObservations=1" target="_blank" rel="noopener">API BCE (série mensuelle)</a></li>
        <li>Taux de change, cours quotidiens (moyenne provisoire du mois en cours) : <a href="https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A?format=csvdata&amp;lastNObservations=1" target="_blank" rel="noopener">API BCE (série quotidienne)</a></li>
        <li>Taux de change des devises non publiées par la BCE : <a href="https://api.frankfurter.dev/v2/rates?base=EUR&amp;quotes=AFN" target="_blank" rel="noopener">API Frankfurter</a> (<a href="https://frankfurter.dev/" target="_blank" rel="noopener">documentation</a>)</li>
        <li>Coût de la vie (Canada), dès publication mensuelle : <a href="https://www150.statcan.gc.ca/t1/wds/rest/getCubeMetadata" target="_blank" rel="noopener">API Statistique Canada (Web Data Service)</a>, tableau 18-10-0004-01</li>
      </ul></li>
    <li><strong>Valeurs de la communauté</strong> : un volontaire peut librement partager le montant de sa propre indemnité, avec son accord. Le site se contente de collecter ces valeurs pour les rendre publiques, <strong>sans aucune identification personnelle</strong> (ni nom, ni employeur, ni bulletin).</li>
    <li><strong>Barèmes « NE PAS DIFFUSER »</strong> : contrairement à ce que l'on pourrait croire, les barèmes disponibles dans l'espace personnel des VIE n'ont <strong>pas du tout</strong> été utilisés ; les mêmes montants se déduisent entièrement des arrêtés publics. Nous invitons Business France à consacrer son énergie à accompagner soigneusement les volontaires internationaux et à leur offrir une expérience enrichissante, tout en leur garantissant autant leur <strong>sécurité</strong>, immédiate comme à long terme, que leur <strong>bonne santé</strong>, plutôt qu'à s'intéresser à un site qui publie des données publiques, gratuites et accessibles à tous.</li>
  </ul></div></section>`;
V.indices = ()=>`<section class="view"><div><a href="/methodologie" class="small">← Méthodologie</a></div><h1>Ville utilisée pour le coût de la vie</h1>
  <p class="muted" style="margin:0;max-width:72ch">Une zone d'indemnité peut regrouper plusieurs villes et leurs banlieues. Le site utilise l'indice des prix de la ville principale de chaque zone.</p>
  <table class="list fit"><thead><tr><th>Zone d'indemnité</th><th>Villes de la zone</th><th>Indice utilisé</th><th>Autres villes avec un indice publié</th></tr></thead><tbody>
    <tr><td>Canada — autres villes francophones</td><td>Montréal, Québec, Sherbrooke…</td><td><strong>Montréal</strong></td><td>Québec</td></tr>
    <tr><td>Canada — Ottawa, Moncton</td><td>Ottawa, Moncton</td><td><strong>Ottawa-Gatineau (partie ontarienne)</strong></td><td>Saint John (N.-B., le plus proche de Moncton)</td></tr>
    <tr><td>Canada — Toronto et autres villes anglophones</td><td>Toronto, Calgary, Edmonton, Winnipeg, Halifax…</td><td><strong>Toronto</strong></td><td>Calgary, Edmonton, Winnipeg, Halifax, Victoria, Regina, Saskatoon…</td></tr>
    <tr><td>Canada — Vancouver</td><td>Vancouver</td><td><strong>Vancouver</strong></td><td>—</td></tr></tbody></table>
  <ul class="small muted" style="margin:0;padding-left:18px;display:grid;gap:4px"><li>Tableau informatif : le coût de la vie n'est suivi aujourd'hui que pour le Canada.</li><li>Source : Statistique Canada, indice des prix à la consommation, tableau 18-10-0004-01.</li></ul></section>`;
/* ===== Dons pour l'hébergement : coûts réels (factures), compteur depuis le début de l'hébergement ===== */
const DON_URL=SITE.dons||'', HEBERG=SITE.hebergement;
V.dons = ()=>{
  if(!HEBERG) return `<section class="view"><h1>Dons pour l’hébergement</h1><p class="muted">Cette page n’est pas configurée sur ce site.</p></section>`;
  const d0=new Date(HEBERG.debut+'T00:00:00Z'), now=new Date();
  const jours=Math.max(0,Math.floor((now-d0)/86400000));
  // Périodes entamées : le serveur est facturé chaque mois à la date anniversaire, le domaine chaque année
  let mois=(now.getUTCFullYear()-d0.getUTCFullYear())*12+(now.getUTCMonth()-d0.getUTCMonth())+(now.getUTCDate()>=d0.getUTCDate()?1:0);
  mois=Math.max(1,mois); let ans=now.getUTCFullYear()-d0.getUTCFullYear()+((now.getUTCMonth()>d0.getUTCMonth()||(now.getUTCMonth()===d0.getUTCMonth()&&now.getUTCDate()>=d0.getUTCDate()))?1:0); ans=Math.max(1,ans);
  const sv=HEBERG.serveur, dn=HEBERG.domaine, svTTC=sv.ht*(1+sv.taxes);
  // Montants réellement payés, dans la devise de la facture (aucune conversion : ils ne changent pas avec les taux de change)
  const totSvCad=mois*svTTC, totDnUsd=ans*dn.ht;
  const m2=x=>fmt(x,2);
  return `<section class="view"><h1>Dons pour l’hébergement</h1>
  <div class="grid2">
  <div class="panel"><h2>Un projet bénévole</h2>
    <p style="margin:0">${esc(SITE.nom)} est un site <strong>personnel, gratuit et sans publicité</strong>, lancé bénévolement pour rendre les informations publiques sur les volontaires internationaux plus faciles à trouver et à comprendre.</p>
    <p style="margin:0">J’ai consacré quelques soirées pour développer le site avec mon ami Claude. Claude n’a pas besoin de cafés, mais moi ça me ferait plaisir.</p>
    <p style="margin:0">Un petit don aide à payer l’hébergement. Il est <strong>entièrement facultatif</strong> : le site reste gratuit et identique pour tout le monde, que vous donniez ou non.</p>
    ${DON_URL?`<div><a class="btn" href="${esc(DON_URL)}" target="_blank" rel="noopener noreferrer">Faire un don sur Liberapay ↗</a></div>`:''}
    <p class="small muted" style="margin:0">Liberapay est une plateforme de dons gérée par une association à but non lucratif. Le paiement se fait sur son site : ${esc(SITE.nom)} ne voit ni ne conserve aucune information de paiement.</p></div>
  <div class="panel"><h2>Coût de l’hébergement depuis le début</h2>
    <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:baseline">
      <div><div class="num" style="font-size:2rem;font-weight:700;line-height:1.1">${m2(totSvCad)} $ CA</div><span class="small muted">serveur</span></div>
      <div><div class="num" style="font-size:2rem;font-weight:700;line-height:1.1">${m2(totDnUsd)} $ US</div><span class="small muted">nom de domaine</span></div></div>
    <p class="small muted" style="margin:0">Du ${fmtDay(HEBERG.debut)} (début de l’hébergement) au ${fmtDay(now.toISOString().slice(0,10))} (UTC) : ${mois} mois de serveur et ${ans} an${ans>1?'s':''} de nom de domaine. Le total augmente au début de chaque nouveau mois de serveur (et de chaque nouvelle année de domaine).</p>
  </div></div>
  <div class="panel"><h2>Détail des coûts</h2>
    <div class="tscroll"><table class="list"><thead><tr><th>Poste</th><th>Prix</th><th>Périodes entamées</th><th>Total</th></tr></thead><tbody>
      <tr><td>${sv.nom}</td><td class="num">${m2(sv.ht)} $ CA / mois hors taxes<br><span class="small muted">${m2(svTTC)} $ CA avec TPS et TVQ</span></td><td class="num">${mois} mois</td><td class="num">${m2(totSvCad)} $ CA</td></tr>
      <tr><td>${dn.nom}</td><td class="num">${m2(dn.ht)} $ US / an</td><td class="num">${ans} an${ans>1?'s':''}</td><td class="num">${m2(totDnUsd)} $ US</td></tr>
      <tr><td>Code, tests automatiques, API Légifrance</td><td colspan="3" class="muted">gratuits</td></tr>
    </tbody></table></div>
    <p class="small muted" style="margin:0">Prix réellement payés (factures), dans la devise où ils sont facturés. Chaque mois de serveur et chaque année de domaine commencés sont comptés en entier, comme ils sont facturés.</p></div>
  </section>`; };
V.legal = ()=>`<section class="view"><h1>Mentions légales &amp; contact</h1>
  <div class="grid2">
  <div class="panel"><h2>Éditeur</h2><ul style="margin:0;padding-left:18px;display:grid;gap:4px">
    <li>Site <strong>personnel, non commercial</strong> et open source, édité par un particulier.</li>
    <li><strong>Identité non publiée</strong> : l'éditeur ne souhaite pas qu'une quelconque organisation puisse l'identifier par ce site. Comme la loi le permet à un éditeur non professionnel (art. 6-III-2 de la LCEN), <strong>son identité a été communiquée à l'hébergeur</strong>.</li>
    <li><strong>Directeur de la publication</strong> : l'éditeur du site.</li>
    <li><strong>Contact</strong> : formulaire ci-dessous (aucune adresse email publiée).</li></ul></div>
  <div class="panel"><h2>Hébergeur</h2><ul style="margin:0;padding-left:18px;display:grid;gap:4px">
    ${SITE.hebergeur?[`<li><strong>${esc(SITE.hebergeur.nom)}</strong></li>`,`<li>${esc(SITE.hebergeur.adresse)}</li>`,
      SITE.hebergeur.telephone?`<li>Téléphone : ${esc(SITE.hebergeur.telephone)}</li>`:'',SITE.hebergeur.lieu?`<li>${esc(SITE.hebergeur.lieu)}</li>`:'',
      SITE.hebergeur.lien?`<li><a href="${esc(SITE.hebergeur.lien)}" target="_blank" rel="noopener">Mentions légales de l'hébergeur</a></li>`:''].join(''):'<li class="muted">Hébergeur non renseigné.</li>'}</ul></div></div>
  <div class="grid2">
  <div class="panel"><h2>Site indépendant</h2><ul style="margin:0;padding-left:18px;display:grid;gap:4px">
    <li><strong>Aucun lien</strong> avec Business France, le ministère de l'Europe et des Affaires étrangères ou toute autre administration.</li>
    <li>Les informations sont données <strong>à titre indicatif</strong> : seuls les textes publiés au Journal officiel font foi.</li>
    <li>Le site ne donne <strong>aucun conseil financier</strong> ni juridique.</li>
    <li>Une erreur ? Signalez-la via le formulaire, avec le numéro de version en bas de page.</li></ul></div>
  <div class="panel"><h2>Sources et licences</h2><ul style="margin:0;padding-left:18px;display:grid;gap:4px">
    <li><strong>Journal officiel</strong> (DILA, Légifrance) : <a href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/" target="_blank" rel="noopener">Licence Ouverte 2.0</a></li>
    <li><strong>Taux de change</strong> : Banque centrale européenne (réutilisation libre, source citée) ; complément Frankfurter</li>
    <li><strong>Indices des prix</strong> : Statistique Canada (Licence du gouvernement ouvert — Statistique Canada)</li>
    <li><strong>Code du site</strong> : logiciel libre, licence MIT</li>
    <li>Détail des sources et des calculs : <a href="/methodologie">Méthodologie et sources</a></li></ul></div></div>
  <div class="panel"><h2>Données personnelles</h2><ul style="margin:0;padding-left:18px"><li>Aucune donnée vendue ni utilisée à des fins publicitaires. Tout est expliqué dans la page <a href="/confidentialite">Confidentialité</a>.</li></ul></div>
  <div class="panel"><h2>Contact</h2>
  <form class="card" id="contact" novalidate><div class="field"><label for="cmail">Votre email (facultatif)</label><input type="email" id="cmail" maxlength="254" autocomplete="email" placeholder="pour recevoir une réponse"><span class="small muted">Utilisé seulement pour vous répondre, jamais affiché ni partagé ; supprimé 60 jours après.</span></div><div class="field"><label for="cmsg">Votre message</label><textarea id="cmsg" rows="4" style="background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:8px" maxlength="1000"></textarea><span class="small muted" id="ccount" style="justify-self:end">0 / 1000 caractères</span></div>
  <div class="field"><label>Vérification anti-robot</label>${captcha('ccap')}</div>
  <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><button class="btn" type="submit">Envoyer</button><span class="small muted">Un message toutes les 12 heures. Messages effacés après 60 jours.</span></div></form></div></section>`;
V.confidentialite = ()=>{ let off=false; try{ off=localStorage.getItem('noStats')==='1'; }catch(e){}
  return `<section class="view"><h1>Confidentialité</h1>
  <div class="grid2">
  <div class="panel"><h2>En bref</h2><ul style="margin:0;padding-left:18px;display:grid;gap:4px">
    <li><strong>Pas de compte</strong>, pas de publicité, pas de traceur publicitaire.</li>
    <li><strong>Aucune donnée vendue</strong> ni partagée avec un tiers.</li>
    <li>Les montants affichés viennent uniquement de <strong>données publiques</strong>.</li>
    <li>On ne garde que le nécessaire pour protéger le site, empêcher les abus et mesurer sa fréquentation.</li></ul></div>
  <div class="panel"><h2>Où sont les données</h2><ul style="margin:0;padding-left:18px;display:grid;gap:4px">
    <li>Sur un serveur situé <strong>au Canada</strong>, géré par l'éditeur du site.</li>
    <li>Aucune donnée n'est confiée à un service tiers.</li>
    <li>Données protégées et sauvegardées de façon sécurisée.</li></ul></div></div>
  <div class="panel"><h2>Ce que nous enregistrons</h2>
    <div class="tscroll"><table class="list atab"><thead><tr><th>Donnée</th><th>Pourquoi</th><th>Durée</th></tr></thead><tbody>
      <tr><td><strong>Données de protection</strong><br><span class="small muted">cookie technique et informations techniques rendues illisibles</span></td><td>Empêcher les votes multiples, les robots et les abus</td><td>30 jours</td></tr>
      <tr><td><strong>Mesure d'audience</strong><br><span class="small muted">aucun cookie : un identifiant anonyme est calculé à partir d'informations techniques brouillées (adresse IP et navigateur, qui ne sont pas conservées) et change chaque mois ; seul le réseau d'origine est gardé, tronqué (ex. 52.71.0.0 : il indique le fournisseur d'accès, pas la personne)</span></td><td>Statistiques de fréquentation : pages vues, nouveaux visiteurs et visiteurs qui reviennent dans le mois</td><td>Statistiques : 25 mois</td></tr>
      <tr><td><strong>Votes et propositions</strong></td><td>Afficher les votes et l'historique des valeurs</td><td>Conservés, sans lien avec vous après 30 jours</td></tr>
      <tr><td><strong>Message de contact</strong> (et votre email si vous le donnez)</td><td>Vous répondre</td><td>60 jours</td></tr>
      <tr><td><strong>Journaux de sécurité</strong></td><td>Détecter les attaques et corriger les erreurs</td><td>30 jours</td></tr>
    </tbody></table></div>
    <ul class="small muted" style="margin:0;padding-left:18px"><li>Ces données ne servent qu'à ces usages : jamais à de la publicité, jamais revendues, jamais croisées avec d'autres sources.</li><li>Les statistiques sont consultées sous forme de totaux.</li></ul></div>
  <div class="grid2">
  <div class="panel" id="optout"><h2>Mesure d'audience : votre choix</h2><ul style="margin:0;padding-left:18px;display:grid;gap:4px">
    <li>Vous pouvez refuser la mesure d'audience à tout moment : le site fonctionne de la même façon.</li>
    <li>Le signal « ne pas suivre » de votre navigateur est respecté.</li></ul>
    <p style="margin:0"><strong>État actuel :</strong> ${off?'<span class="pill">mesure d’audience refusée</span>':'<span class="pill ok">mesure d’audience acceptée</span>'}</p>
    <div><button class="btn ghost" type="button" id="toggleStats">${off?'Accepter la mesure d’audience':'Refuser la mesure d’audience'}</button></div></div>
  <div class="panel"><h2>Vos droits</h2><ul style="margin:0;padding-left:18px;display:grid;gap:4px">
    <li><strong>Accès, correction, effacement, opposition</strong> : via le <a href="/mentions-legales">formulaire de contact</a>.</li>
    <li>Effacer vos cookies coupe le lien avec vos votes et vos visites.</li>
    <li><strong>Responsable</strong> de la protection des renseignements personnels : l'éditeur du site, joignable par le formulaire de contact.</li>
    <li>Lois respectées : <strong>Loi 25</strong> (Québec), loi canadienne (LPRPDE) et <strong>RGPD</strong> pour les visiteurs en Europe.</li>
    <li>Réclamation possible auprès de la Commission d'accès à l'information du Québec ou, en Europe, de la CNIL.</li></ul></div></div>
  <p class="small muted" style="margin:0">Page mise à jour le 28/11/2026 · version 1.2.0 du site.</p></section>`; };

/* ---------- Barre d'état du module : fraîcheur des données ---------- */
const fmtDay = d => { const [y,m,dd]=d.split('-'); return `${dd}/${m}/${y}`; };
const CPI_SERIES = {'CANADA (AUTRES VILLES)':'Montréal (Québec)','CANADA (OTTAWA, MONCTON)':'Ottawa-Gatineau, partie ontarienne','CANADA (TORONTO)':'Toronto (Ontario)','CANADA (VANCOUVER)':'Vancouver (C.-B.)'};
// Dernier arrêté trimestriel importé (si celui d'oct. n'est pas encore publié : celui de juil.)
let ARRETES = {cur:null, prev:null};   // derniers arrêtés trimestriels, fixés au chargement
const lastArrete = ()=> st.noJO ? ARRETES.prev : ARRETES.cur;
function quarterStart(m){ const mm=+m.slice(5); return m.slice(0,5)+String(Math.floor((mm-1)/3)*3+1).padStart(2,'0'); }
function statusBar(){
  const z=st.zone, rows=seriesFor(z); if(!rows) return '';
  const today=new Date(), todayS=today.toISOString().slice(0,10);
  const qs=quarterStart(CURRENT_MONTH);
  const qRow=rows.find(r=>r.m===qs);
  const missing = st.alert || !qRow || qRow.total==null;                       // valeur du trimestre en cours absente
  const lastValQ = missing ? quarterStart([...rows].reverse().find(r=>r.m<qs&&r.total!=null).m) : qs;
  const dev=rows.at(-1).dev, euro=dev==='EUR';
  // Mis à jour dynamiquement : en cas de panne d'une source, la dernière valeur réellement récupérée est affichée, en rouge
  const fxLast=[...rows].reverse().find(r=>r.fx!=null);
  const mPrev=H.months.at(-2);
  const fxOff=[...rows].reverse().find(r=>r.fx!=null&&!r.fxProv);                // dernière moyenne mensuelle officielle
  const fxMiss=rows.filter(r=>r.fx==null&&r.m<=CURRENT_MONTH&&(!fxOff||r.m>fxOff.m)).map(r=>r.m);
  const fxLate=!euro && fxMiss.length>0;
  // Valeur + période de la moyenne (mois en cours : du 1er au dernier cours publié)
  const fxPeriod = r => r.fxProv ? `moyenne ${provRange()}` : `moyenne ${deM(r.m)}`;
  const fxTxt = euro ? 'Zone euro : pas de conversion'
    : !fxLast ? 'Non disponible'
    : `1 € = ${fmt(fxLast.fx,4)} ${curLabel(dev)} · ${fxPeriod(fxLast)}${fxLate?` — ⚠ ${fxMiss.map(m=>m===CURRENT_MONTH?'cours de '+mlabel(m)+' non récupérés':'moyenne '+deM(m)+' non récupérée').join(', ')}`:''}`;
  const city=CPI_SERIES[z], cl=city?D.cpiLast[city]:null;
  const cpiLastRow=[...rows].reverse().find(r=>r.cpi!=null);
  const cpiMiss=rows.filter(r=>r.cpi==null&&cpiLastRow&&r.m>cpiLastRow.m&&cpiKind(r.m)==='miss').map(r=>r.m);
  const cpiLate=!!cl && cpiMiss.length>0;
  const cpiTxt = !cl ? 'Non disponible pour cette zone'
    : cpiLate ? `${mlabel(cpiLastRow.m)} (${(CPI_CITIES[z]||[''])[0]}) — ⚠ ${cpiMiss.map(m=>'indice '+deM(m)+' (publié mi-'+MONTHS_FR[(+m.slice(5))%12]+') non récupéré').join(', ')}`
    : `${mlabel(cl.m)} · publié le ${fmtDay(cl.pub)} (${(CPI_CITIES[z]||[''])[0]})`;
  // Barre compacte : une pastille par donnée (point vert = à jour, orange = valeur communautaire, rouge = manquante) ;
  // le texte complet est dans l'infobulle de chaque pastille, et tout le détail sous « Détails »
  const indSt = missing?'bad':qRow?.community?'mid':'ok';
  const indTip = missing?`L'indemnité du ${d1(qs)} manque${st.noJO?' (arrêté pas encore publié)':''}. Montant affiché : celui du ${d1(lastValQ)}. <a href="/proposer">Proposez-la</a>`
    : qRow?.community?`Arrêté du ${d1(qs)} pas encore publié : valeur communautaire validée par un admin. <a href="/proposer">Voir les votes</a>`
    : `Indemnité en vigueur depuis le ${d1(lastValQ)} (dernier arrêté).`;
  const pill=(k,v,s,tipHtml)=>`<span class="sp ${s}"><span class="dot" aria-hidden="true"></span><span class="k">${k}</span> <strong>${v}</strong>${tipHtml?tip(tipHtml):''}</span>`;
  // Date de référence du site : temps universel (UTC) ; la date de l'appareil du visiteur est indiquée quand elle diffère
  const p2=n=>String(n).padStart(2,'0'), localS=`${today.getFullYear()}-${p2(today.getMonth()+1)}-${p2(today.getDate())}`;
  let tz=''; try{ tz=Intl.DateTimeFormat().resolvedOptions().timeZone||''; }catch(e){}
  const ville=tz.split('/').pop().replace(/_/g,' ');
  const todayHtml=`${fmtDay(todayS)} UTC`+(localS!==todayS?` <span class="muted small">· ${fmtDay(localS)} chez vous</span>`:'');
  const todayTip=`Date en <strong>temps universel (UTC)</strong> : c'est la référence de toutes les dates du site (valeurs, collectes, journaux). Il est ${p2(today.getUTCHours())} h ${p2(today.getUTCMinutes())} UTC.<br>Chez vous${ville?` (${esc(ville)})`:''} : ${today.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}, ${p2(today.getHours())} h ${p2(today.getMinutes())} (heure de votre appareil).`;
  const bar = `<div class="sbar" role="status">
    ${pill('Aujourd\'hui',todayHtml,'none',todayTip)}
    ${pill('Indemnité',d1(lastValQ),indSt,indTip)}
    ${euro?pill('Change','zone euro','none',''):pill(`Taux ${dev}`,fxLast?fmt(fxLast.fx,4):'—',fxLate?'bad':'ok',fxTxt)}
    ${cl?pill('Indice coût de la vie · '+esc((CPI_CITIES[z]||[''])[0]),mlabel(cpiLastRow.m),cpiLate?'bad':'ok',cpiTxt):pill('Indice coût de la vie','non suivi pour cette zone','none','Coût de la vie non disponible pour cette zone.')}
    <button type="button" class="link" id="sbToggle" aria-expanded="${!!st.sbOpen}">${st.sbOpen?'Masquer':'Détails'}</button></div>`;
  if(!st.sbOpen) return bar;
  // Détail : indemnité (tableau), chaque devise (dernier cours au jour près + valeur), chaque indice de ville (valeur)
  const curOrder=[dev,'USD','GBP','CAD',...Object.keys(H.fx).sort()].filter((c,i,a)=>c&&c!=='EUR'&&H.fx[c]&&a.indexOf(c)===i);
  const iCur=H.months.indexOf(CURRENT_MONTH), LF=id=>`https://www.legifrance.gouv.fr/jorf/id/${id}`;
  const fxRows=curOrder.map(c=>{
    const arr=H.fx[c], src=c==='CAD'||H.fxSrc[c]==='BCE'?'BCE':'Frankfurter';
    let lo=null; for(let i=iCur-1;i>=0;i--) if(arr[i]!=null){lo=i;break;}
    const fail = st.fail, hasCur = arr[iCur]!=null && !fail;
    const day = hasCur ? fmtDay(H.prov.to) : fail ? `<span class="late">⚠ aucun cours depuis le 01/${CURRENT_MONTH.slice(5)}/${CURRENT_MONTH.slice(0,4)}</span>` : '<span class="muted">moyenne mensuelle seulement</span>';
    const v = hasCur ? arr[iCur] : (lo!=null?arr[lo]:null), per = hasCur ? provRange() : (lo!=null?'moyenne '+deM(H.months[lo]):'—');
    return `<tr class="${c===dev?'cur':''}"><td>${c}${c===dev?' <span class="small muted">(zone choisie)</span>':''}</td><td>${day}</td><td class="r num">${v==null?'—':fmt(v,4)}</td><td class="small">${per}</td><td>${src}</td></tr>`; }).join('');
  const cpiRows=Object.entries(D.cpiLast).map(([n,v])=>{
    // État réel de chaque ville (panne comprise) : dernier indice effectivement récupéré
    const zk=Object.keys(CPI_SERIES).find(k=>CPI_SERIES[k]===n), sr=zk?seriesFor(zk):null, lr=sr?[...sr].reverse().find(r=>r.cpi!=null):null;
    const cur = zk===z ? 'cur' : '';
    if(lr&&lr.m<v.m){ const ms=sr.filter(r=>r.m>lr.m&&r.cpi==null&&cpiKind(r.m)==='miss').map(r=>mlabel(r.m)).join(', ');
      return `<tr class="${cur}"><td>${esc(n)}</td><td class="late">${mlabel(lr.m)} — ⚠ ${ms} non récupéré</td><td class="r num">${fmt(lr.cpi,1)}</td><td>—</td><td>nouvel essai demain</td></tr>`; }
    const [y,m]=v.m.split('-').map(Number); const nx=m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,'0')}`;
    return `<tr class="${cur}"><td>${esc(n)}${cur?' <span class="small muted">(zone choisie)</span>':''}</td><td>${mlabel(v.m)}</td><td class="r num">${lr?fmt(lr.cpi,1):'—'}</td><td>${fmtDay(v.pub)}</td><td>${mlabel(nx)} (vers le 20/${String((m+1)%12+1).padStart(2,'0')})</td></tr>`; }).join('');
  // Indemnité de la zone choisie : part géographique (dernier arrêté) et part fixe (décrets), dates et liens
  const la=lastArrete(), cr=[...rows].reverse().find(r=>r.total!=null), nextQ=(()=>{const [y,m]=qs.split('-').map(Number); return m===10?`${y+1}-01`:`${y}-${String(m+3).padStart(2,'0')}`})();
  const indRows = `
    <tr class="cur"><td><strong>Part géographique</strong>${cr?.community?' <span class="pill mid">communauté</span>':''}</td><td class="r num">${cr?fmt(cr.geo)+' €':'—'}</td><td>${cr?.community?d1(qs):fmtDay(la.effet)}</td><td>${cr?.community?'—':fmtDay(la.publi)}</td><td>${cr?.community?'<a href="/proposer">valeur communautaire (voir les votes)</a>':`<a href="${LF(la.id)}" target="_blank" rel="noopener">arrêté du ${fmtDay(la.signe)}</a>`}</td></tr>
    <tr><td><strong>Part fixe</strong></td><td class="r num">${fmt(fixeAt(CURRENT_MONTH))} €</td><td>01/01/2024</td><td>—</td><td>${fixeLinks(CURRENT_MONTH,true)}</td></tr>
    <tr><td><strong>Total</strong></td><td class="r num"><strong>${cr?fmt(cr.total)+' €':'—'}</strong></td><td colspan="3" class="small muted">${esc(zoneLabel(z))} · ${st.mode.toUpperCase()}</td></tr>
    ${st.noJO?`<tr><td class="late">⚠ Arrêté du ${d1(qs)}</td><td class="late" colspan="4">pas encore publié au Journal officiel (vérifié chaque jour)</td></tr>`:''}
    <tr><td>Prochain arrêté</td><td class="r muted">—</td><td>${d1(st.noJO?qs:nextQ)}</td><td class="small muted">attendu 2 à 3 semaines avant</td><td class="small muted">Journal officiel</td></tr>`;
  return bar + `<div class="sbdetail">
    <div><h3>Indemnité</h3>
      <div class="tscroll"><table class="list"><thead><tr><th></th><th class="r">Montant</th><th>En vigueur le</th><th>Publié le</th><th>Source</th></tr></thead><tbody>${indRows}</tbody></table></div></div>
    <div><h3>Taux de change (${curOrder.length} devises)</h3>
      <div class="tscroll" style="max-height:260px;overflow-y:auto"><table class="list"><thead><tr><th>Devise</th><th>Dernier cours récupéré</th><th class="r">1 € =</th><th>Moyenne utilisée</th><th>Source</th></tr></thead><tbody>${fxRows}</tbody></table></div></div>
    <div><h3>Indice du coût de la vie (par ville)</h3>
      <div class="tscroll"><table class="list"><thead><tr><th>Ville</th><th>Dernier indice</th><th class="r">Valeur (2002 = 100)</th><th>Publié le</th><th>Prochain attendu</th></tr></thead><tbody>${cpiRows}</tbody></table></div></div></div>`;
}
document.addEventListener('click',e=>{ if(e.target.closest('#sbToggle')){ st.sbOpen=!st.sbOpen; $('#statusbar').innerHTML=statusBar(); } });

/* ---------- Rendu & événements ---------- */
/* Blocage complet du site (48 h) après plusieurs connexions admin échouées depuis la même connexion.
   Sur le vrai site, c'est le serveur qui renvoie uniquement cette page (code 403 + en-tête Retry-After) pour toute adresse. */
const BLOCK_AFTER=5;   // maquette ; en production, seuil et fenêtre sont des réglages secrets du serveur
function showBlock(){
  $('#blocked')?.remove(); const d=document.createElement('div'); d.id='blocked'; d.setAttribute('role','alertdialog'); d.setAttribute('aria-labelledby','blkT');
  const end=new Date(st.blockedUntil), p=n=>String(n).padStart(2,'0');
  d.innerHTML=`<div class="blkbox"><div style="font-size:2rem" aria-hidden="true">⛔</div><h1 id="blkT" style="margin:0">Accès bloqué pendant 48 heures</h1>
    <p style="margin:0">Trop de tentatives de connexion échouées ont été détectées depuis votre appareil. Pour protéger le site, son accès est bloqué.</p>
    <p class="eyebrow" style="margin:8px 0 0">Fin du blocage dans</p><div id="blkC" class="num" style="font-size:2.2rem;font-weight:800" aria-live="off">—</div>
    <p class="small muted" style="margin:0">Le ${p(end.getDate())}/${p(end.getMonth()+1)}/${end.getFullYear()} à ${p(end.getHours())}:${p(end.getMinutes())} (heure de votre appareil).</p>
    <ul class="small muted" style="margin:6px 0 0;padding-left:18px;text-align:left"><li>Ce délai ne peut pas être raccourci.</li></ul></div>`;
  document.body.appendChild(d);
  const tick=()=>{ const ms=st.blockedUntil-Date.now(), c=$('#blkC'); if(!c) return clearInterval(iv); if(ms<=0){ d.remove(); return clearInterval(iv); }
    const t=Math.floor(ms/1000); c.textContent=`${Math.floor(t/3600)} h ${p(Math.floor(t%3600/60))} min ${p(t%60)} s`; };
  tick(); const iv=setInterval(tick,1000);
}

/* ---------- Mesure d'audience : page vue à chaque page (navigation en #…), et actions importantes ---------- */
const PAGE_NOMS={accueil:'Accueil', roadmap:'Nouveautés et feuille de route', remuneration:'Pouvoir d’achat VI · Vue d’ensemble', historique:'Pouvoir d’achat VI · Historique',
  pays:'Pouvoir d’achat VI · Grille des indemnités', comparaison:'Pouvoir d’achat VI · Comparaison entre pays', proposer:'Pouvoir d’achat VI · Proposer une valeur',
  methodo:'Pouvoir d’achat VI · Méthodologie', indices:'Pouvoir d’achat VI · Méthodologie', legal:'Mentions légales', confidentialite:'Confidentialité', dons:'Dons pour l’hébergement'};
let statsFile=[], statsPret=false, statsDerniere='';
function statsRefus(){ try{ return localStorage.getItem('noStats')==='1'; }catch(e){ return false; } }
function statsCharger(){
  const c=window.SITE_STATS; if(!c||!c.websiteId||statsRefus()||document.getElementById('umami-js')) return;
  const s=document.createElement('script'); s.id='umami-js'; s.defer=true; s.src=c.hostUrl+'/script.js';
  s.dataset.websiteId=c.websiteId; s.dataset.hostUrl=location.origin+c.hostUrl; s.dataset.autoPageview='false'; s.dataset.excludeSearch='true'; s.dataset.excludeHash='true';
  // Réseau d'origine tronqué (ex. 52.71.0.0 : indique le fournisseur — Amazon, Google, un FAI —, jamais la personne),
  // attaché à la visite dans Umami (onglet Sessions) pour distinguer robots et humains
  s.onload=()=>{ statsPret=true; if(c.reseau){ try{ window.umami.identify({'réseau':c.reseau}); }catch(e){} } statsFile.splice(0).forEach(f=>f()); };
  document.head.appendChild(s);
}
function statsEnvoyer(f){ if(!window.SITE_STATS||statsRefus()) return; if(statsPret&&window.umami) f(); else { statsFile.push(f); statsCharger(); } }
function trackPage(view){
  if(view.startsWith('admin')||statsDerniere===view) return; statsDerniere=view;   // l'espace admin n'est jamais compté
  const t=PAGE_NOMS[view]||view; statsEnvoyer(()=>window.umami.track(p=>({...p, url:'/'+view, title:t})));
}
function trackEvent(nom,data){ if(location.hash.startsWith('#admin')) return; statsEnvoyer(()=>window.umami.track(nom,data||{})); }
/* Comportement humain : temps passé page visible + au moins une interaction (clic, touche, défilement, toucher).
   Envoie « Visiteur actif · 30 s » puis « Visiteur actif · 3 min » (une fois chacun par visite). Un robot charge la page
   et repart aussitôt, sans interaction : ces actions permettent de distinguer les visites humaines dans Umami, et
   allongent la durée de visite mesurée (calculée entre la première et la dernière action d'une visite). */
const ACTIF_PALIERS=[[30,'Visiteur actif · 30 s'],[180,'Visiteur actif · 3 min']];
let actifSec=0, actifInter=false, actifEnvoyes=0;
if(window.SITE_STATS){
  ['pointerdown','keydown','scroll','touchstart'].forEach(ev=>addEventListener(ev,()=>{ actifInter=true; },{passive:true}));
  setInterval(()=>{ if(document.visibilityState!=='visible') return; actifSec+=5;
    while(actifInter && actifEnvoyes<ACTIF_PALIERS.length && actifSec>=ACTIF_PALIERS[actifEnvoyes][0]){ trackEvent(ACTIF_PALIERS[actifEnvoyes][1]); actifEnvoyes++; } },5000);
}
const ROUTES={"accueil": "/", "remuneration": "/pouvoir-achat", "historique": "/historique", "pays": "/grille-indemnites", "comparaison": "/comparaison-pays", "proposer": "/proposer", "methodo": "/methodologie", "indices": "/villes-cout-de-la-vie", "roadmap": "/nouveautes", "dons": "/dons", "legal": "/mentions-legales", "confidentialite": "/confidentialite"};
const VUE_DE_CHEMIN=Object.fromEntries(Object.entries(ROUTES).map(([v,p])=>[p,v]));
// Page affichée : « #… » (espace admin, anciens liens) sinon l'adresse de la page
function vueCourante(){ const h=location.hash.slice(1); if(h) return h; return VUE_DE_CHEMIN[location.pathname.replace(/\/+$/,'')||'/']||'accueil'; }
// Ancien lien « #historique » → adresse propre « /historique »
function normaliserAdresse(){ const h=location.hash.slice(1); if(h&&ROUTES[h]) history.replaceState(null,'',ROUTES[h]+location.search); }
normaliserAdresse();
// Liens internes : changement de page sans recharger le site
document.addEventListener('click',e=>{ const a=e.target.closest?.('a[href^="/"]'); if(!a||a.target||e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey) return;
  const p=a.getAttribute('href'); if(!(p in VUE_DE_CHEMIN)) return; e.preventDefault();
  if(location.pathname!==p||location.hash) history.pushState(null,'',p); st.drawer=null; window.scrollTo(0,0); render(); });
function render(){
  const v=vueCourante(); const view=V[v]?v:'accueil';
  const inModule=['remuneration','historique','pays','comparaison','proposer','methodo','indices'].includes(view);
  $('#modnav').hidden=!inModule;
  const mn=inModule?'Pouvoir d’achat VI':view==='admin-pouvoir'?'Administration · Pouvoir d’achat VI':view==='admin-stats'?'Administration · Statistiques':view==='admin-messages'?'Administration · Messages':view==='admin'?'Administration':view==='roadmap'?'Nouveautés et feuille de route':view==='dons'?'Dons pour l’hébergement':'';
  $('#modname').textContent=mn; $('#modname').hidden=!mn;
  $('#statusbar').innerHTML = inModule ? statusBar() : '';
  const navView = view==='indices' ? 'methodo' : view;   // le tableau des villes fait partie de la Méthodologie
  document.querySelectorAll('nav.main a').forEach(a=>{ if(a.getAttribute('href')===(ROUTES[navView]||'#'+navView)) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  $('#app').innerHTML=V[view]();
  if(view==='comparaison') mountComparaison();
  document.title=(view==='accueil'?SITE.nom+' · '+(SITE.sousTitre||''):(PAGE_NOMS[view]||'Administration')+' · '+SITE.nom);
  trackPage(view);
}
window.addEventListener('hashchange',()=>{normaliserAdresse();st.drawer=null;window.scrollTo(0,0);render();});
window.addEventListener('popstate',()=>{st.drawer=null;render();});
document.addEventListener('click',e=>{
  const t=e.target;
  if(t.closest('#demoAlert')){ st.alert=!st.alert; location.hash='#remuneration'; render(); return; }
  if(t.closest('#demoBlock')){ st.blockedUntil=Date.now()+48*3600e3; showBlock(); return; }
  if(t.closest('#unblock')){ st.blockedUntil=0; $('#blocked')?.remove(); return; }
  if(t.closest('#demoJO')){ st.noJO=!st.noJO; st.zone='CANADA (AUTRES VILLES)'; st.mode='vie'; t.closest('#demoJO').textContent=st.noJO?'Rétablir l\'arrêté d\'oct. 2026':'Simuler : arrêté d\'oct. 2026 pas encore publié'; if(!['remuneration','historique'].includes(location.hash.slice(1))) location.hash='#remuneration'; render(); toast(st.noJO?'Arrêté non publié : toutes les zones passent sur la valeur communautaire validée (ex. Montréal) ou, à défaut, restent sur le montant de juil.':'Arrêté publié : les valeurs officielles remplacent partout les valeurs communautaires.'); return; }
  if(t.closest('#demoFail')){ st.fail=!st.fail; t.closest('#demoFail').textContent=st.fail?'Rétablir les sources':'Simuler une panne des sources (nov. 2026)'; if(!['remuneration','historique'].includes(location.hash.slice(1))) location.hash='#remuneration'; render(); toast(st.fail?'Panne simulée en novembre : les cours de change de nov. et l\'indice des prix d\'oct. (publié le 16 nov.) n\'ont pas pu être récupérés.':'Sources rétablies : les données de novembre sont complétées automatiquement.'); return; }
  const dz=t.closest('[data-zone]'); if(dz){ st.zone=dz.dataset.zone; st.sinceMonth=null; render(); return; }
  const tb=t.closest('.tipw>.tip');
  if(tb){ const box=tb.nextElementSibling, open=box.hidden; document.querySelectorAll('.tipw>.tipbox').forEach(b=>{b.hidden=true;b.previousElementSibling.setAttribute('aria-expanded','false');}); box.hidden=!open; tb.setAttribute('aria-expanded',String(open)); return; }
  if(!t.closest('.tipw')) document.querySelectorAll('.tipw>.tipbox').forEach(b=>{b.hidden=true;b.previousElementSibling.setAttribute('aria-expanded','false');});
  if(t.closest('#lkBtn')){ const b=t.closest('#lkBtn'), d=$('#lkDlg'); st.lkA=+b.dataset.a; st.lkB=+b.dataset.b; d.innerHTML=lkHTML(); d.showModal(); return; }
  if(t.closest('[data-close]')){ t.closest('dialog')?.close(); return; }
  if(t.tagName==='DIALOG'){ t.close(); return; }   // clic à côté de la fenêtre
  const dr=t.closest('[data-drawer]'); if(dr){ st.drawer=dr.dataset.drawer||null; render(); return; }
  if(t.closest('#tipBtn')){ const b=t.closest('#tipBtn'); const ex=b.parentElement.querySelector('.tipbox'); if(ex){ex.remove();b.setAttribute('aria-expanded','false');return;}
    const box=document.createElement('div'); box.className='tipbox'; box.innerHTML='Les données de variation de l\'indemnité sont difficiles à obtenir. L\'arrêté est publié au Journal officiel (<a href="https://www.legifrance.gouv.fr/jorf/id/'+lastArrete().id+'" target="_blank" rel="noopener">voir le dernier arrêté</a>), mais l\'indemnité est modifiée tous les 3 mois et les détails ne sont pas toujours publiés. C\'est pourquoi les visiteurs peuvent proposer des valeurs : la plus votée est validée régulièrement par l\'administrateur.'; b.parentElement.appendChild(box); b.setAttribute('aria-expanded','true'); return; }
  const mt=t.closest('[data-mt]'); if(mt){ st.mf.t=mt.dataset.mt; render(); return; }
  const pm=t.closest('[data-pm]'); if(pm){ st.pm=pm.dataset.pm; render(); return; }
  const pt=t.closest('[data-pt]'); if(pt){ st.ptype=pt.dataset.pt; render(); return; }
  if(t.closest('#msgReload')){ loadMsgs(true); render(); return; }
  const dm=t.closest('[data-delmsg]'); if(dm){ if(!confirm('Supprimer définitivement ce message ?')) return;
    postJson('/api/admin/messages',{id:+dm.dataset.delmsg},'DELETE').then(r=>{ toast(r.ok?'Message supprimé.':(r.error||'Suppression impossible.')); loadMsgs(true); render(); }).catch(()=>toast('Suppression impossible.')); return; }
  const vb=t.closest('[data-up],[data-down]'); if(vb){ const up=vb.dataset.up!=null, p=st.proposals[+(up?vb.dataset.up:vb.dataset.down)];
    const sens=(up&&p.my===1)||(!up&&p.my===-1)?0:(up?1:-1), body={id:p.id,sens}; if(captchaOk('vcap')) body.altcha=captchaVal('vcap');
    apiPost('/api/propositions/vote',body).then(d=>{ if(d.blocked) return blockNow(d.until); appliquerPropositions(d);
      if(d.ok) toast(sens===0?'Vote annulé : vous pouvez le placer ailleurs.':`Vote ${up?'positif':'négatif'} enregistré. Il vous reste ${up?st.quota.up:st.quota.down} vote(s) ${up?'positif':'négatif'}(s) pour 24 h.`);
      else { toast(d.error||'Vote impossible.'); if(d.captcha) captchaReset('vcap'); } render(); }).catch(()=>toast('Vote impossible : pas de réponse du serveur.')); return; }
  if(t.closest('#resetVotes')){ fetch('/api/propositions/vote',{method:'DELETE',credentials:'same-origin'}).then(r=>r.json()).then(d=>{ appliquerPropositions(d); toast('Vos votes ont été retirés.'); render(); }).catch(()=>toast('Action impossible : pas de réponse du serveur.')); return; }
  const moderer=(el,action,msg)=>{ const p=st.proposals[+el.dataset[{valider:'val',devalider:'unval',rejeter:'rej',rouvrir:'reopen'}[action]]];
    apiPost('/api/admin/propositions',{id:p.id,action}).then(async d=>{ if(d.blocked) return blockNow(d.until); if(d.ok){ await loadPropositions(); await loadAdmin(); toast(msg); } else toast(d.error||'Action impossible.'); render(); }).catch(()=>toast('Action impossible : pas de réponse du serveur.')); };
  const va=t.closest('[data-val]'); if(va){ moderer(va,'valider','Valeur validée : les autres propositions de cette partie, zone et date sont rejetées automatiquement.'); return; }
  const uv=t.closest('[data-unval]'); if(uv){ moderer(uv,'devalider','Valeur dévalidée : elle repasse en attente, avec les propositions rejetées automatiquement.'); return; }
  const ro=t.closest('[data-reopen]'); if(ro){ moderer(ro,'rouvrir','Proposition remise en attente.'); return; }
  const rj=t.closest('[data-rej]'); if(rj){ moderer(rj,'rejeter','Proposition rejetée.'); return; }
  if(t.closest('#capRun')){ apiPost('/api/admin/propositions/nettoyer',{}).then(async d=>{ if(d.blocked) return blockNow(d.until); await loadPropositions(); toast(d.retirees?`Nettoyage : ${d.retirees} proposition(s) retirée(s).`:'Nettoyage : rien à retirer.'); render(); }).catch(()=>toast('Nettoyage impossible : pas de réponse du serveur.')); return; }
  const hc=t.closest('[data-hchk]'); if(hc){ const k=hc.dataset.hchk; st.hDet[k]=!st.hDet[k]; render(); return; }
  const hr=t.closest('[data-hrest]'); if(hr){ const h=st.hist[+hr.dataset.hrest];
    apiPost('/api/admin/saisie',{t:h.t,z:h.z,m:h.m,mode:st.mode,value:h.old,src:`retour à la valeur du ${h.at.slice(0,10)}`,rest:true}).then(async r=>{
      if(r.blocked) return blockNow(r.until); await reloadAll(); toast('Valeur rétablie : une nouvelle ligne est ajoutée à l’historique.'); }); return; }
  const im=t.closest('[data-imp]'); if(im){ if(im.disabled) return; const lab=im.textContent; im.disabled=true; im.textContent='Import en cours… (jusqu’à quelques minutes)'; apiPost('/api/admin/collecte',{quoi:im.dataset.imp}).then(async d=>{ if(d.blocked) return blockNow(d.until); if(!d.resultats){ toast('Import impossible : '+(d.error||'erreur')); im.disabled=false; im.textContent=lab; return; } await reloadAll(); toast('Import terminé : '+d.resultats.map(x=>x.source+(x.ok?' ✓':' ✗ ('+x.erreur+')')).join(' · ')+'. Détail dans le journal des requêtes.'); }).catch(()=>{ toast('Import impossible : pas de réponse du serveur.'); im.disabled=false; im.textContent=lab; }); return; }
  if(t.closest('#toggleStats')){ let off=false; try{ off=localStorage.getItem('noStats')==='1'; localStorage.setItem('noStats', off?'0':'1'); }catch(e){} if(!off){ statsFile=[]; statsPret=false; document.getElementById('umami-js')?.remove(); try{ delete window.umami; }catch(e){} } toast(off?'Mesure d’audience acceptée. Merci !':'Mesure d’audience refusée : vos visites ne sont plus comptées.'); render(); return; }
  const ap=t.closest('[data-apid]'); if(ap){ const k=ap.dataset.apid; st.apiDet[k]=!st.apiDet[k]; render(); return; }
  const apg=t.closest('[data-apg]'); if(apg){ apiFilters().g=apg.dataset.apg; apiSave(); render(); return; }
  const amo=t.closest('[data-apmore]'); if(amo){ const k=amo.dataset.apmore; st.apiMore[k]=!st.apiMore[k]; render(); return; }
  if(t.closest('#logout')){ apiPost('/api/admin/logout',{}).then(()=>{ st.admin=false; st.hist=null; JL=null; render(); }); return; }
  if(t.closest('#pdfRecap')){ trackEvent('Téléchargement PDF récapitulatif',{zone:st.zone,mode:st.mode}); pdfRecap(); return; }
  if(t.closest('#cmpPickBtn')){ st.cmpPickOpen=!st.cmpPickOpen; $('#cmpPick').hidden=!st.cmpPickOpen; t.closest('#cmpPickBtn').setAttribute('aria-expanded',String(st.cmpPickOpen)); return; }
  const cs=t.closest('[data-cmpsel]'); if(cs){ if(cs.dataset.cmpsel==='none'){ st.cmpSel=[]; st.cmpSelManual=true; } else { st.cmpSel=null; st.cmpSelManual=false; } cmpDrawChart(); return; }
  if(st.cmpPickOpen&&!t.closest('.cmppick')){ st.cmpPickOpen=false; const p=$('#cmpPick'); if(p) p.hidden=true; }
  const dlb=t.closest('[data-dl]'); if(dlb){ trackEvent(dlb.dataset.dl==='all'?'Téléchargement CSV (toutes les zones)':'Téléchargement CSV (une zone)',{zone:st.zone}); downloadCSV(dlb.dataset.dl==='all'); return; }
});
let apQT=null; document.addEventListener('input',e=>{ if(e.target.id!=='apQ') return; clearTimeout(apQT); apQT=setTimeout(()=>{ apiFilters().q=e.target.value||undefined; apiSave(); render(); const i=$('#apQ'); if(i){ i.focus(); i.setSelectionRange(i.value.length,i.value.length); } },300); });
document.addEventListener('input',e=>{ if(e.target.id!=='cmpQ') return; st.cmpQ=e.target.value; cmpDrawChart(); const i=$('#cmpQ'); if(i){ i.focus(); i.setSelectionRange(i.value.length,i.value.length); } });
document.addEventListener('toggle',e=>{ if(e.target.classList&&e.target.classList.contains('apizone')){ (st.apiOpen||(st.apiOpen={}))[e.target.dataset.ak]=e.target.open; return; } if(e.target.id==='villes'){ st.openVilles=e.target.open; e.target.querySelector('summary').textContent=e.target.open?'Masquer le tableau':'Afficher la ville utilisée pour chaque zone'; } },true);
document.addEventListener('change',e=>{
  if(e.target.id==='since'){ st.sinceMonth=e.target.value||null; render(); }
  if(['afType','afZone','afEff','afSt'].includes(e.target.id)){ st.af={...(st.af||{}), [{afType:'type',afZone:'z',afEff:'eff',afSt:'s'}[e.target.id]]: e.target.value||undefined}; render(); }
  if(['hfType','hfZone','hfOrig','hfChk','hfN'].includes(e.target.id)){ const k={hfType:'t',hfZone:'z',hfOrig:'o',hfChk:'c',hfN:'n'}[e.target.id]; st.hf={...(st.hf||{}), [k]: e.target.value||undefined}; if(k==='t') delete st.hf.z; render(); }
  if(e.target.id==='admCpiN'){ st.cpiN=e.target.value; render(); }
  const AK={apType:'type'}; if(AK[e.target.id]){ apiFilters()[AK[e.target.id]]=e.target.value||undefined; apiSave(); render(); }
  if(e.target.id==='apFail'){ apiFilters().fail=e.target.checked||undefined; apiSave(); render(); }
  if(e.target.id==='mzone'){ st.mf.z=e.target.value; render(); }
  if(e.target.id==='mmonth'&&e.target.value){ st.mf.m=e.target.value; render(); }
  if(e.target.id==='admCur'){ st.admCur=e.target.value; render(); }
  if(e.target.id==='paEnd'){ st.paEnd=e.target.value===CURRENT_MONTH?null:e.target.value; render(); }
  if(e.target.id==='lkA'||e.target.id==='lkB'){ st[e.target.id]=+e.target.value; $('#lkDlg').innerHTML=lkHTML(); $('#'+e.target.id)?.focus(); }
  if(['vfType','vfZone','vfEff'].includes(e.target.id)){ st.vf={...(st.vf||{}), [{vfType:'type',vfZone:'z',vfEff:'eff'}[e.target.id]]: e.target.value||undefined}; render(); }
  if(e.target.id==='pmonth'){ st.pmo=e.target.value; render(); }
  if(e.target.id==='stP'){ st.stP=e.target.value; render(); }
  if(e.target.id==='hA'||e.target.id==='hB'){ st[e.target.id]=e.target.value; render(); }
  if(e.target.id==='cmpV') trackEvent('Comparaison : valeur choisie',{valeur:e.target.value});
  if(['cmpV','cmpM','cmpN','cmpA','cmpB'].includes(e.target.id)){ st[e.target.id.replace('cmp','cmp')]=e.target.value; if(e.target.id!=='cmpM'&&e.target.id!=='cmpN') st.cmpSelManual=false; if(e.target.id==='cmpV') st.cmpM=null;
    if(e.target.id==='cmpA'||e.target.id==='cmpB') cmpDrawChart(); else render(); }
  if(e.target.dataset&&e.target.dataset.cmpz){ const s=new Set(st.cmpSel||[]); e.target.checked?s.add(e.target.dataset.cmpz):s.delete(e.target.dataset.cmpz); st.cmpSel=[...s]; st.cmpSelManual=true; cmpDrawChart(false); }
  if(e.target.id==='ps'){ st.ps=e.target.value; render(); }
  if(e.target.id==='pzone'){ st.pz=e.target.value; render(); }
  if(e.target.id==='drange'){ st.drange=e.target.value; render(); }
  if(e.target.id==='cur'){ st.hcur=e.target.value; render(); }
});
document.addEventListener('input',e=>{
  if(e.target.id==='cmsg'){ const n=e.target.value.length, c=$('#ccount'); c.textContent=`${n} / 1000 caractères`; c.classList.toggle('late', n>=1000); }
  if(e.target.id==='pq'){ st.pq=e.target.value; const pos=e.target.selectionStart; render(); const i=$('#pq'); i.focus(); i.setSelectionRange(pos,pos); }
  if(e.target.id==='pval'){ const prevGeo=+e.target.dataset.ref, refm=e.target.dataset.refm; const v=parseFloat(e.target.value.replace(',','.'));
    let out='—'; if(isFinite(v)){ if(st.pm==='pct'){ out=fmt(truncPct(prevGeo,v))+' €'; } else { out=pct(v/prevGeo-1)+' par rapport au 1er '+mlabel(refm); } }
    $('#pcalc').textContent=out; }
});
document.addEventListener('submit',e=>{
  e.preventDefault();
  if(e.target.id==='login'){ apiPost('/api/admin/login',{email:$('#aemail').value,password:$('#apass').value}).then(async r=>{
      if(r.blocked) return blockNow(r.until);
      if(!r.ok){ toast(/réseau/.test(r.error||'')?r.error:'Email ou mot de passe incorrect.'); return; }
      await loadAdmin(); render(); }); return; }
  if(e.target.id==='manual'){ const raw=$('#mval').value.trim(); if(!raw){ toast('Indiquez un montant en € ou une variation en %.'); return; }
    const mf=st.mf, src=$('#msrc').value.trim()||'saisie admin';
    apiPost('/api/admin/saisie',{t:mf.t,z:mf.t==='fixe'?'TOUTES':mf.z,m:mf.m,mode:st.mode,raw,src}).then(async r=>{
      if(r.blocked) return blockNow(r.until); if(r.error){ toast('Erreur : '+r.error); return; }
      await reloadAll();
      toast(r.refused?'Valeur refusée (contrôle '+r.failed+') : rien n’est enregistré, voir l’historique.':`Enregistré : ${fmt(r.value)} €, source : ${src}.`); }); return; }
  if(e.target.id==='pform'){ const i=$('#pval'); const v=parseFloat(i.value.replace(',','.')); if(!isFinite(v)){ toast('Indiquez un montant ou une variation.'); return; }
    if(!captchaOk('pcap')){ toast('Cochez la vérification anti-robot.'); return; }
    const fx=st.ptype==='fixe', btn=e.target.querySelector('button[type=submit]'); btn.disabled=true;
    apiPost('/api/propositions',{type:fx?'fixe':'geo', z:fx?'TOUTES':$('#pzone').value, eff:$('#pmonth').value, saisie:st.pm==='pct'?'pct':'eur', valeur:v, source:$('#psrc').value||'', altcha:captchaVal('pcap')}).then(d=>{
      if(d.blocked) return blockNow(d.until);
      if(d.ok){ appliquerPropositions(d); toast('Proposition envoyée. Prochaine possible dans 12 h.'); render(); }
      else toast(d.prochain?`Une seule proposition toutes les 12 heures : prochaine possible le ${new Date(d.prochain).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})}.`:(d.error||'Envoi impossible.'));
    }).catch(()=>toast('Envoi impossible : pas de réponse du serveur.')).finally(()=>{ btn.disabled=false; captchaReset('pcap'); }); return; }
  if(e.target.id==='contact'){ const f=e.target, m=$('#cmsg').value.trim(), em=$('#cmail').value.trim();
    if(!m){ toast('Écrivez votre message.'); return; }
    if(em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){ toast('Adresse email non valide (ou laissez le champ vide).'); return; }
    if(!captchaOk('ccap')){ toast('Cochez la vérification anti-robot.'); return; }
    const btn=f.querySelector('button[type=submit]'); btn.disabled=true;
    postJson('/api/contact',{email:em,message:m,altcha:captchaVal('ccap')}).then(d=>{
      if(d.ok){ f.reset(); $('#ccount').textContent='0 / 1000 caractères'; toast(em?'Message envoyé. Réponse à l’adresse indiquée.':'Message envoyé. Sans email, aucune réponse n’est possible.'); }
      else toast(d.prochain?`Un seul message toutes les 12 heures : prochain envoi possible le ${new Date(d.prochain).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})}.`:(d.error||'Envoi impossible.'));
    }).catch(()=>toast('Envoi impossible : pas de réponse du serveur. Réessayez dans un instant.')).finally(()=>{ btn.disabled=false; captchaReset('ccap'); }); return; }

});

/* ---------- Échanges avec le serveur ---------- */
const apiPost=(u,b)=>fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b),credentials:'same-origin'}).then(r=>r.json().catch(()=>({error:'réponse illisible'})));
const getJson=u=>fetch(u,{credentials:'same-origin'}).then(async r=>{ const b=await r.json().catch(()=>null); if(r.status===403&&b&&b.blocked) throw {blocked:b}; if(!r.ok) throw new Error(u+' : '+r.status); return b; });
function blockNow(until){ st.blockedUntil=+new Date(until); showBlock(); }
function applyData(j,h){ D=j; H=h; CURRENT_PERIOD=j.currentPeriod;
  if(h.fixe&&h.fixe.length){ FIXE=h.fixe.map(f=>[f[0],f[1]]); FIXE_SRC=h.fixe.map(f=>[f[0],f[2],f[3]]); }
  ARRETES=h.arretes; const cad=h.fx.CAD; PROV.fx=cad?cad[cad.length-1]:null;
  if(h.prov&&h.prov.to){ const [y,m,d]=h.prov.to.split('-'); PROV.to=(+d)+' '+MONTHS_FR[+m-1]; } }
async function loadAdmin(){ const s=await getJson('/api/admin/session'); if(s.blockedUntil) return blockNow(s.blockedUntil);
  st.admin=!!s.admin; if(!st.admin){ st.hist=null; JL=null; return; }
  [JL, st.hist]=await Promise.all([getJson('/api/admin/journal'), getJson('/api/admin/historique')]); st.apiRowsC=null; st.curU=null; }
async function reloadAll(){ const [j,h]=await Promise.all([getJson('/api/data'),getJson('/api/histo')]); applyData(j,h); await loadPropositions().catch(()=>{}); await loadAdmin(); render(); }
Promise.all([getJson('/api/data'), getJson('/api/histo')])
  .then(async ([j,h])=>{ applyData(j,h); initProposals(); await loadPropositions().catch(()=>{}); await loadAdmin().catch(()=>{}); render(); })
  .catch(e=>{ if(e&&e.blocked) return blockNow(e.blocked.until); console.error(e); $('#app').innerHTML='<p>Impossible de charger les données. Réessayez dans un instant.</p>'; });
