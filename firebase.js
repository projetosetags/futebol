import { firebaseConfig } from './firebase-config.js';

const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
let db = null;
let firestore = null;
let authSdk = null;
let auth = null;
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
export async function signInPlayer(firstName, phone) {
  const localDigits = playerPhoneDigits(phone);
  try {
    return (await authSdk.signInWithEmailAndPassword(auth, playerEmail(firstName, localDigits), localDigits)).user;
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
  try {
    user = (await authSdk.createUserWithEmailAndPassword(auth, playerEmail(firstName, localDigits), localDigits)).user;
  } catch (error) {
    if (error.code !== 'auth/email-already-in-use') throw error;
    user = (await authSdk.signInWithEmailAndPassword(auth, playerEmail(firstName, localDigits), localDigits)).user;
  }
  const requestRef = firestore.doc(db, 'playerAccessRequests', user.uid);
  const previousRequest = await firestore.getDoc(requestRef);
  if (previousRequest.exists()) return user;
  await firestore.setDoc(requestRef, { firstName: String(firstName).trim(), fullName: String(fullName || firstName).trim(), nickname: String(nickname || '').trim(), phone: digits, createdAt: new Date().toISOString(), status: 'pending' });
  return user;
}
export function listenToPlayerData(uid, onData, onError) {
  if (!cloudEnabled) return () => {};
  return firestore.onSnapshot(firestore.doc(db, 'playerData', uid), snapshot => onData(snapshot.exists() ? snapshot.data() : null), onError);
}
export async function savePlayerData(uid, data) {
  if (!cloudEnabled) return;
  await firestore.setDoc(firestore.doc(db, 'playerData', uid), data);
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
export async function saveRecord(collectionName, record) {
  if (!cloudEnabled) return;
  const { id, ...data } = record;
  await firestore.setDoc(firestore.doc(db, collectionName, id), data);
}
export async function deleteRecord(collectionName, id) {
  if (!cloudEnabled) return;
  await firestore.deleteDoc(firestore.doc(db, collectionName, id));
}
