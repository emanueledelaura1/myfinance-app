// Sincronizzazione multi-dispositivo (opzionale) tramite Firebase (Auth + Firestore).
// La configurazione Firebase è pubblica per natura: la sicurezza è garantita dalle
// regole di accesso di Firestore (ogni utente legge/scrive solo il proprio documento).
const Sync = (() => {
  let app = null;
  let auth = null;
  let firestore = null;
  let unsubscribeSnapshot = null;
  let pushTimer = null;

  function isAvailable() {
    return typeof firebase !== 'undefined';
  }

  function isInitialized() {
    return !!app;
  }

  function init(config) {
    if (!isAvailable()) throw new Error('SDK Firebase non caricato (verifica la connessione a internet).');
    if (app) return app;
    app = firebase.initializeApp(config);
    auth = firebase.auth();
    firestore = firebase.firestore();
    return app;
  }

  function onAuthChange(callback) {
    if (!auth) return;
    auth.onAuthStateChanged(callback);
  }

  function getCurrentUser() {
    return auth ? auth.currentUser : null;
  }

  function signUp(email, password) {
    return auth.createUserWithEmailAndPassword(email, password);
  }

  function signIn(email, password) {
    return auth.signInWithEmailAndPassword(email, password);
  }

  function signOutUser() {
    stopListening();
    return auth.signOut();
  }

  function pushState(state) {
    const user = getCurrentUser();
    if (!firestore || !user) return Promise.resolve();
    return firestore.collection('users').doc(user.uid).set(state);
  }

  function schedulePush(state) {
    const user = getCurrentUser();
    if (!firestore || !user) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushState(state).catch((err) => console.error('Errore sincronizzazione (invio):', err));
    }, 1200);
  }

  async function pullState() {
    const user = getCurrentUser();
    if (!firestore || !user) return null;
    const docSnap = await firestore.collection('users').doc(user.uid).get();
    return docSnap.exists ? docSnap.data() : null;
  }

  function listen(onRemoteChange) {
    const user = getCurrentUser();
    if (!firestore || !user) return;
    unsubscribeSnapshot = firestore.collection('users').doc(user.uid)
      .onSnapshot(
        (docSnap) => { if (docSnap.exists) onRemoteChange(docSnap.data()); },
        (err) => console.error('Errore sincronizzazione (ascolto):', err)
      );
  }

  function stopListening() {
    if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
  }

  return {
    isAvailable, isInitialized, init, onAuthChange, getCurrentUser,
    signUp, signIn, signOutUser, pushState, schedulePush, pullState, listen, stopListening,
  };
})();
