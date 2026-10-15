// Este módulo não contém listas de jogadores nem pagamentos particulares.
const key=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function validateRosterImport(pack){
 if(!pack||pack.version!==1||typeof pack.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(pack.id))throw Error('Link de importação inválido.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(pack.date)||!/^\d{2}:\d{2}$/.test(pack.time)||!Number.isFinite(pack.fee)||pack.fee<0||pack.fee>500)throw Error('Data, horário ou valor inválido.');
 if(!Array.isArray(pack.entries)||!pack.entries.length||pack.entries.length>18)throw Error('A lista deve ter entre 1 e 18 participantes.');
 const names=new Set();let line=0,keepers=0;
 for(const entry of pack.entries){if(typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>100||names.has(key(entry.name))||typeof entry.paid!=='boolean'||(entry.aliases&&!Array.isArray(entry.aliases)))throw Error('A lista contém nomes repetidos ou inválidos.');names.add(key(entry.name));entry.keeper?keepers++:line++}
 if(line>16||keepers>2)throw Error('O limite é de 16 jogadores e 2 goleiros.');return pack;
}
export function planRosterImport(source,registration,pack,stamp,nowMs=Date.now()){
 validateRosterImport(pack);
 const data=structuredClone(source),games=(data.games||[]).filter(game=>game.date===pack.date);
 if(games.length!==1)throw Error('Não foi possível identificar um único jogo nesta data.');
 const game=games[0];if(game.rosterImports?.[pack.id])return {alreadyApplied:true,data,gameId:game.id,summary:game.rosterImports[pack.id]};
 if(game.status==='played'||game.status==='cancel'||nowMs>=Date.parse(pack.date+'T'+pack.time+':00-03:00'))throw Error('A importação precisa ocorrer antes do jogo.');
 if(!data.fields?.some(field=>field.id===pack.fieldId))throw Error('O campo não foi encontrado no cadastro.');
 const reg=registration?{...registration,lineSlots:{...registration.lineSlots},keeperSlots:{...registration.keeperSlots}}:{gameId:game.id,date:game.date,version:1,lineCapacity:16,keeperCapacity:2,nextSequence:0,lineSlots:{},keeperSlots:{}};
 reg.nextSequence=Number(reg.nextSequence||0);
 const used=new Set(),resolved=[];data.players||=[];game.players||=[];const iso=new Date(nowMs).toISOString();
 for(const [index,entry] of pack.entries.entries()){
  const names=[entry.name,entry.nickname,...(entry.aliases||[])].filter(Boolean).map(key);
  let matches=data.players.filter(player=>[player.name,player.nickname,...(player.aliases||[])].filter(Boolean).some(name=>names.includes(key(name))));
  if(entry.playerId){const exact=data.players.find(player=>player.id===entry.playerId);if(exact&&!matches.some(p=>p.id===exact.id))matches.push(exact)}
  if(matches.length>1)throw Error('Há mais de um cadastro possível para '+entry.name+'. Corrija o vínculo antes de importar.');
  let player=matches[0];if(!player){player={id:'p-'+pack.id+'-'+index,name:entry.name.trim(),nickname:entry.nickname||entry.name.trim(),phone:'',active:true};data.players.push(player)}
  if(used.has(player.id))throw Error('Dois nomes da lista correspondem ao mesmo cadastro: '+entry.name);used.add(player.id);
  player.aliases=[...new Set([...(player.aliases||[]),entry.name,...(entry.aliases||[])])];if(entry.nickname)player.nickname=entry.nickname;
  const oldSlot=reg.lineSlots[player.id]||reg.keeperSlots[player.id];delete reg.lineSlots[player.id];delete reg.keeperSlots[player.id];
  const sequence=oldSlot?.sequence||++reg.nextSequence,slot={uid:oldSlot?.uid||'',playerId:player.id,name:player.name,sequence,joinedAt:oldSlot?.joinedAt||stamp};
  (entry.keeper?reg.keeperSlots:reg.lineSlots)[player.id]=slot;
  let row=game.players.find(row=>row.playerId===player.id||key(row.name)===key(player.name));
  if(!row){const suggested=(game.suggestedPlayers||[]).find(row=>row.playerId===player.id);row={...suggested};game.players.push(row)}
  Object.assign(row,{playerId:player.id,name:player.name,position:entry.keeper?'Goleiro':'Jogador',participationConfirmed:true,signupSequence:sequence,gameChargeConfirmed:!entry.keeper,attendance:'friday',importNote:entry.note||'',signupImportId:pack.id});
  // A lista confirma os pagamentos assinalados; uma quitação já existente nunca é desfeita.
  if(entry.keeper){row.paid=false;row.paidAt=''}else if(entry.paid){row.paid=true;row.paidAt=row.paidAt||iso}else{row.paid=!!row.paid}
  game.playerChoiceOverrides||={};game.playerChoiceOverrides[player.id]={...(game.playerChoiceOverrides[player.id]||{}),joined:iso,attendance:iso};resolved.push({player,entry});
 }
 if(Object.keys(reg.lineSlots).length>16||Object.keys(reg.keeperSlots).length>2)throw Error('Existem outras vagas confirmadas fora desta lista. Nenhuma alteração foi salva; confira as inscrições atuais.');
 const confirmed=new Set([...Object.keys(reg.lineSlots),...Object.keys(reg.keeperSlots)]);
 for(const row of game.players)if(row.position!=='Churrasco'&&!confirmed.has(row.playerId))row.participationConfirmed=false;
 game.players.sort((a,b)=>(a.signupSequence||999999)-(b.signupSequence||999999));
 // Mantém times já definidos; os novos nomes ocupam as vagas disponíveis.
 const teams=(game.teams||[]).slice(0,2).map((team,i)=>({...team,name:'Time 0'+(i+1),playerIds:[],players:[],goalkeeper:''}));while(teams.length<2)teams.push({name:'Time 0'+(teams.length+1),playerIds:[],players:[],goalkeeper:''});
 const line=game.players.filter(row=>row.participationConfirmed!==false&&row.position==='Jogador');
 for(const row of line){let teamIndex=(game.teams||[]).findIndex(team=>(team.playerIds||[]).includes(row.playerId)||(team.players||[]).some(name=>key(name)===key(row.name)));if(teamIndex<0||teamIndex>1||teams[teamIndex].players.length>=8)teamIndex=teams[0].players.length<=teams[1].players.length?0:1;teams[teamIndex].playerIds.push(row.playerId);teams[teamIndex].players.push(row.name);row.teamIndex=teamIndex;row.teamName=teams[teamIndex].name}
 game.players.filter(row=>row.participationConfirmed!==false&&row.position==='Goleiro').forEach((row,i)=>{if(i<2){teams[i].goalkeeper=row.name;row.teamIndex=i;row.teamName=teams[i].name}});
 Object.assign(game,{time:pack.time,fieldId:pack.fieldId,fee:pack.fee,registrationMode:'first-confirmed-v1',teams,teamsEdited:true,importNotice:pack.notice||''});
 const summary={appliedAt:iso,count:pack.entries.length,paidCount:pack.entries.filter(e=>e.paid&&!e.keeper).length,paidAmount:pack.entries.filter(e=>e.paid&&!e.keeper).length*pack.fee};game.rosterImports={...(game.rosterImports||{}),[pack.id]:summary};reg.updatedAt=stamp;
 return {data,registration:reg,gameId:game.id,summary,alreadyApplied:false};
}
