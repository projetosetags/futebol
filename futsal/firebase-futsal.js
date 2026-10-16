import { planRosterImport } from '../roster-import.js?v=20261016-presence-v2';
import { firebaseConfig } from './firebase-config-futsal.js';
import { app as sdk, firestore, auth as authSdk } from '../firebase-sdk.bundle.js?v=20261016-local-v1';

const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
let db = null;
let auth = null;
let playerProvisioningAuth = null;
if (configured) {
  const app = sdk.initializeApp(firebaseConfig);
  db = firestore.getFirestore(app);
  auth = authSdk.initializeAuth(app, { persistence: [authSdk.browserLocalPersistence, authSdk.browserSessionPersistence, authSdk.inMemoryPersistence] });
}
export const cloudEnabled = configured;
const playerScopedKeys={games:'futsalGames',rosterGames:'futsalRosterGames',paymentLedger:'futsalPaymentLedger',pix:'futsalPix',attendanceChoices:'futsalAttendanceChoices'};
function futsalPlayerView(item){const out={...item};for(const [key,scoped] of Object.entries(playerScopedKeys))out[key]=item[scoped]??(key==='pix'?'':key==='attendanceChoices'?{}:[]);return out;}
function futsalPlayerWrite(data){const out={...data};for(const [key,scoped] of Object.entries(playerScopedKeys)){if(Object.prototype.hasOwnProperty.call(out,key)){out[scoped]=out[key];delete out[key];}}return out;}
export function watchAuthState(onUser, onError) {
  if (!cloudEnabled) return () => {};
  return authSdk.onAuthStateChanged(auth, onUser, onError);
}
export async function signInAdmin(email, password) {
  return (await authSdk.signInWithEmailAndPassword(auth, email, password)).user;
}
function playerPhoneDigits(phone) {
  const digits = String(phone || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  return digits.length > 9 ? digits.slice(-9) : digits;
}
function playerStoredPhone(phone) {
  return String(phone || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
}
function playerEmail(firstName, phone, uniqueSuffix = '') {
  const name = String(firstName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jogador';
  const suffix = String(uniqueSuffix || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${name}${suffix ? `.${suffix}` : ''}.${playerPhoneDigits(phone)}@players.futebol-society.com`;
}
export function playerEmailFor(firstName, phone, uniqueSuffix = '') {
  return playerEmail(firstName, phone, uniqueSuffix);
}
function playerAliasKey(name) {
  return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g, '');
}
export async function playerAliasId(name, phone) {
  const value = `${playerAliasKey(name)}:${playerPhoneDigits(phone)}`;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function getPlayerProvisioningAuth() {
  if (playerProvisioningAuth) return playerProvisioningAuth;
  let app;
  try { app = sdk.getApp('futsal-player-provisioner'); }
  catch { app = sdk.initializeApp(firebaseConfig, 'futsal-player-provisioner'); }
  playerProvisioningAuth = { auth: authSdk.getAuth(app), authModule: authSdk };
  return playerProvisioningAuth;
}
export async function provisionPlayerAccount(name, phone, emailOverride = '') {
  const password = playerPhoneDigits(phone) || '123456';
  const email = String(emailOverride || playerEmail(name, password)).trim().toLowerCase();
  const { auth: secondaryAuth, authModule } = await getPlayerProvisioningAuth();
  try {
    const credential = await authModule.createUserWithEmailAndPassword(secondaryAuth, email, password);
    await authModule.signOut(secondaryAuth);
    return { uid: credential.user.uid, email, password };
  } catch (error) {
    if (error.code !== 'auth/email-already-in-use') throw error;
    const passwords = [...new Set([password, playerStoredPhone(phone)].filter(Boolean))];
    let lastError = error;
    for (const candidate of passwords) {
      try {
        const credential = await authModule.signInWithEmailAndPassword(secondaryAuth, email, candidate);
        await authModule.signOut(secondaryAuth);
        return { uid: credential.user.uid, email, password: candidate };
      } catch (signInError) { lastError = signInError; }
    }
    throw lastError;
  }
}
export async function signInPlayer(identifier, phone) {
  const localDigits = playerPhoneDigits(phone);
  const alias = String(identifier || '').trim();
  const firstName = alias.split(/\s+/)[0] || alias;
  const attempts = [];
  try {
    const aliasRef = firestore.doc(db, 'playerLoginAliases', await playerAliasId(alias, localDigits));
    const aliasDoc = await Promise.race([firestore.getDoc(aliasRef), new Promise(resolve => setTimeout(() => resolve(null), 2200))]);
    if (aliasDoc?.exists() && aliasDoc.data().email) attempts.push(aliasDoc.data().email);
  } catch {
    // Older Firestore rules may not include the alias index yet; the original first-name login remains available.
  }
  attempts.push(playerEmail(firstName, localDigits));
  if (playerAliasKey(alias) !== playerAliasKey(firstName)) attempts.push(playerEmail(alias, localDigits));
  try {
    let lastError;
    for (const email of [...new Set(attempts)]) {
      try {
        const user = (await authSdk.signInWithEmailAndPassword(auth, email, localDigits)).user;
        await activatePlayer(user, firstName, phone, alias);
        return user;
      } catch (error) {
        lastError = error;
        if (!['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(error.code)) throw error;
      }
    }
    throw lastError;
  } catch (error) {
    const legacyDigits = playerStoredPhone(phone);
    if (legacyDigits.length <= 9) throw error;
    return (await authSdk.signInWithEmailAndPassword(auth, `${String(firstName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')}.${legacyDigits}@players.futebol-society.com`, legacyDigits)).user;
  }
}
export async function registerPlayer(firstName, phone, fullName = '', nickname = '') {
  const digits = playerStoredPhone(phone);
  const localDigits = playerPhoneDigits(digits);
  let user;
  for (const name of [firstName, fullName, nickname].filter(Boolean)) {
    try {
      const aliasDoc = await firestore.getDoc(firestore.doc(db, 'playerLoginAliases', await playerAliasId(name, localDigits)));
      if (aliasDoc.exists() && aliasDoc.data().email) {
        user = (await authSdk.signInWithEmailAndPassword(auth, aliasDoc.data().email, localDigits)).user;
        break;
      }
    } catch {
      // If the alias index is not published, continue with the normal first-access flow.
    }
  }
  if (user) {
    const requestRef = firestore.doc(db, 'playerAccessRequests', user.uid);
    const previousRequest = await firestore.getDoc(requestRef);
    if (previousRequest.exists()) {
      if (previousRequest.data().status !== 'approved') await firestore.updateDoc(requestRef, { status: 'approved' });
      await ensurePlayerProfile(user, firstName, digits, fullName, nickname);
      return user;
    }
  }
  try {
    if (!user) user = (await authSdk.createUserWithEmailAndPassword(auth, playerEmail(firstName, localDigits), localDigits)).user;
  } catch (error) {
    if (error.code !== 'auth/email-already-in-use') throw error;
    user = (await authSdk.signInWithEmailAndPassword(auth, playerEmail(firstName, localDigits), localDigits)).user;
  }
  const requestRef = firestore.doc(db, 'playerAccessRequests', user.uid);
  const previousRequest = await firestore.getDoc(requestRef);
  if (previousRequest.exists()) {
    if (previousRequest.data().status !== 'approved') await firestore.updateDoc(requestRef, { status: 'approved' });
  } else {
    await firestore.setDoc(requestRef, { firstName: String(firstName).trim(), fullName: String(fullName || firstName).trim(), nickname: String(nickname || '').trim(), phone: digits, createdAt: new Date().toISOString(), status: 'approved' });
  }
  await ensurePlayerProfile(user, firstName, digits, fullName, nickname);
  return user;
}
async function ensurePlayerProfile(user, firstName, phone, fullName, nickname) {
  const profileRef = firestore.doc(db, 'playerData', user.uid);
  const profile = await firestore.getDoc(profileRef);
  if (!profile.exists()) await firestore.setDoc(profileRef, {
    name: String(fullName || firstName).trim(),
    nickname: String(nickname || '').trim(),
    phone: String(phone),
    approved: true,
    createdAt: new Date().toISOString()
  });
}
async function activatePlayer(user, firstName, phone, identifier) {
  const digits = playerStoredPhone(phone);
  const requestRef = firestore.doc(db, 'playerAccessRequests', user.uid);
  const request = await firestore.getDoc(requestRef);
  if (!request.exists()) {
    await firestore.setDoc(requestRef, { firstName: String(firstName).trim(), fullName: String(identifier || firstName).trim(), nickname: '', phone: digits, createdAt: new Date().toISOString(), status: 'approved' });
  } else if (request.data().status !== 'approved') {
    await firestore.updateDoc(requestRef, { status: 'approved' });
  }
  await ensurePlayerProfile(user, firstName, digits, identifier, '');
}
export function listenToPlayerData(uid, onData, onError) {
  if (!cloudEnabled) return () => {};
  let stopped = false;
  let unsubscribe = null;
  let retryTimer = null;
  let attempts = 0;
  const attach = () => {
    if (stopped) return;
    unsubscribe = firestore.onSnapshot(
      firestore.doc(db, 'playerData', uid),
      snapshot => { attempts = 0; onData(snapshot.exists()?futsalPlayerView({id:snapshot.id,...snapshot.data()}):null); },
      error => {
        unsubscribe = null;
        if (attempts < 5 && ['permission-denied', 'unavailable', 'deadline-exceeded'].includes(error?.code)) {
          const delay = Math.min(750 * (2 ** attempts), 6000);
          attempts += 1;
          retryTimer = setTimeout(attach, delay);
          return;
        }
        onError?.(error);
      }
    );
  };
  attach();
  return () => { stopped = true; if (retryTimer) clearTimeout(retryTimer); unsubscribe?.(); };
}
export async function savePlayerData(uid,data){if(!cloudEnabled)return;const ref=firestore.doc(db,'playerData',uid),out=futsalPlayerWrite(data);if(!data.attendanceChoices){await firestore.setDoc(ref,out,{merge:true});return;}await firestore.runTransaction(db,async tx=>{const snap=await tx.get(ref),old=snap.exists()?snap.data():{},choices=structuredClone(data.attendanceChoices);for(const [gameId,latest] of Object.entries(old.futsalAttendanceChoices||{})){const proposed=choices[gameId]||{};for(const field of ['joined','foodWanted','attendance'])if(Object.prototype.hasOwnProperty.call(latest||{},field)&&(Date.parse(latest.fieldUpdatedAt?.[field]||'')||0)>(Date.parse(proposed.fieldUpdatedAt?.[field]||'')||0)){proposed[field]=latest[field];proposed.fieldUpdatedAt={...(proposed.fieldUpdatedAt||{}),[field]:latest.fieldUpdatedAt[field]};}choices[gameId]=proposed;}out.futsalAttendanceChoices=choices;delete out.attendanceChoices;tx.set(ref,out,{merge:true});});}
export async function updateMyPlayerProfile(uid, displayName, displayNickname) {
  if (!cloudEnabled) return;
  await firestore.updateDoc(firestore.doc(db, 'playerData', uid), {
    displayName: String(displayName || '').trim(),
    displayNickname: String(displayNickname || '').trim()
  });
}
export async function savePlayerAttendance(uid, attendanceChoices) {
  if (!cloudEnabled) return;
  await firestore.updateDoc(firestore.doc(db, 'playerData', uid), { futsalAttendanceChoices: attendanceChoices });
}
export async function signOutAdmin() {
  if (cloudEnabled) await authSdk.signOut(auth);
}
export function listenToAppData(onData, onError) {
  if (!cloudEnabled) return () => {};
  return firestore.onSnapshot(firestore.doc(db, 'futsalAppData', 'current'), snapshot => {
    onData(snapshot.exists()?snapshot.data():{fields:[{id:'futsal-field-colegio-legado',name:'Colégio Legado',address:'',maps:'',waze:'',notes:''}],players:[],games:[],payments:[],pix:'',gameFee:0,foodFee:0});
  }, onError);
}
export async function saveAppData(data) {
  if (!cloudEnabled) return;
  await firestore.setDoc(firestore.doc(db, 'futsalAppData', 'current'), data);
}
export function listenToRecords(collectionName, onData, onError) {
  if (!cloudEnabled) return () => {};
  let stopped = false, unsubscribe = null, timer = null, attempts = 0;
  const attach = () => {
    if (stopped) return;
    unsubscribe = firestore.onSnapshot(firestore.collection(db, collectionName), snapshot => {
      attempts = 0;
      onData(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).map(item=>collectionName==='playerData'?futsalPlayerView(item):item));
    }, error => {
      unsubscribe = null;
      onError?.(error);
      if (!stopped && collectionName === 'futsalGameRegistrations' && ['permission-denied', 'unavailable', 'deadline-exceeded'].includes(error?.code)) {
        timer = setTimeout(attach, Math.min(1000 * (2 ** attempts++), 15000));
      }
    });
  };
  attach();
  return () => { stopped = true; if (timer) clearTimeout(timer); unsubscribe?.(); };
}

export function listenToMyPollVotes(uid, onData, onError) {
  if (!cloudEnabled) return () => {};
  const votes = firestore.query(
    firestore.collection(db, 'futsalPollVotes'),
    firestore.where('voterId', '==', uid)
  );
  return firestore.onSnapshot(votes, snapshot => {
    onData(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }, onError);
}
export async function submitPollVote(pollId, optionIndex, uid) {
  if (!cloudEnabled) throw new Error('O Firebase não está configurado.');
  const voteId = `${pollId}-${uid}`;
  const optionKey = String(optionIndex);
  const tallyId = `${pollId}-${optionKey}`;
  const voteRef = firestore.doc(db, 'futsalPollVotes', voteId);
  const tallyRef = firestore.doc(db, 'futsalPollTallies', tallyId);
  await firestore.runTransaction(db, async transaction => {
    const [voteSnapshot, tallySnapshot] = await Promise.all([
      transaction.get(voteRef), transaction.get(tallyRef)
    ]);
    if (voteSnapshot.exists()) throw new Error('Você já respondeu esta enquete.');
    const count = tallySnapshot.exists() ? Number(tallySnapshot.data().count || 0) : 0;
    transaction.set(voteRef, {
      pollId, optionIndex: optionKey, voterId: uid, createdAt: new Date().toISOString()
    });
    transaction.set(tallyRef, { pollId, optionIndex: optionKey, count: count + 1 });
  });
}
export async function saveRecord(collectionName, record) {
  if (!cloudEnabled) return;
  const { id, ...data } = record;
  await firestore.setDoc(firestore.doc(db, collectionName, id), data);
}
export async function getRecord(collectionName, id) {
  if (!cloudEnabled) return null;
  const snapshot = await firestore.getDoc(firestore.doc(db, collectionName, id));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}
export async function deleteRecord(collectionName, id) {
  if (!cloudEnabled) return;
  await firestore.deleteDoc(firestore.doc(db, collectionName, id));
}

export async function reserveGameParticipation(gameId, joined) {
  if (!cloudEnabled || !auth.currentUser) throw new Error('Entre no app para confirmar sua vaga.');
  const uid = auth.currentUser.uid, profileRef = firestore.doc(db, 'playerData', uid);
  const gameRef = firestore.doc(db, 'futsalGameRosters', gameId), slotsRef = firestore.doc(db, 'futsalGameRegistrations', gameId);
  return firestore.runTransaction(db, async transaction => {
    const [profileSnap, gameSnap, slotSnap] = await Promise.all([transaction.get(profileRef), transaction.get(gameRef), transaction.get(slotsRef)]);
    const profile = profileSnap.data(), game = gameSnap.data();
    if (!profile?.playerId || !profile.approved) throw new Error('Seu cadastro precisa estar vinculado ao participante para reservar a vaga.');
    if (!game || game.registrationMode !== 'first-confirmed-v1') throw new Error('O administrador precisa atualizar a abertura das inscrições deste jogo.');
    if (game.status === 'played' || game.status === 'cancel' || Date.now() > game.signupClosesAtMs) throw new Error('As inscrições deste jogo estão encerradas.');
    const record = slotSnap.exists() ? slotSnap.data() : { gameId, date: game.date, version: 1, lineCapacity: 16, keeperCapacity: 2, nextSequence: 0, lineSlots: {}, keeperSlots: {} };
    const lineSlots = { ...record.lineSlots }, keeperSlots = { ...record.keeperSlots }, playerId = profile.playerId;
    const position = profile.gamePositions?.[gameId] === 'Goleiro' ? 'Goleiro' : 'Jogador';
    const target = position === 'Goleiro' ? keeperSlots : lineSlots;
    const other = position === 'Goleiro' ? lineSlots : keeperSlots;
    let nextSequence = record.nextSequence || 0, changed = false;
    if (joined && !target[playerId]) {
      const limit = position === 'Goleiro' ? 2 : 16;
      if (Object.keys(target).length >= limit) throw new Error(position === 'Goleiro' ? 'As 2 vagas de goleiro já foram preenchidas.' : 'As 16 vagas já foram preenchidas. Aguarde alguém liberar uma vaga.');
      delete other[playerId]; nextSequence++;
      target[playerId] = { uid, playerId, name: profile.name, sequence: nextSequence, joinedAt: firestore.serverTimestamp() };
      changed = true;
    } else if (!joined && (lineSlots[playerId] || keeperSlots[playerId])) {
      delete lineSlots[playerId]; delete keeperSlots[playerId]; changed = true;
    }
    const choices = { ...(profile.attendanceChoices || {}) }, previous = choices[gameId] || {};
    choices[gameId] = { ...previous, joined, position, fieldUpdatedAt: { ...(previous.fieldUpdatedAt || {}), joined: new Date().toISOString() } };
    if (changed) transaction.set(slotsRef, { ...record, lineSlots, keeperSlots, nextSequence, updatedAt: firestore.serverTimestamp() });
    transaction.update(profileRef, { attendanceChoices: choices });
    return { joined, position, sequence: target[playerId]?.sequence || 0, attendanceChoices: choices, registration: { id: gameId, ...record, lineSlots, keeperSlots, nextSequence } };
  });
}

export async function reserveAdminGameParticipation(game, player, position, joined) {
  if (!cloudEnabled || !auth.currentUser || !((firebaseConfig.adminUids || [firebaseConfig.adminUid]).includes(auth.currentUser.uid) || (firebaseConfig.adminEmails || []).some(email => email.toLowerCase() === String(auth.currentUser.email || '').toLowerCase()))) throw new Error('Entre com a conta administrativa.');
  if (!player?.id) throw new Error('Participante sem vínculo no cadastro.');
  const ref = firestore.doc(db, 'futsalGameRegistrations', game.id);
  return firestore.runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    const record = snapshot.exists() ? snapshot.data() : { gameId: game.id, date: game.date, version: 1, lineCapacity: 16, keeperCapacity: 2, nextSequence: 0, lineSlots: {}, keeperSlots: {} };
    const lineSlots = { ...record.lineSlots }, keeperSlots = { ...record.keeperSlots }, previous = lineSlots[player.id] || keeperSlots[player.id];
    delete lineSlots[player.id]; delete keeperSlots[player.id];
    let nextSequence = Number(record.nextSequence || 0);
    if (joined) {
      const target = position === 'Goleiro' ? keeperSlots : lineSlots, capacity = position === 'Goleiro' ? 2 : 16;
      if (Object.keys(target).length >= capacity) throw new Error(position === 'Goleiro' ? 'As 2 vagas de goleiro estão preenchidas.' : 'As 16 vagas de jogadores estão preenchidas.');
      const sequence = previous?.sequence || ++nextSequence;
      target[player.id] = { uid: previous?.uid || '', playerId: player.id, name: player.name, sequence, joinedAt: previous?.joinedAt || firestore.serverTimestamp() };
    }
    const data = { ...record, lineSlots, keeperSlots, nextSequence, updatedAt: firestore.serverTimestamp() };
    transaction.set(ref, data);
    return { id: game.id, ...data };
  });
}


// Medições independentes: o histórico não é substituído pela sincronização do cadastro.
export function listenToMeasurements(uid,onData,onError){
 if(!cloudEnabled)return ()=>{};
 const ref=firestore.collection(db,'playerMeasurements');
 const query=uid?firestore.query(ref,firestore.where('uid','==',uid)):ref;
 return firestore.onSnapshot(query,snapshot=>onData(snapshot.docs.map(doc=>({id:doc.id,...doc.data()}))),onError);
}
export async function saveMeasurement(measurement,recordId=''){
 if(!cloudEnabled||!auth.currentUser)throw Error('Entre na sua conta para registrar a medição.');
 const admin=(firebaseConfig.adminUids||[firebaseConfig.adminUid]).includes(auth.currentUser.uid) || (firebaseConfig.adminEmails||[]).includes(String(auth.currentUser.email||'').toLowerCase());
 const ref=recordId?firestore.doc(db,'playerMeasurements',recordId):firestore.doc(firestore.collection(db,'playerMeasurements'));
 await firestore.runTransaction(db,async transaction=>{
  const existing=await transaction.get(ref);
  if(recordId&&!existing.exists())throw Error('Registro não encontrado.');
  if(existing.exists()){
   const old=existing.data();
   if(!admin&&(old.uid!==auth.currentUser.uid||!old.createdAt?.toMillis||Date.now()>=old.createdAt.toMillis()+86400000))throw Error('As 24 horas de edição terminaram. Faça um novo lançamento.');
   transaction.update(ref,{weightKg:measurement.weightKg,heightM:measurement.heightM,updatedAt:firestore.serverTimestamp()});
  }else{
   const profile=await transaction.get(firestore.doc(db,'playerData',auth.currentUser.uid));
   if(!profile.exists()||profile.data().approved!==true||!profile.data().playerId)throw Error('Seu cadastro ainda não está vinculado a um participante.');
   transaction.set(ref,{uid:auth.currentUser.uid,playerId:profile.data().playerId,date:measurement.date,weightKg:measurement.weightKg,heightM:measurement.heightM,createdAt:firestore.serverTimestamp(),updatedAt:firestore.serverTimestamp()});
  }
 });return ref.id;
}

export async function applyRosterImport(pack){
 if(!cloudEnabled||!auth.currentUser||!(firebaseConfig.adminUids||[firebaseConfig.adminUid]).includes(auth.currentUser.uid))throw Error('Entre com a conta administrativa para importar a lista.');
 const appRef=firestore.doc(db,'futsalAppData','current');
 return firestore.runTransaction(db,async transaction=>{
  const appSnapshot=await transaction.get(appRef);if(!appSnapshot.exists())throw Error('O cadastro do app não foi encontrado.');
  const games=(appSnapshot.data().games||[]).filter(game=>game.date===pack.date);if(games.length!==1)throw Error('Jogo não encontrado ou data duplicada.');
  const regRef=firestore.doc(db,'futsalGameRegistrations',games[0].id),regSnapshot=await transaction.get(regRef),result=planRosterImport(appSnapshot.data(),regSnapshot.exists()?regSnapshot.data():null,pack,firestore.serverTimestamp());
  if(!result.alreadyApplied){transaction.set(appRef,result.data);transaction.set(regRef,result.registration)}return result;
 });
}
