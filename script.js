// State Management
let subjects = JSON.parse(localStorage.getItem("subjects")) || [];
let tasks = JSON.parse(localStorage.getItem("tasks")) || [];
let currentSubjectId = null;

// Active View Router
async function navigateTo(pageName) {
    const container = document.getElementById("app-container");
    
    try {
        const response = await fetch(`views/${pageName}.html`);
        if (!response.ok) throw new Error("Page not found");
        const html = await response.text();
        container.innerHTML = html;

        // Update Nav UI
        document.querySelectorAll(".nav-btn").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.page === pageName);
        });

        // Initialize page-specific view models
        if (pageName === "dashboard") renderTasks();
        if (pageName === "subjects") {
            currentSubjectId = null;
            renderSubjects();
        }

        window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
        container.innerHTML = `<div class="card"><p>Error loading page view.</p></div>`;
    }
}

// Subject Management
function addSubject() {
    const nameInput = document.getElementById("subjectName");
    const diffInput = document.getElementById("subjectDifficulty");
    const name = nameInput ? nameInput.value.trim() : "";

    if (!name) return alert("Please enter a subject name.");

    subjects.push({ 
        id: Date.now(), 
        name, 
        difficulty: diffInput ? diffInput.value : "Medium",
        topics: [] 
    });
    saveData();
    if (nameInput) nameInput.value = "";
    renderSubjects();
}

function renderSubjects() {
    const container = document.getElementById("subjectWidgetGrid");
    if (!container) return;

    if (subjects.length === 0) {
        container.innerHTML = `<p class="empty-text"><i class="fa-solid fa-inbox"></i> No subjects added yet.</p>`;
        return;
    }

    container.innerHTML = subjects.map(sub => `
        <div class="subject-item" onclick="openSubjectDetail(${sub.id})" style="cursor: pointer;">
            <div>
                <strong>${sub.name}</strong>
                <span class="sub-badge">${sub.difficulty}</span>
            </div>
            <button class="delete-btn" onclick="deleteSubject(${sub.id}, event)">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `).join("");
}

function deleteSubject(id, event) {
    if (event) event.stopPropagation();
    subjects = subjects.filter(s => s.id !== id);
    saveData();
    
    if (currentSubjectId === id) {
        closeSubjectDetail();
    } else {
        renderSubjects();
    }
}

// Open / Close Subject Detail View
function openSubjectDetail(subjectId) {
    currentSubjectId = subjectId;
    const overviewSec = document.getElementById("subjectOverviewSection");
    const detailSec = document.getElementById("subjectDetailSection");

    if (overviewSec && detailSec) {
        overviewSec.classList.add("hidden");
        detailSec.classList.remove("hidden");
        renderSubjectDetail();
    }
}

function closeSubjectDetail() {
    currentSubjectId = null;
    const overviewSec = document.getElementById("subjectOverviewSection");
    const detailSec = document.getElementById("subjectDetailSection");

    if (overviewSec && detailSec) {
        detailSec.classList.add("hidden");
        overviewSec.classList.remove("hidden");
        renderSubjects();
    }
}

// Render Topics & Uploaded Files inside Selected Subject
function renderSubjectDetail() {
    const container = document.getElementById("subjectDetailContent");
    if (!container || !currentSubjectId) return;

    const sub = subjects.find(s => s.id === currentSubjectId);
    if (!sub) return closeSubjectDetail();

    container.innerHTML = `
        <div class="card subject-folder-card">
            <div class="subject-header" style="margin-bottom: 20px;">
                <h2><i class="fa-solid fa-folder-open"></i> ${sub.name}</h2>
                <span class="sub-badge">${sub.difficulty || 'Medium'}</span>
            </div>

            <!-- Add Topic Form -->
            <div class="add-topic-box" style="display: flex; gap: 10px; margin-bottom: 20px;">
                <input type="text" id="topic-input-${sub.id}" placeholder="Add topic folder (e.g. Chapter 1)..." style="flex: 1;">
                <button class="secondary-button" onclick="addTopic(${sub.id})">+ Add Topic</button>
            </div>

            <!-- List Topic Folders & Uploaded Files -->
            <div class="topics-container">
                ${(sub.topics || []).length === 0 
                    ? `<p class="empty-text"><i class="fa-solid fa-folder-plus"></i> No topic folders yet. Create one above!</p>`
                    : (sub.topics || []).map(topic => `
                        <div class="topic-folder" style="margin-bottom: 20px; padding: 16px; border-radius: 8px; background: var(--bg-subcard);">
                            <h4><i class="fa-solid fa-folder"></i> ${topic.name}</h4>
                            
                            <div class="upload-btn-wrapper" style="margin: 12px 0;">
                                <label class="file-upload-label" style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                                    <i class="fa-solid fa-file-arrow-up"></i> Upload PDF / Note
                                    <input type="file" accept=".pdf,image/*" onchange="uploadFile(${sub.id},${topic.id}, event)" style="display: none;">
                                </label>
                            </div>

                            <ul class="file-list" style="list-style: none; padding: 0;">
                                ${(topic.files || []).map(file => `
                                    <li style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border-color);">
                                        <!-- Open PDF via viewFile without triggering local download -->
                                        <a href="javascript:void(0)" onclick="viewFile(${sub.id}, ${topic.id}, ${file.id})" style="text-decoration: none; color: inherit;">
                                            <i class="fa-solid fa-file-pdf"></i> ${file.fileName}
                                        </a>
                                        <i class="fa-solid fa-xmark remove-file-icon" onclick="deleteFile(${sub.id}, ${topic.id}, ${file.id})" title="Delete File" style="cursor: pointer; color: #d9534f;"></i>
                                    </li>
                                `).join("")}
                            </ul>
                        </div>
                    `).join("")
                }
            </div>
        </div>
    `;
}

// Convert Base64 data to Blob URL so browser opens viewer tab without downloading
function viewFile(subjectId, topicId, fileId) {
    const sub = subjects.find(s => s.id === subjectId);
    if (!sub) return;
    const topic = (sub.topics || []).find(t => t.id === topicId);
    if (!topic) return;
    const file = (topic.files || []).find(f => f.id === fileId);
    if (!file || !file.fileData) return;

    try {
        const base64Parts = file.fileData.split(',');
        const mimeMatch = base64Parts[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'application/pdf';

        const byteCharacters = atob(base64Parts[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);

        const blob = new Blob([byteArray], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        
        window.open(blobUrl, '_blank');
    } catch (err) {
        console.error("Error displaying file:", err);
        alert("Failed to view file preview.");
    }
}

// Add Topic inside Subject
function addTopic(subjectId) {
    const topicInput = document.getElementById(`topic-input-${subjectId}`);
    const topicName = topicInput ? topicInput.value.trim() : "";
    if (!topicName) return alert("Please enter a topic name.");

    const subject = subjects.find(s => s.id === subjectId);
    if (subject) {
        if (!subject.topics) subject.topics = [];
        subject.topics.push({
            id: Date.now(),
            name: topicName,
            files: []
        });
        saveData();
        renderSubjectDetail();
    }
}

// Upload File Handler
function uploadFile(subjectId, topicId, event) {
    const fileInput = event.target;
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        let resultData = e.target.result;

        const subject = subjects.find(s => s.id === subjectId);
        if (subject) {
            const topic = (subject.topics || []).find(t => t.id === topicId);
            if (topic) {
                if (!topic.files) topic.files = [];
                topic.files.push({
                    id: Date.now(),
                    fileName: file.name,
                    fileData: resultData
                });
                saveData();
                renderSubjectDetail();
            }
        }
    };
    reader.readAsDataURL(file);
}

// Delete File
function deleteFile(subjectId, topicId, fileId) {
    const subject = subjects.find(s => s.id === subjectId);
    if (subject) {
        const topic = (subject.topics || []).find(t => t.id === topicId);
        if (topic) {
            topic.files = topic.files.filter(f => f.id !== fileId);
            saveData();
            renderSubjectDetail();
        }
    }
}

// Task Management
function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        saveData();
        renderTasks();
    }
}

function renderTasks() {
    const container = document.getElementById("taskList");
    if (!container) return;

    if (tasks.length === 0) {
        container.innerHTML = `<p class="empty-text"><i class="fa-solid fa-inbox"></i> No tasks found. Create one with AI Planner!</p>`;
        updateStats();
        return;
    }

    container.innerHTML = tasks.map(task => `
        <div class="task-item ${task.completed ? 'completed' : ''}">
            <input type="checkbox" id="task-${task.id}" ${task.completed ? 'checked' : ''} onchange="toggleTask(${task.id})">
            <label for="task-${task.id}" class="task-details">
                <span class="task-title">${task.name}</span>
                <span class="task-meta"><i class="fa-regular fa-clock"></i> ${task.duration} mins</span>
            </label>
        </div>
    `).join("");

    updateStats();
}

function updateStats() {
    const remaining = tasks.filter(t => !t.completed);
    const completedCount = tasks.length - remaining.length;
    
    const studyTimeElem = document.getElementById("studyTime");
    const completedStatElem = document.getElementById("completedStat");
    const completionRateElem = document.getElementById("completionRate");
    const subjectCountElem = document.getElementById("subjectCount");

    if (completedStatElem) completedStatElem.textContent = `${completedCount} / ${tasks.length}`;
    if (subjectCountElem) subjectCountElem.textContent = subjects.length;

    const totalMinutes = remaining.reduce((acc, t) => acc + (Number(t.duration) || 0), 0);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    
    if (studyTimeElem) studyTimeElem.textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;

    const rate = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
    if (completionRateElem) completionRateElem.textContent = `${rate}%`;
}

// AI Planner Logic
function generatePlan() {
    const topic = document.getElementById("studyTopic").value.trim();
    const deadline = document.getElementById("deadline").value;
    const hours = Number(document.getElementById("dailyHours").value);
    const difficulty = document.getElementById("difficulty").value;

    if (!topic || !deadline) return alert("Please fill in both topic and target deadline.");

    const days = Math.max(1, Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24)));
    const studyDays = Math.min(days, 7);

    const resultDiv = document.getElementById("generatedPlan");
    resultDiv.innerHTML = "";

    for (let i = 1; i <= studyDays; i++) {
        const dayCard = document.createElement("div");
        dayCard.className = "plan-day-card";
        
        let note = i === studyDays 
            ? `Final review & mock questions for ${topic}.`
            : `Focus study on ${topic} core concepts (Difficulty: ${difficulty}).`;

        dayCard.innerHTML = `
            <h4>Day ${i}</h4>
            <p><i class="fa-regular fa-clock"></i> ${hours} hour(s)/day</p>
            <p>${note}</p>
        `;
        resultDiv.appendChild(dayCard);
    }

    document.getElementById("planResult").classList.remove("hidden");

    tasks.push({
        id: Date.now(),
        name: `Study Focus: ${topic}`,
        duration: hours * 60,
        completed: false
    });
    saveData();
}

// Persistence & Theme Toggle
function saveData() {
    localStorage.setItem("subjects", JSON.stringify(subjects));
    localStorage.setItem("tasks", JSON.stringify(tasks));
}

function toggleTheme() {
    const body = document.body;
    const isLight = body.classList.toggle('light-mode');
    const checkbox = document.getElementById('checkbox');
    if (checkbox) checkbox.checked = isLight;
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
}

// Initial Boot
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-mode');
        const checkbox = document.getElementById('checkbox');
        if (checkbox) checkbox.checked = true;
    }
    navigateTo('home');
});