"use strict";

// gerente.js - Applebee's Lealtad / Realtime Database
// Versión: gerente_control_2_regenerada

let qrScannerGerente = null;
let canjeActualId = null;
let canjeActualData = null;
let gerenteActual = null;
let canjesCargados = [];
let validandoCanje = false;
let procesandoQR = false;
let modalResolver = null;
let statusTimer = null;
let idleTimer = null;
let uiInicializada = false;

const SESSION_IDLE_MS = 20 * 60 * 1000;
const MAX_HISTORY_ITEMS = 100;

const SUCURSALES = Object.freeze({
  applebees_torres: "Applebee’s Torres",
  applebees_triunfo: "Applebee’s Triunfo",
  applebees_tecnologico: "Applebee’s Tecnológico"
});

const ROLES_PERMITIDOS = new Set(["gerente", "manager", "admin"]);

// ================= UTILIDADES =================

function obtenerElemento(id) {
  return document.getElementById(id);
}

function normalizarTexto(value) {
  return String(value ?? "").trim();
}

function normalizarStatus(status) {
  return normalizarTexto(status).toLowerCase();
}

function money(value) {
  const number = Number(value || 0);

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  }).format(Number.isFinite(number) ? number : 0);
}

function formatDate(timestamp) {
  const value = Number(timestamp);

  if (!Number.isFinite(value) || value <= 0) return "---";

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function nombreSucursal(id) {
  return SUCURSALES[id] || normalizarTexto(id) || "---";
}

function obtenerNombrePerfil(data, user) {
  const candidates = [
    data?.nombreCompleto,
    data?.fullName,
    data?.nombre,
    data?.name,
    data?.displayName,
    user?.displayName
  ];

  const match = candidates.map(normalizarTexto).find(Boolean);

  if (match) return match;

  const email = normalizarTexto(user?.email || data?.email);
  return email ? email.split("@")[0] : "Gerente autorizado";
}

function obtenerIniciales(nombre) {
  const parts = normalizarTexto(nombre)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return parts.map(part => part.charAt(0).toUpperCase()).join("") || "GE";
}

function esAdmin(perfil = gerenteActual) {
  return normalizarStatus(perfil?.role) === "admin";
}

function normalizarSucursalesPerfil(data) {
  const source =
    data?.sucursalesAutorizadas ??
    data?.sucursales ??
    data?.branches ??
    data?.sucursal ??
    [];

  let values = [];

  if (Array.isArray(source)) {
    values = source;
  } else if (source && typeof source === "object") {
    values = Object.entries(source)
      .filter(([, enabled]) => enabled === true || enabled === 1 || enabled === "true")
      .map(([id]) => id);
  } else if (typeof source === "string") {
    values = source.split(",");
  }

  return [...new Set(values.map(normalizarTexto).filter(id => SUCURSALES[id]))];
}

function sucursalesPermitidas(perfil = gerenteActual) {
  if (esAdmin(perfil)) return Object.keys(SUCURSALES);
  return Array.isArray(perfil?.sucursales) ? perfil.sucursales : [];
}

function sucursalAutorizada(id, perfil = gerenteActual) {
  return sucursalesPermitidas(perfil).includes(id);
}

function setText(id, value) {
  const element = obtenerElemento(id);
  if (element) element.textContent = value;
}

function mostrarEstadoApp(message, type = "info", duration = 4200) {
  const box = obtenerElemento("appStatus");

  if (!box) return;

  window.clearTimeout(statusTimer);
  box.textContent = message;
  box.className = "app-status is-visible";

  if (type === "success") box.classList.add("is-success");
  if (type === "error") box.classList.add("is-error");

  if (duration > 0) {
    statusTimer = window.setTimeout(() => {
      box.className = "app-status";
      box.textContent = "";
    }, duration);
  }
}

function mostrarMensajeLogin(message = "", type = "error") {
  const box = obtenerElemento("loginMessage");

  if (!box) return;

  box.textContent = message;
  box.className = "form-message";

  if (message) {
    box.classList.add("is-visible", type === "success" ? "is-success" : "is-error");
  }
}

function setLoginLoading(isLoading) {
  const button = obtenerElemento("btnLoginGerente");
  const email = obtenerElemento("emailGerente");
  const password = obtenerElemento("passwordGerente");

  if (button) {
    button.disabled = isLoading;
    button.classList.toggle("is-loading", isLoading);
  }

  if (email) email.disabled = isLoading;
  if (password) password.disabled = isLoading;
}

function mensajeErrorLogin(error) {
  switch (error?.code) {
    case "auth/invalid-email":
      return "El formato del correo no es válido.";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "El correo o la contraseña no son correctos.";
    case "auth/user-disabled":
      return "Esta cuenta fue deshabilitada. Comunícate con el administrador.";
    case "auth/too-many-requests":
      return "Se realizaron demasiados intentos. Espera unos minutos e inténtalo nuevamente.";
    case "auth/network-request-failed":
      return "No hay conexión con el servicio. Revisa internet e inténtalo nuevamente.";
    default:
      return "No fue posible iniciar sesión. Inténtalo nuevamente.";
  }
}

// ================= INICIALIZACIÓN DE INTERFAZ =================

function inicializarInterfazGerente() {
  if (uiInicializada) return;
  uiInicializada = true;

  const loginForm = obtenerElemento("loginGerenteForm");
  const togglePassword = obtenerElemento("btnTogglePassword");
  const logoutButton = obtenerElemento("btnCerrarSesion");
  const openCameraButton = obtenerElemento("btnAbrirCamara");
  const stopCameraButton = obtenerElemento("btnDetenerCamara");
  const validateButton = obtenerElemento("btnValidarCanje");
  const cancelRedemptionButton = obtenerElemento("btnCancelarCanje");
  const updateHistoryButton = obtenerElemento("btnActualizarCanjes");
  const searchInput = obtenerElemento("buscarCanje");
  const branchFilter = obtenerElemento("filtroSucursal");
  const redemptionBranch = obtenerElemento("sucursalCanje");
  const modalConfirmButton = obtenerElemento("btnConfirmarModal");
  const modalCancelButton = obtenerElemento("btnCancelarModal");

  loginForm?.addEventListener("submit", loginGerente);
  togglePassword?.addEventListener("click", togglePasswordGerente);
  logoutButton?.addEventListener("click", cerrarSesionGerente);
  openCameraButton?.addEventListener("click", iniciarScannerGerente);
  stopCameraButton?.addEventListener("click", detenerScannerGerente);
  validateButton?.addEventListener("click", solicitarConfirmacionCanje);
  cancelRedemptionButton?.addEventListener("click", limpiarCanjeActual);
  updateHistoryButton?.addEventListener("click", cargarCanjesGerente);
  searchInput?.addEventListener("input", aplicarFiltrosHistorial);
  branchFilter?.addEventListener("change", aplicarFiltrosHistorial);
  redemptionBranch?.addEventListener("change", actualizarBotonValidar);
  modalConfirmButton?.addEventListener("click", () => resolverModalCanje(true));
  modalCancelButton?.addEventListener("click", () => resolverModalCanje(false));

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !obtenerElemento("modalConfirmarCanje")?.classList.contains("is-hidden")) {
      resolverModalCanje(false);
    }
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get("sesion") === "inactiva") {
    mostrarMensajeLogin("La sesión se cerró por inactividad. Ingresa nuevamente.");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", inicializarInterfazGerente, { once: true });
} else {
  inicializarInterfazGerente();
}

// ================= LOGIN =================

async function loginGerente(event) {
  event?.preventDefault();

  const emailInput = obtenerElemento("emailGerente");
  const passwordInput = obtenerElemento("passwordGerente");
  const email = normalizarTexto(emailInput?.value).toLowerCase();
  const password = String(passwordInput?.value ?? "");

  mostrarMensajeLogin();

  if (!email || !password) {
    mostrarMensajeLogin("Ingresa tu correo y contraseña.");
    (!email ? emailInput : passwordInput)?.focus();
    return;
  }

  try {
    setLoginLoading(true);
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

    const credential = await auth.signInWithEmailAndPassword(email, password);
    const result = await validarRolGerente(credential.user);

    if (!result.ok) {
      await auth.signOut();
      mostrarMensajeLogin(mensajeAccesoPerfil(result.reason));
      return;
    }

    mostrarMensajeLogin("Acceso autorizado. Abriendo el panel...", "success");
    window.location.replace("panel-gerente.html");
  } catch (error) {
    console.error("Error de inicio de sesión de gerente:", error);
    mostrarMensajeLogin(mensajeErrorLogin(error));
  } finally {
    setLoginLoading(false);
  }
}

function mensajeAccesoPerfil(reason) {
  switch (reason) {
    case "NO_PROFILE":
      return "La cuenta no tiene un perfil autorizado.";
    case "INACTIVE":
      return "La cuenta está inactiva. Comunícate con el administrador.";
    case "NO_ROLE":
      return "La cuenta no tiene permisos para entrar al panel.";
    default:
      return "No fue posible verificar los permisos de la cuenta.";
  }
}

function togglePasswordGerente() {
  const input = obtenerElemento("passwordGerente");
  const button = obtenerElemento("btnTogglePassword");
  const label = button?.querySelector(".show-password-text");

  if (!input || !button) return;

  const show = input.type === "password";
  input.type = show ? "text" : "password";
  button.setAttribute("aria-pressed", String(show));
  button.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
  if (label) label.textContent = show ? "Ocultar" : "Ver";
}

// ================= CONTROL DE AUTENTICACIÓN =================

auth.onAuthStateChanged(async user => {
  const page = location.pathname.split("/").pop() || "login-gerente.html";
  const isLoginPage = page === "login-gerente.html" || !obtenerElemento("tablaCanjes");

  if (!user) {
    gerenteActual = null;
    detenerControlInactividad();

    if (!isLoginPage) {
      window.location.replace("login-gerente.html");
    }
    return;
  }

  const result = await validarRolGerente(user);

  if (!result.ok) {
    await auth.signOut();

    if (isLoginPage) {
      mostrarMensajeLogin(mensajeAccesoPerfil(result.reason));
    } else {
      window.location.replace("login-gerente.html");
    }
    return;
  }

  gerenteActual = crearPerfilGerente(user, result.data);

  if (isLoginPage) {
    window.location.replace("panel-gerente.html");
    return;
  }

  renderizarPerfilGerente();
  cargarSelectoresSucursales();
  iniciarControlInactividad();
  await cargarCanjesGerente();
});

async function validarRolGerente(user) {
  try {
    if (!user) return { ok: false, reason: "NO_AUTH" };

    const snapshot = await rtdb.ref(`users/${user.uid}`).once("value");

    if (!snapshot.exists()) return { ok: false, reason: "NO_PROFILE" };

    const data = snapshot.val() || {};
    const role = normalizarStatus(data.role);

    if (data.activo === false || data.active === false || data.bloqueado === true) {
      return { ok: false, reason: "INACTIVE" };
    }

    if (!ROLES_PERMITIDOS.has(role)) {
      return { ok: false, reason: "NO_ROLE" };
    }

    return { ok: true, data: { ...data, role } };
  } catch (error) {
    console.error("Error validando perfil de gerente:", error);
    return { ok: false, reason: "RTDB_ERROR", error };
  }
}

function crearPerfilGerente(user, data) {
  return {
    uid: user.uid,
    email: normalizarTexto(user.email || data.email).toLowerCase(),
    nombre: obtenerNombrePerfil(data, user),
    role: normalizarStatus(data.role),
    sucursales: normalizarSucursalesPerfil(data),
    raw: data
  };
}

function renderizarPerfilGerente() {
  if (!gerenteActual) return;

  setText("gerenteNombre", gerenteActual.nombre);
  setText("gerenteCorreo", gerenteActual.email || "Sin correo registrado");
  setText("gerenteRol", esAdmin() ? "Administrador" : "Gerente");
  setText("gerenteIniciales", obtenerIniciales(gerenteActual.nombre));
  setText("responsableCanje", gerenteActual.nombre);

  const container = obtenerElemento("gerenteSucursales");
  if (!container) return;

  container.replaceChildren();
  const branches = sucursalesPermitidas();

  if (!branches.length) {
    const chip = document.createElement("span");
    chip.className = "branch-chip status-rejected";
    chip.textContent = "Sin sucursales asignadas";
    container.appendChild(chip);
    mostrarEstadoApp("Tu cuenta no tiene sucursales autorizadas. Solicita la asignación al administrador.", "error", 7000);
    return;
  }

  branches.forEach(id => {
    const chip = document.createElement("span");
    chip.className = "branch-chip";
    chip.textContent = nombreSucursal(id);
    container.appendChild(chip);
  });
}

function cargarSelectoresSucursales() {
  const redemptionSelect = obtenerElemento("sucursalCanje");
  const filterSelect = obtenerElemento("filtroSucursal");
  const branches = sucursalesPermitidas();

  if (redemptionSelect) {
    redemptionSelect.replaceChildren(new Option("Selecciona una sucursal", ""));
    branches.forEach(id => redemptionSelect.add(new Option(nombreSucursal(id), id)));
    redemptionSelect.disabled = branches.length === 0;

    if (branches.length === 1) {
      redemptionSelect.value = branches[0];
    }
  }

  if (filterSelect) {
    filterSelect.replaceChildren(new Option("Todas las autorizadas", ""));
    branches.forEach(id => filterSelect.add(new Option(nombreSucursal(id), id)));
  }

  actualizarBotonValidar();
}

async function cerrarSesionGerente() {
  try {
    await detenerScannerGerente();
    detenerControlInactividad();
    await auth.signOut();
    window.location.replace("login-gerente.html");
  } catch (error) {
    console.error("Error cerrando sesión:", error);
    mostrarEstadoApp("No fue posible cerrar la sesión. Inténtalo nuevamente.", "error");
  }
}

// ================= CIERRE POR INACTIVIDAD =================

function iniciarControlInactividad() {
  detenerControlInactividad();

  ["pointerdown", "keydown", "touchstart"].forEach(eventName => {
    document.addEventListener(eventName, reiniciarTemporizadorInactividad, { passive: true });
  });

  reiniciarTemporizadorInactividad();
}

function detenerControlInactividad() {
  window.clearTimeout(idleTimer);

  ["pointerdown", "keydown", "touchstart"].forEach(eventName => {
    document.removeEventListener(eventName, reiniciarTemporizadorInactividad);
  });
}

function reiniciarTemporizadorInactividad() {
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(async () => {
    await detenerScannerGerente();
    await auth.signOut();
    window.location.replace("login-gerente.html?sesion=inactiva");
  }, SESSION_IDLE_MS);
}

// ================= ESCÁNER =================

function actualizarEstadoScanner(state, text) {
  const badge = obtenerElemento("scannerStatus");
  const openButton = obtenerElemento("btnAbrirCamara");
  const stopButton = obtenerElemento("btnDetenerCamara");

  if (badge) {
    badge.textContent = text;
    badge.className = "status-badge";

    if (state === "active") badge.classList.add("status-scanning");
    else if (state === "error") badge.classList.add("status-error");
    else badge.classList.add("status-idle");
  }

  if (openButton) openButton.disabled = state === "active";
  if (stopButton) stopButton.disabled = state !== "active";
}

function restaurarPlaceholderScanner() {
  const reader = obtenerElemento("qr-reader");
  if (!reader || reader.querySelector("#scannerPlaceholder")) return;

  const placeholder = document.createElement("div");
  placeholder.id = "scannerPlaceholder";
  placeholder.className = "scanner-placeholder";

  const frame = document.createElement("span");
  frame.className = "scanner-frame";
  frame.setAttribute("aria-hidden", "true");

  const text = document.createElement("p");
  text.textContent = "La cámara aparecerá aquí";

  placeholder.append(frame, text);
  reader.appendChild(placeholder);
}

async function iniciarScannerGerente() {
  const reader = obtenerElemento("qr-reader");

  if (!gerenteActual) {
    mostrarEstadoApp("No se pudo verificar la sesión del gerente.", "error");
    return;
  }

  if (!sucursalesPermitidas().length) {
    mostrarEstadoApp("No puedes validar canjes porque no tienes sucursales asignadas.", "error");
    return;
  }

  if (!reader) return;

  if (qrScannerGerente) {
    mostrarEstadoApp("La cámara ya está activa.");
    return;
  }

  if (typeof Html5Qrcode === "undefined") {
    mostrarEstadoApp("No se pudo cargar el lector QR. Revisa tu conexión.", "error");
    return;
  }

  reader.replaceChildren();
  qrScannerGerente = new Html5Qrcode("qr-reader");

  try {
    await qrScannerGerente.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      async decodedText => {
        if (procesandoQR) return;
        procesandoQR = true;

        try {
          await detenerScannerGerente();
          await buscarCanjePorQR(decodedText);
        } finally {
          procesandoQR = false;
        }
      },
      () => {}
    );

    actualizarEstadoScanner("active", "Cámara activa");
  } catch (error) {
    console.error("Error abriendo cámara:", error);
    qrScannerGerente = null;
    restaurarPlaceholderScanner();
    actualizarEstadoScanner("error", "Error de cámara");
    mostrarEstadoApp("No se pudo abrir la cámara. Revisa los permisos del navegador.", "error");
  }
}

async function detenerScannerGerente() {
  if (!qrScannerGerente) {
    actualizarEstadoScanner("idle", "Cámara detenida");
    restaurarPlaceholderScanner();
    return;
  }

  const scanner = qrScannerGerente;
  qrScannerGerente = null;

  try {
    const state = scanner.getState?.();
    if (state === 2 || state === 3) await scanner.stop();
    await scanner.clear();
  } catch (error) {
    console.warn("La cámara ya estaba detenida:", error);
  } finally {
    actualizarEstadoScanner("idle", "Cámara detenida");
    restaurarPlaceholderScanner();
  }
}

// ================= CONSULTA DEL QR =================

function extraerIdCanje(qrText) {
  const raw = normalizarTexto(qrText);
  if (!raw) return "";

  let candidate = raw;

  try {
    const parsed = JSON.parse(raw);
    candidate = parsed.redemptionId || parsed.canjeId || parsed.id || raw;
  } catch (_) {
    try {
      const url = new URL(raw);
      candidate =
        url.searchParams.get("redemptionId") ||
        url.searchParams.get("canje") ||
        url.searchParams.get("id") ||
        url.pathname.split("/").filter(Boolean).pop() ||
        raw;
    } catch (_) {
      candidate = raw;
    }
  }

  candidate = normalizarTexto(candidate);

  if (!candidate || candidate.length > 200 || /[.#$\[\]\/]/.test(candidate)) {
    return "";
  }

  return candidate;
}

async function buscarCanjePorQR(qrText) {
  const qrId = extraerIdCanje(qrText);

  if (!qrId) {
    limpiarCanjeActual();
    mostrarEstadoApp("El código QR no tiene un formato válido.", "error");
    return;
  }

  try {
    let snapshot = await rtdb.ref(`redemptions/${qrId}`).once("value");
    let redemptionKey = qrId;
    let data = snapshot.val();

    if (!data) {
      snapshot = await rtdb.ref("redemptions")
        .orderByChild("redemptionId")
        .equalTo(qrId)
        .limitToFirst(1)
        .once("value");

      const matches = snapshot.val();

      if (matches) {
        redemptionKey = Object.keys(matches)[0];
        data = matches[redemptionKey];
      }
    }

    if (!data) {
      limpiarCanjeActual();
      mostrarEstadoApp("El QR no existe o ya no está disponible.", "error");
      return;
    }

    const status = normalizarStatus(data.status);
    const expiresAt = Number(data.expiresAt || data.expiraAt || 0);
    const expired = Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt < Date.now();

    canjeActualId = redemptionKey;
    canjeActualData = {
      ...data,
      redemptionId: data.redemptionId || redemptionKey,
      status,
      expired
    };

    mostrarCanje(canjeActualData);

    if (expired) {
      mostrarEstadoApp("Este QR está vencido y no puede aplicarse.", "error");
      return;
    }

    if (status !== "pendiente") {
      mostrarEstadoApp(`Este canje no está disponible. Estado: ${status || "desconocido"}.`, "error");
      return;
    }

    mostrarEstadoApp("QR leído correctamente. Revisa los datos antes de confirmar.", "success");
  } catch (error) {
    console.error("Error consultando el canje:", error);
    limpiarCanjeActual();
    mostrarEstadoApp("No fue posible consultar el canje. Inténtalo nuevamente.", "error");
  }
}

function mostrarCanje(data) {
  const card = obtenerElemento("canjeCard");
  const grid = document.querySelector(".manager-grid");
  const status = normalizarStatus(data.status);

  card?.classList.remove("is-hidden");
  grid?.classList.add("has-redemption");

  setText("clienteCanje", data.clienteNombre || data.clienteEmail || data.userId || "---");
  setText("beneficioCanje", data.beneficio || "---");
  setText("montoCanje", money(data.monto || 0));
  setText("folioCanje", data.redemptionId || canjeActualId || "---");
  setText("responsableCanje", gerenteActual?.nombre || "---");

  const statusElement = obtenerElemento("estadoCanje");
  if (statusElement) {
    statusElement.textContent = data.expired ? "Vencido" : status || "Desconocido";
    statusElement.className = "status-badge";

    if (data.expired || status !== "pendiente") statusElement.classList.add("status-rejected");
    else statusElement.classList.add("status-pending");
  }

  actualizarBotonValidar();
  card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function limpiarCanjeActual() {
  canjeActualId = null;
  canjeActualData = null;
  validandoCanje = false;

  obtenerElemento("canjeCard")?.classList.add("is-hidden");
  document.querySelector(".manager-grid")?.classList.remove("has-redemption");

  const branchSelect = obtenerElemento("sucursalCanje");
  if (branchSelect) {
    const branches = sucursalesPermitidas();
    branchSelect.value = branches.length === 1 ? branches[0] : "";
  }

  actualizarBotonValidar();
}

function actualizarBotonValidar() {
  const button = obtenerElemento("btnValidarCanje");
  const selectedBranch = obtenerElemento("sucursalCanje")?.value || "";
  if (!button) return;

  const available =
    Boolean(canjeActualId) &&
    normalizarStatus(canjeActualData?.status) === "pendiente" &&
    canjeActualData?.expired !== true &&
    sucursalAutorizada(selectedBranch) &&
    !validandoCanje;

  button.disabled = !available;
  button.textContent = validandoCanje ? "Aplicando canje..." : "Confirmar y aplicar canje";
}

// ================= MODAL DE CONFIRMACIÓN =================

async function solicitarConfirmacionCanje() {
  const branch = obtenerElemento("sucursalCanje")?.value || "";

  if (!canjeActualId || normalizarStatus(canjeActualData?.status) !== "pendiente") {
    mostrarEstadoApp("Primero escanea un canje pendiente.", "error");
    return;
  }

  if (!sucursalAutorizada(branch)) {
    mostrarEstadoApp("Selecciona una sucursal autorizada.", "error");
    return;
  }

  setText(
    "modalCanjeResumen",
    `${canjeActualData.beneficio || "Beneficio"} por ${money(canjeActualData.monto || 0)} en ${nombreSucursal(branch)}. Responsable: ${gerenteActual?.nombre || "---"}.`
  );

  const confirmed = await abrirModalCanje();
  if (confirmed) await validarCanjeGerente();
}

function abrirModalCanje() {
  const modal = obtenerElemento("modalConfirmarCanje");
  modal?.classList.remove("is-hidden");
  obtenerElemento("btnConfirmarModal")?.focus();

  return new Promise(resolve => {
    modalResolver = resolve;
  });
}

function resolverModalCanje(value) {
  obtenerElemento("modalConfirmarCanje")?.classList.add("is-hidden");

  if (modalResolver) {
    const resolve = modalResolver;
    modalResolver = null;
    resolve(Boolean(value));
  }
}

// ================= VALIDACIÓN ATÓMICA =================

async function validarCanjeGerente() {
  const user = auth.currentUser;
  const branch = obtenerElemento("sucursalCanje")?.value || "";

  if (!user || !gerenteActual || validandoCanje) return;

  if (!canjeActualId || !sucursalAutorizada(branch)) {
    mostrarEstadoApp("El canje o la sucursal no son válidos.", "error");
    return;
  }

  const originalId = canjeActualId;
  const validationId = rtdb.ref("auditLogs").push().key;

  try {
    validandoCanje = true;
    actualizarBotonValidar();

    const profileResult = await validarRolGerente(user);

    if (!profileResult.ok) {
      throw new Error("PROFILE_NOT_AUTHORIZED");
    }

    const freshProfile = crearPerfilGerente(user, profileResult.data);

    if (!sucursalAutorizada(branch, freshProfile)) {
      throw new Error("BRANCH_NOT_AUTHORIZED");
    }

    gerenteActual = freshProfile;
    renderizarPerfilGerente();

    const redemptionRef = rtdb.ref(`redemptions/${originalId}`);
    const transactionResult = await redemptionRef.transaction(current => {
      if (!current || normalizarStatus(current.status) !== "pendiente") {
        return;
      }

      const expiresAt = Number(current.expiresAt || current.expiraAt || 0);
      if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt < Date.now()) {
        return;
      }

      return {
        ...current,
        status: "canjeado",
        sucursalCanje: branch,
        sucursalCanjeNombre: nombreSucursal(branch),
        gerenteUid: gerenteActual.uid,
        gerenteNombre: gerenteActual.nombre,
        gerenteEmail: gerenteActual.email,
        gerenteRol: gerenteActual.role,
        redeemedAt: firebase.database.ServerValue.TIMESTAMP,
        validationId,
        validation: {
          id: validationId,
          gerenteUid: gerenteActual.uid,
          gerenteNombre: gerenteActual.nombre,
          gerenteEmail: gerenteActual.email,
          sucursalId: branch,
          sucursalNombre: nombreSucursal(branch),
          createdAt: firebase.database.ServerValue.TIMESTAMP
        }
      };
    }, undefined, false);

    if (!transactionResult.committed) {
      mostrarEstadoApp("Este QR ya fue utilizado, venció o dejó de estar disponible.", "error", 6500);
      limpiarCanjeActual();
      await cargarCanjesGerente();
      return;
    }

    const saved = transactionResult.snapshot.val() || {};

    try {
      await rtdb.ref(`auditLogs/${validationId}`).set({
        type: "CANJE_VALIDADO",
        validationId,
        redemptionKey: originalId,
        redemptionId: saved.redemptionId || originalId,
        gerenteUid: gerenteActual.uid,
        gerenteNombre: gerenteActual.nombre,
        gerenteEmail: gerenteActual.email,
        gerenteRol: gerenteActual.role,
        sucursalCanje: branch,
        sucursalCanjeNombre: nombreSucursal(branch),
        beneficio: saved.beneficio || "",
        monto: Number(saved.monto || 0),
        clienteEmail: saved.clienteEmail || "",
        clienteNombre: saved.clienteNombre || "",
        userId: saved.userId || "",
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });
    } catch (auditError) {
      // La información del responsable ya quedó dentro del propio canje.
      console.warn("No se pudo duplicar el registro en auditLogs:", auditError);
    }

    mostrarEstadoApp("Canje aplicado correctamente.", "success", 5500);
    limpiarCanjeActual();
    await cargarCanjesGerente();
  } catch (error) {
    console.error("Error aplicando el canje:", error);

    if (error.message === "BRANCH_NOT_AUTHORIZED") {
      mostrarEstadoApp("Ya no tienes autorización para validar en esa sucursal.", "error");
      cargarSelectoresSucursales();
    } else if (error.message === "PROFILE_NOT_AUTHORIZED") {
      mostrarEstadoApp("Tu cuenta dejó de estar autorizada. La sesión se cerrará.", "error");
      window.setTimeout(cerrarSesionGerente, 1800);
    } else {
      mostrarEstadoApp("No fue posible aplicar el canje. Inténtalo nuevamente.", "error");
    }
  } finally {
    validandoCanje = false;
    actualizarBotonValidar();
  }
}

// ================= HISTORIAL =================

async function cargarCanjesGerente() {
  const tbody = obtenerElemento("tablaCanjes");
  const button = obtenerElemento("btnActualizarCanjes");

  if (!tbody || !gerenteActual) return;

  mostrarFilaMensaje("Cargando canjes...");
  if (button) button.disabled = true;

  try {
    const branches = sucursalesPermitidas();

    if (!esAdmin() && branches.length === 0) {
      canjesCargados = [];
      mostrarFilaMensaje("No hay sucursales autorizadas para consultar.");
      setText("contadorCanjes", "0 registros");
      return;
    }

    let entries = [];

    if (esAdmin()) {
      const snapshot = await rtdb.ref("redemptions")
        .orderByChild("status")
        .equalTo("canjeado")
        .limitToLast(MAX_HISTORY_ITEMS)
        .once("value");

      entries = Object.entries(snapshot.val() || {});
    } else {
      const snapshots = await Promise.all(
        branches.map(branch =>
          rtdb.ref("redemptions")
            .orderByChild("sucursalCanje")
            .equalTo(branch)
            .limitToLast(MAX_HISTORY_ITEMS)
            .once("value")
        )
      );

      const unique = new Map();

      snapshots.forEach(snapshot => {
        Object.entries(snapshot.val() || {}).forEach(([key, value]) => {
          unique.set(key, value);
        });
      });

      entries = [...unique.entries()];
    }

    canjesCargados = entries
      .map(([key, value]) => ({ ...value, _key: key }))
      .filter(item => normalizarStatus(item.status) === "canjeado")
      .sort((a, b) => Number(b.redeemedAt || 0) - Number(a.redeemedAt || 0));

    canjesCargados = canjesCargados.slice(0, MAX_HISTORY_ITEMS);

    aplicarFiltrosHistorial();
    setText("ultimaActualizacion", `Actualizado: ${new Intl.DateTimeFormat("es-MX", { timeStyle: "short" }).format(new Date())}`);
  } catch (error) {
    console.error("Error cargando historial:", error);
    canjesCargados = [];
    mostrarFilaMensaje("No fue posible cargar los canjes.");
    setText("contadorCanjes", "0 registros");
  } finally {
    if (button) button.disabled = false;
  }
}

function aplicarFiltrosHistorial() {
  const query = normalizarTexto(obtenerElemento("buscarCanje")?.value).toLocaleLowerCase("es-MX");
  const branch = obtenerElemento("filtroSucursal")?.value || "";

  const filtered = canjesCargados.filter(item => {
    if (branch && item.sucursalCanje !== branch) return false;

    if (!query) return true;

    const searchable = [
      item.clienteNombre,
      item.clienteEmail,
      item.beneficio,
      item.gerenteNombre,
      item.gerenteEmail,
      item.redemptionId,
      item.validationId,
      item._key
    ]
      .map(normalizarTexto)
      .join(" ")
      .toLocaleLowerCase("es-MX");

    return searchable.includes(query);
  });

  renderizarHistorial(filtered);
}

function renderizarHistorial(items) {
  const tbody = obtenerElemento("tablaCanjes");
  if (!tbody) return;

  tbody.replaceChildren();

  if (!items.length) {
    mostrarFilaMensaje(canjesCargados.length ? "No hay coincidencias con los filtros." : "Todavía no hay canjes realizados.");
    setText("contadorCanjes", "0 registros");
    return;
  }

  const fragment = document.createDocumentFragment();

  items.forEach(item => {
    const row = document.createElement("tr");
    const fields = [
      ["Fecha", formatDate(item.redeemedAt)],
      ["Cliente", item.clienteNombre || item.clienteEmail || "---"],
      ["Beneficio", item.beneficio || "---"],
      ["Monto", money(item.monto || 0)],
      ["Sucursal", item.sucursalCanjeNombre || nombreSucursal(item.sucursalCanje)],
      ["Gerente", item.gerenteNombre || item.gerenteEmail || "---"],
      ["Folio", item.redemptionId || item._key || "---"]
    ];

    fields.forEach(([label, value], index) => {
      const cell = document.createElement("td");
      cell.dataset.label = label;
      cell.textContent = value;
      if (index === 6) cell.classList.add("table-folio");
      row.appendChild(cell);
    });

    fragment.appendChild(row);
  });

  tbody.appendChild(fragment);
  setText("contadorCanjes", `${items.length} ${items.length === 1 ? "registro" : "registros"}`);
}

function mostrarFilaMensaje(message) {
  const tbody = obtenerElemento("tablaCanjes");
  if (!tbody) return;

  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 7;
  cell.className = "table-message";
  cell.textContent = message;
  row.appendChild(cell);
  tbody.replaceChildren(row);
}
