// gerente.js PRO Applebee's

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

  let date;

  if (ts.toDate) {
    date = ts.toDate();
  } else {
    date = new Date(ts);
  }

  return date.toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short"
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

async function loginGerente() {
  const email = document.getElementById("emailGerente").value.trim();
  const password = document.getElementById("passwordGerente").value.trim();

  if (!email || !password) {
    alert("Ingresa correo y contraseña.");
    return;
  }

  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);

    const userDoc = await db.collection("users").doc(cred.user.uid).get();

    if (!userDoc.exists) {
      await auth.signOut();
      alert("Tu usuario no tiene perfil asignado.");
      return;
    }

    const userData = userDoc.data();

    if (!["gerente", "admin", "manager"].includes(userData.role)) {
      await auth.signOut();
      alert("No tienes permisos para acceder al panel de gerentes.");
      return;
    }

    window.location.href = "panel-gerente.html";
  } catch (error) {
    console.error(error);
    alert("Error al iniciar sesión: " + error.message);
  }
}

function cerrarSesionGerente() {
  auth.signOut().then(() => {
    window.location.href = "login-gerente.html";
  });
}

auth.onAuthStateChanged(async (user) => {
  const page = location.pathname.split("/").pop();

  const paginasGerentePublicas = ["login-gerente.html"];

  if (!user && !paginasGerentePublicas.includes(page)) {
    window.location.href = "login-gerente.html";
    return;
  }

  if (!user) return;

  if (page === "login-gerente.html") return;

  const permitido = await validarRolGerente(user);

  if (!permitido) {
    await auth.signOut();
    alert("No tienes permisos para entrar aquí.");
    window.location.href = "login-gerente.html";
    return;
  }

  if (document.getElementById("tablaCanjes")) {
    cargarCanjesGerente();
  }
});

async function validarRolGerente(user) {
  try {
    const doc = await db.collection("users").doc(user.uid).get();

    if (!doc.exists) return false;

    const role = doc.data().role;

    return ["gerente", "admin", "manager"].includes(role);
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function iniciarScannerGerente() {
  const reader = document.getElementById("qr-reader");

  if (!reader) {
    alert("No se encontró el lector QR.");
    return;
  }

  if (qrScannerGerente) {
    return;
  }

  qrScannerGerente = new Html5Qrcode("qr-reader");

  try {
    await qrScannerGerente.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: {
          width: 250,
          height: 250
        }
      },
      async (decodedText) => {
        await detenerScannerGerente();
        await buscarCanjePorQR(decodedText);
      },
      () => {}
    );
  } catch (error) {
    console.error(error);
    alert("No se pudo abrir la cámara. Revisa permisos del navegador.");
    qrScannerGerente = null;
  }
}

async function detenerScannerGerente() {
  if (!qrScannerGerente) return;

  try {
    await qrScannerGerente.stop();
    await qrScannerGerente.clear();
  } catch (error) {
    console.warn("Scanner ya estaba detenido:", error);
  }

  qrScannerGerente = null;
}

async function buscarCanjePorQR(qrText) {
  const redemptionId = String(qrText || "").trim();

  if (!redemptionId) {
    alert("QR inválido.");
    return;
  }

  try {
    const ref = db.collection("redemptions").doc(redemptionId);
    const doc = await ref.get();

    if (!doc.exists) {
      limpiarCanjeActual();
      alert("Este QR no existe o no pertenece a un canje válido.");
      return;
    }

    const data = doc.data();

    canjeActualId = redemptionId;
    canjeActualData = data;

    mostrarCanjeEnPantalla(data);

    if (data.status !== "pendiente") {
      alert("Este canje ya fue utilizado o no está disponible.");
    }
  } catch (error) {
    console.error(error);
    alert("Error al buscar el canje.");
  }
}

function mostrarCanjeEnPantalla(data) {
  const card = document.getElementById("canjeCard");

  if (card) card.style.display = "block";

  const cliente = document.getElementById("clienteCanje");
  const beneficio = document.getElementById("beneficioCanje");
  const monto = document.getElementById("montoCanje");
  const estado = document.getElementById("estadoCanje");

  if (cliente) cliente.textContent = data.clienteEmail || data.userId || "---";
  if (beneficio) beneficio.textContent = data.beneficio || "---";
  if (monto) monto.textContent = money(data.monto);
  if (estado) estado.textContent = data.status || "---";
}

function limpiarCanjeActual() {
  canjeActualId = null;
  canjeActualData = null;

  const card = document.getElementById("canjeCard");
  if (card) card.style.display = "none";

  const sucursal = document.getElementById("sucursalCanje");
  if (sucursal) sucursal.value = "";
}

async function validarCanjeGerente() {
  const user = auth.currentUser;

  if (!user) {
    alert("Sesión no válida.");
    return;
  }

  if (!canjeActualId || !canjeActualData) {
    alert("Primero escanea un QR de canje.");
    return;
  }

  const sucursal = document.getElementById("sucursalCanje").value;

  if (!sucursal) {
    alert("Selecciona la sucursal donde se realiza el canje.");
    return;
  }

  const ref = db.collection("redemptions").doc(canjeActualId);

  try {
    await db.runTransaction(async (transaction) => {
      const freshDoc = await transaction.get(ref);

      if (!freshDoc.exists) {
        throw new Error("NO_EXISTE");
      }

      const freshData = freshDoc.data();

      if (freshData.status !== "pendiente") {
        throw new Error("YA_CANJEADO");
      }

      transaction.update(ref, {
        status: "canjeado",
        sucursalCanje: sucursal,
        sucursalCanjeNombre: SUCURSALES[sucursal] || sucursal,
        gerenteEmail: user.email,
        gerenteUid: user.uid,
        redeemedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    alert("Canje validado correctamente.");

    limpiarCanjeActual();
    cargarCanjesGerente();
  } catch (error) {
    console.error(error);

    if (error.message === "YA_CANJEADO") {
      alert("Este QR ya fue canjeado anteriormente.");
    } else if (error.message === "NO_EXISTE") {
      alert("El canje ya no existe.");
    } else {
      alert("Error al validar el canje.");
    }
  }
}

async function cargarCanjesGerente() {
  const tbody = document.getElementById("tablaCanjes");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="6">Cargando canjes...</td>
    </tr>
  `;

  try {
    const snap = await db.collection("redemptions")
      .where("status", "==", "canjeado")
      .orderBy("redeemedAt", "desc")
      .limit(50)
      .get();

    if (snap.empty) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6">Todavía no hay canjes realizados.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = "";

    snap.forEach(doc => {
      const r = doc.data();

      tbody.innerHTML += `
        <tr>
          <td>${formatDate(r.redeemedAt)}</td>
          <td>${r.clienteEmail || "---"}</td>
          <td>${r.beneficio || "---"}</td>
          <td>${money(r.monto)}</td>
          <td>${r.sucursalCanjeNombre || SUCURSALES[r.sucursalCanje] || "---"}</td>
          <td>${r.gerenteEmail || "---"}</td>
        </tr>
      `;
    });
  } catch (error) {
    console.error(error);

    tbody.innerHTML = `
      <tr>
        <td colspan="6">Error al cargar canjes. Revisa índices/permisos de Firebase.</td>
      </tr>
    `;
  }
}