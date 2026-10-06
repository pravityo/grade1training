/* Google sign-in, the family record and cloud save (Firebase Auth + Firestore).
   - Every parent signs in with their own Google account. Parents in the same family share one progress record (js/family.js).
   - Progress stays in localStorage first; the family copy is merged in (js/merge.js) and written back a few seconds after each save.
   - Signing in with Google is also what unlocks the Grown-ups area (js/gate.js).
   The Firebase scripts load only when needed (opening the gate, or a browser that already signed in). */
(function () {
  'use strict';
  const V = '10.12.5', BASE = `https://www.gstatic.com/firebasejs/${V}/`;
  const FLAG = 'grade1math.cloud';      // "1" once someone has signed in on this browser
  const LINK = 'grade1math.family';     // the family this device belongs to
  let hooks = null, fb = null, auth = null, db = null, user = null, loading = null, timer = null, busy = false, again = false, famId = null, fam = null, authKnown = false;
  const st = { state: 'off', message: '', at: 0 };
  const listeners = [];
  const say = (state, message) => { st.state = state; st.message = message || ''; if (state === 'synced') st.at = Date.now(); listeners.forEach(f => { try { f(); } catch (e) { /* ignore */ } }); };
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* private mode */ } return null; };
  const mail = () => Family.normEmail(user && user.email);

  function loadScript(src) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
  function load() {
    if (loading) return loading;
    say('loading', 'Getting ready...');
    loading = loadScript(BASE + 'firebase-app-compat.js').then(() => loadScript(BASE + 'firebase-auth-compat.js')).then(() => loadScript(BASE + 'firebase-firestore-compat.js')).then(() => {
      fb = window.firebase; fb.initializeApp(window.FIREBASE_CONFIG); auth = fb.auth(); db = fb.firestore();
      auth.onAuthStateChanged(u => { user = u; authKnown = true; if (u) { store(FLAG, '1'); syncNow(); } else { famId = null; fam = null; say('out'); } });
      say(user ? 'synced' : 'ready');
    }).catch(e => { loading = null; console.warn('Cloud: could not start', e); say('error', navigator.onLine ? 'Could not reach Google. Try again in a moment.' : 'You are offline. Signing in needs internet.'); throw e; });
    return loading;
  }
  const refs = () => ({ u: db.collection('users').doc(user.uid), f: db.collection('families').doc(famId), i: e => db.collection('invites').doc(e) });
  const stamp = () => fb.firestore.FieldValue.serverTimestamp();

  /* Find this account's family: its saved pointer, else an invite sent to its email, else start a new family (unless this device already belongs to one). */
  let joining = null;
  const join = () => famId ? Promise.resolve({ ok: true }) : (joining = joining || doJoin().finally(() => { joining = null; })); // one at a time, so two triggers cannot create two families
  async function doJoin() {
    const u = db.collection('users').doc(user.uid), snap = await u.get(), ud = snap.exists ? snap.data() : {}, linked = store(LINK);
    let fid = ud.family;
    if (!fid) {
      const inv = db.collection('invites').doc(mail()), isnap = await inv.get();
      if (isnap.exists && isnap.data().family) {
        fid = isnap.data().family; const fref = db.collection('families').doc(fid);
        await db.runTransaction(async tx => {
          const fs = await tx.get(fref); if (!fs.exists) throw Object.assign(new Error('gone'), { code: 'family-missing' });
          const f = Family.accept(fs.data(), user.uid, mail());
          tx.update(fref, { members: f.members, emails: f.emails, pending: f.pending }); tx.set(u, { family: fid }); tx.delete(inv);
        });
      } else if (linked) {
        return { ok: false, reason: 'This device belongs to a different family. Sign in with a parent account of that family, or ask a parent there to invite you.' };
      } else {
        fid = Family.newId(); let local = hooks.get();
        if (ud.state) { try { local = Merge.merge(local, JSON.parse(ud.state)); } catch (e) { /* ignore an unreadable old copy */ } }
        const f = Family.newFamily(user.uid, mail(), JSON.stringify(local)), batch = db.batch();
        batch.set(db.collection('families').doc(fid), Object.assign({}, f, { updated: stamp() })); batch.set(u, { family: fid }); await batch.commit();
      }
    }
    if (linked && linked !== fid) return { ok: false, reason: 'This device belongs to a different family. Sign in with a parent account of that family.' };
    store(LINK, fid); famId = fid; return { ok: true };
  }

  /* Merge the family copy into this device and write the result back, in one transaction so two devices cannot overwrite each other. */
  async function syncNow() {
    if (!user || !hooks) return;
    if (busy) { again = true; return; }
    busy = true; say('syncing', 'Saving...');
    try {
      const j = await join();
      if (!j.ok) { say('denied', j.reason); return; }
      const ref = refs().f;
      const out = await db.runTransaction(async tx => {
        const snap = await tx.get(ref); if (!snap.exists) throw Object.assign(new Error('gone'), { code: 'family-missing' });
        const data = snap.data(); if (!Family.isMember(data, user.uid)) throw Object.assign(new Error('removed'), { code: 'permission-denied' });
        let remote = null; try { remote = JSON.parse(data.state); } catch (e) { remote = null; }
        const m = remote ? Merge.merge(hooks.get(), remote) : hooks.get();
        tx.update(ref, { state: JSON.stringify(m), updated: stamp() });
        return { m, data };
      });
      fam = out.data; if (!Merge.same(out.m, hooks.get())) hooks.apply(out.m);
      say('synced');
    } catch (e) {
      const c = e && e.code;
      if (c === 'permission-denied' || c === 'family-missing') {
        // access was probably removed by another parent (or the rules are not published yet)
        famId = null; fam = null;
        try { await db.collection('users').doc(user.uid).delete(); } catch (x) { /* ignore */ }
        say('denied', c === 'family-missing' ? 'This family no longer exists. Sign out and sign in again.' : 'This account does not have access to this family (a parent may have removed it), or the cloud rules are not published yet.');
      } else say('error', navigator.onLine ? 'Could not save just now. It will retry.' : 'You are offline. It will save when you are back online.');
    } finally { busy = false; if (again) { again = false; pushSoon(); } }
  }
  function pushSoon() { if (!user || st.state === 'denied') return; clearTimeout(timer); timer = setTimeout(syncNow, 4000); }

  /* Ask Google who is at the keyboard. Used to unlock the Grown-ups area. Needs a tap, and the SDK preloaded, so the popup opens at once. */
  async function authenticate() {
    if (!auth) { try { await load(); } catch (e) { return { ok: false, reason: st.message }; } }
    const provider = new fb.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: user ? 'login' : 'select_account' }); // an already signed-in device must prove it again
    try { await auth.signInWithPopup(provider); }
    catch (e) {
      const c = e && e.code;
      if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return { ok: false, reason: '' };
      if (c === 'auth/popup-blocked') return { ok: false, reason: 'Your browser blocked the Google window. Allow pop-ups for this site and try again.' };
      if (c === 'auth/unauthorized-domain') return { ok: false, reason: 'This web address is not allowed yet. Add it under Authentication, Settings, Authorized domains.' };
      if (c === 'auth/network-request-failed') return { ok: false, reason: 'No internet. Signing in needs internet.' };
      return { ok: false, reason: 'Sign-in did not work. Please try again.' };
    }
    user = auth.currentUser;
    try { const j = await join(); if (!j.ok) { await signOut(); return j; } syncNow(); return { ok: true }; }
    catch (e) { return { ok: false, reason: e && e.code === 'permission-denied' ? 'The cloud rules are not published yet. Ask the app owner to publish them.' : 'Could not check your family. Please try again.' }; }
  }
  async function signOut() { store(FLAG, null); /* the device stays linked to its family */ if (auth) await auth.signOut(); user = null; famId = null; fam = null; if (window.GATE) GATE.lock(); say('out'); }

  /* Family management: invite by email, cancel an invite, remove a parent. */
  async function change(fn) {
    if (!user || !famId) return { ok: false, reason: 'Sign in first.' };
    try {
      const ref = refs().f, r = refs();
      const res = await db.runTransaction(async tx => {
        const snap = await tx.get(ref); if (!snap.exists) throw new Error('gone');
        const data = snap.data(), out = fn(data); if (!out.ok) return out;
        tx.update(ref, { members: out.fam.members, emails: out.fam.emails, pending: out.fam.pending, owner: out.fam.owner });
        if (out.invite) tx.set(r.i(out.invite), { family: famId, by: mail() });
        if (out.uninvite) tx.delete(r.i(out.uninvite));
        return Object.assign({ data: out.fam }, out);
      });
      if (res.ok) { fam = Object.assign({}, fam, res.data); say(st.state === 'error' ? 'synced' : st.state); }
      return res;
    } catch (e) { return { ok: false, reason: e && e.code === 'permission-denied' ? 'The cloud rules do not allow this yet.' : 'Could not do that just now. Check your internet and try again.' }; }
  }
  const invite = email => change(d => { const r = Family.invite(d, email); return r.ok ? { ok: true, fam: r.fam, invite: r.email } : r; });
  const revoke = email => change(d => ({ ok: true, fam: Family.revoke(d, email), uninvite: Family.normEmail(email) }));
  const removeParent = uid => change(d => Family.removeMember(d, uid, user.uid));

  window.Cloud = {
    attach(h) { hooks = h; if (store(FLAG)) load().catch(() => {}); },
    preload() { return load().catch(() => {}); },
    authenticate, signOut, syncNow, pushSoon, invite, revoke, removeParent,
    status: () => Object.assign({ email: user ? user.email : '', name: user ? (user.displayName || '') : '', checking: !!store(FLAG) && !authKnown && !user, signedIn: !!user, uid: user ? user.uid : '', family: fam ? { members: Family.list(fam, user && user.uid), pending: fam.pending || [] } : null }, st),
    onChange(f) { listeners.push(f); }, offChange(f) { const i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); }
  };
  // Automatic saving: 4 seconds after any change (pushSoon), every 2 minutes while the app is open (this also picks up the other
  // parent's devices), when the app comes back or the connection returns, and once more as the app is put away.
  window.addEventListener('online', () => { if (user) syncNow(); });
  document.addEventListener('visibilitychange', () => {
    if (!user) return;
    if (document.visibilityState === 'visible') syncNow(); else { clearTimeout(timer); syncNow(); }
  });
  window.addEventListener('pagehide', () => { if (user) { clearTimeout(timer); syncNow(); } });
  setInterval(() => { if (user && document.visibilityState === 'visible' && !busy) syncNow(); }, 120000);
})();
