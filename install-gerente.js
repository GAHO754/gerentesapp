let deferredPromptGerente = null;

const btnInstallGerente = document.getElementById("btnInstallGerente");
const iosHintGerente = document.getElementById("iosHintGerente");
const installBoxGerente = document.getElementById("installBoxGerente");

const isIOSGerente = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandaloneGerente =
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

if (isStandaloneGerente && installBoxGerente) {
  installBoxGerente.style.display = "none";
}

if (isIOSGerente && !isStandaloneGerente && iosHintGerente) {
  iosHintGerente.style.display = "block";
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredPromptGerente = event;

  if (btnInstallGerente) {
    btnInstallGerente.style.display = "inline-flex";
  }
});

if (btnInstallGerente) {
  btnInstallGerente.addEventListener("click", async () => {
    if (!deferredPromptGerente) {
      if (isIOSGerente) {
        alert("En iPhone: abre Safari → Compartir → Agregar a pantalla de inicio.");
      } else {
        alert("En Android: abre Chrome, espera unos segundos y vuelve a presionar Instalar app.");
      }
      return;
    }

    deferredPromptGerente.prompt();

    const choice = await deferredPromptGerente.userChoice;

    if (choice.outcome === "accepted") {
      btnInstallGerente.style.display = "none";
    }

    deferredPromptGerente = null;
  });
}

window.addEventListener("appinstalled", () => {
  if (installBoxGerente) installBoxGerente.style.display = "none";
});