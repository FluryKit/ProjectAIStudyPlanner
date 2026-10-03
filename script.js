// Google Apps Script API Web App Endpoint
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyZOYGD0SNQae5PUukr_lR20e3M_PLL7GLnx27dIc8A3vesaFMa5F-qEFtv1QnefESL5A/exec";

let subjects = [];
let tasks = [];

// --- DATA FETCHING & SYNC WITH GOOGLE SHEETS ---
async function loadDataFromSheet() {
    if (!APPS_SCRIPT_URL) return;

    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getData`);
        if (!response.ok) throw new Error("Failed to fetch data from Google Sheets.");
        
        const data = await response.json();
        tasks = data.tasks || [];
        subjects = data.subjects || [];
    } catch (err) {
        console.error("Error connecting to Google Sheets Backend:", err);
    }
}

async function syncTaskToSheet(task) {
    if (!APPS_SCRIPT_URL) return;

    try {
        await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "saveTask", ...task })
        });
    } catch (err) {
        console.error("Error saving task to Google Sheets:", err);
    }
}

async function syncSubjectToSheet(subject) {
    if (!APPS_SCRIPT_URL) return;

    try {
        await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "saveSubject", ...subject })
        });
    } catch (err) {
        console.error("Error saving subject to Google Sheets:", err);
    }
}

// --- NAVIGATION & ROUTER ---

async function navigateTo(pageName) {
    const container = document.getElementById("app-container");
    
    try {
        const response = await fetch(`views/${pageName}.html`);
        if (!response.ok) throw new Error("Page not found");
        const html = await response.text();
        container.innerHTML = html;

        // Update Navigation Active State
        document.querySelectorAll(".nav-btn").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.page === pageName);
        });

        // Initialize view logic
        if (pageName === "home") checkScheduleWarnings(tasks);
        if (pageName === "priority") renderPriorityMatrix();
        if (pageName === "calendar") renderCalendarView();
        if (pageName === "progress") renderProgressDashboard();
        if (pageName === "subjects") renderSubjects();

        window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
        container.innerHTML = `<div class="card"><p>Error loading view: ${pageName}</p></div>`;
    }
}

// --- HEURISTIC ALGORITHMS ---

function daysUntil(dateStr) {
    if (!dateStr) return 99;
    const diff = new Date(dateStr) - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function calculateTaskPriority(dueDateStr, importanceLevel) {
    const daysLeft = daysUntil(dueDateStr);
    
    let urgencyScore = 0;
    if (daysLeft <= 1) urgencyScore = 50;
    else if (daysLeft <= 3) urgencyScore = 35;
    else if (daysLeft <= 7) urgencyScore = 20;
    else urgencyScore = 5;

    const importanceScore = Number(importanceLevel) * 10;
    const totalScore = urgencyScore + importanceScore;

    if (urgencyScore >= 35 && importanceScore >= 30) return { quadrant: "quad-do-first", label: "Urgent & Important", score: totalScore };
    if (urgencyScore < 35 && importanceScore >= 30) return { quadrant: "quad-schedule", label: "Important, Schedule", score: totalScore };
    if (urgencyScore >= 35 && importanceScore < 30) return { quadrant: "quad-quick", label: "Quick Finish", score: totalScore };
    return { quadrant: "quad-wait", label: "Can Wait", score: totalScore };
}

// --- PRIORITY MATRIX VIEW ---

function populateSubjectSelect() {
    const select = document.getElementById("taskSubject");
    if (!select) return;

    if (subjects.length === 0) {
        select.innerHTML = `<option value="General">General</option>`;
        return;
    }

    select.innerHTML = subjects.map(s => `<option value="${s.name}">${s.name}</option>`).join("");
}

async function addAndPrioritizeTask() {
    const title = document.getElementById("taskTitle").value.trim();
    const subject = document.getElementById("taskSubject").value;
    const dueDate = document.getElementById("taskDueDate").value;
    const importance = document.getElementById("taskImportance").value;

    if (!title || !dueDate) return alert("Please fill in task title and due date.");

    const newTask = {
        id: Date.now(),
        name: title,
        subject: subject,
        due_date: dueDate,
        importance: Number(importance),
        duration: 60,
        completed: false
    };

    tasks.push(newTask);
    await syncTaskToSheet(newTask);
    
    document.getElementById("taskTitle").value = "";
    document.getElementById("taskDueDate").value = "";
    
    renderPriorityMatrix();
}

function renderPriorityMatrix() {
    populateSubjectSelect();

    const quads = {
        "quad-do-first": document.getElementById("quad-do-first"),
        "quad-schedule": document.getElementById("quad-schedule"),
        "quad-quick": document.getElementById("quad-quick"),
        "quad-wait": document.getElementById("quad-wait")
    };

    if (!quads["quad-do-first"]) return;

    Object.values(quads).forEach(q => q.innerHTML = "");

    const activeTasks = tasks.filter(t => !t.completed);

    if (activeTasks.length === 0) {
        Object.values(quads).forEach(q => {
            q.innerHTML = `<p class="empty-text"><i class="fa-solid fa-circle-check"></i> No active tasks!</p>`;
        });
        return;
    }

    const taskCounts = { "quad-do-first": 0, "quad-schedule": 0, "quad-quick": 0, "quad-wait": 0 };

    activeTasks.forEach(task => {
        const prio = calculateTaskPriority(task.due_date, task.importance || 3);
        const container = quads[prio.quadrant];
        taskCounts[prio.quadrant]++;

        if (container) {
            const item = document.createElement("div");
            item.className = "task-item";
            item.innerHTML = `
                <input type="checkbox" id="prio-${task.id}" onchange="toggleTask(${task.id}, 'priority')">
                <label for="prio-${task.id}" class="task-details">
                    <span class="task-title">${task.name}</span>
                    <span class="task-meta"><i class="fa-regular fa-calendar"></i> ${task.due_date || 'No Date'} | ${task.subject || 'General'}</span>
                </label>
            `;
            container.appendChild(item);
        }
    });

    Object.keys(quads).forEach(key => {
        if (taskCounts[key] === 0) {
            quads[key].innerHTML = `<p class="empty-text"><i class="fa-solid fa-inbox"></i> No tasks in this quadrant.</p>`;
        }
    });
}

// --- CALENDAR VIEW ---

function renderCalendarView() {
    const list = document.getElementById("calendarList");
    const badge = document.getElementById("countdownBadge");
    if (!list) return;

    checkScheduleWarnings(tasks);

    const sorted = [...tasks].sort((a, b) => new Date(a.due_date || "2099-01-01") - new Date(b.due_date || "2099-01-01"));
    const pending = sorted.filter(t => !t.completed);

    if (pending.length > 0 && badge) {
        const closestDays = daysUntil(pending[0].due_date);
        badge.textContent = closestDays === 0 ? "Next deadline TODAY!" : `Next deadline in ${closestDays} day(s)`;
    } else if (badge) {
        badge.textContent = "All caught up!";
    }

    if (sorted.length === 0) {
        list.innerHTML = `<p class="empty-text"><i class="fa-solid fa-calendar-xmark"></i> No upcoming deadlines added.</p>`;
        return;
    }

    list.innerHTML = sorted.map(t => {
        const days = daysUntil(t.due_date);
        let dueClass = days <= 1 ? "color: #e74c3c; font-weight: bold;" : "";
        return `
            <div class="task-item ${t.completed ? 'completed' : ''}">
                <input type="checkbox" id="cal-${t.id}" ${t.completed ? 'checked' : ''} onchange="toggleTask(${t.id}, 'calendar')">
                <label for="cal-${t.id}" class="task-details" style="width: 100%;">
                    <div style="display: flex; justify-content: space-between;">
                        <span class="task-title">${t.name}</span>
                        <span class="task-meta" style="${dueClass}">${days <= 0 ? 'Due Today' : days + ' days left'}</span>
                    </div>
                    <span class="task-meta"><i class="fa-regular fa-clock"></i> ${t.due_date || 'N/A'} &bull; ${t.subject || 'General'}</span>
                </label>
            </div>
        `;
    }).join("");
}

function checkScheduleWarnings(taskList) {
    const alertBanner = document.getElementById("workloadAlert");
    if (!alertBanner) return;

    const upcoming = taskList.filter(t => !t.completed && daysUntil(t.due_date) <= 3 && daysUntil(t.due_date) >= 0);
    const totalHoursNeeded = upcoming.length * 2.5; 

    if (totalHoursNeeded > 6) {
        alertBanner.classList.remove("hidden");
        document.getElementById("alertMessage").textContent = 
            `Tight schedule! You have ${upcoming.length} upcoming deadlines requiring ~${totalHoursNeeded} hours within 3 days.`;
    } else {
        alertBanner.classList.add("hidden");
    }
}

// --- PROGRESS DASHBOARD VIEW ---

function renderProgressDashboard() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const upcoming = tasks.filter(t => !t.completed && daysUntil(t.due_date) <= 7).length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

    const completedVal = document.getElementById("completedTasksVal");
    const rateVal = document.getElementById("completionRateVal");
    const upcomingVal = document.getElementById("upcomingCountVal");

    if (completedVal) completedVal.textContent = `${completed} / ${total}`;
    if (rateVal) rateVal.textContent = `${rate}%`;
    if (upcomingVal) upcomingVal.textContent = upcoming;

    const subContainer = document.getElementById("subjectProgressContainer");
    if (!subContainer) return;

    if (subjects.length === 0) {
        subContainer.innerHTML = `<p class="empty-text">No subjects added yet.</p>`;
        return;
    }

    subContainer.innerHTML = subjects.map(s => {
        const subTasks = tasks.filter(t => t.subject === s.name);
        const subDone = subTasks.filter(t => t.completed).length;
        const subRate = subTasks.length > 0 ? Math.round((subDone / subTasks.length) * 100) : 0;

        return `
            <div>
                <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: 600; margin-bottom: 6px;">
                    <span>${s.name}</span>
                    <span>${subRate}% (${subDone}/${subTasks.length})</span>
                </div>
                <div style="background: var(--bg-subcard); height: 10px; border-radius: 6px; overflow: hidden; border: 1px solid var(--border-color);">
                    <div style="background: var(--accent-sage); width: ${subRate}%; height: 100%; transition: width 0.3s ease;"></div>
                </div>
            </div>
        `;
    }).join("");
}

// --- SUBJECT MANAGEMENT ---

async function addSubject() {
    const nameInput = document.getElementById("subjectName");
    const diffInput = document.getElementById("subjectDifficulty");
    const name = nameInput.value.trim();

    if (!name) return alert("Please enter a subject name.");

    const newSubject = { id: Date.now(), name, difficulty: diffInput.value };
    subjects.push(newSubject);
    await syncSubjectToSheet(newSubject);

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
                <span class="sub-badge" style="margin-left: 8px;">${sub.difficulty}</span>
            </div>
            <button class="delete-btn" onclick="deleteSubject(${sub.id})">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `).join("");
}

function deleteSubject(id) {
    subjects = subjects.filter(s => s.id !== id);
    renderSubjects();
}

// --- TOGGLES & THEME ---

async function toggleTask(id, currentView) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        await syncTaskToSheet(task);
        if (currentView === 'priority') renderPriorityMatrix();
        if (currentView === 'calendar') renderCalendarView();
        if (currentView === 'progress') renderProgressDashboard();
    }
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
}

// --- BOOT PROCESS ---

document.addEventListener('DOMContentLoaded', async () => {
    // Purge residual local storage data completely on boot
    try { localStorage.clear(); } catch(e) {}

    // Fetch initial live data from Google Sheet
    await loadDataFromSheet();
    navigateTo('home');
});