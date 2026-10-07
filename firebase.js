import { firebaseConfig } from './firebase-config.js';

const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
let db = null;
let firestore = null;
let authSdk = null;
let auth = null;
let playerProvisioningAuth = null;
if (configured) {
  const sdk = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js');
  firestore = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js');
  authSdk = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');
  const app = sdk.initializeApp(firebaseConfig);
  db = firestore.getFirestore(app);
  auth = authSdk.getAuth(app);
}
export const cloudEnabled = configured;
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
function playerEmail(firstName, phone) {
  const name = String(firstName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${name}.${playerPhoneDigits(phone)}@players.futebol-society.com`;
}
export function playerEmailFor(firstName, phone) {
  return playerEmail(firstName, phone);
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
  const appSdk = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js');
  const authModule = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');
  let app;
  try { app = appSdk.getApp('society-player-provisioner'); }
  catch { app = appSdk.initializeApp(firebaseConfig, 'society-player-provisioner'); }
  playerProvisioningAuth = { auth: authModule.getAuth(app), authModule };
  return playerProvisioningAuth;
}
export async function provisionPlayerAccount(name, phone) {
  const password = playerPhoneDigits(phone) || '123456';
  const email = playerEmail(name, password);
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
    const aliasDoc = await firestore.getDoc(aliasRef);
    if (aliasDoc.exists() && aliasDoc.data().email) attempts.push(aliasDoc.data().email);
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
      snapshot => { attempts = 0; onData(snapshot.exists() ? snapshot.data() : null); },
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
export async function savePlayerData(uid, data) {
  if (!cloudEnabled) return;
  await firestore.setDoc(firestore.doc(db, 'playerData', uid), data);
}
export async function updateMyPlayerProfile(uid, displayName, displayNickname) {
  if (!cloudEnabled) return;
  await firestore.updateDoc(firestore.doc(db, 'playerData', uid), {
    displayName: String(displayName || '').trim(),
    displayNickname: String(displayNickname || '').trim()
  });
}
export async function savePlayerAttendance(uid, attendanceChoices) {
  if (!cloudEnabled) return;
  await firestore.updateDoc(firestore.doc(db, 'playerData', uid), { attendanceChoices });
}
export async function signOutAdmin() {
  if (cloudEnabled) await authSdk.signOut(auth);
}
export function listenToAppData(onData, onError) {
  if (!cloudEnabled) return () => {};
  return firestore.onSnapshot(firestore.doc(db, 'appData', 'current'), snapshot => {
    if (snapshot.exists()) onData(snapshot.data());
  }, onError);
}
export async function saveAppData(data) {
  if (!cloudEnabled) return;
  await firestore.setDoc(firestore.doc(db, 'appData', 'current'), data);
}
export function listenToRecords(collectionName, onData, onError) {
  if (!cloudEnabled) return () => {};
  return firestore.onSnapshot(firestore.collection(db, collectionName), snapshot => {
    onData(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }, onError);
}
export function listenToMyPollVotes(uid, onData, onError) {
  if (!cloudEnabled) return () => {};
  const votes = firestore.query(
    firestore.collection(db, 'pollVotes'),
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
  const voteRef = firestore.doc(db, 'pollVotes', voteId);
  const tallyRef = firestore.doc(db, 'pollTallies', tallyId);
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
