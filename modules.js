/* Modules v2 : calendrier, caisse, ménage, registre de police, surveillance, rapports, photos */
const MET={especes:'Espèces',orange_money:'Orange Money',mtn_momo:'MTN MoMo',wave:'Wave',moov:'Moov',carte:'Carte'};
const KIND={acompte:'Acompte',solde:'Solde',caution:'Caution',remboursement:'Remboursement'};
let pays=[],clos=[],watch=[],off=0,rp=7,rg=30;
const sum=a=>a.reduce((s,x)=>s+x,0),opts=o=>Object.entries(o).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
const total=b=>nights(b)*(b.room_types?.price||0);
const paid=id=>sum(pays.filter(p=>p.booking_id===id&&(p.kind==='acompte'||p.kind==='solde')).map(p=>p.amount));
const iso=d=>new Date(d).toISOString().slice(0,10);
const csv=(name,rows)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\n')],{type:'text/csv'}));a.download=name;a.click()};

async function loadMore(){
 pays=(await db.from('payments').select('*,bookings(profiles(full_name),rooms(number))').order('at',{ascending:false})).data||[];
 clos=(await db.from('cash_closings').select('*').order('at',{ascending:false}).limit(20)).data||[];
 watch=manage()||conf()?(await db.from('watchlist').select('*').order('created_at',{ascending:false})).data||[]:[];
}
function staffTabs(){const T={dash:'Tableau de bord',res:'Réservations',cal:'Calendrier',rooms:'Chambres'};
 if(manage())T.hk='Ménage';T.cash='Caisse';T.reg='Registre';if(manage())T.watch='À surveiller';
 if(me.role!=='receptionniste')T.rep='Rapports';if(me.role==='admin')T.users='Utilisateurs';return T}

/* Calendrier d'occupation */
function vCal(){const days=[...Array(14)].map((_,i)=>{const d=new Date();d.setDate(d.getDate()+off+i);return iso(d)});
 const at=(r,d)=>data.find(b=>b.room_id===r.id&&['confirmee','arrivee'].includes(b.status)&&b.check_in<=d&&d<b.check_out);
 return `<h2 style="margin-bottom:10px">Calendrier d'occupation</h2><p><button class="s sm" onclick="off-=14;render()">Avant</button><button class="s sm" onclick="off=0;render()">Aujourd'hui</button><button class="s sm" onclick="off+=14;render()">Après</button></p>
<div class="card scroll"><table><tr><th>Ch.</th>${days.map(d=>`<th>${dt(d)}</th>`).join('')}</tr>${rooms.map(r=>`<tr><td><b>${esc(r.number)}</b></td>${days.map(d=>{const b=at(r,d);return `<td title="${b?esc(b.profiles?.full_name):''}" style="padding:4px;font-size:11px;background:${b?(b.status==='arrivee'?'#CDDCF2':'#CFE8D8'):'none'};color:#14301f">${b?esc((b.profiles?.full_name||'').split(' ')[0]):''}</td>`}).join('')}</tr>`).join('')}</table></div>
<p class="mut">Vert : réservée · Bleu : client en séjour.</p>`}

/* Ménage */
function vHk(){const L=rooms.filter(r=>r.status==='nettoyage');
 return `<h2 style="margin-bottom:10px">Ménage</h2><div class="card">${L.map(r=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0"><b>Chambre ${esc(r.number)}</b><button class="p sm" onclick="roomSt(${r.id},'libre')">Nettoyage terminé</button></div>`).join('')||'<p class="mut">Aucune chambre à nettoyer.</p>'}</div>`}

/* Arrivée : fiche de police + contrôle liste de surveillance + caution */
function arrive(id){const b=data.find(x=>x.id===id);
 dlg(`<h2>Arrivée de ${esc(b.profiles?.full_name)}</h2><form onsubmit="doArrive(event,${id})"><label>Nationalité<input name="nat" value="${esc(b.nationality||'Ivoirienne')}" required></label>
<div class="row"><label>Pièce<select name="it"><option>CNI</option><option>Passeport</option><option>Permis</option><option>Autre</option></select></label><label>Numéro<input name="in" value="${esc(b.id_number||'')}" required></label></div>
<label>Venant de (ville / pays)<input name="pr" value="${esc(b.provenance||'')}"></label>
<div class="row"><label>Caution (F, facultatif)<input name="c" type="number" min="0" step="500" value="0"></label><label>Mode<select name="m">${opts(MET)}</select></label></div>
<p class="err" id="err"></p><button class="p">Valider l'arrivée</button> <button type="button" class="s" onclick="closeD()">Annuler</button></form>`)}
async function doArrive(e,id){e.preventDefault();const f=e.target,b=data.find(x=>x.id===id),n=s=>String(s||'').replace(/\s/g,'').toLowerCase();
 const w=watch.find(w=>(w.phone&&n(w.phone)===n(b.profiles?.phone))||(w.id_number&&n(w.id_number)===n(f.in.value))||(w.name&&n(w.name)===n(b.profiles?.full_name)));
 if(w&&!confirm(`Client à surveiller : ${w.reason}. Valider quand même l'arrivée ?`))return;
 const{error}=await db.from('bookings').update({status:'arrivee',nationality:f.nat.value.trim(),id_type:f.it.value,id_number:f.in.value.trim(),provenance:f.pr.value.trim()}).eq('id',id);
 if(error)return $('#err').textContent=error.message;
 if(+f.c.value>0)await db.from('payments').insert({booking_id:id,kind:'caution',method:f.m.value,amount:+f.c.value});
 await roomSt(b.room_id,'occupee');closeD();await load();render()}

/* Encaissement */
function pay(id){const b=data.find(x=>x.id===id),due=Math.max(0,total(b)-paid(id));
 dlg(`<h2>Encaisser · ${esc(b.profiles?.full_name)}</h2><p class="mut">Séjour ${fmt(total(b))} · déjà payé ${fmt(paid(id))} · reste ${fmt(due)}</p><form onsubmit="doPay(event,${id})"><div class="row"><label>Type<select name="k">${opts(KIND)}</select></label><label>Mode<select name="m">${opts(MET)}</select></label></div>
<label>Montant (F)<input name="a" type="number" min="1" step="100" value="${due||''}" required></label><label>Référence Mobile Money (facultatif)<input name="r"></label><p class="err" id="err"></p><button class="p">Enregistrer</button> <button type="button" class="s" onclick="closeD()">Annuler</button></form>`)}
async function doPay(e,id){e.preventDefault();const f=e.target,{error}=await db.from('payments').insert({booking_id:id,kind:f.k.value,method:f.m.value,amount:+f.a.value,ref:f.r.value});
 if(error)return $('#err').textContent=error.message;closeD();toast('Paiement enregistré');await load();render()}

/* Caisse */
function vCash(){const t0=new Date().setHours(0,0,0,0),last=clos.find(c=>c.by===me.id),since=Math.max(t0,last?+new Date(last.at):0),
 ps=pays.filter(p=>+new Date(p.at)>=since&&(p.by===me.id||!manage())),sgn=p=>p.kind==='remboursement'?-p.amount:p.amount,
 cash=sum(ps.filter(p=>p.method==='especes').map(sgn)),mob=sum(ps.filter(p=>p.method!=='especes').map(sgn)),
 debts=data.filter(b=>['arrivee','terminee'].includes(b.status)&&total(b)-paid(b.id)>0);
 return `<h2 style="margin-bottom:10px">Caisse</h2><div class="kpis"><div class="card kpi"><b>${fmt(cash)}</b><span class="mut">Espèces attendues</span></div><div class="card kpi"><b>${fmt(mob)}</b><span class="mut">Mobile Money et cartes</span></div></div>
${manage()?`<form class="card" style="max-width:380px" onsubmit="closeCash(event,${cash})"><b>Clôture de caisse</b><label>Espèces comptées (F)<input name="c" type="number" min="0" required></label><button class="p" style="margin-top:10px">Clôturer</button></form>`:''}
${debts.length?`<h3 style="margin:18px 0 8px">Impayés</h3><div class="card scroll"><table>${debts.map(b=>`<tr><td>${esc(b.profiles?.full_name)}</td><td class="mut">Ch. ${esc(b.rooms?.number)}</td><td><b>${fmt(total(b)-paid(b.id))}</b></td><td>${manage()?`<button class="p sm" onclick="pay(${b.id})">Encaisser</button>`:''}<a class="p w sm" style="padding:6px 10px;font-size:12px" target="_blank" rel="noopener" href="${wa(cw(b.profiles?.phone),`Bonjour ${b.profiles?.full_name}, il reste ${fmt(total(b)-paid(b.id))} à régler pour votre séjour à Résidence Hotel Amani. Merci.`)}">Relancer</a></td></tr>`).join('')}</table></div>`:''}
<h3 style="margin:18px 0 8px">Opérations</h3><div class="card scroll"><table>${ps.map(p=>`<tr><td>${new Date(p.at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</td><td>${esc(p.bookings?.profiles?.full_name)}</td><td>${KIND[p.kind]}</td><td>${MET[p.method]}${p.ref?' · '+esc(p.ref):''}</td><td><b>${p.kind==='remboursement'?'−':''}${fmt(p.amount)}</b></td></tr>`).join('')||'<tr><td>Aucune opération.</td></tr>'}</table></div>
${clos.length?`<h3 style="margin:18px 0 8px">Dernières clôtures</h3><div class="card scroll"><table>${clos.map(c=>`<tr><td>${dt(c.at)}</td><td>Attendu ${fmt(c.expected)}</td><td>Compté ${fmt(c.counted)}</td><td style="color:${c.counted-c.expected?'var(--red)':'var(--ok)'}"><b>Écart ${fmt(c.counted-c.expected)}</b></td></tr>`).join('')}</table></div>`:''}`}
async function closeCash(e,exp){e.preventDefault();const{error}=await db.from('cash_closings').insert({expected:exp,counted:+e.target.c.value});if(error)return toast(error.message);toast('Caisse clôturée');await load();render()}

/* Registre de police */
function vReg(){const from=Date.now()-rg*864e5,L=data.filter(b=>['arrivee','terminee'].includes(b.status)&&+new Date(b.check_in)>=from).sort((a,b)=>a.check_in<b.check_in?1:-1);
 return `<h2 style="margin-bottom:6px">Registre des voyageurs</h2><p class="mut">Fiche de police : remplie à chaque arrivée.</p><select style="max-width:200px" onchange="rg=+this.value;render()">${[[1,"Aujourd'hui"],[7,'7 jours'],[30,'30 jours'],[365,'12 mois']].map(([d,l])=>`<option value="${d}" ${d===rg?'selected':''}>${l}</option>`).join('')}</select>
<p><button class="p sm" onclick="print()">Imprimer</button><button class="s sm" onclick="expReg()">Exporter CSV</button></p><div class="card scroll"><table><tr><th>Arrivée</th><th>Départ</th><th>Ch.</th><th>Nom</th><th>Nationalité</th><th>Pièce</th><th>Venant de</th><th>Tél.</th></tr>
${L.map(b=>`<tr><td>${dt(b.check_in)}</td><td>${dt(b.check_out)}</td><td>${esc(b.rooms?.number)}</td><td>${esc(b.profiles?.full_name)}</td><td>${esc(b.nationality)}</td><td>${esc(b.id_type)} ${esc(b.id_number)}</td><td>${esc(b.provenance)}</td><td>${esc(b.profiles?.phone)}</td></tr>`).join('')||'<tr><td>Aucun séjour sur la période.</td></tr>'}</table></div>`}
function expReg(){const from=Date.now()-rg*864e5;csv('registre-amani.csv',[['Arrivée','Départ','Chambre','Nom','Nationalité','Type pièce','N° pièce','Venant de','Téléphone'],...data.filter(b=>['arrivee','terminee'].includes(b.status)&&+new Date(b.check_in)>=from).map(b=>[b.check_in,b.check_out,b.rooms?.number,b.profiles?.full_name,b.nationality,b.id_type,b.id_number,b.provenance,b.profiles?.phone])])}

/* Liste à surveiller */
function vWatch(){return `<h2 style="margin-bottom:6px">Clients à surveiller</h2><p class="mut">Une alerte s'affiche à l'arrivée si le nom, le téléphone ou la pièce correspond. Données personnelles : ne gardez que le nécessaire.</p>
<form class="card" style="max-width:520px" onsubmit="addWatch(event)"><div class="row"><label>Nom<input name="n"></label><label>Téléphone<input name="p" type="tel"></label></div><div class="row"><label>N° de pièce<input name="d"></label><label>Motif<input name="m" required placeholder="ex. impayé"></label></div><button class="p" style="margin-top:10px">Ajouter</button></form>
<div class="card scroll" style="margin-top:12px"><table>${watch.map(w=>`<tr><td>${esc(w.name)}</td><td>${esc(w.phone)}</td><td>${esc(w.id_number)}</td><td>${esc(w.reason)}</td><td>${conf()?`<button class="d sm" onclick="delWatch(${w.id})">Retirer</button>`:''}</td></tr>`).join('')||'<tr><td class="mut">Liste vide.</td></tr>'}</table></div>`}
async function addWatch(e){e.preventDefault();const f=e.target;if(!(f.n.value||f.p.value||f.d.value))return toast('Renseignez un nom, un téléphone ou une pièce.');
 const{error}=await db.from('watchlist').insert({name:f.n.value.trim(),phone:f.p.value.trim(),id_number:f.d.value.trim(),reason:f.m.value.trim()});if(error)return toast(error.message);await load();render()}
async function delWatch(id){if(confirm('Retirer cette personne de la liste ?')){await db.from('watchlist').delete().eq('id',id);await load();render()}}

/* Rapports */
function vRep(){const from=Date.now()-rp*864e5,ps=pays.filter(p=>+new Date(p.at)>=from&&(p.kind==='acompte'||p.kind==='solde')),bs=data.filter(b=>+new Date(b.created_at)>=from),
 ns=sum(data.filter(b=>['arrivee','terminee'].includes(b.status)&&+new Date(b.check_in)>=from).map(nights));
 return `<h2 style="margin-bottom:10px">Rapports</h2><select style="max-width:200px" onchange="rp=+this.value;render()">${[[1,"Aujourd'hui"],[7,'7 jours'],[30,'30 jours'],[365,'12 mois']].map(([d,l])=>`<option value="${d}" ${d===rp?'selected':''}>${l}</option>`).join('')}</select>
<div class="kpis" style="margin-top:12px"><div class="card kpi"><b>${fmt(sum(ps.map(p=>p.amount)))}</b><span class="mut">Encaissé</span></div><div class="card kpi"><b>${bs.length}</b><span class="mut">Demandes reçues</span></div><div class="card kpi"><b>${bs.filter(b=>b.status==='annulee').length}</b><span class="mut">Annulées</span></div><div class="card kpi"><b>${ns}</b><span class="mut">Nuitées vendues</span></div></div>
<div class="card"><b>Par mode de paiement</b><table>${Object.entries(MET).map(([k,v])=>`<tr><td>${v}</td><td><b>${fmt(sum(ps.filter(p=>p.method===k).map(p=>p.amount)))}</b></td></tr>`).join('')}</table></div>
<p><button class="s sm" onclick="expPay()">Exporter les encaissements (CSV)</button></p>`}
function expPay(){const from=Date.now()-rp*864e5;csv('encaissements-amani.csv',[['Date','Client','Chambre','Type','Mode','Montant','Référence'],...pays.filter(p=>+new Date(p.at)>=from).map(p=>[new Date(p.at).toLocaleString('fr-FR'),p.bookings?.profiles?.full_name,p.bookings?.rooms?.number,p.kind,MET[p.method],p.kind==='remboursement'?-p.amount:p.amount,p.ref])])}

/* Photos des chambres */
function photo(id){const i=document.createElement('input');i.type='file';i.accept='image/*';i.onchange=async()=>{const f=i.files[0];if(!f)return;toast('Envoi de la photo...');
 const im=await createImageBitmap(f),k=Math.min(1,1000/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=im.width*k;c.height=im.height*k;c.getContext('2d').drawImage(im,0,0,c.width,c.height);
 const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.8)),path=`type-${id}-${Date.now()}.jpg`,up=await db.storage.from('room-photos').upload(path,blob,{contentType:'image/jpeg'});
 if(up.error)return toast(up.error.message);await db.from('room_types').update({photo_url:db.storage.from('room-photos').getPublicUrl(path).data.publicUrl}).eq('id',id);await load();render();toast('Photo enregistrée')};i.click()}

const XV={cal:vCal,hk:vHk,cash:vCash,reg:vReg,watch:vWatch,rep:vRep};
