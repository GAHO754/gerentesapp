// gerente.js PRO FINAL

let qrScannerGerente = null;
let canjeActualId = null;
let canjeActualData = null;

const SUCURSALES = {
  applebees_torres: "Applebee’s Torres",
  applebees_triunfo: "Applebee’s Triunfo",
  applebees_tecnologico: "Applebee’s Tecnológico"
};

function money(n) {
  return "$" + Number(n || 0).toFixed(2);
}

function formatDate(ts) {
  if (!ts) return "---";

  let date = ts.toDate ? ts.toDate() : new Date(ts);

  return date.toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

// ================= LOGIN =================

async function loginGerente() {
  const email = document.getElementById("emailGerente").value.trim();
  const password = document.getElementById("passwordGerente").value.trim();

  if (!email || !password) {
    alert("Ingresa correo y contraseña.");
    return;
  }

  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);

    const doc = await db.collection("users").doc(cred.user.uid).get();

    if (!doc.exists) {
      await auth.signOut();
      alert("Tu usuario no tiene perfil en Firestore.");
      return;
    }

    const data = doc.data();
    const role = String(data.role || "").toLowerCase().trim();

    if (!["gerente", "admin", "manager"].includes(role)) {
      await auth.signOut();
      alert("No tienes permisos.");
      return;
    }

    window.location.href = "panel-gerente.html";

  } catch (error) {
    console.error("Login error:", error);
    alert("Error al iniciar sesión: " + error.message);
  }
}

// ================= LOGOUT =================

function cerrarSesionGerente() {
  auth.signOut().then(() => {
    window.location.href = "login-gerente.html";
  });
}

// ================= AUTH CONTROL =================

auth.onAuthStateChanged(async (user) => {
  const page = location.pathname.split("/").pop();

  if (!user && page !== "login-gerente.html") {
    window.location.href = "login-gerente.html";
    return;
  }

  if (!user) return;

  // 🔥 AUTO REDIRECT si ya está logeado
  if (user && page === "login-gerente.html") {
  console.log("Usuario ya autenticado en login gerente:", user.email);
  return;
}

  const permitido = await validarRolGerente(user);

  if (!permitido) {
    await auth.signOut();
    alert("No tienes acceso.");
    window.location.href = "login-gerente.html";
    return;
  }

  if (document.getElementById("tablaCanjes")) {
    cargarCanjesGerente();
  }
});

// ================= VALIDAR ROL =================

async function validarRolGerente(user) {
  try {
    const doc = await db.collection("users").doc(user.uid).get();

    if (!doc.exists) {
      console.log("No existe usuario en Firestore:", user.uid);
      return false;
    }

    const data = doc.data();
    const role = String(data.role || "").toLowerCase().trim();

    if (data.activo === false) {
      console.log("Usuario inactivo");
      return false;
    }

    return ["gerente", "admin", "manager"].includes(role);

  } catch (error) {
    console.error("Error validando rol:", error);
    return false;
  }
}

// ================= SCANNER =================

async function iniciarScannerGerente() {
  if (qrScannerGerente) return;

  qrScannerGerente = new Html5Qrcode("qr-reader");

  try {
    await qrScannerGerente.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      async (decodedText) => {
        await detenerScannerGerente();
        await buscarCanjePorQR(decodedText);
      }
    );
  } catch (error) {
    console.error(error);
    alert("Error cámara.");
    qrScannerGerente = null;
  }
}

async function detenerScannerGerente() {
  if (!qrScannerGerente) return;

  await qrScannerGerente.stop();
  await qrScannerGerente.clear();

  qrScannerGerente = null;
}

// ================= BUSCAR CANJE =================

async function buscarCanjePorQR(qrText) {
  try {
    const doc = await db.collection("redemptions").doc(qrText).get();

    if (!doc.exists) {
      alert("QR no válido");
      return;
    }

    canjeActualId = qrText;
    canjeActualData = doc.data();

    mostrarCanje(canjeActualData);

  } catch (error) {
    console.error(error);
  }
}

function mostrarCanje(data) {
  document.getElementById("canjeCard").style.display = "block";

  document.getElementById("clienteCanje").textContent = data.clienteEmail || "---";
  document.getElementById("beneficioCanje").textContent = data.beneficio || "---";
  document.getElementById("montoCanje").textContent = money(data.monto);
  document.getElementById("estadoCanje").textContent = data.status;
}

// ================= VALIDAR CANJE =================

async function validarCanjeGerente() {
  const user = auth.currentUser;

  if (!canjeActualId) {
    alert("Escanea primero");
    return;
  }

  const sucursal = document.getElementById("sucursalCanje").value;

  if (!sucursal) {
    alert("Selecciona sucursal");
    return;
  }

  const ref = db.collection("redemptions").doc(canjeActualId);

  try {
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);

      if (!doc.exists) throw new Error("NO_EXISTE");

      if (doc.data().status !== "pendiente") {
        throw new Error("YA_CANJEADO");
      }

      tx.update(ref, {
        status: "canjeado",
        sucursalCanje: sucursal,
        gerenteEmail: user.email,
        redeemedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    alert("Canje exitoso");

    cargarCanjesGerente();

  } catch (e) {
    alert("Error: " + e.message);
  }
}

// ================= TABLA =================

async function cargarCanjesGerente() {
  const tbody = document.getElementById("tablaCanjes");

  if (!tbody) return;

  const snap = await db.collection("redemptions")
    .where("status", "==", "canjeado")
    .orderBy("redeemedAt", "desc")
    .limit(50)
    .get();

  tbody.innerHTML = "";

  snap.forEach(doc => {
    const r = doc.data();

    tbody.innerHTML += `
      <tr>
        <td>${formatDate(r.redeemedAt)}</td>
        <td>${r.clienteEmail}</td>
        <td>${r.beneficio}</td>
        <td>${money(r.monto)}</td>
        <td>${SUCURSALES[r.sucursalCanje]}</td>
        <td>${r.gerenteEmail}</td>
      </tr>
    `;
  });
}

function togglePasswordGerente() {
  const input = document.getElementById("passwordGerente");
  const icon = document.querySelector(".toggle-pass");

  if (!input) return;

  if (input.type === "password") {
    input.type = "text";
    if (icon) icon.textContent = "🙈";
  } else {
    input.type = "password";
    if (icon) icon.textContent = "👁️";
  }
}
