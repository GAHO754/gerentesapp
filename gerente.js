// gerente.js PRO FINAL - Realtime Database

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

  const date = new Date(ts);

  return date.toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

// ================= LOGIN =================

async function loginGerente() {
  const emailInput = document.getElementById("emailGerente");
  const passwordInput = document.getElementById("passwordGerente");

  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value.trim() : "";

  if (!email || !password) {
    alert("Ingresa correo y contraseña.");
    return;
  }

  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);

    const result = await validarRolGerente(cred.user);

    if (!result.ok) {
      await auth.signOut();

      if (result.reason === "NO_PROFILE") {
        alert("Tu usuario no tiene perfil asignado en Realtime Database.");
      } else if (result.reason === "INACTIVE") {
        alert("Tu usuario está inactivo.");
      } else if (result.reason === "NO_ROLE") {
        alert("No tienes permisos de gerente.");
      } else {
        alert("No se pudo validar tu acceso.");
      }

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
  auth.signOut()
    .then(() => {
      window.location.href = "login-gerente.html";
    })
    .catch(error => {
      console.error("Error cerrando sesión:", error);
      alert("No se pudo cerrar sesión.");
    });
}

// ================= AUTH CONTROL =================

auth.onAuthStateChanged(async (user) => {
  const page = location.pathname.split("/").pop() || "login-gerente.html";

  if (!user && page !== "login-gerente.html") {
    window.location.href = "login-gerente.html";
    return;
  }

  if (!user) return;

  if (page === "login-gerente.html") {
    const result = await validarRolGerente(user);

    if (result.ok) {
      console.log("Usuario gerente validado, enviando al panel:", user.email);
      window.location.href = "panel-gerente.html";
      return;
    }

    console.warn("Usuario sin acceso:", result.reason);
    await auth.signOut();
    return;
  }

  const result = await validarRolGerente(user);

  if (!result.ok) {
    await auth.signOut();
    alert("No tienes acceso al panel de gerentes.");
    window.location.href = "login-gerente.html";
    return;
  }

  if (document.getElementById("tablaCanjes")) {
    cargarCanjesGerente();
  }
});

// ================= VALIDAR ROL RTDB =================

async function validarRolGerente(user) {
  try {
    if (!user) {
      return { ok: false, reason: "NO_AUTH" };
    }

    const snap = await rtdb.ref(`users/${user.uid}`).once("value");

    if (!snap.exists()) {
      console.log("No existe usuario en Realtime Database:", user.uid);
      return {
        ok: false,
        reason: "NO_PROFILE"
      };
    }

    const data = snap.val() || {};
    const role = String(data.role || "").toLowerCase().trim();

    if (data.activo === false) {
      return {
        ok: false,
        reason: "INACTIVE"
      };
    }

    if (!["gerente", "admin", "manager"].includes(role)) {
      return {
        ok: false,
        reason: "NO_ROLE"
      };
    }

    return {
      ok: true,
      data
    };

  } catch (error) {
    console.error("Error validando rol gerente:", error);

    return {
      ok: false,
      reason: "RTDB_ERROR",
      error
    };
  }
}

// ================= SCANNER =================

async function iniciarScannerGerente() {
  const qrReader = document.getElementById("qr-reader");

  if (!qrReader) {
    alert("No se encontró el lector QR.");
    return;
  }

  if (qrScannerGerente) return;

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
    console.error("Error cámara:", error);
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

// ================= BUSCAR CANJE RTDB =================

async function buscarCanjePorQR(qrText) {
  const redemptionId = String(qrText || "").trim();

  if (!redemptionId) {
    alert("QR inválido.");
    return;
  }

  try {
    const snap = await rtdb.ref(`redemptions/${redemptionId}`).once("value");

    if (!snap.exists()) {
      limpiarCanjeActual();
      alert("QR no válido o no existe.");
      return;
    }

    const data = snap.val();

    canjeActualId = redemptionId;
    canjeActualData = data;

    mostrarCanje(data);

    if (data.status !== "pendiente") {
      alert("Este canje ya fue utilizado o no está disponible.");
    }

  } catch (error) {
    console.error("Error buscando canje:", error);
    alert("Error al buscar el canje.");
  }
}

function mostrarCanje(data) {
  const card = document.getElementById("canjeCard");
  if (card) card.style.display = "block";

  const cliente = document.getElementById("clienteCanje");
  const beneficio = document.getElementById("beneficioCanje");
  const monto = document.getElementById("montoCanje");
  const estado = document.getElementById("estadoCanje");

  if (cliente) cliente.textContent = data.clienteEmail || data.clienteNombre || data.userId || "---";
  if (beneficio) beneficio.textContent = data.beneficio || "---";
  if (monto) monto.textContent = money(data.monto || 0);
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

// ================= VALIDAR CANJE RTDB =================

async function validarCanjeGerente() {
  const user = auth.currentUser;

  if (!user) {
    alert("Sesión no válida.");
    return;
  }

  if (!canjeActualId || !canjeActualData) {
    alert("Primero escanea un QR.");
    return;
  }

  const sucursal = document.getElementById("sucursalCanje").value;

  if (!sucursal) {
    alert("Selecciona la sucursal donde se realiza el canje.");
    return;
  }

  const canjeRef = rtdb.ref(`redemptions/${canjeActualId}`);

  try {
    const tx = await canjeRef.transaction(current => {
      if (current === null) {
        return;
      }

      if (current.status !== "pendiente") {
        return;
      }

      return {
        ...current,
        status: "canjeado",
        sucursalCanje: sucursal,
        sucursalCanjeNombre: SUCURSALES[sucursal] || sucursal,
        gerenteEmail: user.email,
        gerenteUid: user.uid,
        redeemedAt: Date.now()
      };
    });

    if (!tx.committed) {
      alert("Este QR ya fue canjeado o no está disponible.");
      limpiarCanjeActual();
      cargarCanjesGerente();
      return;
    }

    await rtdb.ref("auditLogs").push().set({
      type: "CANJE_VALIDADO",
      redemptionId: canjeActualId,
      gerenteEmail: user.email,
      gerenteUid: user.uid,
      sucursalCanje: sucursal,
      sucursalCanjeNombre: SUCURSALES[sucursal] || sucursal,
      beneficio: canjeActualData.beneficio || "",
      monto: canjeActualData.monto || 0,
      clienteEmail: canjeActualData.clienteEmail || "",
      createdAt: Date.now()
    });

    alert("Canje validado correctamente.");

    limpiarCanjeActual();
    cargarCanjesGerente();

  } catch (error) {
    console.error("Error validando canje:", error);
    alert("No se pudo validar el canje: " + error.message);
  }
}

// ================= TABLA CANJES RTDB =================

async function cargarCanjesGerente() {
  const tbody = document.getElementById("tablaCanjes");

  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="6">Cargando canjes...</td>
    </tr>
  `;

  try {
    rtdb.ref("redemptions")
      .orderByChild("status")
      .equalTo("canjeado")
      .limitToLast(50)
      .on("value", snapshot => {
        const data = snapshot.val();

        if (!data) {
          tbody.innerHTML = `
            <tr>
              <td colspan="6">Todavía no hay canjes realizados.</td>
            </tr>
          `;
          return;
        }

        const canjes = Object.values(data).sort((a, b) => {
          return (b.redeemedAt || 0) - (a.redeemedAt || 0);
        });

        tbody.innerHTML = "";

        canjes.forEach(r => {
          tbody.innerHTML += `
            <tr>
              <td>${formatDate(r.redeemedAt)}</td>
              <td>${r.clienteEmail || "---"}</td>
              <td>${r.beneficio || "---"}</td>
              <td>${money(r.monto || 0)}</td>
              <td>${r.sucursalCanjeNombre || SUCURSALES[r.sucursalCanje] || "---"}</td>
              <td>${r.gerenteEmail || "---"}</td>
            </tr>
          `;
        });
      });

  } catch (error) {
    console.error("Error cargando canjes:", error);

    tbody.innerHTML = `
      <tr>
        <td colspan="6">Error al cargar canjes.</td>
      </tr>
    `;
  }
}

// ================= PASSWORD =================

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
