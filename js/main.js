const SUBSCRIBE_ENDPOINT = "https://rumor-mill-coffee-signup.rumormillcoffee.workers.dev/subscribe";

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
  } catch (err) {
    setMessage(err.message || "Something went wrong. Try again.", "error");
  } finally {
    button.disabled = false;
  }
});
