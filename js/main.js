const WORKER_BASE = "https://rumor-mill-coffee-signup.rumormillcoffee.workers.dev";
const SUBSCRIBE_ENDPOINT = `${WORKER_BASE}/subscribe`;
const PREFERENCES_ENDPOINT = `${WORKER_BASE}/preferences`;
const REF_CLICK_ENDPOINT = `${WORKER_BASE}/ref-click`;

const referredByCode = new URLSearchParams(window.location.search).get("ref");
if (referredByCode) {
  fetch(REF_CLICK_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: referredByCode }),
  }).catch(() => {});
}

const form = document.getElementById("signup-form");
const emailInput = document.getElementById("email");
const honeypot = document.getElementById("company");
const message = document.getElementById("form-message");
const button = form.querySelector("button");

let messageTimeoutId = null;

function setMessage(text, type) {
  message.textContent = text;
  message.className = "form-message" + (type ? " " + type : "");

  clearTimeout(messageTimeoutId);
  if (type === "success") {
    messageTimeoutId = setTimeout(() => {
      message.textContent = "";
      message.className = "form-message";
    }, 10000);
  }
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
      body: JSON.stringify({ email, referredBy: referredByCode || undefined }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Something went wrong.");
    }

    setMessage("You're on the list.", "success");
    form.reset();
    showFlavorStep(email, data.referralCode);
  } catch (err) {
    setMessage(err.message || "Something went wrong. Try again.", "error");
  } finally {
    button.disabled = false;
  }
});

function openSheet(dialog) {
  dialog.showModal();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => dialog.classList.add("modal-open"));
  });
}

function closeSheet(dialog) {
  dialog.classList.remove("modal-open");
  dialog.addEventListener("transitionend", () => dialog.close(), { once: true });
}

function wireSheet(openTriggerId, closeButtonId, dialogId) {
  const dialog = document.getElementById(dialogId);
  document.getElementById(openTriggerId).addEventListener("click", () => openSheet(dialog));
  document.getElementById(closeButtonId).addEventListener("click", () => closeSheet(dialog));
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      closeSheet(dialog);
    }
  });
}

wireSheet("privacy-link", "privacy-close", "privacy-modal");
wireSheet("offer-details-link", "offer-close", "offer-modal");

const description = document.getElementById("description");
const signupStep = document.getElementById("signup-step");
const flavorStep = document.getElementById("flavor-step");
const flavorTags = document.getElementById("flavor-tags");
const flavorSubmit = document.getElementById("flavor-submit");
const flavorSkip = document.getElementById("flavor-skip");
const shareStep = document.getElementById("share-step");
const shareSubtext = document.getElementById("share-subtext");
const sharePreview = document.getElementById("share-preview");
const shareActions = document.getElementById("share-actions");
const shareDoneActions = document.getElementById("share-done-actions");
const shareSkip = document.getElementById("share-skip");
const shareCopy = document.getElementById("share-copy");
const shareDone = document.getElementById("share-done");
const shareDefaultSubtext = shareSubtext.textContent;
const selectedFlavors = new Set();
let pendingEmail = null;
let pendingReferralCode = null;

function showFlavorStep(email, referralCode) {
  pendingEmail = email;
  pendingReferralCode = referralCode || null;
  selectedFlavors.clear();
  flavorTags.querySelectorAll(".flavor-tag").forEach((tag) => tag.classList.remove("selected"));
  description.hidden = true;
  signupStep.hidden = true;
  flavorStep.hidden = false;
}

function buildInviteText() {
  const link = `${window.location.origin}/?ref=${pendingReferralCode}`;
  return `Sign up for limited-release coffee drops from Rumor Mill Coffee! ${link}`;
}

function showShareStep() {
  flavorStep.hidden = true;

  if (!pendingReferralCode) {
    finishOnboarding("You're on the list.");
    return;
  }

  shareSubtext.textContent = shareDefaultSubtext;
  sharePreview.textContent = buildInviteText();
  shareActions.hidden = false;
  shareDoneActions.hidden = true;
  shareStep.hidden = false;
}

function finishOnboarding(finalMessage) {
  flavorStep.hidden = true;
  shareStep.hidden = true;
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
  showShareStep();
});

flavorSubmit.addEventListener("click", async () => {
  if (selectedFlavors.size === 0) {
    showShareStep();
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
    showShareStep();
  }
});

shareSkip.addEventListener("click", () => {
  finishOnboarding("You're on the list.");
});

shareCopy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(buildInviteText());
    shareSubtext.textContent = "Link copied! Paste it into a text and send to a friend.";
    shareActions.hidden = true;
    shareDoneActions.hidden = false;
  } catch {
    finishOnboarding("You're on the list.");
  }
});

shareDone.addEventListener("click", () => {
  finishOnboarding("You're on the list. Thanks for spreading the word.");
});
