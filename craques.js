import { firebaseConfig } from './firebase-config.js';

const configured = Boolean(firebaseConfig?.apiKey && firebaseConfig?.projectId && firebaseConfig?.appId);
if (configured) {
  const appSdk = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js');
  const authSdk = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');
  const fs = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js');
  let app;
  try { app = appSdk.getApp(); } catch { app = appSdk.initializeApp(firebaseConfig); }
  const auth = authSdk.getAuth(app);
  const db = fs.getFirestore(app);
  let playerTeamName = '';

  const key = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  async function resolvePlayerTeam(user) {
    playerTeamName = '';
    if (!user || (firebaseConfig.adminUids || [firebaseConfig.adminUid]).includes(user.uid)) return;
    try {
      const snap = await fs.getDoc(fs.doc(db, 'playerData', user.uid));
      if (!snap.exists()) return;
      const data = snap.data();
      const playerId = data.playerId || '';
      const games = [...(data.rosterGames || []), ...(data.games || [])];
      const game = games.find(item => Array.isArray(item.teams) && item.teams.some(team => (team.playerIds || []).includes(playerId) || (team.players || []).some(name => key(name) === key(data.name)) || key(team.goalkeeper) === key(data.name)));
      if (!game) return;
      const team = game.teams.find(team => (team.playerIds || []).includes(playerId) || (team.players || []).some(name => key(name) === key(data.name)) || key(team.goalkeeper) === key(data.name));
      playerTeamName = team?.name || '';
    } catch (error) {
      console.warn('Não foi possível identificar o time do jogador para a votação.', error);
    }
  }

  function applyCraqueRules() {
    const panel = document.querySelector('.player-award-panel');
    if (panel && playerTeamName) {
      const intro = panel.querySelector('p.sub');
      if (intro) intro.textContent = `Vote em 1 craque do ${playerTeamName}. Você pode votar em qualquer integrante do seu time, inclusive em você mesmo.`;
      panel.querySelectorAll('.award-result').forEach(card => {
        const title = card.querySelector('h4')?.textContent || '';
        card.hidden = !key(title).startsWith(key(playerTeamName));
      });
    }
    const admin = document.querySelector('.award-admin-panel');
    if (admin) {
      const photoHead = [...admin.querySelectorAll('h3')].find(node => node.textContent.includes('Fotos dos times e dos craques'));
      if (photoHead) photoHead.textContent = 'Fotos dos times e dos craques · 1 foto de cada time + 1 foto de cada craque';
      const note = admin.querySelector('.note');
      if (note && !note.dataset.craquePhotoRule) {
        note.dataset.craquePhotoRule = '1';
        note.insertAdjacentHTML('beforebegin', '<p class="sub craque-photo-rule"><b>Fotos:</b> para 2 times, use 4 imagens: Time 1, Craque do Time 1, Time 2 e Craque do Time 2. O craque é definido pelo maior número de votos do próprio time.</p>');
      }
    }
  }

  let scheduled = false;
  const scheduleApply = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; applyCraqueRules(); });
  };
  new MutationObserver(scheduleApply).observe(document.documentElement, { childList: true, subtree: true });
  authSdk.onAuthStateChanged(auth, async user => { await resolvePlayerTeam(user); scheduleApply(); });
  scheduleApply();
}
