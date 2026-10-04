import { firebaseConfig } from './firebase-config.js';

const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
let db = null;
let storage = null;
let firestore = null;
let storageSdk = null;
let authSdk = null;
let auth = null;
if (configured) {
  const sdk = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js');
  firestore = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js');
  storageSdk = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js');
  authSdk = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');
  const app = sdk.initializeApp(firebaseConfig);
  db = firestore.getFirestore(app);
  storage = storageSdk.getStorage(app);
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
export async function uploadReceipt(file, path) {
  if (!cloudEnabled) return await new Promise((resolve,reject)=>{
    const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=reject; reader.readAsDataURL(file);
  });
  const reference=storageSdk.ref(storage,`comprovantes/${path}`);
  await storageSdk.uploadBytes(reference,file,{contentType:file.type||'application/octet-stream'});
  return await storageSdk.getDownloadURL(reference);
}
