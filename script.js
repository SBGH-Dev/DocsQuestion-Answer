window.pdfText = "";
window.pdfFileName = "";
window.apiKey = localStorage.getItem("openai_api_key") || "";

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const fileNameDisplay = document.getElementById("fileName");
const mainSection = document.getElementById("mainSection");
const pdfTitle = document.getElementById("pdfTitle");
const pdfStats = document.getElementById("pdfStats");
const answerBox = document.getElementById("answerBox");
const questionInput = document.getElementById("questionInput");
const askBtn = document.getElementById("askBtn");
const apiKeyInput = document.getElementById("apiKeyInput");
const apiStatus = document.getElementById("apiStatus");

document.getElementById("year").textContent = new Date().getFullYear();

if (window.apiKey) {
  apiKeyInput.value = window.apiKey;
  apiStatus.textContent = "✅ API Key saved";
  apiStatus.classList.add("saved");
}

function saveApiKey() {
  const key = apiKeyInput.value.trim();
  if (key && key.startsWith("sk-")) {
    window.apiKey = key;
    localStorage.setItem("openai_api_key", key);
    apiStatus.textContent = "✅ API Key saved";
    apiStatus.classList.add("saved");
  } else {
    alert("Please enter a valid OpenAI API key (starts with sk-)");
  }
}

["dragenter", "dragover", "dragleave", "drop"].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});

["dragenter", "dragover"].forEach((evt) => {
  dropZone.addEventListener(evt, () => dropZone.classList.add("drag-over"));
});

["dragleave", "drop"].forEach((evt) => {
  dropZone.addEventListener(evt, () => dropZone.classList.remove("drag-over"));
});

fileInput.addEventListener("change", async function () {
  if (this.files.length > 0) {
    await handleFile(this.files[0]);
  }
});

dropZone.addEventListener("drop", async (e) => {
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    await handleFile(files[0]);
  }
});

dropZone.addEventListener("click", (e) => {
  if (e.target.closest(".upload-btn")) return;
  fileInput.click();
});

async function handleFile(file) {
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    alert("Only PDF files are supported.");
    return;
  }

  window.pdfFileName = file.name;
  fileNameDisplay.innerHTML = `📄 ${file.name}`;

  mainSection.classList.add("active");
  pdfTitle.textContent = file.name;
  pdfStats.textContent = "⏳ Extracting text from PDF...";

  try {
    const arrayBuffer = await file.arrayBuffer();
    const typedArray = new Uint8Array(arrayBuffer);

    const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
    const numPages = pdf.numPages;

    let fullText = "";
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(" ");
      fullText += pageText + "\n";
      pdfStats.textContent = `⏳ Processed ${pageNum}/${numPages} pages...`;
    }

    window.pdfText = fullText.trim();

    const maxChars = 10000;
    if (window.pdfText.length > maxChars) {
      window.pdfText =
        window.pdfText.substring(0, maxChars) + "\n\n[Document truncated...]";
    }

    pdfStats.innerHTML = `✅ Ready! ${numPages} page${numPages > 1 ? "s" : ""} • ${window.pdfText.length.toLocaleString()} chars`;

    answerBox.innerHTML =
      '<em style="color: #10a37f;">✅ PDF loaded! Enter your API key and ask questions.</em>';
  } catch (error) {
    console.error("PDF extraction error:", error);
    pdfStats.innerHTML = "❌ Error processing PDF";
    answerBox.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
  }
}

function clearPDF() {
  window.pdfText = "";
  window.pdfFileName = "";
  fileNameDisplay.textContent = "";
  mainSection.classList.remove("active");
  fileInput.value = "";
  answerBox.innerHTML =
    '<em style="color: #9ca3af;">Your AI-generated answer will appear here...</em>';
  questionInput.value = "";
}

function setQuestion(q) {
  questionInput.value = q;
  questionInput.focus();
}

async function askQuestion() {
  const question = questionInput.value.trim();

  if (!question) {
    alert("Please enter a question");
    return;
  }

  if (!window.pdfText) {
    alert("Please upload a PDF first");
    return;
  }

  if (!window.apiKey) {
    alert("Please enter your OpenAI API key first");
    apiKeyInput.focus();
    return;
  }

  answerBox.classList.add("loading");
  answerBox.innerHTML = '<div class="spinner"></div> Asking GPT-4...';
  askBtn.disabled = true;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that answers questions based on the provided PDF document. Answer based ONLY on the document content provided. If the answer is not in the document, say so clearly.",
          },
          {
            role: "user",
            content: `Document content:\n\n${window.pdfText}\n\nQuestion: ${question}\n\nPlease answer based on the document above.`,
          },
        ],
        max_tokens: 1000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: { message: "Unknown error" } }));

      if (response.status === 401) {
        throw new Error("Invalid API key. Please check your OpenAI API key.");
      } else if (response.status === 429) {
        throw new Error(
          "Rate limit exceeded or out of credits. Check your billing at platform.openai.com/settings/billing",
        );
      } else if (response.status === 0) {
        throw new Error(
          'Network error. Try using a local server: run "npx serve ." in this folder',
        );
      } else {
        throw new Error(error.error?.message || `API Error ${response.status}`);
      }
    }

    const data = await response.json();
    const answer = data.choices[0].message.content;

    answerBox.classList.remove("loading");
    answerBox.innerHTML = `<strong>🤖 GPT-4 Answer:</strong><br/><br/>${answer}`;
  } catch (error) {
    console.error("OpenAI API error:", error);
    answerBox.classList.remove("loading");
    answerBox.innerHTML = `<div class="error-message">❌ ${error.message}</div>`;
  } finally {
    askBtn.disabled = false;
  }
}

questionInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    askQuestion();
  }
});
