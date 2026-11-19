/* eslint-env browser */
/* global google */

// The drop page. Signs the person in with Google (when the server asks for
// it), then posts each dropped Markdown file to /api/convert and saves the
// PDF that comes back.
//
// Nothing here is a security check. The server verifies the Google token on
// every request (web/auth.js); this file only decides what to show.

(function () {
  const MARKDOWN_NAME = /\.(md|markdown)$/i;

  const signinSection = document.getElementById("signin");
  const signinPrompt = document.getElementById("signin-prompt");
  const signinButton = document.getElementById("signin-button");
  const dropSection = document.getElementById("drop");
  const zone = document.getElementById("zone");
  const fileInput = document.getElementById("file");
  const jobs = document.getElementById("jobs");
  const status = document.getElementById("status");

  let signInRequired = false;
  let token = null;
  let queue = Promise.resolve();

  function setStatus(message) {
    status.textContent = message;
  }

  function showDrop() {
    signinSection.hidden = true;
    dropSection.hidden = false;
  }

  function showSignIn(message) {
    token = null;
    if (message) signinPrompt.textContent = message;
    dropSection.hidden = true;
    signinSection.hidden = false;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load Google sign-in."));
      document.head.appendChild(script);
    });
  }

  async function startSignIn(clientId) {
    await loadScript("https://accounts.google.com/gsi/client");
    google.accounts.id.initialize({
      client_id: clientId,
      auto_select: true,
      callback: (response) => {
        token = response.credential;
        showDrop();
      },
    });
    google.accounts.id.renderButton(signinButton, { theme: "outline", size: "large", text: "signin_with" });
    google.accounts.id.prompt();
    showSignIn();
  }

  function addJob(name) {
    const item = document.createElement("li");
    item.className = "jobs__item jobs__item--working";
    const label = document.createElement("span");
    label.className = "jobs__name";
    label.textContent = name;
    const state = document.createElement("span");
    state.className = "jobs__state";
    state.textContent = "Waiting";
    item.append(label, state);
    jobs.prepend(item);
    return { item, state };
  }

  function pdfName(response, fallback) {
    const header = response.headers.get("Content-Disposition") || "";
    const match = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch (e) {
        return fallback;
      }
    }
    return fallback;
  }

  async function convert(file, job) {
    job.state.textContent = "Converting";
    const headers = { "Content-Type": "text/markdown" };
    if (token) headers.Authorization = `Bearer ${token}`;

    let response;
    try {
      response = await fetch(`/api/convert?name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers,
        body: file,
      });
    } catch (e) {
      throw new Error("Could not reach the server.");
    }

    if (response.status === 401 && signInRequired) {
      showSignIn("Your sign-in expired. Sign in again, then drop the file once more.");
      throw new Error("Sign in again.");
    }
    if (!response.ok) {
      let message = "That file could not be converted.";
      try {
        message = (await response.json()).error || message;
      } catch (e) {
        // Keep the default message.
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    const name = pdfName(response, file.name.replace(MARKDOWN_NAME, "") + ".pdf");
    const link = document.createElement("a");
    link.className = "jobs__link";
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.textContent = `Download ${name}`;
    job.state.replaceChildren(link);
    link.click();
  }

  function enqueue(files) {
    setStatus("");
    const accepted = [];
    for (const file of files) {
      if (MARKDOWN_NAME.test(file.name)) accepted.push(file);
      else setStatus(`${file.name} was skipped: only .md and .markdown files can be converted.`);
    }
    for (const file of accepted) {
      const job = addJob(file.name);
      queue = queue.then(async () => {
        try {
          await convert(file, job);
          job.item.className = "jobs__item jobs__item--done";
        } catch (error) {
          job.item.className = "jobs__item jobs__item--failed";
          job.state.textContent = error.message;
        }
      });
    }
  }

  fileInput.addEventListener("change", () => {
    enqueue(fileInput.files);
    fileInput.value = "";
  });

  for (const type of ["dragenter", "dragover"]) {
    zone.addEventListener(type, (event) => {
      event.preventDefault();
      zone.classList.add("drop__zone--over");
    });
  }
  for (const type of ["dragleave", "drop"]) {
    zone.addEventListener(type, (event) => {
      event.preventDefault();
      zone.classList.remove("drop__zone--over");
    });
  }
  zone.addEventListener("drop", (event) => enqueue(event.dataTransfer.files));

  // A file dropped beside the zone would otherwise replace the page.
  for (const type of ["dragover", "drop"]) {
    window.addEventListener(type, (event) => event.preventDefault());
  }

  (async () => {
    try {
      const config = await (await fetch("/api/config")).json();
      signInRequired = config.signIn;
      if (signInRequired) await startSignIn(config.clientId);
      else showDrop();
    } catch (error) {
      setStatus(error.message || "Could not start. Reload the page.");
    }
  })();
})();
