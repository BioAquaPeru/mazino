const WHATSAPP_NUMBER = "+51928795151";

const playerInput = document.querySelector("#playerName");
const joinButton = document.querySelector("#joinButton");
const statusText = document.querySelector("#status");

function openWhatsApp() {
  const playerName = playerInput.value.trim();

  if (!playerName) {
    statusText.textContent = "Escribe tu nick para entrar.";
    playerInput.focus();
    return;
  }

  const message = `uneme a Mazino soy ${playerName}`;
  const phonePath = WHATSAPP_NUMBER ? `/${WHATSAPP_NUMBER}` : "/";
  const url = `https://wa.me${phonePath}?text=${encodeURIComponent(message)}`;

  window.open(url, "_blank", "noopener,noreferrer");
}

joinButton.addEventListener("click", openWhatsApp);

playerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    openWhatsApp();
  }
});
