// State Management
let subjects = JSON.parse(localStorage.getItem("subjects")) || [];
let tasks = JSON.parse(localStorage.getItem("tasks")) || [];

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
        if (pageName === "subjects") renderSubjects();

        window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
        container.innerHTML = `<div class="card"><p>Error loading page view.</p></div>`;
    }
}

// Subject Management
function addSubject() {
    const nameInput = document.getElementById("subjectName");
    const diffInput = document.getElementById("subjectDifficulty");
    const name = nameInput.value.trim();

    if (!name) return alert("Please enter a subject name.");

    subjects.push({ id: Date.now(), name, difficulty: diffInput.value });
    saveData();
    nameInput.value = "";
    renderSubjects();
}

function renderSubjects() {
    const container = document.getElementById("subjectList");
    if (!container) return;

    if (subjects.length === 0) {
        container.innerHTML = `<p class="empty-text"><i class="fa-solid fa-inbox"></i> No subjects added yet.</p>`;
        return;
    }

    container.innerHTML = subjects.map(sub => `
        <div class="subject-item">
            <div>
                <strong>${sub.name}</strong>
                <span class="sub-badge">${sub.difficulty}</span>
            </div>
            <button class="delete-btn" onclick="deleteSubject(${sub.id})">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `).join("");
}

function deleteSubject(id) {
    subjects = subjects.filter(s => s.id !== id);
    saveData();
    renderSubjects();
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

    // Save as Task automatically
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
    document.getElementById('themeToggle').innerHTML = isLight 
        ? `<i class="fa-solid fa-moon"></i> Dark Mode` 
        : `<i class="fa-solid fa-sun"></i> Light Mode`;
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
}

// Initial Boot
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-mode');
        document.getElementById('themeToggle').innerHTML = `<i class="fa-solid fa-moon"></i> Dark Mode`;
    }
    navigateTo('home');
});