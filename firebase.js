// firebase.js

const firebaseConfig = {
  apiKey: "AIzaSyDudE8w4AZx9o3sB3pdaVFQah1GeIGJI3M",
  authDomain: "applev1demo.firebaseapp.com",
  projectId: "applev1demo",
  storageBucket: "applev1demo.firebasestorage.app",
  messagingSenderId: "1046800874782",
  appId: "1:1046800874782:web:11ce7b86b406035808dd0f",
  measurementId: "G-SC03N02S0R"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();

const db = firebase.firestore();

// 🔥 Corrige errores Firestore Listen/channel 400 en algunos navegadores/redes
db.settings({
  experimentalAutoDetectLongPolling: true
});

// Storage solo si tienes firebase-storage-compat.js cargado
let storage = null;
if (firebase.storage) {
  storage = firebase.storage();
}