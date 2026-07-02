const WORKER_BASE = "https://rumor-mill-coffee-signup.rumormillcoffee.workers.dev";
const SUBSCRIBE_ENDPOINT = `${WORKER_BASE}/subscribe`;
const PREFERENCES_ENDPOINT = `${WORKER_BASE}/preferences`;

const form = document.getElementById("signup-form");
const emailInput = document.getElementById("email");
const honeypot = document.getElementById("company");
const message = document.getElementById("form-message");
const button = form.querySelector("button");

function setMessage(text, type) {
  message.textContent = text;
  message.className = "form-message" + (type ? " " + type : "");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (honeypot.value) {
    return; // silently drop bot submissions
  }

  const email = emailInput.value.trim();
  if (!email) {
    setMessage("Enter your email.", "error");
    return;
  }

  button.disabled = true;
  setMessage("Submitting...");

  try {
    const res = await fetch(SUBSCRIBE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Something went wrong.");
    }

    setMessage("You're on the list.", "success");
    form.reset();
    showFlavorStep(email);
  } catch (err) {
    setMessage(err.message || "Something went wrong. Try again.", "error");
  } finally {
    button.disabled = false;
  }
});

const privacyModal = document.getElementById("privacy-modal");
document.getElementById("privacy-link").addEventListener("click", () => {
  privacyModal.showModal();
});
document.getElementById("privacy-close").addEventListener("click", () => {
  privacyModal.close();
});
privacyModal.addEventListener("click", (e) => {
  if (e.target === privacyModal) {
    privacyModal.close();
  }
});

const description = document.getElementById("description");
const signupStep = document.getElementById("signup-step");
const flavorStep = document.getElementById("flavor-step");
const flavorTags = document.getElementById("flavor-tags");
const flavorSubmit = document.getElementById("flavor-submit");
const flavorSkip = document.getElementById("flavor-skip");
const selectedFlavors = new Set();
let pendingEmail = null;

function showFlavorStep(email) {
  pendingEmail = email;
  selectedFlavors.clear();
  flavorTags.querySelectorAll(".flavor-tag").forEach((tag) => tag.classList.remove("selected"));
  description.hidden = true;
  signupStep.hidden = true;
  flavorStep.hidden = false;
}

function finishFlavorStep(finalMessage) {
  flavorStep.hidden = true;
  description.hidden = false;
  signupStep.hidden = false;
  setMessage(finalMessage, "success");
}

flavorTags.addEventListener("click", (e) => {
  const tag = e.target.closest(".flavor-tag");
  if (!tag) return;

  const flavor = tag.dataset.flavor;
  if (selectedFlavors.has(flavor)) {
    selectedFlavors.delete(flavor);
    tag.classList.remove("selected");
  } else {
    selectedFlavors.add(flavor);
    tag.classList.add("selected");
  }
});

flavorSkip.addEventListener("click", () => {
  finishFlavorStep("You're on the list.");
});

flavorSubmit.addEventListener("click", async () => {
  if (selectedFlavors.size === 0) {
    finishFlavorStep("You're on the list.");
    return;
  }

  flavorSubmit.disabled = true;

  try {
    await fetch(PREFERENCES_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pendingEmail, flavors: Array.from(selectedFlavors) }),
    });
  } catch {
    // non-critical — the signup itself already succeeded
  } finally {
    flavorSubmit.disabled = false;
    finishFlavorStep("You're on the list. Thanks for sharing your taste.");
  }
});
